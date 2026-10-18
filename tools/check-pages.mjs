// check-pages.mjs — open every page in headless Chromium at the sizes CLAUDE.md names and check
// what a layout regression breaks: errors in the console, a page that scrolls sideways (as
// loaded, with the menus, Controls and the views' tabs open, and with audio started), and the
// controls each page should place (the perform controls above the keys, the ⓘ buttons, "Default
// settings" among the presets, the keys).
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
    viewTabs: n('.forte-dock-tabs [role="tab"], .forte-dock-tabs button:not(.forte-dock-fold)'),
  };
};
const WIDE = () => document.documentElement.scrollWidth - window.innerWidth;

async function checkPage(browser, url, page, size) {
  const { name, ios, ...device } = size;
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: 1 });
  if (ios) await ctx.addInitScript(() => { delete Navigator.prototype.requestMIDIAccess; });
  const tab = await ctx.newPage();
  const errors = [], wide = [];
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
    if (await click('details.forte-switch > summary')) { await sideways('menu open'); await click('details.forte-switch > summary'); }
    if (await click('.forte-more')) { await sideways('Controls open'); await tab.keyboard.press('Escape'); await click('.forte-more'); }
    if (await click('.forte-dock-tabs button:not(.forte-dock-fold)')) await sideways('views open');
    if (await click('#start')) { await tab.waitForTimeout(500); await sideways('audio started'); }
    return { page: page || 'index', size: name, counts, errors, wide };
  } catch (e) {
    return { page: page || 'index', size: name, counts: null, errors: [...errors, e.message], wide };
  } finally { await ctx.close(); }
}

// The checks: what every instrument page must have, whatever else a change does to it.
function failures(r, instrument) {
  const f = [...r.errors.map((e) => `error: ${e}`), ...r.wide.map((w) => `scrolls sideways: ${w}`)];
  const c = r.counts;
  if (!c || !instrument) return f;
  if (!c.keys) f.push('no keys');
  if (!c.info) f.push('no ⓘ buttons');
  if (!c.defaultSettings) f.push('no "Default settings" among the presets');
  if (!c.performControls) f.push('no perform controls above the keys');
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
