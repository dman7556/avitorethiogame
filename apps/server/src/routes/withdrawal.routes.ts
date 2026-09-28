import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { withdrawalService, WithdrawalError } from '../services/withdrawal.service';
import { money } from '../services/money.helper';
import { PaymentMethod } from '../shared/types';
import { finLog } from '../lib/logger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create withdrawal — amount arrives as a STRING (audit M7): parsed strictly
// into a decimal at the boundary, never trusted as a JSON number.
const createWithdrawalSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a decimal string with at most 2 decimals'),
  paymentMethod: z.enum([PaymentMethod.TELEBIRR, PaymentMethod.CBE]),
  accountNumber: z.string().min(1, 'Account number is required').max(100),
  accountHolder: z.string().optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const body = createWithdrawalSchema.parse(req.body);
    const amount = money.fromAmountString(body.amount);
    if (!amount) {
      res.status(400).json({ success: false, error: 'Invalid amount', code: 'INVALID_AMOUNT' });
      return;
    }

    finLog.withdrawal({ requestId: req.requestId, event: 'creating', userId: req.user!.userId, amount: String(body.amount), method: body.paymentMethod });

    const withdrawal = await withdrawalService.createWithdrawal({
      userId: req.user!.userId,
      amount,
      paymentMethod: body.paymentMethod,
      accountNumber: body.accountNumber,
      accountHolder: body.accountHolder,
    });

    // Get updated wallet to send back to user
    const walletService = (await import('../services/wallet.service')).walletService;
    const updatedWallet = await walletService.getWallet(req.user!.userId);

    // Broadcast wallet update (reserved increased) to the user via Socket.IO
    const io = req.app.locals.io;
    if (io) {
      io.to(`user:${req.user!.userId}`).emit('wallet:updated', {
        balance: updatedWallet.balance,
        reserved: updatedWallet.reserved,
      });
      // Real-time: admins see the new pending withdrawal immediately
      io.to('admin').emit('admin:withdrawal_new', {
        withdrawalId: withdrawal.id,
        userId: req.user!.userId,
        amount: Number(withdrawal.amount),
        paymentMethod: withdrawal.paymentMethod,
        timestamp: new Date().toISOString(),
      });
      io.to('admin').emit('admin:stats_updated');
      finLog.withdrawal({ requestId: req.requestId, event: 'wallet_broadcast', userId: req.user!.userId, withdrawalId: withdrawal.id });
    }

    res.json({
      success: true,
      data: {
        id: withdrawal.id,
        amount: Number(withdrawal.amount),
        paymentMethod: withdrawal.paymentMethod,
        accountNumber: withdrawal.accountNumber,
        accountHolder: withdrawal.accountHolder,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    if (error instanceof WithdrawalError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
    } else if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      finLog.withdrawalError({ requestId: req.requestId, event: 'create_error', userId: req.user?.userId, errorMessage: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: 'Failed to create withdrawal' });
    }
  }
});

// Get user's withdrawals
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await withdrawalService.getUserWithdrawals(req.user!.userId, limit, offset);

    res.json({ success: true, data: result });
  } catch (error: any) {
    finLog.withdrawalError({ requestId: req.requestId, event: 'list_error', userId: req.user?.userId, errorMessage: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to get withdrawals' });
  }
});

// Get specific withdrawal
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const withdrawal = await withdrawalService.getWithdrawalById(req.params.id);

    // Verify withdrawal belongs to user
    if (withdrawal.userId !== req.user!.userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    res.json({ success: true, data: withdrawal });
  } catch (error: any) {
    if (error.code === 'WITHDRAWAL_NOT_FOUND') {
      res.status(404).json({ success: false, error: error.message, code: error.code });
    } else {
      finLog.withdrawalError({ requestId: req.requestId, event: 'get_error', userId: req.user?.userId, withdrawalId: req.params['id'], errorMessage: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: 'Failed to get withdrawal' });
    }
  }
});

export default router;
