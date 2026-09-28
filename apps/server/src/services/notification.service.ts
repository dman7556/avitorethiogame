import prisma from '../lib/prisma';
import { NotificationType } from '../shared/types';

export class NotificationService {
  /**
   * Create a notification for a user
   */
  async createNotification(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
      });

      console.log(`[NOTIFICATION] Created for user ${data.userId}: ${data.title}`);
      
      return notification;
    } catch (error) {
      console.error('[NOTIFICATION] Failed to create notification:', error);
      // Don't throw - notification failure shouldn't break operations
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId: string, limit = 20, offset = 0) {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return {
      notifications: notifications.map((n) => ({
        ...n,
        metadata: n.metadata ? JSON.parse(n.metadata) : null,
      })),
      total,
      unreadCount: await this.getUnreadCount(userId),
    };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        isRead: true,
      },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }
}

export const notificationService = new NotificationService();
