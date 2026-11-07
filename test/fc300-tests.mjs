// A Roland FC-300 foot controller (shared/fc300.js, shared/fc300-sysex.js): its System Exclusive
// messages, against Roland's MIDI implementation in its owner's manual (pp. 59–67: the address map,
// DT1 and RQ1, the checksum that makes address and data add up to a multiple of 128, the display's
// segments); what the drawer reads from it as it comes; what each pedal does while Forte drives it;
// and its volume pedal on the page's Volume control (shared/midi.js volumePedal, pedalVolume).
// Run: node test/fc300-tests.mjs

import assert from 'node:assert/strict';
import * as sx from '../shared/fc300-sysex.js';
import { footModel, drive, face, PEDALS } from '../shared/fc300.js';
import { createInput, volumePedal, pedalVolume, pedalGain, setLevel } from '../shared/midi.js';

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const hex = (m) => m.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const clock = () => { let t = 0; return { now: () => t, at: (s) => { t = s; } }; };

test('Roland\'s checksum: address, size or data and the checksum add up to a multiple of 128', () => {
  // the manual's rule (p. 63), and Roland's well-known worked example: 40 00 7F 00 → 41
  assert.equal(sx.checksum([0x40, 0x00, 0x7f, 0x00]), 0x41);
  assert.equal(sx.checksum([0x10, 0x00, 0x00, 0x01]), 0x6f);
  for (const bytes of [[0], [0x7f, 0x7f, 0x7f], [0x30, 0x05, 0x7f], [0x60, 0x00, ...Array(16).fill(0x41)]]) assert.equal((bytes.reduce((s, b) => s + b, 0) + sx.checksum(bytes)) % 128, 0, hex(bytes));
});

test('RQ1 and DT1 on its Foot Controller model (00 00 20): asking its mode, at every Device ID; into its System Exclusive mode', () => {
  assert.equal(hex(sx.rq1(0x10, sx.ADDR.mode, 1)), 'F0 41 10 00 00 20 11 10 00 00 01 6F F7');
  assert.equal(sx.ASK.length, 32, 'Device IDs 00–1F');
  assert.deepEqual(sx.ASK.map((m) => m[2]), Array.from({ length: 32 }, (_, i) => i));
  assert.equal(hex(sx.enter(0x10)[0]), 'F0 41 10 00 00 20 12 10 01 01 6E F7', '10 01 ← 1: System Exclusive mode');
  assert.equal(hex(sx.leave(0x10)[0]), 'F0 41 10 00 00 20 12 10 01 00 6F F7', '10 01 ← 0: as its MODE button');
});

test('its reports: a pedal down and up, an expression pedal\'s position, its mode; a bad checksum or another model is nothing', () => {
  const ev = (addr, v, dev = 0x10) => sx.event(sx.parse(sx.dt1(dev, addr, [v])));
  assert.deepEqual(ev([0x21, 0x00], 0x7f), { pedal: 'ctl1', down: true, dev: 0x10 });
  assert.deepEqual(ev([0x21, 0x01], 0x00), { pedal: 'ctl2', down: false, dev: 0x10 });
  assert.deepEqual(ev([0x22, 0x00], 0x7f), { pedal: 'toe1', down: true, dev: 0x10 });
  assert.deepEqual(ev([0x20, 0x04], 0x7f), { pedal: 'number5', down: true, dev: 0x10 });
  assert.deepEqual(ev([0x25, 0x00], 0x7f), { pedal: 'up', down: true, dev: 0x10 });
  assert.deepEqual(ev([0x25, 0x01], 0x7f), { pedal: 'down', down: true, dev: 0x10 });
  assert.deepEqual(ev([0x24, 0x01], 93), { pedal: 'exp2', value: 93, dev: 0x10 });
  assert.deepEqual(ev([0x10, 0x00], 1, 3), { mode: 'sysex', dev: 3 });
  assert.deepEqual(ev([0x10, 0x00], 0), { mode: 'other', dev: 0x10 });
  const m = sx.dt1(0x10, [0x21, 0x00], [0x7f]);
  assert.equal(sx.parse([...m.slice(0, -2), (m.at(-2) + 1) & 0x7f, 0xf7]), null, 'a bad checksum');
  assert.equal(sx.parse([0xf0, 0x41, 0x10, 0x00, 0x00, 0x1e, 0x12, 0x21, 0x00, 0x7f, 0x60, 0xf7]), null, 'its other model (00 00 1E, its bulk data)');
  assert.equal(sx.parse([0xf0, 0x00, 0x21, 0x10, 0x78, 0x3a, 0xf7]), null, 'a RISE\'s');
  assert.equal(sx.event(sx.parse(sx.dt1(0x10, [0x24, 0x02], [5]))), null, 'an external pedal: not drawn');
});

