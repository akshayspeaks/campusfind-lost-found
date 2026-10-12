import type { Server } from 'node:http';

export interface GracefulShutdownOptions {
  timeoutMs?: number;
  exitProcess?: (code: number) => void;
  logger?: Pick<Console, 'log' | 'error'>;
}

/** Stop accepting requests, drain in-flight HTTP work, close database connections, then exit. */
export function createGracefulShutdown(
  server: Server,
  closeDatabase: () => Promise<void>,
  options: GracefulShutdownOptions = {}
): (signal: string) => void {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const exitProcess = options.exitProcess ?? ((code: number) => process.exit(code));
  const logger = options.logger ?? console;
  let started = false;

  return (signal: string): void => {
    if (started) return;
    started = true;
    logger.log(`[server] ${signal} received; draining in-flight requests.`);

    const timeout = setTimeout(() => {
      logger.error(`[server] Graceful shutdown exceeded ${timeoutMs} ms; forcing exit.`);
      exitProcess(1);
    }, timeoutMs);

    server.close((serverError?: Error) => {
      void (async () => {
        if (serverError) {
          logger.error(`[server] HTTP server close failed: ${serverError.message}`);
        }
        try {
          await closeDatabase();
          logger.log('[server] Database connections closed.');
          clearTimeout(timeout);
          exitProcess(serverError ? 1 : 0);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown database close error';
          logger.error(`[server] Database close failed: ${message}`);
          clearTimeout(timeout);
          exitProcess(1);
        }
      })();
    });
  };
}
