import { Fragment, useState } from 'react';
import type { Answer, Citation } from '../lib/types';

interface Props {
  answer: Answer;
}

/**
 * Renders the answer with its citation markers turned into controls, then the
 * source snippets underneath. Clicking `[2]` highlights source 2 - being able
 * to check a claim against the exact retrieved text is the whole point of
 * citing, so it should take one click, not a scroll and a search.
 */
export function AnswerView({ answer }: Props) {
  const [highlighted, setHighlighted] = useState<number | null>(null);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {renderWithMarkers(answer.answer, answer.citations, setHighlighted)}
      </div>

      {!answer.grounded ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No saved content cleared the relevance threshold, so this answer is not grounded in your
          inbox. Nothing was invented to fill the gap.
        </p>
      ) : null}

      {answer.citations.length > 0 ? (
        <section className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sources</h3>
          <ul className="mt-2 space-y-2">
            {answer.citations.map((citation) => (
              <SourceCard
                key={citation.chunkId}
                citation={citation}
                isHighlighted={highlighted === citation.marker}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2 font-mono text-[10px] text-slate-400">
        <span>{answer.model}</span>
        <span>{answer.embeddingModel}</span>
        <span>retrieval {answer.timings.retrievalMs}ms</span>
        <span>generation {answer.timings.generationMs}ms</span>
        <span>total {answer.timings.totalMs}ms</span>
      </footer>
    </article>
  );
}

/** Splits on `[n]` and turns each valid marker into a highlight control. */
function renderWithMarkers(
  text: string,
  citations: Citation[],
  onHighlight: (marker: number | null) => void,
) {
  const validMarkers = new Set(citations.map((citation) => citation.marker));
  const parts = text.split(/(\[\d+\])/g);

  return parts.map((part, index) => {
    const match = /^\[(\d+)\]$/.exec(part);
    const marker = match ? Number(match[1]) : null;

    // An unknown marker is left as plain text: it points at nothing, and
    // dressing it up as a link would imply a source that does not exist.
    if (marker === null || !validMarkers.has(marker)) {
      return <Fragment key={index}>{part}</Fragment>;
    }

    return (
      <button
        key={index}
        type="button"
        onClick={() => onHighlight(marker)}
        onMouseEnter={() => onHighlight(marker)}
        onMouseLeave={() => onHighlight(null)}
        className="mx-0.5 rounded bg-slate-900 px-1 align-super text-[10px] font-semibold text-white hover:bg-blue-600"
        aria-label={`Show source ${marker}`}
      >
        {marker}
      </button>
    );
  });
}

function SourceCard({ citation, isHighlighted }: { citation: Citation; isHighlighted: boolean }) {
  return (
    <li
      className={`rounded-md border p-2.5 transition ${
        isHighlighted ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 rounded bg-slate-900 px-1.5 text-[10px] font-semibold text-white">
          {citation.marker}
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900" title={citation.itemTitle}>
          {citation.itemTitle}
        </p>
        <span className="shrink-0 font-mono text-[10px] text-slate-400" title="Cosine similarity">
          {citation.score.toFixed(3)}
        </span>
      </div>

      {citation.url ? (
        <a
          href={citation.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 block truncate text-[11px] text-blue-600 hover:underline"
        >
          {citation.url}
        </a>
      ) : null}

      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{citation.snippet}</p>
    </li>
  );
}
