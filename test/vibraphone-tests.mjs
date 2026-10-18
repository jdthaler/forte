// Vibraphone checks. Run: node test/vibraphone-tests.mjs
//
// The bar FEM against beam theory and a dense eigensolver; the undercut
// optimiser against 1 : 4 : 10; the coupled bar and tube against the
// two-oscillator formula; then the engine against the model: pitch, the split,
// the tremolo's rate, the tube's effect, mallet, damper, levels and stability.
// The model and the engine are the C++ (native/instruments/vibraphone), built as
// WebAssembly: the model's functions through vibraphone-wasm.js. bar.js is the
// JavaScript that tunes the bars (tools/vibraphone-bars.mjs): its FEM and
// optimiser are checked too, since the C++ plays from the table they make.

import assert from 'node:assert/strict';
import { genEig } from '../shared/linalg.js';
import { keyFreq } from '../shared/dsp.js';
import { AL, G_AL, BETA_L, EB_RATIOS, KEY_LO, KEY_HI, barBlank, bendingFreqs3, halfMesh, assembleBending, tuneUndercut } from '../vibraphone/src/bar.js';
import { BAR_TABLE } from '../vibraphone/src/bar-table.js';
import { INSTRUMENT } from '../vibraphone/src/vibraphone-instrument.js';
import { wasmModel } from '../vibraphone/src/vibraphone-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS } from '../vibraphone/src/vibraphone-params.js';
import { readFileSync } from 'node:fs';
import { barTableHeader } from '../tools/vibraphone-bars.mjs';

const VibraphoneEngine = await loadEngine(INSTRUMENT);
const { barModel, tubeGeometry, tubeState, coupling, voiceData } = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'sus', on] | [t, 'params', P]),
// in 128-sample blocks like the AudioWorklet; tap(engine) after every block.
function run(params, events, sec, { fs = FS, tap, stereo = false } = {}) {
  const e = new VibraphoneEngine(fs);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else if (type === 'sus') e.setSustain(a); else if (type === 'params') e.setParams(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, s);
  }
  return stereo ? [L, R, e] : Object.assign(L, { engine: e });
}
// |DTFT| of x[a, b) at f, Hann-windowed.
function tone(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im) / ((b - a) / 4);
}
// The strongest spectral peak in [f0, f1]: a coarse scan, then golden-section refinement.
function peak(x, f0, f1, a, b, step = 0.25) {
  let best = f0, bv = -1;
  for (let f = f0; f <= f1; f += step) { const v = tone(x, f, a, b); if (v > bv) { bv = v; best = f; } }
  let lo = best - step, hi = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 40; it++) { const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
const peakAbs = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rmsDb = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return 10 * Math.log10(s / (b - a) + 1e-30); };
// Short-time level (dB) of the component at f, every `hop` samples (complex demodulation, 4-period Hann).
function envelope(x, f, a, b, hop = 240) {
  const w = (2 * Math.PI * f) / FS, W = Math.round((4 * FS) / f), out = [];
  for (let s = a; s + W < b; s += hop) {
    let re = 0, im = 0;
    for (let i = s; i < s + W; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - s)) / W); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
    out.push(20 * Math.log10(Math.hypot(re, im) + 1e-30));
  }
  return out;
}
// What the tests check the C++ against, from first principles rather than from its code:
// air as an ideal gas at sea level;
const air = (T) => ({ c: 331.3 * Math.sqrt((T + 273.15) / 273.15) });
// Saint-Venant torsion of a b × h rectangle, Roark's approximation;
function torsionJ(b, h) {
  const t = Math.min(b, h), w = Math.max(b, h), r = t / w;
  return w * t ** 3 * (1 / 3 - 0.21 * r * (1 - r ** 4 / 12));
}
// Zener's thermoelastic loss η = Δ ωτ/(1 + ω²τ²), Δ = Eα²T/(ρc_p), τ = h²/(π² D_th), for the
// C++'s aluminium (vibraphone-model.h, THERMO);
const THERMO = { alpha: 23e-6, cp: 900, k: 167, T: 293.15 }, ZENER_DELTA = (AL.E * THERMO.alpha ** 2 * THERMO.T) / (AL.rho * THERMO.cp);
const zener = (h, f) => { const wt = (2 * Math.PI * f * h * h * AL.rho * THERMO.cp) / (Math.PI * Math.PI * THERMO.k); return (ZENER_DELTA * wt) / (1 + wt * wt); };
// two oscillators coupled through their masses, M = [[1, −κ], [−κ, 1]] in normalised coordinates:
// (1 − κ²)ω⁴ − (ω_b² + ω_t²)ω² + ω_b²ω_t² = 0; when tuned, ω± = ω₀/√(1 ∓ κ);
function twoOscillator(fb, ft, kappa) {
  const wb = 2 * Math.PI * fb, wt = 2 * Math.PI * ft, s = wb * wb + wt * wt, dsc = Math.sqrt(s * s - 4 * (1 - kappa * kappa) * wb * wb * wt * wt);
  return [Math.sqrt((s - dsc) / (2 * (1 - kappa * kappa))) / (2 * Math.PI), Math.sqrt((s + dsc) / (2 * (1 - kappa * kappa))) / (2 * Math.PI)];
}
// and the damped pair exactly: the roots s of det(s²M + sC + K) = 0 (a quartic, by Durand–Kerner), [{ f, sigma }].
function coupledModes(M11, M12, M22, C11, C22, K11, K22) {
  const a4 = M11 * M22 - M12 * M12, a3 = M11 * C22 + M22 * C11, a2 = M11 * K22 + M22 * K11 + C11 * C22, a1 = C11 * K22 + C22 * K11, a0 = K11 * K22;
  const c = [a3 / a4, a2 / a4, a1 / a4, a0 / a4];
  const P = (re, im) => { // z⁴ + c0 z³ + c1 z² + c2 z + c3
    let pr = 1, pi = 0;
    for (const ck of c) { const r = pr * re - pi * im + ck, i = pr * im + pi * re; pr = r; pi = i; }
    return [pr, pi];
  };
  const scale = Math.sqrt(Math.sqrt(c[3]));
  let z = [0, 1, 2, 3].map((j) => [scale * Math.cos(0.4 + (j * Math.PI) / 2), scale * Math.sin(0.4 + (j * Math.PI) / 2)]);
  for (let it = 0; it < 500; it++) {
    let move = 0;
    z = z.map(([re, im], j) => {
      let [nr, ni] = P(re, im), dr = 1, di = 0;
      for (let q = 0; q < 4; q++) if (q !== j) { const xr = re - z[q][0], xi = im - z[q][1], t = dr * xr - di * xi; di = dr * xi + di * xr; dr = t; }
      const den = dr * dr + di * di, qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      move = Math.max(move, Math.hypot(qr, qi));
      return [re - qr, im - qi];
    });
    if (move < 1e-12 * scale) break;
  }
  return z.filter(([, im]) => im > 0).map(([re, im]) => ({ f: im / (2 * Math.PI), sigma: -re })).sort((x, y) => x.f - y.f);
}
const bends = (bar) => bar.modes.filter((m) => m.kind === 'bend');
const sigma1 = (k, p = DEFAULTS) => { const m = barModel(k, p.depth).modes[0]; return m.sigTE + m.sigSup + m.sigRad + Math.PI * m.f * p.eta; };

