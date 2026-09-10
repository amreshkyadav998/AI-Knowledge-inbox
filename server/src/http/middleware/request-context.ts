import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../../logger.js';
import { runWithLogContext } from '../../logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    log: Logger;
  }
}

/**
 * Gives every request an id, binds it into the async log context so nested
 * services log it without threading it through their signatures, echoes it as
 * `x-request-id`, and emits one access line per completed request.
 *
 * The id is what makes a user-reported "it failed" traceable: it appears in the
 * error response body, in the response header, and on every log line.
 */
export function requestContext(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();

    req.requestId = requestId;
    req.log = logger.child({ requestId });
    res.setHeader('x-request-id', requestId);

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const fields = {
        event: 'http.request',
        requestId,
        method: req.method,
        path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      };
      if (res.statusCode >= 500) logger.error('request failed', fields);
      else if (res.statusCode >= 400) logger.warn('request rejected', fields);
      else logger.info('request completed', fields);
    });

    runWithLogContext({ requestId }, () => next());
  };
}
