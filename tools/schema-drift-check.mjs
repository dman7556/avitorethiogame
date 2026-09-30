// Temporary diagnostic: list schema columns/tables that NO migration creates.
// Relation fields (whose type is another model) are not columns and are skipped.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');

// Pass 1: model names
const modelNames = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));

// Pass 2: per-model column names
const models = {};
let current = null;
for (const raw of schema.split(/\r?\n/)) {
  const line = raw.trim();
  const m = /^model\s+(\w+)\s*\{/.exec(line);
  if (m) { current = m[1]; models[current] = new Set(); continue; }
  if (line === '}') { current = null; continue; }
  if (!current || !line || line.startsWith('//') || line.startsWith('@@')) continue;
  const f = /^(\w+)\s+(\S+)/.exec(line);
  if (!f) continue;
  const [, name, rawType] = f;
  const baseType = rawType.replace(/[\[\]?]/g, '');
  if (modelNames.has(baseType)) continue; // relation, not a column
  const map = /@map\("([^"]+)"\)/.exec(line);
  models[current].add(map ? map[1] : name);
}

// Migrations → table → columns, in filename order (so later files win).
const migDir = path.join(root, 'prisma/migrations');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.sql')) files.push(p);
  }
})(migDir);
files.sort();// Prisma's SQLite "RedefineTables" pattern creates "new_User" then renames it
// to "User" — treat the temporary name as the real table.
const tableName = (n) => (n.startsWith('new_') ? n.slice(4) : n);

const tables = {};
for (const file of files) {
  const sql = fs.readFileSync(file, 'utf8');
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+"(\w+)"\s*\(([\s\S]*?)\n\);/g)) {
    const t = tableName(m[1]);
    tables[t] ??= new Set();
    for (const c of m[2].matchAll(/^\s*"([^"]+)"\s+/gm)) tables[t].add(c[1]);
  }
  for (const m of sql.matchAll(/ALTER TABLE\s+"(\w+)"\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/g)) {
    const t = tableName(m[1]);
    tables[t] ??= new Set();
    tables[t].add(m[2]);
  }
}

let problems = 0;
for (const [model, fields] of Object.entries(models)) {
  if (!tables[model]) {
    console.log(`[NO TABLE]      ${model} — no migration creates this table`);
    problems++;
    continue;
  }
  const missing = [...fields].filter((c) => !tables[model].has(c));
  if (missing.length) {
    console.log(`[MISSING COLS]  ${model} → ${missing.join(', ')}`);
    problems++;
  }
}
console.log(`\nmigrations=${files.length}  models=${Object.keys(models).length}  problems=${problems}`);
