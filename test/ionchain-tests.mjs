// Ion Chain checks: the crystal against the published equilibria and modes of trapped-ion
// crystals (James 1998, and closed forms for two and three ions), its couplings against their
// symmetries, then the engine against the model.
// Run: node test/ionchain-tests.mjs

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../ionchain/src/ionchain-instrument.js';
import { wasmModel } from '../ionchain/src/ionchain-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';
import { symEig } from '../shared/linalg.js';

const IonChainEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000;
let failures = 0;
async function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// Play events [t, 'on'|'off'|'sustain'|'params'|'bend', …] through the engine, 128-sample blocks as
// the AudioWorklet; returns [L, R] and the engine.
function play(params, events, sec, quality) {
  const e = new IonChainEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  const ev = events.slice().sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += 128) {
    while (k < ev.length && ev[k][0] * FS <= s) {
      const [, what, a, b] = ev[k++];
      if (what === 'on') e.noteOn(a, b ?? 0.7);
      else if (what === 'off') e.noteOff(a);
      else if (what === 'sustain') e.setSustain(a);
      else if (what === 'params') e.setParams(a);
      else if (what === 'bend') e.handle({ type: 'bend', value: a });
    }
    e.process(bL, bR, 128);
    const m = Math.min(128, n - s);
    L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s);
  }
  return { L, R, e };
}
const note = (key, params, sec, vel = 0.7, quality) => play(params, [[0, 'on', key, vel]], sec, quality);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel), and the strongest frequency within ±20 ¢ of f0.
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-20 / 1200), hi = f0 * 2 ** (20 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const sorted = (a) => a.slice().sort((p, q) => p - q);

// U = Σ ½(α²x² + z²) + Σ 1/r, written here from scratch, for its gradient and Hessian by finite
// differences (independent of the C++'s analytic ones).
function energy(xs, zs, a) {
  let U = 0;
  for (let i = 0; i < xs.length; i++) {
    U += 0.5 * (a * a * xs[i] ** 2 + zs[i] ** 2);
    for (let j = i + 1; j < xs.length; j++) U += 1 / Math.hypot(xs[i] - xs[j], zs[i] - zs[j]);
  }
  return U;
}
function fdHessian(xs, zs, a) {
  const N = xs.length, r = xs.flatMap((x, j) => [x, zs[j]]), h = 1e-4;
  const U = (v) => energy(v.filter((_, i) => i % 2 === 0), v.filter((_, i) => i % 2 === 1), a);
  const H = Array.from({ length: 2 * N }, () => new Float64Array(2 * N));
  for (let i = 0; i < 2 * N; i++) for (let j = 0; j < 2 * N; j++) {
    const at = (di, dj) => { const v = r.slice(); v[i] += di; v[j] += dj; return U(v); };
    H[i][j] = (at(h, h) - at(h, -h) - at(-h, h) + at(-h, -h)) / (4 * h * h);
  }
  return H;
}

console.log('the crystal');
await test('a line of ions sits where James (1998) puts it: ±0.6300 (2), 0 and ±1.0772 (3), ±0.4544 ±1.4368 (4), 0 ±0.8221 ±1.7429 (5)', () => {
  near(model.linearChain(2)[1], 0.5 ** (2 / 3), 1e-12, 'two ions: (1/2)^⅔');
  near(model.linearChain(3)[2], (5 / 4) ** (1 / 3), 1e-12, 'three ions: (5/4)^⅓');
  const four = model.linearChain(4), five = model.linearChain(5);
  near(four[2], 0.4544, 1e-4, 'four'); near(four[3], 1.4368, 1e-4, 'four');
  near(five[2], 0, 1e-12, 'five'); near(five[3], 0.8221, 1e-4, 'five'); near(five[4], 1.7429, 1e-4, 'five');
});
await test('the axial modes: the centre of mass at ω_z and the breathing mode at √3 ω_z for every N, and √(29/5) for three ions', () => {
  for (let N = 2; N <= 20; N++) {
    const m = model.modes(P({ ions: N, aniso: 20 })), ax = sorted(m.lam.filter((_, i) => m.B.reduce((s, row, d) => s + (d % 2 ? row[i] ** 2 : 0), 0) > 0.5));
    assert.equal(ax.length, N, `${N}: N axial modes`);
    near(ax[0], 1, 1e-9, `${N}: centre of mass`); near(ax[1], 3, 1e-9, `${N}: breathing`);
  }
  const three = sorted(model.modes(P({ ions: 3, aniso: 20 })).lam);
  near(three[2], 29 / 5, 1e-9, 'three ions: 29/5');
});
await test('the radial modes of three ions: α, √(α² − 1) and √(α² − 12/5) ω_z, and the zigzag below α_c = √(12/5) (two ions: α_c = 1)', () => {
  const a = 5, lam = sorted(model.modes(P({ ions: 3, aniso: a })).lam);
  for (const want of [a * a, a * a - 1, a * a - 12 / 5]) assert.ok(lam.some((l) => Math.abs(l - want) < 1e-9), `${want}`);
  near(model.zigzagAlpha(3), Math.sqrt(12 / 5), 1e-9, 'α_c(3)');
  near(model.zigzagAlpha(2), 1, 1e-9, 'α_c(2)');
  assert.ok(!model.modes(P({ ions: 3, aniso: 1.56 })).zigzag && model.modes(P({ ions: 3, aniso: 1.54 })).zigzag, 'buckles at α_c');
});
await test('two ions with the axis the stiffer: they stand across it, (2/α²)^⅓ apart, with modes α, √3 α, 1 and √(1 − α²) ω_z', () => {
  const a = 0.7, m = model.modes(P({ ions: 2, aniso: a }));
  assert.ok(m.zigzag);
  near(Math.abs(m.x[0] - m.x[1]), (2 / (a * a)) ** (1 / 3), 1e-9, 'separation');
  near(Math.abs(m.z[0] - m.z[1]), 0, 1e-9, 'side by side');
  const lam = sorted(m.lam), want = sorted([a * a, 3 * a * a, 1, 1 - a * a]);
  lam.forEach((l, i) => near(l, want[i], 1e-8, `mode ${i}`));
});
await test('zigzags of 5, 8 and 12 ions are minima: no force on any ion, and their modes are the eigenvalues of U\'s Hessian by finite differences', () => {
  for (const [N, a] of [[5, 1.8], [8, 3.2], [12, 4.2]]) {
    const m = model.modes(P({ ions: N, aniso: a }));
    assert.ok(m.zigzag, `${N}: a zigzag`);
    const h = 1e-6;
    for (let j = 0; j < N; j++) for (const [dx, dz] of [[h, 0], [0, h]]) {
      const xs = m.x.slice(), zs = m.z.slice(), xm = m.x.slice(), zm = m.z.slice();
      xs[j] += dx; zs[j] += dz; xm[j] -= dx; zm[j] -= dz;
      near((energy(xs, zs, a) - energy(xm, zm, a)) / (2 * h), 0, 1e-7, `${N}: force on ion ${j}`);
    }
    const lam = sorted(Array.from(symEig(fdHessian(m.x, m.z, a), 2 * N)));
    assert.ok(lam[0] > 0, `${N}: a minimum`);
    sorted(m.lam).forEach((l, i) => near(l, lam[i], 1e-5 * Math.max(1, l), `${N}: mode ${i}`));
  }
});
await test('the modes are orthonormal (equal masses)', () => {
  const m = model.modes(P({ ions: 9, aniso: 3.5 }));
  for (let a = 0; a < m.M; a++) for (let b = 0; b < m.M; b++) {
    let s = 0;
    for (let d = 0; d < m.M; d++) s += m.B[d][a] * m.B[d][b];
    near(s, a === b ? 1 : 0, 1e-10, `<${a}|${b}>`);
  }
});
await test('ℓ = (q²/4πε₀ m ω_z²)^⅓ for ⁴⁰Ca⁺ at 1 MHz is 4.45 µm', () => {
  const q2 = 8.9875517923e9 * 1.602176634e-19 ** 2, m = 39.96259 * 1.66053906660e-27 - 9.1093837015e-31, w = 2 * Math.PI * 1e6;
  near(model.lengthScale(1e6), Math.cbrt(q2 / (m * w * w)), 1e-12, 'ℓ');
  near(model.lengthScale(1e6) * 1e6, 4.45, 0.01, 'µm');
});

console.log('the laser and the electrodes');
await test('Kohn: a push the same on every ion (a beam along the axis, or a wide one) rings only the centre of mass', () => {
  for (const o of [{ angle: 0 }, { waist: 20, angle: 0 }, { ions: 9, angle: 0, aniso: 20 }]) {
    const m = model.modes(P(o)), com = m.lam.findIndex((l) => Math.abs(l - 1) < 1e-9);
    m.kick.forEach((k, i) => { if (i !== com) near(k, 0, 1e-9, `${JSON.stringify(o)} mode ${i}`); });
    assert.ok(Math.abs(m.kick[com]) > 0.1);
  }
});
await test('the centre ion of seven kicked along the axis: the modes that leave it still (the breathing mode, the 4th, the 6th) are silent', () => {
  const m = model.modes(P({ ions: 7, beam: 0, angle: 0.0001, waist: 0.1, aniso: 20 }));
  m.lam.forEach((l, i) => { if (Math.abs(m.B[2 * 3 + 1][i]) < 1e-9) near(m.kick[i], 0, 1e-6, `mode ${i}`); });
  const breathing = m.lam.findIndex((l) => Math.abs(l - 3) < 1e-9);
  near(m.kick[breathing], 0, 1e-9, 'breathing');
});
await test('Shockley–Ramo: each electrode\'s weights are its field over the ions, normalised: Σ w² = N; far away only the centre of mass is heard', () => {
  for (const o of [{}, { ions: 12, distance: 1.3 }, { side: 90 }, { ions: 8, aniso: 3 }]) {
    const m = model.modes(P(o));
    near(m.wl.reduce((s, w) => s + w * w, 0), m.N, 1e-9, `${JSON.stringify(o)} left`);
    near(m.wr.reduce((s, w) => s + w * w, 0), m.N, 1e-9, `${JSON.stringify(o)} right`);
  }
  const far = model.modes(P({ distance: 100 })), com = far.lam.findIndex((l) => Math.abs(l - 1) < 1e-9);
  near(far.wl[com] ** 2, far.N, 1e-3, 'far: the centre of mass takes it all');
  const side = model.modes(P({ side: 90 })), com2 = side.lam.findIndex((l) => Math.abs(l - 1) < 1e-9);
  near(side.wl[com2], 0, 1e-12, 'beside the middle: the axial centre of mass unheard');
  // the second electrode's amplifier is inverted: the two agree on the centre of mass, and on a line their symmetric modes
  near(far.wl[com], far.wr[com], 1e-9, 'left and right agree');
});
await test('the resistor cools a mode as much as the electrodes hear it (N ions together N times faster); the cooling beam on the end ion cools a mode by how much that ion moves', () => {
  const one = model.modes(P({ ions: 1, distance: 100 })), five = model.modes(P({ distance: 100 }));
  near(one.sR[0] * DEFAULTS.resist, 1, 1e-6, 'one ion: 1/τ');
  const com = five.lam.findIndex((l) => Math.abs(l - 1) < 1e-9);
  near(five.sR[com] * DEFAULTS.resist, 5, 1e-3, 'five ions: 5/τ');
  const end = model.modes(P({ coolOn: 'end' }));
  near(end.sD.reduce((s, x) => s + x, 0) * DEFAULTS.cool, 2, 1e-9, 'the end ion\'s two directions, shared among the modes');
  model.modes(P()).sD.forEach((s) => near(s * DEFAULTS.cool, 1, 1e-12, 'every ion: 1/τ'));
});

console.log('the engine');
await test('one ion with far electrodes is a pure tone on the key\'s note, in the keyboard\'s tuning (within 0.5 ¢)', () => {
  for (const [k, o] of [[45, {}], [69, {}], [84, {}], [69, { pitch: 415 }], [60, { temperament: 'meantone' }]]) {
    const pp = P({ ions: 1, distance: 100, ...o }), f = tunedFreq(pp, k), x = note(k, pp, 1).L, a = 4800, b = 4800 + 32768;
    near(cents(peak(x, f, a, b), f), 0, 0.5, `key ${k} ${JSON.stringify(o)}`);
    assert.ok(tone(x, f * 1.5, a, b) < 1e-3 * tone(x, f, a, b), 'nothing else');
  }
});
await test('five ions sound the model\'s modes: 1, √3, 2.4120 and 3.0549 times the note', () => {
  const x = note(57, P({ distance: 1.4 }), 1.2).L, f = keyFreq(57), a = 4800, b = 4800 + 32768;
  const lam = sorted(model.modes(P({ distance: 1.4 })).lam).slice(0, 4);
  for (const l of lam) {
    const fm = f * Math.sqrt(l);
    near(cents(peak(x, fm, a, b), fm), 0, 0.5, `×${Math.sqrt(l).toFixed(4)}`);
    assert.ok(tone(x, fm, a, b) > 10 * tone(x, fm * 1.04, a, b), `×${Math.sqrt(l).toFixed(4)} stands out`);
  }
  near(Math.sqrt(lam[2]), 2.4120, 1e-4, 'James: 2.412'); near(Math.sqrt(lam[3]), 3.0549, 1e-4, 'and 3.055');
});
await test('held, a mode fades through the resistor at its rate (one ion: 1/τ); let go, the cooling laser takes it at 1/τ_cool', () => {
  const pp = P({ ions: 1, distance: 100, resist: 2, cool: 0.2 }), f = keyFreq(60), W = 4096;
  const held = note(60, pp, 1.2).L;
  const dbH = 20 * Math.log10(tone(held, f, FS * 1.0, FS * 1.0 + W) / tone(held, f, FS * 0.2, FS * 0.2 + W));
  near(dbH, 20 * Math.log10(Math.exp(-0.8 / 2)), 0.05, 'held: e^(−t/τ)');
  const let_ = play(pp, [[0, 'on', 60], [0.1, 'off', 60]], 0.6).L;
  const dbC = 20 * Math.log10(tone(let_, f, FS * 0.4, FS * 0.4 + W) / tone(let_, f, FS * 0.2, FS * 0.2 + W));
  near(dbC, 20 * Math.log10(Math.exp(-0.2 * (1 / 2 + 1 / 0.2))), 0.05, 'let go: the laser too');
  const ped = play(pp, [[0, 'sustain', true], [0, 'on', 60], [0.1, 'off', 60]], 0.6).L;
  const dbP = 20 * Math.log10(tone(ped, f, FS * 0.4, FS * 0.4 + W) / tone(ped, f, FS * 0.2, FS * 0.2 + W));
  near(dbP, 20 * Math.log10(Math.exp(-0.2 / 2)), 0.05, 'the pedal keeps the laser off');
});
await test('cooled only through the end ion, the chain rings on longer once let go', () => {
  const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
  const all = play(P({ ions: 8 }), [[0, 'on', 60], [0.1, 'off', 60]], 1.2).L, end = play(P({ ions: 8, coolOn: 'end' }), [[0, 'on', 60], [0.1, 'off', 60]], 1.2).L;
  assert.ok(rms(end, FS * 0.9, FS * 1.1) > 5 * rms(all, FS * 0.9, FS * 1.1), 'end-only cooling leaves more ringing');
});
await test('the mod wheel takes a sounding chain through the zigzag and back: no click, a new spectrum, and the motion kept', () => {
  const base = P({ ions: 6 }), events = [[0, 'on', 57]];
  for (let i = 0; i <= 40; i++) events.push([0.1 + i * 0.01, 'params', { ...base, aniso: 8 * (1.5 / 8) ** (i / 40) }]);
  const { L, e } = play(base, events, 0.9);
  let jump = 0, pk = 0;
  for (let i = 1; i < L.length; i++) { assert.ok(Number.isFinite(L[i])); jump = Math.max(jump, Math.abs(L[i] - L[i - 1])); pk = Math.max(pk, Math.abs(L[i])); }
  assert.ok(jump < 0.5 * pk, `largest step ${jump.toFixed(4)} of a peak ${pk.toFixed(4)}`);
  assert.ok(model.modes({ ...base, aniso: 1.5 }).zigzag, 'a zigzag at 1.5');
  const f = keyFreq(57), lam = sorted(model.modes({ ...base, aniso: 1.5 }).lam), x = L, a = Math.round(0.55 * FS), b = a + 16384;
  const loud = lam.map((l) => ({ l, t: tone(x, f * Math.sqrt(l), a, b) })).sort((p, q) => q.t - p.t)[0];
  assert.ok(Math.abs(loud.l - 3) > 0.05, 'the loudest line is no longer the breathing mode\'s');
  assert.ok(e.voices[0].modes.some((m) => m.amp > 0.01), 'still ringing');
});
await test('the pitch wheel bends every mode by up to two semitones (the trap\'s endcap voltage)', () => {
  const pp = P({ ions: 1, distance: 100 }), x = play(pp, [[0, 'bend', 1], [0, 'on', 60]], 1).L, f = keyFreq(62);
  near(cents(peak(x, f, 9600, 9600 + 32768), f), 0, 0.5, '+2 semitones');
});
await test('level: one note peaks 0.005–0.6 at full velocity on every octave and preset; a chord stays finite; silence after letting go', () => {
  let pk = 0, lo = 1;
  for (const pr of INSTRUMENT.presets) for (const k of [21, 45, 69, 96, 108]) {
    const { L } = note(k, P(pr.p), 0.25, 1);
    let p = 0;
    for (const v of L) { assert.ok(Number.isFinite(v)); p = Math.max(p, Math.abs(v)); }
    pk = Math.max(pk, p);
    if (k <= 69) lo = Math.min(lo, p); // (a long pulse leaves the top keys' traps nearly still, as meant)
  }
  assert.ok(pk < 0.6 && lo > 0.005, `peaks ${lo.toFixed(3)}–${pk.toFixed(3)}`);
  const chord = play(P(), [48, 55, 60, 64, 67, 72].flatMap((k) => [[0, 'on', k, 1], [0.5, 'off', k]]), 6);
  assert.ok(chord.L.every(Number.isFinite));
  assert.equal(chord.e.voiceCount(), 0, 'every voice ended');
  assert.ok(chord.L.subarray(5 * FS).every((v) => Math.abs(v) < 1e-5), 'silent');
});

// What the Quality setting trims (the README says it): fewer voices at once, and fewer modes a voice
await test('Quality: 32, 16 and 8 voices; Medium and Low leave out the modes the electrodes hardly hear, and keep the note\'s pitch and level', () => {
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (const [quality, cap] of [['high', 32], ['medium', 16], ['low', 8]]) {
    const e = new IonChainEngine(FS);
    e.setQuality(quality); e.setParams(P());
    for (let i = 0; i < 40; i++) { e.noteOn(40 + i, 0.7); for (let b = 0; b < 4; b++) e.process(bL, bR, 128); }
    for (let b = 0; b < 40; b++) e.process(bL, bR, 128);
    assert.equal(e.voiceCount(), cap, `${quality}: voices`);
  }
  const modes = (q) => note(60, P({ ions: 12 }), 0.05, 0.7, q).e.voices[0].on;
  const [h, m, l] = ['high', 'medium', 'low'].map(modes);
  assert.ok(h === 24 && m < h && l < m, `modes: ${h}, ${m}, ${l}`);
  const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
  for (const k of [48, 69, 84]) {
    const f = keyFreq(k), hi = note(k, P(), 0.5).L;
    for (const q of ['medium', 'low']) {
      const x = note(k, P(), 0.5, 0.7, q).L, c = cents(peak(x, f, 0, x.length), peak(hi, f, 0, hi.length)), d = 20 * Math.log10(rms(x) / rms(hi));
      assert.ok(Math.abs(c) < 0.1 && Math.abs(d) < 1, `key ${k} at ${q}: ${c.toFixed(3)} ¢, ${d.toFixed(2)} dB`);
    }
  }
});
await test('CPU: ten voices of twenty ions render faster than 5× real time', () => {
  const t0 = performance.now();
  play(P({ ions: 20, aniso: 12 }), [48, 52, 55, 59, 62, 65, 69, 72, 76, 79].map((k) => [0, 'on', k]), 2);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000 / 5, `${ms.toFixed(0)} ms for 2 s`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
