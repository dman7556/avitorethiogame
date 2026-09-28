import prisma from '../lib/prisma';
import { GamePhase, BetStatus } from '@sky-rush/shared';
import { Decimal } from '@prisma/client/runtime/library';
import { multiplierEngine } from './MultiplierEngine';
import { trackEvent } from '../analytics/event-pipeline';
import { metricsEngine } from '../analytics/metrics-engine';
import { riskEngine } from '../analytics/risk-engine';
import { TtlCache } from '../lib/ttl-cache';
import { finLog } from '../lib/logger';
import { money } from '../services/money.helper';

export class BetManager {
  // Suspension-check cache TTL (30 s), shared by the TtlCache instance below
  // and the freshness check in assertUserActive.
  private static ACTIVE_TTL_MS = 30_000;

  // No request-level idempotency layer: the DB unique constraint
  // (userId, roundId, slot) makes true duplicate bets impossible per slot.

  // Suspension check cache (defense in depth: the REST auth middleware blocks
  // suspended users, but socket sessions may outlive a suspension).
  // Bounded via the shared TtlCache (audit M3): same 30 s TTL as before, hard
  // cap of 50k users — an operator would have to have 50k distinct accounts
  // placing bets within a 30 s window for the cap to matter, and a cap breach
  // merely drops the oldest cache entry (next bet re-reads the DB), so the
  // cache can never grow without bound.
  private activeCache = new TtlCache<{ active: boolean; at: number }>(BetManager.ACTIVE_TTL_MS, 50_000);

  private async assertUserActive(userId: string): Promise<void> {
    const cached = this.activeCache.get(userId);
    if (cached && Date.now() - cached.at < BetManager.ACTIVE_TTL_MS) {
      if (!cached.active) throw new BetError('Account is suspended', 'ACCOUNT_SUSPENDED');
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    this.activeCache.set(userId, { active: !!user?.isActive, at: Date.now() });
    if (!user?.isActive) {
      throw new BetError('Account is suspended', 'ACCOUNT_SUSPENDED');
    }
  }

  /**
   * Place a bet for a user in the current round.
   * All validation is server-side.
   */
  async placeBet(
    userId: string,
    roundId: string,
    amount: Decimal,
    slot: 1 | 2,
    autoCashout?: number
  ) {
    finLog.bet({ event: 'place_request', userId, roundId, slot, amount: String(amount) });

    // Suspended accounts cannot place bets (cached check, 30 s TTL)
    await this.assertUserActive(userId);

    // No idempotency check - allow rapid place/cancel/place cycles
    // Database unique constraint will prevent true duplicates
    // Users should be able to cancel and re-place unlimited times

    // Validate amount (Decimal end-to-end since M7 — no float math)
    if (money.lte(amount, money.ZERO) || money.gt(amount, money.fromNumber(10000))) {
      throw new BetError('Invalid bet amount', 'INVALID_AMOUNT');
    }

    if (amount.decimalPlaces() > 2) {
      throw new BetError('Invalid bet amount precision', 'INVALID_AMOUNT');
    }

    // Validate slot
    if (slot !== 1 && slot !== 2) {
      throw new BetError('Invalid bet slot', 'INVALID_SLOT');
    }

    // Validate auto cashout
    if (autoCashout !== undefined && autoCashout !== null) {
      if (autoCashout < 1.01 || autoCashout > 10000) {
        throw new BetError('Invalid auto cashout multiplier', 'INVALID_AUTO_CASHOUT');
      }
    }

    // Check round exists
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      throw new BetError('Round not found', 'ROUND_NOT_FOUND');
    }

    finLog.bet({ event: 'place_phase', userId, roundId, phase: round.phase });

    // Allow betting during any phase except CRASHED
    // During BETTING: bet activates immediately (PLACED)
    // During other phases: bet is queued for next round (QUEUED)
    if (round.phase === GamePhase.CRASHED) {
      throw new BetError('Betting is closed', 'BETTING_CLOSED');
    }

    const isQueued = round.phase !== GamePhase.BETTING;

    // Check for existing ACTIVE bet in this slot
    // Allow re-placing if previous bet was CANCELLED
    const existingBet = await prisma.bet.findUnique({
      where: {
        userId_roundId_slot: {
          userId,
          roundId,
          slot,
        },
      },
    });

    if (existingBet) {
      // If bet is CANCELLED, user can place a new one - delete the old cancelled bet
      if (existingBet.status === BetStatus.CANCELLED) {
        await prisma.bet.delete({
          where: { id: existingBet.id },
        });
        finLog.bet({ event: 'replaced_cancelled', userId, betId: existingBet.id });
      } else {
        // If bet is PLACED, ACTIVE, etc. - cannot place another
        throw new BetError('Bet already placed for this slot', 'DUPLICATE_BET');
      }
    }

    // Check user wallet AVAILABLE balance (balance - reserved).
    // Reserved funds belong to pending withdrawals and cannot be bet.
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new BetError('Wallet not found', 'WALLET_NOT_FOUND');
    }

