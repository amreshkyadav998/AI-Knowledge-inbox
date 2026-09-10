/**
 * Schema is applied as an ordered list of idempotent migrations. Small enough
 * to keep in one place, explicit enough that adding step 3 is obvious.
 */
export const MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [
  {
    name: '001_initial',
    sql: `
      CREATE TABLE IF NOT EXISTS items (
        id             TEXT PRIMARY KEY,
        source_type    TEXT NOT NULL CHECK (source_type IN ('note', 'url')),
        title          TEXT NOT NULL,
        url            TEXT,
        raw_content    TEXT NOT NULL DEFAULT '',
        status         TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
        error_message  TEXT,
        char_count     INTEGER NOT NULL DEFAULT 0,
        chunk_count    INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_items_status ON items (status);

      CREATE TABLE IF NOT EXISTS chunks (
        id               TEXT PRIMARY KEY,
        item_id          TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
        ordinal          INTEGER NOT NULL,
        content          TEXT NOT NULL,
        char_start       INTEGER NOT NULL,
        char_end         INTEGER NOT NULL,
        embedding        BLOB NOT NULL,
        embedding_dim    INTEGER NOT NULL,
        embedding_model  TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        UNIQUE (item_id, ordinal)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_item_id ON chunks (item_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_model ON chunks (embedding_model);

      CREATE TABLE IF NOT EXISTS jobs (
        id          TEXT PRIMARY KEY,
        item_id     TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
        status      TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
        attempts    INTEGER NOT NULL DEFAULT 0,
        last_error  TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
    `,
  },
];
