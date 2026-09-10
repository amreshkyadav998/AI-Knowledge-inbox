/**
 * One error type with an explicit HTTP mapping. Handlers throw; the error
 * middleware is the only place that decides status codes and response shape,
 * so a route can never invent its own error envelope.
 */

export type ErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'unsupported_content'
  | 'fetch_failed'
  | 'provider_unavailable'
  | 'provider_error'
  | 'no_content_indexed'
  | 'payload_too_large'
  | 'internal_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_error: 400,
  not_found: 404,
  unsupported_content: 415,
  fetch_failed: 502,
  provider_unavailable: 503,
  provider_error: 502,
  no_content_indexed: 409,
  payload_too_large: 413,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to show a user / echo in the API response. */
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: { details?: unknown; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (options.details !== undefined) this.details = options.details;
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('validation_error', message, { details });
  }

  static notFound(message: string): AppError {
    return new AppError('not_found', message);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
