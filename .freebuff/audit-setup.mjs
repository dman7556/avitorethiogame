// One-time identity setup for the money-flow audit.
// Uses the REAL /api/auth/register (same path a real user takes), then
// elevates the admin by flipping role='ADMIN' in the local DB — the same
// "direct, audited database operation" path middleware/auth.ts documents.
import { apiRegister, apiGet } from './money-audit-auth.mjs';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const stamp = Date.now();
const s9 = String(stamp).slice(-9); // 9 digits
const USER_EMAIL = `audit-user-${stamp}@example.com`;
const ADMIN_EMAIL = `audit-admin-${stamp}@example.com`;
const USER_PHONE_UNUSED = `09${s9}`;
const ADMIN_PHONE_UNUSED = `07${s9}`;
const PW = 'Audit2026x';
const SQLITE = 'C:/Users/hp/AppData/Local/Android/Sdk/platform-tools/sqlite3';

// route regex: ^(?:\+251|251|0)?(9|7)\d{8}$  => "0" + (9|7) + 8 digits = 10 total
const mkPhone = (prefix) => prefix + s9.slice(0, 8); // e.g. "09" + 8 digits

const user = await apiRegister(USER_EMAIL, PW, mkPhone('09'), 'Audit User');
console.log('USER registered:', user.userId);

const admin = await apiRegister(ADMIN_EMAIL, PW, mkPhone('07'), 'Audit Admin');
console.log('ADMIN registered:', admin.userId);

// Elevate admin role in the local DB (documented elevation mechanism)
execSync(`"${SQLITE}" dev.db "UPDATE User SET role='ADMIN' WHERE id='${admin.userId}';"`, { stdio: 'inherit' });

// Verify role took effect through the real admin API
const adminMe = await apiGet('/admin/dashboard', admin.token);
console.log('admin api check:', JSON.stringify(adminMe).slice(0, 120));

writeFileSync('.freebuff/audit-identities.json', JSON.stringify({
  stamp, USER_EMAIL, ADMIN_EMAIL, password: PW,
  userToken: user.token, userId: user.userId,
  adminToken: admin.token, adminId: admin.userId,
}, null, 2));
console.log('IDENTITIES_SAVED');
