// Tuning checks: the temperaments of shared/tuning.js against their published tables and their
// definitions (pure thirds, pure fifths, the commas), the pitch standard and the root, Scala files,
// the C++ (forte/tuning.h) against the JavaScript, and every instrument's engine following its
// tuning: a key moves by the cents its tuning gives, and at the defaults nothing moves at all.
// Run: node test/tuning-tests.mjs [slug…]

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  TEMPERAMENTS, PITCHES, TUNING_PARAMS, TUNING_KEEP, CENTS, temperamentCents, tuningCents, tuningRatio, readScala, scalaValues,
  PURE_FIFTH, PYTHAGOREAN_COMMA, SYNTONIC_COMMA,
} from '../shared/tuning.js';
import { INSTRUMENTS } from '../shared/registry.js';
import { loadInstrument, defaultsOf, Player } from '../tools/headless.mjs';
import { loadEngine } from '../tools/engine.mjs';
import { fft } from '../tools/audio-util.mjs';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const cents = (r) => 1200 * Math.log2(r);
const only = process.argv.slice(2);

// ---- the temperaments ---------------------------------------------------------------------------------
// Each note's cents above C, as the literature tabulates them (to 0.01 ¢; Young's to 0.1 ¢):
// Barbour, Tuning and Temperament (1951); Lindley, "Temperaments", Grove Music Online; Young,
// Phil. Trans. R. Soc. 90 (1800) 106–150, his second temperament.
const PUBLISHED = {
  meantone: [0, 76.05, 193.16, 310.26, 386.31, 503.42, 579.47, 696.58, 772.63, 889.74, 1006.84, 1082.89],
  werckmeister: [0, 90.22, 192.18, 294.13, 390.22, 498.04, 588.27, 696.09, 792.18, 888.27, 996.09, 1092.18],
  sixth: [0, 88.59, 196.74, 304.89, 393.48, 501.63, 590.22, 698.37, 786.96, 895.11, 1003.26, 1091.85],
  kirnberger: [0, 90.22, 193.16, 294.13, 386.31, 498.04, 590.22, 696.58, 792.18, 889.74, 996.09, 1088.27],
  vallotti: [0, 94.13, 196.09, 298.04, 392.18, 501.96, 592.18, 698.04, 796.09, 894.13, 1000.00, 1090.22],
  young: [0, 90.2, 196.1, 294.1, 392.2, 498.0, 588.3, 698.0, 792.2, 894.1, 996.1, 1090.2],
  pythagorean: [0, 113.69, 203.91, 294.13, 407.82, 498.04, 611.73, 701.96, 815.64, 905.87, 996.09, 1109.78],
  just: [0, 111.73, 203.91, 315.64, 386.31, 498.04, 590.22, 701.96, 813.69, 884.36, 996.09, 1088.27],
};
const fifthOf = (c, pc) => ((c[(pc + 7) % 12] + (pc + 7 >= 12 ? 1200 : 0)) - c[pc]);
const thirdOf = (c, pc) => ((c[(pc + 4) % 12] + (pc + 4 >= 12 ? 1200 : 0)) - c[pc]);
const PURE_THIRD = cents(5 / 4);

