import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Deliberately tiny structured logger: one JSON object per line, so the output
 * is greppable by humans and parseable by anything that ships logs. A real
 * deployment would swap this for pino; the call sites would not change.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

/** Per-request fields (requestId etc.) travel here so call sites stay clean. */
const requestContext = new AsyncLocalStorage<LogFields>();

export function runWithLogContext<T>(fields: LogFields, fn: () => T): T {
  const parent = requestContext.getStore() ?? {};
  return requestContext.run({ ...parent, ...fields }, fn);
}

/** Errors are not JSON-serialisable by default; unwrap them into plain data. */
function serialiseValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack.split('\n').slice(0, 6).join('\n') } : {}),
      ...(value.cause ? { cause: serialiseValue(value.cause) } : {}),
    };
  }
  return value;
}

function serialiseFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) out[key] = serialiseValue(value);
  return out;
}

export function createLogger(level: LogLevel = 'info', base: LogFields = {}): Logger {
  const threshold = LEVEL_WEIGHT[level];

  const emit = (lvl: LogLevel, msg: string, fields?: LogFields): void => {
    if (LEVEL_WEIGHT[lvl] < threshold) return;
    const record = {
      time: new Date().toISOString(),
      level: lvl,
      msg,
      ...serialiseFields(base),
      ...serialiseFields(requestContext.getStore() ?? {}),
      ...serialiseFields(fields ?? {}),
    };
    const line = JSON.stringify(record);
    if (lvl === 'error' || lvl === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (fields) => createLogger(level, { ...base, ...fields }),
  };
}
