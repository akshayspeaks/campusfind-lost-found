import express, { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {
  PORT,
  UPLOAD_DIR,
  NODE_ENV,
  IS_PRODUCTION,
  CORS_ORIGIN,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  AUTH_RATE_LIMIT_MAX_REQUESTS,
} from './backend/config.js';
import { getDb, queryOne, isPostgresMode, getPgPool, closeDatabase } from './backend/database.js';
import { createGracefulShutdown } from './backend/utils/gracefulShutdown.js';
import { createHealthHandler } from './backend/utils/healthHandler.js';

import authRoutes from './backend/routes/authRoutes.js';
import itemRoutes from './backend/routes/itemRoutes.js';
import claimRoutes from './backend/routes/claimRoutes.js';
import notificationRoutes from './backend/routes/notificationRoutes.js';
import adminRoutes from './backend/routes/adminRoutes.js';
import { isOriginAllowed } from './backend/utils/corsValidator.js';

const APP_VERSION = '1.0.0';

async function startServer() {
  const app = express();

  // Trust reverse proxies (nginx / Cloud Run)
  app.set('trust proxy', 1);

  // 1. Security Headers via Helmet configured for AI Studio iframe preview compatibility
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'", // Required for TensorFlow.js WebGL tensor compilation and Vite dev mode
            'blob:',
            'https:',
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", 'blob:', 'https:', 'http:', 'ws:', 'wss:'],
          objectSrc: ["'none'"],
          // In AI Studio, the application renders inside a preview iframe.
          // Disabling frameAncestors and frameguard allows the iframe to connect without being blocked.
          frameAncestors: null,
          upgradeInsecureRequests: null,
        },
      },
      frameguard: false, // Disables X-Frame-Options: SAMEORIGIN so iframe preview connects cleanly
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );

  // 2. CORS allowlist configuration (Strict production whitelisting, seamless dev/preview support)
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, NODE_ENV, CORS_ORIGIN)) {
        // Echo the exact allowed requesting origin (never wildcard "*")
        return callback(null, true);
      }
      // Gracefully deny unauthorized origins without throwing uncaught exceptions
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // 3. Request Body Size Limits to prevent DoS
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // 4. Rate Limiters
  // Horizontal Scaling Note:
  // express-rate-limit uses an in-memory store by default. In single-instance container
  // deployments (such as Render standard services), this provides fast, zero-dependency protection.
  // If the application is horizontally scaled across multiple instances in the future,
  // the memory store is per-instance and a distributed store (like Redis) should be introduced.
  const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
      },
    },
  });

  const authLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
      },
    },
  });

  // Apply rate limiters
  app.use('/api/', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // 5. Ensure uploads folder exists and serve static uploads securely (local fallback)
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      dotfiles: 'ignore',
      index: false,
      maxAge: '7d',
    })
  );

  // 6. Initialize Database Schema (Dual Mode: PostgreSQL if DATABASE_URL, SQLite otherwise)
  if (isPostgresMode()) {
    await getPgPool();
  } else {
    await getDb();
  }

  // 7. Health Check Endpoints (safe, non-leaking)
  const healthHandler = createHealthHandler({
    checkDatabase: () => queryOne('SELECT 1'),
    version: APP_VERSION,
    production: IS_PRODUCTION,
  });

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // 8. REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/claims', claimRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);

  // 9. Fallback for unmatched API routes
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'ENDPOINT_NOT_FOUND',
        message: `API route ${req.method} ${req.url} does not exist.`,
      },
    });
  });

  // 10. Centralized Express Error Handling Middleware (Safe for Production)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    if (err.message?.includes('CORS')) {
      res.status(403).json({
        error: { code: 'CORS_ERROR', message: 'Cross-origin request blocked.' },
      });
      return;
    }

    if (err.message?.startsWith('INVALID_FILE_TYPE')) {
      res.status(400).json({
        error: { code: 'INVALID_FILE_TYPE', message: err.message },
      });
      return;
    }

    console.error('Unhandled API error:', err.message);

    // Never leak stack traces or raw database messages in production
    const responseError = IS_PRODUCTION
      ? { code: 'SERVER_ERROR', message: 'An internal server error occurred.' }
      : { code: 'SERVER_ERROR', message: err.message };

    res.status(500).json({ error: responseError });
  });

  // 11. Frontend Serving
  if (NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server: Server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(` CampusFind production-ready server running on port ${PORT}`);
    console.log(` Environment: ${NODE_ENV}`);
    console.log(` Health: http://localhost:${PORT}/health`);
    console.log(`=========================================`);
  });

  const shutdown = createGracefulShutdown(server, closeDatabase, { timeoutMs: 10_000 });
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
