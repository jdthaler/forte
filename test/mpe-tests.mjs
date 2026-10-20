// MPE checks: shared/mpe.js against the MPE specification (zones, the configuration message, the
// members' bend range, what a member's note carries), its bends along the tunings, and every
// instrument's engine with one note's own expression: a bend of none and a slide of none leave it
// bit for bit as it was, an instrument that can't bend or slide one note ignores them, one that can
// moves that note's pitch by the bend, and the wildest streams leave it finite.
// Run: node test/mpe-tests.mjs [slug…]

import assert from 'node:assert/strict';
import { createMpe, bendRatio, MEMBER_BEND } from '../shared/mpe.js';
import { tunedFreq } from '../shared/tuning.js';
import { INSTRUMENTS } from '../shared/registry.js';
import { loadInstrument, defaultsOf, Player } from '../tools/headless.mjs';
import { loadEngine } from '../tools/engine.mjs';
import { fft } from '../tools/audio-util.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const only = process.argv.slice(2);

// ---- the decoder ------------------------------------------------------------------------------------
// a decoder and what it handed over, as [kind, key, value]
function decoder(mode = 'auto') {
  const got = [];
  const mpe = createMpe({ noteBend: (k, v) => got.push(['bend', k, v]), noteSlide: (k, v) => got.push(['slide', k, v]), notePressure: (k, v) => got.push(['pressure', k, v]) });
  mpe.mode = mode;
  const take = () => got.splice(0);
  const cc = (ch, n, v) => mpe.midi([0xb0 | ch, n, v]);
  const mcm = (master, n) => { cc(master, 101, 0); cc(master, 100, 6); cc(master, 6, n); };
  const bend = (ch, semis, range = MEMBER_BEND) => { const b = Math.round((semis / range) * 8191) + 8192; return mpe.midi([0xe0 | ch, b & 127, b >> 7]); };
  return { mpe, take, cc, mcm, bend };
}

