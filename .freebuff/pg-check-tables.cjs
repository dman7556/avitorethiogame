// Temporary migration tooling: inventory of what already exists in Supabase.
const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('apps/server/.env', 'utf8');
const url = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim().replace(/^"|"$/g, '');

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const t = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name`);
  console.log('PUBLIC TABLES:', t.rows.length);
  for (const r of t.rows) {
    try {
      const n = await c.query(`SELECT count(*)::int n FROM "${r.table_name}"`);
      console.log('  ', r.table_name, '=', n.rows[0].n);
    } catch (e) { console.log('  ', r.table_name, 'ERR', e.message.slice(0, 60)); }
  }
  const m = await c.query(`SELECT migratio + '' FROM pg_catalog.pg_type LIMIT 0`).catch(() => null);
  const pr = await c.query(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at LIMIT 10`).catch(() => null);
  console.log('_prisma_migrations:', pr ? pr.rows.map(r => r.migration_name).join(', ') : '(none)');
  await c.end();
})();
