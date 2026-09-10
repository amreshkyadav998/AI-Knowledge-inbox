import { AppError } from '../http/errors.js';

/**
 * One place where every outbound provider call goes: timeouts, retry on
 * transient failures, and a uniform translation of upstream problems into
 * AppError. Providers stay readable and cannot each invent their own retry.
 */

export interface JsonRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  /** Provider name used in error messages, e.g. 'gemini'. */
  provider: string;
  maxAttempts?: number;
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function postJson<T>(request: JsonRequest): Promise<T> {
  const maxAttempts = request.maxAttempts ?? 3;
  const timeoutMs = request.timeoutMs ?? 30_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...request.headers },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });

      if (response.ok) return (await response.json()) as T;

      const text = await response.text().catch(() => '');
      const message = extractProviderMessage(text) ?? response.statusText;

      if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
        lastError = new Error(`${response.status} ${message}`);
        await sleep(backoffMs(attempt));
        continue;
      }

      // 401/403 is a configuration problem, not a transient upstream fault:
      // say so explicitly so the operator fixes the key instead of retrying.
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          'provider_unavailable',
          `${request.provider} rejected the API key (HTTP ${response.status}). Check the key in server/.env.`,
          { details: { provider: request.provider, upstreamMessage: message } },
        );
      }
      if (response.status === 429) {
        throw new AppError(
          'provider_unavailable',
          `${request.provider} rate limit reached. Wait a moment and retry.`,
          { details: { provider: request.provider, upstreamMessage: message } },
        );
      }
      throw new AppError('provider_error', `${request.provider} request failed: ${message}`, {
        details: { provider: request.provider, status: response.status, upstreamMessage: message },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      lastError = error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new AppError(
        'provider_unavailable',
        aborted
          ? `${request.provider} timed out after ${timeoutMs}ms`
          : `Could not reach ${request.provider}: ${(error as Error).message}`,
        { cause: error, details: { provider: request.provider } },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AppError('provider_unavailable', `${request.provider} request failed after ${maxAttempts} attempts`, {
    cause: lastError,
  });
}

function backoffMs(attempt: number): number {
  // Exponential with jitter so parallel embedding batches do not resynchronise.
  return Math.min(4000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 150);
}

/** Both Gemini and OpenAI nest the human-readable reason under `error.message`. */
function extractProviderMessage(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* fall through to the raw body */
  }
  return body.slice(0, 300);
}
