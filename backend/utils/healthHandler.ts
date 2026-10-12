import type { Request, Response } from 'express';

export interface HealthHandlerOptions {
  checkDatabase: () => Promise<unknown>;
  version: string;
  production: boolean;
  serviceName?: string;
  uptimeSeconds?: () => number;
  now?: () => Date;
}

/** Health reports degraded database connectivity with a non-success HTTP status. */
export function createHealthHandler(options: HealthHandlerOptions) {
  return async (_req: Request, res: Response): Promise<void> => {
    let dbStatus: 'healthy' | 'degraded' = 'healthy';
    try {
      await options.checkDatabase();
    } catch {
      dbStatus = 'degraded';
    }

    res.status(dbStatus === 'healthy' ? 200 : 503).json({
      status: dbStatus === 'healthy' ? 'ok' : 'degraded',
      service: options.serviceName ?? 'CampusFind API',
      version: options.version,
      environment: options.production ? 'production' : 'development',
      database: dbStatus,
      uptime_seconds: Math.floor((options.uptimeSeconds ?? (() => process.uptime()))()),
      timestamp: (options.now ?? (() => new Date()))().toISOString(),
    });
  };
}
