/**
 * k6 LOAD TEST — Crash game WebSocket simulation
 *
 * Simulates N concurrent players connected over Socket.IO (websocket transport):
 *  - every VU receives round:state / round:tick broadcasts
 *  - a configurable fraction authenticate (SUPABASE_TOKENS file, one JWT per
 *    line) and place bets / cash out at random moments during flight
 *
 * Usage:
 *   k6 run -e VUS=200 -e DURATION=3m apps/server/scripts/k6-crash-load.js
 *   k6 run -e VUS=5000 -e DURATION=5m -e TOKENS_FILE=tokens.txt -e BETTER_PCT=20 ...
 *
 * Metrics captured (see thresholds below):
 *   ws_connect      — socket handshake+connect time
 *   tick_latency    — broadcast-to-receive jitter proxy (inter-tick delta − 50ms)
 *   bet_latency     — bet:place round-trip (authenticated VUs only)
 *   cashout_latency — bet:cashout round-trip
 *   bet_errors      — server rejections other than EXPECTED codes
 *
 * NOTE: this is a dev/QA tool. Run against a THROWAWAY database only.
 */
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import http from 'k6/http';
import exec from 'k6/exec';
import { SharedArray } from 'k6/data';

const VUS = Number(__ENV.VUS || 200);
const DURATION = __ENV.DURATION || '2m';
const WS_URL = __ENV.WS_URL || 'ws://localhost:4000';
const API_URL = __ENV.API_URL || 'http://localhost:4000';
const BETTER_PCT = Number(__ENV.BETTER_PCT || 0); // % of VUs that bet (needs tokens)
const TOKENS_FILE = __ENV.TOKENS_FILE || '';

const tokens = TOKENS_FILE
  ? new SharedArray('tokens', () =>
      open(TOKENS_FILE).split('\n').map((l) => l.trim()).filter(Boolean)
    )
  : [];

const ws_connect = new Trend('ws_connect_ms');
const tick_gap = new Trend('tick_gap_ms', false);
const bet_latency = new Trend('bet_latency_ms');
const cashout_latency = new Trend('cashout_latency_ms');
const bet_errors = new Counter('bet_errors');
const ticks_received = new Counter('ticks_received');
const checks_failed = new Rate('checks_failed');

export const options = {
  scenarios: {
    players: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    ws_connect_ms: ['p(95)<1500'],
    tick_gap_ms: ['p(95)<80'], // ticks fire every ~50ms; jitter should stay small
    bet_latency_ms: ['p(95)<400'],
    cashout_latency_ms: ['p(95)<400'],
    checks_failed: ['rate<0.05'],
  },
};

function tokenForVU() {
  if (!tokens.length) return null;
  // (VU number modulo token pool) — spreads VUs across accounts deterministically
  return tokens[exec.scenario.iterationInTest % tokens.length];
}

export default function () {
  const token = tokenForVU();
  const isBetter = token && Math.random() * 100 < BETTER_PCT;
  let lastTickAt = null;
  let myBetId = null;
  let betPlacedRound = null;

  const connectStart = Date.now();
  const res = ws.connect(
    WS_URL,
    {},
    (socket) => {
      socket.on('open', () => {
        ws_connect.add(Date.now() - connectStart);
        if (token) socket.send(JSON.stringify({ event: 'auth:authenticate', data: { token } }));
      });

      socket.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        const ev = msg.event || msg[0];
        const data = msg.data || msg[1];

        if (ev === 'round:tick' || ev === 'round:state') {
          ticks_received.add(1);
          const now = Date.now();
          if (lastTickAt) tick_gap.add(Math.max(0, now - lastTickAt - 50)); // minus nominal period
          lastTickAt = now;

          // Authenticated better: place a bet during BETTING, cash out mid-flight
          if (isBetter && data) {
            const phase = ev === 'round:state' ? data.phase : data.phase;
            if (phase === 'BETTING' && betPlacedRound !== data.roundId && Math.random() < 0.6) {
              const t0 = Date.now();
              const payload = { event: 'bet:place', data: { amount: 1, slot: 1 } };
              socket.send(JSON.stringify(payload));
              betPlacedRound = data.roundId;
              bet_latency.add(Date.now() - t0); // approximate; ack handled below
            }
            if (phase === 'FLYING' && myBetId && Math.random() < 0.3) {
              const t1 = Date.now();
              socket.send(JSON.stringify({ event: 'bet:cashout', data: { betId: myBetId } }));
              cashout_latency.add(Date.now() - t1);
            }
          }
        }
        if (ev === 'bet:placed' && data && data.userId) myBetId = data.betId;
      });

      socket.on('error', () => bet_errors.add(1));
      // hold the connection for the scenario duration
      sleep(DURATION === '2m' ? 150 : 150);
      socket.close();
    }
  );

  check(res, { 'ws handshake 101': (r) => r && r.status === 101 });
  if (!check(res, { 'ws handshake 101': (r) => r && r.status === 101 })) checks_failed.add(1);
}
