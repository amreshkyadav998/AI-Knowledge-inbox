/**
 * Minimal HTML -> text extraction, dependency-free.
 *
 * Tradeoff: a real reader (Mozilla Readability on jsdom, or trafilatura) does a
 * far better job of isolating article body from page chrome, at the cost of a
 * heavy DOM dependency. For notes and ordinary article pages this heuristic -
 * drop non-content elements, keep block structure - is enough, and it keeps
 * ingest fast and the dependency surface small. Swap it out if you start
 * ingesting app-shell pages that render their content client-side.
 */

/** Elements whose *contents* are never article text. */
const DROPPED_ELEMENTS = [
  'script', 'style', 'noscript', 'template', 'svg', 'iframe',
  'nav', 'header', 'footer', 'aside', 'form',
] as const;

/** Elements that imply a line break once the markup is flattened. */
const BLOCK_ELEMENTS = [
  'p', 'div', 'section', 'article', 'br', 'li', 'tr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre',
] as const;

const alternation = (tags: readonly string[]): string => tags.join('|');

// Built once at module load. The `\1` backreference matches the opening tag's
// own name, so a <nav> is never closed by a stray </header>.
const DROPPED_PAIR_RE = new RegExp(
  String.raw`<(${alternation(DROPPED_ELEMENTS)})\b[^>]*>[\s\S]*?<\/\1\s*>`,
  'gi',
);
const DROPPED_TAG_RE = new RegExp(
  String.raw`<\/?(?:${alternation(DROPPED_ELEMENTS)})\b[^>]*\/?>`,
  'gi',
);
const BLOCK_TAG_RE = new RegExp(
  String.raw`<\/?(?:${alternation(BLOCK_ELEMENTS)})\b[^>]*\/?>`,
  'gi',
);
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const ANY_TAG_RE = /<[^>]*>/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', hellip: '...', middot: '.', bull: '*',
};

export interface ExtractedPage {
  title: string | null;
  text: string;
}

export function extractFromHtml(html: string): ExtractedPage {
  return { title: extractTitle(html), text: htmlToText(html) };
}

function extractTitle(html: string): string | null {
  const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (ogTitle?.[1]) return collapse(decodeEntities(ogTitle[1])) || null;

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleTag?.[1]) return collapse(decodeEntities(stripTags(titleTag[1]))) || null;

  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1?.[1]) return collapse(decodeEntities(stripTags(h1[1]))) || null;

  return null;
}

export function htmlToText(html: string): string {
  const withoutChrome = html
    .replace(COMMENT_RE, ' ')
    .replace(DROPPED_PAIR_RE, ' ')
    // Unclosed or self-closing chrome tags the paired pass could not match.
    .replace(DROPPED_TAG_RE, ' ');

  // Preserve paragraph structure before flattening the remaining markup.
  const withBreaks = withoutChrome.replace(BLOCK_TAG_RE, '\n');

  const text = decodeEntities(stripTags(withBreaks));

  return text
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    // Collapse runs of blank lines to at most one.
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1]!.length > 0))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(input: string): string {
  return input.replace(ANY_TAG_RE, ' ');
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function collapse(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}
