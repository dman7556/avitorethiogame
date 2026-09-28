// Compare bet-card internals: phone viewport vs desktop viewport (same 375px column)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const tok = fs.readFileSync('.tok.txt', 'utf8').match(/TOKEN:(.*)/)[1].trim();
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
for (const [w, h] of [[375, 667], [1024, 768]]) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h });
  await p.evaluateOnNewDocument(`localStorage.setItem('auth_token', ${JSON.stringify(tok)});`);
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));
  const m = await p.evaluate(() => {
    const g = document.querySelector('.quick-grid');
    const bet = document.querySelector('.action-btn');
    const grid = document.querySelector('.bet-grid');
    const stepper = document.querySelector('.stepper');
    const input = stepper ? stepper.querySelector('input') : null;
    const chips = g ? [...g.children].map((c) => { const r = c.getBoundingClientRect(); return { t: c.textContent.trim(), x: Math.round(r.left), w: Math.round(r.width) }; }) : null;
    const br = bet ? bet.getBoundingClientRect() : null;
    const overlap = br && g ? [...g.children].filter((c) => { const r = c.getBoundingClientRect(); return r.right > br.left + 1; }).map((c) => c.textContent.trim()) : [];
    return {
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      quickCols: g ? getComputedStyle(g).gridTemplateColumns : null,
      stepperW: stepper ? Math.round(stepper.getBoundingClientRect().width) : null,
      inputW: input ? Math.round(input.getBoundingClientRect().width) : null,
      chips, betLeft: br ? Math.round(br.left) : null, overlap,
    };
  });
  console.log(`${w}x${h}:`, JSON.stringify(m));
  await p.close();
}
await b.close();
