import { ItemCategory, ItemStatus, ItemType, UserRole } from '../models/types.js';

export const VALID_CATEGORIES: ItemCategory[] = [
  'Electronics',
  'Wallet',
  'ID Card',
  'Keys',
  'Books',
  'Clothing',
  'Bag',
  'Jewelry',
  'Documents',
  'Accessories',
  'Other',
];

export const VALID_ROLES: UserRole[] = ['STUDENT', 'FACULTY', 'MODERATOR', 'ADMIN', 'USER'];

/**
 * Strips HTML tags and control characters to prevent stored XSS
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove control chars
    .trim();
}

/**
 * Validates email format according to standard RFC 5322 subset
 */
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const clean = email.trim();
  if (clean.length === 0 || clean.length > 254) return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(clean);
}

/**
 * Enforces strong password rules:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 */
export function validatePasswordStrength(password: unknown): { valid: boolean; message?: string } {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a string.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password cannot exceed 128 characters.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character.' };
  }
  return { valid: true };
}

/**
 * Validates a person's display name
 */
export function isValidName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  const clean = sanitizeString(name);
  return clean.length >= 2 && clean.length <= 80;
}

/**
 * Validates item type
 */
export function isValidItemType(type: unknown): type is ItemType {
  return type === 'LOST' || type === 'FOUND';
}

/**
 * Validates item category against whitelist
 */
export function isValidCategory(category: unknown): category is ItemCategory {
  return typeof category === 'string' && VALID_CATEGORIES.includes(category as ItemCategory);
}

/**
 * Validates geographic coordinate bounds
 */
export function isValidCoordinates(lat?: unknown, lng?: unknown): boolean {
  if (lat === undefined && lng === undefined) return true;
  if (lat === null && lng === null) return true;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (isNaN(latNum) || isNaN(lngNum)) return false;
  if (latNum < -90 || latNum > 90) return false;
  if (lngNum < -180 || lngNum > 180) return false;

  return true;
}

/**
 * Validates ISO date string
 */
export function isValidIsoDate(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string') return false;
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return false;

  // Not earlier than year 2000 and not more than 48 hours in the future
  const d = new Date(parsed);
  const now = new Date();
  const maxFuture = new Date(now.getTime() + 48 * 3600 * 1000);
  const minPast = new Date('2000-01-01T00:00:00Z');

  return d >= minPast && d <= maxFuture;
}

/**
 * Validates a generic ID to prevent path traversal or SQL injections
 */
export function isValidId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{3,64}$/.test(id);
}

/**
 * Sanitizes integer pagination query parameters
 */
export function parsePagination(limitQuery: unknown, offsetQuery: unknown): { limit: number; offset: number } {
  let limit = 50;
  let offset = 0;

  if (limitQuery !== undefined) {
    const parsed = parseInt(String(limitQuery), 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 100);
    }
  }

  if (offsetQuery !== undefined) {
    const parsed = parseInt(String(offsetQuery), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  return { limit, offset };
}
