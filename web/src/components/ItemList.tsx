import type { Item, ItemStatus } from '../lib/types';

interface Props {
  items: Item[];
  isLoading: boolean;
  error: string | null;
  onDelete: (id: string) => void;
  onReindex: (id: string) => void;
}

const STATUS_STYLES: Record<ItemStatus, { label: string; className: string }> = {
  pending: { label: 'Queued', className: 'bg-amber-100 text-amber-800' },
  processing: { label: 'Indexing', className: 'bg-blue-100 text-blue-800' },
  ready: { label: 'Ready', className: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
};

export function ItemList({ items, isLoading, error, onDelete, onReindex }: Props) {
  if (isLoading) {
    return <p className="px-1 py-6 text-sm text-slate-500">Loading your inbox...</p>;
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">Nothing saved yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Add a note or a URL above, then ask a question about it.
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
  const status = STATUS_STYLES[item.status];

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {item.sourceType}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${status.className}`}>
              {status.label}
            </span>
          </div>

          <p className="mt-1.5 truncate text-sm font-medium text-slate-900" title={item.title}>
            {item.title}
          </p>

          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-0.5 block truncate text-xs text-blue-600 hover:underline"
            >
              {item.url}
            </a>
          ) : null}

          <p className="mt-1 text-xs text-slate-500">
            {item.status === 'ready'
              ? `${item.chunkCount} chunk${item.chunkCount === 1 ? '' : 's'} - ${item.charCount.toLocaleString()} chars`
              : formatRelative(item.createdAt)}
          </p>

          {item.status === 'failed' && item.errorMessage ? (
            <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
              {item.errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-1">
          {item.status === 'failed' ? (
            <button
              type="button"
              onClick={() => onReindex(item.id)}
              className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            aria-label={`Delete ${item.title}`}
            className="rounded px-2 py-1 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function formatRelative(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