    const availableBalance = new Decimal(wallet.balance).sub(new Decimal(wallet.reserved));
    finLog.bet({ event: 'wallet_snapshot', userId, available: String(availableBalance) });

    if (money.lt(availableBalance, amount)) {
      throw new BetError('Insufficient balance', 'INSUFFICIENT_BALANCE');
    }

    // Create bet and deduct balance atomically.
    // The wallet update is guarded: balance must still cover reserved + amount,
    // so a concurrent withdrawal reservation cannot be overdrawn by this bet.
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Re-read the wallet INSIDE the transaction for the authoritative figure
        const txWallet = await tx.wallet.findUnique({ where: { userId } });
        if (!txWallet) {
          throw new BetError('Wallet not found', 'WALLET_NOT_FOUND');
        }
        const txAvailable = new Decimal(txWallet.balance).sub(new Decimal(txWallet.reserved));
        if (money.lt(txAvailable, amount)) {
          throw new BetError('Insufficient balance', 'INSUFFICIENT_BALANCE');
        }

        // Deduct from wallet (Decimal math, no float rounding)
        const newBalance = new Decimal(txWallet.balance).sub(amount);

        const walletUpdate = await tx.wallet.updateMany({
          where: {
            id: txWallet.id,
            balance: { gte: new Decimal(txWallet.reserved).add(new Decimal(amount)) },
          },
          data: { balance: newBalance },
        });
        if (walletUpdate.count === 0) {
          throw new BetError('Insufficient balance', 'INSUFFICIENT_BALANCE');
        }

        // Record transaction
        await tx.walletTransaction.create({
          data: {
            walletId: txWallet.id,
            type: 'BET',
            amount: money.neg(amount),
            balanceBefore: new Decimal(txWallet.balance),
            balanceAfter: newBalance,
            description: `Bet on round ${round.roundNumber}, slot ${slot}`,
            referenceId: roundId,
          },
        });

        // Create bet — PLACED if during BETTING, QUEUED if during other phases
        const betStatus = isQueued ? 'QUEUED' : BetStatus.PLACED;
        const bet = await tx.bet.create({
          data: {
            userId,
            roundId,
            slot,
            amount,
            status: betStatus as any,
            autoCashout: autoCashout || null,
            placedAt: new Date(),
          },
        });

