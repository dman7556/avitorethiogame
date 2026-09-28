/**
 * STRUCTURED LOG LINE HELPERS (audit L1).
 *
 * Single convention for financial-domain logs, extending the JSON-line
 * pattern requestObservability() already established in middleware/observability.ts:
 *
 *   {"t":"<iso>","kind":"<area>","requestId":"<id>",...metadata}
 *
 * Rules (same as observability.ts):
 *   - Metadata only — never request/response bodies, tokens, codes, secrets.
 *   - One grep-friendly line per event; helpers never throw.
 *   - `amount` values are the app's own decimal strings (ETB), not raw float dumps.
 *
 * requestId correlation: services reachable from HTTP routes receive
 * `req.requestId` (set by observability.ts) explicitly; services not
 * reachable from HTTP (game-loop internals) log without it rather than
 * fabricating an id.
 */

export interface LogContext {
  requestId?: string;
  [key: string]: unknown;
}

function line(kind: string, ctx: LogContext, level: 'info' | 'error' = 'info'): void {
  try {
    const { requestId, ...meta } = ctx;
    const payload = JSON.stringify({
      t: new Date().toISOString(),
      kind,
      level,
      ...(requestId ? { requestId } : {}),
      ...meta,
    });
    if (level === 'error') {
      console.error(payload);
    } else {
      console.log(payload);
    }
  } catch {
    /* logging must never throw */
    try {
      console.log(JSON.stringify({ t: new Date().toISOString(), kind, level, error: 'log_serialization_failed' }));
    } catch {
      /* give up silently */
    }
  }
}

export const finLog = {
  bet: (ctx: LogContext) => line('bet', ctx),
  betError: (ctx: LogContext) => line('bet', ctx, 'error'),
  deposit: (ctx: LogContext) => line('deposit', ctx),
  depositError: (ctx: LogContext) => line('deposit', ctx, 'error'),
  withdrawal: (ctx: LogContext) => line('withdrawal', ctx),
  withdrawalError: (ctx: LogContext) => line('withdrawal', ctx, 'error'),
};
