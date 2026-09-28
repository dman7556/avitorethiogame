const fs = require('fs'), path = require('path');
const names = ['apiUrl', 'uploadUrl', 'socketOrigin', 'API_BASE'];
let problems = 0, checked = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !p.includes('lib' + path.sep + 'config.ts')) {
      checked++;
      const src = fs.readFileSync(p, 'utf8');
      const body = src.replace(/^import[^\n]*\n/gm, '');
      const importMatch = src.match(/^import\s*\{([^}]*)\}\s*from\s*'[^']*config';/m);
      const importNames = importMatch ? importMatch[1].split(',').map(s => s.trim()) : [];
      for (const n of names) {
        if (new RegExp('\\b' + n + '\\b').test(body) && !importNames.includes(n)) {
          console.log('MISSING', n, '->', p.split(path.sep).join('/'));
          problems++;
        }
      }
    }
  }
}
walk(path.resolve(__dirname, '..', 'apps', 'web', 'src'));
console.log(problems === 0 ? 'ALL IMPORTS OK across ' + checked + ' files' : problems + ' problems');