console.log('the bar');
test('plain bar: the tuning FEM reproduces the free–free beam, cos βL cosh βL = 1 (1 : 2.756 : 5.404 : 8.933 : 13.34)', () => {
  for (const b of BETA_L) assert.ok(Math.abs(Math.cos(b) * Math.cosh(b) - 1) < 1e-6 * Math.cosh(b));
  const thin = bendingFreqs3({ h0: 0.002, a: 0, c: 0, d: 0 }, 1, 0.05);
  const f1 = (BETA_L[0] ** 2 / (2 * Math.PI)) * 0.002 * Math.sqrt(AL.E / (12 * AL.rho));
  assert.ok(Math.abs(thin[0] / f1 - 1) < 1e-4, `f₁ ${thin[0]} vs ${f1}`);
  thin.forEach((f, n) => assert.ok(Math.abs(f / thin[0] / EB_RATIOS[n] - 1) < 2e-4, `mode ${n + 1}: ${(f / thin[0]).toFixed(5)} vs ${EB_RATIOS[n].toFixed(5)}`));
  // a thick plain bar (h/L = 0.06) falls below Euler–Bernoulli: shear and rotary inertia (Timoshenko)
  const thick = bendingFreqs3({ h0: 0.0127, a: 0, c: 0, d: 0 }, 0.21, 0.05);
  assert.ok(thick[1] / thick[0] < EB_RATIOS[1] - 0.01 && thick[2] / thick[0] < EB_RATIOS[2] - 0.05, `thick: ${(thick[1] / thick[0]).toFixed(3)}, ${(thick[2] / thick[0]).toFixed(3)}`);
});
test('torsion: a uniform (plain) bar twists at f_n = n·c_T/2L, c_T = √(GJ/ρI_p)', () => {
  for (const k of [KEY_LO, KEY_HI]) {
    const bar = barModel(k, 0), { b, h0: h, L } = bar.geom, J = torsionJ(b, h), Ip = (b * h ** 3 + h * b ** 3) / 12, cT = Math.sqrt((G_AL * J) / (AL.rho * Ip));
    const tors = bar.modes.filter((m) => m.kind === 'tors');
    assert.equal(tors.length, 2);
    tors.forEach((t, i) => assert.ok(Math.abs(t.f / (((i + 1) * cT) / (2 * L)) - 1) < 1e-3, `key ${k}, torsion ${i + 1}: ${t.f.toFixed(2)} vs ${(((i + 1) * cT) / (2 * L)).toFixed(2)}`));
  }
});
test('the banded Sturm-bisection solvers (bar.js and the C++) agree with the dense generalised eigensolver (shared/linalg.js genEig)', () => {
  const g = barModel(60).geom, nodes = halfMesh(g.cut, g.L), { K, M, n } = assembleBending(nodes, g.cut, g.b);
  // symmetric half (drop θ at the centre): dense K, M, then genEig
  const keep = [...Array(n).keys()].filter((i) => i !== 1), N = keep.length, Kd = new Float64Array(N * N), Md = new Float64Array(N * N);
  const band = (B, i, j) => { const a = Math.min(i, j), c = Math.max(i, j); return c - a > 3 ? 0 : B[a * 4 + c - a]; };
  keep.forEach((i, r) => keep.forEach((j, c) => { Kd[r * N + c] = band(K, i, j); Md[r * N + c] = band(M, i, j); }));
  const { lambda } = genEig(Kd, Md, N, 1), dense = (idx) => Math.sqrt(lambda[idx]) / (2 * Math.PI);
  const m = bends(barModel(60)), js = bendingFreqs3(g.cut, g.L, g.b);
  for (const [n1, idx] of [[0, 1], [2, 2], [4, 3]]) assert.ok(Math.abs(dense(idx) / m[n1].f - 1) < 1e-9, `C++ mode ${n1 + 1}`);
  for (const [n1, idx] of [[0, 1], [2, 2]]) assert.ok(Math.abs(dense(idx) / js[n1] - 1) < 1e-9, `bar.js mode ${n1 + 1}`);
});
test('undercut optimiser: every bar F3–F6 sits at 1 : 4 : 10 within 1 ¢ (and its fundamental within 0.1 ¢ of 12-TET)', () => {
  assert.equal(BAR_TABLE.length, KEY_HI - KEY_LO + 1);
  let worst = 0;
  for (let k = KEY_LO; k <= KEY_HI; k++) { // the bars the C++ builds, by both FEMs
    const bar = barModel(k), g = bar.geom, m = bends(bar);
    for (const f of [bendingFreqs3(g.cut, g.L, g.b), m.map((x) => x.f)]) {
      const e = [cents(f[1] / f[0], 4), cents(f[2] / f[0], 10)];
      assert.ok(Math.abs(cents(f[0], keyFreq(k))) < 0.1, `key ${k}: f₁ off by ${cents(f[0], keyFreq(k)).toFixed(3)} ¢`);
      worst = Math.max(worst, ...e.map(Math.abs));
    }
  }
  assert.ok(worst < 1, `worst ${worst.toFixed(4)} ¢`);
  // and on a mesh twice as fine the tuning holds to a quarter of a cent (the mesh is converged)
  for (const k of [KEY_LO, 71, KEY_HI]) {
    const g = barModel(k).geom, f = bendingFreqs3(g.cut, g.L, g.b, 6);
    assert.ok(Math.abs(cents(f[1] / f[0], 4)) < 0.25 && Math.abs(cents(f[2] / f[0], 10)) < 0.25, `key ${k} fine mesh: ${cents(f[1] / f[0], 4).toFixed(3)}, ${cents(f[2] / f[0], 10).toFixed(3)} ¢`);
  }
});
test('the optimiser, started cold, reproduces the table (F3, A4, F6)', () => {
  for (const k of [KEY_LO, 69, KEY_HI]) {
    const { b, h0, cf } = barBlank(k), row = BAR_TABLE[k - KEY_LO];
    const r = tuneUndercut({ f1: keyFreq(k), b, h0, cf, start: { A: row[2] * 1.06, D: row[3] * 0.94, L: row[1] * 1.05 } });
    assert.ok(Math.abs(r.L / row[1] - 1) < 1e-5 && Math.abs(r.A - row[2]) < 1e-4 && Math.abs(r.D - row[3]) < 1e-4, `key ${k}: L ${r.L} vs ${row[1]}`);
    assert.ok(r.residualCents.every((c) => Math.abs(c) < 0.01));
  }
});
test('the C++ port plays from the same table (native/instruments/vibraphone/bar-table.h is fresh: node tools/vibraphone-bars.mjs --native)', () => {
  assert.equal(readFileSync(new URL('../native/instruments/vibraphone/bar-table.h', import.meta.url), 'utf8'), barTableHeader(BAR_TABLE));
});
test('a plain bar (no undercut) must be half as long again to sound the same note, and rings at 1 : 2.7 : 5.3', () => {
  for (const k of [KEY_LO, 71, KEY_HI]) {
    const plain = barModel(k, 0), tuned = barModel(k, 1);
    assert.ok(Math.abs(cents(plain.modes[0].f, keyFreq(k))) < 0.05, `key ${k} f₁`);
    assert.ok(plain.geom.L > 1.4 * tuned.geom.L, `L ${plain.geom.L} vs ${tuned.geom.L}`);
    const r2 = plain.modes[1].ratio, r3 = plain.modes[2].ratio;
    // Euler–Bernoulli 2.756, 5.404; the short thick bar sits a little lower (shear, rotary inertia)
    assert.ok(r2 > 2.6 && r2 < EB_RATIOS[1] && r3 > 4.9 && r3 < EB_RATIOS[2], `key ${k}: ${r2.toFixed(3)} ${r3.toFixed(3)}`);
  }
});
test('losses: Zener\'s thermoelastic loss (Δ = 4.4×10⁻³ for aluminium) on a plain bar\'s bending modes; the cords barely touch mode 1', () => {
  assert.ok(Math.abs(ZENER_DELTA - 4.4e-3) < 1e-4, `Δ = ${ZENER_DELTA}`);
  for (const k of [KEY_LO, 69, KEY_HI]) { // a uniform bar's strain energy is all bending but for its shear, which grows up the modes
    const bar = barModel(k, 0), r = bends(bar).map((m) => m.sigTE / (Math.PI * m.f * zener(bar.geom.h0, m.f)));
    assert.ok(r[0] > 0.98 && r.every((x, i) => x < 1 + 1e-9 && x > 0.8 && (!i || x < r[i - 1])), `key ${k}: σ_TE ${r.map((x) => x.toFixed(4)).join(', ')} × Zener's`);
  }
  for (const k of [KEY_LO, 69, KEY_HI]) {
    const m = barModel(k).modes;
    assert.ok(m[0].sigSup < 0.01 * m[1].sigSup, `key ${k}: cords on mode 1 ${m[0].sigSup} vs mode 2 ${m[1].sigSup}`);
  }
});

