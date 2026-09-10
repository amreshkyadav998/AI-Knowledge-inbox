import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Logger } from '../logger.js';
import { MIGRATIONS } from './schema.js';

export type Db = Database.Database;

export function openDatabase(databasePath: string, logger: Logger): Db {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);

  // WAL keeps the ingestion worker's writes from blocking read traffic.
  if (databasePath !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  migrate(db, logger);
  logger.info('database ready', { databasePath });
  return db;
}

function migrate(db: Db, logger: Logger): void {
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map((row) => (row as { name: string }).name),
  );

  const record = db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)');
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.name, new Date().toISOString());
    })();
    logger.info('migration applied', { migration: migration.name });
  }
}
