import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../errors.js';

/**
 * Validation happens at the edge, once. Handlers receive parsed, typed data and
 * never re-check it, which is what keeps them short.
 *
 * Zod issues are flattened into a stable `details.fieldErrors` shape so the
 * frontend can attach messages to inputs instead of showing a blob of JSON.
 */

type Source = 'body' | 'query' | 'params';

export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (fieldErrors[key] ??= []).push(issue.message);
      }
      next(
        AppError.validation(summarise(fieldErrors), { source, fieldErrors }),
      );
      return;
    }

    // Express 5 makes `req.query` a getter, so assign onto a parallel field
    // that handlers read instead of mutating the request in place.
    if (source === 'query') req.validatedQuery = result.data;
    else req[source] = result.data;

    next();
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    validatedQuery?: unknown;
  }
}

/** One human-readable sentence; the machine-readable detail is in `details`. */
function summarise(fieldErrors: Record<string, string[]>): string {
  const entries = Object.entries(fieldErrors);
  const first = entries[0];
  if (!first) return 'Request validation failed.';
  const [field, messages] = first;
  const lead = field === '_' ? messages[0]! : `${field}: ${messages[0]!}`;
  return entries.length === 1 ? lead : `${lead} (and ${entries.length - 1} more field(s))`;
}

export type Infer<S extends ZodTypeAny> = z.infer<S>;
