// Combinations checks (combine/): which keys reach which instrument (layered, split, moved by an
// octave, inside each instrument's own keys), the saved state read back safely, and every starting
// combination against the registry and the instruments' own presets and keys, and your own
// combinations as files (the same file the Forte app writes, native/tests/presets/combinations/)
// and links. The page itself is opened by tools/check-pages.mjs and tools/check-offline.mjs.
// Run: node test/combine-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { INSTRUMENTS, byId } from '../shared/registry.js';
import { MAX_PARTS, KEYS, OCTAVES, LEVEL, VOLUME, COMBINATIONS, part, routed, overlap, describe, restore, noteName,
  label, combination, combinationsFile, readCombinationsFile, combinationHash, readCombinationHash } from '../combine/src/combine-params.js';
import { presetParams, complete, pick } from '../shared/presets.js';
import { loadInstrument, withPreset, defaultsOf } from '../tools/headless.mjs';

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
await test('read back: what each part\'s Presets menu named, a label, or none', async () => {
  const s = restore({ parts: [{ id: 'piano', preset: 'f:Concert' }, { id: 'organ', preset: 'own' }, { id: 'grand', preset: 7 }, { id: 'tines', preset: 'u:Mine' }] }, ready);
  assert.deepEqual(s.parts.map((p) => p.preset), ['f:Concert', 'own', null, 'u:Mine']);
  assert.equal(label('Timpani, felt mallets'), 'f:Timpani, felt mallets', 'a bare name is a preset of the instrument\'s');
  assert.equal(label('default'), 'default');
  assert.equal(label(''), null);
  assert.equal(label('f:'), 'f:f:', 'an empty name is a name');
});

console.log('your combinations');
const vals = (I, P) => pick(presetParams(I), I.console ? { ...P, ...I.console.get(P) } : P);
const organ = await loadInstrument('organ'), grand = await loadInstrument('grand');
const ballad = organ.presets.findIndex((p) => p.name.startsWith('Ballad'));
const mine = {
  name: 'Organ bass, electric grand above', parts: [
    { id: 'organ', lo: 21, hi: 47, oct: 0, level: 0, on: true, preset: `f:${organ.presets[ballad].name}`, values: vals(organ, withPreset(organ, ballad)) },
    { id: 'grand', lo: 48, hi: 108, oct: -1, level: -4.5, on: false, preset: null, values: vals(grand, defaultsOf(grand)) },
  ],
};
await test('made whole: unknown instruments left out, at most four, a name, each part in bounds with its values', async () => {
  const c = combination({ name: '  A\n name ', parts: [{ id: 'nope' }, { id: 'piano', lo: 200, values: [1] }, { id: 'organ' }, { id: 'grand' }, { id: 'tines' }, { id: 'bowed' }] }, ready);
  assert.equal(c.name, 'A name');
  assert.deepEqual(c.parts.map((p) => p.id), ['piano', 'organ', 'grand', 'tines']);
  assert.equal(c.parts[0].hi, KEYS[1]);
  assert.deepEqual(c.parts[0].values, {});
  assert.equal(combination({ name: 'x', parts: [{ id: 'nope' }] }, ready), null, 'nothing playable: none');
  assert.equal(combination({ parts: [{ id: 'piano' }] }, ready, 2).name, 'Combination 3');
});
await test('a file: written and read back the same, and the one the Forte app\'s tests read is as the site writes it', async () => {
  const text = combinationsFile([mine], { forte: '0.49.0', organ: '0.9.0' });
  const { combinations, warning } = readCombinationsFile(text, ready);
  assert.equal(warning, undefined);
  assert.deepEqual(combinations, [combination(mine, ready)]);
  const d = JSON.parse(text);
  assert.equal(d.forte, 'combinations');
  assert.equal(d.forteVersion, '0.49.0');
  assert.deepEqual(d.combinations[0].parts.map((p) => [p.instrument, p.instrumentVersion]), [['organ', '0.9.0'], ['grand', '']]);
  // the golden file, without the menus' labels (the app writes none)
  const golden = read('native/tests/presets/combinations/organ-and-grand.json');
  const plain = { ...mine, parts: mine.parts.map((p) => ({ ...p, preset: null, on: true })) };
  assert.equal(golden, combinationsFile([plain]), 'native/tests/presets/combinations/organ-and-grand.json is as the site writes it');
  const [g] = readCombinationsFile(golden, ready).combinations;
  assert.deepEqual(complete(presetParams(organ), g.parts[0].values), complete(presetParams(organ), vals(organ, withPreset(organ, ballad))), 'the organ at its Ballad preset');
});
await test('a file that is not combinations says so; an instrument this site hasn\'t got is left out, and named; a newer format warns', async () => {
  assert.throws(() => readCombinationsFile('nonsense', ready), /not a Forte combinations file/);
  assert.throws(() => readCombinationsFile('{"a":1}', ready), /not a Forte combinations file/);
  assert.throws(() => readCombinationsFile(read('native/tests/presets/gongs.json'), ready), /preset file/);
  assert.throws(() => readCombinationsFile('{"forte":"combinations","format":1,"combinations":[]}', ready), /no combinations/);
  assert.throws(() => readCombinationsFile('{"forte":"combinations","format":1,"combinations":[{"name":"x","parts":[{"instrument":"theremin"}]}]}', ready, (id) => id.toUpperCase()), /THEREMIN/);
  const r = readCombinationsFile('{"forte":"combinations","format":2,"combinations":[{"name":"x","parts":[{"instrument":"theremin"},{"instrument":"piano","lo":30}]}]}', ready);
  assert.deepEqual(r.combinations[0].parts.map((p) => [p.id, p.lo]), [['piano', 30]]);
  assert.match(r.warning, /Left out: theremin/);
  assert.match(r.warning, /newer Forte/);
});
await test('a link: only what differs from the defaults, and back to the same combination', async () => {
  const paramsOf = (id) => presetParams({ organ, grand }[id]);
  const hash = combinationHash(mine, paramsOf);
  assert.ok(hash.length < 600, `${hash.length} characters`);
  assert.doesNotMatch(hash, /p2\./, 'the grand at its defaults adds nothing');
  const back = readCombinationHash(hash, ready);
  assert.equal(back.name, mine.name);
  assert.deepEqual(back.parts.map(({ values, ...p }) => p), mine.parts.map(({ values, ...p }) => p));
  for (const [i, p] of mine.parts.entries()) {
    const ps = paramsOf(p.id);
    assert.deepEqual(complete(ps, back.parts[i].values), complete(ps, p.values), p.id);
  }
  // without the parameters, every value goes in, and comes back the same
  const all = readCombinationHash(combinationHash(mine), ready);
  for (const [i, p] of mine.parts.entries()) assert.deepEqual(complete(paramsOf(p.id), all.parts[i].values), complete(paramsOf(p.id), p.values));
  assert.equal(readCombinationHash('#_v=1&x=2', ready), null, 'an instrument\'s link is not a combination');
  assert.equal(readCombinationHash('#_c=1&p1=theremin,21,108,0,0,1', ready), null);
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