console.log('the resonator');
test('a stopped tube: quarter wave plus the open-end correction 0.61a (bar far away, disc open)', () => {
  for (const k of [KEY_LO, 69, KEY_HI]) {
    const bar = barModel(k), tg = tubeGeometry(k, bar), f = bar.modes[0].f, { c } = air(20);
    const ts = tubeState(tg, f, { gap: 1e6, detune: 0, temp: 20, cd: 0.8 });
    assert.ok(Math.abs(ts.length + 0.61 * tg.a - c / (4 * f)) < 1e-6, `key ${k}: ${ts.length} + 0.61a vs λ/4 = ${c / (4 * f)}`);
    assert.ok(Math.abs(cents(coupling(ts, 0, f).ft, f)) < 1e-3);
  }
});
test('coupled modes: the damped quartic reduces to the two-oscillator formula ω± = ω₀/√(1 ∓ κ) when tuned', () => {
  const [lo, hi] = twoOscillator(200, 200, 0.03);
  assert.ok(Math.abs(lo - 200 / Math.sqrt(1.03)) < 1e-9 && Math.abs(hi - 200 / Math.sqrt(0.97)) < 1e-9);
  const w = 2 * Math.PI * 200, m = coupledModes(1, -0.03, 1, 0, 0, w * w, w * w);
  assert.ok(Math.abs(m[0].f - lo) < 1e-6 && Math.abs(m[1].f - hi) < 1e-6 && Math.abs(m[0].sigma) < 1e-6);
  const d = twoOscillator(200, 230, 0.03); // detuned: the pair repel
  assert.ok(d[0] < 200 && d[1] > 230);
});
test('the disc opens its tube twice per turn; closing it adds end correction: less coupling, a flatter tube', () => {
  const bar = barModel(64), tg = tubeGeometry(64, bar), f = bar.modes[0].f, ts = tubeState(tg, f, { gap: 0.03, cd: 0.8 });
  const open = coupling(ts, 0, f), again = coupling(ts, Math.PI, f); // edge-on again after half a turn
  assert.ok(Math.abs(again.kappa / open.kappa - 1) < 1e-12 && Math.abs(again.ft / open.ft - 1) < 1e-12);
  let prevK = Infinity, prevF = Infinity;
  for (let th = 0; th <= Math.PI / 2 + 1e-9; th += Math.PI / 16) {
    const c = coupling(ts, th, f);
    assert.ok(c.kappa < prevK + 1e-15 && c.ft < prevF + 1e-9);
    prevK = c.kappa; prevF = c.ft;
  }
  assert.ok(cents(coupling(ts, Math.PI / 2, f).ft, f) < -100, 'a closed disc detunes the tube by over a semitone');
});

