import { Server as SocketIOServer } from 'socket.io';
import { CrashPointProvider } from './CrashPointProvider';
import { multiplierEngine } from './MultiplierEngine';
import { roundManager } from './RoundManager';
import { betManager } from './BetManager';
import { fairnessService } from './fairness';
import prisma from '../lib/prisma';
import { GamePhase, GAME_CONSTANTS } from '../../shared/types';
import { trackEvent } from '../analytics/event-pipeline';
import { metricsEngine } from '../analytics/metrics-engine';

export class GameEngine {
  private io: SocketIOServer;
  private crashPointProvider: CrashPointProvider | null = null;
  private gameLoopTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  /** H2: guards against overlapping auto-cashout batches across ticks. */
  private autoCashoutInFlight = false;
  private isRunning = false;
  /** True when outcomes come from the provably-fair commit/reveal service. */
  private useProvablyFair = true;

  constructor(io: SocketIOServer, crashPointProvider?: CrashPointProvider) {
    this.io = io;
    // A provider is ONLY used by tests. In production, provably-fair
    // commit/reveal generation is used (fairnessService.beginRound).
    this.crashPointProvider = crashPointProvider || null;
    this.useProvablyFair = !crashPointProvider;
  }

  async initialize(): Promise<void> {
    await roundManager.initialize();
    // Publish the initial seed commit so players can verify later rounds.
    fairnessService.ensureSeed();
    console.log('[GameEngine] Initialized');
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[GameEngine] Starting game loop');
    while (this.isRunning) {
      await this.runNextRound();
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.gameLoopTimer) {
      clearTimeout(this.gameLoopTimer);
      this.gameLoopTimer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private async runNextRound(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // ── OUTCOME GENERATION ────────────────────────────────────────────
      // Determined BEFORE any bet is seen; independent of users, balances,
      // bet sizes, deposits, platform exposure, previous results.
      const roundNumberHint = roundManager.peekNextRoundNumber();
      let crashPoint: number;
      let serverSeedHash: string | null = null;

      if (this.useProvablyFair) {
        const fair = await fairnessService.beginRound(roundNumberHint);
        crashPoint = fair.crashPoint;
        serverSeedHash = fair.serverSeedHash;
      } else {
        crashPoint = this.crashPointProvider!.generateCrashPoint();
      }

      console.log(`[GameEngine] New round ${roundNumberHint} - committed hash ${serverSeedHash ?? '(test provider)'}`);

      // Create round with retry logic
      let round = null;
      let retries = 0;

      while (!round && retries < 5) {
        try {
          round = await roundManager.createRound(crashPoint, serverSeedHash);
          break;
        } catch (error: any) {
          retries++;
          console.error(`[GameEngine] Round creation failed (attempt ${retries}/5):`, error.message);
          if (retries < 5) {
            await this.sleep(1000);
          }
        }
      }

      if (!round) {
        console.error('[GameEngine] Failed to create round after 5 attempts, skipping');
        await this.sleep(5000);
        return;
      }

      // Fairness consistency: if the round number moved (P2002 retry), the
      // committed outcome must be re-derived for the ACTUAL round number
      // before any bet can exist. (serverSeed, roundNumber) → crashPoint.
      if (this.useProvablyFair && round.roundNumber !== roundNumberHint) {
        const { seed, hash } = fairnessService.ensureSeed();
        crashPoint = fairnessService.deriveCrashPoint(seed, round.roundNumber);
        serverSeedHash = hash;
        await prisma.gameRound.update({
          where: { id: round.id },
          data: { crashPoint, serverSeedHash: hash },
        });
        console.log(`[GameEngine] Re-derived outcome for actual round number ${round.roundNumber}`);
      }

      trackEvent({
        eventType: 'ROUND_STARTED',
        roundId: round.id,
        metadata: { roundNumber: round.roundNumber, serverSeedHash },
      });

      // Broadcast round state
      this.io.emit('round:state', {
        roundId: round.id,
        roundNumber: round.roundNumber,
        phase: GamePhase.WAITING,
        crashPoint: null,
        maxMultiplier: 1.0,
        startedAt: null,
        bettingEndsAt: null,
        countdown: null,
        // Public commit — players can verify the reveal against this later.
        serverSeedHash,
      });

      // No WAITING sleep: betting opens immediately so the countdown starts
      // right after the crash — no dead air between rounds.
      // Start betting phase
      const bettingDuration = GAME_CONSTANTS.BETTING_DURATION_MS;
      await roundManager.startBetting(round.id, bettingDuration);

      // Activate any queued bets from the previous round
      const activatedCount = await betManager.activateQueuedBets(round.id);
      if (activatedCount > 0) {
        console.log(`[GameEngine] Activated ${activatedCount} queued bet(s)`);
      }

      this.io.emit('round:state', {
        roundId: round.id,
        roundNumber: round.roundNumber,
        phase: GamePhase.BETTING,
        crashPoint: null,
        maxMultiplier: 1.0,
        startedAt: null,
        bettingEndsAt: new Date(Date.now() + bettingDuration).toISOString(),
        countdown: Math.ceil(bettingDuration / 1000),
        serverSeedHash,
      });

      // Countdown broadcast
      let countdownRemaining = Math.ceil(bettingDuration / 1000);
      const countdownInterval = setInterval(() => {
        countdownRemaining--;
        if (countdownRemaining <= 0) {
          clearInterval(countdownInterval);
        }
      }, 1000);

      // Wait for betting to end
      await this.sleep(bettingDuration);

      // Start flight phase
      const startTime = Date.now();
      await roundManager.startFlight(round.id);

      this.io.emit('round:state', {
        roundId: round.id,
        roundNumber: round.roundNumber,
        phase: GamePhase.FLYING,
        crashPoint: null,
        maxMultiplier: 1.0,
        startedAt: new Date(startTime).toISOString(),
        bettingEndsAt: null,
        countdown: null,
        serverSeedHash,
      });

      // Mark active bets
      await prisma.bet.updateMany({
        where: {
          roundId: round.id,
          status: 'PLACED',
        },
        data: { status: 'ACTIVE' },
      });

      trackEvent({ eventType: 'ROUND_JOINED', roundId: round.id });

      // Tick loop - send multiplier updates
      await this.runTickLoop(round.id, crashPoint, startTime);

      // Crash!
      await roundManager.crashRound(round.id);

      this.io.emit('round:crashed', {
        roundId: round.id,
        crashPoint,
        crashedAt: new Date().toISOString(),
        serverSeed: null, // not revealed yet — see settled event
      });

      trackEvent({
        eventType: 'ROUND_CRASHED',
        roundId: round.id,
        metadata: { roundNumber: round.roundNumber, crashPoint },
      });

      // Settle bets
      const settlement = await betManager.settleRoundBets(round.id);
      await roundManager.settleRound(round.id);

      // PROVABLY FAIR REVEAL: publish the seed now that the round ended.
      let serverSeed: string | null = null;
      if (this.useProvablyFair) {
        serverSeed = await fairnessService.revealRound(round.id);
      }

      this.io.emit('round:settled', {
        roundId: round.id,
        totalBets: settlement.totalBets,
        totalPayouts: settlement.totalLost,
        // Reveal — anyone can now recompute the outcome from
        // (serverSeed, roundNumber) and confirm it matches.
        serverSeed,
        serverSeedHash,
        crashPoint,
      });

      trackEvent({
        eventType: 'ROUND_SETTLED',
        roundId: round.id,
        metadata: {
          roundNumber: round.roundNumber,
          crashPoint,
          serverSeed,
          serverSeedHash,
          totalBets: settlement.totalBets,
          totalPayouts: settlement.totalLost,
        },
      });

      // Broadcast updated history
      await this.broadcastHistory();

      // Refund any orphaned queued bets from previous rounds
      await betManager.refundOrphanedQueuedBets();

      // Wait before next round
      await this.sleep(GAME_CONSTANTS.ROUND_INTERVAL_MS);
    } catch (error) {
      console.error('[GameEngine] Error in game loop:', error);
      // Retry after delay
      await this.sleep(5000);
    }
  }

  private async runTickLoop(
    roundId: string,
    crashPoint: number,
    startTime: number
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tickTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // Pure function of time — no outcome information leaks through the
        // curve shape or any per-round parameter.
        const multiplier = multiplierEngine.calculateMultiplier(elapsed);

        // Check if we should crash
        if (multiplier >= crashPoint) {
          if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
          }
          resolve();
          return;
        }

        // Broadcast tick — multiplier and elapsed only, BEFORE any DB work
        // so a slow auto-cashout write can never delay it. NO curveData: the
        // old curve payload was normalized by the crash point and let
        // observers algebraically solve for the outcome mid-round. The
        // client draws its own curve from the multiplier series.
        this.io.emit('round:tick', {
          roundId,
          multiplier,
          elapsed,
        });

        // ── H2: auto-cashouts OFF the interval path ──
        // Queued via setImmediate with an in-flight guard: a slow DB write
        // for one bet can never delay the crash check or the tick broadcast,
        // and overlapping ticks can never stack concurrent batches (bets not
        // reached this tick are picked up by the next). Settlement still
        // goes through betManager.processAutoCashout → processCashout, whose
        // guarded exactly-once transaction (C1) re-validates the round phase
        // and the crash point — so even a batch racing the crash cannot
        // double-pay or pay past the crash.
        if (this.autoCashoutInFlight) return;
        this.autoCashoutInFlight = true;
        setImmediate(() => {
          this.processAutoCashoutsForTick(roundId, multiplier, crashPoint)
            .catch(() => undefined)
            .finally(() => {
              this.autoCashoutInFlight = false;
            });
        });
      }, GAME_CONSTANTS.TICK_INTERVAL_MS);
    });
  }

  /**
   * Auto-cashout processing for one tick. Public for tests.
   *
   * H2 ordering guarantee — CRASH FIRST: when this tick's multiplier has
   * reached the crash point, NOTHING is processed (the caller resolves the
   * round instead), so a bet whose auto-cashout target equals the crash
   * multiplier is never paid.
   */
  async processAutoCashoutsForTick(
    roundId: string,
    multiplier: number,
    crashPoint: number
  ): Promise<void> {
    if (multiplier >= crashPoint) return;

    const activeBets = await prisma.bet.findMany({
      where: {
        roundId,
        status: 'ACTIVE',
        autoCashout: { not: null },
      },
    });

    for (const bet of activeBets) {
      try {
        const didCashout = await betManager.processAutoCashout(bet.id, multiplier);
        if (didCashout) {
          metricsEngine.onCashout();
          const user = await prisma.user.findUnique({
            where: { id: bet.userId },
            select: { name: true },
          });

          this.io.emit('bet:cashed_out', {
            betId: bet.id,
            userId: bet.userId,
            username: user?.name || 'Unknown',
            roundId,
            multiplier,
            payout: Math.round(Number(bet.amount) * multiplier * 100) / 100,
          });

          trackEvent({
            eventType: 'CASHOUT_ACCEPTED',
            userId: bet.userId,
            roundId,
            betId: bet.id,
            amount: String(Number(bet.amount) * multiplier),
            metadata: { multiplier, auto: true },
          });

          // Fetch actual wallet balance after auto-cashout
          const userWallet = await prisma.wallet.findUnique({ where: { userId: bet.userId } });
          if (userWallet) {
            this.io.to(`user:${bet.userId}`).emit('wallet:updated', {
              balance: Number(userWallet.balance),
              reserved: Number(userWallet.reserved),
              available: Number(userWallet.balance) - Number(userWallet.reserved),
              transaction: null as any,
            });
          }

          trackEvent({ eventType: 'PAYOUT_CREATED', userId: bet.userId, roundId, betId: bet.id, amount: String(Number(bet.amount) * multiplier) });
        }
      } catch (error) {
        // One bet's failure must never break the batch; the settlement-level
        // guards in processCashout (C1) own the money-safety invariants.
        console.error('[GameEngine] Auto-cashout failed for bet', bet.id, error);
      }
    }
  }

  private async broadcastHistory(): Promise<void> {
    const rounds = await roundManager.getRecentRounds(20);
    this.io.emit('round:history', {
      history: rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        crashPoint: r.crashPoint ? Number(r.crashPoint) : 0,
        serverSeedHash: r.serverSeedHash ?? null,
      })),
      // Provably-fair commit info (audit M2): active seed hash + rotation
      // countdown, so clients can show verification state.
      serverSeedHash: fairnessService.getPublicCommit().serverSeedHash,
      roundsRemaining: fairnessService.getPublicCommit().roundsRemaining,
    });
  }

  getCurrentMultiplier(): number {
    const round = roundManager.getCurrentRound();
    if (!round || round.phase !== GamePhase.FLYING || !round.startedAt) {
      return 1.0;
    }
    const elapsed = Date.now() - new Date(round.startedAt).getTime();
    return multiplierEngine.calculateMultiplier(elapsed);
  }

  getRoundId(): string | null {
    return roundManager.getCurrentRound()?.id || null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
