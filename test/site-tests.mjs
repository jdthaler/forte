// Site checks: the registry, versions, changelog and every instrument's files agree.
// Run: node test/site-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INSTRUMENTS, SECTIONS, FORTE_VERSION, TEMPLATE } from '../shared/registry.js';
import { ASSETS, notes } from '../tools/plugin-release.mjs';
import { withTags, pictureOf } from '../tools/make-previews.mjs';
import { readNotes, parseNote, plan, bump } from '../tools/release.mjs';
import { compare, stateOf, contractPath, STATES } from '../tools/contract.mjs';
import { TOUCH, SOFT_PEDAL, touch, touched, createSostenuto, wheelValue } from '../shared/midi.js';
import { LATEST, SYSTEMS, archive, downloads, withPlugins, parseRelease, releaseLine } from '../shared/plugins.js';

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
  // an instrument not released yet has its entry waiting in a note in changes/, marked (new)
  const first = new Set(readNotes().flatMap((n) => n.sections.filter((s) => s.kind === 'new').map((s) => s.name)));
  for (const i of ready) assert.ok(first.has(i.name) || changelog.includes(`### ${i.name} ${i.version}\n`), `### ${i.name} ${i.version}`);
});
test('the notes in changes/ are well formed (tools/release.mjs)', () => {
  const notes = readNotes();
  if (notes.length) plan(notes); // and would make a release
});
test('a note names Forte or an instrument, and patch, minor, major or new; a release bumps by the largest', () => {
  const n = parseNote('x.md', '# a topic\n\n### Forte (minor)\n- one\n\n### Gong Keyboard (patch)\n- two\n');
  assert.deepEqual(n.sections.map((s) => [s.name, s.kind, s.body]), [['Forte', 'minor', '- one'], ['Gong Keyboard', 'patch', '- two']]);
  assert.throws(() => parseNote('x.md', '### Forte (minor)\n- no topic\n'), /first line/);
  assert.throws(() => parseNote('x.md', '# t\n### Fortissimo (minor)\n- who\n'), /neither Forte/);
  assert.throws(() => parseNote('x.md', '# t\n### Forte (huge)\n- what\n'), /patch, minor, major or new/);
  assert.throws(() => parseNote('x.md', '# t\n### Forte (patch)\n'), /says nothing/);
  assert.equal(bump('0.30.9', 'minor'), '0.31.0');
  assert.equal(bump('0.30.9', 'patch'), '0.30.10');
  assert.equal(bump('0.30.9', 'major'), '1.0.0');
  assert.equal(bump('1.4.2', 'major'), '2.0.0');
  const m = plan([n, parseNote('z.md', '# v1\n### Gong Keyboard (major)\n- stable\n')], '2026-01-02');
  assert.equal(m.changes.find((c) => c.name === 'Gong Keyboard').kind, 'major');
  const p = plan([n, parseNote('y.md', '# another\n### Forte (patch)\n- three\n')], '2026-01-02');
  assert.equal(p.changes[0].to, bump(FORTE_VERSION, 'minor'));
  assert.ok(p.entry.startsWith(`## 2026-01-02 — a topic; another\n\n### Forte ${bump(FORTE_VERSION, 'minor')}\n- one\n- three\n`), p.entry);
});

