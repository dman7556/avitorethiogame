/**
 * Server-authoritative multiplier engine.
 *
 * FAIRNESS NOTE (see GAME_FAIRNESS_MODEL.md):
 * multiplier(t) = e^(k·t) with a FIXED growth constant k — deliberately NOT
 * a function of the crash point. Varying the slope per-round would leak the
 * outcome mid-flight (observers could infer an imminent crash from curve
 * shape). Here the curve is identical in every round; when it ends is the
 * secret, never how fast it grows.
 */

const GROWTH_RATE = 0.05; // per second — same for every round, always

export class MultiplierEngine {
  /**
   * Calculate the multiplier at a given time elapsed since round start.
   * Pure function of (elapsedMs). Independent of crash point, users,
   * balances, bets, platform exposure — everything.
   *
   * @param elapsedMs Time elapsed since the round started (in milliseconds)
   */
  calculateMultiplier(elapsedMs: number): number {
    if (elapsedMs <= 0) return 1.0;

    const seconds = elapsedMs / 1000;
    const multiplier = Math.exp(GROWTH_RATE * seconds);

    // Floor to 2 decimal places, minimum 1.00
    return Math.max(1.0, Math.floor(multiplier * 100) / 100);
  }

  /**
   * Authoritative multiplier used for cashout payouts.
   * Same formula as displayed — no discrepancy between shown and paid.
   */
  calculateCashoutMultiplier(elapsedMs: number): number {
    return this.calculateMultiplier(elapsedMs);
  }

  /**
   * Check if the current multiplier has reached or exceeded the crash point.
   */
  hasCrashed(elapsedMs: number, crashPoint: number): boolean {
    const multiplier = this.calculateMultiplier(elapsedMs);
    return multiplier >= crashPoint;
  }
}

export const multiplierEngine = new MultiplierEngine();
