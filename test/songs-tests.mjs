// Songs checks (shared/midifile.js, shared/songs.js, songs/): MIDI files read and written, what a
// page plays of one, the octave fit, a song's input cleaned as a keyboard's is, Forte's own songs
// as tools/make-songs.mjs writes them, and every page handing its MIDI handler to the songs.
// Run: node test/songs-tests.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseMIDI, writeMIDI, playable, fit, transpose } from '../shared/midifile.js';
import { createInput, setShift } from '../shared/midi.js';
import { INSTRUMENTS } from '../shared/registry.js';
import { SONGS, songFile } from '../tools/make-songs.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message.replace(/\n/g, '\n        ')); }
}
const R = new URL('../', import.meta.url);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// a file by hand: header, then tracks of raw bytes
const smf = (format, division, ...tracks) => Uint8Array.from([
  ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, format, 0, tracks.length, (division >> 8) & 0xff, division & 0xff],
  ...tracks.flatMap((t) => [0x4d, 0x54, 0x72, 0x6b, (t.length >>> 24) & 0xff, (t.length >>> 16) & 0xff, (t.length >>> 8) & 0xff, t.length & 0xff, ...t]),
]);
const END = [0, 0xff, 0x2f, 0];

await test('reads a format 0 file: running status, a note-on at 0 as a note-off, 120 bpm by default', () => {
  // 96 ticks a quarter: C4 on at 0, E4 on with running status, both off a quarter later (velocity 0)
  const s = parseMIDI(smf(0, 96, [0, 0x90, 60, 100, 0, 64, 90, 96, 60, 0, 0, 64, 0, ...END]));
  assert.equal(s.format, 0);
  assert.deepEqual(s.events.map((e) => e.data), [[0x90, 60, 100], [0x90, 64, 90], [0x90, 60, 0], [0x90, 64, 0]]);
  assert.ok(near(s.events[2].t, 0.5)); // a quarter at 120 bpm
  assert.ok(near(s.duration, 0.5));
});

await test('reads a format 1 file: tempo changes in the first track time every track; meta and SysEx left out', () => {
  const tempo = (us) => [0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
  const conductor = [0, 0xff, 0x03, 4, 0x54, 0x65, 0x73, 0x74, 0, ...tempo(1000000), 0x83, 0x60, ...tempo(250000), ...END]; // 60 bpm, then 240 at tick 480
  const notes = [0, 0xf0, 2, 0x7e, 0xf7, 0, 0xc0, 5, 0, 0x91, 67, 80, 0x87, 0x40, 0x81, 67, 64, 0x83, 0x60, 0xb1, 64, 127, ...END]; // off at 960, pedal at 1440
  const s = parseMIDI(smf(1, 480, conductor, notes));
  assert.equal(s.name, 'Test');
  assert.deepEqual(s.events.map((e) => e.data), [[0xc0, 5], [0x91, 67, 80], [0x81, 67, 64], [0xb1, 64, 127]]);
  assert.deepEqual(s.events.map((e) => e.t), [0, 0, 1.25, 1.5]); // 1 s for the first quarter, then 0.25 s each
});

await test('reads SMPTE time and a RIFF .rmi; says what is wrong with a file that isn\'t one', () => {
  const s = parseMIDI(smf(0, 0xe728, [0, 0x90, 60, 100, 0x81, 0x48, 0x80, 60, 0, ...END])); // 25 fps × 40 ticks: 200 ticks = 0.2 s
  assert.ok(near(s.events[1].t, 0.2));
  const inner = smf(0, 96, [0, 0x90, 60, 100, 96, 0x80, 60, 0, ...END]);
  const riff = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('RMIDdata'), inner.length, 0, 0, 0, ...inner]);
  assert.equal(parseMIDI(riff).events.length, 2);
  assert.throws(() => parseMIDI(new TextEncoder().encode('not a midi file at all')), /not a MIDI file/);
  assert.throws(() => parseMIDI(smf(0, 96, [0, 0x90, 60])), /cut short|corrupt/);
});

await test('writes what it reads: notes, tempos and the name, a repeated note let go before it is struck again', () => {
  const bytes = writeMIDI({ name: 'Für Elise', division: 480, tempos: [{ tick: 0, bpm: 120 }, { tick: 960, bpm: 60 }],
    tracks: [{ name: 'Für Elise', events: [
      { tick: 0, data: [0x90, 60, 80] }, { tick: 480, data: [0x80, 60, 64] },
      { tick: 960, data: [0x80, 62, 64] }, { tick: 480, data: [0x90, 62, 70] }, { tick: 960, data: [0x90, 62, 90] }, { tick: 1440, data: [0x80, 62, 0] },
    ] }] });
  const s = parseMIDI(bytes);
  assert.equal(s.format, 1);
  assert.equal(s.name, 'Für Elise');
  assert.deepEqual(s.events.map((e) => [e.t, ...e.data]), [
    [0, 0x90, 60, 80], [0.5, 0x80, 60, 64], [0.5, 0x90, 62, 70], [1, 0x80, 62, 64], [1, 0x90, 62, 90], [2, 0x80, 62, 0],
  ]);
});

