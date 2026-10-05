// diag20 — staged powerbox driver: click Space scheme → select space row →
// pick mode → pick target → confirm. Dumps dialog text at each stage.
import { createRequire } from 'node:module';
const require = createRequire('/home/dev/workspaces/happy-tiger/docs/');
const { launch } = require('puppeteer-core');
const A_URL = process.argv[2];
const SPACE_ROW = 'venue-themes-2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[d20]', ...a);

const browser = await launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  userDataDir: '/var/tmp/ir-venue-profile', acceptInsecureCerts: true,
  args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'],
});
const page = await browser.newPage();
await page.goto(A_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
let f = null;
for (let i = 0; i < 90 && !f; i++) {
  for (const fr of page.frames()) {
    try { if (fr !== page.mainFrame() && (await fr.evaluate(() => !!document.querySelector('#drill-mount')))) { f = fr; break; } } catch {}
  }
  if (!f) await sleep(1000);
}
for (let i = 0; i < 45; i++) {
  const s = await f.evaluate(() => document.querySelector('#drill-state')?.textContent || '').catch(() => 'boot…');
  if (s !== 'boot…') break;
  await sleep(1000);
}
await f.evaluate(() => {
  window.__states = [];
  const record = () => {
    const t = document.querySelector('#drill-state')?.textContent;
    if (t && window.__states[window.__states.length - 1] !== t) window.__states.push(t);
  };
  record();
  new MutationObserver(record).observe(document.body, { subtree: true, childList: true, characterData: true });
});
await f.evaluate((sid) => { window.__drillMountId = sid; document.querySelector('#drill-mount').click(); }, 'xUkJE8mHYnejJubSlVnb');
log('clicked mount');

const dialogInfo = () =>
  page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].find((x) => x.offsetParent);
    if (!d) return null;
    const clickables = [...d.querySelectorAll('button, [role="button"], label, li, input, a, div')].filter((b) => {
      const t = (b.textContent || '').trim();
      return t.length > 0 && t.length < 90 && b.offsetParent !== null;
    });
    const seen = new Set();
    const items = [];
    for (const b of clickables) {
      const t = (b.textContent || '').trim().replace(/\s+/g, ' ');
      if (!seen.has(t)) { seen.add(t); items.push(t); }
      if (items.length > 25) break;
    }
    return { text: (d.textContent || '').replace(/\s+/g, ' ').slice(0, 500), items };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));

const clickItem = (re) =>
  page.evaluate((r) => {
    const d = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].find((x) => x.offsetParent);
    if (!d) return 'NO DIALOG';
    const els = [...d.querySelectorAll('button, [role="button"], label, li, a, div')]
      .filter((b) => b.offsetParent !== null)
      .sort((a, b) => (a.contains(b) ? 1 : b.contains(a) ? -1 : 0)); // innermost first
    const el = els.find((b) => {
      const t = (b.textContent || '').trim().replace(/\s+/g, ' ');
      return t.length < 90 && new RegExp(r, 'i').test(t);
    });
    if (el) { el.click(); return 'clicked: ' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60); }
    return 'no match for /' + r + '/';
  }, re).catch((e) => 'ERR ' + String(e).slice(0, 60));

const waitFor = async (re, timeoutS = 40) => {
  for (let i = 0; i < timeoutS; i++) {
    const d = await dialogInfo();
    if (d && !d.err && new RegExp(re, 'i').test(d.text)) return d;
    const st = await f.evaluate(() => document.querySelector('#drill-state')?.textContent || '').catch(() => '');
    if (/mounted \+ bundle written|mount error/.test(st)) return 'DONE:' + st;
    await sleep(1000);
  }
  return null;
};

let st = await f.evaluate(() => document.querySelector('#drill-state')?.textContent || '');
if (!/mounted|error/.test(st)) {
  // Stage 1: the scheme menu
  let d = await waitFor('Choose what kind');
  if (!d) { log('FAIL: no scheme menu; state=', st); await browser.close(); process.exit(1); }
  log('S1 items:', JSON.stringify(d.items));
  log('S1:', await clickItem('^Space'));
  // Stage 2: the space list
  d = await waitFor(SPACE_ROW);
  if (!d || d === 'string' ? false : true) {
    if (d && d.items) {
      log('S2 items:', JSON.stringify(d.items));
      log('S2:', await clickItem('^' + SPACE_ROW));
    }
  }
  // Stage 3: mode
  d = await waitFor('read|view|edit|write', 20);
  if (d && d.items) {
    log('S3 items:', JSON.stringify(d.items));
    log('S3:', await clickItem('edit|write'));
  }
  // Stage 4: target
  d = await waitFor('whole|entire|everything|folder|new project', 15);
  if (d && d.items) {
    log('S4 items:', JSON.stringify(d.items));
    log('S4:', await clickItem('whole|everything'));
  }
  // Stage 5: confirm
  for (let i = 0; i < 30; i++) {
    st = await f.evaluate(() => document.querySelector('#drill-state')?.textContent || '').catch(() => '');
    if (/mounted \+ bundle written|mount error/.test(st)) break;
    const r = await clickItem('^(grant|allow|add|open|continue)$');
    if (!r.startsWith('no match')) log('S5:', r);
    await sleep(1500);
  }
}
for (let i = 0; i < 45; i++) {
  st = await f.evaluate(() => ({ state: document.querySelector('#drill-state')?.textContent, sid: window.__drill?.spaceId || '', root: window.__drill?.root || '' })).catch(() => null);
  if (st && /mounted|error/.test(st.state || '')) break;
  await sleep(1000);
}
log('FINAL:', JSON.stringify(st));
try { log('STATES:', JSON.stringify(await f.evaluate(() => window.__states || []))); } catch {}
await browser.close();
