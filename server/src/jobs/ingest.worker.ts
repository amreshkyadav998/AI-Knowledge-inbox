import type { ItemsRepository } from '../db/repositories/items.repo.js';
import type { JobsRepository } from '../db/repositories/jobs.repo.js';
import type { Indexer } from '../ingestion/indexer.js';
import type { UrlFetcher } from '../ingestion/url-fetcher.js';
import type { Logger } from '../logger.js';
import { isAppError } from '../http/errors.js';
import { JobQueue } from './queue.js';
import { runWithLogContext } from '../logger.js';

export interface IngestJob {
  jobId: string;
  itemId: string;
}

/**
 * Consumes ingest jobs: fetch (URLs only) -> index -> flip the item to `ready`.
 * Every terminal outcome is written back to the item, so the UI never has to
 * guess why something stalled.
 */
export class IngestWorker {
  private readonly queue: JobQueue<IngestJob>;

  constructor(
    private readonly items: ItemsRepository,
    private readonly jobs: JobsRepository,
    private readonly indexer: Indexer,
    private readonly fetcher: UrlFetcher,
    private readonly logger: Logger,
    concurrency = 2,
  ) {
    this.queue = new JobQueue<IngestJob>(
      (job) => this.process(job),
      { concurrency, name: 'ingest' },
      logger,
    );
  }

  submit(job: IngestJob): void {
    this.queue.push(job);
  }

  get depth(): { queued: number; active: number } {
    return this.queue.size;
  }

  /** Awaits an empty queue. Used by tests and by graceful shutdown. */
  async drain(): Promise<void> {
    await this.queue.drain();
  }

  /**
   * Re-queues work that a previous process lifetime left unfinished. Called
   * once at boot, before the HTTP server starts accepting traffic.
   */
  recoverInterrupted(): number {
    const interrupted = this.jobs.findInterrupted();
    for (const job of interrupted) {
      this.logger.warn('recovering interrupted ingest job', {
        event: 'ingest.recover',
        jobId: job.id,
        itemId: job.itemId,
        attempts: job.attempts,
      });
      this.queue.push({ jobId: job.id, itemId: job.itemId });
    }
    return interrupted.length;
  }

  private async process(job: IngestJob): Promise<void> {
    await runWithLogContext({ jobId: job.jobId, itemId: job.itemId }, async () => {
      const startedAt = Date.now();
      const item = this.items.getById(job.itemId);

      if (!item) {
        this.jobs.markFailed(job.jobId, 'item no longer exists');
        this.logger.warn('ingest job skipped: item deleted', { event: 'ingest.skip' });
        return;
      }

      // A second worker (or a duplicate recovery push) may have claimed it.
      if (!this.items.markProcessing(item.id)) {
        this.logger.debug('ingest job skipped: item not claimable', {
          event: 'ingest.skip',
          status: item.status,
        });
        this.jobs.markDone(job.jobId);
        return;
      }

      this.jobs.markRunning(job.jobId);
      this.logger.info('ingest started', { event: 'ingest.start', sourceType: item.sourceType });

      try {
        let text = this.items.getWithContent(item.id)?.rawContent ?? '';
        let title: string | undefined;

        if (item.sourceType === 'url') {
          const document = await this.fetcher.fetchDocument(item.url!);
          text = document.text;
          // Only adopt the page title if the user did not supply one.
          if (document.title && item.title === item.url) title = document.title;
        }

        const result = await this.indexer.index(item.id, text);

        this.items.markReady(item.id, {
          rawContent: result.normalisedText,
          ...(title ? { title } : {}),
          chunkCount: result.chunkCount,
        });
        this.jobs.markDone(job.jobId);

        this.logger.info('ingest finished', {
          event: 'ingest.done',
          chunks: result.chunkCount,
          chars: result.normalisedText.length,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const message = toUserMessage(error);
        this.items.markFailed(item.id, message);
        this.jobs.markFailed(job.jobId, message);
        this.logger.error('ingest failed', {
          event: 'ingest.failed',
          durationMs: Date.now() - startedAt,
          reason: message,
          error,
        });
      }
    });
  }
}

/**
 * AppError messages are written for humans and are safe to surface. Anything
 * else could carry internals, so it is replaced with a generic line - the real
 * error is still in the logs.
 */
function toUserMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error && error.message.includes('dimension mismatch')) {
    return 'Embedding dimensions changed. Re-index this item after switching models.';
  }
  return 'Indexing failed unexpectedly. Check the server logs for details.';
}
