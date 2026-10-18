// Free-Reed Organ checks. Run: node test/harmonium-tests.mjs
//
// The reed against the clamped–free beam with a tip mass (its frequency equation, Rayleigh's
// approximation, orthogonality), the slot's area in its limits, the linear analysis in its limits
// (no wind: the bare reed; low flow: extra damping; no air mass: no oscillation; a cell tuned below
// the reed: no blown-closed oscillation); then the engine against the model (threshold, growth
// rate and frequency at onset), tuning, the advertised effects (pitch and onset against pressure,
// musette beats, sag, pumping, cassotto, percussion), voices, levels, stability and CPU.
// The model and the engine are the C++ (native/instruments/harmonium), built as WebAssembly: the
// model's functions through harmonium-wasm.js, the engine through loadEngine.

import assert from 'node:assert/strict';
import { KEY_LO, KEY_HI, RANKS, areaAt } from '../harmonium/src/harmonium-data.js';
import { INSTRUMENT } from '../harmonium/src/harmonium-instrument.js';
import { wasmModel } from '../harmonium/src/harmonium-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS } from '../harmonium/src/harmonium-params.js';
import { fft } from '../tools/audio-util.mjs';
import { keyFreq } from '../shared/dsp.js';

const HarmoniumEngine = await loadEngine(INSTRUMENT);
const { reedModel, threshold, equilibrium, linearRoot, cassotto, gapWidth, rankFreq, modeShape } = await wasmModel();
// the C++'s numbers (harmonium-model.h): brass; the wind (the feeders' conductance, the reservoir's
// and the wind chest's time constants)
const BRASS = { E: 1.0e11, rho: 8500 }, WIND = { G: 1.0e-4, tauRes: 0.6, tauExpr: 0.015 };
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// The clamped–free beam with a point mass at its tip (μ = M/ρAL), from the moment-free tip and
// the tip weight's inertia in the shear:
//   1 + cos λ cosh λ + μλ (cos λ sinh λ − sin λ cosh λ) = 0,   ω = λ² √(EI/ρA) / L²
// Its first n roots λ, by bisection on a scan: the textbook equation, to check the C++'s reeds.
function tipMassRoots(mu, n = 2) {
  const F = (x) => (1 + Math.cos(x) * Math.cosh(x) + mu * x * (Math.cos(x) * Math.sinh(x) - Math.sin(x) * Math.cosh(x))) / Math.cosh(x);
  const roots = [];
  for (let x = 0.05; roots.length < n && x < 40; x += 0.01) {
    if (F(x) * F(x + 0.01) <= 0) {
      let a = x, c = x + 0.01;
      for (let i = 0; i < 60; i++) { const m = 0.5 * (a + c); if (F(a) * F(m) <= 0) c = m; else a = m; }
      roots.push(0.5 * (a + c));
    }
  }
  return roots;
}

