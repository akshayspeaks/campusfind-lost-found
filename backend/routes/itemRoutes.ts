import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { UPLOAD_DIR, MAX_FILE_SIZE } from '../config.js';
import {
  createItem,
  getItemWithPrivacy,
  listItems,
  updateItemStatus,
  updateVerificationDetail,
  deleteItem,
  getItemById,
} from '../services/itemService.js';
import { findMatchesForItem } from '../services/matchingService.js';
import { createClaim } from '../services/claimService.js';
import {
  requireAuth,
  optionalAuth,
  AuthenticatedRequest,
} from '../auth/auth.js';
import { ItemCategory, ItemStatus, ItemType, VerificationHint } from '../models/types.js';
import { extractFallbackImageEmbedding } from '../utils/imageFeatureExtractor.js';
import {
  isValidCategory,
  isValidCoordinates,
  isValidId,
  isValidIsoDate,
  isValidItemType,
  parsePagination,
  sanitizeString,
} from '../utils/validators.js';
import {
  validateImageSignature,
  generateSafeImageFilename,
  isPathSafe,
} from '../utils/imageSecurity.js';
import { logAudit } from '../services/auditService.js';
import { uploadImage, deleteImage } from '../services/storageService.js';

const router = Router();

const VALID_VERIFICATION_HINTS: VerificationHint[] = ['SCRATCH', 'CONTENTS', 'SERIAL', 'WALLPAPER', 'OTHER'];

// Configure Multer with memory storage so we can validate magic bytes BEFORE writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // Initial coarse MIME filter
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE: Only JPEG, PNG, and WebP images are permitted.'));
    }
  },
});

// GET /api/items - List and search items
router.get('/', async (req, res: Response): Promise<void> => {
  try {
    const { type, category, status, q, location, owner_id, limit, offset } = req.query;

    const { limit: safeLimit, offset: safeOffset } = parsePagination(limit, offset);

    let cleanType: ItemType | undefined;
    if (type && isValidItemType(type)) {
      cleanType = type;
    }

    let cleanCategory: string | undefined;
    if (category && typeof category === 'string') {
      cleanCategory = sanitizeString(category);
    }

    let cleanStatus: ItemStatus | undefined;
    if (status && ['OPEN', 'MATCHED', 'RESOLVED'].includes(String(status))) {
      cleanStatus = status as ItemStatus;
    }

    const items = await listItems({
      type: cleanType,
      category: cleanCategory,
      status: cleanStatus,
      queryText: q ? sanitizeString(q) : undefined,
      location: location ? sanitizeString(location) : undefined,
      ownerId: owner_id && isValidId(owner_id) ? String(owner_id) : undefined,
      limit: safeLimit,
      offset: safeOffset,
    });

    res.json({ items });
  } catch (err: unknown) {
    console.error('List items error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to retrieve items.' } });
  }
});

