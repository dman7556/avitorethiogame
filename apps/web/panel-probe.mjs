// Measure bet-panel internals at 629x528 to find trimmable slack
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const tok = fs.readFileSync('.tok.txt', 'utf8').match(/TOKEN:(.*)/)[1].trim();
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const p = await b.newPage();
await p.setViewport({ width: 629, height: 528 });
await p.evaluateOnNewDocument(`localStorage.setItem('auth_token', ${JSON.stringify(tok)});`);
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2000));
const m = await p.evaluate(() => {
  const h = (s) => { const n = document.querySelector(s); if (!n) return null; const st = getComputedStyle(n); const r = n.getBoundingClientRect(); return { h: Math.round(r.height), mt: parseFloat(st.marginTop), mb: parseFloat(st.marginBottom), pt: st.paddingTop, pb: st.paddingBottom }; };
  const panel = document.querySelector('.game-panel-sec');
  const kids = panel ? [...panel.querySelectorAll(':scope > * > *, :scope > *')].slice(0, 14).map((n) => ({ cls: (n.className || '').toString().slice(0, 40), h: Math.round(n.getBoundingClientRect().height) })) : [];
  const secs = ['.ref-header', '.game-hist-sec', '.game-canvas-sec', '.game-panel-sec', '.game-bets-sec'].map((s) => ({ s, ...h(s) }));
  const seg = h('.seg-wrap'); const bg = h('.bet-grid'); const st = h('.stepper'); const qg = h('.quick-grid');
  const second = [...document.querySelectorAll('.game-panel-sec button')].find((n) => /second bet/i.test(n.textContent));
  return { secs, panelKids: kids, seg, betGrid: bg, stepper: st, quickGrid: qg, secondBtn: second ? Math.round(second.getBoundingClientRect().height) : null };
});
console.log(JSON.stringify(m, null, 1));
await b.close();
