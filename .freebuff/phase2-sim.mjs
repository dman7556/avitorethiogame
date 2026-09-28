// Phase 2 production simulation (no secrets; run: node .freebuff/phase2-sim.mjs)
// Simulates: Vercel frontend at http://localhost:4173 (prod build w/ VITE_API_URL)
// calling Oracle backend at http://localhost:4000 (CLIENT_URL allow-list = 4173+5173).
import { io } from 'socket.io-client';

const FRONT = 'http://localhost:4173'; // simulated Vercel origin
const API = 'http://localhost:4000';   // simulated Oracle backend (baked into sim bundle)
const EVIL = 'http://evil.example';
const results = [];
const ok = (name, pass, detail = '') =>
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);

// 1. CORS preflight from the production frontend origin
const pre = await fetch(`${API}/api/wallet`, {
  method: 'OPTIONS',
  headers: { Origin: FRONT, 'Access-Control-Request-Method': 'GET',
             'Access-Control-Request-Headers': 'authorization' },
});
ok('CORS preflight (4173 → backend)', pre.status === 204 || pre.status === 200,
   `status=${pre.status} acao=${pre.headers.get('access-control-allow-origin')}`);
ok('preflight allow-origin echoes frontend', pre.headers.get('access-control-allow-origin') === FRONT,
   pre.headers.get('access-control-allow-origin') ?? 'none');

// 2. Negative CORS: disallowed origin gets no allow-origin header
const evil = await fetch(`${API}/api/wallet`, {
  method: 'OPTIONS', headers: { Origin: EVIL, 'Access-Control-Request-Method': 'GET' },
});
const evilAcao = evil.headers.get('access-control-allow-origin');
ok('negative CORS (evil origin blocked)', !evilAcao || !evilAcao.includes('evil.example'),
   `acao=${evilAcao ?? 'absent (correctly not echoed)'}`);

// 3. Register a fresh user from the production origin
const stamp = Date.now();
const email = `phase2sim${stamp}@test.local`;
const reg = await fetch(`${API}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: FRONT },
  body: JSON.stringify({ name: 'Phase Two Sim', email, phone: `+2519${String(stamp).slice(-8)}`, password: 'SimPass!234' }),
});
const regBody = await reg.json().catch(() => ({}));
ok('registration (prod origin)', reg.status === 200 && regBody?.success === true,
   `status=${reg.status} err=${regBody?.error ?? 'none'}`);
const token = regBody?.data?.token;

// 4. Authenticated reads with Bearer token from production origin
const me = await fetch(`${API}/api/auth/me`, {
  headers: { Authorization: `Bearer ${token}`, Origin: FRONT },
});
const meBody = await me.json().catch(() => ({}));
ok('GET /api/auth/me (Bearer)', me.status === 200 && !!(meBody?.data?.user?.id ?? meBody?.data?.id),
   `status=${me.status}`);

const wallet = await fetch(`${API}/api/wallet`, {
  headers: { Authorization: `Bearer ${token}`, Origin: FRONT },
});
ok('GET /api/wallet (Bearer)', wallet.status === 200, `status=${wallet.status}`);

const rounds = await fetch(`${API}/api/rounds`, { headers: { Origin: FRONT } });
const roundsBody = await rounds.json().catch(() => ({}));
const roundCount = Array.isArray(roundsBody) ? roundsBody.length
  : Array.isArray(roundsBody?.data) ? roundsBody.data.length
  : Array.isArray(roundsBody?.data?.rounds) ? roundsBody.data.rounds.length : -1;
ok('GET /api/rounds (public, game data)', rounds.status === 200 && roundCount !== 0,
   `status=${rounds.status} count=${roundCount}`);

// 5. Socket.IO handshake from the production origin (same CORS allow-list)
const socket = await new Promise((resolve) => {
  const s = io(API, {
    transports: ['polling', 'websocket'],
    extraHeaders: { Origin: FRONT },
    reconnection: false,
    timeout: 10000,
  });
  const done = (val) => { try { s.close(); } catch {} resolve(val); };
  s.on('connect', () => done(true));
  s.on('connect_error', (e) => { console.error('  socket connect_error:', e.message); done(false); });
  setTimeout(() => done(false), 11000);
});
ok('Socket.IO connect (prod origin)', socket === true);

// 6. Socket.IO negative: foreign origin must be refused by CORS
const evilSock = await new Promise((resolve) => {
  const s = io(API, {
    transports: ['polling'],
    extraHeaders: { Origin: EVIL },
    reconnection: false,
    timeout: 8000,
  });
  const done = (val) => { try { s.close(); } catch {} resolve(val); };
  s.on('connect', () => done('connected'));
  s.on('connect_error', () => done('blocked'));
  setTimeout(() => done('timeout'), 9000);
});
ok('Socket.IO negative CORS (evil origin)', evilSock !== 'connected', `result=${evilSock}`);

// 7. Legacy /uploads delivery from backend origin (12 legacy DB rows point here)
import { readdirSync } from 'fs';
let upStatus = 'no-uploads-dir';
try {
  const dir = new URL('../apps/server/uploads/deposits/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (files.length) {
    const r = await fetch(`${API}/uploads/deposits/${encodeURIComponent(files[0])}`);
    upStatus = `status=${r.status} type=${r.headers.get('content-type') ?? '?'}`;
  } else {
    upStatus = 'uploads/deposits empty';
  }
} catch { upStatus = 'uploads/deposits dir not found'; }
ok('legacy /uploads served by backend', upStatus.startsWith('status=2'), upStatus);

console.log(results.join('\n'));
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
