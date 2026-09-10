# AI Knowledge Inbox

Save notes and URLs, then ask questions answered **only** from what you saved, with citations back to the exact text used.

```
Add note/URL ──▶ POST /ingest ──▶ 202 + item{status:pending}
                                        │
                                        ▼  (background worker)
                              fetch → chunk → embed → SQLite
                                        │
Ask a question ──▶ POST /query ──▶ embed query → cosine top-k → LLM → answer + citations
```

---

## Quick start

**Requirements:** Node.js ≥ 20.11 (developed on 22.20). No Docker, no database server, no build tools — `better-sqlite3` installs from a prebuilt binary.

```bash
npm install
```

```bash
cp server/.env.example server/.env
```

Then open `server/.env` and set your key:

```
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
```

Get a free Gemini key at **https://aistudio.google.com/apikey** (Google account, no credit card). Then:

```bash
npm run dev
```

- Frontend → **http://localhost:5173**
- API → **http://localhost:4000/api**

> **Running with no API key at all.** Leave `GEMINI_API_KEY` empty and the app still boots: it falls back to a keyless local provider (hashed bag-of-words retrieval + extractive answers), logs a warning, and shows an amber banner in the UI. Every endpoint and the whole async pipeline work — only answer *quality* degrades. This exists so the project is runnable and testable with zero setup; it is not a serious retrieval mode.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | Both servers with hot reload |
| `npm test` | 49 server tests, no network or API key needed |
| `npm run typecheck` | TypeScript, strict, both packages |
| `npm run build` | Compile server to `server/dist`, bundle web to `web/dist` |
| `npm start` | Run the compiled server |

### Try it in 30 seconds

1. Paste a paragraph into the **Note** tab → **Save**. It appears immediately as `Queued`, flips to `Indexing`, then `Ready`.
2. Switch to the **URL** tab, paste an article link → **Save**. The page is fetched server-side.
3. Ask a question. Click any `[n]` marker in the answer to highlight the source it came from.

---

## Design decisions and tradeoffs

### Ingestion is asynchronous, and the API says so

`POST /ingest` returns **202 Accepted** with the item in `status: "pending"` — not 201. The item exists, but it is not searchable until a background worker has fetched, chunked and embedded it. Fetching a URL takes seconds and embedding is a network round-trip; holding the request open for that would give a UI that freezes on submit and a request that times out on a slow page.

The lifecycle is `pending → processing → ready | failed`, exposed on every item, so the frontend renders truth rather than a spinner that means nothing. `failed` always carries a human-readable `errorMessage`.

Notes go through the same queue even though there is nothing to fetch. Embedding is a network call either way, so making notes synchronous would buy an inconsistent API and a request that *sometimes* takes two seconds.

**What this costs:** the client must poll. `useItems` polls at 1.5s only while something is in flight and stops when everything settles. At real scale this becomes SSE or a websocket.

### The queue is in-process, but the jobs are durable

`JobQueue` is ~70 lines: a FIFO with bounded concurrency (2). That is genuinely all this workload needs, and Redis/BullMQ here would be infrastructure theatre for a single-user app.

The part that *isn't* naive: jobs are also written to a `jobs` table. On boot, `recoverInterrupted()` re-queues anything left `queued` or `running` by a previous process, before the HTTP port opens. A crash mid-ingest leaves recoverable state rather than an item stuck in `processing` forever.

**Breaks at scale:** one process only. Two instances would both recover the same jobs — `markProcessing` uses a conditional `UPDATE` so they cannot both *claim* an item, but the design assumes a single worker. There are no scheduled retries; `POST /items/:id/reindex` is a manual retry, surfaced as a **Retry** button on failed items.

### Chunking: structure-aware packing with overlap

Paragraphs are packed greedily up to ~900 characters, splitting oversized paragraphs at sentence boundaries and hard-cutting only unbroken runs with no punctuation. Consecutive chunks overlap by 150 characters, snapped to a word boundary.

