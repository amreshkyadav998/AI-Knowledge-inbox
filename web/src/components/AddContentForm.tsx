import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type { Item } from '../lib/types';
import { LinkIcon, NoteIcon, SendIcon } from './icons';

interface Props {
  onAccepted: (item: Item) => void;
}

type Tab = 'note' | 'url';

const MAX_NOTE_CHARS = 100_000;

const TABS: ReadonlyArray<{ id: Tab; label: string; Icon: typeof NoteIcon }> = [
  { id: 'note', label: 'Note', Icon: NoteIcon },
  { id: 'url', label: 'Link', Icon: LinkIcon },
];

/**
 * Two input modes behind one submit path. Client-side checks exist for
 * responsiveness only - the server validates independently, and its field
 * errors are surfaced here when the two disagree.
 */
export function AddContentForm({ onAccepted }: Props) {
  const [tab, setTab] = useState<Tab>('note');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const value = tab === 'note' ? note : url;
  const canSubmit = value.trim().length > 0 && !isSubmitting;

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedTitle = title.trim();
      const { item } = await api.ingest(
        tab === 'note'
          ? {
              sourceType: 'note',
              content: note.trim(),
              ...(trimmedTitle ? { title: trimmedTitle } : {}),
            }
          : {
              sourceType: 'url',
              url: url.trim(),
              ...(trimmedTitle ? { title: trimmedTitle } : {}),
            },
      );

      onAccepted(item);
      setNote('');
      setUrl('');
      setTitle('');
      noteRef.current?.focus();
    } catch (caught) {
      const fieldMessage =
        caught instanceof ApiError ? Object.values(caught.fieldErrors ?? {})[0]?.[0] : undefined;
      setError(
        fieldMessage ?? (caught instanceof ApiError ? caught.message : 'Could not save that.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cmd/Ctrl+Enter submits from inside the textarea, where Enter means newline.
  function handleKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card overflow-hidden shadow-subtle">
      <div className="flex items-center gap-1 border-b border-border bg-surface-sunken px-2 py-2">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              aria-pressed={isActive}
              className={`btn gap-1.5 px-3 py-1.5 text-[13px] ${
                isActive
                  ? 'bg-surface text-fg shadow-subtle ring-1 ring-border'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 p-4">
        {tab === 'note' ? (
          <div className="relative">
            <textarea
              ref={noteRef}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={5}
              maxLength={MAX_NOTE_CHARS}
              placeholder="Paste anything worth remembering — meeting notes, a decision, a snippet of docs…"
              className="input-base resize-y leading-relaxed"
              aria-label="Note content"
            />
            {note.length > 0 ? (
              <span className="tabular pointer-events-none absolute bottom-2.5 right-3 text-2xs text-fg-subtle">
                {note.length.toLocaleString()}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="relative">
            <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/article"
              className="input-base pl-10"
              aria-label="URL to fetch"
            />
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title (optional)"
          maxLength={200}
          className="input-base"
          aria-label="Optional title"
        />

        {error ? (
          <p
            role="alert"
            className="animate-rise rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-sunken px-4 py-3">
        <p className="text-2xs leading-snug text-fg-muted">
          {tab === 'note' ? (
            <>
              Indexed in the background.{' '}
              <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[10px] text-fg-muted">
                ⌘↵
              </kbd>{' '}
              to save
            </>
          ) : (
            'The page is fetched server-side, then indexed.'
          )}
        </p>
        <button type="submit" disabled={!canSubmit} className="btn-primary shrink-0 py-2 text-[13px]">
          {isSubmitting ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving
            </>
          ) : (
            <>
              <SendIcon className="h-3.5 w-3.5" />
              Save
            </>
          )}
        </button>
      </div>
    </form>
  );
}
