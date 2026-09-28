// Live reproduction harness — Step 1 of the withdrawal audit.
// Real user (real API), real wallet seeded to 1000.00 ETB, real withdrawal
// submission through /api/withdrawals, real admin approve/reject through
// /api/admin/withdrawals/:id/approve|reject. Exact DB values dumped at every
// step using the same Prisma client the server uses.
import { apiGet, apiPost } from './money-audit-auth.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const idents = JSON.parse(readFileSync('.freebuff/audit-identities.json', 'utf8'));
const { adminToken, adminId } = idents;
const prisma = new PrismaClient();

// Fresh user each run (withdrawal cooldown is per-user, 15 min)
const RUN_STAMP = Date.now();
const fresh = await (await import('./money-audit-auth.mjs')).apiRegister(
  `audit-u-${RUN_STAMP}@example.com`, 'Audit2026x', `09${String(RUN_STAMP).slice(-8)}`, 'Audit User'
);
const userToken = fresh.token;
const userId = fresh.userId;

const walletSnap = async (label) => {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  const line = `${label}: total=${Number(w.balance).toFixed(2)} available=${(Number(w.balance) - Number(w.reserved)).toFixed(2)} reserved=${Number(w.reserved).toFixed(2)}`;
  console.log(line);
  return w;
};
const wdSnap = async (label, id) => {
  const x = await prisma.withdrawal.findUnique({ where: { id } });
  console.log(`${label}: withdrawal status=${x.status} amount=${Number(x.amount).toFixed(2)} processedBy=${x.processedBy ?? '—'}`);
  return x;
};

// ---------- Step A: seed wallet to exactly 1000.00 via direct DB (test fixture) ----------
await prisma.wallet.update({ where: { userId }, data: { balance: 1000.00, reserved: 0 } });
await prisma.walletTransaction.create({
  data: {
    walletId: (await prisma.wallet.findUnique({ where: { userId } })).id,
    // credit the DELTA (980): signup bonus already put 20 in the wallet
    type: 'ADMIN_CREDIT', amount: 980.00, balanceBefore: 20, balanceAfter: 1000.00,
    status: 'COMPLETED', description: 'AUDIT FIXTURE: seed to 1000.00', processedBy: adminId,
  },
});
console.log('=== A. SEEDED (direct DB fixture) ===');
await walletSnap('A');

// ---------- Step B: submit withdrawal 300.00 through the real API ----------
console.log('\n=== B. SUBMIT WITHDRAWAL 300.00 (real API) ===');
const sub = await apiPost('/withdrawals', userToken, {
  amount: '300.00', paymentMethod: 'TELEBIRR', accountNumber: '0912345678', accountHolder: 'Audit User',
});
console.log('API response:', JSON.stringify(sub).slice(0, 220));
if (!sub.success) { console.log('SUBMIT FAILED — stopping'); process.exit(1); }
const wdId = sub.data.id;
await walletSnap('B after submit');
await wdSnap('B', wdId);

// ---------- Step C: try to bet while withdrawal is PENDING (spending reserved funds?) ----------
console.log('\n=== C. BET WHILE PENDING (socket bet:place) ===');
const { io } = await import('socket.io-client');
const socket = io('http://localhost:4000', { auth: { token: userToken }, transports: ['websocket'] });

// Wait for the next BETTING phase via the engine's round:state broadcast
const bettingState = await new Promise((resolve) => {
  const to = setTimeout(() => resolve(null), 30000);
  const onState = (s) => { if (s?.phase === 'BETTING') { clearTimeout(to); socket.off('round:state', onState); resolve(s); } };
  socket.on('round:state', onState);
});
console.log('BETTING window opened:', bettingState ? `roundId=${bettingState.roundId}` : 'TIMEOUT');

let betResult = null;
if (bettingState) {
  // available = 1000 - 300 reserved = 700. A 700.01 bet must FAIL (reserved not spendable).
  betResult = await new Promise((resolve) => {
    socket.emit('bet:place', { amount: '700.01', slot: 2 }, (r) => resolve(r));
    setTimeout(() => resolve({ timeout: true }), 6000);
  });
  console.log('BET 700.01 (would overdraw into reserved) RESULT:', JSON.stringify(betResult));

  // A 100 bet (within available 700) should SUCCEED — auto-cashout 1.01 keeps it clean
  const bet2 = await new Promise((resolve) => {
    socket.emit('bet:place', { amount: '100.00', slot: 1, autoCashout: 1.01 }, (r) => resolve(r));
    setTimeout(() => resolve({ timeout: true }), 6000);
  });
  console.log('BET 100.00 (available funds, autoCashout 1.01) RESULT:', JSON.stringify(bet2).slice(0, 200));
}
socket.disconnect();

