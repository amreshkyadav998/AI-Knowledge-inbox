/**
 * Chunking strategy: structure-aware greedy packing with character overlap.
 *
 * Why this and not fixed-size windows:
 *   - Paragraph boundaries are the cheapest real signal about topic
 *     boundaries. Packing whole paragraphs up to a target size keeps related
 *     sentences together, which is what makes a retrieved chunk answerable on
 *     its own.
 *   - Fixed-size windows routinely cut mid-sentence, so the retrieved text
 *     starts halfway through a clause and the LLM has to guess the referent.
 *   - Token-exact chunking would need a tokeniser per model. Characters are a
 *     stable proxy (~4 chars/token for English) and cost nothing.
 *
 * Overlap exists because a fact that straddles a boundary would otherwise be
 * unretrievable from either side. The cost is duplicated text (more storage,
 * more embedding calls) and near-duplicate hits, which the retriever
 * de-duplicates per item.
 *
 * Every chunk carries its [charStart, charEnd) offsets into the normalised
 * source text, so a citation can be traced back to the exact span.
 */

export interface TextChunk {
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
}

export interface ChunkOptions {
  targetChars: number;
  overlapChars: number;
  /** Chunks shorter than this are folded into the previous one. */
  minChars?: number;
}

/**
 * Whitespace is normalised before offsets are computed, so callers must store
 * the *normalised* text for offsets to mean anything.
 */
export function normaliseText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

interface Segment {
  start: number;
  end: number;
}

/** Paragraph spans, then sentence spans for paragraphs that are too big. */
function segmentText(text: string, targetChars: number): Segment[] {
  const segments: Segment[] = [];
  const paragraphPattern = /\n{2,}/g;

  let cursor = 0;
  let match: RegExpExecArray | null;
  const paragraphs: Segment[] = [];
  while ((match = paragraphPattern.exec(text)) !== null) {
    paragraphs.push({ start: cursor, end: match.index });
    cursor = match.index + match[0].length;
  }
  paragraphs.push({ start: cursor, end: text.length });

  for (const paragraph of paragraphs) {
    if (paragraph.end <= paragraph.start) continue;
    if (paragraph.end - paragraph.start <= targetChars) {
      segments.push(paragraph);
      continue;
    }
    segments.push(...splitIntoSentences(text, paragraph, targetChars));
  }

  return segments;
}

/** Sentence-ish split. Good enough for prose; never produces empty spans. */
function splitIntoSentences(text: string, span: Segment, targetChars: number): Segment[] {
  const slice = text.slice(span.start, span.end);
  const boundary = /(?<=[.!?])\s+(?=[A-Z0-9"'(\[])|\n/g;

  const sentences: Segment[] = [];
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(slice)) !== null) {
    const end = match.index + match[0].length;
    if (end > start) sentences.push({ start: span.start + start, end: span.start + match.index });
    start = end;
  }
  if (start < slice.length) sentences.push({ start: span.start + start, end: span.end });

  // A single sentence longer than the target (minified text, no punctuation)
  // still has to be broken, so fall back to hard character cuts.
  const result: Segment[] = [];
  for (const sentence of sentences) {
    if (sentence.end - sentence.start <= targetChars) {
      if (sentence.end > sentence.start) result.push(sentence);
      continue;
    }
    for (let at = sentence.start; at < sentence.end; at += targetChars) {
      result.push({ start: at, end: Math.min(at + targetChars, sentence.end) });
    }
  }
  return result;
}

/** Nudge an overlap start to the nearest preceding whitespace to avoid cutting a word. */
function snapToWordBoundary(text: string, index: number, limit: number): number {
  for (let at = index; at > limit; at -= 1) {
    if (/\s/.test(text[at - 1]!)) return at;
  }
  return index;
}

export function chunkText(text: string, options: ChunkOptions): TextChunk[] {
  const targetChars = Math.max(200, options.targetChars);
  const overlapChars = Math.max(0, Math.min(options.overlapChars, Math.floor(targetChars / 2)));
  const minChars = options.minChars ?? Math.min(120, Math.floor(targetChars / 4));

  if (text.trim().length === 0) return [];

  const segments = segmentText(text, targetChars);
  if (segments.length === 0) return [];

  // Pack segments greedily into windows of at most `targetChars`.
  const windows: Segment[] = [];
  let current: Segment | null = null;
  for (const segment of segments) {
    if (current === null) {
      current = { ...segment };
      continue;
    }
    if (segment.end - current.start <= targetChars) {
      current.end = segment.end;
      continue;
    }
    windows.push(current);
    current = { ...segment };
  }
  if (current !== null) windows.push(current);

  // Fold a trailing runt into its predecessor rather than embedding a fragment.
  if (windows.length > 1) {
    const last = windows[windows.length - 1]!;
    if (last.end - last.start < minChars) {
      windows[windows.length - 2]!.end = last.end;
      windows.pop();
    }
  }

  return windows.map((window, index) => {
    const rawStart = index === 0 ? window.start : Math.max(0, window.start - overlapChars);
    const start = index === 0 ? rawStart : snapToWordBoundary(text, rawStart, Math.max(0, rawStart - 40));
    const content = text.slice(start, window.end).trim();
    return {
      ordinal: index,
      content,
      charStart: start,
      charEnd: window.end,
    };
  }).filter((chunk) => chunk.content.length > 0);
}

/** Rough token estimate for budgeting prompt context. ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
