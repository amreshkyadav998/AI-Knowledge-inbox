import { randomUUID } from 'node:crypto';
import type { Db } from '../index.js';
import type { RetrievedChunk, SourceType } from '../../domain.js';
import { decodeVector, encodeVector } from '../../vector.js';

export interface ChunkToStore {
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
  embedding: Float32Array;
}

/** Row shape used by the brute-force scan; keep it narrow, it is read hot. */
interface ScanRow {
  id: string;
  item_id: string;
  ordinal: number;
  content: string;
  char_start: number;
  char_end: number;
  embedding: Buffer;
  item_title: string;
  item_source_type: SourceType;
  item_url: string | null;
}

export class ChunksRepository {
  constructor(private readonly db: Db) {}

  /**
   * Replacing rather than appending makes re-ingestion idempotent: a retried
   * item cannot end up indexed twice.
   */
  replaceForItem(itemId: string, chunks: readonly ChunkToStore[], embeddingModel: string): void {
    const now = new Date().toISOString();
    const remove = this.db.prepare('DELETE FROM chunks WHERE item_id = ?');
    const insert = this.db.prepare(
      `INSERT INTO chunks (id, item_id, ordinal, content, char_start, char_end, embedding, embedding_dim, embedding_model, created_at)
       VALUES (@id, @itemId, @ordinal, @content, @charStart, @charEnd, @embedding, @dim, @model, @now)`,
    );

    this.db.transaction(() => {
      remove.run(itemId);
      for (const chunk of chunks) {
        insert.run({
          id: randomUUID(),
          itemId,
          ordinal: chunk.ordinal,
          content: chunk.content,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          embedding: encodeVector(chunk.embedding),
          dim: chunk.embedding.length,
          model: embeddingModel,
          now,
        });
      }
    })();
  }

  /**
   * Streams every chunk that shares the query's embedding model. Mixing models
   * in one similarity ranking is meaningless, so they are filtered out here
   * rather than silently producing junk scores.
   */
  scanByModel(embeddingModel: string): Array<Omit<RetrievedChunk, 'score'> & { embedding: Float32Array }> {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.item_id, c.ordinal, c.content, c.char_start, c.char_end, c.embedding,
                i.title AS item_title, i.source_type AS item_source_type, i.url AS item_url
         FROM chunks c
         JOIN items i ON i.id = c.item_id
         WHERE c.embedding_model = ? AND i.status = 'ready'`,
      )
      .all(embeddingModel) as ScanRow[];

    return rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      ordinal: row.ordinal,
      content: row.content,
      charStart: row.char_start,
      charEnd: row.char_end,
      itemTitle: row.item_title,
      itemSourceType: row.item_source_type,
      itemUrl: row.item_url,
      embedding: decodeVector(row.embedding),
    }));
  }

  countForItem(itemId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM chunks WHERE item_id = ?')
      .get(itemId) as { count: number };
    return row.count;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM chunks').get() as { count: number }).count;
  }

  /** Which embedding models currently have data. Surfaced on /health. */
  distinctModels(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT embedding_model AS model FROM chunks')
      .all() as Array<{ model: string }>;
    return rows.map((row) => row.model);
  }
}
