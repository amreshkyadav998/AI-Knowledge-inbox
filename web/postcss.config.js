import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Tailwind discovers `tailwind.config.js` by walking up from process.cwd().
// When the dev server is launched from the workspace root (`vite web`), that
// walk starts at the root and finds nothing, so Tailwind silently falls back to
// an empty config and emits preflight with zero utility classes. Passing the
// path explicitly makes the setup independent of where npm was invoked.
const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [tailwindcss({ config: path.join(here, 'tailwind.config.js') }), autoprefixer()],
};
