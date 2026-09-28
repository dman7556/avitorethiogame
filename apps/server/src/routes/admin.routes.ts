import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { depositService, DepositError } from '../services/deposit.service';
import { withdrawalService, WithdrawalError } from '../services/withdrawal.service';
import { auditService } from '../services/audit.service';
import { settingsService } from '../services/settings.service';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditAction, DepositStatus, WithdrawalStatus } from '@sky-rush/shared';
import { money } from '../services/money.helper';

const router = Router();

// ==================== ADMIN ENDPOINTS (REQUIRE AUTH) ====================

// Apply auth + admin middleware to all routes below
router.use(authenticate, requireAdmin);

// Dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers,
      activeUsers,
      pendingDeposits,
      pendingWithdrawals,
      totalDeposited,
      totalWithdrawn,
      totalBetVolume,
      totalPayouts,
      walletAgg,
      totalBetsCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      depositService.getPendingCount(),
      withdrawalService.getPendingCount(),
      depositService.getTotalDeposited(),
      withdrawalService.getTotalWithdrawn(),
      prisma.bet.aggregate({
        _sum: { amount: true },
        where: { status: { in: ['ACTIVE', 'CASHED_OUT', 'LOST'] } },
      }),
      prisma.bet.aggregate({
        _sum: { payout: true },
        where: { status: 'CASHED_OUT' },
      }),
      prisma.wallet.aggregate({
        _sum: { balance: true, reserved: true },
      }),
      prisma.bet.count({
        where: { status: { in: ['ACTIVE', 'CASHED_OUT', 'LOST'] } },
      }),
    ]);

    const totalPayoutVal = Number(totalPayouts._sum.payout) || 0;
    const totalBetVolumeVal = Number(totalBetVolume._sum.amount) || 0;
    const totalBalance = Number(walletAgg._sum.balance) || 0;
    const totalReserved = Number(walletAgg._sum.reserved) || 0;
    const totalAvailableBalance = totalBalance;
    const platformBalance = totalDeposited - totalWithdrawn - totalPayoutVal;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        pendingDeposits,
        pendingWithdrawals,
        totalDeposited,
        totalWithdrawn,
        totalBetVolume: totalBetVolumeVal,
        totalBetsCount,
        totalPayouts: totalPayoutVal,
        platformBalance,
        totalAvailableBalance,
        totalReservedBalance: totalReserved,
        totalUserFunds: totalBalance + totalReserved,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to get dashboard statistics' });
  }
});

// Users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;
    const role = req.query.role as string;
    const isActive = req.query.isActive as string;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          wallet: {
            select: { balance: true, reserved: true, currency: true },
          },
          _count: { select: { bets: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          balance: u.wallet ? Number(u.wallet.balance) : 0,
          reserved: u.wallet ? Number(u.wallet.reserved) : 0,
          totalBets: u._count.bets,
          createdAt: u.createdAt.toISOString(),
          lastLogin: u.lastLogin?.toISOString(),
        })),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

// Get user by ID with detailed info
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        wallet: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Get user statistics
    const [deposits, withdrawals, bets, winnings] = await Promise.all([
      await depositService.getUserTotalDeposits(user.id),
      await withdrawalService.getUserTotalWithdrawals(user.id),
      prisma.bet.aggregate({
        where: { userId: user.id, status: { in: ['ACTIVE', 'CASHED_OUT', 'LOST'] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.bet.aggregate({
        where: { userId: user.id, status: 'CASHED_OUT' },
        _sum: { payout: true },
      }),
    ]);

    const totalWagered = Number(bets._sum.amount) || 0;
    const totalWinnings = Number(winnings._sum.payout) || 0;
    const totalLosses = totalWagered - totalWinnings;

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          lastLogin: user.lastLogin?.toISOString(),
        },
        wallet: user.wallet
          ? {
              balance: Number(user.wallet.balance),
              reserved: Number(user.wallet.reserved),
              currency: user.wallet.currency,
            }
          : null,
        statistics: {
          totalDeposits: deposits,
          totalWithdrawals: withdrawals,
          totalBets: bets._count,
          totalWagered,
          totalWinnings,
          totalLosses,
          netProfit: totalWinnings - totalWagered,
        },
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Get user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user details' });
  }
});

// ==================== DEPOSIT MANAGEMENT ====================

// Get all deposits
router.get('/deposits', async (req: Request, res: Response) => {
  try {
    console.log('[ADMIN] Get deposits request:', { query: req.query });
    
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as DepositStatus;
    const userId = req.query.userId as string;

    const result = await depositService.getAllDeposits({
      status,
      userId,
      search: (req.query.search as string) || undefined,
      dateFrom: (req.query.dateFrom as string) || undefined,
      dateTo: (req.query.dateTo as string) || undefined,
      sort: (req.query.sort as 'newest' | 'oldest' | 'amount') || undefined,
      limit,
      offset,
    });

    console.log(`[ADMIN] Returning ${result.deposits.length} deposits (total: ${result.total})`);
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ADMIN] Get deposits error:', error);
    res.status(500).json({ success: false, error: 'Failed to get deposits' });
  }
});

