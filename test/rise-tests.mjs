// The Seaboard RISE's panel (shared/rise.js): what it reads from a RISE's messages, in MPE as ROLI
// ships it (each note its own channel, bending ±48 semitones, CC74 its slide, channel pressure its
// press), on channel 1 alone, and from its faders and pad.
// And its own settings over SysEx (shared/rise-sysex.js): the bytes ROLI Dashboard sends, as GRAB
// decoded them (github.com/demixme/GRAB, src/common/Rise2Protocol.h), and its identify reply read.
// Run: node test/rise-tests.mjs

import assert from 'node:assert/strict';
import { riseModel, DIMENSIONS, KEYS } from '../shared/rise.js';
import { FADERS } from '../shared/midi.js';
import * as sx from '../shared/rise-sysex.js';

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
  near(f.glide, 1.5, 0.01, 'glide'); near(f.slide, 100 / 127, 1e-9, 'slide'); near(f.slid, 36 / 63, 1e-9, 'slid from where it landed'); near(m.last.slide, 36 / 63, 1e-9, 'the Slide row: how far it slid'); near(f.press, 90 / 127, 1e-9, 'press');
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

// ---- SysEx ----------------------------------------------------------------------------------------

const hex = (msgs) => msgs.map((m) => m.map((b) => b.toString(16).padStart(2, '0')).join(' '));
// an identify reply as GRAB's preview builds one (Rise2Component.cpp): a RISE in MPE, as ROLI ships it
function reply(change = {}) {
  const d = new Array(224).fill(0);
  [0xf0, 0x00, 0x21, 0x10, 0x78, 0x3a].forEach((b, i) => { d[i] = b; }); d[223] = 0xf7;
  const put = (o, t) => [...t].forEach((c, i) => { d[o + i] = c.charCodeAt(0); });
  put(6, 'RISE1.00'); put(22, '1.1.8'); put(14, '1.1.0');
  Object.assign(d, { 79: 1, 80: 15, 81: 0, 82: 1, 83: 48, 84: 4, 85: 1, 86: 1, 88: 64, 92: 107, 96: 109, 100: 111, 102: 113, 103: 114,
    105: 80, 106: 90, 107: 100, 108: 70, 148: 60, 149: 1, 150: 74, 151: 0, 207: 64, 209: 6 }, change);
  return Uint8Array.from(d);
}

test('SysEx: identify and set, as Dashboard sends them; a setting held to its range', () => {
  assert.deepEqual(hex([sx.IDENTIFY]), ['f0 00 21 10 78 3f f7']);
  assert.deepEqual(hex(sx.set('glide', 200)), ['f0 00 21 10 78 3d 17 7f f7']);
  assert.deepEqual(hex(sx.set('lift', -3)), ['f0 00 21 10 78 3d 1b 00 f7']);
  assert.deepEqual(hex(sx.set('slideMode', 9)), ['f0 00 21 10 78 3d 39 02 f7']);
});

test('SysEx: MPE on a lower zone (the flag, RPN 6 on channels 2 and 1, then RPN 0), Press, octave, transpose', () => {
  const rpn = (c, n, v) => [`b${c} 65 00`, `b${c} 64 0${n}`, `b${c} 06 ${v}`, `b${c} 26 00`];
  assert.deepEqual(hex(sx.mpeMode(15, 48)), ['f0 00 21 10 78 3d 0e 01 f7', ...rpn(1, 6, '0f'), ...rpn(0, 6, '0f'), ...rpn(1, 0, '30'), ...rpn(0, 0, '30')]);
  const nrpn = (n, v) => ['b0 63 00', `b0 62 0${n}`, `b0 06 ${v}`, 'b0 26 00'];
  assert.deepEqual(hex(sx.pressMode(true)), nrpn(4, '01'));
  assert.deepEqual(hex(sx.pressMode(false)), nrpn(4, '00'));
  assert.deepEqual(hex(sx.octave(-1)), nrpn(2, '03'));
  assert.deepEqual(hex(sx.transpose(-2)), nrpn(3, '3e'));
});

test('SysEx: Set up for Forte is MPE ±48 on 15, Slide CC74 absolute, channel pressure, the faders and pad on their CCs; nothing else', () => {
  const all = sx.forForte();
  for (const m of all) assert.ok(m[0] === 0xf0 ? m.at(-1) === 0xf7 && m.slice(1, -1).every((b) => b < 0x80) : m.length === 3 && m.slice(1).every((b) => b < 0x80));
  const sets = all.filter((m) => m[0] === 0xf0).map((m) => [m[6], m[7]]);
  assert.deepEqual(sets, [[0x0e, 1], [0x38, 74], [0x39, 0], [0x1c, 107], [0x1d, 109], [0x1e, 111], [0x23, 113], [0x24, 114]]);
  assert.ok(all.every((m) => m[0] !== 0xf0 || m[5] === 0x3d), 'only 3D: no firmware, reset or program messages');
});

test('SysEx: the identify reply read: a RISE as ROLI ships it is set up for Forte', () => {
  const s = sx.parse(reply());
  assert.deepEqual({ ...s, faders: undefined }, { firmware: '1.1.8', mode: 'mpe', members: 15, channel: 1, upper: false, bend: 48, octave: 0, transpose: 0,
    press: 'channel', faders: undefined, glide: 80, slide: 90, pressSens: 100, strike: 70, lift: 60, slideCc: 74, slideMode: 0, battery: 6 });
  assert.deepEqual(s.faders, [107, 109, 111, 113, 114]);
  assert.deepEqual(sx.differences(s), []);
  assert.equal(sx.parse(reply().slice(0, 100)), null, 'too short: not a reply');
  assert.equal(sx.parse(Uint8Array.from([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0xf7])), null, 'another message');
});

test('SysEx: what differs from what Forte expects, said plainly', () => {
  assert.deepEqual(sx.differences(sx.parse(reply({ 82: 0, 79: 0, 80: 0, 81: 0 }))), ['Single Channel (channel 1)']);
  assert.equal(sx.parse(reply({ 82: 0, 79: 0, 80: 15, 81: 0 })).mode, 'multi');
  assert.deepEqual(sx.differences(sx.parse(reply({ 83: 24, 86: 0, 150: 1, 151: 1, 92: 1 }))),
    ['bend ±24', 'Press as polyphonic aftertouch', 'Slide on CC 1', 'Slide relative', 'faders and pad on CC 1, 109, 111, 113, 114']);
  const up = sx.parse(reply({ 79: 14, 80: 0, 81: 15 }));
  assert.equal(up.upper, true); assert.equal(up.members, 15); assert.deepEqual(sx.differences(up), ['MPE on the upper zone']);
  const shifted = sx.parse(reply({ 84: 2, 207: 67 }));
  assert.equal(shifted.octave, -2); assert.equal(shifted.transpose, 3);
});

test('the panel\'s model ignores SysEx and clock', () => {
  const m = riseModel();
  m.midi(reply()); m.midi([0xf8]); m.midi([0xfe]);
  assert.equal(m.fingers.size, 0); assert.ok(Number.isNaN(m.last.glide));
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
