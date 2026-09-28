/**
 * Money helper - thin wrapper around Prisma's Decimal for ETB amounts.
 * All money math in services MUST go through this module (no float arithmetic).
 * Prisma's Decimal is decimal.js under the hood and works on SQLite and Postgres.
 */
import { Decimal } from '@prisma/client/runtime/library';

export const money = {
  /** Max decimal places for ETB amounts */
  SCALE: 2,
  ZERO: new Decimal(0),

  fromNumber(n: number): Decimal {
    return new Decimal(n);
  },

  fromString(s: string): Decimal {
    return new Decimal(s);
  },

  fromDecimal(d: Decimal | string | number): Decimal {
    return new Decimal(d);
  },

  num(d: Decimal | string | number): number {
    return Number(d);
  },

  add(a: Decimal, b: Decimal): Decimal {
    return a.add(b);
  },

  sub(a: Decimal, b: Decimal): Decimal {
    return a.sub(b);
  },

  neg(a: Decimal): Decimal {
    return a.neg();
  },

  gt(a: Decimal, b: Decimal): boolean {
    return a.gt(b);
  },

  gte(a: Decimal, b: Decimal): boolean {
    return a.gte(b);
  },

  lt(a: Decimal, b: Decimal): boolean {
    return a.lt(b);
  },

  lte(a: Decimal, b: Decimal): boolean {
    return a.lte(b);
  },

  /** Round-trip check that a value fits ETB's 2-decimal scale */
  hasExcessPrecision(d: Decimal): boolean {
    return d.decimalPlaces() > this.SCALE;
  },

  /**
   * Parse a client-supplied amount string at the trust boundary (audit M7).
   *
   * Amounts cross the network as strings and are converted here — never via
   * JSON-parsed JS numbers, whose binary-float representation can already be
   * wrong before any validation runs (0.1 + 0.2 problems, 1e7 exponent forms,
   * etc.). Strict grammar: digits with at most 2 decimals, no sign, no
   * exponent, no separators. Returns a Decimal; null when malformed.
   */
  fromAmountString(s: unknown): Decimal | null {
    if (typeof s !== 'string') return null;
    const trimmed = s.trim();
    if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(trimmed)) return null;
    return this.fromString(trimmed);
  },
};
