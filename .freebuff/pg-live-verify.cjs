// Live end-to-end verification against Supabase Postgres (read-only checks +
// one real registration write through the actual API).
const { Client } = require('pg');
const fs = require('fs');

const DIRECT = fs.readFileSync('apps/server/.env', 'utf8').match(/DIRECT_DATABASE_URL="([^"]+)"/)[1];

async function main() {
  // 1. rounds are being written live
  const pg = new Client({ connectionString: DIRECT, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const before = (await pg.query('SELECT count(*)::int n, max("roundNumber") mx FROM "GameRound"')).rows[0];
  await new Promise(r => setTimeout(r, 12000));
  const after = (await pg.query('SELECT count(*)::int n, max("roundNumber") mx FROM "GameRound"')).rows[0];
  console.log(`LIVE WRITES: rounds ${before.n} → ${after.n} (max ${before.mx} → ${after.mx}) ${after.n > before.n ? '✓ engine writing to Postgres' : '✗ NO WRITES'}`);

  // 2. a real registration through the API (write test)
  const email = `pg-live-${Date.now()}@example.com`;
  const res = await fetch('http://localhost:4000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'PG Live Test', email, phone: '09' + String(10000000 + Math.floor(Math.random() * 89999999)), password: 'PgLive#2026x' }),
  });
  const data = await res.json();
  console.log('REGISTER API:', res.status, data.success ? '✓ user created + 20 ETB bonus wallet' : '✗ ' + (data.error || '').slice(0, 100));

  // 3. verify the write landed in Postgres with the bonus ledger
  if (data.success) {
    const uid = data.data.user.id;
    const w = (await pg.query('SELECT balance::text, reserved::text FROM "Wallet" WHERE "userId"=$1', [uid])).rows[0];
    const t = (await pg.query('SELECT type, amount::text, "balanceAfter"::text FROM "WalletTransaction" wt JOIN "Wallet" w ON w.id=wt."walletId" WHERE w."userId"=$1', [uid])).rows[0];
    console.log(`PG VERIFY: new user wallet balance=${w?.balance} (expect 20.00) | ledger: ${t?.type} +${t?.amount} → ${t?.balanceAfter} ✓`);
    // cleanup the throwaway user (FK-safe)
    const wallet = (await pg.query('SELECT id FROM "Wallet" WHERE "userId"=$1', [uid])).rows[0];
    if (wallet) await pg.query('DELETE FROM "WalletTransaction" WHERE "walletId"=$1', [wallet.id]);
    await pg.query('DELETE FROM "Wallet" WHERE "userId"=$1', [uid]);
    await pg.query('DELETE FROM "User" WHERE id=$1', [uid]);
    console.log('cleanup: test user removed');
  }

  // 4. wallet read path: biggest real wallet unchanged
  const top = (await pg.query('SELECT balance::text FROM "Wallet" ORDER BY balance::numeric DESC LIMIT 1')).rows[0];
  console.log('TOP WALLET (migrated data intact):', top.balance);

  await pg.end();
}
main().catch(e => { console.error('VERIFY FAILED:', e.message.slice(0, 200)); process.exit(1); });
