import type { EmbeddingProvider } from './provider.js';
import { postJson } from '../http-json.js';
import { normalise } from '../../vector.js';

const URL = 'https://api.openai.com/v1/embeddings';
const MAX_BATCH = 128;

interface EmbeddingsResponse {
  data?: Array<{ index: number; embedding: number[] }>;
}

const DIMENSIONS_BY_MODEL: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export function createOpenAiEmbeddings(apiKey: string, model: string): EmbeddingProvider {
  const headers = { authorization: `Bearer ${apiKey}` };

  async function embed(texts: readonly string[]): Promise<Float32Array[]> {
    const response = await postJson<EmbeddingsResponse>({
      provider: 'openai',
      url: URL,
      headers,
      body: { model, input: texts },
    });
    const data = response.data ?? [];
    if (data.length !== texts.length) {
      throw new Error(`openai returned ${data.length} embeddings for ${texts.length} inputs`);
    }
    // The API documents index ordering but does not guarantee array order.
    return [...data]
      .sort((a, b) => a.index - b.index)
      .map((entry) => normalise(Float32Array.from(entry.embedding)));
  }

  return {
    id: `openai:${model}`,
    dimensions: DIMENSIONS_BY_MODEL[model] ?? 1536,
    // text-embedding-3-* sit lower in the range than Gemini's; unrelated pairs
    // land near 0.1-0.2 and relevant ones above 0.35.
    suggestedMinScore: 0.35,

    async embedDocuments(texts) {
      const results: Float32Array[] = [];
      for (let offset = 0; offset < texts.length; offset += MAX_BATCH) {
        results.push(...(await embed(texts.slice(offset, offset + MAX_BATCH))));
      }
      return results;
    },

    async embedQuery(text) {
      const [vector] = await embed([text]);
      if (!vector) throw new Error('openai returned no query embedding');
      return vector;
    },
  };
}
