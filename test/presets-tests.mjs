// Your own presets and shared links (shared/presets.js): a preset is the instrument's contract,
// files and links carry every instrument's presets without loss, and the files the plugins read
// in native/tests/presets/ are what the site writes.
// Run: node test/presets-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FORMAT, presetParams, presetFile, readPresetFile, linkHash, readLinkHash, complete, pick, valid } from '../shared/presets.js';
import { INSTRUMENTS, byId } from '../shared/registry.js';
import { loadInstrument, withPreset } from '../tools/headless.mjs';

let failures = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => console.log('  ok  ', name), (e) => { failures++; console.log('  FAIL', name, '\n       ', e.message); });
}
const R = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, R), 'utf8');
const ported = INSTRUMENTS.filter((i) => i.plugin?.ready);
const all = new Map();
for (const i of ported) all.set(i.id, await loadInstrument(i.id));
const NAMES = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.name]));
// a factory preset's values as a user preset has them (the page's P, with a console's parameters)
const factory = (I, k) => {
  let P = withPreset(I, k);
  if (I.console) P = { ...P, ...I.console.get(P) };
  return pick(presetParams(I), P);
};
const close = (a, b) => (typeof a === 'number' ? Math.abs(a - b) <= 1e-5 * Math.max(Math.abs(a), Math.abs(b), 1e-12) : a === b);

console.log('presets');
await test('a preset holds exactly the parameters of the instrument\'s contract, of the same kinds, ranges and options', () => {
  for (const [id, I] of all) {
    const c = JSON.parse(read(`native/instruments/${id}/${id}-contract.json`));
    const ps = presetParams(I);
    assert.deepEqual(ps.map((p) => p.id), c.params.map((p) => p.id), `${id}: the ids`);
    ps.forEach((p, k) => {
      const q = c.params[k];
      const kind = p.type === 'select' ? 'choice' : p.type === 'checkbox' ? 'toggle' : 'continuous';
      assert.equal(kind, q.kind, `${id}.${p.id}: kind`);
      assert.deepEqual(p.def, q.def, `${id}.${p.id}: default`);
      if (kind === 'choice') assert.deepEqual(p.options.map(([v]) => v), q.options, `${id}.${p.id}: options`);
      if (kind === 'continuous') assert.deepEqual([p.min, p.max], [q.min, q.max], `${id}.${p.id}: range`);
    });
  }
});

await test('every factory preset of every instrument goes into a file and comes back the same', () => {
  for (const [id, I] of all) {
    const presets = I.presets.map((pr, k) => ({ name: pr.name, values: factory(I, k) }));
    const text = presetFile(I, byId(id).version, presets);
    const d = JSON.parse(text);
    assert.equal(d.forte, 'presets'); assert.equal(d.format, FORMAT); assert.equal(d.instrument, id); assert.equal(d.instrumentVersion, byId(id).version);
    const back = readPresetFile(text, I, NAMES);
    assert.equal(back.warning, undefined);
    assert.deepEqual(back.presets, presets, id);
  }
});

await test('every factory preset of every instrument goes into a link and comes back, to six figures', () => {
  for (const [id, I] of all) {
    const ps = presetParams(I);
    I.presets.forEach((pr, k) => {
      const v = factory(I, k), h = linkHash(ps, v, pr.name);
      assert.ok(h.startsWith(`#_v=${FORMAT}&_n=`), h);
      const back = readLinkHash(h, ps);
      assert.equal(back.name, pr.name);
      for (const p of ps) assert.ok(close(back.values[p.id], v[p.id]), `${id} ${pr.name}: ${p.id} ${back.values[p.id]} ≠ ${v[p.id]}`);
    });
  }
});

