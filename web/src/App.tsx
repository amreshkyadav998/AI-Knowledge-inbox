import { AddContentForm } from './components/AddContentForm';
import { AskPanel } from './components/AskPanel';
import { HealthBanner } from './components/HealthBanner';
import { ItemList } from './components/ItemList';
import { LayersIcon, MoonIcon, SunIcon } from './components/icons';
import { useAsk } from './hooks/useAsk';
import { useHealth } from './hooks/useHealth';
import { useItems } from './hooks/useItems';
import { useTheme } from './hooks/useTheme';

/**
 * Layout and wiring only. Every piece of state lives in a hook that owns one
 * concern, so this file stays a map of the app rather than its implementation.
 */
export default function App() {
  const items = useItems();
  const ask = useAsk();
  const { health, isOffline } = useHealth();
  const { theme, toggle } = useTheme();

  const readyItems = items.items.filter((item) => item.status === 'ready');

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-5 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm">
            <LayersIcon className="h-4 w-4" />
          </span>

          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-fg">
              AI Knowledge Inbox
            </h1>
            <p className="hidden text-2xs leading-tight text-fg-muted sm:block">
              Answers grounded only in what you saved
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {health && !health.ai.degraded ? (
              <span
                className="tabular hidden items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs text-fg-muted md:flex"
                title={`${health.ai.chatModel} · ${health.ai.embeddingModel}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {health.index.chunks.toLocaleString()} chunks
              </span>
            ) : null}

            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="btn h-8 w-8 border border-border bg-surface text-fg-muted hover:text-fg"
            >
              {theme === 'dark' ? (
                <SunIcon className="h-4 w-4" />
              ) : (
                <MoonIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-6">
        {isOffline || health?.ai.degraded || health?.index.warning ? (
          <div className="mb-5">
            <HealthBanner health={health} isOffline={isOffline} />
          </div>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-4">
            <AddContentForm onAccepted={items.addOptimistically} />

            <div>
              <div className="mb-2.5 flex items-baseline gap-2 px-0.5">
                <h2 className="text-[13px] font-semibold text-fg">Saved</h2>
                {items.total > 0 ? (
                  <span className="tabular text-2xs text-fg-subtle">{items.total}</span>
                ) : null}
                {items.hasWorkInFlight ? (
                  <span className="ml-auto flex items-center gap-1.5 text-2xs text-fg-muted">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="dot-live absolute inset-0 rounded-full bg-info" />
                    </span>
                    Indexing
                  </span>
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

          {/* Sticky so the answer stays put while the library is scrolled. */}
          <div className="lg:sticky lg:top-[73px]">
            <AskPanel
              answer={ask.answer}
              isAsking={ask.isAsking}
              error={ask.error}
              readyItems={readyItems}
              onAsk={ask.ask}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
