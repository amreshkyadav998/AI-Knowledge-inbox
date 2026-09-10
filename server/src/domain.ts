/** Shared domain vocabulary. Kept free of Express, SQLite and provider types. */

export type SourceType = 'note' | 'url';

/**
 * Ingestion is asynchronous, so an item has a lifecycle rather than just
 * existing. The frontend renders this directly.
 *   pending    -> accepted, not yet picked up by the worker
 *   processing -> fetching / chunking / embedding
 *   ready      -> searchable
 *   failed     -> terminal; `errorMessage` explains why
 */
export type ItemStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface Item {
  id: string;
  sourceType: SourceType;
  title: string;
  url: string | null;
  status: ItemStatus;
  errorMessage: string | null;
  charCount: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

/** `Item` plus the stored text. Only returned from the single-item endpoint. */
export interface ItemWithContent extends Item {
  rawContent: string;
}

export interface Chunk {
  id: string;
  itemId: string;
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
}

/** A chunk plus its similarity score and enough parent metadata to cite it. */
export interface RetrievedChunk extends Chunk {
  score: number;
  itemTitle: string;
  itemSourceType: SourceType;
  itemUrl: string | null;
}

export interface Citation {
  /** 1-based marker matching the `[1]` style references in the answer text. */
  marker: number;
  chunkId: string;
  itemId: string;
  itemTitle: string;
  sourceType: SourceType;
  url: string | null;
  score: number;
  snippet: string;
}

export interface Answer {
  question: string;
  answer: string;
  citations: Citation[];
  /** True when retrieval found nothing above the score floor. */
  grounded: boolean;
  model: string;
  embeddingModel: string;
  timings: { retrievalMs: number; generationMs: number; totalMs: number };
}