console.log('temperaments');
await test('the choice: Equal, ¼-comma meantone and Werckmeister III first (the harpsichord\'s, in its order), then ⅙-comma meantone, Kirnberger III, Vallotti, Young, Pythagorean, just and custom; the pitch standards 440 and 415 first', () => {
  assert.deepEqual(TEMPERAMENTS.map((t) => t.id), ['equal', 'meantone', 'werckmeister', 'sixth', 'kirnberger', 'vallotti', 'young', 'pythagorean', 'just', 'custom']);
  assert.deepEqual(PITCHES.map(([hz]) => hz).slice(0, 2), [440, 415]);
});
await test('each temperament is its published table, to the table\'s last digit', () => {
  for (const [id, table] of Object.entries(PUBLISHED)) {
    const c = temperamentCents(id), tol = id === 'young' ? 0.051 : 0.0051;
    table.forEach((v, pc) => near(c[pc], v, tol, `${id} ${pc}`));
  }
});
await test('meantone: eight pure major thirds (5 : 4, 386.31 ¢), fifths a quarter of the syntonic comma narrow, and the wolf G♯–E♭ 35.7 ¢ wide of pure', () => {
  const c = temperamentCents('meantone');
  const pure = [...Array(12).keys()].filter((pc) => Math.abs(thirdOf(c, pc) - PURE_THIRD) < 1e-9);
  assert.deepEqual(pure, [0, 2, 3, 4, 5, 7, 9, 10], 'pure thirds on C, D, E♭, E, F, G, A, B♭');
  for (const pc of [3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1]) near(fifthOf(c, pc), PURE_FIFTH - SYNTONIC_COMMA / 4, 1e-9, `fifth on ${pc}`);
  near(fifthOf(c, 8), PURE_FIFTH - PYTHAGOREAN_COMMA + (11 * SYNTONIC_COMMA) / 4, 1e-9, 'the wolf');
  near(fifthOf(c, 8) - PURE_FIFTH, 35.68, 0.01, 'the wolf, wide');
});
await test('the well temperaments close the circle: their fifths\' narrowing adds up to the Pythagorean comma; Pythagorean tuning has eleven pure fifths and a wolf a comma narrow', () => {
  for (const id of ['werckmeister', 'kirnberger', 'vallotti', 'young', 'equal']) {
    const c = temperamentCents(id);
    let narrow = 0;
    for (let pc = 0; pc < 12; pc++) narrow += PURE_FIFTH - fifthOf(c, pc);
    near(narrow, PYTHAGOREAN_COMMA, 1e-9, id);
    for (let pc = 0; pc < 12; pc++) assert.ok(PURE_FIFTH - fifthOf(c, pc) > -1e-9, `${id}: no fifth wider than pure (on ${pc})`);
  }
  const c = temperamentCents('pythagorean');
  for (let pc = 0; pc < 12; pc++) near(fifthOf(c, pc), pc === 8 ? PURE_FIFTH - PYTHAGOREAN_COMMA : PURE_FIFTH, 1e-9, `fifth on ${pc}`);
});
await test('just intonation: the triads on the root, the fourth and the fifth are pure 4 : 5 : 6', () => {
  const c = temperamentCents('just');
  for (const pc of [0, 5, 7]) { near(thirdOf(c, pc), PURE_THIRD, 1e-9, `third on ${pc}`); near(fifthOf(c, pc), PURE_FIFTH, 1e-9, `fifth on ${pc}`); }
});

