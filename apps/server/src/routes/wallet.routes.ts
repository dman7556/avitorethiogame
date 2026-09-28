import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { walletService } from '../services/wallet.service';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.userId },
    });

    if (!wallet) {
      res.status(404).json({ success: false, error: 'Wallet not found' });
      return;
    }

    const balance = Number(wallet.balance);
    const reserved = Number(wallet.reserved);
    const available = balance - reserved;

    res.json({ 
      success: true, 
      data: {
        balance,
        reserved,
        available,
        currency: wallet.currency,
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get wallet' });
  }
});

router.get('/transactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const transactions = await walletService.getTransactions(req.user.userId, limit, offset);
    res.json({ success: true, data: transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get transactions' });
  }
});

export default router;
