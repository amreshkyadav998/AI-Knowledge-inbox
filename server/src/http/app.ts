import express, { type Express } from 'express';
import cors from 'cors';
import type { Container } from '../container.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import { healthRoutes } from './routes/health.routes.js';
import { ingestRoutes } from './routes/ingest.routes.js';
import { itemsRoutes } from './routes/items.routes.js';
import { queryRoutes } from './routes/query.routes.js';

/**
 * Builds the Express app without starting it, so tests can drive it in-process
 * with no port binding.
 */
export function createApp(container: Container): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: container.config.corsOrigin, exposedHeaders: ['x-request-id'] }));

  // The cap is well above the note limit enforced by the ingest schema; it is
  // here to stop a multi-megabyte body from being parsed at all.
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContext(container.logger));

  app.use(
    '/api',
    healthRoutes(container),
    ingestRoutes(container),
    itemsRoutes(container),
    queryRoutes(container),
  );

  app.use(notFoundHandler());
  app.use(errorHandler(container.logger, container.config.nodeEnv !== 'production'));

  return app;
}
