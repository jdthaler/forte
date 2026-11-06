// Combinations checks (combine/): which keys reach which instrument (layered, split, moved by an
// octave, inside each instrument's own keys), the saved state read back safely, and every starting
// combination against the registry and the instruments' own presets and keys. The page itself is
// opened by tools/check-pages.mjs and tools/check-offline.mjs.
// Run: node test/combine-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { INSTRUMENTS, byId } from '../shared/registry.js';
import { MAX_PARTS, KEYS, OCTAVES, LEVEL, VOLUME, COMBINATIONS, part, routed, overlap, describe, restore, noteName } from '../combine/src/combine-params.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message.replace(/\n/g, '\n        ')); }
}
const R = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, R), 'utf8');
const ready = (id) => !!byId(id)?.ready;
const keysOf = (p, range) => { const out = []; for (let k = KEYS[0]; k <= KEYS[1]; k++) if (routed(p, k, range) !== null) out.push(k); return out; };

console.log('routing');
await test('a part on every key plays every key as pressed; layered, two parts each play every key', async () => {
  const a = part({ id: 'piano' }), b = part({ id: 'bowed' });
  for (let k = KEYS[0]; k <= KEYS[1]; k++) { assert.equal(routed(a, k, [21, 108]), k); assert.equal(routed(b, k, [21, 108]), k); }
  assert.ok(overlap(a, b));
});
await test('a split: below C3 one part, from C3 the other, every key exactly once and none twice', async () => {
  const lo = part({ id: 'organ', lo: 21, hi: 47 }), hi = part({ id: 'grand', lo: 48 });
  assert.ok(!overlap(lo, hi));
  for (let k = KEYS[0]; k <= KEYS[1]; k++) {
    const n = [lo, hi].filter((p) => routed(p, k, [21, 108]) !== null).length;
    assert.equal(n, 1, noteName(k));
    assert.equal(routed(k < 48 ? lo : hi, k, [21, 108]), k);
  }
});
await test('an octave moves each key by 12 per octave, and a key moved past the instrument\'s own keys stays silent', async () => {
  const up = part({ id: 'stars', oct: 1 }), down = part({ id: 'stars', oct: -2 });
  assert.equal(routed(up, 60, [21, 108]), 72);
  assert.equal(routed(down, 60, [21, 108]), 36);
  assert.equal(routed(up, 100, [21, 108]), null, 'C8 + an octave is past C8');
  assert.equal(routed(down, 40, [21, 108]), null, 'E2 − two octaves is below A0');
  assert.deepEqual(keysOf(up, [21, 108]), Array.from({ length: 108 - 12 - 21 + 1 }, (_, i) => 21 + i));
});
await test('a compass (the vibraphone\'s F3–F6) bounds what it plays; a part switched off plays nothing', async () => {
  const p = part({ id: 'vibraphone' });
  assert.deepEqual([keysOf(p, [53, 89])[0], keysOf(p, [53, 89]).at(-1)], [53, 89]);
  assert.deepEqual(keysOf({ ...p, on: false }, [21, 108]), []);
});
await test('a part made whole: keys in A0–C8 and in order, octave within ±2, level within its range, on unless off', async () => {
  assert.deepEqual(part({ id: 'x', lo: 90, hi: 30, oct: 7, level: -99 }), { id: 'x', lo: 30, hi: 90, oct: OCTAVES, level: LEVEL.min, on: true });
  assert.deepEqual(part({ id: 'x', lo: 5, hi: 200, oct: 1.5, level: 'loud', on: false }), { id: 'x', lo: KEYS[0], hi: KEYS[1], oct: 0, level: LEVEL.def, on: false });
});
await test('in words: every key, below a key, from a key, between two, an octave moved, off', async () => {
  const name = (id) => byId(id).name;
  assert.equal(describe([part({ id: 'piano' })], name), 'Ribbon Piano on every key');
  assert.equal(describe([part({ id: 'organ', hi: 47 }), part({ id: 'grand', lo: 48, oct: -1 })], name), 'Tonewheel Organ on the keys below C3; Electric Grand on the keys from C3, an octave down');
  assert.equal(describe([part({ id: 'marimba', lo: 48, hi: 71, on: false })], name), 'Marimba and Xylophone on C3 to B4 (off)');
});

