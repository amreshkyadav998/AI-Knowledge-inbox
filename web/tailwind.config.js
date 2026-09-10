import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Content globs are resolved against process.cwd(), which is NOT this directory
// when the dev server is launched from the workspace root (`vite web`). Anchor
// them to this file instead, or Tailwind silently scans nothing and emits only
// its preflight - a blank-looking app with no error message.
const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(here, 'index.html'), path.join(here, 'src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