// Get deposit by ID
router.get('/deposits/:id', async (req: Request, res: Response) => {
  try {
    const deposit = await depositService.getDepositById(req.params.id);
    res.json({ success: true, data: deposit });
  } catch (error: any) {
    if (error.code === 'DEPOSIT_NOT_FOUND') {
      res.status(404).json({ success: false, error: error.message, code: error.code });
    } else {
      console.error('[ADMIN] Get deposit error:', error);
      res.status(500).json({ success: false, error: 'Failed to get deposit' });
    }
  }
});

// Approve deposit
const approveDepositSchema = z.object({
  creditAmount: z.number().positive('Credit amount must be positive'),
  reason: z.string().min(4, 'An approval reason is required').max(500),
});

router.post('/deposits/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const body = approveDepositSchema.parse(req.body);
    
    const result = await depositService.approveDeposit({
      depositId: req.params.id,
      adminId: req.user!.userId,
      creditAmount: body.creditAmount,
      ipAddress: req.ip,
      reason: body.reason,
    });

    // Get io instance from app
    const io = req.app.locals.io;

    // Real-time: tell the user their balance changed
    io.to(`user:${result.userId}`).emit('deposit:approved', {
      depositId: result.depositId,
      creditedAmount: result.creditAmount,
      newBalance: result.newBalance,
      message: `Your deposit of ${result.creditAmount.toFixed(2)} ETB has been approved!`,
      timestamp: new Date().toISOString(),
    });
    io.to(`user:${result.userId}`).emit('wallet:updated', {
      balance: result.newBalance,
      reserved: undefined,
    });

    // Real-time: admin dashboards update immediately
    io.to('admin').emit('admin:deposit_approved', {
      depositId: result.depositId,
      userId: result.userId,
      creditedAmount: result.creditAmount,
      newBalance: result.newBalance,
      adminId: req.user!.userId,
      timestamp: new Date().toISOString(),
    });
    io.to('admin').emit('admin:stats_updated');

    res.json({
      success: true,
      data: {
        depositId: result.depositId,
        oldBalance: result.balanceBefore,
        newBalance: result.newBalance,
        creditedAmount: result.creditAmount,
      },
    });
  } catch (error: any) {
    if (error instanceof DepositError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
    } else if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      console.error('[ADMIN] Approve deposit error:', error);
      res.status(500).json({ success: false, error: 'Failed to approve deposit' });
    }
  }
});

// ── H1 dual control: pending out-of-envelope credit requests ──
// Second admins review and act on these; a requester can never finalize
// their own request (enforced in deposit.service.approveDeposit).
router.get('/deposits/overrides/pending', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const pending = await prisma.deposit.findMany({
      where: {
        status: 'PENDING',
        overrideRequestedBy: { not: null },
        overrideApprovedBy: null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { overrideRequestedAt: 'desc' },
      take: 100,
    });
    res.json({
      success: true,
      data: pending.map((d) => ({
        depositId: d.id,
        user: d.user,
        submittedAmount: Number(d.submittedAmount),
        requestedCredit: Number(d.overrideAmount),
        reason: d.overrideReason,
        requestedBy: d.overrideRequestedBy,
        requestedAt: d.overrideRequestedAt?.toISOString() || null,
        paymentMethod: d.paymentMethod,
      })),
    });
  } catch (error) {
    console.error('[ADMIN] Pending overrides error:', error);
    res.status(500).json({ success: false, error: 'Failed to list pending overrides' });
  }
});

// Second admin REJECTS a pending override request (deposit returns to the
// normal envelope flow — the requesting admin may re-request lower).
router.post('/deposits/:id/overrides/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const body = z.object({ reason: z.string().min(4).max(500) }).parse(req.body);
    const updated = await prisma.deposit.updateMany({
      where: {
        id: req.params.id,
        status: 'PENDING',
        overrideRequestedBy: { not: null },
        overrideApprovedBy: null,
      },
      data: {
        overrideRequestedBy: null,
        overrideRequestedAt: null,
        overrideAmount: null,
        overrideReason: null,
      },
    });
    if (updated.count === 0) {
      return res.status(404).json({ success: false, error: 'No pending override found for this deposit' });
    }
    const deposit = await prisma.deposit.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { userId: true, overrideAmount: true },
    });
    await auditService.log({
      adminId: req.user!.userId,
      action: AuditAction.DEPOSIT_OVERRIDE_REJECTED,
      targetUserId: deposit.userId,
      targetId: req.params.id,
      metadata: { requestedAmount: Number(deposit.overrideAmount ?? 0), reason: body.reason },
      ipAddress: req.ip,
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid request data' });
    }
    console.error('[ADMIN] Override reject error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject override' });
  }
});

// Reject deposit
const rejectDepositSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});

