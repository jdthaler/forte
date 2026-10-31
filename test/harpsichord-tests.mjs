// Harpsichord checks. Run: node test/harpsichord-tests.mjs
//
// The string against stiff-string theory, the scale, the temperaments and the
// cantilever against beam theory; the pluck against an ideal pluck, energy
// conservation and an independent quasi-static solution; then the engine
// against the model: tuning, the comb, the registers, touch, dampers, voices,
// levels and stability. Both are the C++ (native/instruments/harpsichord),
// built as WebAssembly: the model through harpsichord-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT } from '../harpsichord/src/harpsichord-instrument.js';
import { wasmModel } from '../harpsichord/src/harpsichord-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS, KEY_LO, KEY_HI, ROWS, BUILDS } from '../harpsichord/src/harpsichord-params.js';

const HarpsichordEngine = await loadEngine(INSTRUMENT);
const {
  stringDesign, stringLength, stringPartials, isBrass, simulatePluck, pluckPoint, registration, beamC, beamG, beamPhi, bridgePoint, nutPoint, boardAdmittance,
} = await wasmModel();

// What the checks compare against, stated here rather than read from the model: the wires'
// elastic constants and densities (iron as soft steel; brass), c² = C5 (the scale's reference),
// the Pythagorean comma, and the jacks' fall for a release velocity (harpsichord-model.h).
const WIRE = { iron: { E: 2.0e11, rho: 7850 }, brass: { E: 1.0e11, rho: 8500 } };
// Gut (Woodhouse & Lynch-Aird 2019, Table I): E = 6 GPa, ρ = 1320 kg/m³, the modulus's loss factor 0.04.
const GUT = { E: 6.0e9, rho: 1320, etaE: 0.04 };
// Air's drag on a thread of diameter d (the model's, harpsichord-model.cpp: Stokes's with a boundary layer).
const airSigma = (S, f) => (2 * Math.PI * 1.8e-5 + 2 * Math.PI * S.d * Math.sqrt(Math.PI * 1.8e-5 * 1.2 * f)) / (2 * S.mu);
const C2 = 72, PYTH_COMMA = 1200 * Math.log2(3 ** 12 / 2 ** 19);
const fallSpeed = (r) => 0.035 * 10 ** r;
// The 8′ target pitch of key m: the back 8′ string's fundamental without the tuner's spread.
const keyPitch = (m, p) => stringDesign(m, 'back', { ...p, detune: 0 }).f0;
// Partial n of a stiff string, fₙ = n f₁ √((1 + Bn²)/(1 + B)) (checked against the model below).
const partialFreq = (S, n) => n * S.f0 * Math.sqrt((1 + S.B * n * n) / (1 + S.B));

