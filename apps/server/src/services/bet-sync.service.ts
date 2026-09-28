/**
 * Fix 1 (connection-interruption audit): authoritative bet-state sync.
 *
 * The auth resync used to send only round state + chat. A client that
 * missed a settlement/cashout broadcast while disconnected could keep
 * showing a bet as ACTIVE (or not show a placed bet at all) indefinitely.
 *
 * This service builds the authoritative payload the server now emits on
 * every successful auth (fresh connect and reconnect alike): the user's
 * live bet rows plus their wallet balance, straight from the DB.
 *
 * Row selection rules:
 *  - QUEUED bets (pre-placed for a future round) are always included —
 *    the row keeps its placement round's id, so no round filter is used.
 *  - Live in-round bets (PENDING/PLACED/ACTIVE) are included when they
 *    belong to the current round OR were created recently (a placement
 *    whose broadcast the client missed).
 *  - Terminal rows (CASHED_OUT/LOST/CANCELLED) are included only when
 *    from the current round and fresh — enough to repair a display that
 *    missed the settlement broadcast, without resurrecting old history.
 */
import prisma from '../lib/prisma';
import { GameEngine } from '../game/GameEngine';

/** Window that counts as "recent" for non-current-round rows. */
export const SYNC_RECENT_WINDOW_MS = 90_000;

export interface BetSyncPayload {
  roundId: string | null;
  balance: number | null;
  bets: Array<{
    id: string;
    roundId: string;
    slot: number;
    amount: string;
    status: string;
    autoCashout: string | null;
    payout: string | null;
    cashoutMultiplier: string | null;
  }>;
}

const LIVE_STATUSES = ['PENDING', 'QUEUED', 'PLACED', 'ACTIVE'] as const;
const TERMINAL_STATUSES = ['CASHED_OUT', 'LOST', 'CANCELLED'] as const;

export class BetSyncService {
  constructor(
    private prismaClient: typeof prisma,
    /** Returns the engine's current round id (null before the first round). */
    private getCurrentRoundId: () => string | null = () => null
  ) {}

  /**
   * Authoritative sync payload for a user. Never reads client state —
   * the whole point is correcting a client that missed events.
   */
  async getSyncPayload(userId: string): Promise<BetSyncPayload> {
    const currentRoundId = this.getCurrentRoundId();
    const since = new Date(Date.now() - SYNC_RECENT_WINDOW_MS);

    const [rows, wallet] = await Promise.all([
      this.prismaClient.bet.findMany({
        where: {
          userId,
          OR: [
            { status: { in: [...LIVE_STATUSES] } },
            {
              status: { in: [...TERMINAL_STATUSES] },
              roundId: currentRoundId ?? '__none__',
              createdAt: { gte: since },
            },
          ],
        },
        select: {
          id: true,
          roundId: true,
          slot: true,
          amount: true,
          status: true,
          autoCashout: true,
          payout: true,
          cashoutMultiplier: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prismaClient.wallet.findUnique({
        where: { userId },
        select: { balance: true },
      }),
    ]);

    return {
      roundId: currentRoundId,
      balance: wallet ? Number(wallet.balance) : null,
      bets: rows.map((b) => ({
        id: b.id,
        roundId: b.roundId,
        slot: b.slot,
        amount: String(b.amount),
        status: b.status,
        autoCashout: b.autoCashout ? String(b.autoCashout) : null,
        payout: b.payout ? String(b.payout) : null,
        cashoutMultiplier: b.cashoutMultiplier
          ? String(b.cashoutMultiplier)
          : null,
      })),
    };
  }
}

/** Wire the engine accessor at module load — mirrors betManager's pattern. */
let engineAccessor: () => string | null = () => null;

export function setBetSyncEngine(engine: GameEngine): void {
  engineAccessor = () => engine.getRoundId();
}

export const betSyncService = new BetSyncService(prisma, () => engineAccessor());
