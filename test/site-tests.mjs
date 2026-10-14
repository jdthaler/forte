// Site checks: the registry, versions, changelog and every instrument's files agree.
// Run: node test/site-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { INSTRUMENTS, SECTIONS, FORTE_VERSION } from '../shared/registry.js';

let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
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

console.log('parameters and presets');
for (const i of ready) {
  const file = readdirSync(new URL(`${i.id}/src/`, R)).find((f) => /params\.js$/.test(f));
  const mod = await import(new URL(`${i.id}/src/${file}`, R));
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