// The reference the engine's time stepping is checked against: the small-signal analysis of a
// reed (harmonium-model.cpp's equilibrium and linearRoot) in the frequency domain. The steady
// state at wind Pw, then small oscillations about it ∝ e^{st}. Linearised: the gap's flow
// δU_g = δΔp/R_j + G_A δy, the reed's own swept volume s S_n η_n, the cell (compliance C) fed
// through the throat (s M_a + R_in). Eliminating the pressures leaves
//   F(s) = 1 + Z_eff(s) Σₙ Sₙ (s Sₙ + G_A) / (mₙ (s² + 2ζₙωₙ s + ωₙ²)) = 0,
// whose root near the reed's own is returned as { re, im }. The engine never runs it: it
// integrates the nonlinear equations in time.
const cx = (re, im) => ({ re, im });

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const rel = (a, b) => Math.abs(a / b - 1);
const TAU = 2 * Math.PI;

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'params', P] | [t, 'press', value]),
// in 128-sample blocks like the AudioWorklet; tap(engine, t) after every block.
function run(params, events, sec, { fs = FS, seed = 1, tap, opts = { track: true } } = {}) {
  const e = new HarmoniumEngine(fs, seed, opts);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a, b); else if (type === 'params') e.setParams(a);
      else if (type === 'press') e.handle({ type: 'pressure', key: null, value: a });
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, s / fs);
  }
  return { L, R, e };
}
const hold = (key, p, sec = 1, o) => run(p, [[0, 'on', key, 0.7]], sec, o);
const peakAbs = (r) => { let p = 0; for (const x of [r.L, r.R]) for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// the time (s) at which the rms over 10 ms windows first reaches half its final value
function onset(x, fs = FS) {
  const W = Math.round(0.01 * fs), env = [];
  for (let a = 0; a + W <= x.length; a += W) env.push(rms(x, a, a + W));
  const fin = env.slice(-10).reduce((s, v) => s + v, 0) / 10, i = env.findIndex((v) => v > 0.5 * fin);
  return i < 0 ? Infinity : (i * W) / fs;
}
// sounding frequency of the output near f over [a, b): phase advance of the demodulated signal
function freqAt(x, f, a, b, fs = FS) {
  const m = 4096, ph = (s, fr) => { const w = (TAU * fr) / fs; let re = 0, im = 0; for (let i = s; i < s + m; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - s)) / m); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); } return Math.atan2(im, re); };
  const wrap = (d) => d - TAU * Math.round(d / TAU);
  const f1 = f + (wrap(ph(a + 512, f) - ph(a, f)) * fs) / (TAU * 512);
  return f1 + (wrap(ph(b - m, f1) - ph(a, f1)) * fs) / (TAU * (b - m - a));
}
function level(x, f, a, b, fs = FS) { // Hann-windowed amplitude at f
  const w = (TAU * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// Start a reed at its steady state at wind p.pressure, with a tiny kick, and follow the envelope of
// its tip (half its swing over each period): returns the exponential rate fitted over 0.05–0.6 s (or until
// the swing reaches 300× the kick), and the frequency there (the tip's own zero crossings).
function growth(key, p, kick = 1e-7) {
  const e = new HarmoniumEngine(FS, 1, { track: true });
  e.setParams({ ...p, principal: true, musette: 'off', bourdon: false, piccolo: false });
  e.noteOn(key, 1);
  const v = e.voices[0], rd = v.reeds[1];
  v.a = 1; v.aTarget = 1;
  rd.setSteady(equilibrium(rd.R, p.pressure));
  rd.v1 = kick * rd.R.modes[0].om;
  for (let i = 0; i < e.noise.length; i++) e.noise[i] = 0; // no turbulence: the kick alone
  const bL = new Float32Array(16), bR = new Float32Array(16), pts = [];
  const T = 1 / rd.R.fSound, W = Math.max(2, Math.ceil((T * FS) / 16)); // at least one whole period
  let mx = -Infinity, mn = Infinity, k = 0, f = 0;
  for (let i = 0; i < 1800; i++) {
    e.process(bL, bR, 16);
    mx = Math.max(mx, rd.y); mn = Math.min(mn, rd.y);
    if (++k >= W) { // half the swing over about one period (a slow drift of the mean does not count)
      const t = ((i + 1) * 16) / FS, a = 0.5 * (mx - mn);
      if (t > 0.05) pts.push([t, a]);
      if (a < 300 * kick) f = rd.freq();
      mx = -Infinity; mn = Infinity; k = 0;
      if (a > 300 * kick) break;
    }
  }
  const n = pts.length, mt = pts.reduce((s, p2) => s + p2[0], 0) / n, ml = pts.reduce((s, p2) => s + Math.log(p2[1]), 0) / n;
  let num = 0, den = 0;
  for (const [t, a] of pts) { num += (t - mt) * (Math.log(a) - ml); den += (t - mt) ** 2; }
  return { rate: num / den, n, f };
}

console.log('the reed');
test('clamped–free beam with a tip mass: 1 + cos λ cosh λ + μλ(cos λ sinh λ − sin λ cosh λ) = 0 gives the bare cantilever’s 1.8751 and 4.6941, and λ₁ = 1.2479 when the weight equals the tongue', () => {
  const [a, b] = tipMassRoots(0);
  assert.ok(Math.abs(a - 1.87510) < 1e-4 && Math.abs(b - 4.69409) < 1e-4, `${a} ${b}`);
  assert.ok(Math.abs(tipMassRoots(1)[0] - 1.24792) < 1e-4, `${tipMassRoots(1)[0]}`);
  // the bare ratio f₂/f₁ = 6.267
  assert.ok(Math.abs((b / a) ** 2 - 6.2669) < 1e-3);
});
test('the mode shapes: tip normalised to 1, moment-free at the tip, and orthogonal with the tip weight included (∫ρAψ₁ψ₂ + Mψ₁ψ₂|tip = 0)', () => {
  for (const mu of [0, 0.4, 1]) {
    const [l1, l2] = tipMassRoots(mu, 2), N = 4000;
    assert.ok(Math.abs(modeShape(l1, 1) - 1) < 1e-12 && Math.abs(modeShape(l2, 1) - 1) < 1e-12);
    const d2 = (l, u) => { const e = 1e-4; return (modeShape(l, u + e) - 2 * modeShape(l, u) + modeShape(l, u - e)) / (e * e); };
    assert.ok(Math.abs(d2(l1, 1 - 1e-4)) < 2e-3 * Math.abs(d2(l1, 0.0001)), `μ ${mu}: curvature at the tip`);
    let s = 0;
    for (let i = 0; i < N; i++) { const u = (i + 0.5) / N; s += modeShape(l1, u) * modeShape(l2, u); }
    s = s / N + mu * 1 * 1; // ρAL·∫ψ₁ψ₂ du + M·1·1, in units of ρAL
    assert.ok(Math.abs(s) < 2e-4, `μ ${mu}: ${s}`);
  }
});
test('every reed’s natural frequency: within 1.5 % of Rayleigh’s one-term estimate f = (1/2π)√(3EI/L³ / (M + 0.2357 m)), which knows nothing of the mode shapes', () => {
  for (let m = 24; m <= 108; m += 6) {
    const f = keyFreq(m), d = reedModel(f, P(), false), { L, b, h } = d.geo, EI = (BRASS.E * b * h ** 3) / 12; // (untuned: cut to f)
    const fr = Math.sqrt((3 * EI) / L ** 3 / (d.M + 0.2357 * d.m0)) / TAU;
    assert.ok(rel(fr, d.modes[0].f) < 0.015, `${m}: ${fr.toFixed(2)} vs ${d.modes[0].f.toFixed(2)} Hz`);
    assert.ok(rel(d.modes[0].f, f) < 1e-9, `${m}: cut to ${d.modes[0].f}`);
  }
});
test('the slot: clear of it the gap opens as the perimeter (2∫ψ + b)·|y|; inside it, only the clearance δ(2L + b + 2δ) is left; the overlap is the plate plus the tongue (e + h)', () => {
  const R = reedModel(keyFreq(60), P()), g = R.geo, I1 = (() => { let s = 0; for (let i = 0; i < 4000; i++) s += modeShape(g.lam[0], (i + 0.5) / 4000); return s / 4000; })();
  const slotArea = (y) => areaAt(R.table, y, {}).A; // the reed's area table, as the engine reads it
  const perim = 2 * g.L * I1 + g.b + 2 * g.delta;
  for (const y of [-2e-3, -4e-3]) assert.ok(rel(slotArea(y), perim * Math.abs(y)) < 0.03, `y ${y}: ${slotArea(y)} vs ${perim * Math.abs(y)}`);
  const clear = g.delta * (2 * g.L + g.b + 2 * g.delta);
  for (const y of [0.3 * g.e, g.e, 0.9 * (g.e + g.h)]) assert.ok(rel(slotArea(y), clear) < 0.01 + 1e-9 * y, `y ${y}: ${slotArea(y)} vs ${clear}`);
  assert.ok(slotArea(g.e + g.h + 1e-3) > 5 * clear, 'open again beyond the slot');
  assert.equal(gapWidth(0.5 * g.e, g.e, g.h, g.delta), g.delta);
});

console.log('the linear analysis');
test('no wind: the analysis returns the reed’s own frequency, damped a little more by the air it pumps; at low flow the air adds damping, at higher flow it drives (Cottingham, Reed & Busha 1999)', () => {
  const R = reedModel(keyFreq(60), P()), md = R.modes[0];
  const s0 = linearRoot(R, 1e-6);
  assert.ok(rel(s0.im, md.om * Math.sqrt(1 - md.zeta ** 2)) < 2e-3 && -s0.re >= md.zeta * md.om, `${s0.re} ${s0.im}`);
  const sLow = linearRoot(R, 10), sHigh = linearRoot(R, 800);
  assert.ok(sLow.re < -md.zeta * md.om, `10 Pa: ${sLow.re} vs ${-md.zeta * md.om}`);
  assert.ok(sHigh.re > 0, `800 Pa: ${sHigh.re}`);
});
test('the drive is the air’s mass: with almost none in the throat, or a cell so big its resonance falls below the reed (a compliant load), a blown-closed reed does not start (Fletcher 1993)', () => {
  const thr0 = threshold(reedModel(keyFreq(60), P()), 2e4).P;
  const noMass = threshold(reedModel(keyFreq(60), P({ throat: 0.01 })), 2e4);
  assert.ok(!noMass || noMass.P > 10 * thr0, `throat × 0.01: ${noMass && noMass.P}`);
  // cell × 20: Helmholtz resonance 3/√20 = 0.67 of the reed
  const Rbig = reedModel(keyFreq(60), P({ cell: 20 }));
  assert.ok(Rbig.fCell < Rbig.fNat);
  const big = threshold(Rbig, 2e4);
  assert.ok(!big || big.P > 10 * thr0, `cell × 20: ${big && big.P}`);
  console.log(`        threshold at C4 ${thr0.toFixed(0)} Pa; throat × 0.01 ${noMass ? noMass.P.toFixed(0) : 'never'}; cell below the reed ${big ? big.P.toFixed(0) : 'never'}`);
});

test('the threshold is where the linear analysis’s root crosses the imaginary axis, at the frequency the reed starts at, at C2, C4 and C7', () => {
  for (const key of [36, 60, 96]) {
    const R = reedModel(keyFreq(key), P()), thr = threshold(R, 2e4);
    // the onset: the root crosses the imaginary axis there
    const s = linearRoot(R, thr.P, cx(0, TAU * thr.f)), below = linearRoot(R, 0.999 * thr.P, s), above = linearRoot(R, 1.001 * thr.P, s);
    assert.ok(below.re < 0 && above.re > 0, `${key} at ${thr.P.toFixed(1)} Pa: ${below.re} → ${above.re}`);
    assert.ok(Math.abs(cents(s.im / TAU, thr.f)) < 0.01, `${key}: ${(s.im / TAU).toFixed(3)} vs ${thr.f.toFixed(3)} Hz`);
  }
});

console.log('the engine against the model');
test('threshold: above the predicted pressure (× 1.25) a kicked reed grows, below it (× 0.8) it dies away, at the model’s rate (within 5 % of the full-wind rate), at C3, C4 and C6', () => {
  const out = [];
  for (const key of [48, 60, 84]) {
    const R = reedModel(keyFreq(key), P()), thr = threshold(R, 2e4).P;
    const full = linearRoot(R, P().pressure).re; // the scale: the growth rate at the default wind
    for (const [m, sign] of [[1.25, 1], [0.8, -1]]) {
      const p = P({ pressure: m * thr }), g = growth(key, p), s = linearRoot(R, p.pressure);
      assert.ok(Math.sign(g.rate) === sign && Math.abs(g.rate - s.re) < 0.05 * full, `${key} at ${p.pressure.toFixed(0)} Pa: engine ${g.rate.toFixed(2)}/s, model ${s.re.toFixed(2)}/s (full wind ${full.toFixed(1)}/s)`);
    }
    out.push(`${noteName(key)} ${thr.toFixed(0)} Pa`);
  }
  console.log(`        thresholds: ${out.join(', ')}`);
});
test('onset: the reed grows at the linear rate Re s (within 10 %) and starts at the frequency Im s/2π (within 2 ¢), at C3, C4, C5 and C7', () => {
  for (const key of [48, 60, 72, 96]) {
    const p = P(), R = reedModel(keyFreq(key), p), s = linearRoot(R, p.pressure), g = growth(key, p);
    assert.ok(g.n >= 4 && rel(g.rate, s.re) < 0.1, `${key}: engine ${g.rate.toFixed(1)}/s, model ${s.re.toFixed(1)}/s (${g.n} points)`);
    assert.ok(Math.abs(cents(g.f, s.im / TAU)) < 2, `${key}: ${g.f.toFixed(2)} vs ${(s.im / TAU).toFixed(2)} Hz`);
  }
});

console.log('tuning and speech');
test('tuning: every key C2–C7 sounds within ±3 ¢ of equal temperament at the default wind (48 kHz; every fourth key at 44.1 kHz), and so do the 16′ and 4′ ranks', () => {
  let worst = 0;
  const check = (key, p, rank, fs) => {
    const long = rank === 0, r = hold(key, p, long ? 1.4 : 1.0, { fs, opts: { track: true } }), f0 = rankFreq(key, rank, p);
    const f = freqAt(r.L, f0, Math.round((long ? 0.7 : 0.5) * fs), r.L.length, fs), c = cents(f, f0);
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 3, `${key} rank ${RANKS[rank].name} at ${fs}: ${c.toFixed(2)} ¢`);
  };
  for (let k = KEY_LO; k <= KEY_HI; k++) check(k, P(), 1, 48000);
  for (let k = KEY_LO; k <= KEY_HI; k += 4) check(k, P(), 1, 44100);
  for (const k of [36, 42, 47]) check(k, P({ principal: false, bourdon: true }), 0, 48000);
  for (const k of [85, 90, 96]) check(k, P({ principal: false, piccolo: true }), 4, 48000);
  console.log(`        worst ${worst.toFixed(2)} ¢`);
});
test('every key speaks at the default wind: half its full level within 300 ms of the key going down (C2–C7)', () => {
  const t = [];
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const r = hold(k, P(), 0.9), o = onset(r.L);
    assert.ok(o < 0.3, `${k}: ${o}`);
    t.push(o);
  }
  console.log(`        onsets ${(Math.min(...t) * 1000).toFixed(0)}–${(Math.max(...t) * 1000).toFixed(0)} ms (C2 ${(t[0] * 1000).toFixed(0)}, C4 ${(t[24] * 1000).toFixed(0)}, C7 ${(t[60] * 1000).toFixed(0)} ms)`);
});
test('more wind: quicker to speak and louder, and the pitch falls slightly and steadily (C4: 250 → 2500 Pa)', () => {
  const ps = [250, 500, 1000, 2000, 2500], on = [], lv = [], fr = [];
  for (const p of ps) {
    const r = hold(60, P({ pressure: p }), 1.4);
    on.push(onset(r.L)); lv.push(rms(r.L, 48000, r.L.length)); fr.push(freqAt(r.L, keyFreq(60), 48000, r.L.length));
  }
  for (let i = 1; i < ps.length; i++) {
    assert.ok(on[i] < on[i - 1], `onset ${on.map((v) => v.toFixed(3))}`);
    assert.ok(lv[i] > lv[i - 1], `level ${lv.map((v) => v.toFixed(3))}`);
    assert.ok(fr[i] < fr[i - 1], `frequency ${fr.map((v) => v.toFixed(2))}`);
  }
  const fall = cents(fr[ps.length - 1], fr[0]);
  assert.ok(fall < -3 && fall > -30, `${fall.toFixed(1)} ¢`);
  console.log(`        ${ps.map((p, i) => `${p} Pa: ${(on[i] * 1000).toFixed(0)} ms, ${cents(fr[i], keyFreq(60)).toFixed(1)} ¢`).join('; ')}`);
});
test('velocity opens the pallet faster, and a faster pallet starts the reed sooner; percussion sooner still', () => {
  const soft = onset(run(P(), [[0, 'on', 48, 0.1]], 0.8).L), hard = onset(run(P(), [[0, 'on', 48, 1]], 0.8).L);
  const perc = onset(run(P({ percussion: true }), [[0, 'on', 48, 1]], 0.8).L);
  assert.ok(hard < soft && perc < hard, `${soft} ${hard} ${perc}`);
});

