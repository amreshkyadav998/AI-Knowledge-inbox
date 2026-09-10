import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { AppError } from '../errors.js';
import { validate } from '../middleware/validate.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid('Item id must be a UUID.') });

/**
 * `validate` has already replaced `req.params` with the parsed object, so the
 * id is present and well-formed. This narrows it without an inline cast at
 * every call site.
 */
function itemId(params: unknown): string {
  return (params as z.infer<typeof idParamSchema>).id;
}

export function itemsRoutes(container: Container): Router {
  const router = Router();

  /**
   * GET /api/items
   * Paginated, newest first. Returns list metadata only - the full text of an
   * item can be megabytes, and a list view never needs it.
   */
  router.get('/items', validate(listQuerySchema, 'query'), (req, res) => {
    const { limit, offset, status } = req.validatedQuery as z.infer<typeof listQuerySchema>;
    const { items, total } = container.items.list({ limit, offset, ...(status ? { status } : {}) });

    res.json({
      items,
      pagination: { total, limit, offset, hasMore: offset + items.length < total },
    });
  });

  /** GET /api/items/:id - includes the stored text. */
  router.get('/items/:id', validate(idParamSchema, 'params'), (req, res) => {
    const id = itemId(req.params);
    const item = container.items.getWithContent(id);
    if (!item) throw AppError.notFound(`No item with id "${id}".`);
    res.json({ item });
  });

  /** DELETE /api/items/:id - chunks cascade via the foreign key. */
  router.delete('/items/:id', validate(idParamSchema, 'params'), (req, res) => {
    const id = itemId(req.params);
    if (!container.items.delete(id)) throw AppError.notFound(`No item with id "${id}".`);
    req.log.info('item deleted', { event: 'item.deleted', itemId: id });
    res.status(204).end();
  });

  /**
   * POST /api/items/:id/reindex
   * Re-runs the pipeline for one item: the recovery path for a transient fetch
   * failure or a rate-limited embedding call.
   */
  router.post('/items/:id/reindex', validate(idParamSchema, 'params'), (req, res) => {
    const item = container.ingest.reindex(itemId(req.params));
    res.status(202).json({ item });
  });

  return router;
}