console.log('the decoder');
await test('Auto is plain MIDI until the configuration message (RPN 6 on channel 1: the lower zone), then channels 2 … n + 1 are notes\' own', () => {
  const { mpe, take, mcm, bend } = decoder();
  assert.equal(mpe.active(), false);
  assert.equal(mpe.midi([0x91, 60, 100]), false);
  assert.equal(bend(1, 12), false, 'plain MIDI: the page bends every note');
  assert.deepEqual(take(), []);
  mcm(0, 7);
  assert.equal(mpe.active(), true);
  assert.equal(mpe.members(0), 7);
  assert.ok(mpe.isMember(1) && mpe.isMember(7) && !mpe.isMember(8) && !mpe.isMember(0), 'members 2–8, master 1');
  bend(3, 5);
  assert.equal(mpe.midi([0x93, 62, 90]), false, 'the note plays as ever');
  const [b, s] = take();
  assert.deepEqual([b[0], b[1], s[0], s[1]], ['bend', 62, 'slide', 62], 'with its channel\'s bend and slide first');
  near(b[2], 5, 0.01, 'bend');
  assert.ok(Number.isNaN(s[2]), 'no slide yet');
  assert.equal(bend(3, -7), true, 'its channel\'s bend is the note\'s');
  assert.equal(mpe.midi([0xb3, 74, 127]), true);
  assert.equal(mpe.midi([0xd3, 64, 0]), true);
  const [b2, s2, p2] = take();
  near(b2[2], -7, 0.01, 'bend'); assert.deepEqual(s2, ['slide', 62, 1]); assert.deepEqual(p2, ['pressure', 62, 64 / 127]);
  assert.equal(bend(0, 1), false, 'the master\'s bend is every note\'s');
  assert.equal(mpe.midi([0xd0, 30, 0]), false, 'and its pressure');
  assert.equal(mpe.midi([0xb3, 64, 127]), false, 'a member\'s pedal is the instrument\'s');
  assert.equal(mpe.midi([0x83, 62, 0]), false);
  assert.equal(bend(3, 2), true, 'a released note still follows its channel');
  assert.equal(take()[0][1], 62);
  mcm(0, 0);
  assert.equal(mpe.active(), false, 'RPN 6 of 0 ends the zone');
  assert.equal(bend(3, 2), false);
});
await test('the upper zone (RPN 6 on channel 16) takes channels 15 down; two zones share the fourteen between their masters', () => {
  const { mpe, mcm } = decoder();
  mcm(15, 3);
  assert.equal(mpe.members(1), 3);
  assert.ok(mpe.isMember(14) && mpe.isMember(12) && !mpe.isMember(11) && !mpe.isMember(15));
  mcm(0, 15);
  assert.deepEqual([mpe.members(0), mpe.members(1)], [15, 0], 'a lower zone of 15 leaves the upper none');
  mcm(15, 4);
  assert.deepEqual([mpe.members(0), mpe.members(1)], [10, 4], 'an upper zone of 4 shrinks the lower to 10');
});
await test('RPN 0 on a member sets its zone\'s bend range (semitones, and cents by CC38); the configuration message puts it back to ±48', () => {
  const { mpe, take, cc, mcm, bend } = decoder();
  mcm(0, 15);
  assert.equal(mpe.memberBend(0), 48);
  cc(5, 101, 0); cc(5, 100, 0); cc(5, 6, 24); cc(5, 38, 50);
  assert.equal(mpe.memberBend(0), 24.5);
  mpe.midi([0x92, 60, 100]); take();
  bend(2, 24.5, 24.5);
  near(take()[0][2], 24.5, 1e-9, 'a full bend');
  cc(0, 101, 0); cc(0, 100, 0); cc(0, 6, 12);
  assert.equal(mpe.memberBend(0), 24.5, 'the master\'s range is its own (the instrument\'s wheel)');
  mcm(0, 15);
  assert.equal(mpe.memberBend(0), 48);
});
await test('On is the lower zone of 15 with no configuration message; Off never decodes; Auto is the default', () => {
  assert.equal(decoder().mpe.mode, 'auto');
  const on = decoder('on');
  assert.equal(on.mpe.members(0), 15);
  assert.equal(on.bend(1, 3), true);
  const off = decoder('off');
  off.mcm(0, 15);
  assert.equal(off.mpe.active(), false);
  assert.equal(off.bend(1, 3), false);
  off.mpe.mode = 'auto';
  assert.equal(off.mpe.active(), false, 'what came on Off is forgotten');
});
await test('a note\'s bend follows the tuning: 2^(s/12) in equal temperament; a slide to another key lands on its tuned pitch in meantone, at 415 Hz and in a custom temperament', () => {
  for (const s of [-48, -1, 0, 0.5, 7, 48]) assert.equal(bendRatio({ pitch: 440, temperament: 'equal' }, 60, s), 2 ** (s / 12));
  for (const P of [{ temperament: 'meantone', tuningRoot: 0, pitch: 440 }, { temperament: 'werckmeister', tuningRoot: 3, pitch: 415 }, { temperament: 'custom', tuningRoot: 0, pitch: 440, cents3: 20, cents8: -30 }]) {
    for (const key of [57, 60, 61, 66]) for (const s of [-12, -5, -1, 1, 2, 7, 24]) {
      near(tunedFreq(P, key) * bendRatio(P, key, s), tunedFreq(P, key + s), 1e-9 * tunedFreq(P, key + s), `${P.temperament} ${key} + ${s}`);
    }
  }
  near(bendRatio({ pitch: 440, temperament: 'equal' }, 60, 500), 2 ** 8, 1e-9, 'no further than 96 semitones');
});

// ---- every instrument ---------------------------------------------------------------------------------
const slugs = ['template', ...INSTRUMENTS.filter((i) => i.ready).map((i) => i.id)].filter((s) => !only.length || only.includes(s));
const FS = 48000;
const differs = (a, b) => a.some((x, i) => x !== b[i]);

// A key's magnitude spectrum after the attack, the engine's own output; and how far b's lies from a's,
// in cents (as test/tuning-tests.mjs measures a tuning)
function spectrum([L, R], fs) {
  const N = 1 << 17, re = new Float64Array(N), im = new Float64Array(N), a = Math.round(0.15 * fs), n = L.length - a;
  for (let i = 0; i < n; i++) re[i] = (L[a + i] + R[a + i]) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  fft(re, im, false);
  const mag = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) mag[k] = Math.sqrt(Math.hypot(re[k], im[k]));
  return { mag, df: fs / N };
}
function shift(a, b, guess) {
  const lo = Math.round(40 / a.df), hi = Math.round(6000 / a.df);
  const score = (c) => {
    const s = 2 ** (c / 1200);
    let x = 0;
    for (let k = lo; k < hi; k++) {
      const j = k * s, j0 = Math.floor(j), t = j - j0;
      x += a.mag[k] * (b.mag[j0] * (1 - t) + b.mag[j0 + 1] * t);
    }
    return x;
  };
  let best = guess, bestS = -Infinity;
  for (let c = guess - 40; c <= guess + 40; c += 1) { const s = score(c); if (s > bestS) { bestS = s; best = c; } }
  let l = best - 1, r = best + 1;
  for (let it = 0; it < 30; it++) { const m1 = l + (r - l) / 3, m2 = r - (r - l) / 3; if (score(m1) < score(m2)) l = m1; else r = m2; }
  return (l + r) / 2;
}
// Instruments whose spectrum does not stretch with the pitch (test/tuning-tests.mjs OWN): their
// own suites measure a note's bend
const OWN = ['bubbles', 'stars', 'quantum', 'blackhole'];

