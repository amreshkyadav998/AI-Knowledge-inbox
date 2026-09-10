import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { asyncRoute } from '../middleware/error-handler.js';
import { validate } from '../middleware/validate.js';

const querySchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Ask a question of at least 3 characters.')
    .max(1000, 'Questions are limited to 1000 characters.'),
  /** Optional per-request overrides, useful for demoing the retrieval knobs. */
  topK: z.coerce.number().int().min(1).max(20).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
});

export function queryRoutes(container: Container): Router {
  const router = Router();

  /**
   * POST /api/query
   *
   * Always 200 when the pipeline ran, even if nothing relevant was found:
   * "I could not find that in your content" is a successful answer, not an HTTP
   * error. `grounded: false` is the machine-readable signal for that case.
   *
   * Genuine failures (provider down, bad key, rate limit) surface as 502/503
   * through the shared error handler.
   */
  router.post(
    '/query',
    validate(querySchema),
    asyncRoute(async (req, res) => {
      const { question, topK, minScore } = req.body as z.infer<typeof querySchema>;

      req.log.info('query received', {
        event: 'query.received',
        questionChars: question.length,
        topK: topK ?? container.config.rag.topK,
      });

      const answer = await container.answers.ask(question, {
        ...(topK !== undefined ? { topK } : {}),
        ...(minScore !== undefined ? { minScore } : {}),
      });

      res.json(answer);
    }),
  );

  return router;
}