console.log('the engine');
test('tuning: every key F3–F6 sounds within ±3 ¢ of 12-TET (tubes on, motor off), at 44.1 and 48 kHz', () => {
  let worst = 0;
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += fs === 48000 ? 1 : 4) {
    const x = run(P({ motor: 'open' }), [[0, 'on', k, 0.5]], 1.4, { fs }), f = keyFreq(k);
    const a = Math.round(0.4 * fs), b = Math.round(1.4 * fs);
    const tw = (y, fr) => tone(y, fr, a, b, fs);
    let best = f, bv = -1;
    for (let c = -20; c <= 20; c += 0.5) { const fr = f * 2 ** (c / 1200), v = tw(x, fr); if (v > bv) { bv = v; best = fr; } }
    let lo = best * 2 ** (-0.5 / 1200), hi = best * 2 ** (0.5 / 1200);
    for (let it = 0; it < 30; it++) { const m1 = (2 * lo + hi) / 3, m2 = (lo + 2 * hi) / 3; if (tw(x, m1) > tw(x, m2)) hi = m2; else lo = m1; }
    const c = cents(0.5 * (lo + hi), f);
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 3, `key ${k} at ${fs}: ${c.toFixed(2)} ¢`);
  }
  console.log(`         worst ${worst.toFixed(2)} ¢`);
});
test('the partials are the model\'s: 4 and 10 × f₁ for the tuned bar, 2.7 and 5.3 × f₁ for a plain one (struck near the end)', () => {
  for (const depth of [1, 0]) {
    const k = 64, m = barModel(k, depth).modes, x = run(P({ motor: 'open', strike: 0.06, depth }), [[0, 'on', k, 0.8]], 0.6);
    for (const n of [1, 2]) {
      const f = peak(x, m[n].f * 0.97, m[n].f * 1.03, 1200, 1200 + 16384, 0.5);
      assert.ok(Math.abs(cents(f, m[n].f)) < 3, `depth ${depth}, mode ${n + 1}: ${f.toFixed(1)} vs ${m[n].f.toFixed(1)}`);
      assert.ok(tone(x, m[n].f, 1200, 1200 + 16384) > 30 * tone(x, m[n].f * 1.06, 1200, 1200 + 16384), `mode ${n + 1} stands out`);
    }
  }
});
test('coupled split: bar and tube pressed close (gap 6 mm) split into the damped two-oscillator pair, and their energy beats at the difference', () => {
  for (const k of [KEY_LO, 60]) {
    const bar = barModel(k), tg = tubeGeometry(k, bar), f1 = bar.modes[0].f, p = P({ motor: 'open', gap: 6 });
    const ts = tubeState(tg, f1, { gap: 0.006, detune: 0, temp: 20, cd: p.cd }), s1 = sigma1(k, p);
    const [lo, hi] = coupledModes(ts.M11, ts.M12, ts.M22, 2 * s1 * ts.M11, ts.R, (2 * Math.PI * f1) ** 2, ts.Ka);
    const c = coupling(ts, 0, f1), two = twoOscillator(c.fb, c.ft, c.kappa);
    assert.ok(Math.abs(two[1] - two[0] - (hi.f - lo.f)) < 0.02 * (hi.f - lo.f), 'damping barely moves the split here');
    const Et = [], x = run(p, [[0, 'on', k, 0.6]], 1.5, { tap: (e) => Et.push(e.voices[0]?.Et ?? 0) });
    const mid = (lo.f + hi.f) / 2;
    const fl = peak(x, lo.f - 3, mid, 1200, 1200 + FS), fh = peak(x, mid, hi.f + 3, 1200, 1200 + FS);
    assert.ok(Math.abs(fl - lo.f) < 0.1 && Math.abs(fh - hi.f) < 0.1, `${k}: engine ${fl.toFixed(3)}, ${fh.toFixed(3)} Hz; model ${lo.f.toFixed(3)}, ${hi.f.toFixed(3)}`);
    const maxima = [];
    for (let i = 1; i < Et.length - 1; i++) if (Et[i] > Et[i - 1] && Et[i] >= Et[i + 1]) maxima.push((i * 128) / FS);
    const period = (maxima[4] - maxima[0]) / 4;
    assert.ok(Math.abs(period * (hi.f - lo.f) - 1) < 0.03, `${k}: energy beats every ${period.toFixed(4)} s, 1/Δf = ${(1 / (hi.f - lo.f)).toFixed(4)} s`);
  }
});
test('tremolo: the output pulses at revolutions/s × 2 openings per turn; the discs\' phase steps along the shaft', () => {
  const rate = (x, k, a, b) => {
    const env = envelope(x, keyFreq(k), a, b), n = env.length, xm = (n - 1) / 2, ym = env.reduce((p, q) => p + q) / n;
    let sxy = 0, sxx = 0; env.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; });
    const r = env.map((y, i) => y - ym - (sxy / sxx) * (i - xm)), fr = FS / 240;
    let best = 0, bf = 0;
    for (let fm = 0.5; fm < 16; fm += 0.005) { let re = 0, im = 0; r.forEach((v, i) => { re += v * Math.cos((2 * Math.PI * fm * i) / fr); im += v * Math.sin((2 * Math.PI * fm * i) / fr); }); const m = Math.hypot(re, im); if (m > best) { best = m; bf = fm; } }
    return { f: bf, depth: Math.max(...r) - Math.min(...r) };
  };
  for (const [speed, k] of [[1.5, 72], [2.25, 65], [4, 77]]) {
    // let the shaft spin up for 2 s before striking
    const x = run(P({ speed }), [[2, 'on', k, 0.6]], 4.5), m = rate(x, k, Math.round(2.4 * FS), Math.round(4.4 * FS));
    assert.ok(Math.abs(m.f / (2 * speed) - 1) < 0.01, `${speed} rev/s: tremolo at ${m.f.toFixed(3)} Hz, expected ${2 * speed}`);
    assert.ok(m.depth > 8, `depth ${m.depth.toFixed(1)} dB`);
  }
  const still = run(P({ motor: 'open' }), [[0.5, 'on', 72, 0.6]], 3);
  assert.ok(rate(still, 72, Math.round(0.9 * FS), Math.round(2.9 * FS)).depth < 1, 'motor off: no tremolo');
  // two neighbouring naturals with the discs set 45° apart on the shaft open 45°/(360° × 2 rev/s) = 1/16 s
  // apart: a quarter of a 4 Hz tremolo cycle. Phase of the 4 Hz component of each bar's envelope:
  const phase4 = (twist, k) => {
    const env = envelope(run(P({ speed: 2, twist }), [[2, 'on', k, 0.6]], 4.5), keyFreq(k), Math.round(2.5 * FS), Math.round(4.5 * FS));
    let re = 0, im = 0;
    env.forEach((v, i) => { const t = (i * 240) / FS; re += v * Math.cos(2 * Math.PI * 4 * t); im += v * Math.sin(2 * Math.PI * 4 * t); });
    return Math.atan2(im, re);
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const shift = wrap(phase4(45, 74) - phase4(45, 72) - (phase4(0, 74) - phase4(0, 72)));
  assert.ok(Math.abs(Math.abs(shift) - Math.PI / 2) < 0.12, `C5 → D5 tremolo shifted by ${((shift * 180) / Math.PI).toFixed(1)}° of its cycle, expected ±90° (1/16 s)`);
});
test('the tube makes the fundamental louder and rounder (it swells as the tube fills) and shortens the bar\'s own ring', () => {
  for (const k of [KEY_LO, 65, 77]) {
    const r = {};
    for (const tubes of [true, false]) {
      const Eb = [], x = run(P({ motor: 'open', tubes }), [[0, 'on', k, 0.6]], 2.6, { tap: (e) => Eb.push(e.voices[0]?.Eb ?? 0) });
      const env = envelope(x, keyFreq(k), 0, Math.round(1.2 * FS)), pk = Math.max(...env);
      const i0 = Math.round((0.5 * FS) / 128), i1 = Math.round((2.5 * FS) / 128);
      r[tubes] = { pk, tPeak: (env.indexOf(pk) * 240) / FS, T60: 60 / (10 * Math.log10(Eb[i0] / Eb[i1]) / 2) };
    }
    assert.ok(r.true.pk - r.false.pk > 15, `key ${k}: ${(r.true.pk - r.false.pk).toFixed(1)} dB louder`);
    assert.ok(r.true.tPeak > 0.04 && r.false.tPeak < 0.02, `key ${k}: peaks at ${(1000 * r.true.tPeak).toFixed(0)} ms with the tube, ${(1000 * r.false.tPeak).toFixed(0)} ms without`);
    assert.ok(r.true.T60 < 0.4 * r.false.T60, `key ${k}: bar T60 ${r.true.T60.toFixed(1)} s with the tube, ${r.false.T60.toFixed(1)} s without`);
  }
});
test('mallet: harder heads and faster strikes leave sooner and wake the upper modes; the centre silences mode 2, mode 1\'s node the fundamental', () => {
  const k = 60, m = barModel(k).modes, at = (x, n) => tone(x, m[n].f, 600, 600 + 9600);
  const contact = (o, vel = 0.6) => { const x = run(P({ motor: 'open', ...o }), [[0, 'on', k, vel]], 0.25); return { x, ms: x.engine.voices[0].lastContactMs }; };
  const soft = contact({ hardness: 100, strike: 0.3 }), hard = contact({ hardness: 4000, strike: 0.3 });
  assert.ok(hard.ms < 0.6 * soft.ms, `contact ${soft.ms.toFixed(2)} → ${hard.ms.toFixed(2)} ms`);
  assert.ok(at(hard.x, 2) / at(hard.x, 0) > 10 * (at(soft.x, 2) / at(soft.x, 0)), 'mode 3 relative to mode 1 grows with hardness');
  const slow = contact({ strike: 0.3 }, 0.2), fast = contact({ strike: 0.3 }, 1);
  assert.ok(fast.ms < 0.75 * slow.ms, `Hertz: contact shortens with speed, ${slow.ms.toFixed(2)} → ${fast.ms.toFixed(2)} ms`);
  const centre = contact({ strike: 0.5, across: 0 }), end = contact({ strike: 0.04, across: 0 });
  assert.ok(at(centre.x, 1) / at(centre.x, 0) < 0.01 * (at(end.x, 1) / at(end.x, 0)), 'mode 2 silent at the centre');
  const xn = barModel(k).nodes[0] / barModel(k).geom.L, node = contact({ strike: xn, across: 0 });
  assert.ok(at(node.x, 0) < 0.02 * at(centre.x, 0), `on mode 1's node (${(100 * xn).toFixed(1)} %) the fundamental drops out`);
  // off the centre line the bar twists: its torsional modes join in
  const ti = m.findIndex((q) => q.kind === 'tors' && q.n === 2), on = contact({ strike: 0.1, across: 0 }), off = contact({ strike: 0.1, across: 0.8 });
  assert.ok(at(off.x, ti) > 30 * at(on.x, ti), 'torsion 2 wakes when struck off the centre line');
});
test('damper: key up stops the bar at the felt\'s T₆₀; Space, the pedal lock or a held key keep it ringing', () => {
  const k = 67, f = keyFreq(k), lvl = (x, t) => tone(x, f, Math.round(t * FS), Math.round(t * FS) + 2400) + 1e-30;
  const drop = (x, t0 = 0.85, t1 = 1.25) => 20 * Math.log10(lvl(x, t1) / lvl(x, t0)); // dB from 0.05 s to 0.45 s after a key-up at 0.8 s
  const damped = run(P({ motor: 'open', damp: 0.3 }), [[0, 'on', k, 0.6], [0.8, 'off', k]], 1.5);
  const d = drop(damped, 0.85, 1.0);
  assert.ok(Math.abs(d - -30) < 8, `damped: ${d.toFixed(1)} dB in 0.15 s (T₆₀ 0.3 s: −30 dB)`);
  const held = run(P({ motor: 'open' }), [[0, 'on', k, 0.6]], 1.5);
  const pedal = run(P({ motor: 'open' }), [[0, 'sus', true], [0, 'on', k, 0.6], [0.8, 'off', k]], 1.5);
  const lock = run(P({ motor: 'open', pedalLock: true }), [[0, 'on', k, 0.6], [0.8, 'off', k]], 1.5);
  for (const [name, x] of [['held', held], ['pedal', pedal], ['lock', lock]]) assert.ok(drop(x) > -6, `${name}: ${drop(x).toFixed(1)} dB`);
  // pedal up after key-up: the felt lands then
  const late = run(P({ motor: 'open' }), [[0, 'sus', true], [0, 'on', k, 0.6], [0.4, 'off', k], [0.8, 'sus', false]], 1.5);
  assert.ok(drop(late) < -40, `pedal released: ${drop(late).toFixed(1)} dB`);
  // and the voice frees itself once damped
  assert.equal(run(P({ motor: 'open' }), [[0, 'on', k, 0.6], [0.2, 'off', k]], 2.5).engine.voiceCount(), 0);
});
test('re-striking a ringing bar strikes the same bar (no second voice); a re-cut bar fades the old one', () => {
  const x = run(P(), [[0, 'sus', true], [0, 'on', 60, 0.5], [0.3, 'on', 60, 0.5], [0.6, 'on', 60, 0.9], [0.9, 'on', 60, 0.2]], 1.2);
  assert.equal(x.engine.voiceCount(), 1);
  const e = run(P({ motor: 'open' }), [[0, 'sus', true], [0, 'on', 60, 0.5], [0.3, 'params', P({ motor: 'open', depth: 0.5 })], [0.3, 'on', 60, 0.5]], 0.32).engine;
  assert.equal(e.voices.length, 2); assert.ok(e.voices[0].fading && !e.voices[1].fading);
});
test('voice stealing fades the quietest older bar, never one just struck; no clicks', () => {
  const ev = [[0, 'sus', true]];
  for (let i = 0; i < 30; i++) ev.push([0.05 * i, 'on', KEY_LO + i, 0.3 + 0.02 * i]);
  const x = run(P({ motor: 'open' }), ev, 2), e = x.engine;
  assert.ok(e.voices.filter((v) => !v.fading).length <= 16, `${e.voices.length} voices`);
  assert.ok(e.byKey.has(KEY_LO + 29) && !e.byKey.get(KEY_LO + 29).fading, 'the newest bar sounds');
  // no sample-to-sample jump far beyond the signal's own slope
  let worst = 0;
  for (let i = 2; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]));
  assert.ok(worst < 0.15 * peakAbs(x), `second difference ${worst.toExponential(2)} vs peak ${peakAbs(x).toFixed(3)}`);
});
test('level: a forte note peaks at 0.1–0.5 anywhere on the keyboard at 44.1 and 48 kHz; a 4-note forte chord and a 6-note mf chord stay under 1', () => {
  const stereoPeak = (p, ev, sec, o) => { const [L, R] = run(p, ev, sec, { ...o, stereo: true }); return Math.max(peakAbs(L), peakAbs(R)); };
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += 3) {
    const pk = stereoPeak(P(), [[0, 'on', k, 1]], 0.8, { fs });
    assert.ok(pk > 0.1 && pk < 0.5, `key ${k} at ${fs}: ${pk.toFixed(3)}`);
  }
  const c4 = stereoPeak(P(), [60, 64, 67, 72].map((k) => [0, 'on', k, 1]), 1.5), c6 = stereoPeak(P(), [65, 69, 72, 76, 79, 84].map((k) => [0, 'on', k, 0.8]), 1.5);
  assert.ok(c4 < 1 && c6 < 1, `chords ${c4.toFixed(3)}, ${c6.toFixed(3)}`);
  // and every preset stays within 10 dB of the default on a phrase
  const phrase = (p) => { const x = run(p, [60, 64, 67, 72, 76].map((k, i) => [0.15 * i, 'on', k, 0.6]), 1.5); return rmsDb(x, 0, x.length); };
  const ref = phrase(P());
  for (const pr of PRESETS) { const d = phrase(P(pr.p)) - ref; assert.ok(d < 10, `${pr.name}: ${d.toFixed(1)} dB`); }
});
// The loudest corner is physical, not a blow-up: a 40 g hard head at 5 m/s into a bar whose tube
// sits 5 mm below it peaks near 6 (a normal forte: 0.3). The shell's limiter takes it.
test('stability: seeded random combinations of parameter extremes at 44.1 and 48 kHz, knobs moved mid-note: no NaN, bounded', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((p) => !p.type);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 14; trial++) {
    const fs = trial % 2 ? 44100 : 48000, p = P();
    for (const q of sliders) if (!['volume', 'room', 'venue'].includes(q.id)) { const r = rnd(); p[q.id] = r < 0.4 ? q.min : r < 0.8 ? q.max : q.def; }
    p.motor = ['run', 'open', 'closed'][trial % 3]; p.tubes = trial % 4 !== 3; p.pedalLock = trial % 5 === 0;
    const q = { ...p, gap: p.gap === 5 ? 80 : 5, cd: p.cd > 0.5 ? 0.3 : 0.97, detune: -p.detune || 200, temp: 40 - p.temp };
    const x = run(p, [[0, 'on', KEY_LO, 1], [0, 'on', 70, 1], [0, 'on', KEY_HI, 1], [0.25, 'params', q], [0.3, 'on', 70, 1], [0.6, 'off', 70], [0.6, 'off', KEY_LO], [0.6, 'off', KEY_HI]], 0.9, { fs });
    for (const v of x) assert.ok(Number.isFinite(v), `trial ${trial}: NaN`);
    assert.ok(peakAbs(x) < 8, `trial ${trial}: peak ${peakAbs(x).toFixed(2)}`);
    if (!p.pedalLock) assert.ok(peakAbs(x.subarray(x.length - 4800)) < 0.5 * peakAbs(x) + 1e-9, `trial ${trial}: the dampers do not stop it`);
  }
});
test('knobs glide: the gap, tube tuning, disc size, shaft phase and temperature moved mid-note do not click', () => {
  for (const [id, to] of [['gap', 5], ['detune', 200], ['cd', 0.97], ['shaft2', 180], ['twist', 90], ['temp', 0], ['tubes', false]]) {
    const p = P({ motor: 'open' }), x = run(p, [[0, 'on', 61, 0.7], [0.5, 'params', { ...p, [id]: to }]], 0.8);
    let before = 0, after = 0;
    for (let i = Math.round(0.3 * FS); i < x.length; i++) { const d = Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]); if (i < 0.5 * FS) before = Math.max(before, d); else after = Math.max(after, d); }
    assert.ok(after < 3 * before + 1e-6, `${id}: second difference ${after.toExponential(2)} after, ${before.toExponential(2)} before`);
  }
});
test('CPU: 10 sounding bars at 48 kHz, motor running, in well under 30 % of real time', () => {
  const e = new VibraphoneEngine(FS); e.setParams(P()); e.setSustain(true);
  for (let i = 0; i < 10; i++) e.noteOn(KEY_LO + 3 * i, 0.8, voiceData(KEY_LO + 3 * i, 1));
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (let i = 0; i < 100; i++) e.process(bL, bR, 128); // warm up
  const n = Math.round((4 * FS) / 128), t0 = performance.now();
  for (let i = 0; i < n; i++) e.process(bL, bR, 128);
  const load = (performance.now() - t0) / 1000 / 4;
  console.log(`         ${(100 * load).toFixed(1)} % of real time for ${e.voiceCount()} voices`);
  assert.equal(e.voiceCount(), 10);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
