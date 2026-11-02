// PI Requests checks (shared/backing.js): every rhythm is well formed (its tracks, its fill, the
// sounds they name), the left hand's chords are read as a player means them, the bass and chords
// land in their registers, swing keeps the beat, and the pages that have a rhythm box load it.
// Run: node test/backing-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STYLES, GENERIC, ABOUT, SEA, lengthOf, stepLength, hitAt, fillFrom, chordOf, chordName, bassNote, voicing, swell } from '../shared/backing.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}

// the sounds shared/backing.js makes (its voices())
const SOUNDS = ['kick', 'snare', 'rim', 'clap', 'hat', 'ohat', 'ride', 'cow', 'tamb', 'shaker', 'conga', 'congaLo', 'tomHi', 'tomLo', 'thunk', 'inhale', 'exhale', 'valve'];
const src = readFileSync(new URL('../shared/backing.js', import.meta.url), 'utf8');

await test('every sound a rhythm names is one the rhythm box makes', () => {
  for (const s of SOUNDS) assert.match(src, new RegExp(`\\n    ${s}: \\(t, v\\)`), `no sound ${s}`);
});

for (const [id, s] of Object.entries(STYLES)) {
  await test(`${s.name}: well formed`, () => {
    assert.ok(s.bpm >= 30 && s.bpm <= 240, 'tempo');
    assert.ok(s.bar % s.beat === 0, 'whole beats to a bar');
    const n = lengthOf(s);
    assert.equal(n % s.bar, 0, 'whole bars');
    for (const [name, t] of Object.entries(s.drums)) {
      assert.ok(SOUNDS.includes(name), `unknown sound ${name}`);
      assert.match(t, /^[.oxX]+$/, `${name}: steps`);
      assert.equal(n % t.length, 0, `${name}: ${t.length} steps don't repeat evenly in ${n}`);
    }
    assert.match(s.bass, /^[.R35678]+$/, 'bass degrees');
    assert.equal(n % s.bass.length, 0, 'bass length');
    assert.match(s.chords, /^[.xL]+$/, 'chord steps');
    assert.equal(n % s.chords.length, 0, 'chords length');
    for (const [name, t] of Object.entries(s.fill)) {
      assert.ok(SOUNDS.includes(name), `fill: unknown sound ${name}`);
      assert.equal(t.length, s.bar, `fill ${name}: one bar`);
      assert.match(t, /^[.oxX]+$/);
    }
    const f = fillFrom(s);
    assert.ok(f > 0 && f < s.bar, 'the fill starts within the bar, after its downbeat');
    assert.ok(hitAt(Object.values(s.drums)[0], 0) > 0, 'the first track plays on one');
    assert.ok(ABOUT[id] || id === 'pulsetube' || id === 'sea', 'a description');
  });
}

await test('generic rhythms are all known; the experiments\' come first on their pages', () => {
  for (const g of GENERIC) assert.ok(STYLES[g]);
  assert.equal(STYLES.pulsetube.bpm, 84, 'the pulse tube at 1.4 Hz');
  const abra = readFileSync(new URL('../abracadabra/src/abracadabra-main.js', import.meta.url), 'utf8');
  const cuore = readFileSync(new URL('../cuore/src/cuore-main.js', import.meta.url), 'utf8');
  assert.match(abra, /attachBacking\(shell, \{[\s\S]*?styles: \['pulsetube'\]/);
  assert.match(cuore, /attachBacking\(shell, \{[\s\S]*?styles: \['sea', 'pulsetube'\]/);
  for (const page of [abra, cuore]) {
    assert.match(page, /onNoteOn: [^\n]*backing\.noteOn\(\)/, 'Synchro start hears the keys');
    assert.match(page, /onPanic: [^\n]*backing\.stop\(\)/, 'Panic stops the rhythm');
  }
});

await test('a bar lasts its beats, swung or not', () => {
  for (const s of Object.values(STYLES)) {
    let t = 0;
    for (let i = 0; i < s.bar; i++) t += stepLength(s, s.bpm, i);
    assert.ok(Math.abs(t - (60 / s.bpm) * (s.bar / s.beat)) < 1e-9, s.name);
  }
  assert.ok(stepLength(STYLES.swing, 120, 0) > stepLength(STYLES.swing, 120, 1), 'swing: long, short');
});

await test('the left hand\'s chord', () => {
  const name = (keys) => chordName(chordOf(keys));
  assert.equal(chordOf([]), null);
  assert.equal(name([48]), 'C', 'one key: its major chord');
  assert.equal(name([45]), 'A');
  assert.equal(name([48, 52, 55]), 'C');
  assert.equal(name([52, 55, 60]), 'C', 'first inversion');
  assert.equal(name([45, 48, 52]), 'Am');
  assert.equal(name([43, 47, 50, 53]), 'G7');
  assert.equal(name([48, 51]), 'Cm', 'two keys: a minor third');
  assert.equal(name([48, 58]), 'C7', 'root and flat seventh');
  assert.equal(name([50, 53, 57, 60]), 'Dm7');
  assert.equal(name([48, 52, 55, 59]), 'Cmaj7');
  assert.equal(name([47, 50, 53]), 'Bdim');
  assert.equal(name([48, 53, 55]), 'Csus4');
});

await test('the bass under the chords, the chords under the melody', () => {
  for (let root = 0; root < 12; root++) {
    for (const c of [chordOf([48 + root]), chordOf([48 + root, 51 + root, 55 + root])]) {
      const b = bassNote(c, 'R');
      assert.equal(b % 12, root);
      assert.ok(b >= 36 && b < 48, `bass ${b}`);
      assert.equal(bassNote(c, '8'), b + 12);
      assert.equal((bassNote(c, '5') - b), 7);
      const v = voicing(c);
      assert.ok(v.every((k) => k >= 55 && k < 67), `voicing ${v}`);
      assert.deepEqual(new Set(v.map((k) => (k - root + 120) % 12)), new Set(c.tones));
    }
  }
  assert.equal(bassNote(chordOf([45, 48, 52]), '3'), 48, 'A minor: the bass\'s third is C');
});

await test('the sea: swell between trough and crest, longer as the waves grow', () => {
  for (const s of SEA) for (let t = 0; t < 60; t += 0.37) { const w = swell(t, s.period); assert.ok(w >= 0 && w <= 1); }
  for (let i = 1; i < SEA.length; i++) {
    assert.ok(SEA[i].height > SEA[i - 1].height && SEA[i].period > SEA[i - 1].period);
    assert.ok(1 / SEA[i].period >= 0.1 - 1e-9 && 1 / SEA[i].period <= 0.4, 'sea waves run at 0.1–0.4 Hz');
  }
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
