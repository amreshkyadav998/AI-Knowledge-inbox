import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError, isAppError } from '../errors.js';
import type { Logger } from '../../logger.js';

/**
 * The single place that turns a thrown value into an HTTP response. Every error
 * body has the same shape, so the frontend has exactly one thing to parse:
 *
 *   { "error": { "code", "message", "details"?, "requestId" } }
 */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => {
    next(AppError.notFound(`No route for ${req.method} ${req.originalUrl.split('?')[0]}.`));
  };
}

export function errorHandler(logger: Logger, exposeStack: boolean): ErrorRequestHandler {
  return (error: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const requestId = req.requestId ?? 'unknown';
    const normalised = normalise(error);

    // 5xx means we broke; 4xx means the caller did. Only the former is noisy.
    if (normalised.status >= 500) {
      logger.error('unhandled error', { requestId, code: normalised.code, error });
    } else {
      logger.warn('request rejected', {
        requestId,
        code: normalised.code,
        reason: normalised.message,
      });
    }

    const body: ErrorBody = {
      error: {
        code: normalised.code,
        message: normalised.message,
        ...(normalised.details !== undefined ? { details: normalised.details } : {}),
        requestId,
      },
    };

    if (exposeStack && error instanceof Error && normalised.status >= 500) {
      (body.error as Record<string, unknown>).stack = error.stack;
    }

    res.status(normalised.status).json(body);
  };
}

function normalise(error: unknown): AppError {
  if (isAppError(error)) return error;

  // express.json() surfaces malformed payloads as a SyntaxError with `body`.
  if (error instanceof SyntaxError && 'body' in error) {
    return AppError.validation('Request body is not valid JSON.');
  }
  if (typeof error === 'object' && error !== null && (error as { type?: string }).type === 'entity.too.large') {
    return new AppError('payload_too_large', 'Request body is too large.');
  }

  // Anything unrecognised is a bug: never leak its message to the client.
  return new AppError('internal_error', 'Something went wrong on the server.', { cause: error });
}

/**
 * Express 4 does not forward rejected promises from async handlers, so every
 * async route is wrapped in this rather than relying on a try/catch per route.
 */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
