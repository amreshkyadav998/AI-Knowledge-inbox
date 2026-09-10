import type { Health } from '../lib/types';

interface Props {
  health: Health | null;
  isOffline: boolean;
}

/**
 * Surfaces the two states that otherwise produce confusing behaviour with no
 * visible cause: the server being unreachable, and the server silently running
 * on the keyless offline provider.
 */
export function HealthBanner({ health, isOffline }: Props) {
  if (isOffline) {
    return (
      <Banner tone="red">
        <strong>Cannot reach the API.</strong> Start it with <code className="font-mono">npm run dev</code>{' '}
        in the project root, or check that port 4000 is free.
      </Banner>
    );
  }

  if (health?.ai.degraded) {
    return (
      <Banner tone="amber">
        <strong>Running in offline mode.</strong> No API key is configured, so search is lexical and
        answers are quoted verbatim rather than synthesised. Add{' '}
        <code className="font-mono">GEMINI_API_KEY</code> to <code className="font-mono">server/.env</code>{' '}
        and restart for the full pipeline.
      </Banner>
    );
  }

  if (health?.index.warning) {
    return (
      <Banner tone="amber">
        <strong>{health.index.warning}</strong> Re-index the affected items (Retry on a failed row, or
        delete and re-add) so they share the current embedding model.
      </Banner>
    );
  }

  return null;
}

function Banner({ tone, children }: { tone: 'red' | 'amber'; children: React.ReactNode }) {
  const styles =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div role="status" className={`rounded-lg border px-4 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  );
}