console.log('the instruments');
for (const slug of slugs) {
  const I = await loadInstrument(slug), Engine = await loadEngine(I), D = defaultsOf(I);
  const [lo, hi] = I.compass?.keys ?? I.range ?? [36, 96];
  const keys = [60, 64, 67].map((k) => Math.min(hi - 2, Math.max(lo + 2, k)));
  const play = (events, sec = 0.6, fs = FS) => new Player(I, Engine, fs, D).render(sec, [...keys.flatMap((k) => [[0.01, 'on', k, 0.7], [0.45, 'off', k]]), ...events]);
  const plain = play([]);
  const { bend = 0, slide = false, press = false } = I.mpe ?? {};
  await test(`${slug}: ${bend ? `one note bends up to ±${bend} semitones` : 'no note bends alone'}${slide ? `, and slides its own ${I.modWheel.param ?? I.modWheel}` : ''}; a bend and a slide of none, before and while a note sounds, change nothing at all`, () => {
    if (I.mpe) assert.deepEqual(Object.keys(I.mpe).filter((k) => !['bend', 'slide', 'press'].includes(k)), [], 'mpe: { bend, slide, press }');
    if (slide) assert.ok(I.modWheel, 'a slide is a mod wheel of its own');
    const none = play(keys.flatMap((k) => [[0, 'noteBend', k, 0], [0, 'slide', k, NaN], [0.2, 'noteBend', k, 0], [0.2, 'slide', k, NaN]]));
    assert.ok(!differs(none[0], plain[0]) && !differs(none[1], plain[1]), 'a bend of 0 and no slide change the sound');
    const bent = play([[0, 'noteBend', keys[0], 5], [0.2, 'noteBend', keys[1], -3]]), slid = play([[0, 'slide', keys[0], 1], [0.2, 'slide', keys[1], 0.5]]);
    assert.equal(differs(bent[0], plain[0]), bend > 0, bend ? 'a note\'s bend changes the sound' : 'an instrument that cannot bend one note ignores its bend');
    if (!slide) assert.ok(!differs(slid[0], plain[0]), 'an instrument whose notes have no slide ignores it');
  });
  if (bend && press) {
    // it bends a note as its wheel does, by pressing its key harder: up only, as far as a press goes
    await test(`${slug}: a note struck bent fully up sounds as sharp as its wheel at full; one bent down sounds as it was`, () => {
      const key = keys[1], one = (s, ev = []) => spectrum(new Player(I, Engine, FS, D).render(1.4, [[0, 'noteBend', key, s], ...ev, [0, 'on', key, 0.7]]), FS);
      const base = one(0), up = shift(base, one(bend), 20), wheel = shift(base, one(0, [[0, 'bend', 1]]), 20);
      assert.ok(up > 5, `+${bend} semitones: ${up.toFixed(1)} ¢`);
      near(up, wheel, 1, 'as the wheel at full');
      near(shift(base, one(-bend), 0), 0, 0.5, 'bent down');
    });
  } else if (bend && !OWN.includes(slug)) {
    await test(`${slug}: a note struck bent sounds its bend (+35 ¢ and −2 semitones) wherever its spectrum shows it`, () => {
      const key = keys[1], one = (s) => spectrum(new Player(I, Engine, FS, D).render(1.4, [[0, 'noteBend', key, s], [0, 'on', key, 0.7]]), FS);
      const base = one(0);
      near(shift(base, one(0.35), 35), 35, 3, '+35 ¢');
      near(shift(base, one(-2), -200), -200, 3, '−2 semitones');
    });
  }
  await test(`${slug}: bends of ±96 semitones and slides from 0 to 1, swept on a chord every block, stay finite and bounded at 44.1, 48 and 96 kHz`, () => {
    for (const fs of [44100, 48000, 96000]) {
      const sweep = [];
      for (let t = 0; t < 0.6; t += 128 / fs) for (const [j, k] of keys.entries()) {
        const u = (t * (3 + j) * 7) % 2;
        sweep.push([t, 'noteBend', k, (j === 1 ? -96 : 96) * (u < 1 ? u : 2 - u)], [t, 'slide', k, u < 1 ? u : 2 - u]);
      }
      const [L, R] = play(sweep, 0.8, fs);
      let peak = 0;
      for (let i = 0; i < L.length; i++) { assert.ok(Number.isFinite(L[i] + R[i]), `finite at ${fs} Hz`); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
      assert.ok(peak < 8, `peak ${peak.toFixed(2)} at ${fs} Hz`);
    }
  });
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
