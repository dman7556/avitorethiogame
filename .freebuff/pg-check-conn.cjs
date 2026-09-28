// Temporary migration tooling: probe Supabase connectivity both ways.
const fs = require('fs');
const { Client } = require('pg');

const env = fs.readFileSync('apps/server/.env', 'utf8');
const m = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim().replace(/^"|"$/g, '');

async function tryUrl(label, url) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
  try {
    await c.connect();
    const r = await c.query('select current_database() db, version() v');
    console.log(label, 'OK db=' + r.rows[0].db, '| pg=' + r.rows[0].v.split(' ')[1]);
    await c.end();
    return true;
  } catch (e) {
    console.log(label, 'FAIL:', e.message.slice(0, 160));
    try { await c.end(); } catch {}
    return false;
  }
}

(async () => {
  await tryUrl('POOLER6543', m);
  await tryUrl('DIRECT5432', m.replace(':6543/', ':5432/'));
})();
