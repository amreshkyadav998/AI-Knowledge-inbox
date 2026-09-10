import type { RetrievedChunk } from '../domain.js';

/**
 * Prompt construction lives on its own so it can be read, reviewed and diffed
 * without wading through orchestration code. Prompts are product surface: they
 * change often and they change behaviour.
 */

export const SYSTEM_PROMPT = [
  'You are the assistant for a personal knowledge inbox.',
  'Answer ONLY from the numbered context passages supplied by the user.',
  '',
  'Rules:',
  '1. Every factual sentence must end with a citation marker like [1] or [2][3].',
  '2. Use only the markers that appear in the context. Never invent a marker.',
  '3. If the context does not contain the answer, say exactly what is missing.',
  '   Do not fall back on general knowledge, and do not guess.',
  '4. If passages disagree, say so and cite both.',
  '5. Be concise: a short paragraph, or a short list when the question asks for',
  '   several things. No preamble such as "Based on the context provided".',
].join('\n');

/** Keeps the prompt inside a predictable budget regardless of chunk sizes. */
const MAX_CONTEXT_CHARS = 12_000;

export interface BuiltPrompt {
  userPrompt: string;
  /** The passages that actually fitted in the budget, in prompt order. */
  included: RetrievedChunk[];
}

export function buildUserPrompt(question: string, chunks: readonly RetrievedChunk[]): BuiltPrompt {
  const included: RetrievedChunk[] = [];
  const blocks: string[] = [];
  let budget = MAX_CONTEXT_CHARS;

  for (const chunk of chunks) {
    const header = describeSource(chunk);
    const block = `[${included.length + 1}] ${header}\n${chunk.content}`;
    if (block.length > budget && included.length > 0) break;
    budget -= block.length;
    included.push(chunk);
    blocks.push(block);
  }

  const userPrompt = [
    'CONTEXT',
    '=======',
    blocks.join('\n\n'),
    '',
    'QUESTION',
    '========',
    question,
    '',
    'Answer using only the context above, with citation markers.',
  ].join('\n');

  return { userPrompt, included };
}

function describeSource(chunk: RetrievedChunk): string {
  const origin = chunk.itemSourceType === 'url' && chunk.itemUrl ? chunk.itemUrl : 'saved note';
  return `Source: ${chunk.itemTitle} (${origin})`;
}
