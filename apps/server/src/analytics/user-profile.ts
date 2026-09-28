import prisma from '../lib/prisma';

/**
 * USER ACTIVITY / FINANCIAL PROFILE (analytics only).
 *
 * Aggregates the real ledger (WalletTransaction), bets, deposits,
 * withdrawals and activity events for one user. Read-only by design.
 * These metrics must NEVER feed back into game outcome generation.
 */

export class UserProfileService {
  async getProfile(userId: string) {
    const [wallet, betAgg, cashoutAgg, deposits, withdrawals, sessions, roundCount] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.bet.aggregate({
        where: { userId },
        _count: true, _sum: { amount: true },
        _max: { amount: true },
      }),
      prisma.bet.aggregate({
        where: { userId, status: 'CASHED_OUT' },
        _count: true,
        _avg: { cashoutMultiplier: true },
        _sum: { payout: true },
      }),
      prisma.deposit.aggregate({
        where: { userId, status: 'APPROVED' },
        _count: true, _sum: { verifiedAmount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { userId, status: { in: ['APPROVED', 'COMPLETED'] } },
        _count: true, _sum: { amount: true },
      }),
      prisma.userSession.aggregate({
        where: { userId },
        _count: true,
      }),
      prisma.bet.findMany({
        where: { userId },
        select: { roundId: true },
        distinct: ['roundId'],
      }).then((rows) => rows.length),
    ]);

    const totalWagered = Number(betAgg._sum.amount ?? 0);
    const totalBets = betAgg._count ?? 0;
    const totalPayout = Number(cashoutAgg._sum.payout ?? 0);
    const cashouts = cashoutAgg._count ?? 0;

    return {
      balance: Number(wallet?.balance ?? 0),
      reserved: Number(wallet?.reserved ?? 0),
      available: Number(wallet ? wallet.balance.sub(wallet.reserved) : 0),
      totalDeposits: Number(deposits._sum.verifiedAmount ?? 0),
      approvedDepositCount: deposits._count ?? 0,
      totalWithdrawals: Number(withdrawals._sum.amount ?? 0),
      approvedWithdrawalCount: withdrawals._count ?? 0,
      totalBets,
      totalWagered,
      totalPayout,
      netGaming: Math.round((totalPayout - totalWagered) * 100) / 100,
      avgBet: totalBets > 0 ? Math.round((totalWagered / totalBets) * 100) / 100 : 0,
      largestBet: Number(betAgg._max.amount ?? 0),
      cashouts,
      avgCashoutMultiplier: cashoutAgg._avg.cashoutMultiplier ? Number(cashoutAgg._avg.cashoutMultiplier) : null,
      roundsPlayed: roundCount,
      sessions: sessions._count ?? 0,
    };
  }

  /**
   * ADMIN-ONLY user activity timeline. Joins ActivityEvents with the
   * authoritative financial records so every row can drill down to its
   * transaction/bet/round.
   */
  async getTimeline(userId: string, limit = 100, eventType?: string) {
    const events = await prisma.activityEvent.findMany({
      where: { userId, ...(eventType ? { eventType } : {}) },
      orderBy: { serverTs: 'desc' },
      take: Math.min(limit, 500),
    });

    // Bounded hydration of linked resources (batched per type, no N+1).
    const txIds = events.map((e) => e.transactionId).filter((v): v is string => !!v);
    const betIds = events.map((e) => e.betId).filter((v): v is string => !!v);
    const roundIds = [...new Set(events.map((e) => e.roundId).filter((v): v is string => !!v))];

    const [txs, bets, rounds] = await Promise.all([
      txIds.length ? prisma.walletTransaction.findMany({ where: { id: { in: txIds } }, select: { id: true, type: true, amount: true, balanceBefore: true, balanceAfter: true } }) : [],
      betIds.length ? prisma.bet.findMany({ where: { id: { in: betIds } }, select: { id: true, amount: true, status: true, cashoutMultiplier: true, payout: true, roundId: true } }) : [],
      roundIds.length ? prisma.gameRound.findMany({ where: { id: { in: roundIds } }, select: { id: true, roundNumber: true, crashPoint: true } }) : [],
    ]);

    const txMap = new Map(txs.map((t) => [t.id, t]));
    const betMap = new Map(bets.map((b) => [b.id, b]));
    const roundMap = new Map(rounds.map((r) => [r.id, r]));

    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      timestamp: e.serverTs,
      amount: e.amount ? Number(e.amount) : null,
      sessionId: e.sessionId,
      requestId: e.requestId,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
      links: {
        transaction: e.transactionId ? txMap.get(e.transactionId) ?? null : null,
        bet: e.betId ? betMap.get(e.betId) ?? null : null,
        round: e.roundId ? roundMap.get(e.roundId) ?? null : null,
      },
    }));
  }
}

export const userProfileService = new UserProfileService();