console.log('saved songs (tools/contract.mjs)');
test('a contract breaks when a parameter, an option or a preset is removed, moved or changed, not when one is added', () => {
  const c = { slug: 'x', params: [{ id: 'a', kind: 'continuous', min: 0, max: 1, def: 0.5, step: 0, log: false }, { id: 'b', kind: 'choice', def: 'p', options: ['p', 'q'] }],
    presets: [{ name: 'One', values: { a: 0.2 } }] };
  const with_ = (f) => { const d = structuredClone(c); f(d); return compare(c, d); };
  assert.deepEqual(compare(c, c), { breaks: [], added: [] });
  assert.equal(with_((d) => { d.params.push({ id: 'z', kind: 'toggle', def: false }); d.params[1].options.push('r'); d.presets.push({ name: 'Two', values: {} }); }).breaks.length, 0);
  assert.equal(with_((d) => { d.params.push({ id: 'z', kind: 'toggle', def: false }); d.params[1].options.push('r'); d.presets.push({ name: 'Two', values: {} }); }).added.length, 3);
  for (const [why, f] of [['removed', (d) => d.params.shift()], ['range', (d) => { d.params[0].max = 2; }], ['default', (d) => { d.params[0].def = 0.4; }],
    ['scaling', (d) => { d.params[0].log = true; }], ['kind', (d) => { d.params[0] = { id: 'a', kind: 'toggle', def: false }; }],
    ['options moved', (d) => d.params[1].options.reverse()], ['preset renamed', (d) => { d.presets[0].name = 'Uno'; }],
    ['preset values', (d) => { d.presets[0].values.a = 0.3; }], ['preset removed', (d) => d.presets.pop()]]) {
    assert.ok(with_(f).breaks.length, why);
  }
  assert.equal(stateOf(c, '0.1.0'), 'forte x 0.1.0\na 0.20000000000000001\nb 0\npreset 1\n');
});
test('every ported instrument has a contract, and a saved state at its version for the plugin tests to load', () => {
  for (const i of ready.filter((x) => existsSync(new URL(`native/instruments/${x.id}/`, R)))) {
    const c = JSON.parse(read(contractPath(i.id)));
    assert.equal(c.slug, i.id);
    const file = `${STATES}${i.id}-${i.version}.state`;
    assert.ok(existsSync(new URL(file, R)), `${file} (node tools/contract.mjs --save-states)`);
  }
});

