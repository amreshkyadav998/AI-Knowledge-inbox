import { useState, type FormEvent } from 'react';
import type { ApiError } from '../lib/api';
import type { Answer } from '../lib/types';
import { AnswerView } from './AnswerView';

interface Props {
  answer: Answer | null;
  isAsking: boolean;
  error: ApiError | null;
  readyItemCount: number;
  onAsk: (question: string) => void;
}

export function AskPanel({ answer, isAsking, error, readyItemCount, onAsk }: Props) {
  const [question, setQuestion] = useState('');
  const canAsk = question.trim().length >= 3 && !isAsking;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canAsk) onAsk(question.trim());
  }

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="question" className="block text-sm font-medium text-slate-900">
          Ask your inbox
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="question"
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What did I save about..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
          <button
            type="submit"
            disabled={!canAsk}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isAsking ? 'Thinking...' : 'Ask'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {readyItemCount === 0
            ? 'Nothing is indexed yet - save a note or URL first.'
            : `Searching ${readyItemCount} indexed source${readyItemCount === 1 ? '' : 's'}. Answers cite what they used.`}
        </p>
      </form>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error.message}</p>
          <p className="mt-1 font-mono text-xs text-red-600">
            {error.code}
            {error.requestId ? ` - request ${error.requestId}` : ''}
          </p>
        </div>
      ) : null}

      {isAsking ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-200" />
        </div>
      ) : null}

      {answer && !isAsking ? <AnswerView answer={answer} /> : null}
    </section>
  );
}
