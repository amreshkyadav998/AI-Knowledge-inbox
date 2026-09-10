import { AddContentForm } from './components/AddContentForm';
import { AskPanel } from './components/AskPanel';
import { HealthBanner } from './components/HealthBanner';
import { ItemList } from './components/ItemList';
import { useAsk } from './hooks/useAsk';
import { useHealth } from './hooks/useHealth';
import { useItems } from './hooks/useItems';

/**
 * Layout and wiring only. Every piece of state lives in a hook that owns one
 * concern, so this file stays a map of the app rather than its implementation.
 */
export default function App() {
  const items = useItems();
  const ask = useAsk();
  const { health, isOffline } = useHealth();

  const readyCount = items.items.filter((item) => item.status === 'ready').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">AI Knowledge Inbox</h1>
            <p className="text-sm text-slate-500">
              Save notes and links, then ask questions answered only from what you saved.
            </p>
          </div>
          {health ? (
            <p className="hidden font-mono text-[11px] text-slate-400 sm:block">
              {health.index.chunks} chunks indexed
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4">
          <HealthBanner health={health} isOffline={isOffline} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-4">
            <AddContentForm onAccepted={items.addOptimistically} />

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Saved items{items.total > 0 ? ` (${items.total})` : ''}
                </h2>
                {items.hasWorkInFlight ? (
                  <span className="text-xs text-slate-500">Indexing in background...</span>
                ) : null}
              </div>

              <ItemList
                items={items.items}
                isLoading={items.isLoading}
                error={items.error}
                onDelete={items.remove}
                onReindex={items.reindex}
              />
            </div>
          </section>

          <AskPanel
            answer={ask.answer}
            isAsking={ask.isAsking}
            error={ask.error}
            readyItemCount={readyCount}
            onAsk={ask.ask}
          />
        </div>
      </main>
    </div>
  );
}
