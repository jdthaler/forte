// Offline checks: what the service worker (sw.js) keeps, and its list (tools/offline.mjs).
// tools/check-offline.mjs opens every page offline in Chromium; this checks the files without one.
// Run: node test/offline-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { INSTRUMENTS } from '../shared/registry.js';
import { kept, offlineFiles, withFiles, filesIn, differences, hashOf } from '../tools/offline.mjs';

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const R = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, R), 'utf8');
const ready = INSTRUMENTS.filter((i) => i.ready);
const files = offlineFiles();

console.log('what is kept');
test('every page, its scripts, styles, WebAssembly and README, and the icons are kept', () => {
  for (const f of ['index.html', 'landing.js', 'landing.css', '404.html', 'manifest.webmanifest', 'examples/index.json',
    'docs/PRIOR_ART.md', 'credits/index.html', 'shared/boot.js', 'shared/shell.js', 'shared/worklet.js', 'icons/apple-touch-icon.png'])
    assert.ok(files[f], `${f} is kept`);
  for (const i of ready) {
    for (const f of [`${i.id}/index.html`, `${i.id}/README.md`, `${i.id}/style.css`, `${i.id}/src/${i.id}-tour.js`])
      if (existsSync(new URL(f, R))) assert.ok(files[f], `${f} is kept`);
    assert.ok(Object.keys(files).some((f) => f.startsWith(`${i.id}/`) && f.endsWith('.wasm')), `${i.id}: its WebAssembly is kept`);
  }
});

test('the demos, link pictures, tests, tools, the native code and the notes stay online', () => {
  for (const f of ['examples/gongs/01.m4a', 'gongs/preview.jpg', 'icons/preview.jpg', 'test/site-tests.mjs', 'tools/release.mjs',
    'native/plugin/plugin.cpp', 'changes/README.md', 'docs/template/index.html', 'CHANGELOG.md', 'README.md', 'package.json', 'sw.js', 'CNAME'])
    assert.ok(!kept(f), `${f} isn't kept`);
  assert.ok(!Object.keys(files).some((f) => /\.(m4a|jpg|wav)$/.test(f)), 'no audio or pictures');
  const bytes = Object.keys(files).reduce((n, f) => n + readFileSync(new URL(f, R)).length, 0);
  assert.ok(bytes < 20e6, `the copy is ${(bytes / 1e6).toFixed(1)} MB: a phone downloads all of it on the first visit`);
});

// Every file a page names (its <script>, <link> and <img>, and the modules they import, from
// the page on) is kept: a page offline loads nothing else before Start audio.
test('every file a page loads, and every module those import, is kept', () => {
  const missing = new Set(), seen = new Set();
  const local = (ref, from) => {
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(ref)) return null;
    const u = new URL(ref.split('#')[0].split('?')[0], new URL(from, R));
    return u.href.startsWith(R.href) ? decodeURIComponent(u.href.slice(R.href.length)) : null;
  };
  const visit = (f, from) => {
    if (f === null || seen.has(f)) return;
    seen.add(f);
    if (f.endsWith('/') || f === '') f += 'index.html';
    if (!files[f]) { missing.add(`${f} (from ${from})`); return; }
    const text = /\.(html|js)$/.test(f) ? read(f) : '';
    if (f.endsWith('.html')) {
      for (const m of text.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) visit(local(m[1], f), f);
    } else if (f.endsWith('.js')) {
      for (const m of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'|\bimport\('(\.[^']+)'\)/gm)) visit(local(m[1] ?? m[2] ?? m[3], f), f);
    }
  };
  for (const p of ['', 'credits/', ...ready.map((i) => `${i.id}/`)]) visit(p, 'the site');
  assert.ok(seen.size > 300, `only ${seen.size} files found from the pages`);
  assert.deepEqual([...missing], []);
});

console.log('the list');
test('sw.js carries a list in the form tools/offline.mjs writes, and reads back what it wrote', () => {
  const sw = read('sw.js'), now = filesIn(sw);
  assert.ok(Object.keys(now).length > 300, `sw.js lists ${Object.keys(now).length} files`);
  for (const [f, h] of Object.entries(now)) { assert.ok(kept(f), `${f} is listed but not kept`); assert.match(h, /^[0-9a-f]{12}$/, f); }
  assert.deepEqual(filesIn(withFiles(sw, files)), files);
  assert.equal(withFiles(withFiles(sw, files), files), withFiles(sw, files), 'writing it twice changes nothing');
  assert.equal(withFiles(sw, files).replace(/\/\/ <offline-files>[\s\S]*<\/offline-files>/, ''), sw.replace(/\/\/ <offline-files>[\s\S]*<\/offline-files>/, ''), 'only the list changes');
});

test('a changed, added or removed file is a difference; the same list is none', () => {
  assert.deepEqual(differences(files, { ...files }), []);
  const { 'landing.js': gone, ...rest } = files;
  assert.deepEqual(differences(files, { ...rest, 'new.js': 'abc', 'index.html': '000000000000' }), ['~ index.html', '+ new.js', '- landing.js']);
  assert.ok(gone);
});

test('the hash is the one the service worker checks: the first 12 hex digits of a SHA-256', () => {
  assert.equal(hashOf(Buffer.from('')), 'e3b0c44298fc');
  assert.match(read('sw.js'), /digest\('SHA-256', buf\)\)\.slice\(0, 12\)/);
});

test('every page registers the service worker (shared/boot.js first in its head)', () => {
  for (const p of ['index.html', 'credits/index.html', ...ready.map((i) => `${i.id}/index.html`)]) {
    const html = read(p), boot = html.indexOf('shared/boot.js"');
    assert.ok(boot > 0 && boot < html.indexOf('<link'), `${p}: shared/boot.js before the styles`);
  }
  assert.match(read('shared/boot.js'), /serviceWorker\.register/);
});

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall offline tests passed');
