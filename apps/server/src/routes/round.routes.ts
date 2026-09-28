import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { GamePhase } from '../../shared/types';
import { safeRoundView } from '../lib/round-sanitize';
import { fairnessService } from '../game/fairness';

const router = Router();

// Public provably-fair commit info (audit M2): the active seed hash and how
// many rounds remain before rotation. No auth required — the hash is public.
router.get('/fairness', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: fairnessService.getPublicCommit() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get fairness commit' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const rounds = await prisma.gameRound.findMany({
      orderBy: { roundNumber: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: { bets: true },
        },
      },
    });

    const data = rounds.map((r) => {
      const safe = safeRoundView(r);
      return {
        id: safe.id,
        roundNumber: safe.roundNumber,
        phase: safe.phase,
        // Crash point visible only for settled rounds — never for in-flight ones.
        crashPoint: safe.crashPoint ? Number(safe.crashPoint) : null,
        maxMultiplier: Number(safe.maxMultiplier),
        totalBets: safe._count.bets,
        startedAt: safe.startedAt?.toISOString() || null,
        bettingEndsAt: safe.bettingEndsAt?.toISOString() || null,
        crashedAt: safe.crashedAt?.toISOString() || null,
        settledAt: safe.settledAt?.toISOString() || null,
        createdAt: safe.createdAt.toISOString(),
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get rounds' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const round = await prisma.gameRound.findUnique({
      where: { id: req.params.id },
      include: {
        bets: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!round) {
      res.status(404).json({ success: false, error: 'Round not found' });
      return;
    }

    const safe = safeRoundView(round);
    res.json({
      success: true,
      data: {
        id: safe.id,
        roundNumber: safe.roundNumber,
        phase: safe.phase,
        // Outcome fields only after settlement — this endpoint previously
        // leaked the crash point and un-revealed serverSeed of live rounds.
        crashPoint: safe.crashPoint ? Number(safe.crashPoint) : null,
        serverSeed: safe.serverSeed,
        serverSeedHash: safe.serverSeedHash ?? null,
        maxMultiplier: Number(safe.maxMultiplier),
        startedAt: safe.startedAt?.toISOString() || null,
        bettingEndsAt: safe.bettingEndsAt?.toISOString() || null,
        crashedAt: safe.crashedAt?.toISOString() || null,
        settledAt: safe.settledAt?.toISOString() || null,
        createdAt: safe.createdAt.toISOString(),
        // Explicit field list — no row spread, so future sensitive columns
        // cannot leak by accident.
        bets: round.bets.map((b) => ({
          id: b.id,
          username: b.user.name,
          slot: b.slot,
          amount: Number(b.amount),
          status: b.status,
          cashoutMultiplier: b.cashoutMultiplier ? Number(b.cashoutMultiplier) : null,
          payout: b.payout ? Number(b.payout) : null,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get round' });
  }
});

export default router;
