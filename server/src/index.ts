import { loadEnvFile } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createContainer } from './container.js';
import { createApp } from './http/app.js';

// Node 20.6+ can read a .env file natively; no dotenv dependency needed.
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (fs.existsSync(envPath)) loadEnvFile(envPath);

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { service: 'ai-knowledge-inbox' });

  const container = createContainer(config, logger);

  // Anything a previous process left half-done goes back on the queue before
  // the port opens, so the queue depth reported by /health is accurate.
  const recovered = container.worker.recoverInterrupted();
  if (recovered > 0) logger.info('recovered interrupted jobs', { count: recovered });

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    logger.info('server listening', {
      port: config.port,
      url: `http://localhost:${config.port}`,
      corsOrigin: config.corsOrigin,
      provider: config.ai.provider,
      degraded: container.ai.fellBack,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    server.close(() => {
      // Let in-flight ingest jobs finish so items are not stranded in
      // `processing` with no worker to move them along.
      void container.worker.drain().then(() => {
        container.close();
        logger.info('shutdown complete');
        process.exit(0);
      });
    });

    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // A crash with no log line is the worst kind of crash.
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', { error: reason });
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception - exiting', { error });
    process.exit(1);
  });
}

try {
  main();
} catch (error) {
  // Config errors happen before the logger exists, so this one prints plainly.
  process.stderr.write(`Failed to start: ${(error as Error).message}\n`);
  process.exit(1);
}
