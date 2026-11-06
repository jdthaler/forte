// The Seaboard RISE's panel (shared/rise.js): what it reads from a RISE's messages, in MPE as ROLI
// ships it (each note its own channel, bending ±48 semitones, CC74 its slide, channel pressure its
// press), on channel 1 alone, and from its faders and pad.
// Run: node test/rise-tests.mjs

import assert from 'node:assert/strict';
import { riseModel, DIMENSIONS, KEYS } from '../shared/rise.js';
import { FADERS } from '../shared/midi.js';

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const clock = () => { let t = 0; return { now: () => t, at: (s) => { t = s; } }; };
const bend = (ch, semis, range = 48) => { const b = Math.round((semis / range) * 8191) + 8192; return [0xe0 | ch, b & 127, b >> 7]; };

test('the five dimensions, in the RISE\'s order; a RISE 25\'s keywave is two octaves, C to C', () => {
  assert.deepEqual(DIMENSIONS.map(([id]) => id), ['strike', 'glide', 'slide', 'press', 'lift']);
  assert.equal(KEYS, 25);
});

test('MPE: a finger\'s bend and slide before its note are its own; then its glide, slide and press; its lift as it leaves', () => {
  const c = clock(), m = riseModel({ now: c.now });
  m.midi(bend(1, 0)); m.midi([0xb1, 74, 64]);
  m.midi([0x91, 60, 100]);
  const f = m.fingers.get(1);
  assert.equal(f.key, 60); near(f.strike, 100 / 127, 1e-9, 'strike'); near(f.slide, 64 / 127, 1e-9, 'slide at the strike');
  assert.ok(m.lit('strike'), 'Strike lights as the finger lands');
  m.midi(bend(1, 1.5)); m.midi([0xb1, 74, 100]); m.midi([0xd1, 90]);
  near(f.glide, 1.5, 0.01, 'glide'); near(f.slide, 100 / 127, 1e-9, 'slide'); near(f.press, 90 / 127, 1e-9, 'press');
  assert.ok(m.lit('glide') && m.lit('slide') && m.lit('press'));
  c.at(1);
  assert.ok(!m.lit('strike'), 'Strike goes out');
  m.midi([0x92, 64, 50]);
  assert.equal(m.newest().key, 64, 'the newest finger');
  assert.equal(m.channels, 2);
  m.midi([0x81, 60, 77]);
  assert.ok(!m.fingers.has(1)); near(m.last.lift, 77 / 127, 1e-9, 'lift'); assert.ok(m.lit('lift'));
  m.midi([0xd2, 0]); m.midi([0x82, 64, 0]);
  assert.equal(m.fingers.size, 0);
  assert.ok(!m.lit('press') && !m.lit('glide'), 'nothing held: nothing lit but the flashes');
  assert.equal(m.single, false);
});

test('on channel 1 alone (not MPE): its bend is every note\'s, ±48; its pressure too; it says so', () => {
  const m = riseModel();
  m.midi([0x90, 60, 90]); m.midi([0x90, 67, 90]);
  assert.equal(m.single, true);
  m.midi(bend(0, 12)); m.midi([0xd0, 64]);
  near(m.master().glide, 12, 0.01, 'glide'); near(m.master().press, 64 / 127, 1e-9, 'press');
  assert.ok(m.lit('glide') && m.lit('press'));
});

test('the faders and the pad: their values by CC, and MIDI mode once one sends', () => {
  const m = riseModel();
  assert.equal(m.faderMode, null);
  for (const [n] of FADERS) m.midi([0xb0, n, n - 100]);
  assert.equal(m.faderMode, 'midi');
  assert.deepEqual(FADERS.map(([n]) => m.cc[n]), [7, 9, 11, 13, 14]);
});

test('All Notes Off lets every finger go', () => {
  const m = riseModel();
  m.midi([0x91, 60, 90]); m.midi([0x92, 62, 90]);
  m.midi([0xb0, 123, 0]);
  assert.equal(m.fingers.size, 0);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
