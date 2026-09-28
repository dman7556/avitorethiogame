import crypto from 'crypto';

export interface CrashPointProvider {
  generateCrashPoint(): number;
}

/**
 * Generates crash points using cryptographically secure randomness.
 *
 * Uses the house edge formula: crashPoint = 1 / (1 - houseEdge) * (1 - random)
 * Clamped to [1.01, 10000] to ensure playable rounds.
 *
 * For the demo version, uses a 3% house edge.
 */
export class DemoCrashPointProvider implements CrashPointProvider {
  private houseEdge: number;

  constructor(houseEdge = 0.03) {
    this.houseEdge = houseEdge;
  }

  generateCrashPoint(): number {
    // Use crypto.randomBytes for cryptographic randomness
    const randomBytes = crypto.randomBytes(8);
    const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;

    // Standard crash game formula: crashPoint = (1 - houseEdge) / (1 - u)
    // where u is uniform in [0, 1)
    // This gives: P(crashPoint >= x) = (1 - houseEdge) / x for x >= 1
    // E.g. with 3% house edge, ~48% of rounds reach 2x, ~10% reach 10x
    const crashPoint = (1 - this.houseEdge) / (1 - randomValue);

    // Clamp to reasonable range
    const clamped = Math.max(1.01, Math.min(10000, crashPoint));

    // Round to 2 decimal places
    return Math.round(clamped * 100) / 100;
  }
}

/**
 * Deterministic crash point provider for testing.
 * Generates a sequence of predetermined crash points.
 */
export class DeterministicCrashPointProvider implements CrashPointProvider {
  private crashPoints: number[];
  private index = 0;

  constructor(crashPoints: number[]) {
    if (crashPoints.length === 0) {
      throw new Error('Must provide at least one crash point');
    }
    this.crashPoints = crashPoints;
  }

  generateCrashPoint(): number {
    const point = this.crashPoints[this.index % this.crashPoints.length];
    this.index++;
    return point;
  }

  reset(): void {
    this.index = 0;
  }
}
