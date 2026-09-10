import type { CompletionProvider } from './provider.js';

/**
 * Keyless fallback: extractive, not generative. It selects the sentences from
 * the retrieved passages that overlap most with the question and returns them
 * verbatim with citation markers.
 *
 * It cannot synthesise, compare or reason across sources - it only quotes. The
 * upside is that it is incapable of hallucinating, costs nothing, and keeps the
 * end-to-end pipeline exercisable offline.
 */
export function createLocalCompletions(): CompletionProvider {
  return {
    id: 'local:extractive-v1',
    async complete(request) {
      const grounding = request.grounding;
      if (!grounding || grounding.passages.length === 0) {
        return 'No indexed content matched this question.';
      }

      const questionTerms = termsOf(grounding.question);
      const scored: Array<{ sentence: string; marker: number; score: number }> = [];

      for (const passage of grounding.passages) {
        for (const sentence of splitSentences(passage.text)) {
          const score = overlapScore(questionTerms, termsOf(sentence));
          if (score > 0) scored.push({ sentence, marker: passage.marker, score });
        }
      }

      if (scored.length === 0) {
        const first = grounding.passages[0]!;
        return [
          'No sentence in the saved content directly matches the question. The closest passage says:',
          '',
          `${truncate(first.text, 400)} [${first.marker}]`,
          '',
          '(Offline extractive mode - configure AI_PROVIDER=gemini for a synthesised answer.)',
        ].join('\n');
      }

      const top = scored.sort((a, b) => b.score - a.score).slice(0, 4);
      const body = top.map((entry) => `- ${entry.sentence.trim()} [${entry.marker}]`).join('\n');

      return [
        'Based on the saved content:',
        '',
        body,
        '',
        '(Offline extractive mode - sentences are quoted verbatim, not synthesised.)',
      ].join('\n');
    },
  };
}

function termsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

/** Jaccard-ish overlap, normalised by question length so long sentences do not win by default. */
function overlapScore(question: Set<string>, sentence: Set<string>): number {
  if (question.size === 0) return 0;
  let shared = 0;
  for (const term of question) if (sentence.has(term)) shared += 1;
  return shared / question.size;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}...`;
}
