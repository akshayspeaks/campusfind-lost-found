import { Router, Response } from 'express';
import { requireAuth, requireRole, AuthenticatedRequest } from '../auth/auth.js';
import { query } from '../database.js';
import { getAuditLogs, logAudit } from '../services/auditService.js';
import { getHighConfidenceMatches } from '../services/matchingService.js';
import { updateItemStatus, getItemById } from '../services/itemService.js';
import { listClaimsForModerator } from '../services/claimService.js';
import { ItemStatus } from '../models/types.js';
import { isValidId, sanitizeString } from '../utils/validators.js';

const router = Router();

// GET /api/admin/dashboard - Overview for moderators/admins
router.get(
  '/dashboard',
  requireAuth,
  requireRole(['MODERATOR', 'ADMIN']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const openItemsCount = Number(
        (await query<{ count: number | string }>(`SELECT COUNT(*) as count FROM items WHERE status = 'OPEN'`))[0]?.count || 0
      );

      const matchedItemsCount = Number(
        (await query<{ count: number | string }>(`SELECT COUNT(*) as count FROM items WHERE status = 'MATCHED'`))[0]?.count || 0
      );

      const resolvedItemsCount = Number(
        (await query<{ count: number | string }>(`SELECT COUNT(*) as count FROM items WHERE status = 'RESOLVED'`))[0]?.count || 0
      );

      const pendingClaimsCount = Number(
        (await query<{ count: number | string }>(`SELECT COUNT(*) as count FROM claims WHERE status = 'PENDING'`))[0]?.count || 0
      );

      const pendingClaims = await listClaimsForModerator('PENDING');
      const highConfidenceMatches = await getHighConfidenceMatches(15);
      const auditLogs = await getAuditLogs(20);

      res.json({
        stats: {
          open_items: openItemsCount,
          matched_items: matchedItemsCount,
          resolved_items: resolvedItemsCount,
          pending_claims: pendingClaimsCount,
        },
        pending_claims: pendingClaims,
        high_confidence_matches: highConfidenceMatches,
        recent_audit_logs: auditLogs,
      });
    } catch (err: unknown) {
      console.error('Admin dashboard error:', err);
      res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to retrieve admin dashboard stats.' },
      });
    }
  }
);

// GET /api/admin/audit-logs
router.get(
  '/audit-logs',
  requireAuth,
  requireRole(['MODERATOR', 'ADMIN']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const logs = await getAuditLogs(50);
      res.json({ audit_logs: logs });
    } catch (err: unknown) {
      console.error('Audit logs error:', err);
      res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to retrieve audit logs.' },
      });
    }
  }
);

// POST /api/admin/items/:id/status - Moderator manual state transition (e.g. mark RESOLVED after in-person return)
router.post(
  '/items/:id/status',
  requireAuth,
  requireRole(['MODERATOR', 'ADMIN']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!isValidId(req.params.id)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid item ID format.' },
        });
        return;
      }

      const { status, note } = req.body;
      if (!['OPEN', 'MATCHED', 'RESOLVED'].includes(status)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid status transition.' },
        });
        return;
      }

      const item = await getItemById(req.params.id);
      if (!item) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found.' } });
        return;
      }

      const cleanNote = note ? sanitizeString(note) : `Status changed by moderator to ${status}`;

      const updated = await updateItemStatus(item.id, status as ItemStatus);
      await logAudit(
        'ITEM_STATUS_CHANGED',
        req.user!.userId,
        `Item ${item.id} -> ${status}`,
        cleanNote
      );

      res.json({
        message: `Item status updated to ${status}.`,
        item: updated,
      });
    } catch (err: unknown) {
      console.error('Update item status error:', err);
      res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to update item status.' },
      });
    }
  }
);

export default router;