console.log('saved state');
await test('read back: unknown or unready instruments dropped, at most four, broken values made whole', async () => {
  const s = restore({ volume: 99, parts: [{ id: 'nope' }, null, { id: 'piano', lo: 'x', P: [1] }, { id: 'organ', P: { volume: 0.5 } }, { id: 'grand' }, { id: 'tines' }, { id: 'bowed' }] }, ready);
  assert.deepEqual(s.parts.map((p) => p.id), ['piano', 'organ', 'grand', 'tines']);
  assert.equal(s.parts.length, MAX_PARTS);
  assert.equal(s.parts[0].P, null);
  assert.deepEqual(s.parts[1].P, { volume: 0.5 });
  assert.equal(s.volume, VOLUME.max);
  assert.deepEqual(restore('junk', ready), { parts: [], volume: VOLUME.def, combination: null });
});

console.log('combinations');
await test('every combination: ready instruments, at most four, named once, its presets the instruments\' own, every part playing some keys', async () => {
  assert.ok(COMBINATIONS.length >= 2);
  assert.equal(new Set(COMBINATIONS.map((c) => c.name)).size, COMBINATIONS.length);
  for (const c of COMBINATIONS) {
    assert.ok(c.parts.length >= 2 && c.parts.length <= MAX_PARTS, c.name);
    for (const spec of c.parts) {
      assert.ok(ready(spec.id), `${c.name}: ${spec.id}`);
      const { INSTRUMENT: I } = await import(new URL(`${spec.id}/src/${spec.id}-instrument.js`, R).href);
      await I.load?.();
      if (spec.preset) assert.ok((I.presets ?? []).some((p) => p.name === spec.preset), `${c.name}: ${spec.id} has no preset "${spec.preset}"`);
      const p = part(spec), range = I.compass?.keys ?? I.range ?? [36, 96];
      assert.deepEqual(part(p), p, `${c.name}: ${spec.id} is whole`);
      assert.ok(keysOf(p, range).length >= 12, `${c.name}: ${spec.id} plays ${keysOf(p, range).length} keys`);
    }
  }
});
await test('a split combination covers the keyboard from A0 to C8 without a gap', async () => {
  for (const c of COMBINATIONS) {
    const ps = c.parts.map(part);
    for (let k = KEYS[0]; k <= KEYS[1]; k++) assert.ok(ps.some((p) => k >= p.lo && k <= p.hi), `${c.name}: nothing on ${noteName(k)}`);
  }
});

console.log('the page');
await test('linked from the front page and the menu; no page keeps + Layer or the taps', async () => {
  assert.ok(existsSync(new URL('combine/index.html', R)) && existsSync(new URL('combine/README.md', R)));
  assert.match(read('index.html'), /href="combine\/"/);
  assert.match(read('shared/nav.js'), /combine\//);
  for (const f of ['shared/layer.js', 'shared/taps.js']) assert.ok(!existsSync(new URL(f, R)), `${f} is gone`);
  for (const i of INSTRUMENTS.filter((x) => x.ready)) assert.ok(!existsSync(new URL(`${i.id}/combine.js`, R)));
  for (const f of ['shared/layout.js', 'shared/keyboard.js', 'shared/midi.js', 'shared/songs.js', 'shared/shell.js']) assert.doesNotMatch(read(f), /layer\.js|taps\.js|attachLayer|computerKey|midiTap|keyTap/, f);
});
await test('the page hosts each instrument from its descriptor, hands its MIDI to the songs, and draws through animate()', async () => {
  const main = read('combine/src/combine-main.js');
  assert.match(main, /-instrument\.js`/);
  assert.match(main, /pageMIDI\(\{ onMIDI/);
  assert.doesNotMatch(main, /requestAnimationFrame\(/);
  assert.match(main, /SUM_LIMITER/);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall combine tests passed');
