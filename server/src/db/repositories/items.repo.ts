import { randomUUID } from 'node:crypto';
import type { Db } from '../index.js';
import type { Item, ItemStatus, ItemWithContent, SourceType } from '../../domain.js';

interface ItemRow {
  id: string;
  source_type: SourceType;
  title: string;
  url: string | null;
  raw_content: string;
  status: ItemStatus;
  error_message: string | null;
  char_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    sourceType: row.source_type,
    title: row.title,
    url: row.url,
    status: row.status,
    errorMessage: row.error_message,
    charCount: row.char_count,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateItemInput {
  sourceType: SourceType;
  title: string;
  url: string | null;
  rawContent: string;
  status: ItemStatus;
}

export interface ListItemsOptions {
  limit: number;
  offset: number;
  status?: ItemStatus;
}

export class ItemsRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateItemInput): Item {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO items (id, source_type, title, url, raw_content, status, char_count, chunk_count, created_at, updated_at)
         VALUES (@id, @sourceType, @title, @url, @rawContent, @status, @charCount, 0, @now, @now)`,
      )
      .run({
        id,
        sourceType: input.sourceType,
        title: input.title,
        url: input.url,
        rawContent: input.rawContent,
        status: input.status,
        charCount: input.rawContent.length,
        now,
      });
    return this.getById(id)!;
  }

  getById(id: string): Item | null {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
    return row ? toItem(row) : null;
  }

  getWithContent(id: string): ItemWithContent | null {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
    return row ? { ...toItem(row), rawContent: row.raw_content } : null;
  }

  list(options: ListItemsOptions): { items: Item[]; total: number } {
    const where = options.status ? 'WHERE status = @status' : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM items ${where} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`,
      )
      .all({ limit: options.limit, offset: options.offset, status: options.status ?? null }) as ItemRow[];

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM items ${where}`)
      .get({ status: options.status ?? null }) as { count: number };

    return { items: rows.map(toItem), total: totalRow.count };
  }

  /** Used by the worker to claim work without racing a second worker. */
  markProcessing(id: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE items SET status = 'processing', updated_at = ?
         WHERE id = ? AND status IN ('pending', 'failed')`,
      )
      .run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  markReady(id: string, patch: { rawContent?: string; title?: string; chunkCount: number }): void {
    const now = new Date().toISOString();
    if (patch.rawContent !== undefined) {
      this.db
        .prepare(
          `UPDATE items
           SET status = 'ready', raw_content = @rawContent, char_count = @charCount,
               title = COALESCE(@title, title), chunk_count = @chunkCount,
               error_message = NULL, updated_at = @now
           WHERE id = @id`,
        )
        .run({
          id,
          rawContent: patch.rawContent,
          charCount: patch.rawContent.length,
          title: patch.title ?? null,
          chunkCount: patch.chunkCount,
          now,
        });
      return;
    }
    this.db
      .prepare(
        `UPDATE items SET status = 'ready', chunk_count = @chunkCount, error_message = NULL, updated_at = @now
         WHERE id = @id`,
      )
      .run({ id, chunkCount: patch.chunkCount, now });
  }

  markFailed(id: string, errorMessage: string): void {
    this.db
      .prepare(`UPDATE items SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`)
      .run(errorMessage.slice(0, 500), new Date().toISOString(), id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
  }

  countByStatus(): Record<ItemStatus, number> {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS count FROM items GROUP BY status')
      .all() as Array<{ status: ItemStatus; count: number }>;
    const counts: Record<ItemStatus, number> = { pending: 0, processing: 0, ready: 0, failed: 0 };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  }
}
