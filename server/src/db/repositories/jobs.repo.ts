import { randomUUID } from 'node:crypto';
import type { Db } from '../index.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  itemId: string;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
}

interface JobRow {
  id: string;
  item_id: string;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
}

/**
 * Jobs live in SQLite rather than only in memory so that a crash mid-ingest
 * leaves a recoverable record: on boot the worker re-queues anything that was
 * left `queued` or `running`.
 */
export class JobsRepository {
  constructor(private readonly db: Db) {}

  enqueue(itemId: string): Job {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO jobs (id, item_id, status, attempts, created_at, updated_at)
         VALUES (?, ?, 'queued', 0, ?, ?)`,
      )
      .run(id, itemId, now, now);
    return { id, itemId, status: 'queued', attempts: 0, lastError: null };
  }

  markRunning(id: string): void {
    this.db
      .prepare(`UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  }

  markDone(id: string): void {
    this.db
      .prepare(`UPDATE jobs SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  }

  markFailed(id: string, error: string): void {
    this.db
      .prepare(`UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`)
      .run(error.slice(0, 500), new Date().toISOString(), id);
  }

  /** Unfinished work from a previous process lifetime. */
  findInterrupted(): Job[] {
    const rows = this.db
      .prepare(`SELECT * FROM jobs WHERE status IN ('queued', 'running') ORDER BY created_at ASC`)
      .all() as JobRow[];
    return rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
    }));
  }
}
