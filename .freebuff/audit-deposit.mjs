// Step 4 live re-audit: DEPOSIT flow + H1 dual control.
// Real APIs end-to-end: multipart deposit submission, admin approve/reject,
// envelope dual-control with two different admins. Exact numbers at each step.
import { apiRegister, apiGet, apiPost } from './money-audit-auth.mjs';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const idents = JSON.parse(readFileSync('.freebuff/audit-identities.json', 'utf8'));
const { adminToken, adminId } = idents;
const API = 'http://localhost:4000';
const prisma = new PrismaClient();

const stamp = Date.now();
const u = await apiRegister(`audit-dep-${stamp}@example.com`, 'Audit2026x', `09${String(stamp).slice(-8)}`, 'Deposit Audit');
const uid = u.userId;
await prisma.wallet.update({ where: { userId: uid }, data: { balance: 0 } });
console.log('user registered, wallet zeroed:', uid);

const snap = async (label) => {
  const w = await prisma.wallet.findUnique({ where: { userId: uid } });
  console.log(`${label}: balance=${Number(w.balance).toFixed(2)} reserved=${Number(w.reserved).toFixed(2)}`);
  return w;
};

// Second admin for dual control
const a2 = await apiRegister(`audit-admin2-${stamp}@example.com`, 'Audit2026x', `07${String(stamp).slice(-8)}`, 'Deposit Admin Two');
const { execSync } = await import('child_process');
const SQLITE = 'C:/Users/hp/AppData/Local/Android/Sdk/platform-tools/sqlite3';
execSync(`"${SQLITE}" dev.db "UPDATE User SET role='ADMIN' WHERE id='${a2.userId}';"`);
console.log('second admin elevated:', a2.userId);

// ---------- 1. Submit deposit (multipart, small PNG) ----------
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fd = new FormData();
fd.append('amount', '500');
fd.append('paymentMethod', 'TELEBIRR');
fd.append('screenshot', new Blob([PNG], { type: 'image/png' }), 'proof.png');
const sub = await fetch(`${API}/api/deposits`, {
  method: 'POST', headers: { Authorization: `Bearer ${u.token}` }, body: fd,
}).then((r) => r.json());
console.log('deposit submit:', JSON.stringify(sub).slice(0, 180));
if (!sub.success) process.exit(1);
const depId = sub.data.id;
await snap('after submit (must be unchanged)');

// ---------- 2. REJECT path first: no credit ----------
const rej = await apiPost(`/admin/deposits/${depId}/reject`, adminToken, { reason: 'deposit audit reject test' });
console.log('reject:', JSON.stringify(rej).slice(0, 140));
await snap('after reject (must still be 0)');

// ---------- 3. New deposit, approve with EXACT amount ----------
const fd2 = new FormData();
fd2.append('amount', '500');
fd2.append('paymentMethod', 'TELEBIRR');
fd2.append('screenshot', new Blob([PNG], { type: 'image/png' }), 'proof2.png');
const sub2 = await fetch(`${API}/api/deposits`, {
  method: 'POST', headers: { Authorization: `Bearer ${u.token}` }, body: fd2,
}).then((r) => r.json());
const dep2 = sub2.data.id;
console.log('deposit2 submitted:', dep2);
const appr = await apiPost(`/admin/deposits/${dep2}/approve`, adminToken, { creditAmount: 500, reason: 'deposit audit approve test' });
console.log('approve exact 500:', JSON.stringify(appr).slice(0, 200));
await snap('after approve (must be exactly 500)');

// ---------- 4. H1 dual control: over-envelope credit ----------
// submittedAmount 500 → envelope 5000; maximumDeposit setting is 50000.
// To exceed the envelope: credit 5001..50000. Use 6000 (> 10×500).
const fd3 = new FormData();
fd3.append('amount', '500');
fd3.append('paymentMethod', 'CBE');
fd3.append('screenshot', new Blob([PNG], { type: 'image/png' }), 'proof3.png');
const sub3 = await fetch(`${API}/api/deposits`, {
  method: 'POST', headers: { Authorization: `Bearer ${u.token}` }, body: fd3,
}).then((r) => r.json());
const dep3 = sub3.data.id;
console.log('deposit3 submitted:', dep3);
const before3 = await snap('before over-envelope attempt');

// 4a. same admin approving their own over-envelope → must fail, no credit
const self1 = await apiPost(`/admin/deposits/${dep3}/approve`, adminToken, { creditAmount: 6000, reason: 'dual control test one' });
console.log('admin1 over-envelope attempt:', JSON.stringify(self1).slice(0, 200));
await snap('after admin1 attempt (no credit yet)');

// 4b. same admin again → DUAL_CONTROL_SAME_ADMIN, no credit
const self2 = await apiPost(`/admin/deposits/${dep3}/approve`, adminToken, { creditAmount: 6000, reason: 'dual control test again' });
console.log('admin1 retry:', JSON.stringify(self2).slice(0, 200));
await snap('after retry (no credit yet)');

// 4c. amount mismatch from second admin → error, no credit
const mismatch = await apiPost(`/admin/deposits/${dep3}/approve`, a2.token, { creditAmount: 7000, reason: 'dual control mismatch test' });
console.log('admin2 amount-mismatch:', JSON.stringify(mismatch).slice(0, 200));
await snap('after mismatch (no credit yet)');

// 4d. second admin, same amount → approved, credited exactly 6000
const dual = await apiPost(`/admin/deposits/${dep3}/approve`, a2.token, { creditAmount: 6000, reason: 'dual control second admin' });
console.log('admin2 same-amount approval:', JSON.stringify(dual).slice(0, 260));
await snap('after dual-control approval (must be 6500)');

// ---------- ledger + reconciliation ----------
const w = await prisma.wallet.findUnique({ where: { userId: uid }, include: { transactions: { orderBy: { createdAt: 'asc' } } } });
console.log('\n=== LEDGER ===');
for (const t of w.transactions) {
  console.log(`${t.type.padEnd(8)} amount=${Number(t.amount).toFixed(2).padStart(8)} before=${Number(t.balanceBefore).toFixed(2).padStart(8)} after=${Number(t.balanceAfter).toFixed(2).padStart(8)} ${t.description.slice(0, 80)}`);
}
const recon = await fetch(`${API}/api/admin/reconcile/${w.id}`, { headers: { Authorization: `Bearer ${adminToken}` } }).then((r) => r.json());
console.log('reconciliation:', JSON.stringify(recon.data));

await prisma.$disconnect();
