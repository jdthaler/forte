// Hydrogen Lamp checks. Run: node test/hydrogen-tests.mjs
//
// The atom against what is known independently (NIST's wavelengths and transition probabilities,
// the oscillator strengths, Storey & Hummer's recombination coefficients and Balmer decrement,
// the Dirac fine structure, Inglis–Teller), the cascade against its exact solutions, then the
// engine against the model. Both are the C++ (native/instruments/hydrogen), built as
// WebAssembly: the model's functions through hydrogen-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../hydrogen/src/hydrogen-instrument.js';
import { wasmModel } from '../hydrogen/src/hydrogen-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';
import * as table from '../tools/hydrogen-native-table.mjs';

const HydrogenEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });

// Render one note through the engine, 128-sample blocks like the AudioWorklet, at a Quality
// ('high', 'medium' or 'low'; High unless given), released at `off` seconds if given.
function render(key, params, vel, sec, quality, off) {
  const e = new HydrogenEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) {
    if (off !== undefined && s === Math.round((off * FS) / bl) * bl) e.noteOff(key);
    e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return Object.assign(L, { engine: e });
}
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±20 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-20 / 1200), hi = f0 * 2 ** (20 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
// A line's centre: the power-weighted mean frequency within ±hw Hz of f0 in x[a, b), however
// wide the line and however its strength wanders.
function centre(x, f0, hw, a, b) {
  const T = (b - a) / FS; let s = 0, sf = 0;
  for (let f = f0 - hw; f <= f0 + hw; f += 0.5 / T) { const p = tone(x, f, a, b) ** 2; s += p; sf += p * f; }
  return sf / s;
}
// A line's power: the spectrum's within ±hw Hz of f, summed over bins 1/T apart (Parseval).
function band(x, f, hw, a, b) {
  const T = (b - a) / FS; let s = 0;
  for (let g = f - hw; g <= f + hw; g += 1 / T) s += tone(x, g, a, b) ** 2;
  return s;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const near = (got, want, tol, what) => assert.ok(Math.abs(got / want - 1) < tol, `${what}: ${got.toPrecision(6)}, want ${want.toPrecision(6)} (±${100 * tol} %)`);
const nebula = (o = {}) => P({ excitation: 'recombination', temperature: 10000, caseB: true, density: 100, ...o });
const balmer = (L, n) => L[model.lineOf(n, 2)];

console.log('the atom');
test('wavelengths: the Rydberg formula with the reduced mass, against NIST (vacuum, nm)', () => {
  // NIST ASD, the lines' centroids; the fine structure and the Lamb shift move them by < 0.005 nm
  for (const [n, m, nm] of [[2, 1, 121.5668], [3, 1, 102.5722], [3, 2, 656.4614], [4, 2, 486.2721], [5, 2, 434.1692], [4, 3, 1875.613], [5, 4, 4052.27]]) {
    assert.ok(Math.abs(model.wavelength(n, m) - nm) < 4e-5 * nm, `${n}→${m}: ${model.wavelength(n, m).toFixed(4)} nm, NIST ${nm}`);
  }
  assert.ok(Math.abs(model.ratio(4, 2) - 27 / 20) < 1e-15 && Math.abs(model.ratio(2, 1) - 5.4) < 1e-14, 'Hβ is 27/20 of Hα, Lyα 27/5');
});
test('Einstein A coefficients from the exact radial integrals, against NIST (s⁻¹)', () => {
  // NIST ASD (Wiese & Fuhr 2009), nl → n′l′
  for (const [n, l, m, k, A] of [[2, 1, 1, 0, 6.2649e8], [3, 1, 1, 0, 1.6725e8], [3, 0, 2, 1, 6.3143e6], [3, 1, 2, 0, 2.2449e7], [3, 2, 2, 1, 6.4651e7],
    [4, 1, 1, 0, 6.8186e7]]) {
    near(model.einsteinA(n, l, m, k), A, 2e-4, `A(${n}${'spdfg'[l]} → ${m}${'spdfg'[k]})`);
  }
  // the radial integral ⟨1s|r|2p⟩ = 128√6/243 a₀, exactly
  assert.ok(Math.abs(Math.abs(model.radial(2, 1, 1, 0)) - (128 * Math.sqrt(6)) / 243) < 1e-12);
});
test('the radial integrals up to n = 50, against the wavefunctions integrated on a fine grid', () => {
  // R_nl(r) = N (2r/n)^l e^(−r/n) L_(n−l−1)^(2l+1)(2r/n), in logs (n = 50 overflows otherwise)
  const lfact = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
  const R = (n, l, r) => {
    const x = (2 * r) / n, a = 2 * l + 1, d = n - l - 1;
    let L0 = 1, L1 = 1 + a - x; // the generalised Laguerre polynomials' recurrence
    if (d === 0) L1 = 1;
    for (let i = 1; i < d; i++) { const L2 = ((2 * i + 1 + a - x) * L1 - (i + a) * L0) / (i + 1); L0 = L1; L1 = L2; }
    if (L1 === 0) return 0;
    const logN = 0.5 * (3 * Math.log(2 / n) + lfact(d) - Math.log(2 * n) - lfact(n + l));
    return Math.sign(L1) * Math.exp(logN + l * Math.log(x) - x / 2 + Math.log(Math.abs(L1)));
  };
  for (const [n, l, m, k] of [[4, 3, 3, 2], [5, 2, 3, 1], [6, 1, 2, 0], [12, 5, 7, 4], [30, 1, 29, 0], [40, 39, 39, 38], [50, 10, 3, 2]]) {
    const top = 4 * n * n + 60, h = top / 200000;
    let s = 0;
    for (let i = 1; i < 200000; i++) { const r = i * h; s += (i % 2 ? 4 : 2) * R(n, l, r) * R(m, k, r) * r ** 3; }
    s *= h / 3;
    near(Math.abs(model.radial(n, l, m, k)), Math.abs(s), 1e-6, `⟨${m}${k}|r|${n}${l}⟩`);
  }
});
test('lifetimes: 2p 1.596 ns, 3s 158 ns, 3p 5.27 ns, 3d 15.5 ns; 2s lives 0.12 s on two photons', () => {
  for (const [n, l, tau] of [[2, 1, 1.5961e-9], [3, 0, 1.5837e-7], [3, 1, 5.2747e-9], [3, 2, 1.5468e-8], [2, 0, 1 / 8.2291]]) near(1 / model.gamma(n, l), tau, 1e-3, `τ(${n}${'spd'[l]})`);
  assert.ok(model.gamma(2, 1, true) === 0, 'Case B: 2p does not decay (its Lyman line is absorbed again)');
});
test('oscillator strengths from 1s: 0.4162, 0.07910, 0.02899, and the Lyman series sums to below 1 (the rest is the continuum)', () => {
  near(model.oscillator1s(2), 0.41620, 1e-4, 'f(1s → 2p)');
  near(model.oscillator1s(3), 0.079102, 1e-4, 'f(1s → 3p)');
  near(model.oscillator1s(4), 0.028991, 1e-4, 'f(1s → 4p)');
  let s = 0;
  for (let n = 2; n <= model.NMAX; n++) s += model.oscillator1s(n);
  assert.ok(s > 0.55 && s < 0.565, `Σf = ${s.toFixed(4)} (0.5641 to n = ∞; the continuum's 0.4359 makes 1)`);
});

test('the recombination table is tools/hydrogen-native-table.mjs\'s: σ(1s) at threshold 2⁹π²α a₀²/3e⁴, and its n ≤ 3 entries recomputed', () => {
  const s = table.crossSections(3);
  near(table.thresholdCm2(s.get('1,0')), ((2 ** 9 * Math.PI ** 2) / (3 * Math.E ** 4)) * 7.2973525693e-3 * 0.529177210903e-8 ** 2, 1e-3, 'σ(1s) (cm²)');
  for (let i = 0; i < table.TEMPS; i++) {
    const T = table.temperature(i);
    for (let n = 1; n <= 3; n++) for (let l = 0; l < n; l++) near(model.recombination(n, l, T), table.recombination(s.get(`${n},${l}`), n, l, T), 1e-4, `α(${n}${'spd'[l]}, ${T.toFixed(0)} K)`);
  }
});

console.log('the glow');
test('recombination at 10⁴ K: α(1s) 1.58, Case A 4.18, Case B 2.59 × 10⁻¹³ cm³ s⁻¹ (Storey & Hummer)', () => {
  near(model.recombination(1, 0, 1e4), 1.58e-13, 0.02, 'α(1s)');
  let A = 0;
  for (let n = 1; n <= model.NMAX; n++) for (let l = 0; l < n; l++) A += model.recombination(n, l, 1e4);
  near(A, 4.18e-13, 0.03, 'α_A (to n = 50)');
  near(A - model.recombination(1, 0, 1e4), 2.59e-13, 0.03, 'α_B');
  // and their fall with temperature: α_B 4.54 at 5000 K and 1.43 at 20 000 K
  for (const [T, B] of [[5000, 4.54e-13], [20000, 1.43e-13]]) {
    let s = 0;
    for (let n = 2; n <= model.NMAX; n++) for (let l = 0; l < n; l++) s += model.recombination(n, l, T);
    near(s, B, 0.04, `α_B at ${T} K`);
  }
});
test('a nebula\'s Balmer decrement (Case B, 10⁴ K): Hα/Hβ 2.86, Hγ/Hβ 0.468, Hδ/Hβ 0.259 (Storey & Hummer)', () => {
  // a nebula's atoms never leave it (the lamp's time in the glow, endless); the atom is cut at
  // n = 50, which drops the cascade from above it: 1 % low on Hα/Hβ
  const L = model.steadyLines(nebula({ glow: 1e12 })), b = balmer(L, 4);
  near(balmer(L, 3) / b, 2.86, 0.02, 'Hα/Hβ');
  near(balmer(L, 5) / b, 0.468, 0.02, 'Hγ/Hβ');
  near(balmer(L, 6) / b, 0.259, 0.02, 'Hδ/Hβ');
  assert.equal(L[model.lineOf(2, 1)], 0, 'Case B: no Lyman α');
  const A = model.steadyLines(nebula({ glow: 1e12, caseB: false }));
  assert.ok(A[model.lineOf(2, 1)] > balmer(A, 3), 'Case A: Lyman α, the brightest');
});
test('a discharge lights the low levels most: Hα outshines Hβ more than in a nebula; hotter, the decrement flattens', () => {
  const cool = model.steadyLines(P({ temperature: 5000 })), hot = model.steadyLines(P({ temperature: 100000 }));
  const dCool = balmer(cool, 3) / balmer(cool, 4), dHot = balmer(hot, 3) / balmer(hot, 4);
  assert.ok(dCool > 3 && dHot < dCool, `Hα/Hβ ${dCool.toFixed(2)} at 5000 K, ${dHot.toFixed(2)} at 10⁵ K`);
});
test('a laser to 3p: the light is Lyβ and Hα, in the ratio of their A × energy; 3s and 3d stay dark', () => {
  const L = model.steadyLines(P({ excitation: 'laser', laserLevel: 3, window: 'all' }));
  const want = (model.einsteinA(3, 1, 1, 0) * model.ratio(3, 1)) / (model.einsteinA(3, 1, 2, 0) * model.ratio(3, 2));
  near(L[model.lineOf(3, 1)] / L[model.lineOf(3, 2)], want, 1e-9, 'Lyβ/Hα');
  const N = model.steadyPopulations(P({ excitation: 'laser', laserLevel: 3 }));
  assert.ok(N[model.stateOf(3, 0)] === 0 && N[model.stateOf(3, 2)] === 0, '3s, 3d');
});
test('the step response: a level fed only by the pump fills as 1 − e^(−Γt); the cascade lights the lower lines later', () => {
  // Γ: the level's decay and its drain from the glow
  const Q = P({ excitation: 'laser', laserLevel: 3, window: 'all' }), G = model.gamma(3, 1) + 1e9 / Q.glow;
  const ts = [0.1, 0.5, 1, 2, 4, 8].map((x) => x / G), { values, steady } = model.step(Q, 3, 1, ts);
  ts.forEach((t, i) => assert.ok(Math.abs(values[i] / steady - (1 - Math.exp(-G * t))) < 2e-3, `t = ${(G * t).toFixed(1)}/Γ: ${(values[i] / steady).toFixed(4)}`));
  // pumped at 5p: Paα (4 → 3) waits for 4 to fill from 5, Brα (5 → 4) does not
  const Q5 = P({ excitation: 'laser', laserLevel: 5, window: 'all' }), t = [0.2 / model.gamma(5, 1)];
  const br = model.step(Q5, 5, 4, t), pa = model.step(Q5, 4, 3, t);
  assert.ok(br.values[0] / br.steady > 3 * (pa.values[0] / pa.steady), `at 0.2/Γ(5p): Brα ${(br.values[0] / br.steady).toFixed(3)}, Paα ${(pa.values[0] / pa.steady).toFixed(3)} of steady`);
  // and every line ends at its steady value
  const end = model.glowEnd(P()), s = model.step(P(), 3, 2, [end]);
  near(s.values[0], s.steady, 1e-3, 'Hα at the end of the grid');
});
test('fine structure: 2p splits by 10.94 GHz (Dirac), as α²; Hα\'s components\' weights sum to 1', () => {
  // diracShift is in hartrees, with the reduced mass in it: Lyα is 3/8 of the reduced-mass hartree
  // (α² R∞ c μ / 16 (1 + 5α²/8) = 10.9435 GHz; the Lamb shifts, left out, make it 10.969)
  const MU = 1 / (1 + 1 / 1836.15267343), ghz = (s) => (model.diracShift(2, 1.5, s) - model.diracShift(2, 0.5, s)) * (model.lineHz(2, 1) / 0.375 / MU) / 1e9;
  assert.ok(Math.abs(ghz(1) - 10.9435) < 0.002, `${ghz(1).toFixed(4)} GHz`);
  near(ghz(12) / ghz(1), 144, 0.01, 'at 12 α');
  const c = model.components(P(), 3, 2);
  // seven fine-structure lines, at five frequencies: Dirac's levels depend on j alone
  assert.ok(c.length === 5, `Hα has 5 components (${c.length})`);
  near(c.reduce((s, x) => s + x.weight, 0), 1, 1e-9, 'Σ weights');
  assert.ok(Math.abs(model.sixj(2, 1, 1, 1, 2, 0) - 1 / Math.sqrt(6)) < 1e-12, '{1 ½ ½; ½ 1 0} = 1/√6');
});
test('Stark broadening: Hβ 4.8 nm wide at 10¹⁷ cm⁻³ (Gigosos et al.), as N^(2/3); the Balmer lines merge where Inglis and Teller say', () => {
  const w = (n, m, N) => model.starkWidth(n, m, N) * model.wavelength(n, m);
  near(w(4, 2, 1e17), 4.8, 0.05, 'Hβ FWHM (nm)');
  near(w(4, 2, 1e16) / w(4, 2, 1e17), 10 ** (-2 / 3), 1e-9, 'N^(2/3)');
  // Inglis–Teller (ions and electrons): log N = 23.26 − 7.5 log n_max; there a line's width is
  // about the gap to the next
  for (const N of [1e13, 1e15, 1e17]) {
    const nmax = 10 ** ((23.26 - Math.log10(N)) / 7.5), n = Math.round(nmax);
    const gap = model.wavelength(n, 2) - model.wavelength(n + 1, 2), width = w(n, 2, N);
    assert.ok(width / gap > 0.5 && width / gap < 2, `N ${N}: n_max ${nmax.toFixed(1)}, width ${width.toFixed(3)} nm, gap ${gap.toFixed(3)} nm`);
  }
});
test('Doppler broadening: Δλ/λ = √(8 ln 2 kT / m c²), 7.16 × 10⁻⁵ at 10⁴ K', () => {
  near(model.dopplerWidth(1e4), 7.16e-7 * Math.sqrt(1e4 / 1.00794), 2e-3, 'FWHM');
});

console.log('engine');
// The lines are as wide as their levels' lifetimes in slow motion (Hα and Hβ about 3.5 Hz, from 2p's
// 1.6 ns): their centres are measured on high keys, where a hertz is a small share.
test('Hα sounds on the key\'s note and Hβ at 27/20 of it: every line at its exact ratio', () => {
  for (const k of [69, 81, 93]) {
    const x = render(k, P({ density: 100 }), 0.8, 2.5), f = keyFreq(k), a = 0.5 * FS, b = 2.5 * FS;
    for (const [n, name] of [[3, 'Hα'], [4, 'Hβ']]) {
      const g = f * model.ratio(n, 2), c = cents(centre(x, g, 10, a, b), g);
      assert.ok(Math.abs(c) < 1.5, `key ${k}: ${name} ${c.toFixed(2)} ¢`);
    }
    assert.ok(band(x, f, 10, a, b) > 30 * band(x, f * 1.06, 10, a, b), `key ${k}: Hα stands out`);
  }
});
test('the tuning moves the key\'s note, and the lines with it', () => {
  const Q = P({ density: 100, temperament: 'werckmeister' });
  const k = 84, f = tunedFreq(Q, k), x = render(k, Q, 0.8, 2.5), a = 0.5 * FS, b = 2.5 * FS;
  assert.ok(Math.abs(cents(f, keyFreq(k))) > 10, 'Werckmeister moves C by 12 ¢');
  assert.ok(Math.abs(cents(centre(x, f, 10, a, b), f)) < 1.5, `${cents(centre(x, f, 10, a, b), f).toFixed(2)} ¢`);
});
test('the lines\' strengths follow the model: Hα over Hβ in the sound as in the lamp', () => {
  const Q = P({ density: 100 }), k = 69, f = keyFreq(k), L = model.steadyLines(Q);
  const x = render(k, Q, 0.8, 4.5), a = 0.5 * FS, b = 4.5 * FS;
  const db = 10 * Math.log10(band(x, f, 12, a, b) / band(x, f * model.ratio(4, 2), 12, a, b)), want = 10 * Math.log10(balmer(L, 3) / balmer(L, 4));
  assert.ok(Math.abs(db - want) < 1.5, `Hα/Hβ ${db.toFixed(1)} dB, the lamp ${want.toFixed(1)} dB`);
});
test('the window: Lyman lines only through the ultraviolet one, the visible keeps Balmer\'s', () => {
  const k = 33, f = keyFreq(k), a = 0.5 * FS, b = 1.5 * FS;
  const lyA = f * model.ratio(2, 1);
  const vis = render(k, P({ density: 100 }), 0.8, 1.5), uv = render(k, P({ density: 100, window: 'ultraviolet' }), 0.8, 1.5);
  assert.ok(tone(uv, lyA, a, b) > 100 * tone(vis, lyA, a, b), 'Lyα');
  assert.ok(tone(vis, f, a, b) > 100 * tone(uv, f, a, b), 'Hα');
});
test('density widens the lines (the Stark effect): Hβ\'s peak spreads out', () => {
  const k = 81, f = keyFreq(k) * model.ratio(4, 2), a = 0.5 * FS, b = 2.5 * FS;
  // the share of the sound in the bin at Hβ's centre: most when the plasma is thin
  const narrow = (x) => tone(x, f, a, b) / rms(x, a, b);
  const thin = render(k, P({ density: 100 }), 0.8, 2.5), dense = render(k, P({ density: 1e18 }), 0.8, 2.5);
  assert.ok(narrow(thin) > 3 * narrow(dense), `${narrow(thin).toFixed(1)} against ${narrow(dense).toFixed(1)}`);
});
test('pitch bend is a redshift: every line moves by the same ratio', () => {
  const e = new HydrogenEngine(FS), k = 81, f = keyFreq(k), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P({ density: 100 })); e.handle({ type: 'bend', value: -1 }); e.noteOn(k, 0.8);
  const x = new Float32Array(2.5 * FS);
  for (let s = 0; s < x.length; s += 128) { e.process(bL, bR, 128); x.set(bL.subarray(0, Math.min(128, x.length - s)), s); }
  const z = 2 ** (-2 / 12), a = 0.5 * FS, b = x.length;
  for (const [n, name] of [[3, 'Hα'], [4, 'Hβ']]) {
    const g = f * z * model.ratio(n, 2), c = cents(centre(x, g, 10, a, b), g);
    assert.ok(Math.abs(c) < 1.5, `${name} ${c.toFixed(2)} ¢`);
  }
});
test('a lamp goes out after its key: its lines fade as its levels empty (the slowest in the glow\'s time), then it ends', () => {
  const x = render(57, P(), 0.8, 16, undefined, 1), e = x.engine;
  const lit = rms(x, 0.5 * FS, FS), after = rms(x, 3 * FS, 3.5 * FS);
  assert.ok(lit > 0.01 && after < 0.1 * lit, `${(20 * Math.log10(after / lit)).toFixed(1)} dB 2 s after`);
  assert.equal(e.voiceCount(), 0, 'it ends');
  assert.ok(Math.max(...x.slice(15 * FS).map(Math.abs)) === 0, 'silent after');
});
test('Space keeps the lamps lit until it comes up', () => {
  const e = new HydrogenEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P()); e.setSustain(true); e.noteOn(60, 0.7); e.noteOff(60);
  for (let b = 0; b < 400; b++) e.process(bL, bR, 128);
  assert.equal(e.voiceCount(), 1);
  e.setSustain(false);
  for (let b = 0; b < 6000; b++) e.process(bL, bR, 128);
  assert.equal(e.voiceCount(), 0);
});
test('the page\'s reports: the lines heard, strongest Hα, and the levels lit', () => {
  const e = new HydrogenEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128), got = {};
  e.post = (m) => { got[m.type] = m; };
  e.setParams(P()); e.noteOn(57, 0.8);
  for (let b = 0; b < 400; b++) e.process(bL, bR, 128);
  const lines = got.lines.lines.sort((x, y) => y.power - x.power);
  assert.equal(lines[0].line, model.lineOf(3, 2), 'Hα first');
  assert.ok(got.levels.lit && got.levels.pops[model.stateOf(3, 1)] > 0, 'the levels');
});
test('every preset, and the extremes, on every octave: finite, and a chord stays under 1', () => {
  const sets = [...PRESETS.map((p) => P(p.p)), P({ density: 1e18, temperature: 100000, window: 'all' }), P({ slowmo: 1e6, alphaScale: 40, window: 'all' }),
    P({ excitation: 'laser', laserLevel: 30, slowmo: 1e9 }), P({ excitation: 'recombination', temperature: 1000, glow: 5 })];
  for (const p of sets) {
    const e = new HydrogenEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
    e.setParams(p);
    for (const k of [21, 45, 69, 93, 108]) e.noteOn(k, 0.7);
    for (let b = 0; b < 200; b++) { e.process(bL, bR, 128); assert.ok(bL.every(Number.isFinite) && bR.every(Number.isFinite), 'NaN'); }
  }
  let pk = 0;
  const e = new HydrogenEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P());
  for (const k of [48, 52, 55, 60]) e.noteOn(k, 1);
  for (let b = 0; b < 800; b++) { e.process(bL, bR, 128); for (const v of bL) pk = Math.max(pk, Math.abs(v)); }
  assert.ok(pk > 0.05 && pk < 1, `peak ${pk}`);
});
test('a lamp changed while keys sound: the sounding lamps carry on, the next key lights the new one', () => {
  const e = new HydrogenEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P()); e.noteOn(57, 0.8);
  for (let b = 0; b < 100; b++) e.process(bL, bR, 128);
  for (let i = 0; i < 6; i++) { e.setParams(P({ temperature: 20000 + 5000 * i, excitation: i % 2 ? 'recombination' : 'discharge' })); e.process(bL, bR, 128); }
  e.noteOn(60, 0.8);
  for (let b = 0; b < 100; b++) { e.process(bL, bR, 128); assert.ok(bL.every(Number.isFinite)); }
  assert.equal(e.voiceCount(), 2);
});
test('CPU: ten lamps through the open window (96 lines each) render three times faster than real time', () => {
  const e = new HydrogenEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P({ window: 'all' }));
  for (let i = 0; i < 10; i++) e.noteOn(36 + 5 * i, 0.7);
  const t0 = performance.now();
  for (let b = 0; b < 375 * 2; b++) e.process(bL, bR, 128);
  const ms = performance.now() - t0;
  assert.ok(ms < 667, `${ms.toFixed(0)} ms for 2 s`);
});

