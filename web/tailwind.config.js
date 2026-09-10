import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Content globs are resolved against process.cwd(), which is NOT this directory
// when the dev server is launched from the workspace root (`vite web`). Anchor
// them to this file instead, or Tailwind silently scans nothing and emits only
// its preflight - a blank-looking app with no error message.
const here = path.dirname(fileURLToPath(import.meta.url));

/** Maps a CSS custom property holding an "R G B" triplet onto a Tailwind colour. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(here, 'index.html'), path.join(here, 'src/**/*.{ts,tsx}')],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        'bg-subtle': token('bg-subtle'),
        surface: token('surface'),
        'surface-raised': token('surface-raised'),
        'surface-sunken': token('surface-sunken'),

        border: token('border'),
        'border-strong': token('border-strong'),

        fg: token('fg'),
        'fg-muted': token('fg-muted'),
        'fg-subtle': token('fg-subtle'),

        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        'accent-subtle': token('accent-subtle'),

        success: token('success'),
        'success-subtle': token('success-subtle'),
        warning: token('warning'),
        'warning-subtle': token('warning-subtle'),
        info: token('info'),
        'info-subtle': token('info-subtle'),
        danger: token('danger'),
        'danger-subtle': token('danger-subtle'),

        ring: token('ring'),
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        raised: '0 2px 4px -1px rgb(0 0 0 / 0.06), 0 8px 24px -8px rgb(0 0 0 / 0.12)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