// The quasi-static pluck, to check the engine's release against: raise the jack slowly; at each
// height y find the equilibrium of string (static compliance Cs, lateral stiffness Kz) and
// plectrum (the model's cantilever: beamC, beamG, beamPhi), with stick–slip friction; stop where
// the string passes the tip. A string at material point s under force F sits at z = s − F²Φ(s);
// the plectrum's sideways push lies within the friction cone F tan(θ ± φ), tan θ = F g(s), tan φ = μ.
function quasiStaticRelease(pl, Cs, Kz, { yMax = 0.02, dy = 2e-7 } = {}) {
  const lateralZ = (ss, F) => ss - F * F * beamPhi(pl, ss);
  const coneLo = (ss, F) => { const tt = F * beamG(pl, ss); return (tt - pl.mu) / (1 + pl.mu * tt); };
  const forceAt = (y, ss) => y / (beamC(pl, ss) + Cs);
  let s = pl.s0;
  for (let y = dy; y < yMax; y += dy) {
    let F = forceAt(y, s);
    if (Kz * (lateralZ(s, F) - pl.s0) < F * coneLo(s, F)) {
      // slides towards the tip: K_z(z(s) − z₀) = F(s) tan(θ(s) − φ)
      const gfun = (ss) => { const Fs = forceAt(y, ss); return Kz * (lateralZ(ss, Fs) - pl.s0) - Fs * coneLo(ss, Fs); };
      if (gfun(pl.len) < 0) return { F, y, u: Cs * F, w: F * beamC(pl, s), s };
      let a = s, b = pl.len;
      for (let it = 0; it < 60; it++) { const m = 0.5 * (a + b); if (gfun(m) < 0) a = m; else b = m; }
      s = 0.5 * (a + b); F = forceAt(y, s);
    }
  }
  return null;
}
// Closed form, for a uniform plectrum without foreshortening, when the string stays put until it
// reaches the tip: K_z o = F (F g_ℓ − μ)/(1 + μ F g_ℓ), g_ℓ = ℓ²/2EI, so
// g F² − μ(1 + K_z o g) F − K_z o = 0;  μ = 0: F = √(2 EI K_z o)/ℓ.
function releaseForceClosed(EI, len, Kz, o, mu = 0) {
  const g = (len * len) / (2 * EI), bq = mu * (1 + Kz * o * g);
  return (bq + Math.sqrt(bq * bq + 4 * g * Kz * o)) / (2 * g);
}
// A uniform plectrum (taper 0) of tip stiffness kTip, by beam theory: EI = kTip ℓ³/3.
const uniform = (kTip, overlap, mu = 0, fore = 1, len = 3.5e-3) => ({ len, overlap, s0: len - overlap, kTip, EI0: (kTip * len ** 3) / 3, tau: 0, mu, fore });

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${what} ${a} vs ${b} (±${(tol * 100).toFixed(2)} %)`);
// One row alone: lower manual, coupler off, only that register (the lute plays from the upper manual).
const solo = (row, o = {}) => P({ manual: ROWS[row].manual, coupler: false, front8: row === 'front', back8: row === 'back', four: row === 'four', lute: row === 'lute', detune: 0, ...o });

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key, relVel?] | [t, 'params', P] | [t, 'msg', m]),
// in 128-sample blocks like the AudioWorklet; tap(engine, s) after every block.
function run(params, events, sec, { fs = FS, tap } = {}) {
  const e = new HarpsichordEngine(fs);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a, b); else if (type === 'params') e.setParams(a); else if (type === 'msg') e.handle(a); else if (type === 'panic') e.allNotesOff();
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, s);
  }
  return Object.assign(L, { R, engine: e });
}
// |DTFT| of x[a, b) at f, Hann-windowed.
function tone(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im) / ((b - a) / 4);
}
// The strongest peak in [f0, f1] (golden-section on |DTFT| after a coarse scan).
function peak(x, f0, f1, a, b, fs = FS) {
  let best = f0, bv = -1;
  const step = (f1 - f0) / 24;
  for (let f = f0; f <= f1; f += step) { const v = tone(x, f, a, b, fs); if (v > bv) { bv = v; best = f; } }
  let lo = best - step, hi = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 32; it++) { const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo); if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
const peakAbs = (x, a = 0, b = x.length) => { let p = 0; for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i])); return p; };
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// The power of partials n0–n1 of string S against its fundamental (dB), over 0.25 s from t.
function band(x, S, t, n0, n1) {
  const a = Math.round(t * FS), b = a + Math.round(0.25 * FS), p1 = tone(x, partialFreq(S, 1), a, b) ** 2;
  let s = 0;
  for (let n = n0; n <= n1; n++) { const f = partialFreq(S, n); if (f > 12000) break; s += tone(x, f, a, b) ** 2; }
  return 10 * Math.log10(s / p1);
}
// Spectral centroid (Hz) of x[a, b) over the first 40 partials of string S (they are stretched: Bn²).
function centroid(x, S, a, b, n = 40) {
  let s = 0, w = 0;
  for (let k = 1; k <= n; k++) { const f = partialFreq(S, k); if (f > 12000) break; const v = tone(x, f, a, b) ** 2; s += v * f; w += v; }
  return s / w;
}
// Free-oscillation amplitude of partial i of a string (exact for an undamped partial).
const amp = (st, i) => { const w = st.W[i], c = Math.cos(w * st.h), a = st.q[i], b = st.q1[i]; return Math.sqrt(Math.max(0, a * a - 2 * c * a * b + b * b)) / Math.abs(Math.sin(w * st.h)); };
const lossless = { loss: 1e-9, bridgeScale: 0 };

console.log('the strings');
test('stiff string: fₙ = n f₁ √((1 + Bn²)/(1 + B)), B = π²EI/TL² = π³Ed⁴/64TL² (Fletcher 1964); at a fixed pitch and length B ∝ d², and ∝ 1/T at a fixed wire', () => {
  for (const [m, ch] of [[29, 'back'], [60, 'back'], [89, 'four']]) {
    const p = P({ fmax: 16 }), S = stringDesign(m, ch, p), parts = stringPartials(S, p).partials;
    near(S.B, (Math.PI ** 3 * WIRE[S.mat.name].E * S.d ** 4) / (64 * S.T * S.L * S.L), 1e-12, 'B');
    near(parts[0].f, S.f0, 1e-12, 'f₁ on target');
    for (const { n, f } of parts.slice(1)) near(f, partialFreq(S, n), 1e-12, `f${n}`);
  }
  // the same string, twice as thick: T ∝ d² at a fixed pitch, so B ∝ d⁴/T ∝ d²
  const S = stringDesign(60, 'back', P()), { E, rho } = WIRE[S.mat.name], f = S.f0, L = S.L;
  const B = (d) => { const mu = (rho * Math.PI * d * d) / 4, EI = (E * Math.PI * d ** 4) / 64, T = 4 * L * L * f * f * mu - (EI * Math.PI ** 2) / (L * L); return (Math.PI ** 2 * EI) / (T * L * L); };
  near(B(2 * S.d) / B(S.d), 4, 2e-3, 'B(2d)/B(d)');
  near(B(S.d), S.B, 1e-9, 'B from the wire');
  // and at a fixed wire, a 415 Hz tuning (T × 0.89) raises B by 1/0.89
  const S4 = stringDesign(60, 'back', P({ pitch: 415 }));
  near(S4.B / S.B, S.T / S4.T, 1e-9, 'B ∝ 1/T');
  near(S4.T / S.T, (415 / 440) ** 2, 2e-3, 'T ∝ f²');
  assert.ok(S.B > 5e-6 && S.B < 1e-4, `C4: B = ${S.B}`);
});
test('the scale: c² is 355 mm and the treble Pythagorean (L·f constant, iron at σ = 4ρ(Lf)² = 1.08 GPa); the bass foreshortened (FF 1.65 m) and brass up to A; tensions 20–63 N', () => {
  near(stringLength(C2, 'back'), 0.355, 1e-12, 'c²'); near(stringLength(C2, 'four'), 0.1775, 1e-12, '4′ c²');
  for (const m of [72, 77, 84, 89]) { const S = stringDesign(m, 'back', P({ detune: 0 })); near(S.L * S.f0, 0.355 * keyPitch(72, P()), 0.015, `L·f at ${m}`); near(S.stress, 4 * WIRE[S.mat.name].rho * (S.L * S.f0) ** 2, 0.01, 'σ'); }
  near(stringDesign(C2, 'back', P({ detune: 0 })).stress, 1.08e9, 0.01, 'iron stress at c²');
  assert.ok(stringLength(KEY_LO, 'back') < 1.7 && stringLength(KEY_LO, 'back') > 1.5, `FF ${stringLength(KEY_LO, 'back')}`);
  assert.ok(isBrass(45, 'back') && !isBrass(46, 'back') && isBrass(40, 'four') && !isBrass(41, 'four'));
  for (let m = KEY_LO; m <= KEY_HI; m++) for (const ch of ['back', 'four']) {
    const S = stringDesign(m, ch, P());
    assert.ok(S.T > 19.5 && S.T < 63, `${m} ${ch}: T = ${S.T.toFixed(1)} N`);
    assert.ok(S.stress < (S.mat.name === 'brass' ? 0.75e9 : 1.15e9), `${m} ${ch}: σ = ${(S.stress / 1e9).toFixed(2)} GPa`);
  }
});
test('temperaments: ¼-comma meantone has pure major thirds (386.31 ¢) and 696.58 ¢ fifths, with the wolf G♯–E♭; Werckmeister III and equal close the circle', () => {
  // each pitch class's cents above C, from the keys' target pitches
  const cents12 = (temperament) => Array.from({ length: 12 }, (_, pc) => cents(keyPitch(60 + pc, P({ temperament })), keyPitch(60, P({ temperament }))));
  const c = cents12('meantone'), iv = (a, b) => (((c[b] - c[a]) % 1200) + 1200) % 1200;
  for (const [a, b] of [[0, 4], [5, 9], [7, 11], [2, 6], [9, 1], [3, 7], [10, 2]]) near(iv(a, b), 1200 * Math.log2(5 / 4), 1e-9, `third ${a}–${b}`);
  for (const [a, b] of [[0, 7], [7, 2], [3, 10]]) near(iv(a, b), 696.578, 1e-5, `fifth ${a}–${b}`);
  assert.ok(Math.abs(iv(8, 3) - 737.64) < 0.01, `wolf ${iv(8, 3)}`);
  const w = cents12('werckmeister'), iw = (a, b) => (((w[b] - w[a]) % 1200) + 1200) % 1200;
  near(iw(0, 7), 701.955 - PYTH_COMMA / 4, 1e-6, 'C–G'); near(iw(11, 6), 701.955 - PYTH_COMMA / 4, 1e-6, 'B–F♯'); near(iw(5, 0), 701.955, 1e-6, 'F–C pure');
  for (let m = KEY_LO; m <= KEY_HI; m++) assert.ok(Math.abs(cents(keyPitch(m, P({ temperament: 'equal' })), 440 * 2 ** ((m - 69) / 12))) < 1e-9, `equal ${m}`);
  near(keyPitch(69, P({ temperament: 'meantone' })), 440, 1e-12, 'meantone keeps A');
  near(keyPitch(69, P({ pitch: 415, temperament: 'meantone' })), 415, 1e-12, 'A stays the pitch standard');
});

console.log('the plectrum and the pluck');
test('cantilever: a uniform plectrum has c(s) = s³/3EI, slope g(s) = s²/2EI and foreshortening 0.6 w²/s (beam theory), within 0.5 %; a tapered one bends more near its tip', () => {
  const u = uniform(2500, 0.6e-3), EI = u.EI0, L = u.len;
  for (const s of [0.5 * L, 0.8 * L, L]) {
    near(beamC(u, s), s ** 3 / (3 * EI), 5e-3, `c(${s})`);
    near(beamG(u, s), s ** 2 / (2 * EI), 5e-3, `g(${s})`);
    const F = 2, w = F * beamC(u, s);
    near(F * F * beamPhi(u, s), (0.6 * w * w) / s, 5e-3, 'foreshortening');
  }
  near(1 / beamC(u, L), 2500, 5e-3, 'tip stiffness');
  // the plectra the model cuts: their tip stiffness is the voicing
  for (const material of ['delrin', 'quill']) {
    const { pl } = simulatePluck(72, 'back', solo('back', { material, stiff: 2500 }), { V: 0.08, sec: 0.01 });
    near(1 / beamC(pl, pl.len), pl.kTip, 1e-9, `${material} tip stiffness`);
    if (material === 'quill') assert.ok(pl.tau > 0 && beamC(pl, 0.6 * pl.len) / beamC(pl, pl.len) < beamC(u, 0.6 * u.len) / beamC(u, u.len), 'the quill’s compliance is concentrated towards its tip');
  }
});
test('ideal pluck: slow and frictionless, the string is let go from its static shape — partial amplitudes ∝ sin(nπx_p/L)/(n²(1 + Bn²)) within 1.5 % (within 0.3 % of the fundamental for every partial)', () => {
  for (const [m, row] of [[72, 'back'], [60, 'front'], [48, 'back'], [36, 'back']]) {
    const p = solo(row, { mu: 0, stiff: 4000, ...lossless }), r = simulatePluck(m, row, p, { V: 0.01, sec: 1.0, until: 0.002 });
    assert.ok(r.released !== null, 'released');
    const st = r.st, S = stringDesign(m, ROWS[row].string, p), x = r.x, A1 = amp(st, 0), pred = (n) => Math.abs(Math.sin((n * Math.PI * x) / S.L)) / (n * n * (1 + S.B * n * n));
    for (let i = 1; i < Math.min(20, st.N); i++) {
      const want = pred(i + 1) / pred(1), got = amp(st, i) / A1;
      assert.ok(Math.abs(got - want) < 3e-3, `${m} ${row} partial ${i + 1}: ${got.toFixed(5)} vs ${want.toFixed(5)}`);
      if (want > 0.05) assert.ok(Math.abs(got / want - 1) < 0.015, `${m} ${row} partial ${i + 1}: ${((got / want - 1) * 100).toFixed(2)} %`);
    }
  }
});
test('energy: the string carries the work the plectrum did on it, ∫F du, to 2 % at 48 kHz (the discretisation: 0.4 % at 96, 0.1 % at 192 kHz); a slow push stores ½F²C (C its static compliance)', () => {
  for (const [m, row, mu] of [[72, 'back', 0], [60, 'front', 0.3], [36, 'back', 0.2], [60, 'four', 0.3]]) {
    const r = simulatePluck(m, row, solo(row, { mu, ...lossless }), { V: 0.02, sec: 0.8, until: 0.003 });
    const E = r.st.energy(), W = r.st.work;
    near(E, W, 0.02, `${m} ${row}: E vs W`);
    near(E, 0.5 * r.rel.F ** 2 * r.st.staticCompliance, 0.03, `${m} ${row}: ½F²C`);
  }
  const err = (fs) => { const r = simulatePluck(72, 'back', solo('back', { mu: 0, ...lossless }), { V: 0.02, sec: 0.8, until: 0.003, fs }); return Math.abs(r.st.energy() / r.st.work - 1); };
  const e48 = err(48000), e96 = err(96000), e192 = err(192000);
  assert.ok(e96 < 0.3 * e48 && e192 < 0.3 * e96 && e192 < 2e-3, `|E/W − 1|: ${e48.toExponential(1)}, ${e96.toExponential(1)}, ${e192.toExponential(1)}`);
});
test('the release: the engine lets go where the quasi-static equilibrium does (force within 2 %), Delrin and quill, with and without friction', () => {
  for (const [m, row, mat, mu] of [[72, 'back', 'delrin', 0], [72, 'front', 'quill', null], [48, 'back', 'delrin', null], [84, 'four', 'quill', 0.5]]) {
    const p = solo(row, { material: mat, mu, ...lossless });
    const r = simulatePluck(m, row, p, { V: 0.01, sec: 1.5, until: 0.001 });
    const qs = quasiStaticRelease(r.pl, r.st.staticCompliance, r.st.Kz);
    near(r.rel.F, qs.F, 0.02, `${m} ${row} ${mat}: release force`);
    near(r.rel.s, r.pl.len, 0.01, 'at the tip');
  }
});
test('release force grows as √(EI): frictionless F = √(2EI K_z o)/ℓ, with friction the root of gF² − μ(1 + K_z o g)F − K_z o = 0 (g = ℓ²/2EI); stiffer plectra let go later, after (u + w)/V', () => {
  const S = stringDesign(72, 'back', solo('back')), x = pluckPoint(72, 'back', solo('back')), Kz = (S.T * S.L) / (x * (S.L - x));
  const { st, pl: cut } = simulatePluck(72, 'back', solo('back'), { V: 0.08, sec: 0.01 }), Cs = st.staticCompliance;
  near(st.Kz, Kz, 1e-9, 'the string’s lateral stiffness T L/(x(L − x))');
  let prevF = 0, prevT = 0;
  for (const k of [1000, 2000, 3500, 5000]) {
    for (const mu of [0, 0.25]) {
      const pl = uniform(k, 0.3e-3, mu, 0, cut.len);
      const qs = quasiStaticRelease(pl, Cs, Kz);
      near(qs.F, releaseForceClosed(pl.EI0, pl.len, Kz, pl.overlap, mu), 0.01, `k = ${k}, μ = ${mu}`);
      if (mu === 0) near(releaseForceClosed(pl.EI0, pl.len, Kz, pl.overlap), Math.sqrt(2 * pl.EI0 * Kz * pl.overlap) / pl.len, 1e-9, 'μ = 0 form');
    }
    const p = solo('back', { stiff: k, overlap: 0.4, ...lossless });
    const V = 0.05, r = simulatePluck(72, 'back', p, { V, sec: 0.5, until: 0.001 });
    const tTouch = r.trace.t[r.trace.F.findIndex((f) => f > 0)], dt = r.released - tTouch;
    near(dt, (r.rel.u + r.rel.w) / V, 0.05, `k = ${k}: time from touch to release`);
    assert.ok(r.rel.F > prevF && dt > prevT, `stiffer lets go later and harder (k = ${k})`);
    prevF = r.rel.F; prevT = dt;
  }
});

console.log('the engine');
test('tuning: every key FF–f³ sounds within ±2 ¢ of its target (back 8′, 48 kHz; every fourth key at 44.1 kHz), the 4′ an octave above, in meantone at A = 415 too', () => {
  // the linear string's tuning: tension modulation starts a pluck sharp (its own test)
  const p = solo('back', { soundboard: false, kc: false });
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const x = run(p, [[0, 'on', m, 0.7]], 0.75), f = keyPitch(m, p), a = Math.round(0.15 * FS), b = x.length;
    const got = peak(x, f * 2 ** (-12 / 1200), f * 2 ** (12 / 1200), a, b);
    assert.ok(Math.abs(cents(got, f)) < 2, `${m}: ${cents(got, f).toFixed(2)} ¢`);
  }
  for (let m = KEY_LO; m <= KEY_HI; m += 4) {
    const fs = 44100, x = run(p, [[0, 'on', m, 0.7]], 0.75, { fs }), f = keyPitch(m, p);
    const got = peak(x, f * 2 ** (-12 / 1200), f * 2 ** (12 / 1200), Math.round(0.15 * fs), x.length, fs);
    assert.ok(Math.abs(cents(got, f)) < 2, `${m} at 44.1 kHz: ${cents(got, f).toFixed(2)} ¢`);
  }
  for (const m of [41, 60, 76]) {
    const p4 = solo('four', { soundboard: false, kc: false }), x = run(p4, [[0, 'on', m, 0.7]], 0.6), f = 2 * keyPitch(m, p4);
    const got = peak(x, f * 0.99, f * 1.01, Math.round(0.1 * FS), x.length);
    assert.ok(Math.abs(cents(got, f)) < 2, `4′ ${m}: ${cents(got, f).toFixed(2)} ¢ from the octave`);
    assert.ok(tone(x, f / 2, 4800, x.length) < 0.05 * tone(x, f, 4800, x.length), 'nothing at the 8′ pitch');
  }
  const pm = solo('back', { soundboard: false, pitch: 415, temperament: 'meantone', kc: false });
  for (const m of [60, 64, 68, 63]) {
    const x = run(pm, [[0, 'on', m, 0.7]], 0.6), f = keyPitch(m, pm), got = peak(x, f * 0.993, f * 1.007, 4800, x.length);
    assert.ok(Math.abs(cents(got, f)) < 2, `meantone ${m}: ${cents(got, f).toFixed(2)} ¢`);
  }
});
test('the comb: plucked at 1/5 of its length (and its multiples), c²’s 5th and 10th partials are missing from the sound; the model’s comb predicts every partial within 2 dB', () => {
  // read at the linear string's partials, which tension modulation would move off while the pluck rings
  const L = stringLength(72, 'back'), p = solo('back', { soundboard: false, xBack: (L / 5) * 1000, kc: false });
  const x = run(p, [[0, 'on', 72, 0.7]], 0.5), S = stringDesign(72, 'back', p), a = 2400, b = x.length;
  const lev = (n) => tone(x, partialFreq(S, n), a, b);
  assert.ok(lev(5) < 0.03 * Math.min(lev(4), lev(6)), `5th: ${(20 * Math.log10(lev(5) / lev(4))).toFixed(1)} dB re 4th`);
  assert.ok(lev(10) < 0.05 * Math.min(lev(9), lev(11)), '10th');
  // others: ∝ sin(nπβ)/n (bridge force), times each partial's own decay over the window
  const parts = stringPartials(S, p).partials;
  for (const n of [1, 2, 3, 4, 6, 7]) {
    const w = (k) => Math.abs(Math.sin(k * Math.PI / 5)) / k * Math.exp(-parts[k - 1].sigma * (a + b) / 2 / FS);
    const want = 20 * Math.log10(w(n) / w(1)), got = 20 * Math.log10(lev(n) / lev(1));
    assert.ok(Math.abs(got - want) < 2, `partial ${n}: ${got.toFixed(1)} dB vs ${want.toFixed(1)} dB`);
  }
});
test('registers: the front 8′ is brighter than the back, the lute brighter still with a weak fundamental; the buff kills the upper partials (×5 faster) but hardly the fundamental; manuals and coupler pick the right jacks', () => {
  const m = 60, f = keyPitch(m, P()), a = 2400, b = Math.round(0.4 * FS), S = stringDesign(m, 'back', solo('back'));
  // read at the linear string's partials (kc: false), which tension modulation would move off while the pluck rings
  const go = (row, o = {}) => run(solo(row, { soundboard: false, kc: false, ...o }), [[0, 'on', m, 0.7]], 0.4);
  const cB = centroid(go('back'), S, a, b), cF = centroid(go('front'), stringDesign(m, 'front', solo('front')), a, b), xl = go('lute'), cL = centroid(xl, S, a, b);
  assert.ok(cF > 1.15 * cB && cL > 1.3 * cF, `centroids back ${cB.toFixed(0)}, front ${cF.toFixed(0)}, lute ${cL.toFixed(0)} Hz`);
  const xb = go('back');
  const fund = (x) => tone(x, f, a, b) / rms(x, a, b);
  assert.ok(fund(xl) < 0.7 * fund(xb), `the lute’s fundamental is weak: ${fund(xl).toFixed(2)} vs ${fund(xb).toFixed(2)} of the rms`);
  // the buff: decay of partials 1 and 8 with and without it
  const dec = (x, k) => 20 * Math.log10(tone(x, k * f, Math.round(0.6 * FS), Math.round(1.0 * FS)) / tone(x, k * f, Math.round(0.1 * FS), Math.round(0.5 * FS)));
  // (the held key's other strings, free of their dampers, would ring along unbuffed: left out)
  const plain = run(solo('back', { soundboard: false, kc: false, sympathy: 0 }), [[0, 'on', m, 0.7]], 1.0), buff = run(solo('back', { soundboard: false, buff: true, kc: false, sympathy: 0 }), [[0, 'on', m, 0.7]], 1.0);
  assert.ok(dec(buff, 8) < 5 * dec(plain, 8) || dec(buff, 8) < -40, `8th partial: ${dec(plain, 8).toFixed(1)} → ${dec(buff, 8).toFixed(1)} dB per 0.5 s`);
  assert.ok(dec(buff, 1) > dec(plain, 1) - 3, `fundamental: ${dec(plain, 1).toFixed(1)} → ${dec(buff, 1).toFixed(1)} dB per 0.5 s`);
  // registration
  const r = (o) => registration(P(o)).rows.sort().join(' ');
  assert.equal(r({}), 'back front');
  assert.equal(r({ coupler: false }), 'back');
  assert.equal(r({ manual: 'upper' }), 'front');
  assert.equal(r({ four: true, coupler: false }), 'back four');
  assert.equal(r({ lute: true, manual: 'upper' }), 'front lute');
  assert.equal(r({ lute: true }), 'front lute');
  assert.deepEqual(registration(P({ manual: 'upper' })).lift, { front: true, back: true, four: false });
});
test('touch: on one choir, pp to ff changes the level by under 3 dB and the brightness a little (the plectrum lets go where it lets go); faster keys pluck sooner and knock louder', () => {
  const m = 60, S = stringDesign(m, 'back', solo('back')), go = (v, o = {}) => run(solo('back', o), [[0, 'on', m, v]], 0.5);
  const lo = go(0.1), hi = go(1);
  const t0 = (x) => x.findIndex((v) => Math.abs(v) > 1e-3);
  const a = t0(lo), b = t0(hi), W = Math.round(0.3 * FS);
  const dB = 20 * Math.log10(rms(hi, b, b + W) / rms(lo, a, a + W));
  assert.ok(dB > 0 && dB < 3, `pp → ff: ${dB.toFixed(2)} dB`);
  const cl = centroid(lo, S, a, a + W), ch = centroid(hi, S, b, b + W);
  assert.ok(ch > cl && ch < cl * 1.3, `centroid ${cl.toFixed(0)} → ${ch.toFixed(0)} Hz`);
  assert.ok(b < a, 'a faster key plucks sooner');
  const knock = (v) => rms(run(solo('back', { back8: false }), [[0, 'on', m, v]], 0.3), 0, Math.round(0.3 * FS));
  assert.ok(knock(1) > 5 * knock(0.1), 'the key knock grows with speed');
});
test('dampers: key up stops the note (−40 dB within 0.35 s from C4 up, −25 dB at C3, the bass more slowly); the plectrum passes back under the string; a quicker release (MIDI release velocity) thumps louder', () => {
  for (const [m, want] of [[48, -25], [60, -40], [72, -40], [84, -40]]) {
    const x = run(P(), [[0, 'on', m, 0.7], [0.5, 'off', m]], 0.9), before = rms(x, Math.round(0.4 * FS), Math.round(0.5 * FS)), after = rms(x, Math.round(0.75 * FS), Math.round(0.85 * FS));
    assert.ok(20 * Math.log10(after / before) < want, `${m}: ${(20 * Math.log10(after / before)).toFixed(1)} dB`);
  }
  const x = run(P(), [[0, 'on', 36, 0.7], [0.5, 'off', 36]], 1.2), d = 20 * Math.log10(rms(x, Math.round(1.05 * FS), Math.round(1.15 * FS)) / rms(x, Math.round(0.4 * FS), Math.round(0.5 * FS)));
  assert.ok(d < -20, `C2 damps: ${d.toFixed(1)} dB in 0.6 s`);
  // the plectra are back under their strings, ready to pluck again
  const e = run(P(), [[0, 'on', 60, 0.7], [0.3, 'off', 60]], 0.45).engine, v = e.byKey.get(60);
  assert.ok(!v || ['back', 'front'].every((c) => v.strings[c].phase[0] === 'under'), 'plectra back under');
  // thump: the same note released slowly and quickly, energy just after the dampers land
  const thump = (r) => { const y = run(P({ room: 0 }), [[0, 'on', 55, 0.7], [0.3, 'off', 55, r]], 0.6), base = run(P({ room: 0 }), [[0, 'on', 55, 0.7]], 0.6); let s = 0; for (let i = Math.round(0.3 * FS); i < Math.round(0.42 * FS); i++) s += (y[i] - base[i]) ** 2; return s; };
  const slow = thump(0.1), quick = thump(1);
  assert.ok(quick > 2 * slow, `release thump ${(10 * Math.log10(quick / slow)).toFixed(1)} dB louder when quick`);
  // the note-off's release velocity sets the jacks' fall; none gives the default
  const quickOff = run(P(), [[0, 'on', 55, 0.7], [0.3, 'off', 55, 1]], 0.4).engine;
  assert.ok(Math.abs(quickOff.voices[0].vDown - fallSpeed(1)) < 1e-12, 'release velocity from the note-off');
});
test('re-plucking a sounding key plucks the same strings (no second voice), even quickly; physics knobs give the next press new strings and fade the old', () => {
  let maxV = 0, plucks = 0;
  const x = run(P(), [[0, 'on', 60, 0.7], [0.2, 'off', 60], [0.24, 'on', 60, 0.7], [0.3, 'off', 60], [0.31, 'on', 60, 0.7], [0.5, 'on', 60, 0.7]], 1.0, {
    tap: (e) => { maxV = Math.max(maxV, e.voiceCount()); if (!e._l) { e._l = true; e.listeners.push((m) => { if (m.type === 'pluck') plucks++; }); } },
  });
  assert.equal(maxV, 1, 'one voice');
  assert.ok(plucks >= 6, `${plucks} plucks (2 strings × 3 presses, and the repeated note-on)`);
  assert.ok(peakAbs(x, Math.round(0.9 * FS)) > 0.01, 'still sounding');
  let v2 = 0;
  run(P(), [[0, 'on', 60, 0.7], [0.2, 'params', P({ detune: 5 })], [0.25, 'on', 60, 0.7]], 0.4, { tap: (e) => { v2 = Math.max(v2, e.voiceCount()); } });
  assert.equal(v2, 2, 'a retuned key gets new strings; the old voice fades');
});
test('voice stealing: past 16 keys the quietest released one fades out (no click); a key that has not sounded yet is never taken', () => {
  const ev = [];
  for (let i = 0; i < 24; i++) ev.push([0.02 * i, 'on', 36 + i, 0.7], [0.02 * i + 0.05, 'off', 36 + i]);
  ev.push([0.6, 'on', 84, 0.05]); // a slow key: its jack is still rising when the next one comes
  ev.push([0.605, 'on', 85, 0.7]);
  let maxV = 0, slowSounded = false;
  const x = run(P({ room: 0 }), ev, 1.0, { tap: (e) => { maxV = Math.max(maxV, e.voices.filter((v) => !v.killing).length); const v = e.byKey.get(84); if (v && v.sounded) slowSounded = true; } });
  assert.ok(maxV <= 16, `${maxV} live voices`);
  assert.ok(slowSounded, 'the slow key was not stolen before it sounded');
  let jump = 0;
  for (let i = 1; i < x.length; i++) jump = Math.max(jump, Math.abs(x[i] - x[i - 1]));
  assert.ok(jump < 0.08, `largest sample step ${jump.toFixed(3)}`);
});
test('level: a forte note peaks at 0.1–0.5 across the keyboard at 44.1 and 48 kHz (8′ 8′, and with the 4′); full chords stay under 1', () => {
  for (const fs of [44100, 48000]) for (const four of [false, true]) for (const m of [29, 41, 53, 60, 65, 72, 81, 89]) {
    const x = run(P({ four }), [[0, 'on', m, 1]], 0.6, { fs }), pk = Math.max(peakAbs(x), peakAbs(x.R));
    assert.ok(pk > 0.1 && pk < 0.5, `${m} ${four ? '8 8 4' : '8 8'} at ${fs}: ${pk.toFixed(3)}`);
  }
  const ch = run(P({ four: true }), [41, 48, 53, 57, 60, 64, 67, 72].map((m) => [0, 'on', m, 1]), 1.0);
  assert.ok(Math.max(peakAbs(ch), peakAbs(ch.R)) < 1, `chord ${Math.max(peakAbs(ch), peakAbs(ch.R)).toFixed(3)}`);
});
test('sympathetic strings: a held key\'s strings ring along where their partials meet the sounding ones (the 4′ too, plucked or not), never with their own voice; damped ones, or after Panic, stay still', () => {
  // keys held and staccato notes; each string's group's energy (key, choir) after `sec` s
  // (play: the registration the struck notes are played with, after the keys are held)
  const run = (p, { held = [], strike = [], sec = 1, panic = false, play } = {}) => {
    const e = new HarpsichordEngine(FS);
    e.setParams({ ...p, sympathy: p.sympathy ?? 0.25 });
    const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
    e.process(L, R, bl);
    for (const k of held) e.noteOn(k, 0.5);
    if (play) e.setParams({ ...play, sympathy: p.sympathy ?? 0.25 });
    for (const k of strike) e.noteOn(k, 0.7);
    let peak = 0;
    for (let b = 0; b < Math.round((sec * FS) / bl); b++) {
      if (b === Math.round((0.3 * FS) / bl)) for (const k of strike) e.noteOff(k, -1);
      if (panic && b === Math.round((0.6 * FS) / bl)) e.allNotesOff();
      e.process(L, R, bl);
      for (let i = 0; i < bl; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
    return { E: (k, c) => e.sympathetic(k, c).energy, damped: (k, c) => e.sympathetic(k, c).damped, running: e.sympatheticRunning(), peak };
  };
  // keys held with every row off (they pluck nothing, but their jacks rise on the lower manual), then
  // the back 8′ alone
  const p = P({ front8: false, back8: false, four: false }), play = P({ front8: false, four: false });
  const c4 = run(p, { held: [60], strike: [72], play }), cs4 = run(p, { held: [61], strike: [72], play });
  assert.ok(c4.E(60, 'four') > 30 * cs4.E(61, 'four'), `C4 held, c5 struck: C4's 4′ (unplucked) ${c4.E(60, 'four').toExponential(2)}; C♯4's ${cs4.E(61, 'four').toExponential(2)}`);
  const upper = run(P({ manual: 'upper' }), { held: [60], strike: [72] });
  assert.ok(upper.damped(60, 'four') && upper.E(60, 'four') === 0, 'on the upper manual the 4′ jacks stay down: its dampers stay on');
  assert.ok(c4.damped(61, 'back') && c4.E(61, 'back') === 0, 'a key not held: dampers on');
  // the upper manual alone plucks the front 8′: a held string feels every voice but its own (here
  // only its back 8′, free under the lute's raised jack, feeds it back)
  const own = run(solo('front'), { held: [48] }), pair = run(solo('front'), { held: [48, 60] });
  assert.ok(own.E(48, 'front') < 1e-2 * pair.E(60, 'front'), `C3 held: its own string's group ${own.E(48, 'front').toExponential(2)}; C4's, held with it, ${pair.E(60, 'front').toExponential(2)}`);
  const off = run({ ...p, sympathy: 0 }, { held: [60], strike: [72], play });
  assert.ok(off.running === 0 && off.E(60, 'four') === 0, 'off: no group runs');
  const hush = run(p, { held: [48, 52, 55, 60], strike: [36], panic: true, play });
  for (const k of [48, 60]) assert.ok(hush.E(k, 'four') === 0 && hush.E(k, 'back') === 0, `after Panic: key ${k}'s groups`);
  const loud = run(P({ sympathy: 1 }), { held: [36, 40, 43, 48, 52, 55, 60, 64, 67, 72], strike: [24, 31], sec: 2 });
  assert.ok(Number.isFinite(loud.peak) && loud.peak < 2.5, `ten keys held at 100 %: peak ${loud.peak}`);
  console.log(`        (c5 struck: held C4's 4′ ${(c4.E(60, 'four') / cs4.E(61, 'four')).toFixed(0)} × held C♯4's; ${loud.running} partials ring with ten keys held)`);
});
test('Quality: Medium and Low sound fewer keys (16 and 10 held), make strings with fewer partials (none above 7 and 5 kHz but the first 16, none past the 64th and 40th), give the sympathetic strings 3 partials and none; a note keeps its pitch and level', () => {
  const fTop = { high: Infinity, medium: 7000, low: 5000 }, nTop = { high: Infinity, medium: 64, low: 40 }, hard = { high: 24, medium: 16, low: 10 };
  const p = P({ room: 0 }), res = {};
  // 20 keys held across the compass, plucked one after another
  const held = Array.from({ length: 20 }, (_, i) => 29 + 3 * i);
  for (const q of ['high', 'medium', 'low']) {
    const e = new HarpsichordEngine(FS);
    e.setQuality(q); e.setParams(p);
    const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
    let live = 0;
    for (const k of held) {
      e.noteOn(k, 0.7);
      for (let b = 0; b < 8; b++) {
        e.process(L, R, bl);
        for (let i = 0; i < bl; i++) assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), `${q}: not finite`);
      }
      live = Math.max(live, e.voices.filter((v) => !v.killing).length);
    }
    assert.ok(live <= hard[q], `${q}: ${live} keys sounding`);
    let strings = 0, partials = 0;
    for (const v of e.voices) for (const c of ['front', 'back']) {
      const st = v.strings[c];
      if (!st) continue;
      const all = stringPartials(stringDesign(v.key, c, p), p).partials;
      let want = 0;
      while (want < all.length && want < nTop[q] && (all[want].f < fTop[q] || want < 16)) want++;
      assert.equal(st.partials, want, `${q}: key ${v.key}'s ${c} 8′ runs ${st.partials} of ${all.length} partials`);
      strings++; partials += st.partials;
    }
    const size = Math.max(...held.map((k) => e.sympathetic(k, 'back').size));
    res[q] = { live, partials: partials / strings, size, running: e.sympatheticRunning() };
    e.destroy();
  }
  assert.ok(res.high.size === 16 && res.medium.size === 3 && res.low.size === 0 && res.low.running === 0, `sympathetic strings: ${res.high.size}, ${res.medium.size}, ${res.low.size} partials`);
  // single notes: the same pitch (a fraction of a cent) and level (within 1.5 dB: where the plectrum
  // lets go depends a little on every partial the string has)
  const dB = [], dc = [];
  for (const key of [41, 53, 65, 77]) {
    const x = {};
    for (const q of ['high', 'medium', 'low']) {
      const e = new HarpsichordEngine(FS);
      e.setQuality(q); e.setParams(p);
      const n = FS, out = new Float64Array(n), bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
      e.noteOn(key, 0.7);
      for (let s = 0; s < n; s += bl) { e.process(L, R, bl); for (let i = 0; i < bl && s + i < n; i++) out[s + i] = L[i] + R[i]; }
      e.destroy();
      const f0 = keyPitch(key, p);
      x[q] = { rms: rms(out, 0, n), f: peak(out, 0.99 * f0, 1.01 * f0, 0.3 * FS, n) };
    }
    for (const q of ['medium', 'low']) {
      dB.push(20 * Math.log10(x[q].rms / x.high.rms)); dc.push(cents(x[q].f, x.high.f));
      assert.ok(Math.abs(dB.at(-1)) < 1.5, `key ${key}, ${q}: ${dB.at(-1).toFixed(2)} dB`);
      assert.ok(Math.abs(dc.at(-1)) < 0.2, `key ${key}, ${q}: ${dc.at(-1).toFixed(3)} ¢`);
    }
  }
  console.log(`        (20 keys held: ${res.high.live} → ${res.medium.live} → ${res.low.live} sounding, ${res.high.partials.toFixed(0)} → ${res.medium.partials.toFixed(0)} → ${res.low.partials.toFixed(0)} partials a string; notes within ${Math.max(...dB.map(Math.abs)).toFixed(2)} dB, ${Math.max(...dc.map(Math.abs)).toFixed(3)} ¢)`);
});
test('stability: seeded random combinations of extreme settings at 44.1 and 48 kHz, changed mid-note: no NaN, bounded, silent after Panic', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  // tension modulation and the sympathetic strings draw from streams of their own, so the other
  // settings stay the ones tried before they came
  let seed2 = 777, seed3 = 4242;
  const coin = () => { seed2 = (seed2 * 1103515245 + 12345) >>> 0; return seed2 / 4294967296 < 0.5; };
  const kap = () => { seed3 = (seed3 * 1103515245 + 12345) >>> 0; return seed3 / 4294967296 < 0.5 ? 0 : 1; };
  // and so do the instrument built and the arpichordium
  let seed4 = 9001;
  const rnd4 = () => { seed4 = (seed4 * 1103515245 + 12345) >>> 0; return seed4 / 4294967296; };
  const built = () => ({ build: BUILDS[Math.floor(rnd4() * BUILDS.length)], hooks: rnd4() < 0.5 });
  const all = GROUPS.flatMap((g) => g.params).filter((p) => !['volume', 'room', 'venue', 'fullRange', 'kc', 'sympathy', 'build', 'hooks'].includes(p.id));
  const pick = (p) => (p.type === 'select' ? p.options[Math.floor(rnd() * p.options.length)][0] : p.type === 'checkbox' ? rnd() < 0.5 : rnd() < 0.5 ? p.min : p.max);
  for (let trial = 0; trial < 10; trial++) {
    const fs = trial % 2 ? 44100 : 48000, a = P({ ...Object.fromEntries(all.map((p) => [p.id, pick(p)])), kc: coin(), sympathy: kap(), ...built() }), b = P({ ...Object.fromEntries(all.map((p) => [p.id, pick(p)])), kc: coin(), sympathy: kap(), ...built() });
    const keys = [KEY_LO, 45, 60, 73, KEY_HI];
    const ev = keys.flatMap((k, i) => [[0.01 * i, 'on', k, rnd()], [0.6, 'off', k, rnd()]]);
    ev.push([0.3, 'params', b], [0.35, 'on', 60, 1], [1.3, 'panic']);
    const x = run(a, ev, 1.6, { fs });
    let bad = 0;
    for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i]) || !Number.isFinite(x.R[i])) bad++;
    assert.equal(bad, 0, `trial ${trial}: NaN`);
    assert.ok(peakAbs(x) < 2.5 && peakAbs(x.R) < 2.5, `trial ${trial}: peak ${peakAbs(x).toFixed(2)}`);
    assert.ok(peakAbs(x, x.length - Math.round(0.1 * fs)) < 1e-3, `trial ${trial}: tail ${peakAbs(x, x.length - Math.round(0.1 * fs)).toFixed(4)}`);
  }
});
test('tension modulation: a pluck starts sharp by what its release stretches the wire, and settles as it decays; the short treble strings stretch the most', () => {
  const glide = (m) => {
    const p = solo('back', { soundboard: false }), S = stringDesign(m, 'back', p), f = keyPitch(m, p);
    // the stretch at release, from the slow-motion pluck's modes: δT = (EA/2L) Σ (kₙ²/μ) qₙ²
    const r = simulatePluck(m, 'back', p, { sec: 0.03 }), E = WIRE[isBrass(m, 'back') ? 'brass' : 'iron'].E;
    let Q = 0;
    for (let i = 0; i < r.st.N; i++) { const k = ((i + 1) * Math.PI) / S.L; Q += ((k * k) / S.mu) * r.st.q[i] ** 2; }
    const want = 1200 * Math.log2(Math.sqrt(1 + ((E * S.A) / (2 * S.L)) * Q / S.T));
    const at = (kc, t) => { const x = run({ ...p, kc }, [[0, 'on', m, 0.7]], t + 0.1); return peak(x, f * 2 ** (-40 / 1200), f * 2 ** (40 / 1200), Math.round(t * FS), x.length); };
    return { want, start: cents(at(true, 0.03), at(false, 0.03)), late: cents(at(true, 1.2), at(false, 1.2)) };
  };
  const mid = glide(60), top = glide(84);
  console.log(`        (c¹: +${mid.start.toFixed(1)} ¢ at the start (release stretch: +${mid.want.toFixed(1)} ¢), +${mid.late.toFixed(1)} ¢ after 1.2 s; c³: +${top.start.toFixed(1)} ¢ (+${top.want.toFixed(1)} ¢), +${top.late.toFixed(1)} ¢)`);
  for (const [name, g] of [['c¹', mid], ['c³', top]]) {
    assert.ok(g.start > 0.5 * g.want && g.start < 1.5 * g.want, `${name}: +${g.start.toFixed(2)} ¢ at the start, the release's stretch +${g.want.toFixed(2)} ¢`);
    assert.ok(g.late < g.start / 3, `${name}: +${g.late.toFixed(2)} ¢ after 1.2 s`);
  }
  assert.ok(top.want > 2 * mid.want, 'the treble stretches more');
});
test('decay: a held note’s partials die at the model’s rate, σ = air + wire + Re Y(f)·bₙ²/2ωₙ² into the board (= Re Y·T/L for a flexible string), within 10 %', () => {
  for (const m of [48, 60, 72]) {
    const p = solo('back', { soundboard: false }), S = stringDesign(m, 'back', p), parts = stringPartials(S, p).partials;
    const [bx, by] = bridgePoint(m, 'back');
    near(parts[0].sigB, (boardAdmittance(bx, by, parts[0].f)[0] * (S.T + S.EI * (Math.PI / S.L) ** 2)) / S.L, 1e-9, 'σ_b = Re Y (T + EIk²)/L');
    const x = run(p, [[0, 'on', m, 0.7]], 2.2);
    for (const n of [1, 3]) {
      const f = parts[n - 1].f, W = Math.round(0.4 * FS), a1 = tone(x, f, Math.round(0.3 * FS), Math.round(0.3 * FS) + W), a2 = tone(x, f, Math.round(1.7 * FS), Math.round(1.7 * FS) + W);
      const sig = Math.log(a1 / a2) / 1.4;
      near(sig, parts[n - 1].sigma, 0.1, `${m} partial ${n}`);
    }
  }
});
test('sideways motion: dragged sideways along the plectrum, the string swings sideways too when it lets go; drained κ times as fast, it outlasts the vertical swing (late on the fundamental dies at σ_S + κσ_B, within 15 %); off, or at Low Quality, none of it is heard', () => {
  const m = 72, kap = 0.2, p = solo('back', { soundboard: false, kc: false, sympathy: 0 }), f = stringPartials(stringDesign(m, 'back', p), p).partials[0];
  const W = Math.round(0.4 * FS), at = (x, t) => tone(x, f.f, Math.round(t * FS), Math.round(t * FS) + W);
  const rate = (x, a, b) => Math.log(at(x, a) / at(x, b)) / (b - a);
  const off = run({ ...p, side: 0 }, [[0, 'on', m, 0.7]], 8), on = run({ ...p, side: kap }, [[0, 'on', m, 0.7]], 8);
  near(rate(off, 1.5, 3.5), f.sigma, 0.1, 'off: later, the vertical rate still');
  near(rate(on, 0.3, 1.5), f.sigma, 0.1, 'on: early, the vertical rate');
  near(rate(on, 5, 7.4), f.sigS + kap * f.sigB, 0.15, 'on: late, the sideways rate');
  const tail = 20 * Math.log10(at(on, 6.5) / (at(on, 0.3) * Math.exp(-f.sigma * 6.2))); // re the vertical swing, by then
  assert.ok(tail > 10, `late on, the sideways swing is ${tail.toFixed(1)} dB above the vertical`);
  const early = 20 * Math.log10(at(on, 0.3) / at(off, 0.3));
  assert.ok(Math.abs(early) < 1.5, `early on, the vertical swing is the note (${early.toFixed(2)} dB)`);
  // Low Quality: no sideways partials
  const low = (side) => {
    const e = new HarpsichordEngine(FS);
    e.setQuality('low'); e.setParams({ ...p, side });
    const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl), out = [];
    e.noteOn(m, 0.7);
    for (let b = 0; b < 375; b++) { e.process(L, R, bl); out.push(...L); }
    return out;
  };
  assert.deepEqual(low(kap), low(0), 'Low: the same with and without');
});
test('stereo: above the board’s modal band each bridge point is heard mostly by the nearer microphone (bass left, treble right); the low modes ring the whole board; the bridge force alone is panned by key', () => {
  const hp = (x, f) => { // 2nd-order Butterworth high-pass
    const w = (2 * Math.PI * f) / FS, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al, b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  };
  for (const [sb, fc] of [[true, 2500], [false, 30]]) {
    const bal = (keys) => { let l = 0, r = 0; for (const k of keys) { const x = run(P({ soundboard: sb }), [[0, 'on', k, 0.7]], 0.4); l += rms(hp(x, fc), 0, x.length) ** 2; r += rms(hp(x.R, fc), 0, x.length) ** 2; } return 10 * Math.log10(l / r); };
    const lo = bal([29, 32, 35, 38, 41]), mid = bal([57, 59, 61]), hi = bal([78, 81, 84, 87]);
    assert.ok(lo > 3 && hi < -3 && Math.abs(mid) < 3, `board ${sb}, above ${fc} Hz: bass ${lo.toFixed(1)}, middle ${mid.toFixed(1)}, treble ${hi.toFixed(1)} dB (L re R)`);
  }
});
test('presets use their own parameters, and each plays without NaN', () => {
  const ids = new Set(GROUPS.flatMap((g) => g.params).map((p) => p.id));
  for (const pr of PRESETS) {
    for (const id of Object.keys(pr.p)) assert.ok(ids.has(id), `${pr.name}: ${id}`);
    const x = run(P(pr.p), [[0, 'on', 60, 0.7], [0.02, 'on', 67, 0.7]], 0.3);
    assert.ok(x.every(Number.isFinite) && peakAbs(x) > 0.005, `${pr.name}: peak ${peakAbs(x)}`);
  }
});
// ---- the virginals and the lute-harpsichord ------------------------------------------------
const lauten = (o = {}) => P({ build: 'lauten', ...o });
test('lute-harpsichord: its two 8′ choirs are gut (μ = ρπd²/4 with ρ = 1320 kg/m³, tuned so: T = 4L²f²μ − EIπ²/L²), on a shorter scale (c² 300 mm) at 0.7× the wire’s tension; the 4′ stays brass, as Albrecht describes', () => {
  for (const m of [29, 41, 60, 72, 89]) for (const c of ['front', 'back']) {
    const S = stringDesign(m, c, lauten()), W = stringDesign(m, c, P());
    assert.equal(S.mat.name, 'gut', `${m} ${c}`);
    near(S.mu, (GUT.rho * Math.PI * S.d ** 2) / 4, 1e-9, `${m} μ`);
    near(S.EI, (GUT.E * Math.PI * S.d ** 4) / 64, 1e-9, `${m} EI`);
    near(S.T, 4 * S.L ** 2 * S.f0 ** 2 * S.mu - (S.EI * Math.PI ** 2) / S.L ** 2, 1e-9, `${m} T`);
    near(S.T, 0.7 * W.T, 0.01, `${m} tension against the harpsichord's`);
    assert.ok(S.L < W.L, `${m}: shorter`);
  }
  near(stringDesign(C2, 'back', lauten()).L, 0.3, 1e-9, 'c² length');
  // its bass lengthens less than the harpsichord's: FF over c² 3.3 against 4.6
  const ratio = (p) => stringDesign(29, 'back', p).L / stringDesign(C2, 'back', p).L;
  assert.ok(ratio(lauten()) < 0.75 * ratio(P()), `FF/c²: ${ratio(lauten()).toFixed(2)} against ${ratio(P()).toFixed(2)}`);
  // the 4′ is the harpsichord's, brass in the bass (Albrecht's "octave of brass strings")
  for (const m of [29, 40, 60, 89]) assert.deepEqual(stringDesign(m, 'four', lauten()), stringDesign(m, 'four', P()), `4′ ${m}`);
  for (const m of [29, 40]) assert.equal(stringDesign(m, 'four', lauten()).mat.name, 'brass');
});
test('gut’s losses: a partial loses air’s drag plus η_E = 0.04 on its share of bending energy, λ = EIk²/(T + EIk²) (Woodhouse & Lynch-Aird 2019), so the upper partials roll off: c¹’s 20th decays over 2.5× faster on gut than on wire, its fundamental within 2×', () => {
  for (const m of [41, 60, 72]) {
    const p = lauten(), S = stringDesign(m, 'back', p), parts = stringPartials(S, p).partials;
    for (const pt of parts.slice(0, 30)) {
      const k = (pt.n * Math.PI) / S.L, b = S.EI * k * k, want = airSigma(S, pt.f) + Math.PI * pt.f * GUT.etaE * (b / (S.T + b));
      near(pt.sigS, want, 1e-6, `${m} partial ${pt.n}`);
    }
  }
  const g = stringPartials(stringDesign(60, 'back', lauten()), lauten()).partials, w = stringPartials(stringDesign(60, 'back', P()), P()).partials;
  assert.ok(g[19].sigma > 2.5 * w[19].sigma, `20th: ${g[19].sigma.toFixed(1)} against ${w[19].sigma.toFixed(1)} s⁻¹`);
  assert.ok(g[0].sigma < 2 * w[0].sigma, `1st: ${g[0].sigma.toFixed(2)} against ${w[0].sigma.toFixed(2)} s⁻¹`);
  // heard (the bridge force): from 0.1 s to 0.5 s the 8th–30th partials fall against the fundamental at least 3 dB more on gut
  const fall = (o, m) => { const p = solo('back', { soundboard: false, ...o }), S = stringDesign(m, 'back', p), x = run(p, [[0, 'on', m, 0.7]], 0.8); return band(x, S, 0.1, 8, 30) - band(x, S, 0.5, 8, 30); };
  const falls = [48, 60, 72].map((m) => [fall({ build: 'lauten' }, m), fall({}, m)]);
  console.log(`        (8th–30th partials against the fundamental, 0.1 → 0.5 s: ${falls.map(([g, w]) => `${(-g).toFixed(1)} dB on gut, ${(-w).toFixed(1)} on wire`).join('; ')}, at c, c¹, c²)`);
  for (const [g, w] of falls) assert.ok(g > w + 3, `gut falls ${g.toFixed(1)} dB, wire ${w.toFixed(1)} dB`);
});
test('lute-harpsichord: in tune (±2 ¢, every third key FF–f³); gut stretches less than wire under a pluck (E·A smaller), so its tension glide is smaller', () => {
  const p = solo('back', { build: 'lauten', soundboard: false, kc: false });
  for (let m = KEY_LO; m <= KEY_HI; m += 3) {
    const x = run(p, [[0, 'on', m, 0.7]], 0.6), f = keyPitch(m, p), got = peak(x, f * 2 ** (-12 / 1200), f * 2 ** (12 / 1200), Math.round(0.15 * FS), x.length);
    assert.ok(Math.abs(cents(got, f)) < 2, `${m}: ${cents(got, f).toFixed(2)} ¢`);
  }
  const glide = (o) => { const q = solo('back', { soundboard: false, ...o }), f = keyPitch(84, q); const at = (kc) => { const x = run({ ...q, kc }, [[0, 'on', 84, 0.7]], 0.13); return peak(x, f * 2 ** (-40 / 1200), f * 2 ** (40 / 1200), Math.round(0.03 * FS), x.length); }; return cents(at(true), at(false)); };
  const gw = glide({}), gg = glide({ build: 'lauten' });
  console.log(`        (c³ just after the pluck: +${gg.toFixed(1)} ¢ on gut, +${gw.toFixed(1)} ¢ on wire)`);
  assert.ok(gg < 0.6 * gw, `gut +${gg.toFixed(2)} ¢, wire +${gw.toFixed(2)} ¢`);
});
test('virginals: one row of jacks on one choir, whatever the levers say; the muselar plucks a third of the way along in the bass to nearly half in the treble, the spinett an eighth to a quarter, the jack line moves them all alike, and its notes sound in tune (±2 ¢)', () => {
  for (const build of ['muselar', 'spinett']) {
    for (const o of [{}, { manual: 'upper' }, { coupler: false, back8: false, four: true, lute: true }]) {
      const r = registration(P({ build, ...o }));
      assert.deepEqual(r.rows, ['back'], `${build} ${JSON.stringify(o)}`);
      assert.deepEqual(r.lift, { front: false, back: true, four: false });
    }
    const beta = (m) => pluckPoint(m, 'back', P({ build })) / stringDesign(m, 'back', P({ build })).L;
    const [lo, hi] = build === 'muselar' ? [[0.3, 0.37], [0.42, 0.5]] : [[0.1, 0.15], [0.2, 0.27]];
    assert.ok(beta(KEY_LO) > lo[0] && beta(KEY_LO) < lo[1], `${build} FF: β ${beta(KEY_LO).toFixed(3)}`);
    assert.ok(beta(KEY_HI) > hi[0] && beta(KEY_HI) < hi[1], `${build} f³: β ${beta(KEY_HI).toFixed(3)}`);
    const p = P({ build, soundboard: false, kc: false });
    for (let m = KEY_LO; m <= KEY_HI; m += 4) {
      const x = run(p, [[0, 'on', m, 0.7]], 0.6), f = keyPitch(m, p), got = peak(x, f * 2 ** (-12 / 1200), f * 2 ** (12 / 1200), Math.round(0.15 * FS), x.length);
      assert.ok(Math.abs(cents(got, f)) < 2, `${build} ${m}: ${cents(got, f).toFixed(2)} ¢`);
    }
  }
  // its case holds strings up to 1.3 m: the bass is shorter than the harpsichord's
  assert.ok(stringDesign(KEY_LO, 'back', P({ build: 'muselar' })).L < 1.3, 'FF fits the case');
  // moving the jack line moves every plucking point by as much
  for (const m of [41, 60, 72]) for (const d of [-40, 40]) {
    const x0 = pluckPoint(m, 'back', P({ build: 'spinett' })), x1 = pluckPoint(m, 'back', P({ build: 'spinett', jackLine: d }));
    near(x1 - x0, d * 1e-3, 1e-9, `${m} moved ${d} mm`);
  }
});
test('virginals: plucked near the middle, the muselar’s c² pushes on its bridges with a strong fundamental and few upper partials (the comb notches at f₁/β, near 2f₁); the spinett, plucked near the end, is brighter, and so is the harpsichord’s back 8′', () => {
  // the bridge force (the soundboard off): the board then colours each note its own way
  // partials 2–6 against the fundamental, 0.1–0.35 s in, at c, c¹ and c²
  const lv = (build, m) => { const p = solo('back', { build, soundboard: false }), x = run(p, [[0, 'on', m, 0.7]], 0.4); return band(x, stringDesign(m, 'back', p), 0.1, 2, 6); };
  for (const m of [48, 60, C2]) {
    const mu = lv('muselar', m), sp = lv('spinett', m), hd = lv('double', m);
    console.log(`        (${m}: partials 2–6 at ${mu.toFixed(1)} dB on the muselar, ${sp.toFixed(1)} dB on the spinett, ${hd.toFixed(1)} dB on the harpsichord's back 8′)`);
    assert.ok(sp > mu + 6 && hd > mu + 6, `${m}: muselar ${mu.toFixed(1)}, spinett ${sp.toFixed(1)}, harpsichord ${hd.toFixed(1)} dB`);
  }
  const S = stringDesign(C2, 'back', P({ build: 'muselar' }));
  // the comb: a pluck at β leaves partial n with sin(nπβ)/n of the force, so the muselar’s 2nd partial (β ≈ 0.42) is weaker than the spinett’s
  const beta = pluckPoint(C2, 'back', P({ build: 'muselar' })) / S.L;
  assert.ok(beta > 0.38 && beta < 0.46, `β ${beta.toFixed(3)}`);
});
test('virginals: both bridges stand on the board, so a string drains into it at both ends, σ_b = (Re Y(bridge) + Re Y(nut))·(T + EIk²)/L for the fundamental; a held note’s partials die at the model’s rate (within 10 %)', () => {
  for (const build of ['muselar', 'spinett']) for (const m of [48, 60, 72]) {
    const p = P({ build, soundboard: false, side: 0 }), S = stringDesign(m, 'back', p), parts = stringPartials(S, p).partials; // (side: the vertical swing alone)
    const [bx, by] = bridgePoint(m, 'back', build), [nx, ny] = nutPoint(m, build), f = parts[0].f;
    const G = boardAdmittance(bx, by, f, 1)[0] + boardAdmittance(nx, ny, f, 1)[0];
    near(parts[0].sigB, (G * (S.T + S.EI * (Math.PI / S.L) ** 2)) / S.L, 1e-9, `${build} ${m}: σ_b`);
    near(Math.abs(nx - bx), S.L, 1e-9, `${build} ${m}: the bridges a string's length apart`);
    const x = run(p, [[0, 'on', m, 0.7]], 2.2);
    for (const n of [1, 3]) {
      const fn = parts[n - 1].f, W = Math.round(0.4 * FS), a1 = tone(x, fn, Math.round(0.3 * FS), Math.round(0.3 * FS) + W), a2 = tone(x, fn, Math.round(1.7 * FS), Math.round(1.7 * FS) + W);
      near(Math.log(a1 / a2) / 1.4, parts[n - 1].sigma, 0.1, `${build} ${m} partial ${n}`);
    }
  }
});
test('the arpichordium: on a virginal its hooks keep the bass buzzing (its rms frequency at 1 s over 1.5× without them) and leave keys above e alone, sample for sample; on the harpsichord it does nothing', () => {
  const rmsFreq = (x, a, b) => { let e = 0, d = 0; for (let i = a + 1; i < b; i++) { e += x[i] * x[i]; d += (x[i] - x[i - 1]) ** 2; } return (Math.sqrt(d / e) * FS) / (2 * Math.PI); };
  for (const m of [29, 36, 48]) {
    const at = (hooks) => { const x = run(P({ build: 'muselar', hooks }), [[0, 'on', m, 0.7]], 1.3); return rmsFreq(x, FS, Math.round(1.25 * FS)); };
    const off = at(false), on = at(true);
    assert.ok(on > 1.5 * off, `${m}: ${on.toFixed(0)} Hz with the hooks, ${off.toFixed(0)} without`);
  }
  const same = (o, m) => { const a = run(P(o), [[0, 'on', m, 0.7]], 0.4), b = run(P({ ...o, hooks: true }), [[0, 'on', m, 0.7]], 0.4); return a.every((v, i) => v === b[i]); };
  assert.ok(same({ build: 'muselar' }, 60), 'c¹ untouched');
  assert.ok(same({}, 36) && same({ build: 'lauten' }, 36), 'no hooks on the harpsichord');
  const x = run(P({ build: 'muselar', hooks: true }), [36, 41, 45, 48].map((m) => [0, 'on', m, 1]), 1.0);
  assert.ok(x.every(Number.isFinite) && peakAbs(x) < 1, `chord: ${peakAbs(x).toFixed(3)}`);
});
test('switching the instrument: the default is the harpsichord, so a song saved before stays as it was; every build is in tune at A = 415 meantone, a forte note peaks at 0.1–0.5 (a virginal’s FF from 0.06: its small board radiates the bass weakly), and a change mid-note gives the next press new strings', () => {
  assert.equal(DEFAULTS.build, 'double');
  assert.equal(DEFAULTS.hooks, false);
  for (const fs of [44100, 48000]) for (const build of BUILDS) for (const m of [29, 41, 53, 60, 72, 81, 89]) {
    const x = run(P({ build }), [[0, 'on', m, 1]], 0.6, { fs }), pk = Math.max(peakAbs(x), peakAbs(x.R)), lo = m === 29 && build !== 'lauten' && build !== 'double' ? 0.06 : 0.1;
    assert.ok(pk > lo && pk < 0.5, `${build} ${m} at ${fs}: ${pk.toFixed(3)}`);
  }
  for (const build of ['muselar', 'spinett', 'lauten']) for (const four of [false, true]) {
    // (the lute-harpsichord's two gut 8′s and brass 4′ together peak a little over 1: the limiter's)
    const ch = run(P({ build, four }), [41, 48, 53, 57, 60, 64, 67, 72].map((m) => [0, 'on', m, 1]), 1.0), pk = Math.max(peakAbs(ch), peakAbs(ch.R));
    assert.ok(pk < (four ? 1.2 : 1), `${build} chord ${four ? '8 8 4' : '8 8'}: ${pk.toFixed(3)}`);
  }
  const ev = [[0, 'on', 60, 0.7], [0.3, 'params', P({ build: 'lauten' })], [0.4, 'on', 60, 0.7], [0.7, 'params', P({ build: 'spinett' })], [0.8, 'on', 64, 0.7]];
  const x = run(P(), ev, 1.2);
  assert.ok(x.every(Number.isFinite) && peakAbs(x, Math.round(0.8 * FS)) > 0.01, 'plays through the changes');
  const pm = P({ pitch: 415, temperament: 'meantone', soundboard: false, kc: false, coupler: false, front8: false });
  for (const build of ['muselar', 'lauten']) for (const m of [60, 64, 68]) {
    const p = { ...pm, build }, xx = run(p, [[0, 'on', m, 0.7]], 0.6), f = keyPitch(m, p), got = peak(xx, f * 0.993, f * 1.007, 4800, xx.length);
    assert.ok(Math.abs(cents(got, f)) < 2, `${build} meantone ${m}: ${cents(got, f).toFixed(2)} ¢`);
  }
});
test('CPU: 10 keys of 8′ 8′ 4′ coupled (30 strings) at 48 kHz in under 30 % of real time', () => {
  const keys = [41, 45, 48, 52, 55, 60, 64, 67, 72, 76];
  const t0 = performance.now();
  run(P({ four: true }), keys.map((k, i) => [0.005 * i, 'on', k, 0.7]), 3);
  const load = (performance.now() - t0) / 3000;
  assert.ok(load < 0.3, `${(load * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
