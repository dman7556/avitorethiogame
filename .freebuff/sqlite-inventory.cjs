// Temporary migration tooling: read-only SQLite inventory.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = process.cwd();

// locate sqlite3 CLI (used by the audit harness before)
const SQLITE = 'C:/Users/hp/AppData/Local/Android/Sdk/platform-tools/sqlite3.exe';

const dbs = [
  path.join(root, 'dev.db'),
  path.join(root, 'prisma', 'dev.db'),
  path.join(root, 'prisma', 'prisma', 'dev.db'),
];

for (const db of dbs) {
  if (!fs.existsSync(db)) { console.log('MISSING:', db); continue; }
  const stat = fs.statSync(db);
  console.log('=== ' + db + ' (' + (stat.size / 1024).toFixed(0) + ' KB, mtime ' + stat.mtime.toISOString() + ') ===');
  const tables = execSync(`"${SQLITE}" "${db}" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"`, { encoding: 'utf8' }).trim().split('\n');
  let total = 0;
  const counts = [];
  for (const t of tables) {
    const n = parseInt(execSync(`"${SQLITE}" "${db}" "SELECT count(*) FROM \\"${t}\\""`, { encoding: 'utf8' }).trim(), 10);
    counts.push([t, n]); total += n;
  }
  console.log(counts.map(([t, n]) => `${t}=${n}`).join('  '));
  console.log('TOTAL ROWS:', total);
  const fk = execSync(`"${SQLITE}" "${db}" "PRAGMA foreign_key_check"`, { encoding: 'utf8' }).trim();
  console.log('FK_VIOLATIONS:', fk ? fk.split('\n').slice(0, 5).join(' | ') : 'none');
}