*Why not fixed-size windows:* they cut mid-sentence, so a retrieved chunk starts halfway through a clause and the model has to guess the referent. Paragraph boundaries are the cheapest real signal about where a topic changes, and a chunk that respects them is answerable on its own — which is the whole job of a chunk.

*Why characters, not tokens:* token-exact chunking needs a tokeniser per model. Characters are a stable proxy (~4 chars/token for English) and cost nothing.

*Why overlap:* a fact straddling a boundary would otherwise be unretrievable from either side. It costs duplicated text and near-duplicate hits — which is why the retriever caps how many chunks any single item may contribute.

Every chunk stores `[charStart, charEnd)` offsets into the normalised source, so a citation traces back to an exact span.

### Vector store: SQLite BLOBs and a brute-force scan

Embeddings are stored as raw little-endian float32 BLOBs and compared with an exhaustive dot product in Node.

For a single-user inbox the corpus is thousands of chunks. An exhaustive scan over 10k × 768 floats is a few milliseconds and, more importantly, **exact**. An ANN index (HNSW, pgvector, Qdrant) buys sub-linear search at the cost of a build step, a tuning surface, approximate recall and an extra service — solving a problem this scale does not have.

Vectors are L2-normalised on write, so cosine similarity collapses to a dot product at query time.

**Where this breaks:** the scan is `O(n)` in chunks *and* loads every vector into memory per query. Somewhere around 10⁵ chunks (~300MB at 768 dims) latency and memory both become unacceptable. The migration path is Postgres + pgvector, or SQLite with `sqlite-vec` — the `ChunksRepository.scanByModel` seam is the only thing that changes.

### The relevance floor belongs to the embedding model, not the app

This one came out of actually measuring, and it is the least obvious decision here.

A single global `minScore` constant does not work, because embedding families occupy completely different regions of the similarity range. Measured on this project:

| Provider | Unrelated question | Good match | Floor |
|---|---|---|---|
| `gemini-embedding-001@768` | ~0.50 – 0.52 | 0.67 – 0.80 | **0.60** |
| `local:hashed-bow-v1` | 0 – 0.17 (hash collisions) | ~0.49 | **0.20** |

A floor of 0.15 — a plausible-looking default — filters *nothing* on Gemini while rejecting *good* matches on the local provider. So `suggestedMinScore` is a property of the `EmbeddingProvider`, and `RETRIEVAL_MIN_SCORE` is an optional override rather than a default. `/api/health` reports which is in force via `minScoreSource`.

When nothing clears the floor, the query returns **200** with `grounded: false` and an honest message, and never calls the LLM — answering anyway would mean answering from the model's own memory, which is the one thing this app must not do. It is also ~5x faster (≈970ms vs ≈5.5s).

### Grounding is defended twice

1. **Retrieval floor** — irrelevant chunks never reach the prompt.
2. **Prompt constraints** — the system prompt requires a citation marker on every factual sentence, forbids inventing markers, and requires saying what is missing rather than guessing. Verified: asking an off-topic question of an indexed corpus produces *"The provided context does not contain information about…"* rather than a confident answer.

Citation markers that don't match a real source are rendered as plain text in the UI, never as a link — a marker pointing at nothing must not look clickable.

### Embedding model identity includes its dimensions

Chunks store `embedding_model`, and retrieval filters on it. Vectors from different models are not comparable; ranking across them produces meaningless scores while looking perfectly healthy.

The id is `gemini:gemini-embedding-001@768` — the truncation length is part of the identity, because the same model at two Matryoshka lengths yields vectors that must never be ranked together. `/api/health` warns when stored chunks disagree with the live provider, which is otherwise a silent "search returns nothing" failure.

768 dimensions rather than the native 3072: ~99% of retrieval quality at a quarter of the storage and dot-product cost.

### URL fetching is treated as an SSRF primitive

An endpoint that takes a user URL and requests it from inside your network is a classic SSRF hole. Guards, all in `url-fetcher.ts`:

