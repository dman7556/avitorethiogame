import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { TokenBucketLimiter } from '../lib/token-bucket';
import { RATE_LIMIT_CODE } from '../lib/bet-rate-limits';

const router = Router();

// H3: per-user limiter for the HTTP bets read route — independent of and
// additional to the global 100 req/60s limiter on /api/. (Bet mutations are
// socket-only; the socket handlers carry the authoritative place/cashout/
// cancel limits from lib/bet-rate-limits.ts.) Read budget is intentionally
// larger than the mutation budgets: polling one's own history is normal.
const betReadLimiter = new TokenBucketLimiter({ capacity: 30, refillPerSecond: 15 });

router.get('/', authenticate, (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.userId || betReadLimiter.tryConsume(req.user.userId)) {
    return next();
  }
  res.status(429).json({
    success: false,
    error: 'Too many requests, slow down',
    code: RATE_LIMIT_CODE,
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const bets = await prisma.bet.findMany({
      where: { userId: req.user.userId },
      include: {
        round: {
          select: {
            roundNumber: true,
            crashPoint: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const data = bets.map((b) => ({
      id: b.id,
      roundNumber: b.round.roundNumber,
      slot: b.slot,
      amount: Number(b.amount),
      status: b.status,
      cashoutMultiplier: b.cashoutMultiplier ? Number(b.cashoutMultiplier) : null,
      payout: b.payout ? Number(b.payout) : null,
      crashPoint: b.round.crashPoint ? Number(b.round.crashPoint) : null,
      placedAt: b.placedAt?.toISOString() || null,
      cashedOutAt: b.cashedOutAt?.toISOString() || null,
      createdAt: b.createdAt.toISOString(),
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get bets' });
  }
});

export default router;
