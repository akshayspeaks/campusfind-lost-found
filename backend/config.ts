import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// JWT Configuration
export const JWT_SECRET = process.env.JWT_SECRET || 'campusfind-dev-supersecret-jwt-key-2026';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'campusfind-dev-refresh-secret-key-2026';
export const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
export const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Security validation on startup in production.
export function validateProductionDatabaseUrl(nodeEnv: string, rawUrl: string | undefined): string | null {
  if (nodeEnv !== 'production') return null;
  const value = rawUrl?.trim() || '';
  if (!value) {
    return 'FATAL: DATABASE_URL must be explicitly set to a PostgreSQL URL in production (postgres:// or postgresql://).';
  }
  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.replace(/^\//, '')) {
      return 'FATAL: DATABASE_URL must be a valid postgres:// or postgresql:// URL in production.';
    }
  } catch {
    return 'FATAL: DATABASE_URL must be a valid postgres:// or postgresql:// URL in production.';
  }
  return null;
}

const productionDatabaseUrlError = validateProductionDatabaseUrl(NODE_ENV, process.env.DATABASE_URL);
if (productionDatabaseUrlError) {
  console.error(productionDatabaseUrlError);
  process.exit(1);
}

if (IS_PRODUCTION) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be explicitly set and at least 32 characters long in production.');
    process.exit(1);
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    console.error('FATAL: JWT_REFRESH_SECRET must be explicitly set and at least 32 characters long in production.');
    process.exit(1);
  }
}

export const VERIFICATION_DETAIL_AUDIT_SECRET = process.env.VERIFICATION_DETAIL_AUDIT_SECRET || '';

if (IS_PRODUCTION && VERIFICATION_DETAIL_AUDIT_SECRET.length < 32) {
  console.error('FATAL: VERIFICATION_DETAIL_AUDIT_SECRET must be explicitly set and at least 32 characters long in production.');
  process.exit(1);
}

// CORS
export const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 min
export const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10);
export const AUTH_RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '15', 10);

// Storage
export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
export const DB_PATH = path.resolve(process.env.DATABASE_PATH || path.join(DATA_DIR, 'campusfind.sqlite'));
export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || '5242880', 10); // 5 MB

// Database URL for PostgreSQL migration
export const DATABASE_URL = process.env.DATABASE_URL || '';

// Persistent Object Storage (Cloudflare R2 / AWS S3)
export const S3_BUCKET = process.env.S3_BUCKET || '';
export const S3_REGION = process.env.S3_REGION || 'auto';
export const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
export const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
export const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';
export const S3_PUBLIC_URL_PREFIX = process.env.S3_PUBLIC_URL_PREFIX || '';

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
