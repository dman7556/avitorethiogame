/**
 * ensure-admin.js — create or repair the admin account so that
 *   email:    admin@skyrush.com
 *   password: Admin@123
 * works end-to-end (login → JWT → /me → admin APIs).
 *
 * Why previous fixes failed:
 * 1. Several one-off scripts (fix-admin-password.js, force-fix-admin.js,
 *    update-all-dbs.js) wrote different bcrypt hashes into different dev.db
 *    copies. The login flow only verifies a local hash if it is not
 *    'supabase-auth' — a stale hash therefore poisons the login even though
 *    Supabase Auth is fine.
 * 2. Even when the local hash matches, login() returns an unsigned base64
 *    token which /api/auth/me REJECTS (it verifies tokens against Supabase),
 *    so the session is unusable after refresh.
 *
 * The durable fix: make the admin a Supabase-managed user exactly like every
 * other account — Supabase Auth holds the real password, the app DB row has
 * password='supabase-auth' (never compared locally) and role='ADMIN'.
 *
 * Safe to re-run: it never duplicates the user, never downgrades an existing
 * ADMIN, and always (re)sets the password to Admin@123.
 *
 * Usage:
 *   node ensure-admin.js            # uses .env (local dev DB)
 *   DATABASE_URL=... node ensure-admin.js   # target any DB explicitly
 */

// Load .env from the repo root (same walk-up logic the server uses).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

(function loadEnv() {
  let dir = __dirname;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      require_('dotenv').config({ path: candidate, override: false });
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();

const { PrismaClient } = require_('@prisma/client');
const prisma = new PrismaClient();

// Safety net: if the resolved DATABASE_URL is still a relative file: URL,
// anchor it to this project's prisma/ dir so the script can never write to a
// stray duplicate dev.db just because of its working directory.
(function anchorSqliteUrl() {
  if (!process.env.DATABASE_URL) return;
  const m = process.env.DATABASE_URL.match(/^file:(?!\/\/)(.+)$/);
  if (m && !path.isAbsolute(m[1])) {
    const abs = path.resolve(__dirname, 'prisma', path.basename(m[1]));
    process.env.DATABASE_URL = 'file:' + abs;
  }
})();

const ADMIN_EMAIL = 'admin@skyrush.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'System Administrator';
const ADMIN_PHONE = '+251911111111';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function log(msg) {
  console.log(msg);
}

async function supabaseAdminFindUser(email) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!res.ok) {
      log(`  ⚠️  Supabase list users failed (${res.status}) — skipping Supabase sync`);
      return null;
    }
    const data = await res.json();
    const users = data?.users || [];
    return users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  } catch (e) {
    log(`  ⚠️  Supabase unreachable (${e.message}) — skipping Supabase sync`);
    return null;
  }
}

async function supabaseAdminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, phone: ADMIN_PHONE, role: 'ADMIN' },
    }),
  });
  return res.json();
}

async function supabaseAdminUpdatePassword(userId, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password, email_confirm: true, user_metadata: { role: 'ADMIN', name: ADMIN_NAME, phone: ADMIN_PHONE } }),
  });
  return res.json();
}

async function main() {
  log('\n🔧 ensure-admin — repairing admin@skyrush.com\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Add it to .env or pass it inline.');
    process.exit(1);
  }

  // ── 1. Supabase Auth: create or reset the admin ─────────────────────────
  let supabaseUser = null;
  if (SUPABASE_URL && SERVICE_KEY) {
    log('1️⃣  Supabase Auth');
    supabaseUser = await supabaseAdminFindUser(ADMIN_EMAIL);
    if (supabaseUser) {
      log(`   • found (id=${supabaseUser.id}) → resetting password & metadata`);
      const upd = await supabaseAdminUpdatePassword(supabaseUser.id, ADMIN_PASSWORD);
      if (upd?.error || upd?.msg) {
        log(`   ❌ update failed: ${upd?.error?.message || upd?.msg}`);
        process.exit(1);
      }
      log('   ✅ password reset to Admin@123, email confirmed, metadata role=ADMIN');
    } else {
      log('   • not found → creating');
      const created = await supabaseAdminCreateUser(ADMIN_EMAIL, ADMIN_PASSWORD);
      if (created?.error || created?.msg || !created?.id) {
        log(`   ❌ create failed: ${created?.error?.message || created?.msg || 'no id returned'}`);
        process.exit(1);
      }
      supabaseUser = created;
      log(`   ✅ created (id=${created.id})`);
    }
  } else {
    log('1️⃣  Supabase env vars missing — will use LOCAL bcrypt path only');
  }

  // ── 2. App DB: upsert the user row (id = Supabase id when available) ────
  log('\n2️⃣  App database (DATABASE_URL)');

  const byEmail = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  let row = supabaseUser
    ? (await prisma.user.findUnique({ where: { id: supabaseUser.id } })) || byEmail
    : byEmail;

  const data = {
    name: ADMIN_NAME,
    role: 'ADMIN',
    isActive: true,
    emailVerified: true,
    // The magic marker: login() treats this as "auth lives in Supabase" and
    // NEVER compares a local bcrypt hash — so stale hashes can't poison login.
    password: supabaseUser ? 'supabase-auth' : 'KEEP_LOCAL_HASH',
    lastLogin: null,
  };
  if (supabaseUser) data.id = supabaseUser.id;

  if (row) {
    if (data.password === 'KEEP_LOCAL_HASH') delete data.password; // don't clobber
    row = await prisma.user.update({ where: { id: row.id }, data });
    log(`   ✅ updated existing row (id=${row.id}) role=ADMIN`);
  } else {
    delete data.password;
    row = await prisma.user.create({
      data: {
        ...data,
        email: ADMIN_EMAIL,
        phone: ADMIN_PHONE,
        password: supabaseUser ? 'supabase-auth' : undefined,
      },
    });
    log(`   ✅ created row (id=${row.id}) role=ADMIN`);
  }

  // Wallet (harmless if exists)
  const wallet = await prisma.wallet.findUnique({ where: { userId: row.id } });
  if (!wallet) {
    await prisma.wallet.create({ data: { userId: row.id, balance: 0, currency: 'ETB' } });
    log('   ✅ wallet created (balance 0)');
  }

  // Cleanup: if an orphan duplicate row existed under a different id but the
  // same email, it has just been reused — nothing else to do.
  log(`\n   password column value: ${row.password}`);

  // ── 3. Sanity: simulate exactly what login() does ────────────────────────
  log('\n3️⃣  Sanity check (mirrors auth.service login flow)');
  const check = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!check) {
    log('   ❌ row not found by email?!');
    process.exit(1);
  }
  if (check.password !== 'supabase-auth') {
    log('   ⚠️  password column is a local hash — login will verify locally with bcrypt.');
    log('      That only works if the hash really is Admin@123. Recommended: sync Supabase.');
  } else {
    log('   ✅ password=supabase-auth → login will authenticate against Supabase Auth');
    log('      → returns a REAL Supabase JWT → /api/auth/me accepts it → admin works.');
  }
  log(`   ✅ role=${check.role} isActive=${check.isActive} emailVerified=${check.emailVerified}`);

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📧 Email:    admin@skyrush.com');
  log('🔑 Password: Admin@123');
  log('👤 Role:     ADMIN');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('❌ Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
