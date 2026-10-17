// Site checks: the registry, versions, changelog and every instrument's files agree.
// Run: node test/site-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INSTRUMENTS, SECTIONS, FORTE_VERSION, TEMPLATE } from '../shared/registry.js';
import { ASSETS, notes } from '../tools/plugin-release.mjs';
import { LATEST, SYSTEMS, archive, downloads, withPlugins } from '../shared/plugins.js';

let failures = 0;
function test(name, fn) { // returns a promise for an async test
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  const fail = (e) => { failures++; console.log('  FAIL', name, '\n       ', e.message); };
  try {
    const r = fn();
    if (r?.then) return r.then(() => console.log('  ok  ', name), fail);
    console.log('  ok  ', name);
  } catch (e) { fail(e); } }
const R = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, R), 'utf8');
const has = (p) => existsSync(new URL(p, R));
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const ready = INSTRUMENTS.filter((i) => i.ready);
const changelog = read('CHANGELOG.md');

console.log('versions');
test('Forte version is semver and matches package.json', () => {
  assert.match(FORTE_VERSION, SEMVER);
  assert.equal(JSON.parse(read('package.json')).version, FORTE_VERSION);
});
test('every ready instrument has a semver version; unbuilt ones have none', () => {
  for (const i of INSTRUMENTS) {
    if (i.ready) assert.match(i.version ?? '', SEMVER, i.id);
    else assert.equal(i.version, undefined, `${i.id} is not ready but has a version`);
  }
});
test('CHANGELOG.md has an entry for Forte and every instrument at its current version', () => {
  assert.ok(changelog.includes(`### Forte ${FORTE_VERSION}\n`), `### Forte ${FORTE_VERSION}`);
  for (const i of ready) assert.ok(changelog.includes(`### ${i.name} ${i.version}\n`), `### ${i.name} ${i.version}`);
});

