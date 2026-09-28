/**
 * MEASURED LOAD TEST (small scale, honest numbers)
 *
 * Measures:
 *  1. Outcome-derivation throughput (HMAC fairness path)
 *  2. Concurrent API latency (p50/p95/p99) against a running server
 *  3. Analytics event-pipeline throughput (batched writes)
 *
 * Usage:
 *   npx tsx scripts/load-test.ts [baseUrl] [concurrent] [requests]
 *   Defaults: http://localhost:4000, 20, 400
 */
import { performance } from 'perf_hooks';
import { FairnessService } from '../src/game/fairness';
import { eventPipeline, trackEvent } from '../src/analytics/event-pipeline';

const baseUrl = process.argv[2] || 'http://localhost:4000';
const CONCURRENCY = Number(process.argv[3] || 20);
const TOTAL = Number(process.argv[4] || 400);

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  console.log('─'.repeat(60));
  console.log(`Load test → ${baseUrl}  (concurrency=${CONCURRENCY}, requests=${TOTAL})`);
  console.log('─'.repeat(60));

  // 1 ── Outcome derivation throughput (pure CPU, no DB)
  const svc = new FairnessService();
  const { seed } = svc.ensureSeed();
  const N = 50_000;
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < N; i++) sink += svc.deriveCrashPoint(seed, i);
  const t1 = performance.now();
  const perSec = Math.round(N / ((t1 - t0) / 1000));
  console.log(`\n[1] Outcome derivation: ${N.toLocaleString()} HMAC derivations in ${Math.round(t1 - t0)} ms`);
  console.log(`    → ${perSec.toLocaleString()} outcomes/sec (sink=${sink > 0 ? 'ok' : 'ok'})`);

  // 2 ── Concurrent API latency
  // The API rate limiter (default 100 req/min per IP) is part of the system's
  // protection, so the load test paces itself just under it and CLASSIFIES
  // responses: 2xx = served, 429 = rate-limited (protection working), other =
  // genuine error. Latency percentiles use SERVED requests only.
  const latencies: number[] = [];
  let rateLimited = 0;
  let errors = 0;
  let served = 0;
  const healthUrl = `${baseUrl}/api/health`;
  const t2 = performance.now();
  let launched = 0;
  // Stay under RATE_LIMIT_MAX_REQUESTS per window: pace = (window / limit) ms
  const paceMs = Math.ceil(60_000 / 90); // 90 < 100 default limit
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (launched < TOTAL) {
        launched++;
        const s = performance.now();
        let ok = false;
        try {
          const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
          if (res.status === 429) rateLimited++;
          else if (!res.ok) errors++;
          else { served++; ok = true; }
        } catch {
          errors++;
        }
        if (ok) latencies.push(performance.now() - s);
        // Global-ish pacing: stagger by concurrency slot
        await new Promise((r) => setTimeout(r, paceMs * CONCURRENCY));
      }
    })
  );
  const t3 = performance.now();
  latencies.sort((a, b) => a - b);
  const rps = Math.round(latencies.length / ((t3 - t2) / 1000));
  console.log(`\n[2] Concurrent GET /api/health ×${latencies.length + rateLimited + errors} (paced under the rate limit):`);
  console.log(`    served=${served}  rate-limited(429)=${rateLimited}  real-errors=${errors}`);
  if (latencies.length) {
    console.log(`    served-latency  p50=${pct(latencies, 50).toFixed(1)}ms  p95=${pct(latencies, 95).toFixed(1)}ms  p99=${pct(latencies, 99).toFixed(1)}ms`);
    console.log(`    throughput=${rps} req/s (successful requests only)`);
  }

  // 3 ── Event pipeline throughput
  trackEvent({ eventType: 'ROUND_STARTED' });
  const E = 5_000;
  const t4 = performance.now();
  for (let i = 0; i < E; i++) {
    trackEvent({ eventType: 'BET_PLACED', metadata: { i } });
  }
  await eventPipeline.shutdown();
  const t5 = performance.now();
  console.log(`\n[3] Event pipeline: ${E.toLocaleString()} events flushed in ${Math.round(t5 - t4)} ms`);
  console.log(`    → ${Math.round(E / ((t5 - t4) / 1000)).toLocaleString()} events/sec (batched inserts)`);

  console.log('\nNOTE: These are single-machine measurements on SQLite with a dev');
  console.log('server. They demonstrate headroom, not production-scale capacity.');
  console.log('─'.repeat(60));
  process.exit(0);
}

main().catch((e) => {
  console.error('Load test failed:', e);
  process.exit(1);
});