await walletSnap('C after bet attempt');

// If the 100 bet succeeded it will settle on its own (crash or cashout) — poll briefly
await new Promise((r) => setTimeout(r, 4000));

// ---------- Step D: APPROVE via real admin API ----------
console.log('\n=== D. ADMIN APPROVE ===');
const appr = await apiPost(`/admin/withdrawals/${wdId}/approve`, adminToken, {});
console.log('approve API:', JSON.stringify(appr).slice(0, 220));
await walletSnap('D after approve');
await wdSnap('D', wdId);

// ---------- Step E: separate REJECTED withdrawal (fresh user — cooldown) ----------
console.log('\n=== E. SECOND USER -> WITHDRAW 300 -> REJECT ===');
const { apiRegister } = await import('./money-audit-auth.mjs');
const user2 = await apiRegister(`audit-u2-${RUN_STAMP}@example.com`, 'Audit2026x', `07${String(RUN_STAMP).slice(-8)}`, 'Audit User Two');
const u2id = user2.userId;
await prisma.wallet.update({ where: { userId: u2id }, data: { balance: 1000.00, reserved: 0 } });
await prisma.walletTransaction.create({
  data: {
    walletId: (await prisma.wallet.findUnique({ where: { userId: u2id } })).id,
    type: 'ADMIN_CREDIT', amount: 980.00, balanceBefore: 20, balanceAfter: 1000.00,
    status: 'COMPLETED', description: 'AUDIT FIXTURE: seed to 1000.00', processedBy: adminId,
  },
});
const sub2 = await apiPost('/withdrawals', user2.token, {
  amount: '300.00', paymentMethod: 'CBE', accountNumber: '1000123456789', accountHolder: 'Audit User Two',
});
console.log('submit2:', JSON.stringify(sub2).slice(0, 160));
if (sub2.success) {
  const wd2 = sub2.data.id;
  const w2pre = await prisma.wallet.findUnique({ where: { userId: u2id } });
  console.log(`E after submit: total=${Number(w2pre.balance).toFixed(2)} available=${(Number(w2pre.balance) - Number(w2pre.reserved)).toFixed(2)} reserved=${Number(w2pre.reserved).toFixed(2)}`);
  const rej = await apiPost(`/admin/withdrawals/${wd2}/reject`, adminToken, { reason: 'audit test' });
  console.log('reject API:', JSON.stringify(rej).slice(0, 160));
  const w2post = await prisma.wallet.findUnique({ where: { userId: u2id } });
  console.log(`E after reject: total=${Number(w2post.balance).toFixed(2)} available=${(Number(w2post.balance) - Number(w2post.reserved)).toFixed(2)} reserved=${Number(w2post.reserved).toFixed(2)}`);
  const recon = await fetch('http://localhost:4000/api/admin/reconcile/' + w2post.id, { headers: { Authorization: `Bearer ${adminToken}` } }).then((r) => r.json()).catch(() => null);
  console.log('reconciliation:', JSON.stringify(recon).slice(0, 220));
}

// ---------- Transactions ledger ----------
console.log('\n=== LEDGER user1 (all wallet transactions, newest last) ===');
const w = await prisma.wallet.findUnique({ where: { userId }, include: { transactions: { orderBy: { createdAt: 'asc' } } } });
for (const t of w.transactions) {
  console.log(`${t.type.padEnd(10)} amount=${Number(t.amount).toFixed(2).padStart(8)} before=${Number(t.balanceBefore).toFixed(2).padStart(8)} after=${Number(t.balanceAfter).toFixed(2).padStart(8)} ${t.status.padEnd(9)} ${t.description.slice(0, 60)} ref=${t.referenceId ?? '—'}`);
}
console.log('\n=== LEDGER user2 ===');
const w2 = await prisma.wallet.findUnique({ where: { userId: u2id }, include: { transactions: { orderBy: { createdAt: 'asc' } } } });
for (const t of w2.transactions) {
  console.log(`${t.type.padEnd(10)} amount=${Number(t.amount).toFixed(2).padStart(8)} before=${Number(t.balanceBefore).toFixed(2).padStart(8)} after=${Number(t.balanceAfter).toFixed(2).padStart(8)} ${t.status.padEnd(9)} ${t.description.slice(0, 60)} ref=${t.referenceId ?? '—'}`);
}
await prisma.$disconnect();
