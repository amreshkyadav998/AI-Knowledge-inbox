/**
 * Embedding providers are swappable behind this interface. `id` is persisted
 * with every chunk: vectors from different models are not comparable, so
 * retrieval filters on it instead of silently ranking across model families.
 */
export interface EmbeddingProvider {
  /** Stable identifier, e.g. `gemini:gemini-embedding-001@768`. */
  readonly id: string;
  readonly dimensions: number;

  /**
   * Cosine score below which a chunk is treated as irrelevant.
   *
   * This belongs to the model, not to the app. Different embedding families
   * occupy wildly different regions of the similarity range: on
   * gemini-embedding-001 a totally unrelated question still scores ~0.5, while
   * the lexical fallback scores a genuinely good match ~0.49. A single global
   * constant is therefore either a no-op filter or a filter that rejects
   * everything, depending on which provider is active.
   *
   * Treat these as starting points calibrated by hand, not as tuned values -
   * see the README for how to re-measure after changing models.
   */
  readonly suggestedMinScore: number;

  /** Embeds documents for storage. */
  embedDocuments(texts: readonly string[]): Promise<Float32Array[]>;

  /**
   * Embeds a search query. Split from `embedDocuments` because asymmetric
   * models (Gemini, and most modern retrieval models) want to know which side
   * of the comparison they are producing.
   */
  embedQuery(text: string): Promise<Float32Array>;
}
