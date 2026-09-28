// Quantify historical damage of the approve-did-not-deduct bug.
// Pre-fix signature: a COMPLETED WITHDRAWAL row (−amount) exists whose balance
// deduction never happened → ledgerSum - balance == -(sum of those payouts).
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const FIX_TIME = new Date('2026-09-20T23:05:00.000Z'); // fixed approveWithdrawal hot-reloaded

const wallets = await prisma.wallet.findMany();
const report = [];
for (const w of wallets) {
  const txs = await prisma.walletTransaction.findMany({ where: { walletId: w.id } });
  const ledgerSum = txs.reduce((s, t) => s + Number(t.amount), 0);
  const delta = +(ledgerSum - Number(w.balance)).toFixed(2);
  if (Math.abs(delta) <= 0.005) continue;

  // Pre-fix realized payout rows (negative amounts, before the fix)
  const payouts = await prisma.walletTransaction.findMany({
    where: { walletId: w.id, type: 'WITHDRAWAL', status: 'COMPLETED', amount: { lt: 0 }, createdAt: { lt: FIX_TIME } },
  });
  const payoutSum = +payouts.reduce((s, t) => s + Number(t.amount), 0).toFixed(2); // negative
  const user = await prisma.user.findUnique({ where: { id: w.userId }, select: { email: true, name: true, createdAt: true } });
  report.push({
    walletId: w.id, userId: w.userId, email: user?.email, balance: Number(w.balance),
    delta, payoutSum, isPureBug: Math.abs(delta - payoutSum) < 0.005 && payoutSum < 0,
    hasPayouts: payoutSum < 0,
  });
}
const pure = report.filter((r) => r.isPureBug);
const mixed = report.filter((r) => r.hasPayouts && !r.isPureBug);
const noPayout = report.filter((r) => !r.hasPayouts);
console.log(`flagged: ${report.length} | pure bug victims: ${pure.length} | withdrawals + other drift: ${mixed.length} | drift w/o withdrawals: ${noPayout.length}`);
let total = 0;
for (const r of pure) {
  total += -r.payoutSum;
  console.log(`BUG-VICTIM user=${r.userId} email=${r.email} balance=${r.balance.toFixed(2)} overpaid=${(-r.payoutSum).toFixed(2)}`);
}
console.log(`TOTAL excess spendable funds attributable to the bug: ${total.toFixed(2)} ETB`);
console.log(`\n=== wallets with withdrawals but mixed drift: ${mixed.length} ===`);
for (const r of mixed.slice(0, 8)) console.log(`user=${r.userId} email=${r.email} balance=${r.balance.toFixed(2)} delta=${r.delta.toFixed(2)} payoutSum=${r.payoutSum.toFixed(2)}`);
console.log(`\n=== drift without any withdrawal (pre-existing, not this bug): ${noPayout.length} ===`);
for (const r of noPayout.slice(0, 8)) console.log(`user=${r.userId} email=${r.email} balance=${r.balance.toFixed(2)} delta=${r.delta.toFixed(2)}`);
await prisma.$disconnect();
