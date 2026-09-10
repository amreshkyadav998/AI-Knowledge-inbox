import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function currentTheme(): Theme {
  const attribute = document.documentElement.getAttribute('data-theme');
  return attribute === 'dark' ? 'dark' : 'light';
}

/**
 * Reads the theme the inline script in index.html already applied, rather than
 * computing it again. That script runs before first paint, so React must not
 * be the source of truth here - it would flash the wrong theme on load.
 *
 * An explicit choice is persisted; until one is made, the OS preference wins
 * and keeps winning if it changes.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      // Only follow the OS while the user has expressed no preference.
      if (localStorage.getItem(STORAGE_KEY)) return;
      setTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing can refuse writes; the toggle still works for this
        // session, it just will not be remembered.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
