/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the API base path. Defaults to `/api` via the dev-server proxy. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