router.post('/deposits/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const body = rejectDepositSchema.parse(req.body);
    
    const result = await depositService.rejectDeposit({
      depositId: req.params.id,
      adminId: req.user!.userId,
      reason: body.reason,
      ipAddress: req.ip,
    });

    // Get io instance from app
    const io = req.app.locals.io;

    // Real-time: user sees the rejection immediately
    io.to(`user:${result.userId}`).emit('deposit:rejected', {
      depositId: result.depositId,
      reason: result.rejectionReason,
      message: `Your deposit has been rejected. Reason: ${result.rejectionReason}`,
      timestamp: new Date().toISOString(),
    });

    // Real-time: admin views update immediately
    io.to('admin').emit('admin:deposit_rejected', {
      depositId: result.depositId,
      userId: result.userId,
      reason: result.rejectionReason,
      adminId: req.user!.userId,
      timestamp: new Date().toISOString(),
    });
    io.to('admin').emit('admin:stats_updated');

    res.json({
      success: true,
      data: {
        depositId: result.depositId,
        status: result.status,
        rejectionReason: result.rejectionReason,
      },
    });
  } catch (error: any) {
    if (error instanceof DepositError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
    } else if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      console.error('[ADMIN] Reject deposit error:', error);
      res.status(500).json({ success: false, error: 'Failed to reject deposit' });
    }
  }
});

// ==================== WITHDRAWAL MANAGEMENT ====================

// Get all withdrawals
router.get('/withdrawals', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as WithdrawalStatus;
    const userId = req.query.userId as string;

    const result = await withdrawalService.getAllWithdrawals({
      status,
      userId,
      search: (req.query.search as string) || undefined,
      dateFrom: (req.query.dateFrom as string) || undefined,
      dateTo: (req.query.dateTo as string) || undefined,
      sort: (req.query.sort as 'newest' | 'oldest' | 'amount') || undefined,
      limit,
      offset,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ADMIN] Get withdrawals error:', error);
    res.status(500).json({ success: false, error: 'Failed to get withdrawals' });
  }
});

// Get withdrawal by ID
router.get('/withdrawals/:id', async (req: Request, res: Response) => {
  try {
    const withdrawal = await withdrawalService.getWithdrawalById(req.params.id);
    res.json({ success: true, data: withdrawal });
  } catch (error: any) {
    if (error.code === 'WITHDRAWAL_NOT_FOUND') {
      res.status(404).json({ success: false, error: error.message, code: error.code });
    } else {
      console.error('[ADMIN] Get withdrawal error:', error);
      res.status(500).json({ success: false, error: 'Failed to get withdrawal' });
    }
  }
});

// Approve withdrawal
router.post('/withdrawals/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const result = await withdrawalService.approveWithdrawal({
      withdrawalId: req.params.id,
      adminId: req.user!.userId,
      ipAddress: req.ip,
    });

    // Real-time: user sees the approval and cleared reservation
    const io = req.app.locals.io;
    io.to(`user:${result.userId}`).emit('withdrawal:approved', {
      withdrawalId: result.withdrawalId,
      amount: result.amount,
      balance: result.newBalance,
      reserved: result.newReserved,
      message: `Your withdrawal of ${result.amount.toFixed(2)} ETB has been approved.`,
      timestamp: new Date().toISOString(),
    });
    io.to(`user:${result.userId}`).emit('wallet:updated', {
      balance: result.newBalance,
      reserved: result.newReserved,
    });

    // Real-time: admin views update immediately
    io.to('admin').emit('admin:withdrawal_approved', {
      withdrawalId: result.withdrawalId,
      userId: result.userId,
      amount: result.amount,
      adminId: req.user!.userId,
      timestamp: new Date().toISOString(),
    });
    io.to('admin').emit('admin:stats_updated');

    res.json({
      success: true,
      data: {
        withdrawalId: result.withdrawalId,
        oldBalance: result.balanceBefore,
        newBalance: result.newBalance,
        amount: result.amount,
      },
    });
  } catch (error: any) {
    if (error instanceof WithdrawalError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
    } else {
      console.error('[ADMIN] Approve withdrawal error:', error);
      res.status(500).json({ success: false, error: 'Failed to approve withdrawal' });
    }
  }
});

// Reject withdrawal
const rejectWithdrawalSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});

router.post('/withdrawals/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const body = rejectWithdrawalSchema.parse(req.body);
    
    const result = await withdrawalService.rejectWithdrawal({
      withdrawalId: req.params.id,
      adminId: req.user!.userId,
      reason: body.reason,
      ipAddress: req.ip,
    });

    // Real-time: user sees rejection + released reservation
    const io = req.app.locals.io;
    io.to(`user:${result.userId}`).emit('withdrawal:rejected', {
      withdrawalId: result.withdrawalId,
      amount: result.amount,
      reason: result.rejectionReason,
      balance: result.newBalance,
      reserved: result.newReserved,
      message: `Your withdrawal of ${result.amount.toFixed(2)} ETB was rejected. Reserved funds returned to your balance.`,
      timestamp: new Date().toISOString(),
    });
    io.to(`user:${result.userId}`).emit('wallet:updated', {
      balance: result.newBalance,
      reserved: result.newReserved,
    });

    // Real-time: admin views update immediately
    io.to('admin').emit('admin:withdrawal_rejected', {
      withdrawalId: result.withdrawalId,
      userId: result.userId,
      amount: result.amount,
      reason: result.rejectionReason,
      adminId: req.user!.userId,
      timestamp: new Date().toISOString(),
    });
    io.to('admin').emit('admin:stats_updated');

    res.json({
      success: true,
      data: {
        withdrawalId: result.withdrawalId,
        status: 'REJECTED',
        rejectionReason: result.rejectionReason,
        refundedAmount: result.refundedAmount,
      },
    });
  } catch (error: any) {
    if (error instanceof WithdrawalError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
    } else if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      console.error('[ADMIN] Reject withdrawal error:', error);
      res.status(500).json({ success: false, error: 'Failed to reject withdrawal' });
    }
  }
});

