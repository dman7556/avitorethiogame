import prisma from '../lib/prisma';
import { AuditAction } from '@sky-rush/shared';

export class AuditService {
  /**
   * Create an audit log entry
   * IMPORTANT: Audit logs are immutable - never update or delete
   */
  async log(data: {
    adminId: string;
    action: AuditAction;
    targetUserId?: string;
    targetId?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      const auditLog = await prisma.adminAuditLog.create({
        data: {
          adminId: data.adminId,
          action: data.action,
          targetUserId: data.targetUserId,
          targetId: data.targetId,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });

      console.log(`[AUDIT] ${data.action} by admin ${data.adminId}${data.targetUserId ? ` on user ${data.targetUserId}` : ''}`);

      return auditLog;
    } catch (error) {
      console.error('[AUDIT] Failed to create audit log:', error);
      // Don't throw - audit failure shouldn't break operations
      // But log it prominently
    }
  }

  /**
   * Get audit logs with filters
   */
  async getLogs(options: {
    adminId?: string;
    action?: AuditAction;
    targetUserId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const { adminId, action, targetUserId, startDate, endDate, limit = 50, offset = 0 } = options;

    const where: any = {};
    if (adminId) where.adminId = adminId;
    if (action) where.action = action;
    if (targetUserId) where.targetUserId = targetUserId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          targetUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        adminId: log.adminId,
        admin: log.admin,
        action: log.action,
        targetUserId: log.targetUserId,
        targetUser: log.targetUser,
        targetId: log.targetId,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Shortcut methods for common actions
   */

  async logDepositApproved(
    adminId: string,
    depositId: string,
    userId: string,
    amount: number,
    ipAddress?: string,
    reason?: string,
    dualControl?: { requestedBy: string } | null
  ) {
    return this.log({
      adminId,
      action: AuditAction.DEPOSIT_APPROVED,
      targetUserId: userId,
      targetId: depositId,
      metadata: {
        amount,
        // H1: every approval carries its reason; out-of-envelope credits also
        // record both admins so the full dual-control chain is reconstructable.
        ...(reason ? { reason } : {}),
        ...(dualControl ? { dualControl: { requestedBy: dualControl.requestedBy, approvedBy: adminId } } : {}),
      },
      ipAddress,
    });
  }

  async logDepositRejected(adminId: string, depositId: string, userId: string, reason: string, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.DEPOSIT_REJECTED,
      targetUserId: userId,
      targetId: depositId,
      metadata: { reason },
      ipAddress,
    });
  }

  async logWithdrawalApproved(adminId: string, withdrawalId: string, userId: string, amount: number, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.WITHDRAWAL_APPROVED,
      targetUserId: userId,
      targetId: withdrawalId,
      metadata: { amount },
      ipAddress,
    });
  }

  async logWithdrawalRejected(adminId: string, withdrawalId: string, userId: string, reason: string, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.WITHDRAWAL_REJECTED,
      targetUserId: userId,
      targetId: withdrawalId,
      metadata: { reason },
      ipAddress,
    });
  }

  async logBalanceCredited(adminId: string, userId: string, amount: number, reason: string, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.BALANCE_CREDITED,
      targetUserId: userId,
      metadata: { amount, reason },
      ipAddress,
    });
  }

  async logBalanceDebited(adminId: string, userId: string, amount: number, reason: string, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.BALANCE_DEBITED,
      targetUserId: userId,
      metadata: { amount, reason },
      ipAddress,
    });
  }

  async logUserSuspended(adminId: string, userId: string, reason?: string, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.USER_SUSPENDED,
      targetUserId: userId,
      metadata: reason ? { reason } : undefined,
      ipAddress,
    });
  }

  async logUserReactivated(adminId: string, userId: string, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.USER_REACTIVATED,
      targetUserId: userId,
      ipAddress,
    });
  }

  async logSettingsChanged(adminId: string, changes: Record<string, any>, ipAddress?: string) {
    return this.log({
      adminId,
      action: AuditAction.SETTINGS_CHANGED,
      metadata: changes,
      ipAddress,
    });
  }

  async logAdminLogin(adminId: string, ipAddress?: string, userAgent?: string) {
    return this.log({
      adminId,
      action: AuditAction.ADMIN_LOGIN,
      ipAddress,
      userAgent,
    });
  }
}

export const auditService = new AuditService();
