import { Router, Response } from 'express';
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from '../auth/auth.js';
import {
  listUserClaims,
  listClaimsForModerator,
  approveClaim,
  rejectClaim,
  getClaimById,
  confirmHandover,
} from '../services/claimService.js';
import { ClaimStatus } from '../models/types.js';
import { isValidId, parsePagination, sanitizeString } from '../utils/validators.js';
import { getItemById } from '../services/itemService.js';

const router = Router();

// GET /api/claims - List claims
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const isStaff = req.user!.role === 'MODERATOR' || req.user!.role === 'ADMIN';
    const { status, all, limit, offset } = req.query;

    if (isStaff && all === 'true') {
      const pagination = parsePagination(limit, offset);
      const claims = await listClaimsForModerator(
        status as ClaimStatus,
        limit === undefined ? 100 : pagination.limit,
        pagination.offset
      );
      const safeClaims = claims.map((claim) => ({ ...claim, handover_code: null }));
      res.json({ claims: safeClaims });
      return;
    }

    const claims = await listUserClaims(req.user!.userId);
    res.json({ claims });
  } catch (err: unknown) {
    console.error('List claims error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to retrieve claims.' } });
  }
});

// GET /api/claims/:id - Get specific claim
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid claim ID format.' },
      });
      return;
    }

    const claim = await getClaimById(req.params.id);
    if (!claim) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Claim not found.' } });
      return;
    }

    const isClaimant = req.user!.userId === claim.claimant_id;
    const isStaff = req.user!.role === 'MODERATOR' || req.user!.role === 'ADMIN';

    if (!isClaimant && !isStaff) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied to this claim.' },
      });
      return;
    }

    res.json({ claim: isClaimant ? claim : { ...claim, handover_code: null } });
  } catch (err: unknown) {
    console.error('Get claim error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to retrieve claim.' } });
  }
});

// POST /api/claims/:id/handover/confirm - Claimant confirms receipt; finder enters the claimant's code
router.post(
  '/:id/handover/confirm',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid claim ID format.' },
        });
        return;
      }
      const existingClaim = await getClaimById(req.params.id);
      if (!existingClaim) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Claim not found.' } });
        return;
      }

      const claimItem = await getItemById(existingClaim.item_id);
      if (!claimItem) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found.' } });
        return;
      }

      const isFinder = claimItem.owner_id === req.user!.userId;
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (isFinder && !/^\d{6}$/.test(code)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'A valid 6-digit handover code is required for the finder.' },
        });
        return;
      }

      const claim = await confirmHandover(req.params.id, req.user!.userId, isFinder ? code : undefined);
      const safeClaim = isFinder ? { ...claim, handover_code: null } : claim;
      const complete = Boolean(claim.claimant_confirmed_at && claim.finder_confirmed_at);
      res.json({
        message: complete
          ? 'Handover confirmed by both parties. Item marked as RESOLVED.'
          : 'Your handover confirmation was recorded. Waiting for the other party.',
        claim: safeClaim,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to confirm handover.';
      res.status(400).json({ error: { code: 'HANDOVER_CONFIRMATION_ERROR', message: msg } });
    }
  }
);

// POST /api/claims/:id/approve - Approve claim (Moderator or Admin only)
router.post(
  '/:id/approve',
  requireAuth,
  requireRole(['MODERATOR', 'ADMIN']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid claim ID format.' },
        });
        return;
      }

      const { moderator_note } = req.body;
      const cleanNote = moderator_note ? sanitizeString(moderator_note) : undefined;

      const approved = await approveClaim(
        req.params.id,
        req.user!.userId,
        cleanNote
      );

      res.json({
        message: 'Claim successfully approved. Item moved to MATCHED and contacts unlocked.',
        claim: { ...approved, handover_code: null },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve claim.';
      res.status(400).json({
        error: { code: 'APPROVAL_ERROR', message: msg },
      });
    }
  }
);

// POST /api/claims/:id/reject - Reject claim (Moderator or Admin only)
router.post(
  '/:id/reject',
  requireAuth,
  requireRole(['MODERATOR', 'ADMIN']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid claim ID format.' },
        });
        return;
      }

      const { moderator_note } = req.body;
      const cleanNote = sanitizeString(moderator_note);
      if (cleanNote.length < 3) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A rejection reason / moderator note is required for transparency.',
          },
        });
        return;
      }

      const rejected = await rejectClaim(
        req.params.id,
        req.user!.userId,
        cleanNote
      );

      res.json({
        message: 'Claim rejected.',
        claim: rejected,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reject claim.';
      res.status(400).json({
        error: { code: 'REJECTION_ERROR', message: msg },
      });
    }
  }
);

export default router;
