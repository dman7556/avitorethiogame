// Desktop centered-column verification — fresh page load at each size so
// mount-time state matches reality. Checks: no page scroll, all sections
// visible, column constrained to max-w-lg and horizontally centered,
// header container centered too, tap-target sizes, canvas geometry.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const tok = fs.readFileSync('.tok.txt', 'utf8').match(/TOKEN:(.*)/)[1].trim();
const SIZES = [
  [1920, 1080], [1440, 900], [1024, 768], [900, 700], [768, 1024], [629, 528], [375, 667], [320, 568],
];
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1920,1080'],
});

const results = [];
for (const [w, h] of SIZES) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h });
  await p.evaluateOnNewDocument(`localStorage.setItem('auth_token', ${JSON.stringify(tok)});`);
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2200));

  const m = await p.evaluate(() => {
    const rect = (s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
    const vis = (r) => !!r && r.t >= -1 && r.t < window.innerHeight && r.h > 8;
    document.body.scrollTop = 99999;
    const canScroll = document.body.scrollTop > 0;
    document.body.scrollTop = 0;
    const header = rect('header');
    const headerInner = rect('.ref-header > div');
    const col = rect('.game-middle');
    const hist = rect('.game-hist-sec');
    const canvas = rect('.game-canvas-box');
    const panel = rect('.game-panel-sec');
    const bets = rect('.game-bets-sec');
    const vw = window.innerWidth;
    // centering: |left - (vw-width)/2| should be ~0 for the column and header inner
    const centerOff = (r) => (r ? Math.abs(r.l - Math.round((vw - r.w) / 2)) : -1);
    const small = [];
    document.querySelectorAll('.game-fit button, .game-fit [role="button"], .game-fit input').forEach((n) => {
      const st = getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      const r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const hit = n.closest('.tap-expand') || n;
      const hr = hit.getBoundingClientRect();
      if (hr.width < 44 || hr.height < 44) small.push({ tag: n.tagName, w: Math.round(hr.width), h: Math.round(hr.height) });
    });
    const below = [];
    ['.game-hist-sec', '.game-canvas-sec', '.game-panel-sec', '.game-bets-sec'].forEach((s) => {
      const r = rect(s);
      if (r && r.b > window.innerHeight + 1) below.push({ s, overBy: Math.round(r.b - window.innerHeight) });
    });
    return {
      header: !!header && vis(header), hist: !!hist && vis(hist),
      canvas: !!canvas && vis(canvas), panel: !!panel && vis(panel), bets: !!bets && vis(bets),
      canvasW: canvas?.w || 0, canvasH: canvas?.h || 0,
      colW: col?.w || 0, colCenterOff: centerOff(col), hdrCenterOff: centerOff(headerInner),
      canScroll, bodyH: document.body.scrollHeight,
      below, smallCount: small.length, small: small.slice(0, 2),
      mult: (document.querySelector('.game-canvas-box')?.textContent || '').match(/\d+\.\d+x/)?.[0] || 'n/a',
    };
  });
  const centered = m.colCenterOff <= 2 && m.hdrCenterOff <= 2;
  const pass = !m.canScroll && m.header && m.hist && m.canvas && m.panel && m.bets && m.below.length === 0 && centered && m.canvasW > 100;
  results.push({ size: `${w}x${h}`, ...m, centered, pass });
  console.log(`${w}x${h}: ${pass ? 'PASS' : 'FAIL'} scroll=${m.canScroll ? 'YES' : 'no'} sections=h${+m.header}i${+m.hist}c${+m.canvas}p${+m.panel}b${+m.bets} below=${JSON.stringify(m.below)} col=${m.colW}px centerOff(col/hdr)=${m.colCenterOff}/${m.hdrCenterOff} canvas=${m.canvasW}x${m.canvasH} small=${m.smallCount}${m.smallCount ? ' ' + JSON.stringify(m.small) : ''} mult=${m.mult}`);
  await p.screenshot({ path: `../../.freebuff/game-fit-${w}x${h}.png` });
  await p.close();
}
fs.writeFileSync('../../.freebuff/desktop-fit-results.json', JSON.stringify(results, null, 2));
await b.close();
console.log('DONE');