- `http`/`https` only — no `file:`, `gopher:`, `data:`
- every resolved address checked against loopback, RFC1918, link-local (incl. `169.254.169.254`, the cloud metadata endpoint), CGNAT and the IPv6 equivalents including IPv4-mapped forms
- **re-checked after redirects** — a public host can redirect somewhere private
- byte cap enforced *while streaming*, so a lying `content-length` cannot exhaust memory
- request timeout, and a content-type allowlist

`ALLOW_PRIVATE_URL_FETCH=true` exists for local testing and is documented as unsafe in production.

HTML → text is regex-based (drop `script`/`style`/`nav`/`footer`/etc., keep block structure, decode entities). A real reader (Mozilla Readability + jsdom) extracts article bodies far better but pulls in a DOM implementation. For notes and ordinary articles the heuristic is enough; it will do poorly on JS-rendered app shells, which is why "the page contained no readable text" is its own error message rather than a silent empty item.

### Error handling

One `AppError` type with an explicit code → status mapping, and **one** middleware that turns thrown values into responses. Routes throw; they never build an error body. Every error has the same shape:

```json
{ "error": { "code": "validation_error", "message": "...", "details": {...}, "requestId": "..." } }
```

- `400` bad input, with `details.fieldErrors` per field so the UI can attach messages to inputs
- `404` unknown item or route · `409` nothing indexed · `413` too large · `415` unreadable content
- `502` upstream provider failed · `503` bad API key, rate limit, or timeout

Unrecognised throws become a generic `500` — an internal message never reaches the client, but the real error is in the logs. A missing API key produces *"gemini rejected the API key (HTTP 401). Check the key in server/.env."* rather than a retry loop, because that is a configuration bug, not a transient fault. Provider calls retry transient failures (429/5xx/network) with exponential backoff and jitter.

Validation is Zod at the edge, once — handlers receive parsed, typed data and never re-check it. `POST /ingest` uses a discriminated union on `sourceType` rather than "one of `content` or `url` must be set", which yields precise per-variant messages.

### Logging

One JSON object per line — greppable by a human, parseable by a shipper. Every request gets an id, bound into an `AsyncLocalStorage` context so nested services log it without threading it through their signatures; it is echoed as `x-request-id`, included in every error body, and shown in the UI on failure. So a user saying "it broke" is one `grep` away from the full story.

Events carry timings and counts, not just prose: `rag.retrieve` logs `candidatesScanned`, `hits`, `topScore`; `rag.generate` logs `promptChars` and `generationMs`; `ingest.index` logs `chunks` and `embedMs`.

`pino` would be the production swap; no call site would change.

### Frontend

React hooks, no state library. Three hooks own one concern each (`useItems`, `useAsk`, `useHealth`) and `App.tsx` is layout and wiring only. At this size Redux/Zustand would add indirection without removing any.

Two details worth naming:
- `useAsk` guards against out-of-order responses with a request counter. Without it a slow first answer can land after a fast second one and overwrite it — which looks exactly like the model answering the wrong question.
- `useItems` rolls back optimistic deletes if the request fails, rather than leaving the UI lying about what is stored.

`HealthBanner` surfaces the two states that otherwise produce confusing behaviour with no visible cause: API unreachable, and silently running the keyless fallback.

