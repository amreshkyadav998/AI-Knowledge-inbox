import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Environment is parsed once, at boot, and fails loudly. A half-configured
 * process that only explodes on the first request is much harder to debug than
 * one that refuses to start.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const booleanish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no']))
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_PATH: z.string().default('./data/inbox.sqlite'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  AI_PROVIDER: z.enum(['gemini', 'openai', 'local']).default('local'),

  GEMINI_API_KEY: z.string().default(''),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(128).max(3072).default(768),
  GEMINI_CHAT_MODEL: z.string().default('gemini-3.6-flash'),

  OPENAI_API_KEY: z.string().default(''),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),

  CHUNK_TARGET_CHARS: z.coerce.number().int().min(200).max(4000).default(900),
  CHUNK_OVERLAP_CHARS: z.coerce.number().int().min(0).max(1000).default(150),
  RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  RETRIEVAL_MIN_SCORE: z.coerce.number().min(0).max(1).optional(),

  FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  FETCH_MAX_BYTES: z.coerce.number().int().min(1024).default(2_000_000),
  ALLOW_PRIVATE_URL_FETCH: booleanish.default('false'),
});

export type Config = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  corsOrigin: string;
  databasePath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  ai: {
    provider: 'gemini' | 'openai' | 'local';
    gemini: {
      apiKey: string;
      embeddingModel: string;
      embeddingDimensions: number;
      chatModel: string;
    };
    openai: { apiKey: string; embeddingModel: string; chatModel: string };
  };
  rag: {
    chunkTargetChars: number;
    chunkOverlapChars: number;
    topK: number;
    /** Explicit override. When null, the embedding model's own floor is used. */
    minScore: number | null;
  };
  fetch: { timeoutMs: number; maxBytes: number; allowPrivate: boolean };
}>;

function resolveDatabasePath(raw: string): string {
  if (raw === ':memory:') return raw;
  return path.isAbsolute(raw) ? raw : path.resolve(packageRoot, raw);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const e = parsed.data;

  // Overlap must leave forward progress, otherwise chunking never terminates.
  const overlap = Math.min(e.CHUNK_OVERLAP_CHARS, Math.floor(e.CHUNK_TARGET_CHARS / 2));

  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    corsOrigin: e.CORS_ORIGIN,
    databasePath: resolveDatabasePath(e.DATABASE_PATH),
    logLevel: e.LOG_LEVEL,
    ai: {
      provider: e.AI_PROVIDER,
      gemini: {
        apiKey: e.GEMINI_API_KEY.trim(),
        embeddingModel: e.GEMINI_EMBEDDING_MODEL,
        embeddingDimensions: e.GEMINI_EMBEDDING_DIMENSIONS,
        chatModel: e.GEMINI_CHAT_MODEL,
      },
      openai: {
        apiKey: e.OPENAI_API_KEY.trim(),
        embeddingModel: e.OPENAI_EMBEDDING_MODEL,
        chatModel: e.OPENAI_CHAT_MODEL,
      },
    },
    rag: {
      chunkTargetChars: e.CHUNK_TARGET_CHARS,
      chunkOverlapChars: overlap,
      topK: e.RETRIEVAL_TOP_K,
      minScore: e.RETRIEVAL_MIN_SCORE ?? null,
    },
    fetch: {
      timeoutMs: e.FETCH_TIMEOUT_MS,
      maxBytes: e.FETCH_MAX_BYTES,
      allowPrivate: e.ALLOW_PRIVATE_URL_FETCH,
    },
  });
}
