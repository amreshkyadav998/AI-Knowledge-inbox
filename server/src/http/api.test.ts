import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createContainer, type Container } from '../container.js';
import { createApp } from './app.js';

/**
 * End-to-end over the real HTTP surface, with an in-memory database and the
 * keyless local provider - no network, no API key, deterministic. It exercises
 * the actual async path: accept -> queue -> worker -> searchable.
 */

let server: Server;
let container: Container;
let baseUrl: string;

before(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    AI_PROVIDER: 'local',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'error',
    // Pinned rather than inherited, so tuning the default cannot silently
    // change what these assertions mean.
    RETRIEVAL_MIN_SCORE: '0.15',
  });

  container = createContainer(config, createLogger('error'));
  server = createApp(container).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  await container.worker.drain();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  container.close();
});

async function call(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any; requestId: string | null }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const body = response.status === 204 ? null : await response.json();
  return { status: response.status, body, requestId: response.headers.get('x-request-id') };
}

describe('POST /ingest', () => {
  it('accepts a note with 202 and reports it as pending', async () => {
    const { status, body } = await call('/ingest', {
      method: 'POST',
      body: JSON.stringify({
        sourceType: 'note',
        content: 'The office wifi password is hunter2 and the guest network is called Lobby.',
      }),
    });

    assert.equal(status, 202);
    assert.equal(body.item.status, 'pending');
    assert.equal(body.item.sourceType, 'note');
    assert.ok(body.item.id);
  });

  it('derives a title from the first line when none is given', async () => {
    const { body } = await call('/ingest', {
      method: 'POST',
      body: JSON.stringify({ sourceType: 'note', content: 'Deploy runbook\n\nStep one: drain traffic.' }),
    });
    assert.equal(body.item.title, 'Deploy runbook');
  });

  it('rejects an empty note with a field-level error', async () => {
    const { status, body } = await call('/ingest', {
      method: 'POST',
      body: JSON.stringify({ sourceType: 'note', content: '   ' }),
    });

    assert.equal(status, 400);
    assert.equal(body.error.code, 'validation_error');
    assert.ok(body.error.details.fieldErrors.content);
  });

  it('rejects an unknown source type', async () => {
    const { status, body } = await call('/ingest', {
      method: 'POST',
      body: JSON.stringify({ sourceType: 'pdf', content: 'x' }),
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'validation_error');
  });

  it('rejects a malformed URL', async () => {
    const { status, body } = await call('/ingest', {
      method: 'POST',
      body: JSON.stringify({ sourceType: 'url', url: 'not-a-url' }),
    });
    assert.equal(status, 400);
    assert.ok(body.error.details.fieldErrors.url);
  });

  it('rejects a body that is not JSON', async () => {
    const { status, body } = await call('/ingest', { method: 'POST', body: '{oops' });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'validation_error');
  });

  it('returns a request id on every error for tracing', async () => {
    const { body, requestId } = await call('/ingest', { method: 'POST', body: JSON.stringify({}) });
    assert.ok(requestId);
    assert.equal(body.error.requestId, requestId);
  });
});

describe('the async ingest pipeline', () => {
  it('moves an accepted item to ready with chunks', async () => {
    await container.worker.drain();

    const { body } = await call('/items');
    const note = body.items.find((item: any) => item.title.startsWith('The office wifi'));

    assert.ok(note, 'expected the seeded note to be listed');
    assert.equal(note.status, 'ready');
    assert.ok(note.chunkCount > 0, 'expected at least one chunk');
  });

  it('marks a URL item failed with a readable reason instead of hanging', async () => {
    const { body } = await call('/ingest', {
      method: 'POST',
      body: JSON.stringify({ sourceType: 'url', url: 'http://127.0.0.1:9/blocked' }),
    });

    await container.worker.drain();

    const { body: fetched } = await call(`/items/${body.item.id}`);
    assert.equal(fetched.item.status, 'failed');
    assert.match(fetched.item.errorMessage, /private network address/);
  });
});

describe('GET /items', () => {
  it('paginates and reports whether more remain', async () => {
    const { status, body } = await call('/items?limit=1&offset=0');
    assert.equal(status, 200);
    assert.equal(body.items.length, 1);
    assert.equal(body.pagination.limit, 1);
    assert.equal(body.pagination.hasMore, body.pagination.total > 1);
  });

  it('rejects an out-of-range limit', async () => {
    const { status, body } = await call('/items?limit=9999');
    assert.equal(status, 400);
    assert.equal(body.error.code, 'validation_error');
  });

  it('404s for an id that does not exist', async () => {
    const { status, body } = await call('/items/00000000-0000-4000-8000-000000000000');
    assert.equal(status, 404);
    assert.equal(body.error.code, 'not_found');
  });

  it('400s for an id that is not a UUID', async () => {
    const { status } = await call('/items/banana');
    assert.equal(status, 400);
  });
});

describe('POST /query', () => {
  it('answers from indexed content and cites its sources', async () => {
    await container.worker.drain();

    const { status, body } = await call('/query', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is the office wifi password?' }),
    });

    assert.equal(status, 200);
    assert.equal(body.grounded, true);
    assert.ok(body.citations.length > 0);
    assert.match(body.answer, /hunter2/);

    const citation = body.citations[0];
    assert.equal(citation.marker, 1);
    assert.ok(citation.chunkId && citation.itemId);
    assert.ok(citation.score > 0);
    assert.ok(typeof body.timings.totalMs === 'number');
  });

  it('says so plainly when nothing is relevant, rather than inventing an answer', async () => {
    // No lexical overlap with anything indexed. Under the local provider that
    // means a score of zero; a hosted embedding model would also place this far
    // from every stored chunk.
    const { status, body } = await call('/query', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is the capital city of Mongolia?' }),
    });

    assert.equal(status, 200);
    assert.equal(body.grounded, false);
    assert.deepEqual(body.citations, []);
  });

  it('rejects a question that is too short', async () => {
    const { status, body } = await call('/query', {
      method: 'POST',
      body: JSON.stringify({ question: 'hi' }),
    });
    assert.equal(status, 400);
    assert.ok(body.error.details.fieldErrors.question);
  });
});

describe('DELETE /items/:id', () => {
  it('removes the item and its chunks from search', async () => {
    const { body: created } = await call('/ingest', {
      method: 'POST',
      body: JSON.stringify({ sourceType: 'note', content: 'Zanzibar pineapple protocol revision seven.' }),
    });
    await container.worker.drain();

    const before = container.chunks.count();
    const { status } = await call(`/items/${created.item.id}`, { method: 'DELETE' });

    assert.equal(status, 204);
    assert.ok(container.chunks.count() < before, 'chunks should cascade with the item');

    const { status: refetch } = await call(`/items/${created.item.id}`);
    assert.equal(refetch, 404);
  });
});

describe('GET /health', () => {
  it('reports the active models and index state', async () => {
    const { status, body } = await call('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.ai.embeddingModel, 'local:hashed-bow-v1');
    assert.ok(typeof body.index.chunks === 'number');
    assert.ok(body.queue);
  });
});

describe('unknown routes', () => {
  it('404s with the standard error envelope', async () => {
    const { status, body } = await call('/nope');
    assert.equal(status, 404);
    assert.equal(body.error.code, 'not_found');
    assert.ok(body.error.requestId);
  });
});
