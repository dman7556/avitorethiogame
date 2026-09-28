// One-shot: log in via the real UI and print the localStorage token.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const p = await b.newPage();
await p.setViewport({ width: 400, height: 800 });
await p.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 1200));
const email = 'fix4batch.probe+20260920b@gmail.com';
await p.evaluate((em) => {
  const inputs = [...document.querySelectorAll('input')];
  const set = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const em2 = inputs.find(i => i.type === 'email' || /email/i.test(i.name || ''));
  const pw = inputs.find(i => i.type === 'password');
  if (em2) set(em2, em);
  if (pw) set(pw, 'ProbePass!2026');
}, email);
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /sign in/i.test(b.innerText));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2500));
const tok = await p.evaluate(() => localStorage.getItem('skyrush_token'));
console.log(tok ? 'TOKEN:' + tok : 'NO_TOKEN — page: ' + (await p.evaluate(() => document.body.innerText.slice(0, 200))));
await b.close();
