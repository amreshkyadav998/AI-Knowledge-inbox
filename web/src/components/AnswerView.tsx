import { useCallback, useMemo, useState } from 'react';
import type { Answer, Citation } from '../lib/types';
import { AnswerText } from './AnswerText';
import { AlertIcon, CheckIcon, ExternalIcon, LinkIcon, NoteIcon } from './icons';

interface Props {
  answer: Answer;
}

const sourceDomId = (marker: number) => `source-${marker}`;

/**
 * Renders the answer with its citation markers turned into controls, then the
 * source snippets underneath. Clicking [2] scrolls source 2 into view and
 * highlights it - being able to check a claim against the exact retrieved text
 * is the entire point of citing, so it should cost one click, not a scroll and
 * a search.
 */
export function AnswerView({ answer }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const validMarkers = useMemo(
    () => new Set(answer.citations.map((citation) => citation.marker)),
    [answer.citations],
  );

  const reveal = useCallback((marker: number) => {
    setActive(marker);
    document.getElementById(sourceDomId(marker))?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, []);

  return (
    <article className="card animate-rise overflow-hidden shadow-subtle">
      <header className="flex items-center gap-2 border-b border-border bg-surface-sunken px-4 py-2.5">
        {answer.grounded ? (
          <>
            <CheckIcon className="h-3.5 w-3.5 text-success" />
            <span className="text-2xs font-medium text-fg-muted">
              Answered from {answer.citations.length} passage
              {answer.citations.length === 1 ? '' : 's'} in your inbox
            </span>
          </>
        ) : (
          <>
            <AlertIcon className="h-3.5 w-3.5 text-warning" />
            <span className="text-2xs font-medium text-fg-muted">Not found in your inbox</span>
          </>
        )}
      </header>

      <div className="px-4 py-4">
        <div className="text-[15px] leading-[1.7] text-fg">
          <AnswerText text={answer.answer} validMarkers={validMarkers} onRevealSource={reveal} />
        </div>

        {!answer.grounded ? (
          <p className="mt-3 rounded-lg border border-warning/25 bg-warning-subtle px-3 py-2.5 text-xs leading-relaxed text-warning">
            Nothing saved cleared the relevance threshold, so this answer is not grounded in your
            content. Nothing was invented to fill the gap.
          </p>
        ) : null}
      </div>

      {answer.citations.length > 0 ? (
        <section className="border-t border-border bg-surface-sunken px-4 py-3.5">
          <h3 className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
            Sources
          </h3>
          <ul className="space-y-2">
            {answer.citations.map((citation) => (
              <SourceCard
                key={citation.chunkId}
                citation={citation}
                isActive={active === citation.marker}
                onFocusChange={setActive}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 font-mono text-[10px] text-fg-subtle">
        <span title="Chat model">{answer.model}</span>
        <span className="text-border-strong">|</span>
        <span title="Embedding model">{answer.embeddingModel}</span>
        <span className="ml-auto" title="Vector search">
          retrieval {answer.timings.retrievalMs}ms
        </span>
        <span title="Model generation">generation {answer.timings.generationMs}ms</span>
      </footer>
    </article>
  );
}

function SourceCard({
  citation,
  isActive,
  onFocusChange,
}: {
  citation: Citation;
  isActive: boolean;
  onFocusChange: (marker: number | null) => void;
}) {
  const SourceIcon = citation.sourceType === 'url' ? LinkIcon : NoteIcon;

  return (
    <li
      id={sourceDomId(citation.marker)}
      onMouseEnter={() => onFocusChange(citation.marker)}
      onMouseLeave={() => onFocusChange(null)}
      className={`rounded-lg border bg-surface p-3 transition ${
        isActive ? 'border-accent ring-4 ring-accent/10' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-1 font-mono text-[10px] font-semibold transition ${
            isActive ? 'bg-accent text-accent-fg' : 'bg-fg/10 text-fg-muted'
          }`}
        >
          {citation.marker}
        </span>
        <SourceIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-fg" title={citation.itemTitle}>
          {citation.itemTitle}
        </p>
        <ScoreBadge score={citation.score} />
      </div>

      {citation.url ? (
        <a
          href={citation.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-fg-muted transition hover:text-accent"
        >
          <span className="truncate">{citation.url.replace(/^https?:\/\//, '')}</span>
          <ExternalIcon className="h-2.5 w-2.5 shrink-0" />
        </a>
      ) : null}

      <p className="mt-2 border-l-2 border-border pl-2.5 text-xs leading-relaxed text-fg-muted">
        {citation.snippet}
      </p>
    </li>
  );
}

/** Similarity as a number plus a bar, so relative strength reads at a glance. */
function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      title={`Cosine similarity ${score.toFixed(4)}`}
    >
      <span className="h-1 w-8 overflow-hidden rounded-full bg-border">
        <span
          className="block h-full rounded-full bg-accent/70"
          style={{ width: `${Math.min(100, Math.max(0, score * 100))}%` }}
        />
      </span>
      <span className="tabular font-mono text-[10px] text-fg-subtle">{score.toFixed(2)}</span>
    </span>
  );
}
