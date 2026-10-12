import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import {
  JWT_SECRET,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
} from '../config.js';
import { User, UserRole } from '../models/types.js';
import { execute, queryOne } from '../database.js';

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

const JWT_ISSUER = 'campusfind-api';
const JWT_AUDIENCE = 'campusfind-web';

export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export function generateAccessToken(user: { id: string; email: string; role: UserRole }): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

// Backwards compatibility alias
export const generateToken = generateAccessToken;

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates and persists a cryptographically secure refresh token.
 */
export async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);

  // Compute expiration date (default 7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const id = 'rt_' + crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [id, userId, tokenHash, expiresAt, now]
  );

  return rawToken;
}

/**
 * Validates a refresh token against the database and returns the associated user ID.
 */
export async function verifyAndRotateRefreshToken(
  rawToken: string
): Promise<{ valid: boolean; userId?: string; newRefreshToken?: string }> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false };
  }

  const tokenHash = hashRefreshToken(rawToken);
  const record = await queryOne<{
    id: string;
    user_id: string;
    expires_at: string;
    revoked: number;
  }>(`SELECT * FROM refresh_tokens WHERE token_hash = ?`, [tokenHash]);

  if (!record || record.revoked === 1) {
    return { valid: false };
  }

  const expiresDate = new Date(record.expires_at).getTime();
  if (Date.now() > expiresDate) {
    // Expired - revoke
    await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [record.id]);
    return { valid: false };
  }

  // Revoke the old token (token rotation prevents reuse)
  await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [record.id]);

  // Issue new refresh token
  const newRefreshToken = await createRefreshToken(record.user_id);

  return {
    valid: true,
    userId: record.user_id,
    newRefreshToken,
  };
}

/**
 * Revokes a refresh token (e.g., during logout).
 */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashRefreshToken(rawToken);
  await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`, [tokenHash]);
}

/**
 * Revokes all refresh tokens for a user (e.g. on password change).
 */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`, [userId]);
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as AuthPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function sanitizeUser(user: User): Omit<User, 'password_hash' | 'failed_attempts' | 'locked_until'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, failed_attempts, locked_until, ...safe } = user;
  return safe;
}

/**
 * Authentication middleware.
 * Checks Bearer token in Authorization header.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'] as string;
  }

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is required to access this resource.',
      },
    });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Session expired or invalid authentication token.',
      },
    });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Optional authentication middleware for endpoints where extra details are visible to logged-in users.
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'] as string;
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

/**
 * Role-based authorization middleware.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }

    const effectiveRole = req.user.role === 'USER' ? 'STUDENT' : req.user.role;
    const normalizedAllowed = allowedRoles.map((r) => (r === 'USER' ? 'STUDENT' : r));

    if (!normalizedAllowed.includes(effectiveRole)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}`,
        },
      });
      return;
    }

    next();
  };
}
