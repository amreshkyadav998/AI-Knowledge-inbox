import type { ChunksRepository, ChunkToStore } from '../db/repositories/chunks.repo.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { EmbeddingProvider } from '../rag/embeddings/provider.js';
import { chunkText, normaliseText } from '../rag/chunker.js';

export interface IndexResult {
  normalisedText: string;
  chunkCount: number;
  embeddingModel: string;
}

/**
 * Turns raw text into searchable chunks: normalise -> chunk -> embed -> store.
 *
 * Kept separate from the worker so it can be unit-tested and reused (a future
 * "re-index everything after switching embedding model" command is this call in
 * a loop).
 */
export class Indexer {
  constructor(
    private readonly chunks: ChunksRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  async index(itemId: string, rawText: string): Promise<IndexResult> {
    const normalisedText = normaliseText(rawText);

    const pieces = chunkText(normalisedText, {
      targetChars: this.config.rag.chunkTargetChars,
      overlapChars: this.config.rag.chunkOverlapChars,
    });

    if (pieces.length === 0) {
      this.chunks.replaceForItem(itemId, [], this.embeddings.id);
      return { normalisedText, chunkCount: 0, embeddingModel: this.embeddings.id };
    }

    const startedAt = Date.now();
    const vectors = await this.embeddings.embedDocuments(pieces.map((piece) => piece.content));
    const embedMs = Date.now() - startedAt;

    if (vectors.length !== pieces.length) {
      throw new Error(`embedding provider returned ${vectors.length} vectors for ${pieces.length} chunks`);
    }

    const toStore: ChunkToStore[] = pieces.map((piece, index) => ({
      ordinal: piece.ordinal,
      content: piece.content,
      charStart: piece.charStart,
      charEnd: piece.charEnd,
      embedding: vectors[index]!,
    }));

    this.chunks.replaceForItem(itemId, toStore, this.embeddings.id);

    this.logger.info('item indexed', {
      event: 'ingest.index',
      itemId,
      chunks: pieces.length,
      chars: normalisedText.length,
      embeddingModel: this.embeddings.id,
      embedMs,
    });

    return { normalisedText, chunkCount: pieces.length, embeddingModel: this.embeddings.id };
  }
}
