/**
 * One-shot codemod (Phase 2): route every frontend fetch through the central
 * apiUrl() helper. Converts:
 *   fetch('/api/x', ...)        → fetch(apiUrl('/api/x'), ...)
 *   fetch(`/api/x/${id}`, ...)  → fetch(apiUrl(`/api/x/${id}`), ...)
 * and inserts the correct relative import where missing.
 * Idempotent: skips files already converted.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'apps', 'web', 'src');

const files = [
  'components/DepositModal.tsx',
  'components/WithdrawalModal.tsx',
  'components/admin/AnalyticsSection.tsx',
  'components/admin/DepositsSection.tsx',
  'components/admin/WithdrawalsSection.tsx',
  'pages/AdminPage.tsx',
  'pages/UserDashboardPage.tsx',
  'pages/admin/AdminAuditLogs.tsx',
  'pages/admin/AdminDashboard.tsx',
  'pages/admin/AdminPage.tsx',
  'pages/admin/AdminSettings.tsx',
  'pages/admin/AdminTransactions.tsx',
  'pages/admin/AdminUsers.tsx',
  'pages/admin/AdminWithdrawals.tsx',
  'pages/admin/DepositApprovalPage.tsx',
  'pages/admin/WithdrawalApprovalPage.tsx',
  'pages/user/DepositHistoryPage.tsx',
  'pages/user/ProfilePage.tsx',
  'pages/user/WithdrawalHistoryPage.tsx',
  'lib/supabase.ts',
];

function relImport(file) {
  const dir = path.dirname(file);
  const rel = path.relative(dir, 'lib/config').replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : './' + rel;
}

let totalConverted = 0;
for (const file of files) {
  const fp = path.join(ROOT, file);
  let src = fs.readFileSync(fp, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';

  // Skip lines that define constants (not fetch calls)
  const isDefinition = /(?:const|export const)\s+\w+\s*=\s*(['"`])\/api\1\s*;/.test(src);

  // Convert path literals used as fetch targets.
  const re = /(['"`])(\/api\/[^'"`]*)\1(\s*[,)])/g;
  let count = 0;
  src = src.replace(re, (m, q, p, tail) => {
    count++;
    return `apiUrl(${q}${p}${q})${tail}`;
  });

  if (isDefinition && count === 0) {
    // e.g. supabase.ts `export const API_URL = '/api';` — rewire the constant
    src = src.replace(
      /(const\s+\w+\s*=\s*)(['"`])\/api\2(\s*;)/,
      (m, head, q, tail) => `${head}API_BASE${tail}`
    );
  }

  if (count === 0 && !src.includes('API_BASE')) {
    console.log(`SKIP ${file}: no /api literals matched`);
    continue;
  }

  // Insert import after the last import statement, if not present
  if (!/from\s+['"].*lib\/config['"]/.test(src) && !/from\s+['"]\.\/config['"]/.test(src)) {
    const lines = src.split(eol);
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s/.test(lines[i])) lastImport = i;
    }
    if (lastImport === -1) {
      console.log(`WARN ${file}: no import block found, prepending`);
      lines.unshift(`import { apiUrl } from '${relImport(file)}';`, '');
    } else {
      lines.splice(lastImport + 1, 0, `import { apiUrl } from '${relImport(file)}';`);
    }
    src = lines.join(eol);
  }

  fs.writeFileSync(fp, src);
  totalConverted += count;
  console.log(`OK   ${file}: ${count} fetch site(s) converted`);
}
console.log(`\nTotal fetch sites converted: ${totalConverted}`);
