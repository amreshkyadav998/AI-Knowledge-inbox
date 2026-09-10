import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { validate } from '../middleware/validate.js';

const MAX_NOTE_CHARS = 100_000;

/**
 * A discriminated union on `sourceType` rather than "one of content or url must
 * be set": the client always knows which it is sending, and the union gives
 * precise per-variant error messages instead of a vague "invalid body".
 */
const ingestSchema = z.discriminatedUnion(
  'sourceType',
  [
    z.object({
      sourceType: z.literal('note'),
      content: z
        .string()
        .trim()
        .min(1, 'Note content cannot be empty.')
        .max(MAX_NOTE_CHARS, `Notes are limited to ${MAX_NOTE_CHARS.toLocaleString()} characters.`),
      title: z.string().trim().max(200).optional(),
    }),
    z.object({
      sourceType: z.literal('url'),
      url: z.string().trim().url('Enter a valid http(s) URL.'),
      title: z.string().trim().max(200).optional(),
    }),
  ],
  { errorMap: () => ({ message: 'sourceType must be either "note" or "url".' }) },
);

export function ingestRoutes(container: Container): Router {
  const router = Router();

  /**
   * POST /api/ingest
   *
   * 202 Accepted, not 201 Created: the item exists, but it is not searchable
   * until the worker has fetched, chunked and embedded it. The response carries
   * the item with `status: "pending"` so the client can poll or optimistically
   * render it.
   */
  router.post('/ingest', validate(ingestSchema), (req, res) => {
    const item = container.ingest.accept(req.body);
    res.status(202).json({ item });
  });

  return router;
}