// POST /api/items - Create a lost or found report
router.post(
  '/',
  requireAuth,
  upload.single('image'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        type,
        title,
        description,
        category,
        location,
        latitude,
        longitude,
        event_time,
        image_embedding,
        verification_detail,
        verification_hint,
      } = req.body;

      // 1. Validate Item Type
      if (!type || !isValidItemType(type)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Item type must be LOST or FOUND.' },
        });
        return;
      }

      // 2. Validate Title
      const cleanTitle = sanitizeString(title);
      if (cleanTitle.length < 3 || cleanTitle.length > 120) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Item title must be between 3 and 120 characters.',
          },
        });
        return;
      }

      // 3. Validate Description
      const cleanDescription = sanitizeString(description);
      if (cleanDescription.length < 5 || cleanDescription.length > 2000) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Item description must be between 5 and 2000 characters.',
          },
        });
        return;
      }

      // 4. Validate Category
      if (!category || !isValidCategory(category)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid category from campus taxonomy is required.',
          },
        });
        return;
      }

      // Finder-only verification detail is mandatory for new FOUND reports.
      const cleanVerificationDetail = sanitizeString(verification_detail);
      if (type === 'FOUND' && (cleanVerificationDetail.length < 3 || cleanVerificationDetail.length > 1000)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Found-item verification detail must be between 3 and 1000 characters.',
          },
        });
        return;
      }

      const cleanVerificationHint = verification_hint ? sanitizeString(verification_hint) : null;
      if (cleanVerificationHint && !VALID_VERIFICATION_HINTS.includes(cleanVerificationHint as VerificationHint)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid verification hint.',
          },
        });
        return;
      }

      // 5. Validate Location
      const cleanLocation = sanitizeString(location);
      if (cleanLocation.length < 2 || cleanLocation.length > 150) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Location must be between 2 and 150 characters.',
          },
        });
        return;
      }

      // 6. Validate Coordinates
      if (!isValidCoordinates(latitude, longitude)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Coordinates out of bounds. Latitude must be [-90, 90] and Longitude [-180, 180].',
          },
        });
        return;
      }

      // 7. Validate Date
      const eventTime = event_time || new Date().toISOString();
      if (!isValidIsoDate(eventTime)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Valid event date/time is required.' },
        });
        return;
      }

      let imageUrl: string | null = null;
      let embedding: number[] | null = null;

      // 8. Image validation (magic bytes & safe disk write)
      if (req.file) {
        const sigResult = validateImageSignature(req.file.buffer);
        if (!sigResult.valid || !sigResult.extension) {
          res.status(400).json({
            error: {
              code: 'MALICIOUS_FILE_REJECTED',
              message: sigResult.error || 'File signature is not a valid image.',
            },
          });
          return;
        }

        const safeFilename = generateSafeImageFilename(sigResult.extension);
        if (!isPathSafe(UPLOAD_DIR, safeFilename)) {
          res.status(400).json({
            error: { code: 'PATH_TRAVERSAL_DETECTED', message: 'Unsafe filename rejected.' },
          });
          return;
        }

        // Upload via storageService (handles S3/R2 cloud storage if configured, or local fallback)
        try {
          const mimeType =
            sigResult.extension === 'png'
              ? 'image/png'
              : sigResult.extension === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
          const uploadResult = await uploadImage(req.file.buffer, safeFilename, mimeType);
          imageUrl = uploadResult.url;
        } catch (uploadErr) {
          console.error('Image storage upload error:', uploadErr);
          res.status(500).json({
            error: { code: 'STORAGE_ERROR', message: 'Failed to securely store uploaded image.' },
          });
          return;
        }

        // Parse client-provided embedding if available (from browser MobileNet)
        if (image_embedding) {
          try {
            const parsed = typeof image_embedding === 'string' ? JSON.parse(image_embedding) : image_embedding;
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 1024) {
              const allNumbers = parsed.every((n) => typeof n === 'number' && !isNaN(n));
              if (allNumbers) {
                embedding = parsed;
              }
            }
          } catch {
            embedding = null;
          }
        }

        // Server-side fallback feature extractor directly from the buffer
        if (!embedding) {
          embedding = extractFallbackImageEmbedding(req.file.buffer);
        }
      }

      const item = await createItem({
        type,
        title: cleanTitle,
        description: cleanDescription,
        category: category as ItemCategory,
        location: cleanLocation,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        event_time: eventTime,
        image_url: imageUrl,
        image_embedding: embedding,
        verification_detail: type === 'FOUND' ? cleanVerificationDetail : null,
        verification_hint: type === 'FOUND' ? (cleanVerificationHint as VerificationHint | null) : null,
        owner_id: req.user!.userId,
      });

      await logAudit(
        'ITEM_REPORTED',
        req.user!.userId,
        `Item ${item.id} (${item.type}) reported by ${req.user!.userId}`
      );

      // Automatically compute candidate matches
      const matches = await findMatchesForItem(item.id);

      res.status(201).json({
        item,
        suggested_matches: matches.slice(0, 5),
      });
    } catch (err: unknown) {
      console.error('Create item error:', err);
      res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to create item report.' },
      });
    }
  }
);

// GET /api/items/:id - Retrieve item details with strict privacy enforcement
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid item ID format.' },
      });
      return;
    }

    const itemDetail = await getItemWithPrivacy(
      req.params.id,
      req.user?.userId,
      req.user?.role
    );

    if (!itemDetail) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Item not found.' },
      });
      return;
    }

    res.json(itemDetail);
  } catch (err: unknown) {
    console.error('Get item error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve item.' },
    });
  }
});

