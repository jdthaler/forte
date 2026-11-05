// check-offline.mjs — the site works offline (sw.js, tools/offline.mjs), in headless Chromium.
//
// Serves the checkout on localhost with a service-worker list made from it (the committed one is
// the last release's), turns the service worker on there (localStorage 'forte/offline'), opens the
// front page and waits for the copy, then takes the server off the network and opens every page:
// each must load from the copy without an error, and its audio start (the worklet and the
// WebAssembly). Then a release: the server comes back with a changed file, the page finds the new
// sw.js, and that release takes over on the way to the next page only while that page is the only
// one open, and serves the changed file from then on. An address the site doesn't have shows the
// 404 page offline.
//
// Usage: node tools/check-offline.mjs [filter]    filter: only the instrument pages whose id has it
// Needs Playwright, as tools/check-pages.mjs does. Exits 1 when a check fails.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { INSTRUMENTS } from '../shared/registry.js';
import { offlineFiles, withFiles, hashOf } from './offline.mjs';

const filter = process.argv[2] || '';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const TO = `${INSTRUMENTS.find((i) => i.ready).id}/`; // the page the release test moves to
const PAGES = ['', 'credits/', ...INSTRUMENTS.filter((i) => i.ready && i.id.includes(filter)).map((i) => `${i.id}/`)];

async function playwright() {
  try { return await import('playwright'); } catch { /* not local: try the global install */ }
  const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return import(join(g, 'playwright', 'index.mjs'));
}
const { chromium } = await playwright();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.md': 'text/markdown',
  '.m4a': 'audio/mp4', '.webmanifest': 'application/manifest+json' };

// The checkout, with what `over` says in place of its files; `down` takes it off the network
// (every connection dropped); `asked` counts what reached it.
const site = { over: {}, down: false, asked: [] };
let files = offlineFiles();
site.over['sw.js'] = withFiles(readFileSync(join(ROOT, 'sw.js'), 'utf8'), files);
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1);
  site.asked.push(rel);
  if (site.down) { req.socket.destroy(); return; }
  if (rel in site.over) { res.writeHead(200, { 'content-type': MIME[extname(rel)] }).end(site.over[rel]); return; }
  let path = normalize(join(ROOT, rel));
  if (!path.startsWith(ROOT + sep) && path !== ROOT) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }).end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('forte/offline', 'on'); } catch { /* none */ } });
await ctx.route((u) => !u.href.startsWith(url), (route) => route.abort()); // GitHub's API, fonts: no network
const fails = [];
const fail = (s) => { fails.push(s); console.log(`FAIL  ${s}`); };
const watch = (tab, errors) => {
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
};
const t0 = performance.now();

