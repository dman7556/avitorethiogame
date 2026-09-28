// Canvas-phase verification: FLYING (multiplier + plane tip) and BETTING
// (countdown ring) must render fully inside the canvas box at every size,
// desktop included. Screenshots for visual proof.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const tok = fs.readFileSync('.tok.txt', 'utf8').match(/TOKEN:(.*)/)[1].trim();
const SIZES = [[1920, 1080], [1440, 900], [1024, 768], [629, 528], [375, 667], [320, 568]];
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
});

async function measure(pg) {
  return pg.evaluate(() => {
    const box = document.querySelector('.game-canvas-box');
    if (!box) return { err: 'no box' };
    const br = box.getBoundingClientRect();
    const mult = box.querySelector('.multiplier-display');
    const ring = box.querySelector('.countdown-scale svg');
    const out = { boxW: Math.round(br.width), boxH: Math.round(br.height), pageScroll: (() => { document.body.scrollTop = 99999; const s = document.body.scrollTop; document.body.scrollTop = 0; return s; })() };
    if (mult) {
      const mr = mult.getBoundingClientRect();
      out.mult = { txt: mult.textContent, w: Math.round(mr.width), h: Math.round(mr.height), topIn: Math.round(mr.top - br.top), botIn: Math.round(br.bottom - mr.bottom) };
    }
    if (ring) {
      const rr = ring.getBoundingClientRect();
      out.ring = { w: Math.round(rr.width), h: Math.round(rr.height), topIn: Math.round(rr.top - br.top), botIn: Math.round(br.bottom - rr.bottom) };
    }
    return out;
  });
}

for (const [w, h] of SIZES) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h });
  await p.evaluateOnNewDocument(`localStorage.setItem('auth_token', ${JSON.stringify(tok)});`);
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 30000 });

  // Betting phase (countdown ring)
  await new Promise((r) => setTimeout(r, 1500));
  const bet = await measure(p);
  console.log(`${w}x${h} BETTING: box=${bet.boxW}x${bet.boxH} ring=${bet.ring ? `${bet.ring.w}x${bet.ring.h} in=${bet.ring.topIn}/${bet.ring.botIn}` : 'not-active'} scroll=${bet.pageScroll}`);
  await p.screenshot({ path: `../../.freebuff/canvas-betting-${w}x${h}.png` });

  // FLYING phase: sample up to 25s waiting for the multiplier overlay
  let fly = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await p.evaluate(() => {
      const m = document.querySelector('.game-canvas-box .multiplier-display');
      return m ? { txt: m.textContent, h: m.getBoundingClientRect().height, box: document.querySelector('.game-canvas-box').getBoundingClientRect().height } : null;
    });
    if (s) { fly = s; break; }
  }
  if (fly) {
    const full = await measure(p);
    console.log(`${w}x${h} FLYING: mult=${fly.txt} textH=${Math.round(fly.h)} boxH=${Math.round(fly.box)} topIn=${full.mult?.topIn} botIn=${full.mult?.botIn}`);
    await p.screenshot({ path: `../../.freebuff/canvas-flying-${w}x${h}.png` });
  } else {
    console.log(`${w}x${h} FLYING: overlay not caught in window`);
  }
  await p.close();
}
await b.close();
console.log('DONE');
