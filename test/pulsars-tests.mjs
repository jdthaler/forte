// Pulsars checks. Run: node test/pulsars-tests.mjs
//
// The model (the C++, through pulsars-wasm.js) is checked against independent physics: the light
// cylinder, a dipole field line's direction traced here point by point, Rankin's measured beam
// size, the dispersion constant from the electron's charge and mass, the narrow-channel smear
// formula, Bhat et al.'s fit, the pulse width from spherical trigonometry (Gil et al. 1984), the
// interpulse of an orthogonal rotator, and the band's response integrated here frequency by
// frequency. Then the engine against the model: the pitch on every key, its harmonics against the
// tables, the interpulse's octave, dispersion's smear and its undoing, the sweep down the band,
// scattering, the jitter, the mod wheel's rebuild, MPE, level, silence, Quality and CPU.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../pulsars/src/pulsars-instrument.js';
import { wasmModel, engineProbe } from '../pulsars/src/pulsars-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const probe = await engineProbe();
const K = M.constants;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const P = (o = {}) => ({ ...DEFAULTS, jitter: 0, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const DEG = Math.PI / 180;

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events = [], quality) {
  const e = new Engine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  for (let s = 0; s < n; s += bl) {
    while (ev.length && ev[0][0] * FS <= s) ev.shift()[1](e);
    e.process(bL, bR, bl);
    const m = Math.min(bl, n - s);
    L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s);
  }
  return [L, R, e];
}
const note = (key, params, sec, vel = 0.8, more = [], quality) => render(params, sec, [[0, (e) => e.noteOn(key, vel)], ...more], quality);
// Amplitude of frequency f in x[a, b) (Hann-windowed, scaled to a sine's amplitude).
function tone(x, f, a, b) {
  a = Math.max(0, Math.round(a)); b = Math.min(x.length, Math.round(b));
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
// The strongest frequency within ±30 ¢ of f0 (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-30 / 1200), hi = f0 * 2 ** (30 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
// Harmonic n of a turn's table (an array over one turn): its amplitude.
const harm = (arr, n) => { let re = 0, im = 0; const m = arr.length - 1; for (let i = 0; i < m; i++) { re += arr[i] * Math.cos((2 * Math.PI * n * i) / m); im += arr[i] * Math.sin((2 * Math.PI * n * i) / m); } return (2 * Math.hypot(re, im)) / m; };

console.log('the model');
test('the light cylinder is c / 2πf: 108.4 km at 440 Hz, inside a 12 km star only near the top of the keyboard', () => {
  near(M.lightCylinder(440), 299792.458 / (2 * Math.PI * 440), 1e-9, 'R_LC');
  assert.ok(M.lightCylinder(tunedFreq(DEFAULTS, 108)) < K.RIM_KM && M.lightCylinder(tunedFreq(DEFAULTS, 105)) > K.RIM_KM, 'only B7 and C8 inside the star');
});
test('the beam\'s radius is the direction of the last open dipole line at the emission height, traced point by point (3/2 √(r/R_LC) when narrow)', () => {
  // the dipole line r = R sin²θ through (r, θ) with sin²θ = r / R_LC: step along it and take its slope
  for (const [r, rlc] of [[200, 1735], [30, 433], [5, 1e5], [100, 334]]) {
    const R = rlc, th = Math.asin(Math.sqrt(r / R)), d = 1e-6;
    const pt = (t) => { const rr = R * Math.sin(t) ** 2; return [rr * Math.sin(t), rr * Math.cos(t)]; };
    const [x1, z1] = pt(th - d), [x2, z2] = pt(th + d);
    const ang = Math.atan2(x2 - x1, z2 - z1); // from the magnetic axis
    near(M.beamRadius(r, rlc), ang, 1e-6, `ρ at r ${r}, R_LC ${rlc}`);
  }
  near(M.beamRadius(1, 1e8) / (1.5 * Math.sqrt(1e-8)), 1, 1e-6, 'narrow limit');
  near(M.beamRadius(1e4, 100), M.beamRadius(K.LC_SHARE * 100, 100), 1e-12, 'capped at 30 % of the light cylinder');
});
test('a 1 s pulsar beaming from 214 km has Rankin\'s outer cone, 5.75° P^−½', () => {
  near(M.beamRadius(214, M.lightCylinder(1)) / DEG, 5.75, 0.03, 'ρ (deg)');
  near(M.beamRadius(214, M.lightCylinder(4)) / DEG, 5.75 * 2, 0.1, 'P^−½: four times faster, twice as wide');
});
test('the dispersion constant is e² / 2π mₑ c: 4.1488 × 10³ s MHz² cm³ / pc', () => {
  const e = 4.80320471e-10, me = 9.1093837e-28, c = 2.99792458e10, pc = 3.0856776e18;
  const k = ((e * e) / (2 * Math.PI * me * c)) * pc / 1e12;
  near(K.K_DM / k, 1, 2e-5, 'K_DM');
  near(M.delay(100, 1000), (k * 100) / 1e6, 1e-6, 'DM 100 at 1 GHz: 0.415 s');
});
test('a narrow channel smears by 8.3 µs × DM × Δf(MHz) / f(GHz)³', () => {
  const P1 = P({ dedisp: 'filterbank', channels: 512, dm: 50, freq: 1400, bandwidth: 0.2 });
  const g = M.geometry(60, P1), df = (1400 * 0.2) / 512;
  near(g.smearL / (8.3e-6 * 50 * df / 1.47 ** 3), 1, 0.01, 'upper half (centre 1.47 GHz)');
  near(g.smearR / (8.3e-6 * 50 * df / 1.33 ** 3), 1, 0.01, 'lower half (centre 1.33 GHz)');
});
test('scattering follows Bhat et al. (2004): log τ(ms) = −6.46 + 0.154 log DM + 1.07 (log DM)² − 3.86 log f(GHz)', () => {
  for (const [dm, f] of [[10, 1400], [100, 430], [400, 3000], [30, 150]]) {
    const l = Math.log10(dm), want = 1e-3 * 10 ** (-6.46 + 0.154 * l + 1.07 * l * l - 3.86 * Math.log10(f / 1000));
    near(M.scatter(dm, f) / want, 1, 1e-9, `DM ${dm} at ${f} MHz`);
  }
  near(M.scatter(100, 430, 3) / M.scatter(100, 430), 3, 1e-12, 'the scale');
});
test('the pulse\'s half-power width is the spherical triangle\'s: sin²(W/4) = (sin²(ρ½/2) − sin²(β/2)) / (sin α sin ζ) (Gil et al. 1984)', () => {
  for (const [alpha, q] of [[45, 0.1], [30, 0.05], [70, 0.15]]) {
    const p = P({ core: 1, alpha, sightline: q, height: 100 }), key = 33, g = M.geometry(key, p);
    const rh = K.CORE_W * g.rho * Math.sqrt(2 * Math.log(2));
    const W = 4 * Math.asin(Math.sqrt((Math.sin(rh / 2) ** 2 - Math.sin(g.beta / 2) ** 2) / (Math.sin(g.alpha) * Math.sin(g.zeta))));
    // the profile is its own peak's share: the beam's absolute half power is at 0.5 / (its peak, β/ρ off the axis)
    const prof = M.profile(key, p, 4001), half = 0.5 / M.beam(q, 1);
    let i = 2000; while (prof[i] > half) i++;
    const w = ((i - 0.5 - 2000) / 4000) * 2 * 2 * Math.PI; // both sides
    near(w / W, 1, 0.01, `α ${alpha}°, β/ρ ${q}`);
  }
});
test('an orthogonal rotator shows the other pole\'s pulse half a turn on, as bright as the main one', () => {
  const prof = M.profile(40, P({ alpha: 90, sightline: 0.1, core: 1 }), 401);
  near(prof[200], 1, 1e-6, 'main pulse');
  near(prof[0] / prof[200], 1, 1e-6, 'interpulse');
  const p45 = M.profile(40, P({ alpha: 45 }), 401);
  assert.ok(p45[0] < 1e-6, `no interpulse at 45°: ${p45[0]}`);
});
test('the undedispersed band\'s response is the average of e^(−iωt(f)) / (1 + iωτ(f)) over its frequencies, integrated here', () => {
  const p = P({ dedisp: 'none', dm: 2, freq: 1400, bandwidth: 0.2, scatter: 30 }), lo = 1400 * 0.9, hi = 1400 * 1.1;
  for (const [b, f1, f2] of [[0, 1400, hi], [1, lo, 1400]]) {
    for (const w of [2 * Math.PI * 300, 2 * Math.PI * 2000, 2 * Math.PI * 9000]) {
      let re = 0, im = 0; const N = 200000;
      for (let i = 0; i < N; i++) {
        const f = f1 + ((i + 0.5) * (f2 - f1)) / N, t = K.K_DM * 2 * (1 / (f * f) - 1 / (hi * hi)), tau = M.scatter(2, f, 30);
        const cr = Math.cos(w * t), ci = -Math.sin(w * t), d = 1 + w * w * tau * tau; // e^(−iωt) / (1 + iωτ)
        re += (cr + ci * w * tau) / d; im += (ci - cr * w * tau) / d;
      }
      const [hr, hi2] = M.transfer(60, p, b, w, { pieces: 256 });
      near(hr, re / N, 2e-3, `re, half ${b}, ω/2π ${(w / 2 / Math.PI).toFixed(0)}`);
      near(hi2, im / N, 2e-3, `im, half ${b}, ω/2π ${(w / 2 / Math.PI).toFixed(0)}`);
    }
  }
});
test('coherent dedispersion with no scattering passes every harmonic; a filterbank leaves a channel\'s sinc', () => {
  const p = P({ dedisp: 'coherent', scatter: 0.01, dm: 5 });
  const [r, i] = M.transfer(60, p, 0, 2 * Math.PI * 5000);
  near(Math.hypot(r, i), 1, 1e-6, '|H| coherent');
  const pf = P({ dedisp: 'filterbank', channels: 32, dm: 30, scatter: 0.01, freq: 1400, bandwidth: 0.2 });
  const w = 2 * Math.PI * 3000, df = 280 / 32;
  let s = 0; // the 16 channels of the upper half, each its own sinc
  for (let c = 0; c < 16; c++) { const f = 1400 + (c + 0.5) * df, d = M.delay(30, f - df / 2) - M.delay(30, f + df / 2); s += Math.sin((w * d) / 2) / ((w * d) / 2); }
  const [fr] = M.transfer(60, pf, 0, w);
  near(fr, s / 16, 1e-4, 'filterbank');
});

console.log('the engine');
test('every key sounds its note: the pulse train\'s fundamental within 1 ¢', () => {
  for (const k of [24, 36, 45, 57, 69, 81, 88]) {
    const f = tunedFreq(DEFAULTS, k), [L] = note(k, P(), 0.8);
    const got = peak(L, f, 0.3 * FS, 0.8 * FS);
    assert.ok(Math.abs(cents(got, f)) < 1, `key ${k}: ${got.toFixed(3)} Hz vs ${f.toFixed(3)}`);
  }
});
test('the harmonics played are the tables\' (both halves of the band)', () => {
  const k = 45, p = P(), f = tunedFreq(p, k), [L, R] = note(k, p, 1);
  const t = M.tables(k, p, { m: 2049 });
  for (const n of [1, 2, 3, 5, 8]) {
    near(tone(L, n * f, 0.3 * FS, FS) / (0.8 * 0.08 * harm(t.L, n)), 1, 0.03, `left, harmonic ${n}`);
    near(tone(R, n * f, 0.3 * FS, FS) / (0.8 * 0.08 * harm(t.R, n)), 1, 0.03, `right, harmonic ${n}`);
  }
});
test('an orthogonal rotator\'s interpulse cancels the odd harmonics: the note sounds an octave up', () => {
  const k = 45, f = tunedFreq(DEFAULTS, k);
  const [A] = note(k, P({ alpha: 90, sightline: 0.1 }), 1), [B] = note(k, P({ alpha: 45, sightline: 0.1 }), 1);
  const a1 = tone(A, f, 0.3 * FS, FS), a2 = tone(A, 2 * f, 0.3 * FS, FS), b1 = tone(B, f, 0.3 * FS, FS);
  assert.ok(a1 < 0.01 * a2, `fundamental ${a1} vs octave ${a2}`);
  assert.ok(b1 > 0.1 * a2, 'one pole: the fundamental is there');
});
test('undedispersed, dispersion smears the pulses away (high notes first); a filterbank and coherent dedispersion bring them back', () => {
  const lvl = (o, k) => rms(note(k, P({ dm: 30, ...o }), 0.8)[0], 0.4 * FS, 0.8 * FS);
  const none = lvl({ dedisp: 'none' }, 72), fb = lvl({ dedisp: 'filterbank', channels: 1024 }, 72), co = lvl({ dedisp: 'coherent' }, 72);
  assert.ok(none < 0.1 * co, `none ${none} vs coherent ${co}`);
  assert.ok(fb > 0.8 * co, `filterbank ${fb} vs coherent ${co}`);
  assert.ok(lvl({ dedisp: 'none', dm: 2 }, 36) > 2 * lvl({ dedisp: 'none', dm: 2 }, 72), 'a low note survives a smear a high one doesn\'t');
});
test('undedispersed, a new note sweeps down the band: the lower half (right) comes in later, by the dispersion delay', () => {
  const p = P({ dedisp: 'none', dm: 0.5, freq: 400, bandwidth: 0.4 }), k = 33, [L, R] = note(k, p, 3);
  const g = M.geometry(k, p), hop = Math.round(0.002 * FS);
  const on = (x) => { const top = rms(x, 2.5 * FS, 3 * FS); for (let i = 0; i + hop < x.length; i += hop) if (rms(x, i, i + 2 * hop) > top / 2) return i / FS; return Infinity; };
  const tl = on(L), tr = on(R), want = M.delay(0.5, 400 * 0.8) - M.delay(0.5, 400); // the lower half's middle against the band's top
  assert.ok(tr - tl > 0.25 * g.sweep, `right ${tr.toFixed(3)} s after left ${tl.toFixed(3)} s (sweep ${g.sweep.toFixed(3)} s)`);
  assert.ok(tr < want * 1.3 + 0.05, `right in by ${tr.toFixed(3)} s (its middle at ${want.toFixed(3)} s)`);
  const pc = { ...p, dedisp: 'coherent' }, [Lc, Rc] = note(k, pc, 3);
  near(on(Lc), on(Rc), 0.01, 'coherent: both at once');
});
test('scattering takes the top off by 1/(1 + iωτ): LOFAR\'s 150 MHz against 1.4 GHz', () => {
  const k = 69, f = tunedFreq(DEFAULTS, k), lofar = P({ freq: 150, dm: 35, dedisp: 'coherent', bandwidth: 0.3 }), hi = { ...lofar, freq: 1400 };
  const [A] = note(k, lofar, 1), [B] = note(k, hi, 1);
  const r = (x, n) => tone(x, n * f, 0.3 * FS, FS);
  const tau = M.scatter(35, 150), want = 1 / Math.hypot(1, 2 * Math.PI * 3 * f * tau) / (1 / Math.hypot(1, 2 * Math.PI * f * tau));
  assert.ok(r(A, 3) / r(A, 1) < 0.7 * (r(B, 3) / r(B, 1)), 'duller at 150 MHz');
  near((r(A, 3) / r(A, 1)) / (r(B, 3) / r(B, 1)), want, 0.25 * want, 'by the tail\'s response (the band\'s spread of τ aside)');
});
test('jitter: at 0 every pulse is alike; at 1 the pulses\' energies spread about as much as their mean', () => {
  const k = 33, f = tunedFreq(DEFAULTS, k), per = FS / f;
  const energies = (x) => { const out = []; for (let p = 0.5 * FS; p + per < x.length; p += per) out.push(rms(x, Math.round(p), Math.round(p + per))); return out; };
  const spread = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) / m; };
  const [A] = note(k, P({ jitter: 0, height: 60 }), 2), [B] = note(k, P({ jitter: 1, height: 60 }), 2);
  assert.ok(spread(energies(A)) < 0.01, `smooth: ${spread(energies(A))}`);
  assert.ok(spread(energies(B)) > 0.3, `rough: ${spread(energies(B))}`);
});
test('the mod wheel\'s DM rebuilds a sounding pulsar\'s table, crossfaded without a jump', () => {
  const k = 60, f = tunedFreq(DEFAULTS, k), p = P({ dedisp: 'none', dm: 0.5 });
  const [L] = render(p, 1.2, [[0, (e) => e.noteOn(k, 0.8)], [0.5, (e) => e.setParams({ ...p, dm: 3 })]]);
  const before = tone(L, 5 * f, 0.2 * FS, 0.5 * FS), after = tone(L, 5 * f, 0.8 * FS, 1.2 * FS);
  assert.ok(after < 0.5 * before, `the 5th harmonic dulled: ${before} → ${after}`);
  let jump = 0, typ = 0;
  for (let i = 0.4 * FS; i < 0.7 * FS; i++) { jump = Math.max(jump, Math.abs(L[i] - L[i - 1])); }
  for (let i = 0.2 * FS; i < 0.4 * FS; i++) typ = Math.max(typ, Math.abs(L[i] - L[i - 1]));
  assert.ok(jump < 1.5 * typ, `largest step ${jump} vs ${typ} before`);
});
test('MPE: a slide is that pulsar\'s own DM, and leaves the others alone; a bend, its binary orbit\'s Doppler shift, reaches 10 ¢', () => {
  const p = P({ dedisp: 'none', dm: 0.5 }), a = 60, b = 67, fa = tunedFreq(p, a), fb = tunedFreq(p, b);
  const [L] = render(p, 1, [[0, (e) => { e.handle({ type: 'slide', key: a, value: 5 }); e.noteOn(a, 0.8); e.noteOn(b, 0.8); }]]);
  const [L0] = render(p, 1, [[0, (e) => { e.noteOn(a, 0.8); e.noteOn(b, 0.8); }]]);
  assert.ok(tone(L, 3 * fa, 0.3 * FS, FS) < 0.5 * tone(L0, 3 * fa, 0.3 * FS, FS), 'its own smear');
  near(tone(L, 3 * fb, 0.3 * FS, FS) / tone(L0, 3 * fb, 0.3 * FS, FS), 1, 0.02, 'the other untouched');
  const [B] = render(p, 0.5, [[0, (e) => { e.handle({ type: 'noteBend', key: a, value: 1.5 }); e.noteOn(a, 0.8); }]]);
  const got = peak(B, fa, 0.2 * FS, 0.5 * FS);
  assert.ok(Math.abs(cents(got, fa) - 10) < 1, `a spin does not bend; its orbit's Doppler shift goes as far as 10 ¢: ${cents(got, fa).toFixed(2)} ¢`);
});
test('level: a forte note peaks under 0.6, a ten-note chord stays finite, and every preset plays', () => {
  const [L, R] = note(45, P(), 1, 1);
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  assert.ok(pk > 0.1 && pk < 0.6, `peak ${pk}`);
  for (const pr of PRESETS) {
    const [A, B] = render({ ...DEFAULTS, ...pr.p }, 0.6, Array.from({ length: 10 }, (_, i) => [0, (e) => e.noteOn(40 + 5 * i, 1)]));
    for (let i = 0; i < A.length; i++) assert.ok(Number.isFinite(A[i]) && Number.isFinite(B[i]) && Math.abs(A[i]) < 4, `${pr.name}: sample ${i}`);
    assert.ok(rms(A, 0.3 * FS) > 1e-4, `${pr.name}: plays`);
  }
});
test('silence after release: a switched-off pulsar is gone (and its voice too)', () => {
  const [L, , e] = render(P(), 1.5, [[0, (x) => x.noteOn(60, 0.8)], [0.5, (x) => x.noteOff(60)]]);
  assert.ok(rms(L, 0.7 * FS, 1.5 * FS) < 1e-6, `tail ${rms(L, 0.7 * FS, 1.5 * FS)}`);
  assert.equal(e.voiceCount(), 0);
  const p = P({ dedisp: 'none', dm: 0.3, freq: 300 }), [A, B, e2] = render(p, 3, [[0, (x) => x.noteOn(28, 0.8)], [1, (x) => x.noteOff(28)]]);
  assert.ok(rms(B, 1.004 * FS, 1.01 * FS) > 1e-3, 'undedispersed, the last pulses are still coming down the band\'s lower half');
  void A;
  assert.equal(e2.voiceCount(), 0, 'and gone by 3 s');
});
test('Quality: Medium and Low play 16 and 8 pulsars at once (High 32), in tables of 2048 and 1024; a middle note sounds nearly the same', () => {
  for (const [q, most, size] of [['high', 32, 4096], ['medium', 16, 2048], ['low', 8, 1024]]) {
    const [, , e] = render(P(), 0.1, [[0, (x) => { x.setQuality(q); for (let i = 0; i < 40; i++) x.noteOn(30 + i, 0.8); }]]);
    assert.equal(e.voiceCount(), most, q);
    assert.equal(probe.tableSize(e, 69), size, `${q} table`);
  }
  const one = (q) => note(60, P(), 0.5, 0.8, [], q)[0];
  const H = one('high'), Lo = one('low');
  let d = 0; for (let i = 0; i < H.length; i++) d += (H[i] - Lo[i]) ** 2;
  assert.ok(Math.sqrt(d / H.length) < 0.01 * rms(H), `middle C at Low differs by ${Math.sqrt(d / H.length)}`);
});
test('CPU: twenty held pulsars render well faster than real time', () => {
  const t0 = performance.now();
  render(P({ jitter: 0.3 }), 2, Array.from({ length: 20 }, (_, i) => [0.01 * i, (e) => e.noteOn(30 + 3 * i, 0.8)]));
  const ms = performance.now() - t0;
  assert.ok(ms < 2000 * 0.3, `${ms.toFixed(0)} ms for 2 s`);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
