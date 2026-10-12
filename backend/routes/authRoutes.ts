import { formatSafeAuthErrorLog } from '../utils/safeAuthLogger.js';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { execute, queryOne } from '../database.js';
import { User, UserRole } from '../models/types.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  createRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  sanitizeUser,
  requireAuth,
  AuthenticatedRequest,
} from '../auth/auth.js';
import {
  checkAccountLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from '../auth/loginSecurity.js';
import {
  isValidEmail,
  isValidName,
  validatePasswordStrength,
  sanitizeString,
} from '../utils/validators.js';
import { logAudit } from '../services/auditService.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone, contact_info, role } = req.body;

    // 1. Name validation
    if (!name || !isValidName(name)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Full name must be between 2 and 80 characters.',
        },
      });
      return;
    }

    // 2. Email validation
    if (!email || !isValidEmail(email)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid email address is required.',
        },
      });
      return;
    }

    // 3. Password strength enforcement
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      res.status(400).json({
        error: {
          code: 'WEAK_PASSWORD',
          message: pwCheck.message || 'Password does not meet minimum complexity requirements.',
        },
      });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();

    // 4. Duplicate account check
    const existing = await queryOne<User>(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
    if (existing) {
      res.status(409).json({
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email address already exists.',
        },
      });
      return;
    }

    // 5. Role assignment - Supports Student, Faculty, or Campus Safety Moderator
    let assignedRole: UserRole = 'STUDENT';
    if (role === 'FACULTY') {
      assignedRole = 'FACULTY';
    } else if (role === 'MODERATOR') {
      assignedRole = 'MODERATOR';
    } else if (role === 'ADMIN') {
      assignedRole = 'ADMIN';
    }

    const password_hash = await hashPassword(password);
    const id = 'usr_' + crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const sanitizedPhone = phone ? sanitizeString(phone) : null;
    const sanitizedContactInfo = contact_info ? sanitizeString(contact_info) : null;

    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, contact_info, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sanitizeString(name),
        cleanEmail,
        password_hash,
        assignedRole,
        sanitizedPhone,
        sanitizedContactInfo,
        createdAt,
        createdAt,
      ]
    );

    const newUser = await queryOne<User>(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!newUser) {
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create user record.' } });
      return;
    }

    const token = generateAccessToken(newUser);
    const refreshToken = await createRefreshToken(newUser.id);

    await logAudit('USER_REGISTERED', newUser.id, `User ${newUser.id} registered with role ${newUser.role}`);

    res.status(201).json({
      user: sanitizeUser(newUser),
      token,
      refreshToken,
    });
  } catch (err: unknown) {
    console.error('Register error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An internal error occurred during registration.' },
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' },
      });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Check account lockout (in-memory fast path)
    const lockout = checkAccountLockout(cleanEmail);
    if (lockout.isLocked) {
      res.status(429).json({
        error: {
          code: 'ACCOUNT_TEMPORARILY_LOCKED',
          message: `Too many failed login attempts. Please try again in ${lockout.remainingSeconds} seconds.`,
        },
      });
      return;
    }

    // 2. Fetch user
    const user = await queryOne<User>(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);

    // Check persistent database lockout if user exists
    if (user && user.locked_until) {
      const lockedUntilTime = new Date(user.locked_until).getTime();
      const nowMs = Date.now();
      if (lockedUntilTime > nowMs) {
        const remainingSeconds = Math.ceil((lockedUntilTime - nowMs) / 1000);
        res.status(429).json({
          error: {
            code: 'ACCOUNT_TEMPORARILY_LOCKED',
            message: `Too many failed login attempts. Please try again in ${remainingSeconds} seconds.`,
          },
        });
        return;
      }
    }

    // Generic error to prevent account enumeration
    const genericAuthError = {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    };

    if (!user) {
      recordFailedLoginAttempt(cleanEmail);
      res.status(401).json({ error: genericAuthError });
      return;
    }

    // 3. Verify password
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      const attemptResult = recordFailedLoginAttempt(cleanEmail);
      const currentAttempts = (user.failed_attempts || 0) + 1;
      let newLockedUntil: string | null = null;

      if (attemptResult.isLocked || currentAttempts >= 5) {
        newLockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await execute(`UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`, [
          currentAttempts,
          newLockedUntil,
          user.id,
        ]);
        res.status(429).json({
          error: {
            code: 'ACCOUNT_TEMPORARILY_LOCKED',
            message: 'Too many failed login attempts. Account temporarily locked for 15 minutes.',
          },
        });
        return;
      }

      await execute(`UPDATE users SET failed_attempts = ? WHERE id = ?`, [currentAttempts, user.id]);
      res.status(401).json({ error: genericAuthError });
      return;
    }

    // 4. Successful login: Clear lockout records
    clearFailedLoginAttempts(cleanEmail);

    const now = new Date().toISOString();
    await execute(
      `UPDATE users SET last_login_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?`,
      [now, user.id]
    );

    const token = generateAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);

    await logAudit('USER_LOGIN', user.id, `User ${user.id} logged in`);

    res.json({
      user: sanitizeUser(user),
      token,
      refreshToken,
    });
  } catch (err: unknown) {
    console.error('Login error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An internal error occurred during login.' },
    });
  }
});

// POST /api/auth/refresh - Refresh token rotation
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required.' },
      });
      return;
    }

    const rotationResult = await verifyAndRotateRefreshToken(refreshToken);
    if (!rotationResult.valid || !rotationResult.userId || !rotationResult.newRefreshToken) {
      res.status(401).json({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token.' },
      });
      return;
    }

    const user = await queryOne<User>(`SELECT * FROM users WHERE id = ?`, [rotationResult.userId]);
    if (!user) {
      res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User account not found.' },
      });
      return;
    }

    const newAccessToken = generateAccessToken(user);

    res.json({
      token: newAccessToken,
      refreshToken: rotationResult.newRefreshToken,
    });
  } catch (err: unknown) {
    console.error(formatSafeAuthErrorLog('Refresh token error', err));
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to refresh token.' },
    });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    res.json({ message: 'Logged out successfully.' });
  } catch (err: unknown) {
    console.error('Logout error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An error occurred during logout.' },
    });
  }
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Both current password and new password are required.',
          },
        });
        return;
      }

      const pwCheck = validatePasswordStrength(newPassword);
      if (!pwCheck.valid) {
        res.status(400).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: pwCheck.message || 'New password does not meet complexity rules.',
          },
        });
        return;
      }

      const user = await queryOne<User>(`SELECT * FROM users WHERE id = ?`, [req.user!.userId]);
      if (!user) {
        res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
        return;
      }

      const isMatch = await comparePassword(currentPassword, user.password_hash);
      if (!isMatch) {
        res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
        });
        return;
      }

      const newHash = await hashPassword(newPassword);
      await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, user.id]);

      // Revoke all refresh tokens for security
      await revokeAllUserRefreshTokens(user.id);

      await logAudit('PASSWORD_CHANGED', user.id, `User ${user.id} updated their password`);

      res.json({ message: 'Password updated successfully. Please log in again with your new credentials.' });
    } catch (err: unknown) {
      console.error(formatSafeAuthErrorLog('Change password error', err));
      res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to change password.' },
      });
    }
  }
);

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await queryOne<User>(`SELECT * FROM users WHERE id = ?`, [req.user!.userId]);
    if (!user) {
      res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User record not found.' },
      });
      return;
    }

    res.json({ user: sanitizeUser(user) });
  } catch (err: unknown) {
    console.error('Me endpoint error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve profile.' },
    });
  }
});

export default router;
