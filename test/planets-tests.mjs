// Ringing Planets checks. Run: node test/planets-tests.mjs
//
// The normal-mode solver (tools/planets-modes.mjs) against closed forms (Lamb's toroidal modes,
// Kelvin's fluid sphere) and the Earth's measured free oscillations; the planets' models against
// their measured masses and moments of inertia; then the C++ model and engine (built as
// WebAssembly) against the table and the physics it encodes.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../planets/src/planets-instrument.js';
import { wasmModel } from '../planets/src/planets-wasm.js';
import { PLANETS, massMoment, G } from '../planets/src/planets-models.js';
import { spheroidal, toroidal, solvePlanet, modeProperties } from '../tools/planets-modes.mjs';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';

const PlanetEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const TAU = 2 * Math.PI;

// One note through the engine, in 128-sample blocks as in the AudioWorklet.
function render(key, params, vel, sec, { quality, off, sustain, before } = {}) {
  const e = new PlanetEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  before?.(e);
  if (sustain) e.setSustain(true);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) {
    if (off !== undefined && s === Math.round(off * FS / bl) * bl) e.noteOff(key);
    e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
  }
  return { L, R, e };
}
// Amplitude of frequency f in x[a, b) (Hann-windowed, so a pure tone of amplitude A reads A/2·N/2)
function tone(x, f, a, b) {
  const w = TAU * f / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos(TAU * (i - a) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im) * 4 / (b - a);
}
function peak(x, f0, a, b, span = 20) { // strongest frequency within ± span cents of f0
  let lo = f0 * 2 ** (-span / 1200), hi = f0 * 2 ** (span / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

// A homogeneous sphere (km, g/cm³, km/s) for the closed forms
const homogeneous = (R, rho, vp, vs) => ({ id: 'test', R, fref: 1, layers: [{ r0: 0, r1: R, name: 'all', rho: () => rho, vp: () => vp, vs: () => vs, qmu: 300, qkappa: 57823 }] });
const els = (R, n) => Array.from({ length: n }, (_, i) => ({ layer: 0, r0: R * i / n, r1: R * (i + 1) / n }));
// spherical Bessel j_l(x), upward recurrence (fine for x > l here)
const jl = (l, x) => { let a = Math.sin(x) / x, b = Math.sin(x) / (x * x) - Math.cos(x) / x; if (l === 0) return a; for (let k = 1; k < l; k++) { const c = (2 * k + 1) / x * b - a; a = b; b = c; } return b; };

// The Earth's measured free oscillations, as compiled for REM1D (Moulik & Ekström 2025;
// https://doi.org/10.5281/zenodo.8407693): frequency (mHz) and, where listed, 1000/Q.
const MEASURED = {
  '0S0': [0.81419, 0.18250], '1S0': [1.63152, 0.51935], '2S0': [2.50891],
  '0S2': [0.30945, 2.19822], '0S3': [0.46848, 2.55489], '0S4': [0.64679, 2.65887], '0S5': [0.84001, 2.77091], '0S6': [1.03758, 2.88791],
  '1S2': [0.68013, 2.93562], '1S3': [0.93997], '1S4': [1.17278],
  '0T2': [0.37800], '0T3': [0.58652], '0T4': [0.76594], '0T5': [0.92851], '1T2': [1.31921],
};

console.log('physics: the solver');
test('PREM weighs the Earth: mass 5.974e24 kg and I/MR² 0.3308 (Dziewonski & Anderson 1981)', () => {
  const { mass, moi } = massMoment(PLANETS[0]);
  assert.ok(Math.abs(mass / 5.974e24 - 1) < 0.001, `${mass}`);
  assert.ok(Math.abs(moi - 0.3308) < 0.0005, `${moi}`);
});
test('Mars and the Moon match their measured masses and moments; the Martian core is as dense as InSight found', () => {
  for (const [P, m, I] of [[PLANETS[1], 6.4171e23, 0.3638], [PLANETS[2], 7.3458e22, 0.3929]]) {
    const r = massMoment(P);
    assert.ok(Math.abs(r.mass / m - 1) < 1e-6 && Math.abs(r.moi - I) < 1e-5, `${P.id}: ${r.mass} ${r.moi}`);
  }
  const core = PLANETS[1].layers[0];
  let a = 0, b = 0;
  for (let i = 0; i < 1000; i++) { const r = (i + 0.5) / 1000 * core.r1; a += core.rho(r / PLANETS[1].R) * r * r; b += r * r; }
  assert.ok(a / b > 5.7 && a / b < 6.45, `mean core density ${a / b}`); // Stähler et al. 2021: 5.7–6.3
});
test('toroidal modes of a uniform elastic sphere: Lamb\'s (l − 1) j_l(x) = x j_{l+1}(x), x = ωR/β', () => {
  const R = 1000, beta = 4, Pl = homogeneous(R, 4, 7, beta);
  for (const l of [2, 3, 5]) {
    const sol = toroidal(Pl, l, { els: els(R, 12) });
    const f = (x) => (l - 1) * jl(l, x) - x * jl(l + 1, x);
    const roots = [];
    for (let x = 0.5; roots.length < 3; x += 0.01) if (f(x) * f(x + 0.01) < 0) { let lo = x, hi = x + 0.01; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } roots.push((lo + hi) / 2); }
    const got = Array.from(sol.lambda).filter((w2) => w2 > 1e-12).map((w2) => Math.sqrt(w2) * R / beta).slice(0, 3);
    roots.forEach((x, i) => assert.ok(Math.abs(got[i] / x - 1) < 1e-4, `l ${l}: ${got[i]} vs ${x}`));
  }
});
test('a self-gravitating fluid sphere rings at Kelvin\'s ω² = (8πGρ/3) l(l − 1)/(2l + 1)', () => {
  const R = 3000, rho = 5, Pl = homogeneous(R, rho, 300, 0); // nearly incompressible
  for (const l of [2, 3, 4]) {
    const sol = spheroidal(Pl, l, { els: els(R, 10) });
    const want = (8 * Math.PI * G * rho * 1000 / 3) * l * (l - 1) / (2 * l + 1);
    const best = Array.from(sol.lambda).reduce((b, w2) => (Math.abs(w2 / want - 1) < Math.abs(b / want - 1) ? w2 : b), Infinity);
    assert.ok(Math.abs(best / want - 1) < 0.005, `l ${l}: ${best} vs ${want}`);
  }
});
const earth = solvePlanet(PLANETS[0], { fmax: 0.0014, lmax: 6, meshF: 2.2 });
const byName = (list) => Object.fromEntries(list.map((m) => [`${m.n}${m.type}${m.l}`, m]));
test('PREM rings as the Earth was measured to: 16 multiplets within 0.6 %, their Q within 30 %', () => {
  const E = byName(earth);
  for (const [k, [f, invQ]] of Object.entries(MEASURED)) {
    if (!E[k]) { if (f < 1.3) assert.fail(`${k} missing`); continue; }
    assert.ok(Math.abs(E[k].f * 1000 / f - 1) < 0.006, `${k}: ${(E[k].f * 1000).toFixed(5)} vs ${f}`);
    if (invQ) assert.ok(Math.abs(E[k].Q / (1000 / invQ) - 1) < 0.3, `${k} Q ${E[k].Q} vs ${1000 / invQ}`);
  }
});
test('the spin\'s splitting: χ = 1/l(l+1) for toroidal modes, and ₀S₂\'s singlets 1.5 % apart on Earth', () => {
  const E = byName(earth);
  for (const k of ['0T2', '0T3']) assert.ok(Math.abs(E[k].chi - 1 / (E[k].l * (E[k].l + 1))) < 1e-9);
  // Coriolis splitting of ₀S₂: χΩ/ω = 0.397 × 1.16e-5 Hz / 0.309 mHz (observed singlets ~1.5 % apart)
  const s = E['0S2'].chi / PLANETS[0].day / E['0S2'].f;
  assert.ok(s > 0.013 && s < 0.017, `${s}`);
});

console.log('the model (C++)');
const T = model.planets;
test('the table is the solver\'s: ₀S₂ on Earth, Mars and the Moon', () => {
  const E = byName(earth);
  assert.ok(Math.abs(T[0].f0S2 / E['0S2'].f - 1) < 1e-5, `${T[0].f0S2}`);
  assert.ok(Math.abs(T[0].f0S2 * 1000 / MEASURED['0S2'][0] - 1) < 0.002);
  assert.ok(T[1].f0S2 > 0.3e-3 && T[1].f0S2 < 0.45e-3, `Mars ${T[1].f0S2}`);
  assert.ok(T[2].f0S2 > 0.9e-3 && T[2].f0S2 < 1.2e-3, `Moon ${T[2].f0S2}`);
  for (const p of T) for (let i = 1; i < p.modes.length; i++) assert.ok(p.modes[i].f >= p.modes[i - 1].f && p.modes[i].Q > 0);
});
test('spherical harmonics: unit power on the sphere, and their θ-derivatives', () => {
  const L = 6, h = 1e-5, th = 0.83, A = model.legendre(L, th), Ap = model.legendre(L, th + h), Am = model.legendre(L, th - h);
  for (let i = 0; i < A.P.length; i++) assert.ok(Math.abs((Ap.P[i] - Am.P[i]) / (2 * h) - A.dP[i]) < 1e-6, `dP ${i}`);
  const N = 400;
  for (const [l, m] of [[2, 0], [3, 2], [6, 5]]) {
    let s = 0;
    for (let i = 0; i < N; i++) { const t = (i + 0.5) / N * Math.PI; s += model.legendre(L, t).P[l * (l + 1) / 2 + m] ** 2 * Math.sin(t) * Math.PI / N; }
    assert.ok(Math.abs(s * TAU - 1) < 1e-3, `${l} ${m}: ${s * TAU}`);
  }
});
const amps = (rows) => Object.fromEntries(rows.map((m) => [`${m.n}${m.type}${m.l}`, m.amp]));
test('an explosion 90° away leaves every odd degree silent (P_l(0) = 0)', () => {
  const a = amps(model.multiplets(48, 1, P({ mech: 'explosion', distance: 90 }), 400));
  const big = Math.max(...Object.values(a));
  for (const k of ['0S3', '0S5', '1S3']) assert.ok((a[k] ?? 0) < 1e-6 * big, `${k} ${a[k]}`);
  for (const k of ['0S2', '0S4', '0S0']) assert.ok(a[k] > 1e-3 * big, `${k} ${a[k]}`);
});
test('a vertical strike-slip fault cannot breathe (₀S₀) and an up-down sensor never hears a twist (T)', () => {
  const rows = model.multiplets(48, 1, P({ mech: 'strikeslip' }), 400), a = amps(rows), big = Math.max(...Object.values(a));
  assert.ok((a['0S0'] ?? 0) < 1e-8 * big, `${a['0S0']}`);
  assert.ok(!rows.some((m) => m.type === 'T'));
  assert.ok(model.multiplets(48, 1, P({ sensor: 'horizontal', mech: 'strikeslip' }), 400).some((m) => m.type === 'T'));
});
test('a deep quake rings the overtones harder than a shallow one', () => {
  const share = (depth) => { const r = model.multiplets(48, 1, P({ depth, mech: 'normal' }), 400); let o = 0, f = 0; for (const m of r) { if (m.n > 0) o += m.amp ** 2; else f += m.amp ** 2; } return o / f; };
  assert.ok(share(640) > 3 * share(20), `${share(640)} vs ${share(20)}`);
});
test('a gravimeter hears ₀S₂ louder than the ground\'s motion alone: 1 < δg/(ω²U) < 1 + 2g/(Rω²)', () => {
  const e = T[0], m = e.modes.find((x) => x.type === 'S' && x.n === 0 && x.l === 2), w = TAU * m.f, g = 9.826e-3;
  const factor = 1 + 2 * g / (e.R * w * w) + (m.l + 1) * m.P / (e.R * w * w * m.U);
  assert.ok(factor > 1.2 && factor < 1 + 2 * g / (e.R * w * w), `${factor}`);
});
test('a bigger quake ruptures longer: Mw 9 breaks for about 150 s (Global CMT scaling)', () => {
  const h = model.halfDuration(1, P({ mwTop: 9 }));
  assert.ok(Math.abs(h - 77) < 2, `${h}`);
  assert.ok(model.halfDuration(0.5, P({ mwTop: 9 })) < h);
});

console.log('the engine');
test('tuning: ₀S₂ lands on every key (no spin), within 1 ¢', () => {
  for (const key of [33, 48, 60, 72, 84]) {
    const f = tunedFreq(P(), key), { L } = render(key, P({ spin: 0 }), 1, 1.6, { sustain: true });
    const got = peak(L, f, Math.round(0.25 * FS), Math.round(1.6 * FS));
    assert.ok(Math.abs(cents(got, f)) < 1, `key ${key}: ${got} vs ${f}`);
  }
});
test('spin: ₀S₂ splits into singlets m χ Ω apart (spin 8×, heard at C4)', () => {
  const e0 = T[0], m = e0.modes.find((x) => x.type === 'S' && x.n === 0 && x.l === 2), f = tunedFreq(P(), 60);
  const step = 8 * m.chi / e0.day / e0.f0S2 * f; // Hz between singlets, heard
  const { L } = render(60, P({ spin: 8, lat: 60 }), 1, 1.6, { sustain: true });
  const a = Math.round(0.2 * FS), b = Math.round(1.6 * FS);
  const found = [-2, -1, 1, 2].map((q) => Math.abs(peak(L, f + q * step, a, b, 8) - (f + q * step)));
  assert.ok(found.filter((d) => d < 0.6).length >= 2, `${found} (step ${step})`);
  const still = render(60, P({ spin: 0, lat: 60 }), 1, 1.6, { sustain: true }).L;
  assert.ok(tone(still, f, a, b) > 3 * tone(L, f + 0.5 * step, a, b));
});
test('decay: the breathing mode ₀S₀ fades at Kω/2Q, as its table says', () => {
  const e0 = T[0], m = e0.modes.find((x) => x.type === 'S' && x.n === 0 && x.l === 0), key = 48;
  const K = model.speedup(key, P()), f = K * m.f, want = Math.PI * f / m.Q;
  const { L } = render(key, P({ spin: 0 }), 1, 4, { sustain: true });
  const w = Math.round(0.5 * FS), a1 = tone(L, f, Math.round(1.5 * FS), Math.round(1.5 * FS) + w), a2 = tone(L, f, Math.round(3.3 * FS), Math.round(3.3 * FS) + w);
  const got = Math.log(a1 / a2) / 1.8;
  assert.ok(Math.abs(got / want - 1) < 0.05, `${got} vs ${want}`);
});
test('level: a hard C4 peaks between 0.05 and 0.9, finite, and stops when let go', () => {
  const { L, R } = render(60, P(), 1, 2, { off: 0.6 });
  let pk = 0;
  for (let i = 0; i < L.length; i++) { assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i])); pk = Math.max(pk, Math.abs(L[i])); }
  assert.ok(pk > 0.05 && pk < 0.9, `peak ${pk}`);
  assert.ok(rms(L, Math.round(1.6 * FS), 2 * FS) < 1e-4, `${rms(L, Math.round(1.6 * FS), 2 * FS)}`);
});
test('sustain keeps it ringing after the key comes up', () => {
  const held = render(48, P(), 1, 2, { off: 0.3, sustain: true }).L, let_go = render(48, P(), 1, 2, { off: 0.3 }).L;
  assert.ok(rms(held, Math.round(1.5 * FS), 2 * FS) > 100 * rms(let_go, Math.round(1.5 * FS), 2 * FS) + 1e-9);
});
test('the horizontal pair is stereo; the others mono', () => {
  const h = render(60, P({ sensor: 'horizontal', mech: 'strikeslip' }), 1, 0.5), v = render(60, P(), 1, 0.5);
  let dh = 0, dv = 0;
  for (let i = 0; i < h.L.length; i++) { dh += Math.abs(h.L[i] - h.R[i]); dv += Math.abs(v.L[i] - v.R[i]); }
  assert.ok(dh > 1 && dv === 0, `${dh} ${dv}`);
});
test('MPE: a note\'s bend speeds its own time-lapse (an octave up), and the wheel bends all', () => {
  const f = tunedFreq(P(), 48);
  const { L } = render(48, P({ spin: 0 }), 1, 1.4, { sustain: true, before: (e) => e.handle({ type: 'noteBend', key: 48, value: 2 }) });
  assert.ok(Math.abs(cents(peak(L, 2 * f, Math.round(0.2 * FS), Math.round(1.4 * FS)), 2 * f)) < 1);
});
test('Quality: Medium and Low play fewer modes, at the same pitch', () => {
  const n = (q) => { const { e } = render(60, P({ spin: 0 }), 1, 0.01, { quality: q }); return e.oscillators(0); };
  const hi = n('high'), med = n('medium'), lo = n('low');
  assert.ok(hi > med && med > lo && med <= 80 && lo <= 40, `${hi} ${med} ${lo}`);
  const f = tunedFreq(P(), 48), { L } = render(48, P({ spin: 0 }), 1, 1.6, { quality: 'low', sustain: true });
  assert.ok(Math.abs(cents(peak(L, f, Math.round(0.25 * FS), Math.round(1.6 * FS)), f)) < 1);
});
test('the Moon rings far longer than the Earth', () => {
  const ring = (planet) => { const { L } = render(60, P({ planet }), 1, 6, { sustain: true }); return rms(L, 5 * FS, 6 * FS) / rms(L, 0, FS); };
  assert.ok(ring('moon') > 5 * ring('earth'), `${ring('moon')} ${ring('earth')}`);
});
test('CPU: ten great moonquakes ring at once on under 30 % of a core', () => {
  const e = new PlanetEngine(FS); e.setParams(P({ planet: 'moon' }));
  for (let k = 0; k < 10; k++) e.noteOn(48 + 3 * k, 1);
  const bL = new Float32Array(128), bR = new Float32Array(128), t0 = performance.now();
  for (let s = 0; s < FS; s += 128) e.process(bL, bR, 128);
  const ms = performance.now() - t0;
  assert.ok(ms < 300, `${(ms / 10).toFixed(0)} % of a core`);
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
