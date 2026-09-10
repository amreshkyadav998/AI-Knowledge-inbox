import { Fragment, type ReactNode } from 'react';

interface Props {
  text: string;
  /** Markers that correspond to a real citation; anything else stays literal. */
  validMarkers: ReadonlySet<number>;
  onRevealSource: (marker: number) => void;
}

/**
 * A deliberately tiny Markdown subset: bold, inline code, and bullet or
 * numbered lists.
 *
 * Why not a Markdown library: the input is not arbitrary Markdown, it is one
 * model's short grounded answer. The prompt asks for a short paragraph or a
 * short list, and that is what comes back. Supporting exactly that costs ~80
 * lines and no dependency, whereas `react-markdown` plus a sanitiser is ~40kB
 * to render text we already control the shape of - and every extra construct
 * it supports (raw HTML, images, links) is a rendering surface for text that
 * ultimately originated in a fetched web page.
 *
 * Everything unrecognised is rendered as plain text rather than dropped, so a
 * model that ignores the format never loses the user's content.
 */
export function AnswerText({ text, validMarkers, onRevealSource }: Props) {
  return (
    <>
      {toBlocks(text).map((block, index) =>
        block.type === 'list' ? (
          <ul key={index} className="my-2 space-y-1.5 pl-1">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                <span className="min-w-0 flex-1">
                  {renderInline(item, validMarkers, onRevealSource)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="mt-3 first:mt-0">
            {renderInline(block.text, validMarkers, onRevealSource)}
          </p>
        ),
      )}
    </>
  );
}

type Block = { type: 'paragraph'; text: string } | { type: 'list'; items: string[] };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    if (BULLET.test(line)) {
      flushParagraph();
      list.push(line.replace(BULLET, ''));
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

/** Bold, inline code and citation markers, in one pass. */
function renderInline(
  text: string,
  validMarkers: ReadonlySet<number>,
  onRevealSource: (marker: number) => void,
): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[\d+\])/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded border border-border bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em] text-fg"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const marker = /^\[(\d+)\]$/.exec(part);
    if (marker && validMarkers.has(Number(marker[1]))) {
      const value = Number(marker[1]);
      return (
        <button
          key={index}
          type="button"
          onClick={() => onRevealSource(value)}
          aria-label={`Show source ${value}`}
          title={`Show source ${value}`}
          className="mx-[1px] inline-flex h-[15px] min-w-[15px] translate-y-[-2px] items-center justify-center
                     rounded bg-accent/10 px-[3px] align-baseline font-mono text-[10px] font-semibold
                     leading-none text-accent transition hover:bg-accent hover:text-accent-fg"
        >
          {value}
        </button>
      );
    }

    // Unknown markers and ordinary prose both land here. A marker pointing at
    // nothing must stay plain text - making it look clickable would imply a
    // source that does not exist.
    return <Fragment key={index}>{part}</Fragment>;
  });
}