await test('a page plays notes, pedals, the wheel, bend and pressure, and its own controllers; not program changes, volume or percussion', () => {
  const ev = (...data) => ({ t: 0, data });
  const events = [ev(0xc0, 1), ev(0xb0, 7, 100), ev(0xb0, 10, 64), ev(0xb0, 64, 127), ev(0xb0, 1, 30), ev(0xb0, 11, 90), ev(0xb0, 101, 0),
    ev(0xe0, 0, 64), ev(0xd0, 50), ev(0xa0, 60, 40), ev(0x90, 60, 90), ev(0x80, 60, 0), ev(0x99, 36, 100), ev(0x89, 36, 0)];
  assert.deepEqual(playable(events).map((e) => e.data), [[0xb0, 64, 127], [0xb0, 1, 30], [0xe0, 0, 64], [0xd0, 50], [0xa0, 60, 40], [0x90, 60, 90], [0x80, 60, 0]]);
  assert.ok(playable(events, { controllers: { 11: 'swell' } }).some((e) => e.data[1] === 11 && e.data[0] === 0xb0));
  // a file of percussion alone plays it
  assert.equal(playable([ev(0x99, 36, 100), ev(0x89, 36, 0)]).length, 2);
});

await test('a song moves by whole octaves to fit the keys, and no more than it must', () => {
  const on = (k) => ({ t: 0, data: [0x90, k, 90] });
  assert.equal(fit([on(60), on(64), on(67)], 36, 96), 0);
  assert.equal(fit([on(30), on(34), on(40)], 36, 96), 12);
  assert.equal(fit([on(84), on(88), on(91)], 48, 84), -12);
  assert.equal(fit([on(30), on(90)], 36, 96), 0); // no move fits more
  const moved = transpose([on(60), { t: 1, data: [0x80, 60, 0] }, { t: 1, data: [0xb0, 64, 0] }, on(125)], 12);
  assert.deepEqual(moved.map((e) => e.data), [[0x90, 72, 90], [0x80, 72, 0], [0xb0, 64, 0]]);
});

await test('a song\'s messages are cleaned as a keyboard\'s: a re-strike lets go first, a stray note-off is dropped, stopping lets go', () => {
  const sent = [];
  const input = createInput((d) => sent.push([...d]));
  input.take([0x80, 61, 0]);  // never struck: dropped
  input.take([0x90, 60, 90]);
  input.take([0x90, 60, 70]); // struck again before it was let go
  input.take([0xb0, 64, 127]);
  input.take([0x90, 64, 80]);
  input.take([0x80, 64, 0]);
  input.letGo();
  assert.deepEqual(sent, [[0x90, 60, 90], [0x80, 60, 0], [0x90, 60, 70], [0xb0, 64, 127], [0x90, 64, 80], [0x80, 64, 0], [0x80, 60, 0], [0xb0, 64, 0]]);
});

await test('a song doesn\'t follow the player\'s Octave and Transpose (it fits itself); a device does', () => {
  setShift({ octave: -2, transpose: 3 });
  try {
    const song = [], device = [];
    const a = createInput((d) => song.push([...d])), b = createInput((d) => device.push([...d]), {}, { shift: true });
    for (const i of [a, b]) { i.take([0x90, 60, 90]); i.take([0x80, 60, 0]); }
    assert.deepEqual(song, [[0x90, 60, 90], [0x80, 60, 0]]);
    assert.deepEqual(device, [[0x90, 39, 90], [0x80, 39, 0]]);
  } finally { setShift({ octave: 0, transpose: 0 }); }
});

const index = JSON.parse(readFileSync(new URL('songs/index.json', R), 'utf8'));
await test('Forte\'s songs: songs/index.json lists every .mid there, each as tools/make-songs.mjs writes it', () => {
  const files = readdirSync(new URL('songs/', R)).filter((f) => f.endsWith('.mid')).sort();
  assert.deepEqual(index.map((s) => s.file).sort(), files);
  assert.deepEqual(index, SONGS.map(({ file, title, by }) => ({ file, title, by })), 'songs/index.json is out of date: node tools/make-songs.mjs');
  for (const s of SONGS) {
    assert.deepEqual([...readFileSync(new URL(`songs/${s.file}`, R))], [...songFile(s)], `songs/${s.file} is out of date: node tools/make-songs.mjs`);
  }
});
for (const s of index) {
  await test(`${s.title}: reads, plays every note it strikes and lets each go, within a piano's keys`, () => {
    const song = parseMIDI(readFileSync(new URL(`songs/${s.file}`, R)));
    const events = playable(song.events);
    const down = new Map();
    let notes = 0;
    for (const { data: [st, k, v] } of events) {
      if ((st & 0xf0) === 0x90 && v > 0) { notes++; down.set(k, (down.get(k) ?? 0) + 1); }
      else if ((st & 0xf0) === 0x80 || (st & 0xf0) === 0x90) down.set(k, (down.get(k) ?? 0) - 1);
    }
    assert.ok(notes > 40, `${notes} notes`);
    assert.ok([...down.values()].every((n) => n === 0), 'a note is never let go');
    assert.ok(events.every((e) => (e.data[0] & 0xf0) > 0x90 || (e.data[1] >= 21 && e.data[1] <= 108)), 'a note beyond the 88 keys');
    assert.ok(song.duration > 15 && song.duration < 180, `${song.duration.toFixed(1)} s`);
  });
}

// every page hands its MIDI handler to the songs: shared/shell.js does for the pages it builds
await test('every page gives Songs its MIDI handler (shared/shell.js, or pageMIDI)', () => {
  const missing = [];
  for (const i of INSTRUMENTS.filter((x) => x.ready)) {
    const dir = new URL(`${i.id}/src/`, R);
    if (!existsSync(dir)) { missing.push(i.id); continue; }
    const src = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
    if (!/createShell\(|pageMIDI\(\{/.test(src)) missing.push(i.id);
  }
  assert.deepEqual(missing, []);
  assert.match(readFileSync(new URL('shared/shell.js', R), 'utf8'), /pageMIDI\(\{ onMIDI/);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall songs tests passed');
