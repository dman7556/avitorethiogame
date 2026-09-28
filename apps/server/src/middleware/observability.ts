import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { metricsEngine } from '../analytics/metrics-engine';

/**
 * OBSERVABILITY MIDDLEWARE.
 *
 * - Assigns a request id to every API request (echoed in the response header
 *   and attached to `req` so routes can log/track with it).
 * - Emits ONE structured log line per request (method, path, status, ms,
 *   requestId) — never bodies, never tokens.
 * - Records financial-route latency into the metrics engine for p50/p95/p99.
 *
 * SECURITY: never logs passwords, tokens, codes, or secrets. Only metadata.
 */

const FINANCIAL_PREFIXES = ['/api/deposits', '/api/withdrawals', '/api/bets', '/api/wallet'];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestObservability(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    try {
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      const isFinancial = FINANCIAL_PREFIXES.some((p) => req.path.startsWith(p));
      if (isFinancial) {
        metricsEngine.recordLatency(ms);
      }
      // Structured single-line log (grep-friendly JSON-ish).
      console.log(JSON.stringify({
        t: new Date().toISOString(),
        kind: 'http',
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10,
      }));
    } catch {
      /* observability must never throw */
    }
  });

  next();
}