console.log('effects');
test('musette: the reeds sound at their design frequencies (within 0.5 ¢), and two reeds 12 ¢ apart beat at their frequency difference (within 2 %)', () => {
  const key = 69, p3 = P({ musette: 'three', detune: 12 });
  const r3 = run(p3, [[0, 'on', key, 0.7]], 1.5), v3 = r3.e.voices[0];
  for (const rank of [1, 2, 3]) assert.ok(Math.abs(cents(v3.reeds[rank].freq(), rankFreq(key, rank, p3))) < 0.5, `${RANKS[rank].name}: ${v3.reeds[rank].freq()}`);
  // two reeds: the envelope of the output from 1 to 7 s, then its strongest slow component
  const p = P({ musette: 'two', detune: 12 }), r = run(p, [[0, 'on', key, 0.7]], 7), v = r.e.voices[0];
  const W = Math.round(0.01 * FS), env = [];
  for (let a = FS; a + W <= r.L.length; a += W) env.push(rms(r.L, a, a + W) ** 2);
  const mean = env.reduce((s2, x) => s2 + x, 0) / env.length, ev = env.map((x) => x - mean);
  let best = 0, fb = 0;
  for (let f = 1; f <= 8; f += 0.002) { const w = TAU * f * 0.01; let re = 0, im = 0; for (let i = 0; i < ev.length; i++) { const hh = 0.5 - 0.5 * Math.cos((TAU * i) / ev.length); re += hh * ev[i] * Math.cos(w * i); im += hh * ev[i] * Math.sin(w * i); } const a = Math.hypot(re, im); if (a > best) { best = a; fb = f; } }
  const df = v.reeds[2].freq() - v.reeds[1].freq();
  assert.ok(rel(fb, df) < 0.02, `beats ${fb.toFixed(3)} /s vs Δf ${df.toFixed(3)} Hz`);
  console.log(`        A4 three reeds: ${v3.reeds[3].freq().toFixed(2)}, ${v3.reeds[1].freq().toFixed(2)}, ${v3.reeds[2].freq().toFixed(2)} Hz; two reeds beat ${fb.toFixed(3)}/s, Δf ${df.toFixed(3)} Hz`);
});
test('the reservoir: a big chord sags the pressure by its draw over the feeders’ conductance, ΔP = U/G (within 5 %); the expression stop settles 40× faster', () => {
  const keys = [48, 52, 55, 60, 64, 67, 71, 72, 76, 79];
  let U = 0, n = 0;
  const r = run(P(), keys.map((k) => [0, 'on', k, 0.7]), 4, { tap: (e, t) => { if (t > 3) { U += e.Utot; n++; } } });
  const sag = P().pressure - r.e.Pres, pred = U / n / WIND.G;
  assert.ok(rel(sag, pred) < 0.05, `sag ${sag.toFixed(1)} Pa, U/G ${pred.toFixed(1)} Pa`);
  assert.ok(sag / P().pressure > 0.01 && sag / P().pressure < 0.08, `${((100 * sag) / P().pressure).toFixed(1)} %`);
  // time to within 1/e of the final sag: reservoir vs expression stop
  const tTo = (p) => { let t1 = null, fin = 0; const Pt = []; run(p, keys.map((k) => [0, 'on', k, 0.7]), 3, { tap: (e, t) => Pt.push([t, e.Pres]) }); fin = Pt[Pt.length - 1][1]; const d0 = P().pressure - fin; for (const [t, pp] of Pt) if (t > 0.15 && t1 === null && Math.abs(pp - fin) < Math.abs(d0) / Math.E) t1 = t; return t1; };
  const tRes = tTo(P()), tExpr = tTo(P({ expression: true }));
  assert.ok(tRes > 20 * (tExpr - 0.15) && tRes > 0.5, `reservoir ${tRes}, expression ${tExpr}`);
  console.log(`        10 keys draw ${((U / n) * 1000).toFixed(2)} L/s: the pressure sags ${sag.toFixed(1)} Pa (${((100 * sag) / P().pressure).toFixed(1)} %)`);
});
test('pumping: through the expression stop the pressure swells at twice the stroke rate; the reservoir smooths it as a first-order low-pass of time constant τ = C/G (ratio within 20 %)', () => {
  const rate = 1.2, fr = 2 * rate;
  const swell = (p) => { const Pt = []; run(p, [[0, 'on', 60, 0.7]], 6, { tap: (e, t) => { if (t > 2) Pt.push(e.Pres); } }); return level(Float64Array.from(Pt), fr, 0, Pt.length, FS / 128); };
  const expr = swell(P({ expression: true, pump: rate })), res = swell(P({ pump: rate }));
  const w = TAU * fr, pred = Math.sqrt(1 + (w * WIND.tauRes) ** 2) / Math.sqrt(1 + (w * WIND.tauExpr) ** 2);
  assert.ok(rel(expr / res, pred) < 0.2, `ratio ${(expr / res).toFixed(2)}, first-order ${pred.toFixed(2)}`);
  const Pt = [];
  run(P({ expression: true, pump: rate }), [[0, 'on', 60, 0.7]], 4, { tap: (e, t) => Pt.push([t, e.Pres]) });
  const mean = Pt.reduce((s2, x) => s2 + x[1], 0) / Pt.length, ups = [];
  for (let i = 1; i < Pt.length; i++) if (Pt[i - 1][1] < mean && Pt[i][1] >= mean && Pt[i][0] > 0.5) ups.push(Pt[i][0]);
  const T = (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
  assert.ok(rel(1 / T, fr) < 0.05, `${(1 / T).toFixed(2)} swells/s`);
});
test('cassotto: the chamber softens the upper harmonics (the 12th to 24th fall ≥ 10 dB against the fundamental) and lowers the pitch slightly', () => {
  const a = hold(60, P(), 1.2), b = hold(60, P({ cassotto: true }), 1.2), f0 = keyFreq(60);
  const rat = (r, n) => level(r.L, n * f0, 24000, r.L.length) / level(r.L, f0, 24000, r.L.length);
  let hi = 0, hiC = 0;
  for (let n = 12; n <= 24; n++) { hi += rat(a, n) ** 2; hiC += rat(b, n) ** 2; }
  const dB = 10 * Math.log10(hiC / hi);
  assert.ok(dB < -10, `${dB.toFixed(1)} dB`);
  const fa = freqAt(a.L, f0, 24000, a.L.length), fb = freqAt(b.L, f0, 24000, b.L.length), c = cents(fb, fa);
  assert.ok(c < 0 && c > -5, `${c.toFixed(2)} ¢`);
  console.log(`        C4: harmonics 12–24 ${dB.toFixed(1)} dB, pitch ${c.toFixed(2)} ¢`);
  const cs = cassotto(P().cassF);
  assert.ok(rel(1 / (TAU * Math.sqrt(cs.M * cs.C)), P().cassF) < 1e-9);
});

console.log('voices');
test('re-pressing a sounding key reopens the same pallet on the same reeds (no second voice); a quick tap still sounds; key up silences it (−40 dB) within 0.25 s', () => {
  const r = run(P(), [[0, 'on', 60, 0.7], [0.5, 'off', 60], [0.52, 'on', 60, 0.7], [1.0, 'off', 60]], 1.6);
  assert.equal(r.e.voices.length <= 1, true);
  const r2 = run(P(), [[0, 'on', 60, 0.7], [0.5, 'on', 60, 0.7]], 0.8);
  assert.equal(r2.e.voices.length, 1);
  const tap = run(P(), [[0, 'on', 60, 1], [0.06, 'off', 60]], 0.4);
  assert.ok(peakAbs(tap) > 0.005, `tap ${peakAbs(tap)}`);
  const full = rms(r.L, Math.round(0.85 * FS), Math.round(0.95 * FS)), after = rms(r.L, Math.round(1.25 * FS), Math.round(1.3 * FS));
  assert.ok(after < 0.01 * full, `${after} vs ${full}`);
  const r3 = run(P(), [[0, 'on', 60, 0.7], [0.5, 'off', 60]], 3.5);
  assert.equal(r3.e.voices.length, 0, 'the voice retires');
});
test('voice stealing: past 16 keys the quietest released key fades out over 30 ms (no click), never one under 50 ms old', () => {
  const ev = [];
  for (let i = 0; i < 16; i++) ev.push([0.02 * i, 'on', 40 + 2 * i, 0.7], [0.4, 'off', 40 + 2 * i]);
  ev.push([0.45, 'on', 90, 0.7], [0.452, 'on', 91, 0.7]);
  let live = 0, youngStolen = false;
  const r = run(P(), ev, 0.8, { tap: (e, t) => { if (t > 0.46) { live = Math.max(live, e.voices.filter((v) => !v.fading).length); for (const v of e.voices) if (v.fading && (v.key === 90 || v.key === 91)) youngStolen = true; } } });
  assert.ok(live <= 16 && !youngStolen, `${live} live`);
  let jump = 0;
  for (let i = Math.round(0.45 * FS); i < Math.round(0.6 * FS); i++) jump = Math.max(jump, Math.abs(r.L[i] - r.L[i - 1]));
  assert.ok(jump < 0.2, `largest step ${jump}`);
});

console.log('levels and stability');
test('level: at the default wind a single note peaks at 0.1–0.5 from C2 to C6 and above 0.04 up to C7, at 44.1 and 48 kHz; a ten-key chord stays under 1.5', () => {
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += 6) {
    const pk = peakAbs(hold(k, P(), 0.8, { fs }));
    if (k <= 84) assert.ok(pk > 0.1 && pk < 0.5, `${k} at ${fs}: ${pk.toFixed(3)}`);
    else assert.ok(pk > 0.04 && pk < 0.5, `${k} at ${fs}: ${pk.toFixed(3)}`);
  }
  const chord = run(P(), [48, 52, 55, 60, 64, 67, 71, 72, 76, 79].map((k) => [0, 'on', k, 0.7]), 1.5);
  assert.ok(peakAbs(chord) < 1.5, `chord ${peakAbs(chord)}`);
});
test('aliasing: a 2×-integrated C7 and a 1×-integrated G4 keep every inharmonic line 40 dB under the strongest harmonic', () => {
  for (const key of [67, 96]) {
    const r = hold(key, P(), 1.9), N = 65536, re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = r.L[24000 + i] * (0.5 - 0.5 * Math.cos((TAU * i) / N));
    fft(re, im, false);
    const f0 = r.e.voices[0].reeds[1].freq();
    let top = 0, worst = 0;
    for (let k = 1; k < N / 2; k++) top = Math.max(top, re[k] ** 2 + im[k] ** 2);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * FS) / N; if (f > 20000 || f < 40) continue;
      const hn = f / f0, d = Math.abs(hn - Math.round(hn)) * f0;
      if (d > (8 * FS) / N) worst = Math.max(worst, re[k] ** 2 + im[k] ** 2);
    }
    assert.ok(10 * Math.log10(worst / top) < -40, `${key}: ${(10 * Math.log10(worst / top)).toFixed(1)} dB`);
  }
});
test('stability: seeded random combinations of extreme settings at 44.1 and 48 kHz, changed mid-note, with full aftertouch: no NaN, bounded, dying away after release', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'venue'].includes(q.id));
  let seed = 4242, worst = { pk: 0 };
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = () => {
    const p = P();
    for (const q of sliders) {
      if (rnd() < 0.5) continue;
      p[q.id] = q.type === 'checkbox' ? rnd() < 0.5 : q.type === 'select' ? q.options[Math.floor(rnd() * q.options.length)][0] : rnd() < 0.5 ? q.min : q.max;
    }
    return p;
  };
  for (const fs of [44100, 48000]) for (let c = 0; c < 6; c++) {
    const p1 = pick(), p2 = pick(), ev = [];
    [36, 50, 61, 79, 96].forEach((k, i) => ev.push([0.02 * i, 'on', k, rnd()], [1.0, 'off', k]));
    ev.push([0.4, 'params', p2], [0.6, 'press', 1]);
    const r = run(p1, ev, 2.6, { fs });
    let pk = 0;
    for (let i = 0; i < r.L.length; i++) { assert.ok(Number.isFinite(r.L[i] + r.R[i]), `${fs}: NaN with ${JSON.stringify(p1)} → ${JSON.stringify(p2)}`); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
    if (pk > worst.pk) worst = { pk, p1, p2, fs };
    // after release every reed rings down at its own losses: a slow, high-Q bass reed may still be heard,
    // but the tail is falling and well below the note
    const note = rms(r.L, Math.round(0.8 * fs), fs), t1 = rms(r.L, Math.round(1.5 * fs), Math.round(1.6 * fs)), t2 = rms(r.L, r.L.length - Math.round(0.1 * fs), r.L.length);
    assert.ok(t2 < 1e-3 || (t2 < 0.1 * note && t2 < 0.8 * t1), `${fs}: still sounding (${t2.toFixed(4)} after ${t1.toFixed(4)}, note ${note.toFixed(4)}) with ${JSON.stringify(p2)}`);
  }
  assert.ok(worst.pk < 4, `${worst.fs}: peak ${worst.pk.toFixed(2)} with ${JSON.stringify(worst.p1)} → ${JSON.stringify(worst.p2)}`);
  console.log(`        loudest of 12: ${worst.pk.toFixed(2)}`);
});
test('presets use their own parameters, and each speaks without NaN', () => {
  for (const pr of PRESETS) {
    const r = run(P(pr.p), [[0, 'on', 55, 0.8], [0, 'on', 64, 0.8]], 1.2);
    let pk = 0;
    for (const v of r.L) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.01, `${pr.name}: ${pk}`);
  }
});
test('CPU: ten held keys with the three-reed musette (30 reeds) at 48 kHz in under 30 % of real time', () => {
  const e = new HarmoniumEngine(FS);
  e.setParams(P({ musette: 'three' }));
  for (const k of [48, 52, 55, 60, 64, 67, 71, 72, 76, 79]) e.noteOn(k, 0.8);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let s = 0; s < 0.5 * FS; s += 128) e.process(L, R, 128);
  const sec = 4, t0 = performance.now();
  for (let s = 0; s < sec * FS; s += 128) e.process(L, R, 128);
  const load = (performance.now() - t0) / (sec * 1000);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} % of real time`);
  console.log(`        (${(100 * load).toFixed(1)} % of real time for 30 reeds)`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