// The first visit: the copy is made, and the page is under the service worker without a reload.
const front = await ctx.newPage();
await front.goto(url, { waitUntil: 'load' });
const made = await front.evaluate(async () => {
  await navigator.serviceWorker.ready;
  for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100));
  const cache = await caches.open('forte-offline');
  return { controlled: !!navigator.serviceWorker.controller, kept: (await cache.keys()).length };
});
if (!made.controlled) fail('the first visit\'s page is not under the service worker');
if (made.kept !== Object.keys(files).length) fail(`the copy has ${made.kept} files, not the list's ${Object.keys(files).length}`);
console.log(`copy made: ${made.kept} files in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// Offline: every page loads from the copy, and its audio starts.
site.down = true; site.asked = [];
for (const page of PAGES) {
  const tab = await ctx.newPage(), errors = [];
  watch(tab, errors);
  try {
    const res = await tab.goto(url + page, { waitUntil: 'load', timeout: 20000 });
    if (!res?.ok()) errors.push(`HTTP ${res?.status()}`);
    await tab.waitForTimeout(300);
    if (page && await tab.locator('#start').isVisible().catch(() => false)) {
      await tab.click('#start', { timeout: 2000 });
      const ran = await tab.waitForFunction(() => { const c = document.querySelector('#cpu'); return !c || !/audio off/i.test(c.textContent); }, null, { timeout: 8000 }).then(() => true, () => false);
      if (!ran) errors.push('audio does not start offline');
      const state = await tab.evaluate(() => document.querySelector('#cpu')?.textContent.trim());
      if (/error|fail/i.test(state ?? '')) errors.push(`#cpu says "${state}"`);
    }
  } catch (e) { errors.push(e.message.split('\n')[0]); }
  if (errors.length) fail(`${page || 'index'} offline: ${errors.slice(0, 4).join('; ')}`);
  await tab.close();
}
site.asked = site.asked.filter((f) => f !== 'sw.js'); // the browser asking for a new release, as it should
if (site.asked.length) fail(`offline, the pages still asked the server for ${site.asked.length} files (${[...new Set(site.asked)].slice(0, 6).join(", ")})`);
console.log(`${PAGES.length} pages offline in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// An address the site doesn't have: the 404 page, offline too.
{
  const tab = await ctx.newPage();
  const res = await tab.goto(`${url}no-such-page/`).catch(() => null);
  const text = await tab.textContent('h1').catch(() => '');
  if (res?.status() !== 404 || !/Not here/.test(text)) fail(`offline, a missing page shows HTTP ${res?.status()} "${text}", not the 404 page`);
  await tab.close();
}

// A release: landing.js changes. It downloads in the background (that file only), waits while a
// second page is open, and takes over on the way to the next page once the front page is alone.
site.down = false; site.asked = [];
const mark = `\n// release ${Date.now()}\n`;
site.over['landing.js'] = readFileSync(join(ROOT, 'landing.js'), 'utf8') + mark;
files = { ...files, 'landing.js': hashOf(Buffer.from(site.over['landing.js'])) };
site.over['sw.js'] = withFiles(readFileSync(join(ROOT, 'sw.js'), 'utf8'), files);
const other = await ctx.newPage();
await other.goto(url + TO, { waitUntil: 'load' });
await front.reload({ waitUntil: 'load' });
const waiting = await front.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  await reg.update();
  for (let i = 0; i < 100 && !(reg.waiting); i++) await new Promise((r) => setTimeout(r, 100));
  return !!reg.waiting;
});
if (!waiting) fail('the new release does not download');
const fetched = site.asked.filter((f) => f !== 'sw.js' && !/\.(m4a|jpg)$/.test(f) && !PAGES.includes(f) && !f.startsWith('landing.js?'));
if (!site.asked.includes('landing.js')) fail('the new release does not fetch the changed file');
if (fetched.filter((f) => f !== 'landing.js').length > 2) fail(`the new release fetches ${fetched.length} files, not only the changed one (${fetched.slice(0, 5).join(', ')}…)`);
const landing = (tab) => tab.evaluate(() => fetch('/landing.js').then((r) => r.text()));
const go = async (tab) => {
  const card = tab.locator(`a[href="${TO}"]`).first();
  await card.scrollIntoViewIfNeeded();
  await Promise.all([tab.waitForURL(`**/${TO}`, { timeout: 10000 }), card.click()]);
  await tab.waitForLoadState('load');
};
await go(front);
if ((await landing(front)).includes(mark)) fail('with a second page open, the new release took over (that page would mix two releases)');
await other.close();
await front.goto(url, { waitUntil: 'load' });
await go(front);
if (!(await landing(front)).includes(mark)) fail('with one page open, the new release did not take over on the way to the next page');
site.down = true;
await front.goto(url, { waitUntil: 'load' }).catch((e) => fail(`the front page doesn't open offline after the release: ${e.message.split('\n')[0]}`));
if (!(await landing(front).catch(() => '')).includes(mark)) fail('offline after the release, the copy is not the new release');
const left = await front.evaluate(async () => (await (await caches.open('forte-offline')).keys()).filter((r) => /\/landing\.js\?/.test(r.url)).length);
if (left !== 1) fail(`the copy keeps ${left} landing.js, not just the new release's`);

await browser.close();
server.close();
console.log(fails.length ? `${fails.length} offline check${fails.length === 1 ? '' : 's'} failed` : `the site works offline (${PAGES.length} pages, and a release) in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fails.length ? 1 : 0);