console.log('the tuning');
const T = (o = {}) => ({ pitch: 440, temperament: 'equal', tuningRoot: 0, ...Object.fromEntries(CENTS.map((p) => [p.id, 0])), ...o });
await test('at the defaults every key\'s ratio is exactly 1, and A4 sounds at the pitch standard in every temperament, on every root', () => {
  for (let m = 0; m < 128; m++) assert.equal(tuningRatio(T(), m), 1);
  for (const [hz] of PITCHES) for (const t of TEMPERAMENTS) for (let r = 0; r < 12; r++) {
    near(440 * tuningRatio(T({ pitch: hz, temperament: t.id, tuningRoot: r, cents3: 17 }), 69), hz, 1e-9, `${hz} ${t.id} ${r}`);
  }
});
await test('the root moves the temperament: ¼-comma meantone on D makes F♯–A♯ pure, which on C is a diminished fourth 41 ¢ wide; just on G makes G–B–D pure', () => {
  const third = (P, m) => cents(tuningRatio(P, m + 4) / tuningRatio(P, m)) + 400;
  near(third(T({ temperament: 'meantone', tuningRoot: 2 }), 66), PURE_THIRD, 1e-9, 'F♯–A♯ on D');
  near(third(T({ temperament: 'meantone', tuningRoot: 0 }), 66) - PURE_THIRD, 41.06, 0.01, 'F♯–B♭ on C');
  near(third(T({ temperament: 'just', tuningRoot: 7 }), 67), PURE_THIRD, 1e-9, 'G–B on G');
});
await test('the pitch standard scales every key alike: at 415 Hz each key is 101.27 ¢ below 440, about a semitone', () => {
  for (let m = 21; m <= 108; m++) near(cents(tuningRatio(T({ pitch: 415 }), m)), -101.27, 0.005, `${m}`);
});
await test('custom: each note above the root its own cents from equal temperament, A brought back to the pitch standard; between keys, the cents in between', () => {
  const P = T({ temperament: 'custom', cents4: 40, cents9: 10 });
  const c = tuningCents(P);
  near(c[4], 30, 1e-9, 'E'); near(c[9], 0, 1e-9, 'A'); near(c[0], -10, 1e-9, 'C');
  near(cents(tuningRatio(P, 64.5)), 10, 1e-9, 'half way from E (+30) to F (−10)');
});

console.log('Scala files');
const SCL = new URL('../native/tests/tuning/', import.meta.url);
const scl = (f) => readFileSync(new URL(f, SCL), 'utf8');
await test('Werckmeister III and ¼-comma meantone as Scala files (ratios, cents, comments) give the temperaments\' own cents', () => {
  for (const [file, id] of [['werckmeister3.scl', 'werckmeister'], ['meantone.scl', 'meantone']]) {
    const s = readScala(scl(file)), c = temperamentCents(id);
    assert.equal(s.notes, 12);
    s.cents.forEach((v, i) => near(v, c[i + 1] - 100 * (i + 1), 0.0051, `${file} ${i + 1}`));
  }
  assert.equal(readScala(scl('werckmeister3.scl')).name, 'Werckmeister III (1691)');
  const v = scalaValues(readScala(scl('meantone.scl')));
  assert.equal(v.temperament, 'custom');
  const P = T(v), Q = T({ temperament: 'meantone' });
  for (let m = 60; m < 72; m++) near(cents(tuningRatio(P, m)), cents(tuningRatio(Q, m)), 0.01, `meantone file, key ${m}`);
});
await test('a scale Forte cannot play says why: not twelve notes, not repeating at the octave, a note too far, not a Scala file', () => {
  assert.throws(() => readScala(scl('19-edo.scl')), /19 notes/);
  assert.throws(() => readScala(scl('stretched.scl')), /not at the octave/);
  assert.throws(() => readScala('! far\nfar\n12\n210.0\n200.0\n300.0\n400.0\n500.0\n600.0\n700.0\n800.0\n900.0\n1000.0\n1100.0\n2/1\n'), /lies 110\.0 cents/);
  assert.throws(() => readScala('{"forte": "presets"}'), /not a Scala file/);
  assert.throws(() => readScala('x\n12\n1.5.5\n'), /not a number of cents|says it has 12/);
});

// ---- every instrument ----------------------------------------------------------------------------------
const slugs = ['template', ...INSTRUMENTS.filter((i) => i.ready).map((i) => i.id)].filter((s) => !only.length || only.includes(s));
const FS = 48000;

// A key held for `sec` seconds, the engine's own output (no chain); its magnitude spectrum after the attack
function spectrum(I, Engine, P, key, sec = 1.4) {
  const pl = new Player(I, Engine, FS, P);
  const [L, R] = pl.render(sec, [[0, 'on', key, 0.7]]);
  const N = 1 << 17, re = new Float64Array(N), im = new Float64Array(N), a = Math.round(0.15 * FS), n = L.length - a;
  for (let i = 0; i < n; i++) re[i] = (L[a + i] + R[a + i]) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  fft(re, im, false);
  const mag = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) mag[k] = Math.sqrt(Math.hypot(re[k], im[k]));
  return { mag, df: FS / N, energy: L.reduce((s, x) => s + x * x, 0) };
}
// How far b's spectrum lies from a's, in cents: the stretch of the frequency axis that lines them up best
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

