import type { Item, ItemStatus } from '../lib/types';
import { ExternalIcon, InboxIcon, LinkIcon, NoteIcon, RetryIcon, TrashIcon } from './icons';

interface Props {
  items: Item[];
  isLoading: boolean;
  error: string | null;
  onDelete: (id: string) => void;
  onReindex: (id: string) => void;
}

interface StatusStyle {
  label: string;
  text: string;
  dot: string;
  /** Whether the dot should pulse: true only while work is genuinely running. */
  live: boolean;
}

const STATUS: Record<ItemStatus, StatusStyle> = {
  pending: { label: 'Queued', text: 'text-warning', dot: 'bg-warning', live: false },
  processing: { label: 'Indexing', text: 'text-info', dot: 'bg-info', live: true },
  ready: { label: 'Ready', text: 'text-success', dot: 'bg-success', live: false },
  failed: { label: 'Failed', text: 'text-danger', dot: 'bg-danger', live: false },
};

export function ItemList({ items, isLoading, error, onDelete, onReindex }: Props) {
  if (isLoading) return <SkeletonList />;

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle">
          <InboxIcon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-fg">Your inbox is empty</p>
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-fg-muted">
          Save a note or a link above. Once it is indexed you can ask questions about it.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} onDelete={onDelete} onReindex={onReindex} />
      ))}
    </ul>
  );
}

function ItemRow({
  item,
  onDelete,
  onReindex,
}: {
  item: Item;
  onDelete: (id: string) => void;
  onReindex: (id: string) => void;
}) {
  const status = STATUS[item.status];
  const SourceIcon = item.sourceType === 'url' ? LinkIcon : NoteIcon;

  return (
    <li className="group card relative animate-rise p-3.5 transition hover:border-border-strong hover:shadow-subtle">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-fg-muted ring-1 ring-border">
          <SourceIcon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={item.title}>
              {item.title}
            </p>

            {/* Actions replace the status pill on hover, so the row stays calm
                at rest without hiding the controls behind a menu. */}
            <div className="flex shrink-0 items-center gap-1">
              <span
                className={`flex items-center gap-1.5 text-2xs font-medium ${status.text} transition group-hover:opacity-0`}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className={`absolute inset-0 rounded-full ${status.dot} ${status.live ? 'dot-live' : ''}`}
                  />
                </span>
                {status.label}
              </span>

              <div className="absolute right-3 top-3 flex items-center gap-0.5 rounded-lg bg-surface pl-2 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                {item.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={() => onReindex(item.id)}
                    aria-label={`Retry ${item.title}`}
                    title="Retry"
                    className="btn-ghost p-1.5"
                  >
                    <RetryIcon className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Delete ${item.title}`}
                  title="Delete"
                  className="btn-ghost p-1.5 hover:bg-danger-subtle hover:text-danger"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-fg-muted transition hover:text-accent"
            >
              <span className="truncate">{item.url.replace(/^https?:\/\//, '')}</span>
              <ExternalIcon className="h-3 w-3 shrink-0" />
            </a>
          ) : null}

          <p className="tabular mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-fg-subtle">
            {item.status === 'ready' ? (
              <>
                <span>
                  {item.chunkCount} chunk{item.chunkCount === 1 ? '' : 's'}
                </span>
                <Separator />
                <span>{item.charCount.toLocaleString()} chars</span>
                <Separator />
              </>
            ) : null}
            <span>{formatRelative(item.createdAt)}</span>
          </p>

          {item.status === 'failed' && item.errorMessage ? (
            <p className="mt-2 rounded-md bg-danger-subtle px-2.5 py-1.5 text-xs leading-relaxed text-danger">
              {item.errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

const Separator = () => <span className="text-border-strong">·</span>;

function SkeletonList() {
  return (
    <ul className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <li key={key} className="card p-3.5">
          <div className="flex gap-3">
            <div className="shimmer h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-2 py-0.5">
              <div className="shimmer h-3 w-2/5" />
              <div className="shimmer h-2.5 w-1/4" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