await test('a link names only what differs from the defaults: the defaults are #_v=1, and a link reads back nothing it was not given', () => {
  const I = all.get('gongs'), ps = presetParams(I);
  assert.equal(linkHash(ps, complete(ps)), `#_v=${FORMAT}`);
  const h = linkHash(ps, { ...complete(ps), thick: 0.004, material: 'steel', venue: 'hall' }, 'Dark tam-tam');
  assert.equal(h, '#_v=1&_n=Dark+tam-tam&material=steel&thick=0.004&venue=hall');
  assert.deepEqual(readLinkHash(h, ps).values, { ...complete(ps), thick: 0.004, material: 'steel', venue: 'hall' });
  assert.equal(readLinkHash('#about', ps), null);
  assert.equal(readLinkHash('', ps), null);
  // toggles as 1 and 0, numeric choices as numbers
  const H = all.get('harpsichord'), hs = presetParams(H);
  const v = { ...complete(hs), pitch: 415, lute: true, back8: false };
  const hh = linkHash(hs, v);
  assert.match(hh, /pitch=415/); assert.match(hh, /lute=1/); assert.match(hh, /back8=0/);
  assert.deepEqual(readLinkHash(hh, hs).values, v);
});

await test('what an older or a damaged preset has is made sound: unknown ids ignored, missing ones default, values clamped, options checked', () => {
  const I = all.get('gongs'), ps = presetParams(I), def = complete(ps);
  const text = JSON.stringify({ forte: 'presets', format: 1, instrument: 'gongs', presets: [{ name: '  Odd\nname ', values: { thick: 99, material: 'gold', strike: 'x', bogus: 3, venue: 'hall' } }] });
  const [pr] = readPresetFile(text, I, NAMES).presets;
  assert.equal(pr.name, 'Odd name');
  assert.deepEqual(pr.values, { ...def, thick: 0.03, venue: 'hall' });
  assert.equal(valid(ps.find((p) => p.id === 'material'), 'steel'), 'steel');
  const H = all.get('harpsichord'), pitch = presetParams(H).find((p) => p.id === 'pitch'), lute = presetParams(H).find((p) => p.id === 'lute');
  assert.equal(valid(pitch, '415'), 415); assert.equal(valid(pitch, 999), 440);
  assert.equal(valid(lute, 1), true); assert.equal(valid(lute, 'yes'), false);
});

await test('a file that is not presets, or is another instrument\'s, says so; a newer format is read with a warning', () => {
  const I = all.get('gongs');
  assert.throws(() => readPresetFile('nonsense', I, NAMES), /not a Forte preset file/);
  assert.throws(() => readPresetFile('{"a":1}', I, NAMES), /not a Forte preset file/);
  assert.throws(() => readPresetFile(read('native/tests/presets/organ.json'), I, NAMES), /for the Tonewheel Organ|for the .*Organ/);
  assert.throws(() => readPresetFile('{"forte":"presets","format":1,"instrument":"gongs","presets":[]}', I, NAMES), /no presets/);
  const r = readPresetFile('{"forte":"presets","format":2,"instrument":"gongs","presets":[{"name":"x","values":{}}]}', I, NAMES);
  assert.match(r.warning, /newer Forte/);
});

await test('the files the plugins\' tests read (native/tests/presets/) are factory presets as the site writes them', () => {
  const files = readdirSync(new URL('native/tests/presets/', R)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const id = f.replace(/\.json$/, ''), I = all.get(id), text = read(`native/tests/presets/${f}`);
    const [pr] = readPresetFile(text, I, NAMES).presets;
    const k = I.presets.findIndex((p) => p.name === pr.name);
    assert.ok(k >= 0, `${f}: ${pr.name} is a factory preset`);
    assert.deepEqual(pr.values, factory(I, k), f);
    assert.equal(JSON.stringify(JSON.parse(text).presets), JSON.stringify(JSON.parse(presetFile(I, '', [pr])).presets), `${f}: as the site writes it`);
  }
});

await test('the organ\'s console goes into a preset as its parameters and comes back as the page keeps it', () => {
  const I = all.get('organ'), C = I.console;
  for (let k = 0; k < I.presets.length; k++) {
    const P = withPreset(I, k), v = factory(I, k);
    const back = C.put(v, P);
    for (const key of Object.keys(C.defaults)) {
      if (key === 'leslie' && !P.leslieOn) continue; // bypassed: the speed is the page's, not the preset's
      assert.deepEqual(back[key], P[key], `${I.presets[k].name}: ${key}`);
    }
  }
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
