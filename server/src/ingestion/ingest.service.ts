import type { ItemsRepository } from '../db/repositories/items.repo.js';
import type { JobsRepository } from '../db/repositories/jobs.repo.js';
import type { IngestWorker } from '../jobs/ingest.worker.js';
import type { Item } from '../domain.js';
import type { Logger } from '../logger.js';
import { AppError } from '../http/errors.js';

export type IngestRequest =
  | { sourceType: 'note'; content: string; title?: string }
  | { sourceType: 'url'; url: string; title?: string };

const MAX_TITLE_CHARS = 200;

/**
 * Accepts content and hands the slow half to the worker.
 *
 * Both notes and URLs go through the queue, even though a note has nothing to
 * fetch. Embedding is a network call either way, so making notes synchronous
 * would only buy an inconsistent API and a request that sometimes takes two
 * seconds. One lifecycle, one code path.
 */
export class IngestService {
  constructor(
    private readonly items: ItemsRepository,
    private readonly jobs: JobsRepository,
    private readonly worker: IngestWorker,
    private readonly logger: Logger,
  ) {}

  accept(request: IngestRequest): Item {
    const item =
      request.sourceType === 'note'
        ? this.items.create({
            sourceType: 'note',
            title: normaliseTitle(request.title) ?? deriveNoteTitle(request.content),
            url: null,
            rawContent: request.content,
            status: 'pending',
          })
        : this.items.create({
            sourceType: 'url',
            // Placeholder until the fetch reveals the real page title.
            title: normaliseTitle(request.title) ?? request.url,
            url: request.url,
            rawContent: '',
            status: 'pending',
          });

    const job = this.jobs.enqueue(item.id);
    this.worker.submit({ jobId: job.id, itemId: item.id });

    this.logger.info('item accepted', {
      event: 'ingest.accepted',
      itemId: item.id,
      jobId: job.id,
      sourceType: item.sourceType,
      chars: item.charCount,
    });

    return item;
  }

  /** Re-runs ingestion for an existing item, e.g. after a transient failure. */
  reindex(itemId: string): Item {
    const item = this.items.getById(itemId);
    if (!item) throw AppError.notFound(`No item with id "${itemId}".`);
    if (item.status === 'processing') {
      throw new AppError('validation_error', 'That item is already being processed.');
    }

    const job = this.jobs.enqueue(item.id);
    this.worker.submit({ jobId: job.id, itemId: item.id });
    this.logger.info('item re-queued', { event: 'ingest.requeued', itemId, jobId: job.id });

    return { ...item, status: 'pending', errorMessage: null };
  }
}

function normaliseTitle(title: string | undefined): string | null {
  const trimmed = title?.trim();
  return trimmed ? trimmed.slice(0, MAX_TITLE_CHARS) : null;
}

/** First non-empty line, trimmed to something that fits a list row. */
function deriveNoteTitle(content: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return 'Untitled note';
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77).trimEnd()}...`;
}
