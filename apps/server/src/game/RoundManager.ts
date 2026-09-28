import prisma from '../lib/prisma';
import { GamePhase } from '../../shared/types';

export class RoundManager {
  private currentRound: {
    id: string;
    roundNumber: number;
    phase: GamePhase;
    crashPoint: number | null;
    startedAt: Date | null;
    bettingEndsAt: Date | null;
  } | null = null;

  private nextRoundNumber = 1;

  async initialize(): Promise<void> {
    // Find the latest round or start fresh
    const latestRound = await prisma.gameRound.findFirst({
      orderBy: { roundNumber: 'desc' },
    });

    if (latestRound) {
      this.nextRoundNumber = latestRound.roundNumber + 1;

      // If there's a non-settled round, settle it
      if (latestRound.phase !== GamePhase.SETTLED) {
        await prisma.gameRound.update({
          where: { id: latestRound.id },
          data: { phase: GamePhase.SETTLED, settledAt: new Date() },
        });

        // Cancel any pending bets in this round
        await prisma.bet.updateMany({
          where: {
            roundId: latestRound.id,
            status: { in: ['PENDING', 'PLACED'] },
          },
          data: { status: 'CANCELLED' },
        });
      }
    }
  }

  /** Next round number without mutating state (used for fairness commit). */
  peekNextRoundNumber(): number {
    return this.nextRoundNumber;
  }

  async createRound(crashPoint: number, serverSeedHash?: string | null): Promise<{
    id: string;
    roundNumber: number;
    phase: GamePhase;
    crashPoint: number;
  }> {
    const now = new Date();
    let roundNumber = this.nextRoundNumber;

    // Keep trying with incremented numbers until we find one that works
    let retries = 0;
    let round = null;

    while (!round && retries < 100) {
      try {
        round = await prisma.gameRound.create({
          data: {
            roundNumber,
            phase: GamePhase.WAITING,
            crashPoint: crashPoint,
            serverSeedHash: serverSeedHash ?? null,
            startedAt: null,
            bettingEndsAt: null,
          },
        });
      } catch (error: any) {
        // If constraint violation, try next number
        if (error.code === 'P2002') {
          roundNumber++;
          retries++;
        } else {
          throw error;
        }
      }
    }

    if (!round) {
      throw new Error('Failed to create round after 100 retries');
    }

    this.nextRoundNumber = roundNumber + 1;

    this.currentRound = {
      id: round.id,
      roundNumber: round.roundNumber,
      phase: GamePhase.WAITING,
      crashPoint: crashPoint,
      startedAt: null,
      bettingEndsAt: null,
    };

    console.log(`[GameEngine] Created round ${round.roundNumber} (retries: ${retries})`);

    return {
      id: round.id,
      roundNumber: round.roundNumber,
      phase: GamePhase.WAITING,
      crashPoint: crashPoint,
    };
  }

  async startBetting(roundId: string, durationMs: number): Promise<void> {
    const bettingEndsAt = new Date(Date.now() + durationMs);

    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        phase: GamePhase.BETTING,
        bettingEndsAt,
      },
    });

    if (this.currentRound) {
      this.currentRound.phase = GamePhase.BETTING;
      this.currentRound.bettingEndsAt = bettingEndsAt;
    }
  }

  async startFlight(roundId: string): Promise<void> {
    const now = new Date();

    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        phase: GamePhase.FLYING,
        startedAt: now,
      },
    });

    if (this.currentRound) {
      this.currentRound.phase = GamePhase.FLYING;
      this.currentRound.startedAt = now;
    }
  }

  async crashRound(roundId: string): Promise<void> {
    const now = new Date();

    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        phase: GamePhase.CRASHED,
        crashedAt: now,
      },
    });

    if (this.currentRound) {
      this.currentRound.phase = GamePhase.CRASHED;
    }
  }

  async settleRound(roundId: string): Promise<void> {
    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        phase: GamePhase.SETTLED,
        settledAt: new Date(),
      },
    });

    if (this.currentRound) {
      this.currentRound.phase = GamePhase.SETTLED;
    }
  }

  getCurrentRound() {
    return this.currentRound;
  }

  getRoundNumber(): number {
    return this.nextRoundNumber;
  }

  async getRecentRounds(limit = 20) {
    return prisma.gameRound.findMany({
      where: { phase: GamePhase.SETTLED },
      orderBy: { roundNumber: 'desc' },
      take: limit,
      select: {
        id: true,
        roundNumber: true,
        crashPoint: true,
        maxMultiplier: true,
        serverSeedHash: true,
        startedAt: true,
        crashedAt: true,
        settledAt: true,
      },
    });
  }
}

export const roundManager = new RoundManager();