        return {
          bet,
          newBalance: Number(newBalance),
        };
      });
    } catch (error: any) {
      // Check for unique constraint violation (P2002)
      if (error.code === 'P2002') {
        finLog.bet({ event: 'place_duplicate', userId, roundId, slot });
        throw new BetError('Bet already exists for this slot', 'BET_ALREADY_EXISTS');
      }
      // Re-throw other errors
      throw error;
    }

    finLog.bet({ event: 'placed', userId, betId: result.bet.id, status: result.bet.status, newBalance: String(result.newBalance) });

    // ── ASYNC ANALYTICS (post-commit, never blocks the financial path) ──
    metricsEngine.onBetPlaced();
    metricsEngine.onTransaction();
    trackEvent({
      eventType: 'BET_PLACED',
      userId,
      roundId,
      betId: result.bet.id,
      amount: String(amount),
      metadata: { slot, isQueued, roundNumber: round.roundNumber },
    });
    void riskEngine.recordUserAction(userId, 'BET').catch(() => undefined);

    return {
      betId: result.bet.id,
      slot: result.bet.slot,
      amount: Number(result.bet.amount),
      status: result.bet.status as BetStatus,
      balance: result.newBalance,
    };
  }

  /**
   * Process cashout for a bet.
   * Server-authoritative: calculates multiplier and payout.
   */
  async processCashout(
    userId: string,
    betId: string,
    currentMultiplier: number
  ) {
    finLog.bet({ event: 'cashout_request', userId, betId, multiplier: currentMultiplier });

    // Suspended accounts cannot cash out
    await this.assertUserActive(userId);

    // Find the bet
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { round: true },
    });

    if (!bet) {
      throw new BetError('Bet not found', 'BET_NOT_FOUND');
    }

    // Verify bet belongs to user
    if (bet.userId !== userId) {
      throw new BetError('Not your bet', 'UNAUTHORIZED');
    }

    // Verify bet is in cashable state (PLACED or ACTIVE)
    if (bet.status !== BetStatus.PLACED && bet.status !== BetStatus.ACTIVE) {
      finLog.bet({ event: 'cashout_rejected_state', userId, betId, betStatus: bet.status });
      throw new BetError('Bet cannot be cashed out', 'INVALID_BET_STATE');
    }

    // Verify round is in FLYING phase
    if (bet.round.phase !== GamePhase.FLYING) {
      throw new BetError('Round is not in progress', 'ROUND_NOT_FLYING');
    }

    // ── SERVER-AUTHORITATIVE MULTIPLIER VALIDATION ──
    // Never trust the requested multiplier. Recompute it from the round's
    // own start timestamp (server clock) and reject requests that disagree
    // beyond a small network/jitter tolerance, or that claim a multiplier
    // at/above the secret crash point (a post-crash cashout attempt).
    if (!bet.round.startedAt) {
      throw new BetError('Round is not in progress', 'ROUND_NOT_FLYING');
    }
    const elapsedMs = Date.now() - new Date(bet.round.startedAt).getTime();
    const serverMultiplier = multiplierEngine.calculateMultiplier(elapsedMs);
    const requested = Math.max(1.0, Math.floor(currentMultiplier * 100) / 100);
    const TOLERANCE = 0.05; // one tick + network jitter
    if (requested > serverMultiplier + TOLERANCE) {
      finLog.bet({ event: 'cashout_rejected_multiplier', userId, betId, requested, server: serverMultiplier });
      throw new BetError('Invalid cashout multiplier', 'INVALID_MULTIPLIER');
    }
    if (bet.round.crashPoint && serverMultiplier >= Number(bet.round.crashPoint)) {
      // Round has effectively crashed between the tick and this request.
      throw new BetError('Round has crashed', 'ROUND_CRASHED');
    }

    // Settle at the SERVER multiplier (the smaller of the two) — the client
    // never gains an edge from timing.
    const multiplier = Math.max(1.0, Math.floor(Math.min(requested, serverMultiplier) * 100) / 100);
    const payout = Math.round(Number(bet.amount) * multiplier * 100) / 100;

    finLog.bet({ event: 'cashout_approved', userId, betId, multiplier, payout: String(payout) });

    // Process cashout atomically. The bet status change is a GUARDED
    // conditional update (not a blind update): it only matches a bet still
    // in PLACED/ACTIVE, so two concurrent cashout requests can never both
    // credit the wallet — the loser matches 0 rows and the whole transaction
    // rolls back with ALREADY_SETTLED. Same exactly-once pattern as
    // withdrawal approval in withdrawal.service.ts.
    const result = await prisma.$transaction(async (tx) => {
      // Re-read the round INSIDE the transaction for the authoritative phase
      // (a crash may have settled this bet between the pre-checks and now).
      // SQLite cannot use relation filters in updateMany, so the phase guard
      // is this in-tx read plus the guarded scalar update below.
      const txRound = await tx.gameRound.findUnique({ where: { id: bet.roundId } });
      if (!txRound || txRound.phase !== GamePhase.FLYING) {
        throw new BetError('Round is not in progress', 'ROUND_NOT_FLYING');
      }

      // Guarded settlement: only succeeds if the bet is still cashable.
      const settled = await tx.bet.updateMany({
        where: { id: betId, status: { in: [BetStatus.PLACED, BetStatus.ACTIVE] } },
        data: {
          status: BetStatus.CASHED_OUT,
          cashoutMultiplier: multiplier,
          payout: payout,
          cashedOutAt: new Date(),
        },
      });
      if (settled.count === 0) {
        // Lost a race against a concurrent cashout / crash settlement —
        // never pay twice.
        throw new BetError('Already cashed out', 'ALREADY_SETTLED');
      }
      const updatedBet = await tx.bet.findUniqueOrThrow({ where: { id: betId } });

      // Credit wallet
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new BetError('Wallet not found', 'WALLET_NOT_FOUND');
      }

      const currentBalance = Number(wallet.balance);
      const newBalance = new Decimal(currentBalance).add(new Decimal(payout));

      await tx.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      });

      // Record transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WIN',
          amount: new Decimal(payout),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: newBalance,
          description: `Cashout at ${multiplier}x on round ${bet.round.roundNumber}`,
          referenceId: betId,
        },
      });

      return {
        bet: updatedBet,
        payout,
        multiplier,
        balance: Number(newBalance),
      };
    });

    // ── ASYNC ANALYTICS (post-commit) ──
    metricsEngine.onCashout();
    metricsEngine.onTransaction();
    trackEvent({
      eventType: 'CASHOUT_ACCEPTED',
      userId,
      roundId: bet.roundId,
      betId,
      amount: String(payout),
      metadata: { multiplier, roundNumber: bet.round.roundNumber },
    });
    trackEvent({
      eventType: 'PAYOUT_CREATED',
      userId,
      roundId: bet.roundId,
      betId,
      amount: String(payout),
      metadata: { multiplier },
    });
    void riskEngine.recordUserAction(userId, 'CASHOUT').catch(() => undefined);

    return result;
  }

  /**
   * Cancel a bet that hasn't been activated yet (PLACED or QUEUED status).
   * Refunds the bet amount to the player's wallet.
   */
  async cancelBet(userId: string, betId: string) {
    finLog.bet({ event: 'cancel_request', userId, betId });

    // No idempotency check - allow rapid cancel operations
    // Users should be able to cancel freely

    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { round: true },
    });

    if (!bet) {
      throw new BetError('Bet not found', 'BET_NOT_FOUND');
    }

    if (bet.userId !== userId) {
      throw new BetError('Not your bet', 'UNAUTHORIZED');
    }

    // Can cancel PLACED or QUEUED bets at any time (except CRASHED phase)
    if (bet.status !== BetStatus.PLACED && bet.status !== 'QUEUED') {
      finLog.bet({ event: 'cancel_rejected_state', userId, betId, betStatus: bet.status });
      throw new BetError('Bet cannot be cancelled', 'INVALID_BET_STATE');
    }

    // Allow cancel at any time except CRASHED phase
    if (bet.round.phase === GamePhase.CRASHED) {
      finLog.bet({ event: 'cancel_rejected_phase', userId, betId, phase: bet.round.phase });
      throw new BetError('Cannot cancel after round has crashed', 'ROUND_CRASHED');
    }

    // Refund atomically
    const result = await prisma.$transaction(async (tx) => {
      // Mark bet as cancelled
      await tx.bet.update({
        where: { id: betId },
        data: { status: BetStatus.CANCELLED },
      });

      // Refund wallet
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new BetError('Wallet not found', 'WALLET_NOT_FOUND');

      const currentBalance = Number(wallet.balance);
      const refundAmount = Number(bet.amount);
      const newBalance = new Decimal(currentBalance).add(new Decimal(refundAmount));

      await tx.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      });

      // Record transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount: new Decimal(refundAmount),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: newBalance,
          description: `Cancelled bet on round ${bet.round.roundNumber}, slot ${bet.slot}`,
          referenceId: betId,
        },
      });

      return { newBalance: Number(newBalance) };
    });

    finLog.bet({ event: 'cancel_approved', userId, betId, refund: String(bet.amount), newBalance: String(result.newBalance) });

    trackEvent({
      eventType: 'BET_CANCELLED',
      userId,
      roundId: bet.roundId,
      betId,
      amount: String(bet.amount),
    });

    return { balance: result.newBalance };
  }

  /**
   * Activate queued bets when a new round enters BETTING phase.
   * Moves QUEUED bets from ANY previous round to the new round.
   */
  async activateQueuedBets(newRoundId: string): Promise<number> {
    finLog.bet({ event: 'queue_activate_start', roundId: newRoundId });

    // Find ALL queued bets across all rounds
    const queuedBets = await prisma.bet.findMany({
      where: {
        status: 'QUEUED' as any,
      },
    });

    if (queuedBets.length === 0) {
      finLog.bet({ event: 'queue_activate_empty', roundId: newRoundId });
      return 0;
    }

    let activatedCount = 0;

    for (const bet of queuedBets) {
      try {
        // Check if user already has a bet on the new round for this slot
        const existingBet = await prisma.bet.findUnique({
          where: {
            userId_roundId_slot: {
              userId: bet.userId,
              roundId: newRoundId,
              slot: bet.slot,
            },
          },
        });

        if (existingBet) {
          // Conflict: refund the queued bet
          finLog.bet({ event: 'queue_conflict_refund', userId: bet.userId, betId: bet.id, roundId: newRoundId });
          await prisma.$transaction(async (tx) => {
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: BetStatus.CANCELLED },
            });

            const wallet = await tx.wallet.findUnique({ where: { userId: bet.userId } });
            if (wallet) {
              const refundAmount = Number(bet.amount);
              const newBalance = Math.round((Number(wallet.balance) + refundAmount) * 100) / 100;
              await tx.wallet.update({
                where: { userId: bet.userId },
                data: { balance: newBalance },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id,
                  type: 'REFUND',
                  amount: refundAmount,
                  balanceBefore: wallet.balance,
                  balanceAfter: newBalance,
                  description: `Auto-refund: slot conflict on new round`,
                  referenceId: bet.id,
                },
              });
            }
          });
          continue;
        }

        // Move bet to new round and activate
        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            roundId: newRoundId,
            status: BetStatus.PLACED,
          },
        });

        activatedCount++;
        finLog.bet({ event: 'queue_activated', userId: bet.userId, betId: bet.id, roundId: newRoundId });
      } catch (error) {
        finLog.betError({ event: 'queue_activate_failed', betId: bet.id, error: error instanceof Error ? error.message : String(error) });
        // If move fails (e.g., unique constraint), refund the queued bet
        try {
          await prisma.$transaction(async (tx) => {
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: BetStatus.CANCELLED },
            });
            const wallet = await tx.wallet.findUnique({ where: { userId: bet.userId } });
            if (wallet) {
              const refundAmount = Number(bet.amount);
              const newBalance = Math.round((Number(wallet.balance) + refundAmount) * 100) / 100;
              await tx.wallet.update({
                where: { userId: bet.userId },
                data: { balance: newBalance },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id,
                  type: 'REFUND',
                  amount: refundAmount,
                  balanceBefore: wallet.balance,
                  balanceAfter: newBalance,
                  description: `Auto-refund: activation failed`,
                  referenceId: bet.id,
                },
              });
            }
          });
        } catch {
          finLog.betError({ event: 'queue_refund_failed_critical', userId: bet.userId, betId: bet.id });
        }
      }
    }

    finLog.bet({ event: 'queue_activated_batch', roundId: newRoundId, count: activatedCount });
    return activatedCount;
  }

  /**
   * Auto cashout check: process auto-cashout for a bet if multiplier reached target.
   */
  async processAutoCashout(
    betId: string,
    currentMultiplier: number
  ): Promise<boolean> {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
    });

    if (
      !bet ||
      (bet.status !== BetStatus.PLACED && bet.status !== BetStatus.ACTIVE) ||
      !bet.autoCashout
    ) {
      return false;
    }

    if (currentMultiplier >= Number(bet.autoCashout)) {
      try {
        await this.processCashout(bet.userId, betId, currentMultiplier);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Mark all non-cashed-out bets as LOST when round crashes.
   */
  async settleRoundBets(roundId: string) {
    const bets = await prisma.bet.findMany({
      where: {
        roundId,
        status: { in: [BetStatus.PLACED, BetStatus.ACTIVE] },
      },
    });

    // Mark all remaining bets as lost
    await prisma.bet.updateMany({
      where: {
        roundId,
        status: { in: [BetStatus.PLACED, BetStatus.ACTIVE] },
      },
      data: {
        status: BetStatus.LOST,
      },
    });

    // ── ASYNC ANALYTICS: one BET_LOST event per losing bet ──
    for (const b of bets) {
      trackEvent({
        eventType: 'BET_LOST',
        userId: b.userId,
        roundId,
        betId: b.id,
        amount: String(b.amount),
      });
    }

    return {
      totalBets: bets.length,
      totalLost: bets.reduce((sum, b) => sum + Number(b.amount), 0),
    };
  }

  /**
   * Refund orphaned queued bets for rounds that have already crashed/settled.
   */
  async refundOrphanedQueuedBets(): Promise<number> {
    const orphanedBets = await prisma.bet.findMany({
      where: {
        status: 'QUEUED' as any,
      },
      include: { round: true },
    });

    let refundCount = 0;

    for (const bet of orphanedBets) {
      // Refund bets on rounds that have already crashed or settled
      if (bet.round.phase === GamePhase.CRASHED || bet.round.phase === GamePhase.SETTLED) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: BetStatus.CANCELLED },
            });
            const wallet = await tx.wallet.findUnique({ where: { userId: bet.userId } });
            if (wallet) {
              const refundAmount = Number(bet.amount);
              const newBalance = Math.round((Number(wallet.balance) + refundAmount) * 100) / 100;
              await tx.wallet.update({
                where: { userId: bet.userId },
                data: { balance: newBalance },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id,
                  type: 'REFUND',
                  amount: refundAmount,
                  balanceBefore: wallet.balance,
                  balanceAfter: newBalance,
                  description: `Auto-refund: orphaned queued bet on ended round`,
                  referenceId: bet.id,
                },
              });
            }
          });
          refundCount++;
        } catch (error) {
          finLog.betError({ event: 'orphan_refund_failed', betId: bet.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    if (refundCount > 0) {
      finLog.bet({ event: 'orphan_refund_batch', count: refundCount });
    }

    return refundCount;
  }

  /**
   * Get active bets for a user in a specific round.
   */
  async getUserRoundBets(userId: string, roundId: string) {
    return prisma.bet.findMany({
      where: { userId, roundId },
      orderBy: { slot: 'asc' },
    });
  }

  /**
   * Get all active (non-settled) bets for a user.
   */
  async getUserActiveBets(userId: string) {
    return prisma.bet.findMany({
      where: {
        userId,
        status: { in: [BetStatus.PLACED, BetStatus.ACTIVE, 'QUEUED' as any] },
      },
      include: { round: true },
    });
  }

  /**
   * Get public bets for a round (anonymized).
   */
  async getPublicBets(roundId: string, limit = 20) {
    const bets = await prisma.bet.findMany({
      where: {
        roundId,
        status: { in: [BetStatus.CASHED_OUT, BetStatus.LOST, BetStatus.PLACED, BetStatus.ACTIVE] },
      },
      include: {
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return bets.map((bet) => ({
      betId: bet.id,
      username: anonymizeUsername(bet.user.name),
      amount: Number(bet.amount),
      multiplier: bet.cashoutMultiplier ? Number(bet.cashoutMultiplier) : null,
      payout: bet.payout ? Number(bet.payout) : null,
      status: bet.status,
      slot: bet.slot,
    }));
  }
}

function anonymizeUsername(username: string): string {
  if (username.length <= 3) return username + '***';
  return username.substring(0, 3) + '***';
}

export class BetError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'BetError';
    this.code = code;
  }
}

export const betManager = new BetManager();
