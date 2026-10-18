// Room checks: the venues of shared/impulses.js are the rooms their physics gives, every
// instrument offers them, and 'room' is still the pages' original room.
// Run: node test/rooms-tests.mjs

import assert from 'node:assert/strict';
import { BANDS, VENUES, reverbTimes, roomIR, splitBands, venueGain, venueIR, venueOf } from '../shared/impulses.js';
import { VENUE } from '../shared/chain.js';
import { FS_SHIM, webAudioIR } from '../tools/audio-util.mjs';
import { INSTRUMENTS } from '../shared/registry.js';
import { loadInstrument } from '../tools/headless.mjs';

let failures = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => console.log('  ok  ', name), (e) => { failures++; console.log('  FAIL', name, '\n       ', e.message); });
}
const FS = 48000, halls = VENUES.filter((v) => v.size);
const irs = new Map(halls.map((v) => [v.id, venueIR(FS_SHIM(FS), v.id)]));
const energy = (x, a = 0, b = x.length) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return e; };

// Schroeder's backward integral, and the time it takes to fall 60 dB fitted from −5 to −25 dB (T20)
function decayTime(x) {
  const e = new Float64Array(x.length + 1);
  for (let i = x.length - 1; i >= 0; i--) e[i] = e[i + 1] + x[i] * x[i];
  const at = (db) => e.findIndex((v) => 10 * Math.log10(v / e[0]) <= db);
  return (3 * (at(-25) - at(-5))) / FS;
}

console.log('venues');
await test('the choice: Studio, Room, Recital hall, Concert hall, Cathedral, Room (the original) the default, and the parameter offers them in that order', () => {
  assert.deepEqual(VENUES.map((v) => v.id), ['studio', 'room', 'recital', 'hall', 'cathedral']);
  assert.equal(VENUE.def, 'room');
  assert.deepEqual(VENUE.options.map(([id]) => id), VENUES.map((v) => v.id));
  assert.equal(venueOf('nowhere').id, 'room');
});
await test("'room' is roomIR as the pages always had it, at the instrument's length and gain 1", () => {
  for (const sec of [1.8, 2.0, 2.2]) {
    const a = venueIR(FS_SHIM(FS), 'room', sec), b = roomIR(FS_SHIM(FS), sec);
    for (const c of [0, 1]) assert.deepEqual(a.getChannelData(c), b.getChannelData(c));
    assert.equal(venueGain('room', a.getChannelData(0).length, FS), 1);
  }
});
await test('Eyring: each band of each hall dies away in its reverberation time (T20 of the octave band, within 10 % up to 2 kHz; 30 % above, where the slower bands below leak through the crossovers)', () => {
  for (const v of halls) {
    const T = reverbTimes(v), b = irs.get(v.id), ch = [0, 1].map((c) => splitBands(b.getChannelData(c), FS));
    const got = BANDS.map((f, k) => (decayTime(ch[0][k]) + decayTime(ch[1][k])) / 2);
    console.log(`        ${v.name}: ${got.map((t, b) => `${BANDS[b]} Hz ${t.toFixed(2)} (${T[b].toFixed(2)})`).join(', ')}`);
    got.forEach((t, b) => assert.ok(Math.abs(t / T[b] - 1) < (BANDS[b] <= 2000 ? 0.1 : 0.3), `${v.name} at ${BANDS[b]} Hz: ${t.toFixed(2)} s against ${T[b].toFixed(2)} s`));
  }
});
await test('the halls, in order: the studio is shortest and the cathedral longest at 500 Hz–1 kHz; the air shortens every hall above 2 kHz', () => {
  const mid = halls.map((v) => (reverbTimes(v)[2] + reverbTimes(v)[3]) / 2);
  for (let i = 1; i < mid.length; i++) assert.ok(mid[i] > mid[i - 1], halls.map((v, k) => `${v.id} ${mid[k].toFixed(2)}`).join(', '));
  assert.ok(mid[0] > 0.3 && mid[0] < 0.5 && mid.at(-1) > 4 && mid.at(-1) < 7);
  for (const v of halls) { const T = reverbTimes(v); assert.ok(T[6] < T[4] && T[5] < T[4], v.id); }
});
await test('early reflections: nothing before the first image source arrives, (d − r)/c after the direct sound', () => {
  for (const v of halls) {
    const x = irs.get(v.id).getChannelData(0), first = x.findIndex((s) => s !== 0);
    const [W, , H] = v.size, s = v.src, m = [v.mic[0] - 0.3, v.mic[1], v.mic[2]];
    const r = Math.hypot(m[0] - s[0], m[1] - s[1], m[2] - s[2]);
    // the floor's image, the nearest for these rooms' heights, sets the soonest a reflection can come
    const floor = Math.hypot(m[0] - s[0], m[1] - s[1], m[2] + s[2]);
    const mix = 0.001 * Math.sqrt(W * v.size[1] * H), tail = Math.max(0, Math.ceil((mix / 2 - r / 343) * FS));
    assert.ok(first >= Math.min(Math.floor(((floor - r) / 343) * FS), tail), `${v.id}: first sound at ${first}`);
    assert.ok(first <= Math.floor(((floor - r) / 343) * FS) + 1 || first <= tail, `${v.id}: first sound at ${first}`);
  }
});
await test('stereo: past the mixing time the two microphones hear the diffuse field nearly uncorrelated (|ρ| < 0.05); the early reflections, which reach both, leave it under 0.25 overall', () => {
  for (const v of halls) {
    const b = irs.get(v.id), l = b.getChannelData(0), r = b.getChannelData(1);
    const rho = (a) => { let lr = 0; for (let i = a; i < l.length; i++) lr += l[i] * r[i]; return lr / Math.sqrt(energy(l, a) * energy(r, a)); };
    const mix = Math.ceil(0.001 * Math.sqrt(v.size[0] * v.size[1] * v.size[2]) * FS);
    assert.ok(Math.abs(rho(mix)) < 0.05 && Math.abs(rho(0)) < 0.25, `${v.id}: ${rho(mix).toFixed(3)}, ${rho(0).toFixed(3)}`);
  }
});
await test("level: once Web Audio normalises it, each hall carries the 2 s room's energy (within 0.1 dB), so a Room setting means the same amount of reverb", () => {
  const ref = webAudioIR(roomIR(FS_SHIM(FS), 2.0), FS), e0 = energy(ref[0]) + energy(ref[1]);
  for (const v of halls) {
    const b = irs.get(v.id), n = b.getChannelData(0).length, s = webAudioIR(b, FS), g = venueGain(v.id, n, FS);
    assert.ok(Math.abs(10 * Math.log10((g * g * (energy(s[0]) + energy(s[1]))) / e0)) < 0.1, v.id);
  }
});
await test('every instrument with a room offers the venue beside it, keeps it across presets, and its chain hears it', async () => {
  for (const { id } of INSTRUMENTS.filter((i) => i.ready)) {
    const I = await loadInstrument(id), all = I.groups.flatMap((g) => g.params);
    if (!I.chain.room) continue;
    const group = I.groups.find((g) => g.params.some((p) => p.id === 'room'));
    assert.ok(group.params.includes(VENUE), `${id}: Venue beside Room`);
    assert.equal(I.chain.venue, 'venue', id);
    assert.ok(I.keep.includes('venue'), `${id}: keep`);
    assert.ok(I.presets.every((p) => !('venue' in p.p)), `${id}: a preset sets the venue`);
    assert.equal(all.filter((p) => p.id === 'venue').length, 1, id);
  }
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
