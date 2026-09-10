import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from './provider.js';
import { normalise } from '../../vector.js';

const DIMENSIONS = 512;

/**
 * Keyless fallback: the hashing trick over word unigrams and bigrams with
 * sublinear term frequency, L2-normalised. Cosine over these vectors is
 * effectively lexical overlap.
 *
 * This is NOT semantic search - it cannot match "how do I cancel" to
 * "termination procedure". At 512 buckets, unrelated terms also collide often
 * enough to give an irrelevant question a non-zero score, so the retrieval
 * floor does real work here. It exists so the app boots, the test suite runs
 * and the UI is demoable with no API key and no network. Configure a real
 * provider for anything you would judge retrieval quality on.
 */
export function createLocalEmbeddings(): EmbeddingProvider {
  return {
    id: 'local:hashed-bow-v1',
    dimensions: DIMENSIONS,
    // Lexical overlap: exact-term matches score high, but hash collisions give
    // unrelated text up to ~0.17, so the floor sits just above that.
    suggestedMinScore: 0.2,
    async embedDocuments(texts) {
      return texts.map(embedOne);
    },
    async embedQuery(text) {
      return embedOne(text);
    },
  };
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was', 'were',
  'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'as', 'at', 'by', 'from', 'with',
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Stable across processes, unlike a JS string hash seeded per run. */
function bucketOf(term: string): number {
  const digest = createHash('sha1').update(term).digest();
  return digest.readUInt32BE(0) % DIMENSIONS;
}

function embedOne(text: string): Float32Array {
  const tokens = tokenise(text);
  const counts = new Map<string, number>();

  for (let i = 0; i < tokens.length; i += 1) {
    const unigram = tokens[i]!;
    counts.set(unigram, (counts.get(unigram) ?? 0) + 1);
    if (i + 1 < tokens.length) {
      const bigram = `${unigram}_${tokens[i + 1]!}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
    }
  }

  const vector = new Float32Array(DIMENSIONS);
  for (const [term, count] of counts) {
    const bucket = bucketOf(term);
    // Sublinear TF: a word repeated 20 times should not dominate the vector.
    vector[bucket] = (vector[bucket] ?? 0) + 1 + Math.log(count);
  }
  return normalise(vector);
}
