import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Health } from '../lib/types';

/**
 * Fetches server health once on mount. Drives the "which model am I actually
 * talking to" banner - the thing you want visible when answers look wrong.
 */
export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .health()
      .then((result) => {
        if (!cancelled) {
          setHealth(result);
          setIsOffline(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsOffline(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { health, isOffline };
}
