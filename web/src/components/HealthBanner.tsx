import type { ReactNode } from 'react';
import type { Health } from '../lib/types';
import { AlertIcon, OfflineIcon } from './icons';

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
      <Banner tone="danger" icon={<OfflineIcon className="h-4 w-4" />} title="Cannot reach the API">
        Start it with <Code>npm run dev</Code> in the project root, or check that port 4000 is free.
      </Banner>
    );
  }

  if (health?.ai.degraded) {
    return (
      <Banner tone="warning" icon={<AlertIcon className="h-4 w-4" />} title="Running in offline mode">
        No API key is configured, so search is lexical and answers are quoted verbatim rather than
        synthesised. Add <Code>GEMINI_API_KEY</Code> to <Code>server/.env</Code> and restart for the
        full pipeline.
      </Banner>
    );
  }

  if (health?.index.warning) {
    return (
      <Banner tone="warning" icon={<AlertIcon className="h-4 w-4" />} title={health.index.warning}>
        Re-index the affected items — Retry on a failed row, or delete and re-add — so they share the
        current embedding model.
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'danger' | 'warning';
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const styles =
    tone === 'danger'
      ? 'border-danger/30 bg-danger-subtle text-danger'
      : 'border-warning/30 bg-warning-subtle text-warning';

  return (
    <div role="status" className={`animate-rise flex gap-3 rounded-xl border px-4 py-3 ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 text-[13px] leading-relaxed">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 opacity-90">{children}</p>
      </div>
    </div>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-fg/10 px-1 py-0.5 font-mono text-[11px]">{children}</code>
);