test('its display: the manual\'s segments (d the top, c b the right, e f the left, g the bottom, a the middle), three digits right to left', () => {
  const { DIGITS } = sx, A = 0x40, B = 0x20, C = 0x10, D = 0x08, E = 0x04, F = 0x02, G = 0x01;
  assert.equal(DIGITS[8], 0x7f); assert.equal(DIGITS[1], B | C, 'a 1 is its right side');
  assert.equal(DIGITS[0], 0x7f & ~A, 'a 0 is all but the middle');
  assert.equal(DIGITS[7], D | C | B); assert.equal(DIGITS['-'], A);
  for (let n = 0; n <= 9; n++) assert.ok(DIGITS[n] > 0 && DIGITS[n] < 0x80, `digit ${n}`);
  assert.equal(new Set(Object.values(DIGITS)).size, Object.keys(DIGITS).length, 'each its own');
  const [right, centre, left] = sx.display(0x10, '012');
  assert.deepEqual([right[7], right[8], right[9], right[10]], [0x40, 0x00, DIGITS[2], 0], 'the right digit at 40 00, then its point');
  assert.deepEqual([centre[8], centre[9]], [0x02, DIGITS[1]]);
  assert.deepEqual([left[8], left[9]], [0x04, DIGITS[0]]);
});

test('its LCD: two lines of 16 characters, padded and cut, accents dropped, outside its ASCII a space', () => {
  const [top, bottom] = sx.lcd(0x10, 'Électric Grand Piano', 'Bright ♪');
  assert.deepEqual([top[7], top[8], bottom[7], bottom[8]], [0x60, 0x00, 0x64, 0x00]);
  assert.equal(String.fromCharCode(...top.slice(9, 25)), 'Electric Grand P');
  assert.equal(String.fromCharCode(...bottom.slice(9, 25)), 'Bright          ');
  assert.equal(top.length, 7 + 2 + 16 + 2);
});

test('as it comes: its switches (CC80–83) down and up, its expression pedals (CC7, CC1) where they are, a program change its patch', () => {
  const c = clock(), m = footModel({ now: c.now });
  assert.deepEqual(PEDALS.length, 13);
  c.at(1); m.midi([0xb0, 80, 127]); m.midi([0xb0, 82, 127]);
  assert.equal(m.down.ctl1, true); assert.equal(m.down.toe1, true); assert.equal(m.down.ctl2, false); assert.equal(m.when.ctl1, 1);
  m.midi([0xb0, 80, 0]); assert.equal(m.down.ctl1, false);
  assert.equal(m.exp.exp1, null, 'unknown until it moves');
  m.midi([0xb0, 7, 90]); m.midi([0xb0, 1, 12]);
  assert.deepEqual(m.exp, { exp1: 90, exp2: 12 });
  m.midi([0xc0, 7]); assert.equal(m.program, 7, 'its 008: pedal 3/8, its green light');
  m.sysex({ mode: 'sysex' }); assert.equal(m.mode, 'sysex');
  m.sysex({ pedal: 'up', down: true }); assert.equal(m.down.up, true);
});

test('driven by Forte: CTL 1 and 2 are the sustain and sostenuto pedals down while held; the toe switch flips the soft pedal; the expression pedals are the volume and the mod wheel', () => {
  assert.deepEqual(drive({ pedal: 'ctl1', down: true }).send, [[0xb0, 64, 127]]);
  assert.deepEqual(drive({ pedal: 'ctl1', down: false }).send, [[0xb0, 64, 0]]);
  assert.deepEqual(drive({ pedal: 'ctl2', down: true }).send, [[0xb0, 66, 127]]);
  let r = drive({ pedal: 'toe1', down: true }, { soft: false });
  assert.deepEqual([r.soft, r.send], [true, [[0xb0, 67, 127]]]);
  assert.deepEqual(drive({ pedal: 'toe1', down: false }, { soft: true }).send, [], 'letting the toe go leaves it down');
  r = drive({ pedal: 'toe1', down: true }, { soft: true });
  assert.deepEqual([r.soft, r.send], [false, [[0xb0, 67, 0]]]);
  assert.deepEqual(drive({ pedal: 'exp1', value: 40 }).send, [[0xb0, 7, 40]]);
  assert.deepEqual(drive({ pedal: 'exp2', value: 127 }).send, [[0xb0, 1, 127]]);
  assert.deepEqual(drive({ pedal: 'toe2', down: true }).send, [], 'EXP 2\'s toe switch: free');
});

