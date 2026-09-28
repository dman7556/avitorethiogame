/**
 * Response sanitizers — the single choke point that prevents outcome leakage.
 *
 * INVARIANT: the serverSeed is only ever exposed for rounds that have
 * SETTLED (reveal happens at settlement), and only alongside its commit hash
 * so the reveal can be verified. crashPoint of an in-flight round is never
 * sent to any client. See GAME_FAIRNESS_MODEL.md.
 */
type RoundLike = {
  phase: string;
  crashPoint?: unknown;
  serverSeedHash?: string | null;
  serverSeed?: string | null;
  [k: string]: unknown;
};

export function safeRoundView<T extends RoundLike>(round: T): T {
  const revealed = round.phase === 'SETTLED';
  return {
    ...round,
    crashPoint: revealed ? round.crashPoint : null,
    serverSeed: revealed ? round.serverSeed ?? null : null,
    serverSeedHash: round.serverSeedHash ?? null,
  };
}