console.log('registry');
test('ids are unique slugs; sections and accents are valid', () => {
  assert.equal(new Set(INSTRUMENTS.map((i) => i.id)).size, INSTRUMENTS.length);
  for (const i of INSTRUMENTS) {
    assert.match(i.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(SECTIONS.some((s) => s.id === i.section), `${i.id}: section ${i.section}`);
    assert.match(i.accent, /^#[0-9a-f]{6}$/i, i.id);
    assert.ok(i.name && i.tagline && i.physics, i.id);
  }
});
test('four sections, each with a tab name and at least one ready instrument; ready ones listed first', () => {
  assert.equal(SECTIONS.length, 4);
  for (const sec of SECTIONS) {
    assert.ok(sec.title && sec.short && sec.blurb, sec.id);
    const list = INSTRUMENTS.filter((i) => i.section === sec.id);
    assert.ok(list.some((i) => i.ready), `${sec.id} has nothing to play`);
    assert.ok(list.findIndex((i) => !i.ready) === -1 || list.slice(list.findIndex((i) => !i.ready)).every((i) => !i.ready), `${sec.id}: a workshop instrument before a ready one`);
  }
});
test('every ready instrument has a page, a README and a test suite', () => {
  for (const i of ready) {
    for (const f of [`${i.id}/index.html`, `${i.id}/README.md`, `test/${i.id}-tests.mjs`]) assert.ok(has(f), f);
    const html = read(`${i.id}/index.html`);
    assert.ok(html.includes(`data-instrument="${i.id}"`), `${i.id}: data-instrument`);
    assert.ok(html.includes('../shared/nav.js'), `${i.id}: nav`);
    assert.ok(html.includes(`<title>${i.name} · Forte</title>`), `${i.id}: title`);
  }
});
test('every demo in examples/index.json exists', () => {
  const index = JSON.parse(read('examples/index.json'));
  for (const [id, list] of Object.entries(index)) for (const d of list) assert.ok(has(`examples/${id}/${d.file}`), `${id}/${d.file}`);
});

console.log('plugins');
test('every ready instrument and the template have a unique four-character AU subtype', () => {
  const all = [...ready, TEMPLATE], codes = all.map((i) => i.plugin?.code);
  for (const [k, c] of codes.entries()) assert.match(c ?? '', /^[\x21-\x7e][\x20-\x7e]{2}[\x21-\x7e]$/, `${all[k].id}: plugin.code`);
  assert.equal(new Set(codes).size, codes.length, 'codes are unique');
  assert.ok(!codes.includes('Smok'), 'Smok is the native test instrument\'s (native/tests/smoke)');
});
test('every ready instrument and the template have a unique VST3 class id (native/ids.json)', () => {
  const ids = JSON.parse(read('native/ids.json'));
  for (const i of [...ready, TEMPLATE]) assert.match(ids[i.id]?.vst3 ?? '', /^[0-9A-F]{32}$/, `${i.id}: vst3`);
  const all = Object.values(ids).map((x) => x.vst3);
  assert.equal(new Set(all).size, all.length, 'ids are unique');
});

test('plugin.ready marks exactly the instruments with a native port', () => {
  for (const i of INSTRUMENTS) {
    const ported = has(`native/instruments/${i.id}/CMakeLists.txt`);
    assert.equal(!!i.plugin?.ready, ported && i.ready, `${i.id}: plugin.ready should be ${ported && i.ready}`);
  }
});
test('the release\'s archives are the ones CI packages and the pages link to', () => {
  const html = read('index.html'), sh = read('tools/package-plugins.sh');
  assert.ok(html.includes('id="plugins"') && html.includes('id="plugin-list"') && html.includes('id="plugin-rows"'), '#plugins, #plugin-list, #plugin-rows');
  for (const f of Object.values(ASSETS)) assert.ok(html.includes(`${LATEST}${f}`), `index.html links ${f}`);
  assert.ok(read('.github/workflows/native.yml').includes('tools/package-plugins.sh ${{ matrix.preset }}'), 'native.yml packages the plugins');
  assert.ok(read('.github/workflows/release-plugins.yml').includes('plugin-release.mjs --files'), 'release-plugins.yml checks every archive');
  // the script names its archives Forte-<id>-<system> and Forte-plugins-<system>, as shared/plugins.js does
  assert.ok(sh.includes('pack "Forte-$id"') && sh.includes('pack Forte-plugins'), 'package-plugins.sh archive names');
  for (const [, suffix] of SYSTEMS) assert.ok(sh.includes(`dist/$out-${suffix}"`), `package-plugins.sh writes *-${suffix}`);
  assert.deepEqual(downloads('gongs').map((d) => d.file), ['Forte-gongs-macos.zip', 'Forte-gongs-windows.zip', 'Forte-gongs-linux.tar.gz']);
  const md = notes();
  for (const i of withPlugins()) assert.ok(md.includes(`| ${i.version} |`) && md.includes(i.name) && md.includes(archive(i.id, 'macos.zip')), `notes list ${i.name}`);
  assert.ok(md.includes('xattr -dr com.apple.quarantine'), 'notes give the xattr command');
});
test('the macOS and Linux downloads install and verify themselves (make install, make verify)', () => {
  const sh = read('tools/package-plugins.sh'), mk = read('native/install.mk');
  assert.ok(sh.includes('cp native/install.mk "$dir/Makefile"') && sh.includes('cp native/install.sh "$dir/"'), 'package-plugins.sh adds the Makefile and install.sh');
  for (const t of ['install', 'verify', 'uninstall']) assert.ok(mk.includes('bash ./install.sh $@') && mk.includes(t), `the Makefile runs install.sh ${t}`);
  const ci = read('.github/workflows/native.yml');
  assert.ok(ci.includes('make install') && ci.includes('make verify'), 'native.yml runs the Makefile on the archive');
  if (process.platform !== 'linux') return;
  // a folder like a download, with a stand-in CLAP and standalone, installed into a scratch home
  const t = mkdtempSync(join(tmpdir(), 'forte-install-')), dl = join(t, 'Gong Keyboard');
  try {
    mkdirSync(dl);
    copyFileSync(new URL('native/install.sh', R), join(dl, 'install.sh'));
    writeFileSync(join(dl, 'Gong Keyboard.clap'), 'clap');
    writeFileSync(join(dl, 'Gong Keyboard'), 'app', { mode: 0o755 });
    const run = (cmd) => execFileSync('bash', [join(dl, 'install.sh'), cmd], { env: { ...process.env, HOME: join(t, 'home'), PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
    run('install');
    assert.ok(has(join(t, 'home/.clap/Gong Keyboard.clap')) && has(join(t, 'home/.local/bin/Gong Keyboard')), 'installed');
    assert.match(run('verify'), /All installed and working/);
    rmSync(join(t, 'home/.clap/Gong Keyboard.clap'));
    assert.throws(() => run('verify'), (e) => /Gong Keyboard\.clap is not installed/.test(e.stdout));
    run('uninstall');
    assert.ok(!has(join(t, 'home/.local/bin/Gong Keyboard')), 'uninstalled');
  } finally { rmSync(t, { recursive: true, force: true }); }
});
test('each instrument with plugins offers them on its page (How it works, shared/notes.js)', () => {
  const js = read('shared/notes.js');
  assert.ok(js.includes('downloads(inst.id)') && js.includes("'#plugin'"), 'notes.js lists the downloads and opens at #plugin');
  for (const i of withPlugins()) assert.ok(read(`${i.id}/index.html`).includes('../shared/nav.js'), `${i.id} loads nav.js (and notes.js)`);
});

console.log('credits');
test('every ready instrument\'s README ends with its prior art and references', () => {
  for (const i of ready) {
    const md = read(`${i.id}/README.md`);
    const at = md.indexOf('\n## Prior art and references');
    assert.ok(at > 0, `${i.id}: no "## Prior art and references" section`);
    assert.ok(!md.slice(at + 1).includes('\n## '), `${i.id}: prior art should be the last section`);
    assert.ok(/doi\.org|https?:\/\//.test(md.slice(at)), `${i.id}: prior art has no links`);
  }
});
test('the project-wide prior art exists and the site links to it', () => {
  assert.ok(has('docs/PRIOR_ART.md') && has('credits/index.html'));
  assert.ok(read('index.html').includes('href="credits/"'), 'landing page links to credits/');
});

console.log('pages');
test('instrument pages keep their presets in the controls, for the header to take', () => {
  for (const i of ready) {
    const html = read(`${i.id}/index.html`);
    assert.ok(/<aside id="controls">\s*<div class="preset-row">\s*<select id="preset"/.test(html), `${i.id}: #controls > .preset-row > #preset`);
    assert.ok(html.includes('id="reset"'), `${i.id}: #reset`);
  }
});
test('instrument pages mark one or two views for Perform (data-perform)', () => {
  for (const i of [...ready, { id: 'docs/template' }]) {
    const n = (read(`${i.id}/index.html`).match(/<div class="card"[^>]* data-perform[\s>]/g) || []).length;
    assert.ok(n >= 1 && n <= 2, `${i.id}: ${n} views marked data-perform`);
  }
});
test('a control surface (data-control) is a control, not a view: never marked for Perform', () => {
  for (const i of ready) {
    for (const m of read(`${i.id}/index.html`).matchAll(/<div class="card"([^>]*)>/g)) {
      assert.ok(!(m[1].includes('data-control') && m[1].includes('data-perform')), `${i.id}: a card is both`);
    }
  }
});
test('the landing page has the category tabs, the instrument list and an About dialog', () => {
  const html = read('index.html');
  for (const id of ['cats', 'instruments', 'about', 'about-open']) assert.ok(html.includes(`id="${id}"`), `#${id}`);
});

console.log('descriptors');
const described = [...ready.map((i) => ({ id: i.id, dir: i.id })), { id: 'template', dir: 'docs/template' }];
for (const { id, dir } of described) {
  const file = `${dir}/src/${id}-instrument.js`;
  await test(`${id}: a headless descriptor (${file}) that its page uses`, async () => {
    assert.ok(has(file), file);
    const { INSTRUMENT: I } = await import(new URL(file, R));
    assert.equal(I.id, id);
    const params = new Map(I.groups.flatMap((g) => g.params).map((p) => [p.id, p]));
    assert.ok(params.size && Array.isArray(I.presets), 'groups and presets');
    const [lo, hi] = I.range;
    assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 0 && hi <= 127 && lo < hi, `range ${I.range}`);
    assert.ok(['sustain', 'hold', null].includes(I.space), `space ${I.space}`);
    const mw = typeof I.modWheel === 'string' ? I.modWheel : I.modWheel?.param;
    if (mw) assert.ok(params.has(mw), `modWheel ${mw}`);
    for (const k of ['volume', 'room', 'tone']) if (I.chain[k]) assert.ok(params.has(I.chain[k]), `chain.${k} ${I.chain[k]}`);
    if (I.chain.body) assert.ok(params.has(I.chain.body.param), `chain.body ${I.chain.body.param}`);
    assert.ok(params.has(I.chain.volume), 'chain.volume');
    const E = (await import(I.engine.module))[I.engine.name];
    assert.equal(typeof E, 'function', `${I.engine.module} exports ${I.engine.name}`);
    for (const m of ['setParams', 'noteOn', 'noteOff', 'process']) assert.equal(typeof E.prototype[m], 'function', `${I.engine.name}.${m}`);
    const pages = readdirSync(new URL(`${dir}/src/`, R)).filter((f) => /main\.js$/.test(f));
    assert.ok(pages.some((f) => read(`${dir}/src/${f}`).includes(`${id}-instrument.js`)), 'the page imports it');
  });
}

console.log('parameters and presets');
for (const i of ready) {
  const file = readdirSync(new URL(`${i.id}/src/`, R)).find((f) => /params\.js$/.test(f));
  const mod = await import(new URL(`${i.id}/src/${file}`, R));
  test(`${i.name}: a few performance controls (perform: true), volume among them`, () => {
    const perform = mod.GROUPS.flatMap((g) => g.params).filter((p) => p.perform);
    assert.ok(perform.length >= 3 && perform.length <= 10, `${perform.length} performance controls (3–10 fit above the keys)`);
    assert.ok(perform.some((p) => p.id === 'volume'), 'volume');
    for (const p of perform) assert.equal(p.perform, true, p.id);
  });
  test(`${i.name}: presets use real parameters, with values in range`, () => {
    const params = new Map(mod.GROUPS.flatMap((g) => g.params).map((p) => [p.id, p]));
    for (const pr of mod.PRESETS) for (const [id, v] of Object.entries(pr.p)) {
      const p = params.get(id);
      if (!p) continue; // instruments may keep non-slider state in presets (e.g. drawbars)
      if (p.type === 'select') assert.ok(p.options.some(([k]) => k === v), `${pr.name}: ${id} = ${v} is not an option`);
      else if (p.type === 'checkbox') assert.equal(typeof v, 'boolean', `${pr.name}: ${id}`);
      else if (typeof v === 'number') assert.ok(v >= p.min - 1e-9 && v <= p.max + 1e-9, `${pr.name}: ${id} = ${v} outside [${p.min}, ${p.max}]`);
    }
    for (const p of params.values()) if (p.type !== 'select' && p.type !== 'checkbox' && typeof p.def === 'number') assert.ok(p.def >= p.min && p.def <= p.max, `default of ${p.id}`);
  });
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