test('driven by Forte: ▲ ▼ the next preset and the one before, the number pedals the five around the one playing', () => {
  const at = (pedal, index, count = 12) => drive({ pedal, down: true }, { index, count }).preset;
  assert.equal(at('up', 3), 4); assert.equal(at('down', 3), 2);
  assert.equal(at('up', 11), null, 'past the last: nothing'); assert.equal(at('down', 0), null);
  assert.equal(at('up', -1), 0, 'none playing (a control moved): ▲ the first'); assert.equal(at('down', -1), 11, '▼ the last');
  assert.equal(at('number1', 7), 5); assert.equal(at('number5', 7), 9); assert.equal(at('number3', 2), 2);
  assert.equal(at('number1', -1), 0);
  assert.equal(at('number4', 10), 13, 'past the last: choosePreset says there is none');
  assert.equal(drive({ pedal: 'up', down: false }, { index: 3, count: 12 }).preset, null, 'on the press, not the release');
  assert.equal(at('up', 3, 0), null, 'a page without presets');
});

test('driven by Forte: its face shows the preset: its light red for the first five, green the next, its number, the instrument and the preset', () => {
  const msgs = face(0x10, { index: 6, count: 12, name: 'Bright', title: 'Electric Grand', soft: true });
  const set = new Map(msgs.map((m) => [`${m[7].toString(16)} ${m[8].toString(16)}`, m.slice(9, -2)]));
  const lit = (a, b) => set.get(`${a.toString(16)} ${b.toString(16)}`)?.[0];
  assert.equal(lit(0x30, 1), 0x00, 'pedal 2\'s red off'); assert.equal(lit(0x30, 6), 0x7f, 'pedal 2/7\'s green on: preset 7');
  assert.equal(lit(0x30, 0), 0x00); assert.equal(lit(0x30, 5), 0x00);
  assert.equal(lit(0x32, 0), 0x7f, 'EXP 1\'s toe light: the soft pedal down'); assert.equal(lit(0x32, 1), 0x00);
  assert.equal(lit(0x35, 0), 0x7f, '▲: there is a next'); assert.equal(lit(0x35, 1), 0x7f, '▼: and one before');
  assert.deepEqual([lit(0x40, 4), lit(0x40, 2), lit(0x40, 0)], [sx.DIGITS[0], sx.DIGITS[0], sx.DIGITS[7]], '007');
  assert.equal(String.fromCharCode(...set.get('60 0')).trim(), 'Electric Grand');
  assert.equal(String.fromCharCode(...set.get('64 0')).trim(), 'Bright');
  const first = face(0x10, { index: 0, count: 3 });
  assert.equal(first.find((m) => m[7] === 0x30 && m[8] === 0)[9], 0x7f, 'preset 1: pedal 1 red');
  assert.equal(first.find((m) => m[7] === 0x35 && m[8] === 1)[9], 0x00, 'nothing before it');
  for (const m of msgs) assert.ok(sx.parse(m) !== null || m[6] === 0x12, 'well formed');
});

test('a volume pedal on the Volume control: its default toe down, silent heel down, (v/127)² between; in dB for one in dB', () => {
  const gain = { id: 'volume', min: 0, max: 2, def: 0.8, step: 0.01 }, dB = { id: 'volume', min: -30, max: 6, def: 0, step: 0.1 };
  assert.equal(pedalVolume(gain, 127), 0.8); assert.equal(pedalVolume(gain, 0), 0);
  assert.equal(pedalVolume(gain, 64), Math.round(0.8 * (64 / 127) ** 2 * 100) / 100);
  assert.equal(pedalVolume(dB, 127), 0); assert.equal(pedalVolume(dB, 0), -30);
  assert.ok(Math.abs(pedalVolume(dB, 64) - 40 * Math.log10(64 / 127)) < 0.051, '40·log10, as General MIDI');
  assert.equal(pedalVolume(dB, 2), -30, 'no quieter than its bottom');
});

test('a device\'s CC7 moves the Volume control where the page has one; a song\'s, and CC11, turn the output down as before', () => {
  const moved = [];
  setLevel(7, 127); setLevel(11, 127);
  volumePedal((v) => moved.push(v));
  try {
    const sent = [], device = createInput((d) => sent.push([...d]), {}, { shift: true }), song = createInput((d) => sent.push([...d]));
    device.take([0xb0, 7, 50]);
    assert.deepEqual(moved, [50]); assert.equal(pedalGain(), 1, 'not twice');
    song.take([0xb0, 7, 100]);
    assert.deepEqual(moved, [50], 'a song\'s volume isn\'t the player\'s');
    assert.ok(Math.abs(pedalGain() - (100 / 127) ** 2) < 1e-12);
    device.take([0xb0, 11, 64]);
    assert.ok(Math.abs(pedalGain() - (100 / 127) ** 2 * (64 / 127) ** 2) < 1e-12, 'the expression pedal');
    const organ = createInput(() => {}, { 7: 'swell' }, { shift: true });
    organ.take([0xb0, 7, 20]);
    assert.deepEqual(moved, [50], 'an instrument that maps CC7 keeps it');
    song.letGo(); device.letGo();
  } finally { volumePedal(null); setLevel(7, 127); setLevel(11, 127); }
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log('\nall passed');