---

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/ingest` | `{sourceType:"note", content, title?}` or `{sourceType:"url", url, title?}` → **202** |
| `GET` | `/api/items` | `?limit=1-100&offset=&status=` → items + pagination |
| `GET` | `/api/items/:id` | Includes stored text |
| `DELETE` | `/api/items/:id` | **204**; chunks cascade |
| `POST` | `/api/items/:id/reindex` | Manual retry → **202** |
| `POST` | `/api/query` | `{question, topK?, minScore?}` → answer + citations |
| `GET` | `/api/health` | Active models, index state, queue depth, retrieval config |

```bash
curl -X POST http://localhost:4000/api/ingest -H 'content-type: application/json' -d '{"sourceType":"note","content":"PgBouncer transaction pooling breaks prepared statements."}'
```

```bash
curl -X POST http://localhost:4000/api/query -H 'content-type: application/json' -d '{"question":"What breaks under transaction pooling?"}'
```

A query response:

```json
{
  "question": "...",
  "answer": "Transaction pooling ... breaks prepared statements [1].",
  "citations": [
    { "marker": 1, "chunkId": "...", "itemId": "...", "itemTitle": "...",
      "sourceType": "note", "url": null, "score": 0.7276, "snippet": "..." }
  ],
  "grounded": true,
  "model": "gemini:gemini-3.6-flash",
  "embeddingModel": "gemini:gemini-embedding-001@768",
  "timings": { "retrievalMs": 631, "generationMs": 5350, "totalMs": 5981 }
}
```

---

## Layout

```
server/src/
  config.ts             env parsed once at boot, fails loudly
  logger.ts             JSON lines + async request context
  container.ts          composition root — all wiring lives here
  domain.ts             shared types, free of Express/SQLite/provider types
  vector.ts             encode/decode/normalise/cosine
  db/
    schema.ts           ordered migrations
    repositories/       items, chunks, jobs
  http/
    app.ts errors.ts
    middleware/         request-context, validate, error-handler
    routes/             ingest, items, query, health
  ingestion/
    url-fetcher.ts      SSRF guards, byte cap, timeout
    html-to-text.ts     dependency-free extraction
    indexer.ts          normalise → chunk → embed → store
    ingest.service.ts   accept and enqueue
  jobs/
    queue.ts            bounded-concurrency FIFO
    ingest.worker.ts    claim → fetch → index → ready/failed
  rag/
    chunker.ts prompt.ts retriever.ts answer.service.ts
    providers.ts        factory + keyless fallback
    embeddings/         gemini · openai · local
    llm/                gemini · openai · local
web/src/
  lib/api.ts            the only place that calls fetch
  hooks/                useItems · useAsk · useHealth
  components/           AddContentForm · ItemList · AskPanel · AnswerView · HealthBanner
```

Every collaborator is a constructor argument; nothing reaches for a global singleton, which is what makes the test suite possible without mocks of the module system.

---

## Tests

`npm test` — 49 tests, no network, no API key, in-memory database, deterministic via the local provider.

- **`api.test.ts`** drives the real HTTP surface end to end, including the actual async path (accept → queue → worker → searchable), the standard error envelope, request-id propagation, pagination, cascade delete, and both the grounded and ungrounded query paths.
- **`chunker.test.ts`** asserts the invariants that matter: offsets resolve back to the source, consecutive spans leave no gaps, boundaries overlap, an unbroken 2000-char run still splits, no trailing fragment.
- **`vector.test.ts`** covers the float32 round-trip including the unaligned-buffer case SQLite can produce, and that a zero vector yields 0 rather than `NaN`.
- **`html-to-text.test.ts`** covers extraction plus the SSRF address classifier against ~18 addresses.

---

## What I would change for production

**Immediately:** authentication and per-user scoping (every query today scans the single global corpus); rate limiting on `/ingest` and `/query`; the API key in a secret manager rather than `.env`.

**At ~10⁵ chunks:** move vectors to pgvector or `sqlite-vec`; the `scanByModel` seam is the only thing that changes.

**For quality:** hybrid retrieval (BM25 + dense, fused) — pure dense retrieval misses exact identifiers like error codes and function names. Then a cross-encoder rerank over the top ~20. Then a small labelled eval set, because right now "is retrieval good?" is answered by trying it, which does not survive a model change.

**For operations:** replace the in-process queue with BullMQ or SQS to get scheduled retries, a dead-letter queue and multiple workers; stream `/query` responses token-by-token (5s of silence is the worst part of the current UX); OpenTelemetry spans instead of hand-rolled timings.

**Known gaps, stated plainly:** re-ingesting the same URL creates a duplicate item; there is no incremental re-crawl; `raw_content` is stored in full alongside the chunks, roughly doubling storage; the HTML extractor gives up on JS-rendered pages; and the retrieval floors in the table above were calibrated by hand against one corpus, not tuned against a labelled set.
