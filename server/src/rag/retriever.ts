import type { ChunksRepository } from '../db/repositories/chunks.repo.js';
import type { RetrievedChunk } from '../domain.js';
import type { EmbeddingProvider } from './embeddings/provider.js';
import { dot } from '../vector.js';

export interface RetrieveOptions {
  topK: number;
  minScore: number;
  /** At most this many chunks from any single item, so one long note cannot
   *  crowd out every other source. */
  maxPerItem?: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  /** How many candidate chunks were compared. Useful in logs and on /health. */
  candidatesScanned: number;
}

/**
 * Brute-force cosine over every chunk embedded with the active model.
 *
 * Why brute force: for a single-user inbox the corpus is thousands of chunks,
 * where an exhaustive scan is sub-millisecond and *exact*. An ANN index (HNSW,
 * pgvector, Qdrant) adds a build step, a tuning surface and approximate recall
 * to solve a problem this scale does not have. See the README for the point at
 * which that trade flips.
 */
export class Retriever {
  constructor(
    private readonly chunks: ChunksRepository,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  /** Identifier of the model whose vector space this retriever searches. */
  get embeddingModelId(): string {
    return this.embeddings.id;
  }

  /** The active model's own relevance floor, used when config sets no override. */
  get defaultMinScore(): number {
    return this.embeddings.suggestedMinScore;
  }

  async retrieve(question: string, options: RetrieveOptions): Promise<RetrievalResult> {
    const queryVector = await this.embeddings.embedQuery(question);
    const candidates = this.chunks.scanByModel(this.embeddings.id);

    const scored: RetrievedChunk[] = [];
    for (const candidate of candidates) {
      if (candidate.embedding.length !== queryVector.length) continue; // stale dimensions
      const { embedding, ...rest } = candidate;
      // Vectors are L2-normalised on write, so the dot product is the cosine.
      scored.push({ ...rest, score: dot(queryVector, embedding) });
    }

    scored.sort((a, b) => b.score - a.score);

    const maxPerItem = options.maxPerItem ?? Math.max(2, Math.ceil(options.topK / 2));
    const perItem = new Map<string, number>();
    const selected: RetrievedChunk[] = [];

    for (const chunk of scored) {
      if (chunk.score < options.minScore) break; // sorted, so nothing below can qualify
      const used = perItem.get(chunk.itemId) ?? 0;
      if (used >= maxPerItem) continue;
      perItem.set(chunk.itemId, used + 1);
      selected.push(chunk);
      if (selected.length >= options.topK) break;
    }

    return { chunks: selected, candidatesScanned: candidates.length };
  }
}
