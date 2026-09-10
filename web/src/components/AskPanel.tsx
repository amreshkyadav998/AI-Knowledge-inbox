import { useState, type FormEvent } from 'react';
import type { ApiError } from '../lib/api';
import type { Answer, Item } from '../lib/types';
import { AnswerView } from './AnswerView';
import { AlertIcon, SendIcon, SparkIcon } from './icons';

interface Props {
  answer: Answer | null;
  isAsking: boolean;
  error: ApiError | null;
  readyItems: Item[];
  onAsk: (question: string) => void;
}

export function AskPanel({ answer, isAsking, error, readyItems, onAsk }: Props) {
  const [question, setQuestion] = useState('');
  const canAsk = question.trim().length >= 3 && !isAsking;
  const hasSources = readyItems.length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canAsk) onAsk(question.trim());
  }

  function askSuggestion(text: string) {
    setQuestion(text);
    onAsk(text);
  }

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="card overflow-hidden shadow-subtle">
        <div className="flex items-center gap-2 border-b border-border bg-surface-sunken px-4 py-2.5">
          <SparkIcon className="h-3.5 w-3.5 text-accent" />
          <h2 className="text-[13px] font-semibold text-fg">Ask your inbox</h2>
          <span className="tabular ml-auto text-2xs text-fg-subtle">
            {hasSources
              ? `${readyItems.length} source${readyItems.length === 1 ? '' : 's'} indexed`
              : 'no sources yet'}
          </span>
        </div>

        <div className="p-4">
          <div className="relative">
            <input
              id="question"
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={!hasSources}
              placeholder={
                hasSources ? 'What did I save about…?' : 'Save a note or link to get started'
              }
              className="input-base py-3 pr-12 text-[15px]"
              aria-label="Your question"
            />
            <button
              type="submit"
              disabled={!canAsk}
              aria-label="Ask"
              className="btn absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 bg-accent text-accent-fg
                         shadow-sm hover:bg-accent/90 disabled:bg-border disabled:text-fg-subtle disabled:opacity-100"
            >
              {isAsking ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
            </button>
          </div>

          {hasSources && !answer && !isAsking ? (
            <Suggestions items={readyItems} onPick={askSuggestion} />
          ) : (
            <p className="mt-2.5 text-2xs leading-relaxed text-fg-muted">
              Answers are grounded in your saved content and cite the passages they used.
            </p>
          )}
        </div>
      </form>

      {error ? (
        <div
          role="alert"
          className="card animate-rise border-danger/30 bg-danger-subtle p-4"
        >
          <div className="flex gap-2.5">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-danger">{error.message}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-danger/70">
                {error.code}
                {error.requestId ? ` · request ${error.requestId}` : ''}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isAsking ? <AnswerSkeleton /> : null}
      {answer && !isAsking ? <AnswerView answer={answer} /> : null}
      {!answer && !isAsking && !error && hasSources ? <IdleHint /> : null}
    </section>
  );
}

/**
 * Seeded from the titles of what is actually indexed, so the suggestions are
 * always answerable. A generic list of example questions would mostly produce
 * "not found", which teaches the user the wrong thing about the product.
 */
function Suggestions({ items, onPick }: { items: Item[]; onPick: (text: string) => void }) {
  const suggestions = items.slice(0, 3).map((item) => `What does "${truncate(item.title)}" say?`);
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-2xs font-medium text-fg-subtle">Try</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="btn max-w-full truncate border border-border bg-surface-sunken px-2.5 py-1
                       text-2xs font-normal text-fg-muted hover:border-accent hover:text-accent"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function IdleHint() {
  return (
    <div className="card flex flex-col items-center border-dashed px-6 py-10 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-subtle text-accent">
        <SparkIcon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-fg">Ask a question</p>
      <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-fg-muted">
        Every answer is built only from your saved content, with a citation on each claim.
      </p>
    </div>
  );
}

function AnswerSkeleton() {
  return (
    <div className="card animate-rise overflow-hidden" aria-hidden="true">
      <div className="border-b border-border bg-surface-sunken px-4 py-2.5">
        <div className="shimmer h-2.5 w-44" />
      </div>
      <div className="space-y-2.5 px-4 py-4">
        <div className="shimmer h-3 w-full" />
        <div className="shimmer h-3 w-[92%]" />
        <div className="shimmer h-3 w-3/4" />
      </div>
      <div className="space-y-2 border-t border-border bg-surface-sunken px-4 py-3.5">
        <div className="shimmer h-14 w-full rounded-lg" />
        <div className="shimmer h-14 w-full rounded-lg" />
      </div>
    </div>
  );
}

function truncate(text: string, max = 34): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}