// Instruments whose spectrum does not stretch with the pitch, so shift() cannot measure them; their own
// suites (test/<slug>-tests.mjs) measure the tuned pitch directly.
const OWN = {
  bubbles: 'a stream of bubbles of scattered sizes, released at seeded times',
  stars: 'each key\'s star is solved for its pitch, so its large separation moves about 80 ¢ a semitone',
  quantum: 'the tempo lock keeps the revival time, which spaces the comb, on the beat',
  blackhole: 'at the default spin a note rings for a few milliseconds, all over before the spectrum starts',
};

console.log('the instruments');
for (const slug of slugs) {
  const I = await loadInstrument(slug), Engine = await loadEngine(I), D = defaultsOf(I);
  await test(`${slug}: the tuning parameters (in the descriptor, kept across presets), and the C++ makes of them what shared/tuning.js does`, () => {
    for (const p of TUNING_PARAMS) {
      const q = I.groups.flatMap((g) => g.params).find((x) => x.id === p.id);
      assert.ok(q, `${p.id} is missing`);
      assert.deepEqual({ ...q, hint: 0, showIf: 0, fmt: 0 }, { ...p, hint: 0, showIf: 0, fmt: 0 }, `${p.id} is the shared one`);
      assert.ok(I.keep.includes(p.id), `${p.id} is kept across presets`);
    }
    const e = new Engine(FS);
    for (const P of [D, { ...D, pitch: 415, temperament: 'kirnberger', tuningRoot: 5 }, { ...D, temperament: 'custom', cents2: -12.5, cents7: 33, tuningRoot: 11, pitch: 466 }]) {
      e.setParams(P);
      const c = e.tuningCents(), js = tuningCents(P);
      c.forEach((v, i) => near(v, js[i], 1e-9, `pitch class ${i}`));
    }
  });
  // a key within every instrument's compass that A4's normalisation leaves room to move: E4
  const [lo, hi] = I.compass?.keys ?? I.range ?? [36, 96];
  let key = Math.min(hi, Math.max(lo, 64));
  if (key % 12 === 0 || key % 12 === 9) key++; // (not the root, nor A, which the tuning puts back at the pitch standard)
  const pc = key % 12;
  const base = spectrum(I, Engine, D, key);
  await test(`${slug}: the engine follows the tuning: at A = 415 Hz key ${key} sounds ${cents(415 / 440).toFixed(1)} ¢ lower, in a custom temperament it moves by its cents, and at the defaults it is unmoved`, () => {
    assert.ok(base.energy > 0, 'the key sounds');
    const same = spectrum(I, Engine, { ...D, temperament: 'equal', tuningRoot: 7, cents4: 30 }, key);
    for (let k = 0; k < base.mag.length; k++) if (same.mag[k] !== base.mag[k]) throw new Error('equal temperament on another root, or custom cents unused, changed the sound');
    const custom = { ...D, temperament: 'custom', [`cents${pc}`]: 35 }; // this key's note, 35 ¢ sharp; A stays
    const low = spectrum(I, Engine, { ...D, pitch: 415 }, key), up = spectrum(I, Engine, custom, key);
    if (OWN[slug]) { // the sound changes; the instrument's own suite measures by how much
      assert.ok(low.mag.some((x, k) => x !== base.mag[k]) && up.mag.some((x, k) => x !== base.mag[k]), 'the tuning changes the sound');
      return;
    }
    near(shift(base, low, cents(415 / 440)), cents(415 / 440), 3, 'at 415 Hz');
    near(shift(base, up, 35), 35, 3, 'custom');
  });
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
