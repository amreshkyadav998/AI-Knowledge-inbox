import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type { Item } from '../lib/types';

interface Props {
  onAccepted: (item: Item) => void;
}

type Tab = 'note' | 'url';

/**
 * Two input modes behind one submit path. Client-side checks are for
 * responsiveness only - the server validates independently and its field errors
 * are surfaced here when they disagree.
 */
export function AddContentForm({ onAccepted }: Props) {
  const [tab, setTab] = useState<Tab>('note');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = tab === 'note' ? note : url;
  const canSubmit = value.trim().length > 0 && !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedTitle = title.trim();
      const { item } = await api.ingest(
        tab === 'note'
          ? { sourceType: 'note', content: note.trim(), ...(trimmedTitle ? { title: trimmedTitle } : {}) }
          : { sourceType: 'url', url: url.trim(), ...(trimmedTitle ? { title: trimmedTitle } : {}) },
      );

      onAccepted(item);
      setNote('');
      setUrl('');
      setTitle('');
    } catch (caught) {
      const fieldMessage =
        caught instanceof ApiError
          ? Object.values(caught.fieldErrors ?? {})[0]?.[0]
          : undefined;
      setError(fieldMessage ?? (caught instanceof ApiError ? caught.message : 'Could not save that.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-1 rounded-md bg-slate-100 p-1" role="tablist">
        {(['note', 'url'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={tab === candidate}
            onClick={() => {
              setTab(candidate);
              setError(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
              tab === candidate
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {candidate === 'note' ? 'Note' : 'URL'}
          </button>
        ))}
      </div>

      {tab === 'note' ? (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={5}
          placeholder="Paste or type anything you want to remember..."
          className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          aria-label="Note content"
        />
      ) : (
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/article"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          aria-label="URL to fetch"
        />
      )}

      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title (optional)"
        maxLength={200}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        aria-label="Optional title"
      />

      {error ? (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {tab === 'note'
            ? 'Indexed in the background - it appears in the list right away.'
            : 'The page is fetched server-side, then indexed.'}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
