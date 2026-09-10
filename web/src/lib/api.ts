import type { Answer, Health, IngestRequest, Item, ItemWithContent, ItemsPage } from './types';

/**
 * One place that knows how to talk to the API. Components never call `fetch`,
 * so error handling and the response envelope are defined once.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Carries the server's error code and request id so the UI can act on both. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level messages from server-side validation, when present. */
  get fieldErrors(): Record<string, string[]> | null {
    const details = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return details?.fieldErrors ?? null;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; requestId?: string };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    // A network-level failure has no status and no body to parse.
    throw new ApiError(
      'Could not reach the server. Is it running on port 4000?',
      'network_error',
      0,
      null,
      cause,
    );
  }

  if (response.status === 204) return undefined as T;

  const requestId = response.headers.get('x-request-id');
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const envelope = (payload ?? {}) as ErrorEnvelope;
    throw new ApiError(
      envelope.error?.message ?? `Request failed with status ${response.status}.`,
      envelope.error?.code ?? 'unknown_error',
      response.status,
      envelope.error?.requestId ?? requestId,
      envelope.error?.details,
    );
  }

  return payload as T;
}

export const api = {
  health: () => request<Health>('/health'),

  listItems: (params: { limit?: number; offset?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return request<ItemsPage>(`/items${suffix}`);
  },

  getItem: (id: string) => request<{ item: ItemWithContent }>(`/items/${id}`),

  ingest: (body: IngestRequest) =>
    request<{ item: Item }>('/ingest', { method: 'POST', body: JSON.stringify(body) }),

  deleteItem: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),

  reindexItem: (id: string) => request<{ item: Item }>(`/items/${id}/reindex`, { method: 'POST' }),

  query: (question: string) =>
    request<Answer>('/query', { method: 'POST', body: JSON.stringify({ question }) }),
};
