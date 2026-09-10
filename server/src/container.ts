import type { Config } from './config.js';
import type { Logger } from './logger.js';
import { openDatabase, type Db } from './db/index.js';
import { ItemsRepository } from './db/repositories/items.repo.js';
import { ChunksRepository } from './db/repositories/chunks.repo.js';
import { JobsRepository } from './db/repositories/jobs.repo.js';
import { UrlFetcher } from './ingestion/url-fetcher.js';
import { Indexer } from './ingestion/indexer.js';
import { IngestService } from './ingestion/ingest.service.js';
import { IngestWorker } from './jobs/ingest.worker.js';
import { createProviders, type AiProviders } from './rag/providers.js';
import { Retriever } from './rag/retriever.js';
import { AnswerService } from './rag/answer.service.js';

/**
 * Composition root. Wiring lives here and nowhere else, so every other module
 * takes its collaborators as constructor arguments and can be constructed with
 * fakes in a test. No module reaches for a global singleton.
 */
export interface Container {
  config: Config;
  logger: Logger;
  db: Db;
  items: ItemsRepository;
  chunks: ChunksRepository;
  jobs: JobsRepository;
  ai: AiProviders;
  ingest: IngestService;
  worker: IngestWorker;
  answers: AnswerService;
  close(): void;
}

export function createContainer(config: Config, logger: Logger): Container {
  const db = openDatabase(config.databasePath, logger);

  const items = new ItemsRepository(db);
  const chunks = new ChunksRepository(db);
  const jobs = new JobsRepository(db);

  const ai = createProviders(config, logger);

  const fetcher = new UrlFetcher(config, logger);
  const indexer = new Indexer(chunks, ai.embeddings, config, logger);
  const worker = new IngestWorker(items, jobs, indexer, fetcher, logger);
  const ingest = new IngestService(items, jobs, worker, logger);

  const retriever = new Retriever(chunks, ai.embeddings);
  const answers = new AnswerService(retriever, ai.completions, config, logger);

  logger.info('container ready', {
    embeddingModel: ai.embeddings.id,
    chatModel: ai.completions.id,
    degraded: ai.fellBack,
  });

  return {
    config,
    logger,
    db,
    items,
    chunks,
    jobs,
    ai,
    ingest,
    worker,
    answers,
    close: () => db.close(),
  };
}