// What the Quality setting trims (the README says it): fewer lamps at once, and fewer lines each
// (96, 40, 16: the strongest).
test('Quality: past 16 lamps at Medium and 8 at Low the oldest goes out (32 at High); the lamp keeps its pitch and level', () => {
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (const [quality, cap] of [['high', 32], ['medium', 16], ['low', 8]]) {
    const e = new HydrogenEngine(FS);
    e.setQuality(quality); e.setParams(P()); e.setSustain(true);
    for (let i = 0; i < 36; i++) { e.noteOn(36 + i, 0.7); e.process(bL, bR, 128); }
    assert.equal(e.voiceCount(), cap, quality);
  }
  const k = 81, f = keyFreq(k), Q = P({ window: 'all', density: 100 }), hi = render(k, Q, 0.7, 2.5), a = 0.5 * FS, b = 2.5 * FS;
  for (const quality of ['medium', 'low']) {
    const x = render(k, Q, 0.7, 2.5, quality);
    const c = cents(centre(x, f, 10, a, b), f), d = 20 * Math.log10(rms(x, a) / rms(hi, a));
    assert.ok(Math.abs(c) < 1.5 && Math.abs(d) < 1.5, `${quality}: Hα ${c.toFixed(3)} ¢, ${d.toFixed(2)} dB`);
  }
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
