import type { EmbeddingProvider } from './provider.js';
import { postJson } from '../http-json.js';
import { normalise } from '../../vector.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Gemini caps a batch request at 100 documents. */
const MAX_BATCH = 100;

interface BatchEmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
}

interface SingleEmbedResponse {
  embedding?: { values?: number[] };
}

export interface GeminiEmbeddingOptions {
  /**
   * Matryoshka truncation length. `gemini-embedding-001` emits 3072 dimensions
   * by default; 768 keeps ~99% of retrieval quality at a quarter of the storage
   * and a quarter of the dot-product cost per chunk. Only 3072 comes back
   * pre-normalised, which is why every vector is re-normalised below.
   */
  dimensions?: number;
}

export function createGeminiEmbeddings(
  apiKey: string,
  model: string,
  options: GeminiEmbeddingOptions = {},
): EmbeddingProvider {
  // The key goes in a header, never the query string: URLs end up in proxy and
  // access logs, headers usually do not.
  const headers = { 'x-goog-api-key': apiKey };
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const dimensions = options.dimensions;
  const dimensionField = dimensions ? { outputDimensionality: dimensions } : {};

  async function embedBatch(texts: readonly string[], taskType: string): Promise<Float32Array[]> {
    const response = await postJson<BatchEmbedResponse>({
      provider: 'gemini',
      url: `${BASE_URL}/${modelPath}:batchEmbedContents`,
      headers,
      body: {
        requests: texts.map((text) => ({
          model: modelPath,
          content: { parts: [{ text }] },
          taskType,
          ...dimensionField,
        })),
      },
    });

    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(`gemini returned ${embeddings.length} embeddings for ${texts.length} inputs`);
    }
    return embeddings.map((entry, index) => {
      const values = entry.values;
      if (!values?.length) throw new Error(`gemini returned an empty embedding at index ${index}`);
      return normalise(Float32Array.from(values));
    });
  }

  return {
    // The dimension count is part of the identity: the same model at two
    // truncation lengths produces vectors that must never be ranked together.
    id: dimensions ? `gemini:${model}@${dimensions}` : `gemini:${model}`,
    dimensions: dimensions ?? 3072,
    // Measured against this key: an unrelated question scores ~0.50-0.52
    // against indexed content, a good match 0.67-0.80. 0.60 sits in the gap.
    suggestedMinScore: 0.6,

    async embedDocuments(texts) {
      const results: Float32Array[] = [];
      for (let offset = 0; offset < texts.length; offset += MAX_BATCH) {
        results.push(
          ...(await embedBatch(texts.slice(offset, offset + MAX_BATCH), 'RETRIEVAL_DOCUMENT')),
        );
      }
      return results;
    },

    async embedQuery(text) {
      // RETRIEVAL_QUERY, not RETRIEVAL_DOCUMENT: the model projects questions
      // and passages differently, and mixing the two measurably hurts recall.
      const response = await postJson<SingleEmbedResponse>({
        provider: 'gemini',
        url: `${BASE_URL}/${modelPath}:embedContent`,
        headers,
        body: {
          model: modelPath,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_QUERY',
          ...dimensionField,
        },
      });
      const values = response.embedding?.values;
      if (!values?.length) throw new Error('gemini returned an empty query embedding');
      return normalise(Float32Array.from(values));
    },
  };
}
