// Step 4 (cont.): H4 pending-cap live test + C1 cashout exactly-once live test.
// H4: 3 pendings (cooldown back-dated between submissions — fixture-only
// manipulation of timestamps, cap logic untouched), 4th via REAL API must fail.
// C1: N concurrent cashout requests on the same bet — exactly one pays out.
import { apiRegister, apiPost } from './money-audit-auth.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const idents = JSON.parse(readFileSync('.freebuff/audit-identities.json', 'utf8'));
const { adminToken } = idents;
const prisma = new PrismaClient();
const stamp = Date.now();

// ---------- H4: 3 pending cap via real API ----------
console.log('=== H4: 3-PENDING CAP ===');
const u = await apiRegister(`audit-h4-${stamp}@example.com`, 'Audit2026x', `09${String(stamp).slice(-8)}`, 'H-Cap Audit');
await prisma.wallet.update({ where: { userId: u.userId }, data: { balance: 2000.00 } });
await prisma.walletTransaction.create({
  data: {
    walletId: (await prisma.wallet.findUnique({ where: { userId: u.userId } })).id,
    type: 'ADMIN_CREDIT', amount: 1980.00, balanceBefore: 20, balanceAfter: 2000.00,
    status: 'COMPLETED', description: 'AUDIT FIXTURE: seed to 2000.00', processedBy: idents.adminId,
  },
});
// balance 2000, min remaining 500 → max withdrawable 1500 total. 3×400=1200 ok.
const ids = [];
for (let i = 0; i < 3; i++) {
  const r = await apiPost('/withdrawals', u.token, {
    amount: '400.00', paymentMethod: i % 2 ? 'CBE' : 'TELEBIRR', accountNumber: '0911223344', accountHolder: 'H4 Audit',
  });
  if (!r.success) { console.log(`submit ${i + 1} FAILED:`, JSON.stringify(r)); break; }
  ids.push(r.data.id);
  // back-date past the cooldown so the CAP is the only blocker being tested
  await prisma.withdrawal.update({ where: { id: r.data.id }, data: { createdAt: new Date(Date.now() - 16 * 60_000) } });
  console.log(`submit ${i + 1}: PENDING (back-dated)`);
}
const fourth = await apiPost('/withdrawals', u.token, {
  amount: '100.00', paymentMethod: 'TELEBIRR', accountNumber: '0911223344', accountHolder: 'H4 Audit',
});
console.log('4th attempt:', JSON.stringify(fourth).slice(0, 180));
const w = await prisma.wallet.findUnique({ where: { userId: u.userId } });
console.log(`wallet after cap test: balance=${Number(w.balance).toFixed(2)} reserved=${Number(w.reserved).toFixed(2)} (expect 2000/800; 4th attempt must NOT touch funds)`);
console.log('withdrawal rows for user:', await prisma.withdrawal.count({ where: { userId: u.userId } }), '(expect 3 — no row for the 4th)');

// cleanup H4 user rows
await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
await prisma.withdrawal.deleteMany({ where: { userId: u.userId } });
await prisma.notification.deleteMany({ where: { userId: u.userId } });
await prisma.user.delete({ where: { id: u.userId } }).catch(() => undefined);

// ---------- C1: cashout exactly-once with concurrent real requests ----------
console.log('\n=== C1: CONCURRENT CASHOUT (exactly-once) ===');
const c1 = await apiRegister(`audit-c1-${stamp}@example.com`, 'Audit2026x', `07${String(stamp).slice(-8)}`, 'C-One Audit');
await prisma.wallet.update({ where: { userId: c1.userId }, data: { balance: 100.00 } });
await prisma.walletTransaction.create({
  data: {
    walletId: (await prisma.wallet.findUnique({ where: { userId: c1.userId } })).id,
    type: 'ADMIN_CREDIT', amount: 80.00, balanceBefore: 20, balanceAfter: 100.00,
    status: 'COMPLETED', description: 'AUDIT FIXTURE: seed to 100.00', processedBy: idents.adminId,
  },
});

const { io } = await import('socket.io-client');
const socket = io('http://localhost:4000', { auth: { token: c1.token }, transports: ['websocket'] });
const bettingState = await new Promise((resolve) => {
  const to = setTimeout(() => resolve(null), 30000);
  const onState = (s) => { if (s?.phase === 'BETTING') { clearTimeout(to); socket.off('round:state', onState); resolve(s); } };
  socket.on('round:state', onState);
});
if (!bettingState) { console.log('no betting window — aborting C1'); process.exit(1); }
const bet = await new Promise((resolve) => {
  socket.emit('bet:place', { amount: '50.00', slot: 1 }, (r) => resolve(r));
  setTimeout(() => resolve({ timeout: true }), 6000);
});
if (!bet.success || !bet.bet?.id) { console.log('bet failed, aborting:', JSON.stringify(bet)); process.exit(1); }
const betId = bet.bet.id;
console.log('bet placed, waiting for FLYING...');

await new Promise((resolve) => {
  const to = setTimeout(() => resolve(null), 20000);
  const onState = (s) => { if (s?.phase === 'FLYING') { clearTimeout(to); socket.off('round:state', onState); resolve(s); } };
  socket.on('round:state', onState);
});

// 10 concurrent cashout requests on the same bet
console.log('firing 10 concurrent cashout requests...');
const results = await Promise.all(
  Array.from({ length: 10 }, () => new Promise((resolve) => {
    socket.emit('bet:cashout', { betId }, (r) => resolve(r));
    setTimeout(() => resolve({ timeout: true }), 8000);
  }))
);
socket.disconnect();
const wins = results.filter((r) => r?.success).length;
const fails = results.filter((r) => !r?.success);
console.log(`cashout results: ${wins} succeeded, ${fails.length} rejected`);
console.log('rejections (should all be the same exactly-once reason):', [...new Set(fails.map((r) => r?.error || JSON.stringify(r).slice(0, 60)))]);

const w1 = await prisma.wallet.findUnique({ where: { userId: c1.userId } });
const betRow = await prisma.bet.findUnique({ where: { id: betId } });
const cashoutRows = await prisma.walletTransaction.count({ where: { referenceId: betId, type: 'WIN' } });
console.log(`wallet after cashouts: balance=${Number(w1.balance).toFixed(2)} reserved=${Number(w1.reserved).toFixed(2)}`);
console.log(`bet status: ${betRow.status}, payout: ${Number(betRow.payout).toFixed(2)}`);
console.log(`WIN ledger rows for this bet: ${cashoutRows} (must be 1)`);

await prisma.$disconnect();
