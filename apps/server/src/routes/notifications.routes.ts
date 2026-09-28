import { Router, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get user notifications
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await notificationService.getUserNotifications(req.user.userId, limit, offset);

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[NOTIFICATION] Get notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to get notifications' });
  }
});

// Mark notification as read
router.post('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    await notificationService.markAsRead(req.params.id, req.user.userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[NOTIFICATION] Mark as read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.post('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    await notificationService.markAllAsRead(req.user.userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[NOTIFICATION] Mark all as read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notifications as read' });
  }
});

export default router;
