/**
 * Mirrors the server's response shapes. Hand-written rather than generated:
 * the API surface is four endpoints, and a codegen step would be more
 * machinery than it saves. If this grew, OpenAPI + generation would be the move.
 */

export type SourceType = 'note' | 'url';
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

export interface ItemWithContent extends Item {
  rawContent: string;
}

export interface Citation {
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
  grounded: boolean;
  model: string;
  embeddingModel: string;
  timings: { retrievalMs: number; generationMs: number; totalMs: number };
}

export interface ItemsPage {
  items: Item[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface Health {
  status: string;
  uptimeSeconds: number;
  ai: {
    configuredProvider: string;
    embeddingModel: string;
    chatModel: string;
    degraded: boolean;
    degradedReason?: string;
  };
  index: {
    items: Record<ItemStatus, number>;
    chunks: number;
    warning?: string;
    staleEmbeddingModels?: string[];
  };
  queue: { queued: number; active: number };
  retrieval: {
    topK: number;
    minScore: number;
    minScoreSource: 'config' | 'embedding-model';
    chunkTargetChars: number;
    chunkOverlapChars: number;
  };
}

export type IngestRequest =
  | { sourceType: 'note'; content: string; title?: string }
  | { sourceType: 'url'; url: string; title?: string };
