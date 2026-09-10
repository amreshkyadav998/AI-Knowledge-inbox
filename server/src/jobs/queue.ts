import type { Logger } from '../logger.js';

export type JobHandler<T> = (payload: T) => Promise<void>;

export interface QueueOptions {
  concurrency: number;
  name: string;
}

/**
 * An in-process FIFO queue with bounded concurrency.
 *
 * This is the smallest thing that gives the property we actually need: the HTTP
 * request returns immediately (202) and the slow work - network fetch plus
 * embedding calls - happens off the request path, without unbounded parallel
 * requests to the embedding API.
 *
 * What it is NOT: durable across a crash by itself (the `jobs` table covers
 * that - see JobsRepository.findInterrupted), distributed across processes, or
 * capable of scheduled retries. Swapping in BullMQ/Redis or SQS is the
 * production move; the call sites here would not change.
 */
export class JobQueue<T> {
  private readonly pending: T[] = [];
  private active = 0;
  private draining: Array<() => void> = [];

  constructor(
    private readonly handler: JobHandler<T>,
    private readonly options: QueueOptions,
    private readonly logger: Logger,
  ) {}

  push(payload: T): void {
    this.pending.push(payload);
    queueMicrotask(() => this.pump());
  }

  get size(): { queued: number; active: number } {
    return { queued: this.pending.length, active: this.active };
  }

  /** Resolves when the queue has no queued and no in-flight work. */
  async drain(): Promise<void> {
    if (this.pending.length === 0 && this.active === 0) return;
    await new Promise<void>((resolve) => this.draining.push(resolve));
  }

  private pump(): void {
    while (this.active < this.options.concurrency && this.pending.length > 0) {
      const payload = this.pending.shift()!;
      this.active += 1;

      void this.handler(payload)
        .catch((error: unknown) => {
          // The handler owns its own error reporting; this is the last-resort
          // net so one bad job cannot take the process down.
          this.logger.error('unhandled job failure', { queue: this.options.name, error });
        })
        .finally(() => {
          this.active -= 1;
          if (this.pending.length > 0) {
            this.pump();
            return;
          }
          if (this.active === 0) {
            const waiters = this.draining;
            this.draining = [];
            for (const resolve of waiters) resolve();
          }
        });
    }
  }
}