// ==================== USER MANAGEMENT ====================

// Credit user balance
const creditBalanceSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

router.post('/users/:id/credit', async (req: AuthRequest, res: Response) => {
  try {
    const body = creditBalanceSchema.parse(req.body);
    const userId = req.params.id;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      res.status(404).json({ success: false, error: 'Wallet not found', code: 'WALLET_NOT_FOUND' });
      return;
    }

    const currentBalance = Number(wallet.balance);
    const newBalance = new Decimal(currentBalance).add(new Decimal(body.amount));

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADMIN_CREDIT',
          amount: new Decimal(body.amount),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: newBalance,
          description: `Admin credit: ${body.reason}`,
          processedBy: req.user!.userId,
          status: 'COMPLETED',
        },
      });

      return {
        oldBalance: currentBalance,
        newBalance: Number(newBalance),
      };
    });

    // Audit log
    await auditService.logBalanceCredited(
      req.user!.userId,
      userId,
      body.amount,
      body.reason,
      req.ip
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      console.error('[ADMIN] Credit balance error:', error);
      res.status(500).json({ success: false, error: 'Failed to credit balance' });
    }
  }
});

// Debit user balance
const debitBalanceSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

router.post('/users/:id/debit', async (req: AuthRequest, res: Response) => {
  try {
    const body = debitBalanceSchema.parse(req.body);
    const userId = req.params.id;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      res.status(404).json({ success: false, error: 'Wallet not found', code: 'WALLET_NOT_FOUND' });
      return;
    }

    const currentBalance = Number(wallet.balance);
    
    // Prevent negative balance
    if (currentBalance < body.amount) {
      res.status(400).json({ 
        success: false, 
        error: `Insufficient balance. Current: ${currentBalance}, Requested debit: ${body.amount}`,
        code: 'INSUFFICIENT_BALANCE',
      });
      return;
    }

    const newBalance = new Decimal(currentBalance).sub(new Decimal(body.amount));

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADMIN_DEBIT',
          amount: new Decimal(-body.amount),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: newBalance,
          description: `Admin debit: ${body.reason}`,
          processedBy: req.user!.userId,
          status: 'COMPLETED',
        },
      });

      return {
        oldBalance: currentBalance,
        newBalance: Number(newBalance),
      };
    });

    // Audit log
    await auditService.logBalanceDebited(
      req.user!.userId,
      userId,
      body.amount,
      body.reason,
      req.ip
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      console.error('[ADMIN] Debit balance error:', error);
      res.status(500).json({ success: false, error: 'Failed to debit balance' });
    }
  }
});

// Set user balance to zero (for testing)
router.post('/users/:id/set-balance-zero', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      res.status(404).json({ success: false, error: 'Wallet not found', code: 'WALLET_NOT_FOUND' });
      return;
    }

    const currentBalance = Number(wallet.balance);

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId },
        data: { balance: new Decimal(0) },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADMIN_DEBIT',
          amount: new Decimal(-currentBalance),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: new Decimal(0),
          description: `Admin: Balance set to zero for testing`,
          processedBy: req.user!.userId,
          status: 'COMPLETED',
        },
      });

      return {
        oldBalance: currentBalance,
        newBalance: 0,
      };
    });

    // Audit log
    await auditService.logBalanceDebited(
      req.user!.userId,
      userId,
      currentBalance,
      'Testing: Balance set to zero',
      req.ip
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[ADMIN] Set balance to zero error:', error);
    res.status(500).json({ success: false, error: 'Failed to set balance' });
  }
});

// Set user balance to zero by email (for testing)
router.post('/reset-user-by-email', async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
      return;
    }

    if (!user.wallet) {
      res.status(404).json({ success: false, error: 'Wallet not found', code: 'WALLET_NOT_FOUND' });
      return;
    }

    const currentBalance = Number(user.wallet.balance);

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: user.wallet!.id },
        data: { balance: new Decimal(0), reserved: new Decimal(0) },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: user.wallet!.id,
          type: 'ADMIN_DEBIT',
          amount: new Decimal(-currentBalance),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: new Decimal(0),
          description: `Admin: Balance reset to zero for testing`,
          processedBy: req.user!.userId,
          status: 'COMPLETED',
        },
      });

      return {
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        oldBalance: currentBalance,
        newBalance: 0,
      };
    });

    console.log(`[ADMIN] Reset balance for user ${user.email} (${user.id}) from ${currentBalance} to 0`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[ADMIN] Reset user by email error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset user balance' });
  }
});