// PATCH /api/items/:id/verification-detail - Set the hidden finder detail on a legacy FOUND item
router.patch(
  '/:id/verification-detail',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid item ID format.' },
        });
        return;
      }

      const item = await getItemById(req.params.id);
      if (!item) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found.' } });
        return;
      }

      const isOwner = req.user!.userId === item.owner_id;
      const isStaff = req.user!.role === 'MODERATOR' || req.user!.role === 'ADMIN';
      if (!isOwner && !isStaff) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not authorized to edit this item.' } });
        return;
      }

      if (item.type !== 'FOUND') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Verification detail is only available for FOUND items.' },
        });
        return;
      }

      const cleanDetail = sanitizeString(req.body?.verification_detail);
      if (cleanDetail.length < 3 || cleanDetail.length > 1000) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Verification detail must be between 3 and 1000 characters.' },
        });
        return;
      }

      const updated = await updateVerificationDetail(item.id, cleanDetail, req.user!.userId);
      res.json({ item: updated, has_verification_detail: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update verification detail.';
      res.status(400).json({ error: { code: 'VERIFICATION_DETAIL_ERROR', message: msg } });
    }
  }
);

// GET /api/items/:id/matches - Find transparent matches for this item
router.get('/:id/matches', async (req, res: Response): Promise<void> => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid item ID format.' },
      });
      return;
    }

    const matches = await findMatchesForItem(req.params.id);
    res.json({ matches });
  } catch (err: unknown) {
    console.error('Get matches error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to calculate matches.' },
    });
  }
});

// POST /api/items/:id/claims - Submit an ownership claim
router.post(
  '/:id/claims',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid item ID format.' },
        });
        return;
      }

      const { message, verification_answer } = req.body;

      const cleanMessage = sanitizeString(message);
      if (cleanMessage.length < 5 || cleanMessage.length > 1000) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Claim explanation must be between 5 and 1000 characters.',
          },
        });
        return;
      }

      const cleanAnswer = sanitizeString(verification_answer);
      if (cleanAnswer.length < 3 || cleanAnswer.length > 1000) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Verification details must be between 3 and 1000 characters.',
          },
        });
        return;
      }

      const claim = await createClaim(
        req.params.id,
        req.user!.userId,
        cleanMessage,
        cleanAnswer
      );

      res.status(201).json({ claim });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit claim.';
      res.status(400).json({
        error: { code: 'CLAIM_ERROR', message: msg },
      });
    }
  }
);

// PUT /api/items/:id - Update item status (Owner or Staff)
router.put(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid item ID format.' },
        });
        return;
      }

      const item = await getItemById(req.params.id);
      if (!item) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found.' } });
        return;
      }

      const isOwner = req.user!.userId === item.owner_id;
      const isStaff = req.user!.role === 'MODERATOR' || req.user!.role === 'ADMIN';

      if (!isOwner && !isStaff) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You are not authorized to edit this item.' },
        });
        return;
      }

      const { status } = req.body;
      if (status && ['OPEN', 'MATCHED', 'RESOLVED'].includes(status)) {
        const updated = await updateItemStatus(item.id, status as ItemStatus);
        await logAudit('ITEM_UPDATED', req.user!.userId, `Item ${item.id} status changed to ${status}`);
        res.json({ item: updated });
        return;
      }

      res.json({ item });
    } catch (err: unknown) {
      console.error('Update item error:', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update item.' } });
    }
  }
);

// DELETE /api/items/:id - Delete item (Owner or Admin)
router.delete(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid item ID format.' },
        });
        return;
      }

      const item = await getItemById(req.params.id);
      if (!item) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found.' } });
        return;
      }

      const isOwner = req.user!.userId === item.owner_id;
      const isAdmin = req.user!.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You are not authorized to delete this item.' },
        });
        return;
      }

      if (item.image_url) {
        await deleteImage(item.image_url);
      }

      await deleteItem(item.id);
      await logAudit('ITEM_DELETED', req.user!.userId, `Item ${item.id} deleted by ${req.user!.userId}`);

      res.json({ message: 'Item deleted successfully.' });
    } catch (err: unknown) {
      console.error('Delete item error:', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete item.' } });
    }
  }
);

export default router;
