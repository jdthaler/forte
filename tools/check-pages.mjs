// check-pages.mjs — open every page in headless Chromium at the sizes CLAUDE.md names and check
// what a layout regression breaks: errors in the console, a page that scrolls sideways (as
// loaded, with the menus, Controls and every view turned on, and with audio started), the
// controls each page should place (the perform controls above the keys, the ⓘ buttons, "Default
// settings" among the presets, the keys), that each toggle turns its view or group of controls
// off and on (and on the desktop, that what's turned on is still on after a reload, that the
// switch puts the controls below the views and beside them, and that every view shows in
// Perform), and the front page's Listen buttons (one for each instrument with a demo, and two
// in turn play).
//
// Usage: node tools/check-pages.mjs [--base <git ref>] [--json <file>] [filter]
//   filter       only the pages whose path contains it (gongs, index, credits, template)
//   --base main  also open the same pages from <ref> (a git worktree, served on a second port)
//                and list every count that differs: what a change meant to leave alone shouldn't
//   --json f     write every page's counts to f
// Needs Playwright (the cloud sessions have it installed globally; CI installs it).
// Exits 1 when a check fails; differences from --base are reported, not failed.

import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { availableParallelism, tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { INSTRUMENTS } from '../shared/registry.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const base = opt('--base');
const jsonOut = opt('--json');
const filter = args[0] || '';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DEMOS = JSON.parse(await readFile(join(ROOT, 'examples/index.json'), 'utf8'));
const LISTEN = INSTRUMENTS.filter((i) => i.ready && DEMOS[i.id]?.length).length; // the front page's Listen buttons

async function playwright() {
  try { return await import('playwright'); } catch { /* not local: try the global install */ }
  const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return import(join(g, 'playwright', 'index.mjs'));
}
const { chromium, devices } = await playwright();

const PAGES = ['', 'credits/', 'docs/template/', ...INSTRUMENTS.filter((i) => i.ready).map((i) => `${i.id}/`)]
  .filter((p) => (p || 'index').includes(filter));

// CLAUDE.md's sizes: an iPhone with touch and without Web MIDI (no iOS browser has it), an iPad
// both ways, a desktop and a narrow desktop window.
const phone = devices['iPhone 13'], pad = devices['iPad Pro 11'];
const SIZES = [
  { name: 'phone', ...phone, viewport: { width: 390, height: 664 }, ios: true },
  { name: 'phone-landscape', ...phone, viewport: { width: 750, height: 340 }, ios: true },
  { name: 'ipad', ...pad, ios: true },
  { name: 'ipad-landscape', ...pad, viewport: { width: pad.viewport.height, height: pad.viewport.width }, ios: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'narrow', viewport: { width: 900, height: 800 } },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

// A static server for one checkout, on a free port of localhost (a secure context, so the
// AudioWorklet runs).
function serve(root) {
  const server = createServer(async (req, res) => {
    let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://localhost:${server.address().port}/` })));
}

// What one page shows, counted in the page.
const COUNT = () => {
  const n = (s) => document.querySelectorAll(s).length;
  const opts = [...document.querySelectorAll('.forte-presets option, select.forte-presets option')].map((o) => o.textContent);
  return {
    performControls: n('.forte-perform .param'),
    controls: n('#controls .param'),
    info: n('.forte-info'),
    presets: opts.length,
    defaultSettings: opts.includes('Default settings'),
    keys: n('.wk'),
    views: n('.forte-view-toggles button'),
    controlGroups: n('.forte-control-toggles button'),
    viewsOn: n('.forte-view-toggles button[aria-pressed="true"]'),
    listen: n('button[data-src]'),
  };
};
const WIDE = () => document.documentElement.scrollWidth - window.innerWidth;

// Chromium as Playwright ships it decodes no AAC, so each demo that is served plays as a second
// of quiet WAV instead: what's checked is the page, not the codec.
const WAV = (() => {
  const rate = 8000, n = rate, b = Buffer.alloc(44 + 2 * n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(2 * rate, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * n, 40);
  return b;
})();
// Listen on two cards in turn: each should say ■ Stop and play its own demo.
async function listen(tab) {
  const out = [], buttons = tab.locator('button[data-src]');
  for (const i of [0, 1]) {
    const b = buttons.nth(i);
    if (!(await b.count())) break;
    await b.scrollIntoViewIfNeeded();
    await b.click({ timeout: 2000 });
    // the first demo can take a moment to start on a busy machine
    await tab.waitForFunction(() => document.querySelector('#player').currentTime > 0, null, { timeout: 5000 }).catch(() => {});
    const s = await tab.evaluate(() => { const a = document.querySelector('#player'); return { src: a.src, paused: a.paused, t: a.currentTime }; });
    const src = await b.getAttribute('data-src'), text = await b.textContent();
    if (!text.includes('Stop') || s.paused || !(s.t > 0) || !s.src.endsWith(src)) out.push(`Listen doesn't play ${src} (reads "${text.trim()}", ${s.paused ? 'paused' : `at ${s.t.toFixed(2)} s`})`);
  }
  return out;
}

// Each toggle turns its view, or its group of controls, off and on again, the button and what it
// shows both following; everything is on at the end. Returns how many toggles there are.
const ROWS = [
  ['.forte-view-toggles button', '.forte-stage > .card', 'view'],
  ['.forte-control-toggles button', '#controls details.group[data-key]', 'controls'],
];
const TOGGLES = (sel) => [...document.querySelectorAll(sel)].map((b) => b.getAttribute('aria-pressed') === 'true');
const SHOWN = (sel) => [...document.querySelectorAll(sel)].map((c) => c.offsetParent !== null);
async function toggles(tab, broken) {
  let n = 0;
  for (const [row, items, what] of ROWS) {
    const buttons = await tab.locator(row).all();
    n += buttons.length;
    for (const [i, b] of buttons.entries()) {
      const name = (await b.textContent()).trim();
      if (!(await b.isVisible())) { broken.push(`the "${name}" toggle is hidden`); continue; }
      for (const want of [true, false, true]) { // on (if it was off), off, and on again
        if ((await tab.evaluate(TOGGLES, row))[i] === want) continue;
        await b.click({ timeout: 2000 }).catch(() => {});
        if ((await tab.evaluate(TOGGLES, row))[i] !== want || (await tab.evaluate(SHOWN, items))[i] !== want) broken.push(`the "${name}" toggle doesn't turn its ${what} ${want ? 'on' : 'off'}`);
      }
    }
  }
  return n;
}
// With everything on: still on after a reload, the controls below the views and beside them
// with the switch, and every view shown in Perform.
async function remembered(tab) {
  const out = [];
  await tab.reload({ waitUntil: 'networkidle' });
  await tab.waitForTimeout(300);
  for (const [row, items, what] of ROWS) {
    if (!(await tab.evaluate(TOGGLES, row)).every(Boolean) || !(await tab.evaluate(SHOWN, items)).every(Boolean)) out.push(`the ${what} turned on are not on after a reload`);
  }
  // the controls below the views, then beside them again
  for (const v of ['1', '0']) {
    await tab.locator(`.forte-arrange button[data-below="${v}"]`).click({ timeout: 2000 }).catch(() => {});
    await tab.waitForTimeout(150);
    const below = await tab.evaluate(() => document.body.classList.contains('controls-below'));
    if (below !== (v === '1')) out.push(`the switch doesn't put the controls ${v === '1' ? 'below' : 'beside'} the views`);
    if (!(await tab.evaluate(SHOWN, ROWS[1][1])).every(Boolean)) out.push(`the controls are not all shown ${v === '1' ? 'below' : 'beside'} the views`);
    if (await tab.evaluate(WIDE) > 0) out.push(`scrolls sideways with the controls ${v === '1' ? 'below' : 'beside'} the views`);
  }
  await tab.locator('.forte-mode button[data-mode="perform"]').click({ timeout: 2000 }).catch(() => {});
  await tab.waitForTimeout(250);
  if (!(await tab.evaluate(SHOWN, ROWS[0][1])).every(Boolean)) out.push('Perform does not show every view turned on');
  return out;
}

async function checkPage(browser, url, page, size) {
  const { name, ios, ...device } = size;
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: 1 });
  if (ios) await ctx.addInitScript(() => { delete Navigator.prototype.requestMIDIAccess; });
  const tab = await ctx.newPage();
  await tab.route('**/*.m4a', async (route) => {
    const res = await route.fetch();
    await route.fulfill(res.ok() ? { status: 200, contentType: 'audio/wav', body: WAV } : { response: res });
  });
  const errors = [], wide = [], broken = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  tab.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().replace(url, '')}`); });
  const sideways = async (state) => { const w = await tab.evaluate(WIDE); if (w > 0) wide.push(`${state} (+${w}px)`); };
  const click = async (sel) => {
    const el = tab.locator(sel).first();
    if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 2000 }).catch(() => {}); await tab.waitForTimeout(250); return true; }
    return false;
  };
  try {
    await tab.goto(url + page, { waitUntil: 'networkidle', timeout: 30000 });
    await tab.waitForTimeout(500);
    await sideways('loaded');
    const counts = await tab.evaluate(COUNT);
    if (!page) broken.push(...await listen(tab));
    if (await click('details.forte-switch > summary')) { await sideways('menu open'); await click('details.forte-switch > summary'); }
    if (await click('.forte-more')) { await sideways('Controls open'); await tab.keyboard.press('Escape'); await click('.forte-more'); }
    if (await toggles(tab, broken)) { await tab.waitForTimeout(250); await sideways('every view on'); }
    if (name === 'desktop' && counts.views) broken.push(...await remembered(tab));
    if (await click('#start')) { await tab.waitForTimeout(500); await sideways('audio started'); }
    return { page: page || 'index', size: name, counts, errors, wide, broken };
  } catch (e) {
    return { page: page || 'index', size: name, counts: null, errors: [...errors, e.message], wide, broken };
  } finally { await ctx.close(); }
}

// The checks: what every instrument page must have, whatever else a change does to it.
function failures(r, instrument) {
  const f = [...r.errors.map((e) => `error: ${e}`), ...r.wide.map((w) => `scrolls sideways: ${w}`), ...r.broken];
  const c = r.counts;
  if (c && r.page === 'index' && c.listen !== LISTEN) f.push(`${c.listen} Listen buttons, not ${LISTEN} (one for each instrument with a demo)`);
  if (!c || !instrument) return f;
  if (!c.keys) f.push('no keys');
  if (!c.info) f.push('no ⓘ buttons');
  if (!c.defaultSettings) f.push('no "Default settings" among the presets');
  if (!c.performControls) f.push('no perform controls above the keys');
  if (!c.views) f.push('no toggles for the views');
  return f;
}

async function run(root, label) {
  const { server, url } = await serve(root);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const jobs = PAGES.flatMap((p) => SIZES.map((s) => [p, s]));
  const out = [];
  const width = Math.min(jobs.length, Math.max(4, availableParallelism() * 2));
  await Promise.all(Array.from({ length: width }, async () => {
    while (jobs.length) { const [p, s] = jobs.shift(); out.push(await checkPage(browser, url, p, s)); }
  }));
  await browser.close();
  server.close();
  const key = (r) => `${r.page} ${r.size}`;
  out.sort((a, b) => key(a).localeCompare(key(b)));
  if (label) console.log(`${label}: ${out.length} page views`);
  return out;
}

const t0 = performance.now();
const results = await run(ROOT);
let failed = 0;
for (const r of results) {
  const instrument = INSTRUMENTS.some((i) => `${i.id}/` === r.page) || r.page === 'docs/template/';
  const f = failures(r, instrument);
  if (f.length) { failed++; console.log(`FAIL  ${r.page} ${r.size}`); for (const l of f.slice(0, 8)) console.log(`      ${l}`); }
}
console.log(`${results.length - failed}/${results.length} page views passed (${PAGES.length} pages × ${SIZES.length} sizes) in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
if (jsonOut) await writeFile(jsonOut, JSON.stringify(results, null, 1));

if (base) {
  const dir = await mkdtemp(join(tmpdir(), 'forte-base-'));
  execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', dir, base], { stdio: 'ignore' });
  try {
    const before = new Map((await run(dir, `\n${base}`)).map((r) => [`${r.page} ${r.size}`, r]));
    let differ = 0;
    for (const r of results) {
      const b = before.get(`${r.page} ${r.size}`);
      if (!b?.counts || !r.counts) continue;
      const d = Object.keys(r.counts).filter((k) => r.counts[k] !== b.counts[k]).map((k) => `${k} ${b.counts[k]} → ${r.counts[k]}`);
      if (d.length) { differ++; console.log(`DIFF  ${r.page} ${r.size}: ${d.join(', ')}`); }
    }
    console.log(differ ? `${differ} page views differ from ${base}` : `every page view counts the same as ${base}`);
  } finally {
    execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', dir], { stdio: 'ignore' });
    await rm(dir, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