// Set ALL users' balances to zero (for testing) - ADMIN AUTH REQUIRED
router.post('/reset-all-balances', async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[ADMIN] Resetting all user balances to zero by ${req.user!.userId}`);

    // Get all wallets
    const wallets = await prisma.wallet.findMany();
    
    if (wallets.length === 0) {
      res.json({
        success: true,
        data: { message: 'No users to reset', affectedUsers: 0 },
      });
      return;
    }

    // Reset all balances atomically
    const result = await prisma.$transaction(async (tx) => {
      let affectedCount = 0;

      for (const wallet of wallets) {
        const currentBalance = Number(wallet.balance);
        
        if (currentBalance > 0) {
          // Update wallet
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: new Decimal(0), reserved: new Decimal(0) },
          });

          // Create transaction record
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'ADMIN_DEBIT',
              amount: new Decimal(-currentBalance),
              balanceBefore: new Decimal(currentBalance),
              balanceAfter: new Decimal(0),
              description: `Admin: Bulk reset - Balance set to zero for testing`,
              processedBy: req.user!.userId,
              status: 'COMPLETED',
            },
          });

          affectedCount++;
        }
      }

      return affectedCount;
    });

    console.log(`[ADMIN] Reset ${result} user balances to zero`);

    res.json({
      success: true,
      data: {
        message: `Reset ${result} user balances to zero`,
        affectedUsers: result,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Reset all balances error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset all balances' });
  }
});

// Suspend user
router.post('/users/:id/suspend', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const reason = req.body.reason as string;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    await auditService.logUserSuspended(req.user!.userId, userId, reason, req.ip);

    res.json({
      success: true,
      data: {
        userId: user.id,
        isActive: user.isActive,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Suspend user error:', error);
    res.status(500).json({ success: false, error: 'Failed to suspend user' });
  }
});

// Reactivate user
router.post('/users/:id/reactivate', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await auditService.logUserReactivated(req.user!.userId, userId, req.ip);

    res.json({
      success: true,
      data: {
        userId: user.id,
        isActive: user.isActive,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Reactivate user error:', error);
    res.status(500).json({ success: false, error: 'Failed to reactivate user' });
  }
});

// Rounds
router.get('/rounds', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const rounds = await prisma.gameRound.findMany({
      orderBy: { roundNumber: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: { select: { bets: true } },
      },
    });

    res.json({
      success: true,
      data: rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        phase: r.phase,
        crashPoint: r.crashPoint ? Number(r.crashPoint) : null,
        totalBets: r._count.bets,
        startedAt: r.startedAt?.toISOString(),
        crashedAt: r.crashedAt?.toISOString(),
        settledAt: r.settledAt?.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get rounds' });
  }
});

// Bets
router.get('/bets', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = req.query.userId as string;
    const status = req.query.status as string;

    const where: any = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [bets, total] = await Promise.all([
      prisma.bet.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          round: { select: { roundNumber: true, crashPoint: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.bet.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        bets: bets.map((b) => ({
          id: b.id,
          userId: b.userId,
          userName: b.user.name,
          userEmail: b.user.email,
          roundNumber: b.round.roundNumber,
          crashPoint: b.round.crashPoint ? Number(b.round.crashPoint) : null,
          slot: b.slot,
          amount: Number(b.amount),
          status: b.status,
          cashoutMultiplier: b.cashoutMultiplier ? Number(b.cashoutMultiplier) : null,
          payout: b.payout ? Number(b.payout) : null,
          autoCashout: b.autoCashout ? Number(b.autoCashout) : null,
          placedAt: b.placedAt?.toISOString(),
          cashedOutAt: b.cashedOutAt?.toISOString(),
          createdAt: b.createdAt.toISOString(),
        })),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get bets' });
  }
});

// Transactions
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = req.query.userId as string;
    const type = req.query.type as string;

    const where: any = {};
    if (type) where.type = type;
    
    // Filter by userId if provided
    let walletIds: string[] | undefined;
    if (userId) {
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (wallet) {
        where.walletId = wallet.id;
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        include: {
          wallet: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          userName: t.wallet.user.name,
          userEmail: t.wallet.user.email,
          type: t.type,
          amount: Number(t.amount),
          balanceBefore: Number(t.balanceBefore),
          balanceAfter: Number(t.balanceAfter),
          status: t.status,
          description: t.description,
          referenceId: t.referenceId,
          processedBy: t.processedBy,
          createdAt: t.createdAt.toISOString(),
        })),
        total,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Get transactions error:', error);
    res.status(500).json({ success: false, error: 'Failed to get transactions' });
  }
});

// Wallets / Financial Breakdown
router.get('/wallets', async (req: Request, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { balance: 'desc' },
    });

    const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);
    const totalReserved = wallets.reduce((sum, w) => sum + Number(w.reserved), 0);
    const walletsCount = wallets.length;
    const walletsPositive = wallets.filter(w => Number(w.balance) > 0).length;

    res.json({
      success: true,
      data: {
        wallets: wallets.map((w) => ({
          userId: w.userId,
          userName: w.user.name,
          userEmail: w.user.email,
          userActive: w.user.isActive,
          balance: Number(w.balance),
          reserved: Number(w.reserved),
          currency: w.currency,
          lastTransaction: w.transactions[0]
            ? {
                type: w.transactions[0].type,
                amount: Number(w.transactions[0].amount),
                description: w.transactions[0].description,
                createdAt: w.transactions[0].createdAt.toISOString(),
              }
            : null,
        })),
        summary: {
          totalBalance,
          totalReserved,
          walletsCount,
          walletsPositive,
        },
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Get wallets error:', error);
    res.status(500).json({ success: false, error: 'Failed to get wallets' });
  }
});

// User wallet transactions (ledger)
router.get('/users/:id/transactions', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      res.status(404).json({ success: false, error: 'Wallet not found' });
      return;
    }

    const where: any = { walletId: wallet.id };
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          balanceBefore: Number(t.balanceBefore),
          balanceAfter: Number(t.balanceAfter),
          status: t.status,
          description: t.description,
          referenceId: t.referenceId,
          processedBy: t.processedBy,
          createdAt: t.createdAt.toISOString(),
        })),
        wallet: {
          balance: Number(wallet.balance),
          reserved: Number(wallet.reserved),
          currency: wallet.currency,
        },
        total,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Get user transactions error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user transactions' });
  }
});

// Audit logs
router.get('/audit-logs', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const adminId = req.query.adminId as string;
    const action = req.query.action as string;
    const targetUserId = req.query.targetUserId as string;

    const result = await auditService.getLogs({
      adminId,
      action: action as any,
      targetUserId,
      limit,
      offset,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ADMIN] Get audit logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to get audit logs' });
  }
});

// Get system settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await settingsService.getSettings();
    res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('[ADMIN] Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// Update system settings
router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await settingsService.updateSettings(req.body, req.user!.userId);
    
    // Audit log
    await auditService.logSettingsChanged(req.user!.userId, req.body, req.ip);

    res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('[ADMIN] Update settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Game events
router.get('/events', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const events = await prisma.gameEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      success: true,
      data: events.map((e) => ({
        id: e.id,
        roundId: e.roundId,
        type: e.type,
        data: e.data,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get events' });
  }
});

// ==================== PAYMENT METHODS ====================

// Get payment methods (admin only, includes disabled)
router.get('/payment-methods', async (req: Request, res: Response) => {
  try {
    const { paymentMethodsService } = await import('../services/payment-methods.service');
    const methods = await paymentMethodsService.getAllPaymentMethods(true);
    res.json({ success: true, data: methods });
  } catch (error: any) {
    console.error('[ADMIN] Get payment methods error:', error);
    res.status(500).json({ success: false, error: 'Failed to get payment methods' });
  }
});

// Create payment method
const createPaymentMethodSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  account: z.string().min(1),
  instructions: z.string().min(1),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  enabled: z.boolean().optional(),
});

router.post('/payment-methods', async (req: AuthRequest, res: Response) => {
  try {
    const body = createPaymentMethodSchema.parse(req.body);
    const { paymentMethodsService } = await import('../services/payment-methods.service');
    const method = await paymentMethodsService.createPaymentMethod({
      ...body,
      createdBy: req.user!.userId,
    });
    res.json({ success: true, data: method });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      console.error('[ADMIN] Create payment method error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create payment method' });
    }
  }
});

// Update payment method
const updatePaymentMethodSchema = z.object({
  account: z.string().optional(),
  instructions: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  enabled: z.boolean().optional(),
});

router.patch('/payment-methods/:id', async (req: AuthRequest, res: Response) => {
  try {
    const body = updatePaymentMethodSchema.parse(req.body);
    const { paymentMethodsService } = await import('../services/payment-methods.service');
    const method = await paymentMethodsService.updatePaymentMethod(req.params.id, {
      ...body,
      updatedBy: req.user!.userId,
    });
    res.json({ success: true, data: method });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      console.error('[ADMIN] Update payment method error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update payment method' });
    }
  }
});

// Delete payment method
router.delete('/payment-methods/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { paymentMethodsService } = await import('../services/payment-methods.service');
    await paymentMethodsService.deletePaymentMethod(req.params.id);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (error: any) {
    console.error('[ADMIN] Delete payment method error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete payment method' });
  }
});

// ============================================================
// REAL-TIME ANALYTICS / RISK / FAIRNESS APIs (admin-only)
// All data derives from the real database — no mock values.
// ============================================================

import { metricsEngine } from '../analytics/metrics-engine';
import { sessionTracker } from '../analytics/session-tracker';
import { eventPipeline } from '../analytics/event-pipeline';
import { riskEngine } from '../analytics/risk-engine';
import { userProfileService } from '../analytics/user-profile';
import { alertsService, THRESHOLD_KEY, DEFAULT_ALERT_THRESHOLDS } from '../analytics/alerts.service';
import { fairnessService } from '../game/fairness';

// ---- Live platform metrics ----
router.get('/analytics/overview', async (req: AuthRequest, res: Response) => {
  try {
    const payload = await metricsEngine.getDashboardPayload();
    const currentRound = await prisma.gameRound.findFirst({
      where: { phase: { in: ['BETTING', 'FLYING'] } },
      orderBy: { roundNumber: 'desc' },
      include: { _count: { select: { bets: true } } },
    });
    res.json({
      success: true,
      data: {
        ...payload,
        onlineUsers: sessionTracker.getOnlineCount(),
        activeSockets: sessionTracker.getActiveSocketCount(),
        eventQueueDepth: eventPipeline.getQueueDepth(),
        latency: metricsEngine.latencyPercentiles(),
        currentRound: currentRound
          ? {
              id: currentRound.id,
              roundNumber: currentRound.roundNumber,
              phase: currentRound.phase,
              players: currentRound._count.bets,
              serverSeedHash: currentRound.serverSeedHash,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN/ANALYTICS] overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to load analytics' });
  }
});

// ---- Current-round detail (aggregate only — no per-user exposure beyond what admin already sees) ----
router.get('/analytics/current-round', async (req: AuthRequest, res: Response) => {
  try {
    const roundId = req.query.roundId as string | undefined;
    const round = roundId
      ? await prisma.gameRound.findUnique({ where: { id: roundId } })
      : await prisma.gameRound.findFirst({
          where: { phase: { in: ['BETTING', 'FLYING', 'CRASHED'] } },
          orderBy: { roundNumber: 'desc' },
        });
    if (!round) {
      res.json({ success: true, data: null });
      return;
    }
    const agg = await prisma.bet.aggregate({
      where: { roundId: round.id, status: { not: 'CANCELLED' } },
      _count: true,
      _sum: { amount: true, payout: true },
      _min: { amount: true },
      _max: { amount: true },
      _avg: { amount: true },
    });
    const autoCashouts = await prisma.bet.count({
      where: { roundId: round.id, autoCashout: { not: null }, status: { not: 'CANCELLED' } },
    });
    const winners = await prisma.bet.count({ where: { roundId: round.id, status: 'CASHED_OUT' } });
    res.json({
      success: true,
      data: {
        roundId: round.id,
        roundNumber: round.roundNumber,
        phase: round.phase,
        serverSeedHash: round.serverSeedHash,
        serverSeed: round.serverSeed, // null until reveal
        crashPoint: round.crashPoint ? Number(round.crashPoint) : null,
        totalBets: agg._count ?? 0,
        totalWagered: Number(agg._sum.amount ?? 0),
        minBet: agg._min.amount != null ? Number(agg._min.amount) : null,
        maxBet: agg._max.amount != null ? Number(agg._max.amount) : null,
        avgBet: agg._avg.amount != null ? Number(agg._avg.amount) : null,
        totalPayout: Number(agg._sum.payout ?? 0),
        winners,
        losers: Math.max(0, (agg._count ?? 0) - winners),
        autoCashouts,
        manualCashouts: Math.max(0, winners - autoCashouts),
      },
    });
  } catch (error: any) {
    console.error('[ADMIN/ANALYTICS] current-round error:', error);
    res.status(500).json({ success: false, error: 'Failed to load round analytics' });
  }
});

// ---- Alerts center ----
router.get('/alerts', async (req: AuthRequest, res: Response) => {
  try {
    const { resolved = 'false', category, severity, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const where: any = {};
    if (resolved === 'true') where.isResolved = true;
    else if (resolved === 'false') where.isResolved = false;
    if (category) where.category = category;
    if (severity) where.severity = severity;
    const [alerts, total] = await Promise.all([
      prisma.adminAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 200),
        skip: Number(offset),
      }),
      prisma.adminAlert.count({ where }),
    ]);
    res.json({ success: true, data: { alerts, total } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load alerts' });
  }
});

router.post('/alerts/:id/resolve', async (req: AuthRequest, res: Response) => {
  try {
    const alert = await prisma.adminAlert.update({
      where: { id: req.params.id },
      data: { isResolved: true, resolvedBy: req.user!.userId, resolvedAt: new Date() },
    });
    res.json({ success: true, data: alert });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to resolve alert' });
  }
});

// ---- Risk events ----
router.get('/risk-events', async (req: AuthRequest, res: Response) => {
  try {
    const { status, riskLevel, userId, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const where: any = {};
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (userId) where.userId = userId;
    const [events, total] = await Promise.all([
      prisma.riskEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 200),
        skip: Number(offset),
      }),
      prisma.riskEvent.count({ where }),
    ]);
    res.json({ success: true, data: { events, total } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load risk events' });
  }
});

router.post('/risk-events/:id/review', async (req: AuthRequest, res: Response) => {
  try {
    const { status, notes } = req.body as { status?: string; notes?: string };
    if (!status || !['UNDER_REVIEW', 'CLEARED', 'CONFIRMED'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid review status' });
      return;
    }
    const event = await prisma.riskEvent.update({
      where: { id: req.params.id },
      data: { status, reviewedBy: req.user!.userId, reviewedAt: new Date(), reviewNotes: notes ?? null },
    });
    res.json({ success: true, data: event });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to update risk event' });
  }
});

// ---- On-demand risk assessment for one user (explainable) ----
router.get('/users/:id/risk-assessment', async (req: AuthRequest, res: Response) => {
  try {
    const assessment = await riskEngine.assessUser(req.params.id);
    res.json({ success: true, data: assessment });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to assess user' });
  }
});

// ---- User financial/activity profile ----
router.get('/users/:id/profile', async (req: AuthRequest, res: Response) => {
  try {
    const profile = await userProfileService.getProfile(req.params.id);
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load profile' });
  }
});

// ---- User activity timeline ----
router.get('/users/:id/timeline', async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '100', eventType } = req.query as Record<string, string>;
    const timeline = await userProfileService.getTimeline(req.params.id, Number(limit), eventType);
    res.json({ success: true, data: timeline });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load timeline' });
  }
});

// ---- Sessions (live + recent) ----
router.get('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { active = 'true', limit = '50', offset = '0' } = req.query as Record<string, string>;
    const where: any = active === 'true' ? { endedAt: null } : {};
    const [sessions, total] = await Promise.all([
      prisma.userSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: Math.min(Number(limit), 200),
        skip: Number(offset),
        select: {
          id: true, userId: true, startedAt: true, lastActivityAt: true, endedAt: true,
          endReason: true, roundsPlayed: true, betsPlaced: true,
          totalWagered: true, totalPayout: true, ipAddress: true,
        },
      }),
      prisma.userSession.count({ where }),
    ]);
    res.json({
      success: true,
      data: {
        sessions: sessions.map((s) => ({ ...s, totalWagered: Number(s.totalWagered), totalPayout: Number(s.totalPayout) })),
        total,
        liveOnline: sessionTracker.getOnlineCount(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load sessions' });
  }
});

// ---- Fairness: commit + recent verifiable rounds ----
router.get('/fairness/commit', async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: fairnessService.getPublicCommit() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load commit' });
  }
});

router.get('/fairness/rounds', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Number((req.query.limit as string) ?? '20'), 100);
    const rounds = await prisma.gameRound.findMany({
      where: { phase: 'SETTLED' },
      orderBy: { roundNumber: 'desc' },
      take: limit,
      select: {
        id: true, roundNumber: true, crashPoint: true,
        serverSeedHash: true, serverSeed: true, settledAt: true,
      },
    });
    const verified = rounds.map((r) => ({
      roundNumber: r.roundNumber,
      crashPoint: r.crashPoint ? Number(r.crashPoint) : null,
      serverSeedHash: r.serverSeedHash,
      serverSeed: r.serverSeed,
      revealed: !!r.serverSeed,
      verification: fairnessService.verifyRound(r),
    }));
    res.json({ success: true, data: verified });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to verify rounds' });
  }
});

// ---- Configurable alert thresholds ----
router.get('/alert-thresholds', async (req: AuthRequest, res: Response) => {
  try {
    const thresholds = await alertsService.getThresholds();
    res.json({ success: true, data: thresholds });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load thresholds' });
  }
});

router.put('/alert-thresholds', async (req: AuthRequest, res: Response) => {
  try {
    const updated = await alertsService.updateThresholds(req.body ?? {}, req.user!.userId);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to update thresholds' });
  }
});

// ---- Financial reconciliation (detect & report, never repair) ----
router.post('/reconcile', async (req: AuthRequest, res: Response) => {
  try {
    const { reconciliationService } = await import('../services/reconciliation.service');
    const report = await reconciliationService.reconcileAll();
    res.json({ success: true, data: report });
  } catch (error: any) {
    console.error('[ADMIN] Reconcile error:', error);
    res.status(500).json({ success: false, error: 'Reconciliation failed' });
  }
});

router.get('/reconcile/:walletId', async (req: AuthRequest, res: Response) => {
  try {
    const { reconciliationService } = await import('../services/reconciliation.service');
    const report = await reconciliationService.checkWallet(req.params.walletId);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Reconciliation check failed' });
  }
});

// ---- Metric snapshots (time-series, bounded) ----
router.get('/analytics/snapshots', async (req: AuthRequest, res: Response) => {
  try {
    const { hours = '24', limit = '288' } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(hours) * 60 * 60_000);
    const snapshots = await prisma.platformMetricSnapshot.findMany({
      where: { capturedAt: { gte: since } },
      orderBy: { capturedAt: 'desc' },
      take: Math.min(Number(limit), 500),
    });
    res.json({ success: true, data: snapshots });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to load snapshots' });
  }
});

export default router;
