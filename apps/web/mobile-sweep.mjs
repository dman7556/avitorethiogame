// Mobile responsiveness sweep v2 — measured, not assumed.
// One navigation per screen/orientation; reflow-measures at each width.
// Usage: TOKEN=<jwt> node mobile-sweep.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/hp/Desktop/avatior one';
const SHOTS = path.join(ROOT, '.freebuff', 'mobile-shots');
const OUT = path.join(ROOT, '.freebuff', 'mobile-results.json');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173';
const WIDTHS = [320, 360, 375, 390, 412, 428];
const TOKEN = process.env.TOKEN || '';
const PH = 740; // portrait height used for all widths

const SCREENS_ALL = [
  { name: 'login',                 p: '/login',                  authed: false },
  { name: 'register',              p: '/register',               authed: false },
  { name: 'forgot-password',       p: '/forgot-password',        authed: false },
  { name: 'verify-email',          p: '/verify-email',           authed: false },
  { name: 'game',                  p: '/',                       authed: true },
  { name: 'game-menu-open',        p: '/',                       authed: true, setup: 'menu' },
  { name: 'audio-settings',        p: '/',                       authed: true, setup: 'audio' },
  { name: 'modal-deposit',         p: '/',                       authed: true, setup: 'deposit' },
  { name: 'modal-withdraw',        p: '/',                       authed: true, setup: 'withdraw' },
  { name: 'game-offline',          p: '/',                       authed: true, setup: 'offline' },
  { name: 'dashboard',             p: '/dashboard',              authed: true },
  { name: 'dashboard-profile',     p: '/dashboard/profile',      authed: true },
  { name: 'dashboard-deposits',    p: '/dashboard/deposits',     authed: true },
  { name: 'dashboard-withdrawals', p: '/dashboard/withdrawals',  authed: true },
  { name: 'admin',                 p: '/admin',                  authed: true, admin: true },
];
const SCREENS = SCREENS_ALL.filter(s => process.env.ONLYSCREEN ? s.name === process.env.ONLYSCREEN : !process.env.ONLYSET || (process.env.ONLYSET === 'guest' ? !s.authed : s.authed));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth, doc = document.documentElement;
    const overflowX = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0) - vw;
    const offscreen = []; const smallTargets = []; const clipped = [];
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    for (const el of document.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1.5 || r.left < -1.5) {
        const closed = el.closest('[aria-hidden="true"], [data-state="closed"]') !== null;
        // history pills scroll horizontally by design (overflow-x scroller); skip items inside one
        const inScroller = el.parentElement && getComputedStyle(el.parentElement).overflowX === 'auto';
        if (!closed && !inScroller) offscreen.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} R=${Math.round(r.right)} L=${Math.round(r.left)}`);
      }
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(el.tagName) || el.getAttribute('role') === 'button') {
        // skip elements whose ::after expands the hit area to 44px (e.g. .card-minimize)
        const after = getComputedStyle(el, '::after');
        const hitW = r.width + 2 * parseFloat(after.left === 'auto' ? '0' : after.left || '0');
        const expanded = el.className && /card-minimize|tap-expand/.test(String(el.className));
        if ((r.width < 44 || r.height < 44) && !expanded) {
          smallTargets.push(`${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}"${(el.innerText || el.value || '').trim().slice(0, 16)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      const cs = getComputedStyle(el);
      if (el.children.length === 0 && el.textContent && el.textContent.trim() &&
          el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis') {
        clipped.push(`"${el.textContent.trim().slice(0, 28)}" sw=${el.scrollWidth} cw=${el.clientWidth}`);
      }
    }
    return { vw, overflowX, offscreen: offscreen.slice(0, 6), smallTargets: smallTargets.slice(0, 20), clipped: clipped.slice(0, 8) };
  });
}

async function doSetup(page, kind) {
  if (kind === 'offline') { await page.setOfflineMode(true); await sleep(2500); return; }
  if (kind === 'audio') {
    await page.evaluate(() => { const m = [...document.querySelectorAll('button')].find(e => (e.getAttribute('aria-label') || '') === 'Menu'); if (m) m.click(); });
    await sleep(500);
    await page.evaluate(() => { const a = [...document.querySelectorAll('button')].find(e => /audio settings/i.test(e.innerText || '')); if (a) a.click(); });
    await sleep(600);
    return;
  }
  await page.evaluate((kind) => {
    const els = [...document.querySelectorAll('button, a, [role="button"]')];
    const want = kind === 'menu' ? ['menu'] : kind === 'deposit' ? ['deposit'] : ['withdraw'];
    const el = els.find(e => (e.getAttribute('aria-label') || '').toLowerCase().includes(want[0]) ||
                             (e.innerText || '').trim().toLowerCase().includes(want[0]));
    if (el) el.click();
  }, kind);
  await sleep(700);
}

const run = async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const results = [];
  let page;
  const newPage = async () => {
    page = await browser.newPage();
    if (TOKEN) await page.evaluateOnNewDocument((t) => localStorage.setItem('skyrush_token', t), TOKEN);
    page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 100)));
  };

  for (const s of SCREENS) {
    await newPage();
    for (const orient of ['portrait', 'landscape']) {
      const vp0 = orient === 'portrait' ? { width: 375, height: PH } : { width: PH, height: 375 };
      await page.setViewport(vp0);
      try { await page.goto(BASE + s.p, { waitUntil: 'networkidle2', timeout: 15000 }); }
      catch { try { await page.goto(BASE + s.p, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {} }
      await sleep(800);
      if (s.setup) { try { await doSetup(page, s.setup); } catch (e) { console.log(`  [setup-fail ${s.name}]`, String(e).slice(0, 70)); } }
      if (s.setup === 'offline') await page.setOfflineMode(false);
      for (const W of WIDTHS) {
        await page.setViewport(orient === 'portrait' ? { width: W, height: PH } : { width: PH, height: W });
        await sleep(380);
        const m = await measure(page);
        const file = path.join(SHOTS, `${s.name}__${W}${orient === 'landscape' ? 'L' : ''}.png`);
        await page.screenshot({ path: file, fullPage: false });
        results.push({ screen: s.name, width: W, orientation: orient, ...m, shot: path.basename(file) });
        const bad = (m.overflowX > 0 ? `OVERFLOW+${m.overflowX}` : '') + (m.offscreen.length ? ` OFFSCREEN(${m.offscreen.length})` : '') + (m.smallTargets.length ? ` SMALL(${m.smallTargets.length})` : '') + (m.clipped.length ? ` CLIP(${m.clipped.length})` : '');
        console.log(`${bad ? 'FAIL' : 'pass'} ${s.name} ${W}${orient === 'landscape' ? 'L' : ''} ${bad}`);
      }
    }
    await page.close();
  }
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  const fails = results.filter(r => r.overflowX > 0 || r.offscreen.length || r.smallTargets.length || r.clipped.length);
  console.log(`\nDONE ${results.length} checks, ${fails.length} failing rows -> ${OUT}`);
  await browser.close();
};
run().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