console.log('MIDI (shared/midi.js)');
test('the velocity curve and the soft pedal match the plugins\' (plugin.cpp kTouchGamma, kSoftPedal)', () => {
  const cpp = read('native/plugin/plugin.cpp');
  assert.ok(cpp.includes(`kTouchGamma[] = {${TOUCH.map((t) => t.gamma).join(', ')}}`), 'the same γ');
  assert.ok(cpp.includes(`kTouchChoices[] = {${TOUCH.map((t) => `"${t.name}"`).join(', ')}}`), 'the same names');
  assert.ok(cpp.includes(`kSoftPedal = ${SOFT_PEDAL};`), 'the same soft pedal');
  assert.equal(touch(), 1); // Normal, until the player picks another
  assert.equal(touched(0.5), 0.5);
});
test('the sostenuto pedal holds the keys sounding as it goes down, and only those', () => {
  const s = createSostenuto();
  assert.equal(s.holds(60), false);         // not down: a key let go ends
  assert.deepEqual(s.set(true, [60, 64]), []);
  assert.equal(s.holds(60), true);          // caught: held
  assert.equal(s.holds(72), false);         // struck after: not caught
  s.strike(64); assert.equal(s.holds(64), true);
  s.strike(64);                             // struck again while held: a hand has it
  assert.deepEqual([...s.keys()], [60]);
  assert.deepEqual(s.set(false, []), [60]); // coming up lets go of what it held
  assert.equal(s.holds(60), false);
});
test('the mod wheel at rest is the parameter\'s default, fully up its maximum', () => {
  const p = { min: 0, max: 10, def: 2 };
  assert.equal(wheelValue(p, 0), 2);
  assert.equal(wheelValue(p, 127), 10);
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
test('five sections, each with a tab name and at least one ready instrument; ready ones listed first', () => {
  assert.equal(SECTIONS.length, 5);
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
test('every ready instrument and the front page have a picture and the tags a shared link shows', () => {
  for (const i of [null, ...ready]) {
    const page = i ? `${i.id}/index.html` : 'index.html', html = read(page);
    assert.ok(has(pictureOf(i?.id)), `${pictureOf(i?.id)} exists (node tools/make-previews.mjs ${i?.id ?? 'index'})`);
    assert.equal(html, withTags(html, i), `${page}: its tags are up to date (node tools/make-previews.mjs --tags)`);
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
  assert.ok(html.includes('id="plugins"') && html.includes('id="plugin-list"'), '#plugins, #plugin-list');
  // the front page offers every instrument together; each instrument's own download is on its page
  for (const i of withPlugins()) assert.ok(!html.includes(archive(i.id, 'macos.zip')), `index.html leaves ${i.name}'s own download to its page`);
  for (const f of Object.values(ASSETS)) assert.ok(html.includes(`${LATEST}${f}`), `index.html links ${f}`);
  assert.ok(read('.github/workflows/native.yml').includes('tools/package-plugins.sh ${{ matrix.preset }}'), 'native.yml packages the plugins');
  assert.ok(read('.github/workflows/release-plugins.yml').includes('plugin-release.mjs --files'), 'release-plugins.yml checks every archive');
  // the script names its archives Forte-<id>-<system> and Forte-plugins-<system>, as shared/plugins.js does
  assert.ok(sh.includes('pack "Forte-$id"') && sh.includes('pack Forte-plugins'), 'package-plugins.sh archive names');
  for (const [, suffix] of SYSTEMS) assert.ok(sh.includes(`dist/$out-${suffix}"`), `package-plugins.sh writes *-${suffix}`);
  assert.deepEqual(downloads('gongs').map((d) => d.file), ['Forte-gongs-macos.zip', 'Forte-gongs-windows.zip', 'Forte-gongs-linux.tar.gz']);
  // and each format alone, which the script packs as Forte-<id>-<format>-<system>
  assert.deepEqual(downloads('gongs').map((d) => d.each.map((e) => e.file)), [
    ['Forte-gongs-au-macos.zip', 'Forte-gongs-vst3-macos.zip', 'Forte-gongs-clap-macos.zip', 'Forte-gongs-app-macos.zip'],
    ['Forte-gongs-vst3-windows.zip', 'Forte-gongs-clap-windows.zip', 'Forte-gongs-app-windows.zip'],
    ['Forte-gongs-vst3-linux.tar.gz', 'Forte-gongs-clap-linux.tar.gz', 'Forte-gongs-app-linux.tar.gz'],
  ]);
  assert.ok(sh.includes('pack "Forte-$id-$f"') && sh.includes('pack "Forte-plugins-$f"'), 'package-plugins.sh packs each format alone');
  for (const [, , formats] of SYSTEMS) for (const f of formats) assert.ok(new RegExp(`\\) formats=\\([^)]*\\b${f}\\b`).test(sh), `package-plugins.sh packs ${f}`);
  assert.ok(read('landing.js').includes("downloadLinks()"), 'All Plugins offers each format alone');
  // and the Forte app alone, Forte-app-<system>, offered beside every instrument's (not on an instrument's page)
  assert.deepEqual(downloads().map((d) => d.app.file), ['Forte-app-macos.zip', 'Forte-app-windows.zip', 'Forte-app-linux.tar.gz']);
  assert.ok(downloads('gongs').every((d) => d.app === null), 'an instrument\'s page offers no Forte app');
  assert.ok(sh.includes('pack Forte-app "Forte app" app Forte'), 'package-plugins.sh packs the Forte app alone');
  // every standalone app has its icon, drawn by tools/make-icons.py (forte.cmake passes them on)
  for (const id of ['forte', ...withPlugins().map((i) => i.id)]) for (const ext of ['icns', 'ico'])
    assert.ok(existsSync(new URL(`../native/icons/${id}.${ext}`, import.meta.url)), `native/icons/${id}.${ext} exists (python3 tools/make-icons.py)`);
  const md = notes();
  for (const i of withPlugins()) assert.ok(md.includes(`| ${i.version} |`) && md.includes(i.name) && md.includes(archive(i.id, 'macos.zip')), `notes list ${i.name}`);
  assert.ok(md.includes('xattr -dr com.apple.quarantine'), 'notes give the xattr command');
});
test('the downloads install and verify themselves (make install, make verify, make check-app, make unquarantine-app…; install.cmd on Windows)', () => {
  const sh = read('tools/package-plugins.sh'), mk = read('native/install.mk');
  assert.ok(sh.includes('cp native/install.mk "$dir/Makefile"') && sh.includes('cp native/install.sh "$dir/"'), 'package-plugins.sh adds the Makefile and install.sh');
  assert.ok(mk.includes('install verify uninstall check unquarantine:') && mk.includes('bash ./install.sh $@'), 'the Makefile runs install.sh install, verify, uninstall, check and unquarantine');
  for (const t of ['install', 'verify', 'uninstall', 'check', 'unquarantine']) assert.ok(mk.includes(`${t}-%:\n\t@bash ./install.sh ${t} $*`), `make ${t}-<format> runs install.sh ${t} <format>`);
  const ci = read('.github/workflows/native.yml');
  assert.ok(ci.includes('make install') && ci.includes('make verify'), 'native.yml runs the Makefile on the archive');
  assert.ok(sh.includes('cp native/install.cmd native/install.ps1 "$dir"/'), 'package-plugins.sh adds install.cmd and install.ps1 to the Windows downloads');
  const ps = read('native/install.ps1'), cmd = read('native/install.cmd');
  assert.ok(cmd.includes('install.ps1" %*') && cmd.includes('\r\n'), 'install.cmd runs install.ps1, with Windows line endings');
  for (const t of ['install', 'verify', 'uninstall', 'check', 'unblock']) assert.ok(ps.includes(`'${t}' { Do-`), `install.ps1 does ${t}`);
  assert.ok(ci.includes('Run install') && ci.includes('Run verify'), 'native.yml runs install.cmd on the Windows archive');
  if (process.platform !== 'linux') return;
  // a folder like a download, with a stand-in CLAP and standalone, installed into a scratch home
  const t = mkdtempSync(join(tmpdir(), 'forte-install-')), dl = join(t, 'Gong Keyboard');
  try {
    mkdirSync(dl);
    copyFileSync(new URL('native/install.sh', R), join(dl, 'install.sh'));
    writeFileSync(join(dl, 'Gong Keyboard.clap'), 'clap');
    writeFileSync(join(dl, 'Gong Keyboard'), 'app', { mode: 0o755 });
    const run = (...args) => execFileSync('bash', [join(dl, 'install.sh'), ...args], { env: { ...process.env, HOME: join(t, 'home'), PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
    // the standalone checked where it is, then one format alone
    assert.match(run('check', 'app'), /ok {4}Gong Keyboard\n[^]*runs from this folder/);
    assert.match(run('unquarantine', 'app'), /Only macOS quarantines/);
    run('install', 'clap');
    assert.ok(has(join(t, 'home/.clap/Gong Keyboard.clap')) && !has(join(t, 'home/.local/bin/Gong Keyboard')), 'make install-clap installs the CLAP alone');
    assert.match(run('verify', 'clap'), /All installed and working/);
    assert.throws(() => run('verify', 'app'), (e) => /Gong Keyboard is not installed \(make install-app\)/.test(e.stdout));
    assert.throws(() => run('install', 'vst4'), (e) => /Unknown format 'vst4'/.test(e.stderr));
    run('uninstall', 'clap');
    assert.ok(!has(join(t, 'home/.clap/Gong Keyboard.clap')), 'make uninstall-clap');
    run('install');
    assert.ok(has(join(t, 'home/.clap/Gong Keyboard.clap')) && has(join(t, 'home/.local/bin/Gong Keyboard')), 'installed');
    assert.match(run('verify'), /All installed and working/);
    rmSync(join(t, 'home/.clap/Gong Keyboard.clap'));
    assert.throws(() => run('verify'), (e) => /Gong Keyboard\.clap is not installed/.test(e.stdout));
    run('uninstall');
    assert.ok(!has(join(t, 'home/.local/bin/Gong Keyboard')), 'uninstalled');
  } finally { rmSync(t, { recursive: true, force: true }); }
});
test('each instrument with plugins offers them on its page (its Plugin dialog, shared/notes.js)', () => {
  const js = read('shared/notes.js');
  assert.ok(js.includes('downloadLinks(inst.id)') && js.includes("'#plugin'"), 'notes.js lists the downloads and opens at #plugin');
  for (const i of withPlugins()) assert.ok(read(`${i.id}/index.html`).includes('../shared/nav.js'), `${i.id} loads nav.js (and notes.js)`);
});
test('the downloads say which plugin release they are, read back from its notes (the site goes live first)', () => {
  const rel = parseRelease({ tag_name: 'plugins-v1.2.3', html_url: 'https://github.com/jdthaler/forte/releases/tag/plugins-v1.2.3', body: notes() });
  assert.equal(rel.forte, FORTE_VERSION, 'the notes name the Forte version');
  assert.deepEqual(rel.versions, Object.fromEntries(withPlugins().map((i) => [i.id, i.version])), 'the notes\' table gives each instrument\'s version');
  const [a, b] = withPlugins();
  assert.ok(releaseLine(rel, a).ok && releaseLine(rel, a).html.includes(`${a.name} ${a.version}, from <a`), 'the same version');
  assert.ok(releaseLine(rel).html.startsWith(`Forte ${FORTE_VERSION}'s plugins, from`), 'every instrument: the same Forte');
  // a release older than the site: this version, or this instrument, is still to come
  const old = { ...rel, forte: '0.0.1', versions: { ...rel.versions, [a.id]: '0.0.1' } };
  delete old.versions[b.id];
  assert.ok(releaseLine(old, a).ok && releaseLine(old, a).html.includes(`This page is ${a.version}`), 'an older version');
  assert.ok(!releaseLine(old, b).ok && releaseLine(old, b).html.includes('No plugin of'), 'not released yet: no downloads');
  assert.ok(releaseLine(old).html.includes(`The site is Forte ${FORTE_VERSION}`), 'every instrument: an older Forte');
  for (const f of ['shared/notes.js', 'landing.js']) assert.ok(read(f).includes('releaseLine('), `${f} shows the release`);
  assert.ok(read('index.html').includes('forte-plugin-rel'), 'All Plugins has the release line');
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
test('the notices name every dependency, and the downloads carry them with the licence', () => {
  const notices = read('THIRD-PARTY-NOTICES.md'), sh = read('tools/package-plugins.sh');
  const fetched = [...read('native/cmake/dependencies.cmake').matchAll(/^\s*forte_fetch\((\w+) (\S+?)(?:\.git)? /gm)];
  assert.ok(fetched.length >= 9, `${fetched.length} dependencies in dependencies.cmake`);
  for (const [, name, url] of fetched) assert.ok(notices.includes(`(${url})`) || notices.includes(`<${url}>`), `THIRD-PARTY-NOTICES.md links ${name} (${url})`);
  assert.ok(sh.includes('cp native/INSTALL.md THIRD-PARTY-NOTICES.md "$dir"/') && sh.includes('cp LICENSE "$dir/LICENSE.txt"'), 'package-plugins.sh adds the notices and LICENSE.txt');
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
test('the landing page has the category tabs, the instrument list and the About, All Plugins and Credits overlays', () => {
  const html = read('index.html');
  for (const id of ['cats', 'instruments', 'about', 'plugins', 'credits']) assert.ok(html.includes(`id="${id}"`), `#${id}`);
  for (const id of ['about', 'plugins', 'credits']) {
    assert.ok(new RegExp(`<dialog[^>]* id="${id}"`).test(html), `#${id} is a dialog`);
    assert.ok(html.includes(`data-sheet="${id}"`), `a button opens #${id}`);
  }
  assert.ok(html.includes('src="icons/icon-192.png"'), 'About shows the app icon');
});
test('the site links to the repository\'s files on live, the branch it is published from', () => {
  const files = ['index.html', 'landing.js', 'credits/index.html', 'credits/credits.js',
    ...readdirSync(new URL('shared/', R)).filter((f) => f.endsWith('.js')).map((f) => `shared/${f}`),
    ...ready.map((i) => `${i.id}/index.html`)];
  for (const f of files) assert.ok(!/jdthaler\/forte\/(blob|tree|raw)\/(?!live\/)/.test(read(f)), `${f} links to a branch other than live`);
  assert.ok(read('index.html').includes('https://github.com/jdthaler/forte/blob/live/CHANGELOG.md'), 'the changelog link');
});

console.log('descriptors');
// instruments whose physics stops short of A0–C8 (each README says why)
const RANGE_LIMITS = {
  bubbles: [57, 108], // below A3 a bubble would be over 3 cm across: a spherical cap, not the breathing sphere the model rings
  carillon: [41, 108], // below F2 a bell would outweigh the largest carillon bourdons ever cast (about 20 t)
  windharp: [21, 100], // above E7 no string sheds at its note in the reference wind (Re below 47)
  springs: [21, 96], // above C7 the spring's F_C is far above hearing: a few nearly harmonic modes, no chirp
  bowed: [21, 98], // above D7 the string, at C6's stress, no longer settles into Helmholtz motion at the voiced touch
};
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
    // an 88-key keyboard plays every key, unless the physics stops short (said in RANGE_LIMITS)
    const limit = RANGE_LIMITS[id];
    if (limit) assert.deepEqual([lo, hi], limit, `range ${I.range}, RANGE_LIMITS says ${limit}`);
    else assert.ok(lo <= 21 && hi >= 108, `range ${I.range} covers A0–C8 (21–108)`);
    if (I.compass) { // a historical compass: the keys that play until a checkbox opens the range
      const [a, b] = I.compass.keys, p = params.get(I.compass.param);
      assert.ok(lo <= a && a < b && b <= hi && (a > lo || b < hi), `compass ${I.compass.keys} inside ${I.range}`);
      assert.ok(p?.type === 'checkbox' && p.def === false, `compass.param ${I.compass.param}: a checkbox, off`);
    }
    assert.ok(['sustain', 'hold', null].includes(I.space), `space ${I.space}`);
    const mw = typeof I.modWheel === 'string' ? I.modWheel : I.modWheel?.param;
    if (mw) assert.ok(params.has(mw), `modWheel ${mw}`);
    for (const k of ['volume', 'room', 'tone']) if (I.chain[k]) assert.ok(params.has(I.chain[k]), `chain.${k} ${I.chain[k]}`);
    if (I.chain.body) assert.ok(params.has(I.chain.body.param), `chain.body ${I.chain.body.param}`);
    assert.ok(params.has(I.chain.volume), 'chain.volume');
    assert.ok(!I.engine && !I.engineParams, 'the engine is the C++ (wasm), not JavaScript');
    assert.ok(I.wasm?.binary && has(new URL(I.wasm.binary).pathname.slice(R.pathname.length)), `wasm.binary ${I.wasm?.binary}`);
    const E = (await import(I.wasm.module))[I.wasm.name];
    assert.equal(typeof E, 'function', `${I.wasm.module} exports ${I.wasm.name}`);
    for (const m of ['setParams', 'noteOn', 'noteOff', 'process']) assert.equal(typeof E.prototype[m], 'function', `${I.wasm.name}.${m}`);
    const pages = readdirSync(new URL(`${dir}/src/`, R)).filter((f) => /main\.js$/.test(f));
    assert.ok(pages.some((f) => read(`${dir}/src/${f}`).includes(`${id}-instrument.js`)), 'the page imports it');
  });
}

console.log('parameters and presets');
for (const i of ready) {
  const file = readdirSync(new URL(`${i.id}/src/`, R)).find((f) => /params\.js$/.test(f));
  const mod = await import(new URL(`${i.id}/src/${file}`, R));
  // the organ's console (its drawbars and switches) sits above the keys too
  test(`${i.name}: a few performance controls (perform: true), volume among them`, () => {
    const perform = [...mod.GROUPS, ...(mod.CONSOLE_GROUPS ?? [])].flatMap((g) => g.params).filter((p) => p.perform);
    assert.ok(perform.length >= 3 && perform.length <= 10, `${perform.length} performance controls (3–10 fit above the keys)`);
    assert.ok(perform.some((p) => p.id === 'volume'), 'volume');
    for (const p of perform) assert.equal(p.perform, true, p.id);
  });
  // the page's strip above the keys keeps to what matters mid-phrase: volume, the computer keys'
  // velocity, a pedal
  test(`${i.name}: the strip above the keys (strip: true) is volume and at most two more, all performance controls`, () => {
    const strip = mod.GROUPS.flatMap((g) => g.params).filter((p) => p.strip);
    assert.ok(strip.some((p) => p.id === 'volume'), 'volume');
    assert.ok(strip.length <= 3, `${strip.length} controls in the strip: ${strip.map((p) => p.id)}`);
    for (const p of strip) assert.equal(p.perform, true, `${p.id} is in the strip but not marked perform`);
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
