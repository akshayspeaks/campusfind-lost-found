import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { UPLOAD_DIR } from '../config.js';

export interface ImageValidationResult {
  valid: boolean;
  mimeType?: string;
  extension?: string;
  error?: string;
}

/**
 * Validates the actual magic bytes (file signature) of an image buffer.
 * Does not trust client-sent Content-Type or file extension.
 */
export function validateImageSignature(buffer: Buffer): ImageValidationResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'File buffer too small or empty.' };
  }

  // 1. Check JPEG signature: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg', extension: '.jpg' };
  }

  // 2. Check PNG signature: 0x89 0x50 0x4E 0x47 (89 'P' 'N' 'G')
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, mimeType: 'image/png', extension: '.png' };
  }

  // 3. Check WebP signature: 'RIFF' .... 'WEBP'
  const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
  const isWebp = buffer.toString('ascii', 8, 12) === 'WEBP';
  if (isRiff && isWebp) {
    return { valid: true, mimeType: 'image/webp', extension: '.webp' };
  }

  return {
    valid: false,
    error: 'INVALID_FILE_SIGNATURE: Uploaded file header does not match a valid JPEG, PNG, or WebP image.',
  };
}

/**
 * Generates an unguessable cryptographic filename with the verified extension.
 */
export function generateSafeImageFilename(extension: string): string {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  return `${timestamp}_${randomBytes}${safeExt}`;
}

/**
 * Validates that a filename does not attempt path traversal and resolves inside the upload directory.
 */
export function isPathSafe(baseDir: string, filename: string): boolean {
  // Prevent any directory traversal markers
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  const resolved = path.resolve(baseDir, filename);
  return resolved.startsWith(path.resolve(baseDir));
}
