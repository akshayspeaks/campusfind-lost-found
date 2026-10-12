import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../auth/auth.js';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notificationService.js';
import { isValidId } from '../utils/validators.js';

const router = Router();

// GET /api/notifications
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const notifications = await getUserNotifications(req.user!.userId);
    const unreadCount = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unread_count: unreadCount });
  } catch (err: unknown) {
    console.error('Notifications error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve notifications.' },
    });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid notification ID format.' },
      });
      return;
    }

    await markNotificationAsRead(req.params.id, req.user!.userId);
    res.json({ message: 'Marked as read.' });
  } catch (err: unknown) {
    console.error('Mark notification read error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to update notification.' },
    });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await markAllNotificationsAsRead(req.user!.userId);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err: unknown) {
    console.error('Mark all read error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Failed to update notifications.' },
    });
  }
});

export default router;
