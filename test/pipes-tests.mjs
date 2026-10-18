// Pipe Organ checks. Run: node test/pipes-tests.mjs
//
// The pipe against tube acoustics (open 1 : 2 : 3 and stopped 1 : 3 : 5 modes, Levine & Schwinger's
// end correction, Rayleigh's conductivity for the mouth, Kirchhoff's wall losses, Töpfer's scale); the
// linear analysis against its closed form and the engine (growth and pitch at onset, the speaking
// window); then every key on every stop speaking and in tune, the Gedackt's odd harmonics, the
// Mixture's pure ranks, overblowing and its hysteresis, wind sag, chiff, the wind system and
// tremulant, stereo, voices, levels, stability and CPU.
// The model and the engine are the C++ (native/instruments/pipes), built as WebAssembly: the
// model's functions through pipes-wasm.js, the engine through loadEngine.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEY_LO, KEY_HI, KEY_MIN, KEY_MAX, RANKS, organName } from '../pipes/src/pipes-data.js';
import { INSTRUMENT } from '../pipes/src/pipes-instrument.js';
import { wasmModel } from '../pipes/src/pipes-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS } from '../pipes/src/pipes-params.js';
import { TUNING } from '../pipes/src/tuning-table.js';
import { tuningHeader } from '../tools/pipes-tuning.mjs';
import { keyFreq } from '../shared/dsp.js';

const PipeEngine = await loadEngine(INSTRUMENT);
const { pipeModel, pipeFreq, tuning, modeFreq, chestPan, windSystem, linearRoot, loopGain, thetaAt, pressureAt, speakingWindow } = await wasmModel();
// the C++'s numbers (pipes-model.h): air; the wind the pipes are voiced for; the jet's phase
// velocity and roll-off; the voicing's loop gain; the wind system's trunk and chest
const AIR = { rho: 1.2, c: 343, nu: 1.51e-5, gamma: 1.4, Pr: 0.71 }, P_NOM = 700, U_NOM = Math.sqrt((2 * P_NOM) / AIR.rho);
const CP = 0.4, PHI_C = 3, GAIN = 6, GAIN_BASS = 0.4;
const WIND = { Vc: 0.8, Mt: [5, 150] };
// the key's pitch multiple a pipe sounds (the Mixture's ranks are octaves and pure fifths)
const harm = (k, r) => pipeFreq(k, r) / keyFreq(k);

const FS = 48000, TAU = 2 * Math.PI;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const ONLY = { principal: { principal: true }, octave: { principal: false, octave: true }, gedackt: { principal: false, gedackt: true }, mixture: { principal: false, mixture: true } };
const RANK_STOP = [ONLY.principal, ONLY.octave, ONLY.gedackt, ONLY.mixture, ONLY.mixture, ONLY.mixture];
const cents = (a, b) => 1200 * Math.log2(a / b);
const rel = (a, b) => Math.abs(a / b - 1);

// Rayleigh's conductivity of an elliptic hole (semi-axes a ≥ b) in a thin wall: K = 2a·AGM(1, b/a)
// (= πa/K(e), K the complete elliptic integral; 2r for a circle), and the mouth's end correction
// from it: the pipe's area over the conductivity of an ellipse of the mouth's area and aspect (H × W).
// Kirchhoff's wall loss per metre. Textbook formulas, to check the C++'s pipes.
function agm(x, y) { for (let i = 0; i < 30 && Math.abs(x - y) > 1e-15 * x; i++) [x, y] = [(x + y) / 2, Math.sqrt(x * y)]; return x; }
function ellipseConductivity(a, b) { if (b > a) [a, b] = [b, a]; return 2 * a * agm(1, b / a); }
function mouthCorrection(Sp, H, W) { const k = 2 / Math.sqrt(Math.PI); return Sp / ellipseConductivity((k * H) / 2, (k * W) / 2); }
function wallAlpha(f, a) { const { c, nu, gamma, Pr } = AIR; return (Math.sqrt((TAU * f * nu) / 2) * (1 + (gamma - 1) / Math.sqrt(Pr))) / (a * c); }

// The reference the engine's time stepping is checked against: the linear analysis of a pipe
// (pipes-model.cpp's linearRoot, loopGain and speakingWindow, on a pipeModel object a test may
// alter). With the jet small-signal and no oscillation, a disturbance ∝ e^(st) obeys
//   1 = Y(s) · s Kj A H(s) e^(−sτ),   Y(s) = Σ (1/M) s / (s² + 2σₙs + ωₙ²),   H(s) = 1/(1 + sτ/φ_c),
// τ = W/(c_p U_j), U_j = √(2p/ρ). A root with Re s > 0 means the pipe speaks there; the speaking
// window is the range of θ = U_j/(f₁W) over which it does. The engine never runs it: it integrates
// the nonlinear equations in time.

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'params', P]) in
// 128-sample blocks like the AudioWorklet; tap(engine, t) after every block.
function run(params, events, sec, { fs = FS, seed = 1, tap, track = false } = {}) {
  const e = new PipeEngine(fs, seed, { track });
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a, b); else if (type === 'params') e.setParams(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, s / fs);
  }
  return { L, R, e };
}
const peakAbs = (r) => { let p = 0; for (const x of [r.L, r.R]) for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// the time (s) at which the rms over 5 ms windows first reaches half its final value
function onset(x, fs = FS) {
  const W = Math.round(0.005 * fs), env = [];
  for (let a = 0; a + W <= x.length; a += W) env.push(rms(x, a, a + W));
  const fin = env.slice(-20).reduce((s, v) => s + v, 0) / 20, i = env.findIndex((v) => v > 0.5 * fin);
  return i < 0 ? Infinity : (i * W) / fs;
}
// sounding frequency of x near f over [a, b): phase advance of the demodulated signal
function freqAt(x, f, a, b, fs = FS, m = 2048) { // over 64 samples (unambiguous within ±fs/128), then 512, then the whole span
  const ph = (s, fr) => { const w = (TAU * fr) / fs; let re = 0, im = 0; for (let i = s; i < s + m; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - s)) / m); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); } return Math.atan2(im, re); };
  const wrap = (d) => d - TAU * Math.round(d / TAU);
  let fr = f;
  for (const lag of [64, 512, b - m - a]) fr += (wrap(ph(a + lag, fr) - ph(a, fr)) * fs) / (TAU * lag);
  return fr;
}
function level(x, f, a, b, fs = FS) { // Hann-windowed amplitude at f
  const w = (TAU * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The mouth's volume flow (∝ the running integral of the radiated sound) from a: zero-mean.
function flow(x, a) {
  const q = new Float64Array(x.length);
  let acc = 0, m = 0;
  for (let i = 0; i < x.length; i++) { acc += x[i]; q[i] = acc; }
  for (let i = a; i < x.length; i++) m += q[i];
  m /= x.length - a;
  for (let i = 0; i < x.length; i++) q[i] -= m;
  return q;
}
// One pipe held at a fixed foot pressure from t = 0 with no pallet transient and no turbulence, its
// fundamental kicked; follow the amplitude of the fundamental in the mouth's flow (demodulated at
// the model's frequency over two periods at a time) and fit its exponential growth while it stays
// small. `single` keeps only the first mode.
function growth(f, stopped, p, { single = false, kick = 1e-5, maxT = 1.5 } = {}) { // kick: m/s through the mouth
  const e = new PipeEngine(FS, 1, { track: true });
  const params = P({ ...ONLY.principal, noise: 0, pressure: p });
  e.setParams(params);
  const R = pipeModel(f, stopped, params);
  if (single) R.modes = R.modes.slice(0, 1);
  e.modelsFor = () => [R, R, R, R, R, R];
  e.noteOn(60, 1);
  const v = e.voices[0], pp = v.pipes[0];
  v.a = 1; v.aTarget = 1;
  e.noise.fill(0);
  v.kPal = 0; // the groove at the chest's pressure
  const Uj = Math.sqrt((2 * p) / AIR.rho);
  pp.qin = pp.bH * Uj * (1 + Math.tanh(-pp.y0 * pp.ib)); // the jet already established: no arrival transient
  pp.v[0] = kick * R.geo.Sm;
  const s0 = linearRoot(R, p, 0), w = s0 ? s0.im / FS : (TAU * f) / FS, Nw = Math.round((2 * TAU) / w);
  const bL = new Float32Array(1), bR = new Float32Array(1), pts = [];
  let re = 0, im = 0, k = 0, ph0 = null, ph = 0, nPh = 0;
  for (let i = 0; i < maxT * FS; i++) {
    e.process(bL, bR, 1);
    re += pp.vm * Math.cos(w * i); im -= pp.vm * Math.sin(w * i);
    if (++k >= Nw) {
      const t = (i + 1 - Nw / 2) / FS, a = (2 * Math.hypot(re, im)) / Nw;
      if (t > (2 * Nw) / FS) { // the frequency: how fast the demodulated phase turns
        pts.push([t, a]);
        const q = Math.atan2(im, re);
        if (ph0 === null) ph0 = q; else { ph += q - ph0 - TAU * Math.round((q - ph0) / TAU); ph0 = q; nPh++; }
      }
      re = 0; im = 0; k = 0;
      if (a > 1000 * kick) break;
    }
  }
  const fr = ((w + (nPh ? ph / (nPh * Nw) : 0)) * FS) / TAU;
  const n = pts.length, mt = pts.reduce((s, q) => s + q[0], 0) / n, ml = pts.reduce((s, q) => s + Math.log(q[1]), 0) / n;
  let num = 0, den = 0;
  for (const [t, a] of pts) { num += (t - mt) * (Math.log(a) - ml); den += (t - mt) ** 2; }
  return { rate: num / den, n, f: fr, foot: pp.foot, R };
}

console.log('the pipe');
test('modes: an open pipe resonates at 1 : 2 : 3 … of c/2(L + ΔL_mouth + 0.6133a), a stopped one at 1 : 3 : 5 … of c/4(L + ΔL_mouth)', () => {
  for (const f of [65.41, 261.6, 1046.5]) {
    const o = pipeModel(f, false, P()), s = pipeModel(f, true, P());
    o.modes.forEach((m, i) => assert.ok(rel(m.f / o.modes[0].f, i + 1) < 1e-12 && rel(m.f, ((i + 1) * AIR.c) / (2 * o.Le)) < 1e-12, `open mode ${i + 1}`));
    s.modes.forEach((m, i) => assert.ok(rel(m.f / s.modes[0].f, 2 * i + 1) < 1e-12 && rel(m.f, ((2 * i + 1) * AIR.c) / (4 * s.Le)) < 1e-12, `stopped mode ${i + 1}`));
    // Levine & Schwinger (1948), unflanged, ka → 0
    assert.ok(rel(o.modes[0].f, AIR.c / (2 * (o.L + o.geo.dLm + 0.6133 * o.geo.a))) < 1e-12);
    assert.ok(rel(s.modes[0].f, AIR.c / (4 * (s.L + s.geo.dLm))) < 1e-12);
    // the stopped pipe is about half as long for the same pitch
    assert.ok(s.L / o.L > 0.4 && s.L / o.L < 0.6, `${f}: ${(s.L / o.L).toFixed(2)}`);
  }
  assert.equal(modeFreq(3, 1, false) / modeFreq(1, 1, false), 3);
  assert.equal(modeFreq(3, 1, true) / modeFreq(1, 1, true), 5);
});
test('the mouth: Rayleigh’s conductivity of an elliptic hole is 2a·AGM(1, b/a) = πa/K(e) (checked by quadrature), 2r for a circle; a diapason mouth (a quarter of the circumference, cut up a quarter of its width) corrects the length by 1.5 D (Ingerslev & Frobenius); the C++’s pipes correct theirs by it, at every cut-up', () => {
  assert.ok(rel(ellipseConductivity(0.01, 0.01), 0.02) < 1e-12);
  for (const k of [0.2, 0.5, 0.9]) { // K(e) = ∫₀^{π/2} dφ/√(1 − e² sin²φ), e² = 1 − k²
    let s = 0; const N = 20000;
    for (let i = 0; i < N; i++) { const ph = ((i + 0.5) * Math.PI) / 2 / N; s += 1 / Math.sqrt(1 - (1 - k * k) * Math.sin(ph) ** 2); }
    const K = (s * Math.PI) / 2 / N;
    assert.ok(rel(ellipseConductivity(1, k), Math.PI / K) < 1e-6, `${k}`);
  }
  const D = 0.1, H = (Math.PI * D) / 4, W = H / 4, dL = mouthCorrection((Math.PI * D * D) / 4, H, W);
  assert.ok(Math.abs(dL / D - 1.5) < 0.15, `${(dL / D).toFixed(2)} D`);
  for (const f of [65.41, 523.3, 2093]) for (const stopped of [false, true]) for (const cutup of [0.5, 1, 1.5]) {
    const g = pipeModel(f, stopped, P({ cutup })).geo;
    assert.ok(rel(g.dLm, mouthCorrection(g.Sp, g.H, g.W)) < 1e-12, `${f} ${stopped} ×${cutup}: ${g.dLm} vs ${mouthCorrection(g.Sp, g.H, g.W)}`);
  }
  console.log(`        diapason mouth: ΔL = ${(dL / D).toFixed(2)} D; open top 0.6133a = 0.31 D`);
});
test('Töpfer’s normal scale: 155.5 mm at 8′ C, halving on the 17th note (16 semitones), a cross-section ratio of 1 : √8 per octave; the Gedackt 0.85 × as wide; the mouth a quarter of the circumference', () => {
  const D = (k, stopped = false) => pipeModel(keyFreq(k), stopped, P()).geo.D;
  assert.ok(rel(D(36), 0.1555) < 1e-12);
  assert.ok(rel(D(52), 0.1555 / 2) < 1e-12);
  assert.ok(rel((D(36) / D(48)) ** 2, Math.sqrt(8)) < 1e-12);
  for (const k of [36, 60, 84]) {
    assert.ok(rel(D(k, true), 0.85 * D(k)) < 1e-12, `Gedackt ${organName(k)}`);
    const g = pipeModel(keyFreq(k), false, P()).geo;
    assert.ok(rel(g.H, (Math.PI * g.D) / 4) < 1e-12 && rel(g.a, g.D / 2) < 1e-12 && rel(g.Sp, Math.PI * g.a * g.a) < 1e-12, organName(k));
  }
});
test('losses: Kirchhoff’s boundary layer, α = 2.96×10⁻⁵ √f / a per metre in air; radiation σ = (ka)²c/2L_e from two open ends (|R| = 1 − (ka)²/2 each), half that stopped: every mode of the C++’s pipes; Q₁ from 127 (8′ C) to 42 (f³)', () => {
  assert.ok(rel(wallAlpha(100, 0.01), (2.96e-5 * 10) / 0.01) < 0.01, `${wallAlpha(100, 0.01)}`);
  for (const f of [65.41, 261.6, 1046.5, 3136]) for (const stopped of [false, true]) {
    const R = pipeModel(f, stopped, P()), a = R.geo.a, openings = stopped ? 1 : 2;
    for (const m of R.modes) {
      const k = (TAU * m.f) / AIR.c, wall = AIR.c * wallAlpha(m.f, a), rad = (openings * (k * a) ** 2 * AIR.c) / (4 * R.Le);
      assert.ok(rel(m.sigma, wall + rad) < 1e-9, `${f} ${stopped ? 'stopped' : 'open'} mode ${m.n}: σ ${m.sigma} vs ${wall + rad}`);
      assert.ok(rel(m.om, TAU * m.f) < 1e-12 && rel(m.Q, m.om / (2 * m.sigma)) < 1e-12);
      // reflection: e^(−2σL/c) per round trip = |R|² per end for two ends
      if (!stopped && m.n === 1) { const Rf = 1 - (k * a) ** 2 / 2; assert.ok(rel(Math.exp(-((m.sigma - wall) * 2 * R.Le) / AIR.c), Rf * Rf) < 1e-3); }
    }
  }
  const qC = pipeModel(keyFreq(36), false, P()).Q1, qTop = pipeModel(keyFreq(89), false, P()).Q1;
  assert.ok(qC > 100 && qC < 150 && qTop > 30 && qTop < 60, `${qC} ${qTop}`);
});

console.log('the jet and the linear analysis');
test('the voicing: each pipe, cut with no correction, sounds f by the linear analysis at 700 Pa (within 10⁻⁷), and its jet’s loop gain on the fundamental’s resonance is the voicing’s, 6 from c¹ up and ∝ f^−0.4 below', () => {
  for (let k = KEY_LO; k <= KEY_HI; k += 5) for (const stopped of [false, true]) for (const cutup of [1, 0.6]) {
    const f = keyFreq(k), R = pipeModel(f, stopped, P({ cutup })), s = linearRoot(R, P_NOM, 0);
    if (cutup === 1) assert.ok(s && rel(s.im / TAU, f) < 1e-7, `${organName(k)} ${stopped ? 'stopped' : 'open'}: ${s && s.im / TAU} vs ${f}`);
    const g = GAIN * Math.max(1, (f / keyFreq(60)) ** -GAIN_BASS), m = R.modes[0], tau = R.geo.W / (CP * U_NOM);
    assert.ok(rel(R.gain, g) < 1e-12, `${organName(k)}: gain ${R.gain} vs ${g}`);
    // on resonance, s = jω₁: Y ≈ 1/2σ₁M, so |L| = ω₁ Kj A |H| / 2σ₁M
    assert.ok(rel((m.om * R.Kj * R.A) / Math.hypot(1, (m.om * tau) / PHI_C) / (2 * m.sigma * R.M), g) < 1e-9, `${organName(k)} ×${cutup}: A`);
  }
});
test('with no jet the roots are the bare modes; with it, the loop gain on the fundamental’s resonance is the voicing’s, and every pipe of every rank is unstable (speaks) at the default wind', () => {
  const R = pipeModel(261.6, false, P()), A = R.A;
  R.A = 0;
  for (let n = 0; n < 3; n++) { const s = linearRoot(R, P_NOM, n), m = R.modes[n]; assert.ok(rel(-s.re, m.sigma) < 1e-6 && rel(s.im, m.om * Math.sqrt(1 - (m.sigma / m.om) ** 2)) < 1e-9, `${n}`); }
  R.A = A;
  for (let k = KEY_LO; k <= KEY_HI; k += 1) for (let r = 0; r < RANKS.length; r++) {
    const pm = pipeModel(pipeFreq(k, r), RANKS[r].stopped, P()), s = linearRoot(pm, P_NOM, 0);
    assert.ok(s && s.re > 0, `${organName(k)} rank ${RANKS[r].id}: ${s && s.re}`);
  }
});
test('the speaking window: for a one-mode pipe, the solver’s edges in U_j/(fW) are where the loop gain L(jω) = 1 has a real solution (found directly, within 0.5 %); the window roughly where g·cos(π/2 − ωτ − atan(ωτ/φ_c)) > 1', () => {
  for (const [f, stopped] of [[261.6, false], [523.3, true]]) {
    const R = pipeModel(f, stopped, P());
    R.modes = R.modes.slice(0, 1);
    const { edges } = speakingWindow(R, 0, 4, 400);
    assert.equal(edges.length, 2, `${edges}`);
    // directly: at each wind, the frequency where L(jω) is real and positive, and how big it is there
    const m = R.modes[0];
    const gainAt = (th) => {
      const p = pressureAt(R, th);
      let prev = null;
      for (let w = 0.3 * m.om; w < 3 * m.om; w *= 1.0005) {
        const L = loopGain(R, [0, w], p);
        if (prev && prev[1] * L[1] <= 0 && L[0] > 0) { // bisect Im L = 0
          let lo = w / 1.0005, hi = w;
          for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi), Lm = loopGain(R, [0, mid], p); if (Lm[1] * loopGain(R, [0, lo], p)[1] <= 0) hi = mid; else lo = mid; }
          return loopGain(R, [0, 0.5 * (lo + hi)], p)[0];
        }
        prev = L;
      }
      return 0;
    };
    const edge = (lo, hi) => { for (let i = 0; i < 50; i++) { const mid = Math.sqrt(lo * hi); if ((gainAt(lo) - 1) * (gainAt(mid) - 1) <= 0) hi = mid; else lo = mid; } return Math.sqrt(lo * hi); };
    const direct = [edge(edges[0] * 0.8, edges[0] * 1.2), edge(edges[1] * 0.8, edges[1] * 1.2)];
    for (let i = 0; i < 2; i++) assert.ok(rel(edges[i], direct[i]) < 0.005, `${f}: edge ${edges[i].toFixed(3)} vs ${direct[i].toFixed(3)}`);
    // the high-Q estimate, evaluated at the resonance: g(ωτ)·cos(phase) = 1
    const g = (x) => (R.Kj * R.A * m.om) / (2 * m.sigma * R.M) / Math.hypot(1, x / PHI_C), F = (x) => g(x) * Math.cos(Math.PI / 2 - x - Math.atan(x / PHI_C)) - 1;
    const th = (x) => TAU / (CP * x) * (m.f / R.f);
    let xs = [];
    for (let x = 0.01; x < 3; x += 0.001) if (F(x) * F(x + 0.001) <= 0) xs.push(x);
    xs = xs.map(th).sort((a, b) => a - b);
    assert.ok(rel(edges[0], xs[0]) < 0.05 && rel(edges[1], xs[1]) < 0.15, `high-Q estimate ${xs.map((x) => x.toFixed(1))} vs ${edges.map((x) => x.toFixed(1))}`);
    console.log(`        ${stopped ? 'stopped' : 'open'} ${f} Hz, mode 1 alone: speaks for ${edges[0].toFixed(2)} < U/fW < ${edges[1].toFixed(1)} (high-Q estimate ${xs[0].toFixed(2)}–${xs[1].toFixed(1)}); voiced at ${R.theta}`);
  }
});
test('engine against the model: a kicked one-mode pipe grows inside the window (×1.15 its lower edge) and dies outside it (×0.85) at the model’s rate Re s (within 10 % of the default wind’s), and starts at Im s/2π (within 3 ¢)', () => {
  for (const [f, stopped] of [[261.6, false], [130.8, true]]) {
    const R0 = pipeModel(f, stopped, P());
    R0.modes = R0.modes.slice(0, 1);
    const lo = speakingWindow(R0, 0, 4, 400).edges[0], full = linearRoot(R0, P_NOM, 0).re;
    for (const [mult, sign] of [[1.15, 1], [0.85, -1]]) {
      const p = pressureAt(R0, lo * mult), g = growth(f, stopped, p, { single: true }), s = linearRoot(g.R, g.foot, 0);
      assert.ok(Math.sign(g.rate) === sign && Math.abs(g.rate - s.re) < 0.1 * full, `${f} at θ ${(lo * mult).toFixed(1)}: engine ${g.rate.toFixed(2)}/s, model ${s.re.toFixed(2)}/s (default wind ${full.toFixed(1)}/s)`);
      if (sign > 0) assert.ok(Math.abs(cents(g.f, s.im / TAU)) < 3, `${f}: ${g.f.toFixed(2)} vs ${(s.im / TAU).toFixed(2)} Hz`);
    }
  }
});
test('engine against the model at the default wind, all modes: the fundamental grows at its Re s (within 10 %) and starts at its Im s/2π (within 3 ¢), C, c¹, c³ and a Gedackt c', () => {
  const out = [];
  for (const [f, stopped] of [[keyFreq(36), false], [keyFreq(60), false], [keyFreq(84), false], [keyFreq(48), true]]) {
    const g = growth(f, stopped, P_NOM), s = linearRoot(g.R, g.foot, 0);
    assert.ok(g.n >= 4 && rel(g.rate, s.re) < 0.1, `${f.toFixed(1)}: engine ${g.rate.toFixed(1)}/s, model ${s.re.toFixed(1)}/s (${g.n} points)`);
    assert.ok(Math.abs(cents(g.f, s.im / TAU)) < 3, `${f.toFixed(1)}: ${g.f.toFixed(2)} vs ${(s.im / TAU).toFixed(2)} Hz`);
    out.push(`${f.toFixed(0)} Hz ${stopped ? 'stopped' : 'open'} ${s.re.toFixed(0)}/s`);
  }
  console.log(`        growth at 700 Pa: ${out.join(', ')}`);
});

console.log('speech and tuning');
test('every key on every stop speaks on its fundamental at the default wind (the strongest partial of its mouth flow, by 3 dB or more), in tune (±3 ¢: equal temperament at A = 440 Hz, the Mixture’s fifths pure), half its full level within 330 ms (Principal 8′), 200 ms (Octave 4′), 450 ms (Gedackt 8′) and 60 ms (each Mixture rank), at 48 kHz', () => {
  const lim = [0.33, 0.2, 0.45, 0.06, 0.06, 0.06], on = RANKS.map(() => []);
  let worst = 0;
  for (let r = 0; r < RANKS.length; r++) for (let k = KEY_LO; k <= KEY_HI; k++) {
    const p = P({ ...RANK_STOP[r] }), f0 = pipeFreq(k, r);
    let res;
    if (r >= 3) { // one Mixture rank alone: its pipe on the Principal's slot
      const R = pipeModel(f0, false, p, { tune: tuning(f0, false) });
      const e = new PipeEngine(FS); e.setParams(P(ONLY.principal)); e.modelsFor = () => [R, R, R, R, R, R]; e.noteOn(k, 0.7);
      const n = Math.round(0.6 * FS), L = new Float64Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
      for (let s = 0; s < n; s += 128) { e.process(bL, bR, 128); for (let i = 0; i < 128 && s + i < n; i++) L[s + i] = bL[i]; }
      res = { L };
    } else res = run(p, [[0, 'on', k, 0.7]], r === 2 || k < 48 ? 1.4 : 1.0);
    const x = res.L, a = x.length - Math.round(0.3 * FS), q = flow(x, a), fa = freqAt(x, f0, a, x.length);
    const hs = [];
    for (let h = 1; h <= 10 && h * fa < 0.45 * FS; h++) hs.push(level(q, h * fa, a, x.length));
    const margin = 20 * Math.log10(hs[0] / Math.max(...hs.slice(1)));
    assert.ok(margin > 3, `${organName(k)} ${RANKS[r].id}: fundamental ${margin.toFixed(1)} dB above the next partial`);
    assert.ok(Math.abs(cents(fa, f0)) < 3, `${organName(k)} ${RANKS[r].id}: ${cents(fa, f0).toFixed(2)} ¢`);
    worst = Math.max(worst, Math.abs(cents(fa, f0)));
    const o = onset(x);
    assert.ok(o < lim[r], `${organName(k)} ${RANKS[r].id}: ${(o * 1000).toFixed(0)} ms`);
    on[r].push(o);
  }
  console.log(`        onsets (ms): ${RANKS.map((R, r) => `${R.id} ${(Math.min(...on[r]) * 1000).toFixed(0)}–${(Math.max(...on[r]) * 1000).toFixed(0)}`).join(', ')}; worst pitch ${worst.toFixed(2)} ¢`);
});
test('tuning at 44.1 kHz: every third key C–f³ on the Principal 8′, Octave 4′ and Gedackt 8′ within ±3 ¢', () => {
  let worst = 0;
  for (const r of [0, 1, 2]) for (let k = KEY_LO; k <= KEY_HI; k += 3) {
    const fs = 44100, res = run(P({ ...RANK_STOP[r], noise: 0 }), [[0, 'on', k, 0.7]], r === 2 || k < 48 ? 1.3 : 0.9, { fs });
    const f0 = pipeFreq(k, r), f = freqAt(res.L, f0, res.L.length - Math.round(0.4 * fs), res.L.length, fs), c = cents(f, f0);
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 3, `${organName(k)} ${RANKS[r].id}: ${c.toFixed(2)} ¢`);
  }
  console.log(`        worst ${worst.toFixed(2)} ¢`);
});
test('the Gedackt is stopped: its even harmonics are at least 25 dB under its odd ones; the open Principal has both (its octave within 20 dB of the fundamental)', () => {
  for (const k of [36, 48, 60, 72, 84]) {
    const g = run(P({ ...ONLY.gedackt, noise: 0 }), [[0, 'on', k, 0.7]], 1.4), o = run(P({ noise: 0 }), [[0, 'on', k, 0.7]], 1.2);
    const f0 = keyFreq(k), a = Math.round(0.8 * FS), fg = freqAt(g.L, f0, a, g.L.length), fo = freqAt(o.L, f0, a, o.L.length);
    const H = (x, f, n) => level(x, n * f, a, x.length);
    const odd = Math.min(H(g.L, fg, 1), H(g.L, fg, 3)), even = Math.max(H(g.L, fg, 2), H(g.L, fg, 4));
    assert.ok(20 * Math.log10(odd / even) > 25, `${organName(k)}: odd/even ${(20 * Math.log10(odd / even)).toFixed(1)} dB`);
    assert.ok(20 * Math.log10(H(o.L, fo, 2) / H(o.L, fo, 1)) > -20, `${organName(k)} Principal: octave ${(20 * Math.log10(H(o.L, fo, 2) / H(o.L, fo, 1))).toFixed(1)} dB`);
  }
});
test('the Mixture: three ranks of octaves and pure fifths (×2, 3, 4, 6, 8, 12 the key’s 8′), breaking back an octave at c, c¹ and c²; each pipe sounds its pure ratio within 3 ¢', () => {
  const breaks = [];
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const h = [3, 4, 5].map((r) => harm(k, r));
    assert.ok(h.every((x) => [2, 3, 4, 6, 8, 12].some((n) => rel(x, n) < 1e-12)), `${organName(k)}: ${h}`);
    if (k > KEY_LO && Math.round(harm(k, 3)) < Math.round(harm(k - 1, 3))) breaks.push(k);
    const top = keyFreq(k) * Math.max(...h);
    assert.ok(top < 6000 && keyFreq(k) * Math.min(...h) > 380, `${organName(k)}: ${top}`);
  }
  assert.deepEqual(breaks, [48, 60, 72]);
  // each rank alone (its pipe on the Principal's slot): pure fifths (702 ¢), not tempered ones
  for (const k of [40, 55, 62, 77, 89]) for (let r = 3; r < 6; r++) {
    const want = pipeFreq(k, r), R = pipeModel(want, false, P(), { tune: tuning(want, false) });
    const e = new PipeEngine(FS); e.setParams(P({ ...ONLY.principal, noise: 0 })); e.modelsFor = () => [R, R, R, R, R, R]; e.noteOn(k, 0.7);
    const n = Math.round(0.5 * FS), L = new Float64Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
    for (let s2 = 0; s2 < n; s2 += 128) { e.process(bL, bR, 128); for (let i = 0; i < 128 && s2 + i < n; i++) L[s2 + i] = bL[i]; }
    const fr = freqAt(L, want, Math.round(0.25 * FS), n);
    assert.ok(Math.abs(cents(fr, want)) < 3, `${organName(k)} rank ${r - 2}: ${fr.toFixed(2)} vs ${want.toFixed(2)} Hz`);
  }
  assert.ok(Math.abs(cents(harm(60, 3), 2) - 701.955) < 1e-3); // 2⅔′ over 4′: a pure fifth
});

test('the C++ port tunes from the table the tuning tool measured (native/instruments/pipes/tuning-table.h is fresh: node tools/pipes-tuning.mjs --native; and the WebAssembly was built from it)', () => {
  assert.equal(readFileSync(new URL('../native/instruments/pipes/tuning-table.h', import.meta.url), 'utf8'), tuningHeader(TUNING.table));
  for (let x = 5.5; x < 13.5; x += 0.01) for (const stopped of [false, true]) assert.ok(Math.abs(tuning(2 ** x, stopped) - TUNING.lookup(2 ** x, stopped)) < 1e-12, `${(2 ** x).toFixed(1)} Hz`);
});

console.log('effects');
// Ramp the wind slowly up from θ ≈ 10 to 60 and back down for one pipe, following its own pitch: the
// foot pressures where it jumps to its next mode and back.
function overblow(key, r, cut) {
  const base = P({ ...RANK_STOP[r], cutup: cut, noise: 0.5 }), f0 = pipeFreq(key, r), pm = pipeModel(f0, RANKS[r].stopped, base);
  const pLo = pressureAt(pm, 10), pHi = pressureAt(pm, 60), T = 8;
  const e = new PipeEngine(FS, 1, { track: true });
  e.setParams({ ...base, pressure: pLo }); e.Pset = e.Pr = e.Pc = pLo;
  e.noteOn(key, 0.7);
  const bL = new Float32Array(128), bR = new Float32Array(128), jump = RANKS[r].stopped ? 3 : 2;
  let up = null, dn = null, to = 0, run2 = 0, cand = 0, tUp = 0;
  for (let s = 0; s < (T + 0.6) * FS; s += 128) {
    const t = s / FS;
    if (t > 0.6) { const u = (t - 0.6) / T, p = u < 0.5 ? pLo * (pHi / pLo) ** (2 * u) : pHi * (pLo / pHi) ** Math.min(1, 2 * u - 1); e.setParams({ ...base, pressure: p }); }
    e.process(bL, bR, 128);
    const pp = e.voices[0].pipes[r], f = pp.freq();
    if (t < 0.6 || !f) continue;
    const reg = f / f0 > (1 + jump) / 2 ? jump : 1, want = up === null ? jump : 1;
    // a jump counts once the new regime has held for 50 ms; it happened where it began
    if (reg === want && (up === null ? t - 0.6 < T / 2 : t - 0.6 > T / 2)) { if (run2++ === 0) cand = pp.foot; } else run2 = 0;
    if (up !== null && !to && t > tUp + 0.1) to = f / f0; // the overblown pitch, settled for 0.1 s
    if (run2 * 128 > 0.05 * FS) {
      if (up === null) { up = cand; tUp = t; } else if (dn === null) dn = cand;
      run2 = 0;
    }
  }
  return { up, dn, to, thUp: up && thetaAt(pm, up), thDn: dn && thetaAt(pm, dn) };
}
test('overblowing: more wind jumps the open Principal to its octave and the stopped Gedackt to its twelfth; the return comes at a far lower wind (hysteresis), at the same U_j/(fW) whatever the cut-up (within 4 %), so its pressure scales as (fW)²; the jump up roughly so (U_j/(fW) within 15 %)', () => {
  for (const [key, r] of [[60, 0], [60, 2]]) {
    const rows = [0.5, 0.6, 0.7].map((cut) => ({ cut, ...overblow(key, r, cut) }));
    for (const o of rows) {
      assert.ok(o.up && o.dn, `${organName(key)} ${RANKS[r].id} cut-up ${o.cut}: up ${o.up} down ${o.dn}`);
      assert.ok(rel(o.to, r === 2 ? 3 : 2) < 0.1, `jumps to ×${o.to.toFixed(2)}`); // its second mode, a little flat (the jet's phase)
      assert.ok(o.up / o.dn > 1.5, `hysteresis ${(o.up / o.dn).toFixed(2)}`);
    }
    const mDn = rows.reduce((s, o) => s + o.thDn, 0) / 3, mUp = rows.reduce((s, o) => s + o.thUp, 0) / 3;
    for (const o of rows) {
      assert.ok(rel(o.thDn, mDn) < 0.04, `return at θ ${rows.map((x) => x.thDn.toFixed(1))}`);
      assert.ok(rel(o.thUp, mUp) < 0.15, `jump at θ ${rows.map((x) => x.thUp.toFixed(1))}`);
    }
    console.log(`        ${organName(key)} ${RANKS[r].id}: ${rows.map((o) => `cut-up ×${o.cut}: to ×${o.to.toFixed(2)} at ${o.up.toFixed(0)} Pa (U/fW ${o.thUp.toFixed(1)}), back at ${o.dn.toFixed(0)} Pa (${o.thDn.toFixed(1)})`).join('; ')}`);
  }
});
test('wind sag: 5 % less wind lowers the pitch far less than the ½Δp/p (−44 ¢) of f ∝ √p (under 10 % of it), and less for higher-Q pipes (C … f³); a big chord on a flexible wind sags the chest and the held pipe follows by under 10 % of ½Δp/p', () => {
  const rows = [];
  for (const k of [36, 48, 60, 72, 84, 89]) {
    const fr = [700, 665].map((p) => { const res = run(P({ noise: 0, pressure: p }), [[0, 'on', k, 0.7]], 1.8); return freqAt(res.L, keyFreq(k), Math.round(1.0 * FS), res.L.length); });
    const c = cents(fr[1], fr[0]), naive = 600 * Math.log2(0.95), Q = pipeModel(keyFreq(k), false, P()).Q1;
    assert.ok(c < 0 && c > 0.1 * naive, `${organName(k)}: ${c.toFixed(2)} ¢ vs ${naive.toFixed(1)}`);
    rows.push({ k, c, Q });
  }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].Q < rows[i - 1].Q && rows[i].c < rows[i - 1].c, `${rows.map((x) => `Q ${x.Q.toFixed(0)}: ${x.c.toFixed(2)} ¢`)}`);
  // the chord: c¹ held, then nine more keys with three stops each, on a flexible wind
  const keys = [48, 52, 55, 64, 67, 71, 72, 76, 79];
  let f1 = 0, f2 = 0, p1 = 0, p2 = 0, n1 = 0, n2 = 0;
  run(P({ wind: 1, noise: 0, octave: true, gedackt: true }), [[0, 'on', 60, 0.7], ...keys.map((k) => [1.5, 'on', k, 0.7])], 3.5, { track: true, tap: (e, t) => {
    const v = e.byKey.get(60), f = v.pipes[0].freq();
    if (t > 1.0 && t < 1.5) { f1 += f; p1 += v.pipes[0].foot; n1++; }
    if (t > 2.6) { f2 += f; p2 += v.pipes[0].foot; n2++; }
  } });
  const dp = 1 - p2 / n2 / (p1 / n1), dc = cents(f2 / n2, f1 / n1), naive = 600 * Math.log2(1 - dp);
  assert.ok(dp > 0.01, `sag ${(dp * 100).toFixed(2)} %`);
  assert.ok(dc < 0 && dc > 0.1 * naive, `${dc.toFixed(2)} ¢ for a ${(dp * 100).toFixed(1)} % sag (½Δp/p: ${naive.toFixed(1)} ¢)`);
  console.log(`        5 % less wind: ${rows.map((x) => `${organName(x.k)} (Q ${x.Q.toFixed(0)}) ${x.c.toFixed(2)} ¢`).join(', ')}; chord on a flexible wind: −${(dp * 100).toFixed(1)} %, c¹ ${dc.toFixed(2)} ¢`);
});
test('chiff: a fast pallet (1.5 ms) lets the upper modes speak first, and a slow one (40 ms) does not: in the first 30 ms of sound, harmonics 2–8 against the fundamental are 5 dB stronger or more (C, c, c¹) (Nolle & Finch 1992)', () => {
  for (const k of [36, 48, 60]) {
    const ratio = (rise) => {
      const res = run(P({ rise }), [[0, 'on', k, 0.7]], 0.6), x = res.L, f0 = keyFreq(k);
      const W = Math.round(0.002 * FS); let a = 0; // from where the sound starts (−40 dB of its final level)
      const fin = rms(x, x.length - 4800, x.length);
      while (a + W < x.length && rms(x, a, a + W) < 0.01 * fin) a += W;
      const b = a + Math.round(0.03 * FS), h1 = level(x, f0, a, b);
      let up = 0; for (let n = 2; n <= 8; n++) up += level(x, n * f0, a, b) ** 2;
      return 10 * Math.log10(up / (h1 * h1));
    };
    const fast = ratio(1.5), slow = ratio(40);
    console.log(`        ${organName(k)}: upper/fundamental ${fast.toFixed(1)} dB (fast) vs ${slow.toFixed(1)} dB (slow)`);
    assert.ok(fast - slow > 5, `${organName(k)}: upper/fundamental ${fast.toFixed(1)} dB (fast) vs ${slow.toFixed(1)} dB (slow)`);
  }
});
test('the wind system: after a chord a flexible wind rings at f_w = 1/2π√(M_t C_c) (within 10 %); a steady one (the Schwimmer) sags under 1.5 % with no ringing', () => {
  const keys = [48, 52, 55, 60, 64, 67, 71, 72, 76, 79];
  for (const wind of [1, 0]) {
    const Pc = [];
    run(P({ wind, octave: true, gedackt: true, noise: 0 }), keys.map((k) => [0.1, 'on', k, 1]), 2.6, { tap: (e) => Pc.push(e.Pc) });
    const tail = Pc.slice(Math.round((0.6 * FS) / 128)), mean = tail.reduce((s, v) => s + v, 0) / tail.length;
    if (wind === 1) { // the ringing about where it settles, from the chord's first dip
      const ring = Pc.slice(Math.round((0.15 * FS) / 128), Math.round((1.6 * FS) / 128)), fin = Pc[Pc.length - 1], ups = [];
      for (let i = 1; i < ring.length; i++) if (ring[i - 1] < fin && ring[i] >= fin) ups.push(i - 1 + (fin - ring[i - 1]) / (ring[i] - ring[i - 1]));
      const f = ((ups.length - 1) * FS) / 128 / (ups[ups.length - 1] - ups[0]), ws = windSystem(1), fw = ws.fw;
      // the C++'s wind: the long trunk's air mass, and the chest's compliance V_c/ρc²
      assert.ok(ws.Mt === WIND.Mt[1] && rel(ws.Cc, WIND.Vc / (AIR.rho * AIR.c ** 2)) < 1e-12 && rel(fw, 1 / (TAU * Math.sqrt(ws.Mt * ws.Cc))) < 1e-12, `${ws.Mt} ${ws.Cc} ${fw}`);
      assert.ok(ups.length > 4 && rel(f, fw) < 0.1, `${f.toFixed(2)} Hz vs ${fw.toFixed(2)} Hz`);
    } else {
      const sag = 1 - mean / 700, min = Math.min(...Pc);
      assert.ok(sag > 0 && sag < 0.015 && min > mean - 0.5 * (700 - mean) - 1, `sag ${(sag * 100).toFixed(2)} %, dip to ${min.toFixed(1)}`);
    }
  }
});
test('tremulant: its valve pulses the chest’s pressure at its rate (within 2 %), a few per cent deep', () => {
  for (const rate of [4, 7]) {
    const Pc = [];
    run(P({ tremulant: true, tremRate: rate, tremDepth: 0.5, noise: 0 }), [[0, 'on', 60, 0.7]], 3, { tap: (e, t) => { if (t > 1) Pc.push(e.Pc); } });
    const mean = Pc.reduce((s, v) => s + v, 0) / Pc.length, ups = [];
    for (let i = 1; i < Pc.length; i++) if (Pc[i - 1] < mean && Pc[i] >= mean) ups.push(i);
    const f = ((ups.length - 1) * FS) / 128 / (ups[ups.length - 1] - ups[0]), depth = (Math.max(...Pc) - Math.min(...Pc)) / 2 / mean;
    assert.ok(rel(f, rate) < 0.02, `${f.toFixed(2)} vs ${rate}`);
    assert.ok(depth > 0.01 && depth < 0.2, `±${(depth * 100).toFixed(1)} %`);
  }
});
// One pipe alone on the Principal's slot of a key, voiced and cut as the organ has it: its sound.
function onePipe(k, r, sec, { fs = FS, p = {} } = {}) {
  const f = pipeFreq(k, r), st = RANKS[r].stopped, R = pipeModel(f, st, P(p), { tune: tuning(f, st) });
  const e = new PipeEngine(fs); e.setParams(P({ ...ONLY.principal, noise: 0, ...p })); e.modelsFor = () => [R, R, R, R, R, R]; e.noteOn(k, 0.7);
  const n = Math.round(sec * fs), L = new Float64Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  for (let s2 = 0; s2 < n; s2 += 128) { e.process(bL, bR, 128); for (let i = 0; i < 128 && s2 + i < n; i++) L[s2 + i] = bL[i]; }
  e.destroy?.();
  return L;
}
const PAST = [];
for (let k = KEY_MIN; k <= KEY_MAX; k++) if (k < KEY_LO || k > KEY_HI) PAST.push(k);
console.log('the full range (A₂–c⁵)');
test('past the manual (A₂–B₁ and f♯³–c⁵), every key on every rank speaks on its fundamental at the default wind (3 dB over the next partial of its mouth flow), in tune within 2 ¢ at 48 kHz (the pipes under 60 Hz, slow to speak as big pipes are, heard later)', () => {
  let worst = 0, at = '';
  for (const k of PAST) for (let r = 0; r < RANKS.length; r++) {
    const f0 = pipeFreq(k, r), sec = f0 < 60 ? 1.6 + 3 * (60 / f0 - 1) : f0 < 200 ? 1.6 : 0.8, x = onePipe(k, r, sec);
    const a = x.length - Math.round(0.6 * FS), q = flow(x, a), fa = freqAt(x, f0, a, x.length, FS, Math.max(2048, Math.ceil((4 * FS) / f0)));
    const hs = [];
    for (let h = 1; h <= 10 && h * fa < 0.45 * FS; h++) hs.push(level(q, h * fa, a, x.length));
    if (hs.length > 1) { const margin = 20 * Math.log10(hs[0] / Math.max(...hs.slice(1))); assert.ok(margin > 3, `${organName(k)} ${RANKS[r].id}: fundamental ${margin.toFixed(1)} dB above the next partial`); }
    assert.ok(Math.abs(cents(fa, f0)) < 2, `${organName(k)} ${RANKS[r].id}: ${cents(fa, f0).toFixed(2)} ¢`);
    if (Math.abs(cents(fa, f0)) > Math.abs(worst)) { worst = cents(fa, f0); at = `${organName(k)} ${RANKS[r].id}`; }
  }
  console.log(`        worst ${worst.toFixed(2)} ¢ (${at})`);
});
test('past the manual the voicing carries on: Töpfer’s scale and the open and stopped cut-ups, the loop gain 6 from c¹ up and ∝ f^−0.4 below, but no more than at C (65 Hz); every pipe unstable (speaks) at the default wind', () => {
  for (const k of PAST) for (let r = 0; r < RANKS.length; r++) {
    const f = pipeFreq(k, r), st = RANKS[r].stopped, R = pipeModel(f, st, P());
    const g = GAIN * Math.max(1, (Math.max(f, keyFreq(36)) / keyFreq(60)) ** -GAIN_BASS);
    assert.ok(rel(R.gain, g) < 1e-12, `${organName(k)} ${RANKS[r].id}: gain ${R.gain} vs ${g}`);
    assert.ok(rel(R.geo.D, 0.1555 * (f / keyFreq(36)) ** -0.75 * (st ? 0.85 : 1)) < 1e-12, `${organName(k)} ${RANKS[r].id}: D`);
    const s = linearRoot(R, P_NOM, 0);
    assert.ok(s && s.re > 0, `${organName(k)} ${RANKS[r].id}: ${s && s.re}`);
  }
  assert.ok(rel(pipeModel(27.5, false, P()).gain, pipeModel(keyFreq(36), false, P()).gain) < 1e-12);
});
test('the Mixture over the full range: octaves and pure fifths (×1, 1½, 2, 3, 4, 6, 8, 12 the 8′), breaking back at c, c¹, c², f♯³ and c⁴, never above c⁵’s 4′ (8.4 kHz)', () => {
  const breaks = [];
  for (let k = KEY_MIN; k <= KEY_MAX; k++) {
    const h = [3, 4, 5].map((r) => harm(k, r));
    assert.ok(h.every((x) => [1, 1.5, 2, 3, 4, 6, 8, 12].some((n) => rel(x, n) < 1e-12)), `${organName(k)}: ${h}`);
    if (k > KEY_MIN && Math.round(harm(k, 5)) < Math.round(harm(k - 1, 5))) breaks.push(k);
    assert.ok(keyFreq(k) * Math.max(...h) < 8400, organName(k));
  }
  assert.deepEqual(breaks, [48, 60, 72, 90, 96]);
});
test('pipes of 6 kHz and more (only past the manual) run at 4× the sample rate: c⁵’s Octave 4′ (8.4 kHz) sounds within 2 ¢ of its 48 kHz pitch at 44.1 kHz, and its partials above the output’s Nyquist do not fold back (60 dB down)', () => {
  const f0 = pipeFreq(108, 1), at = {};
  for (const fs of [44100, 48000]) {
    const x = onePipe(108, 1, 0.6, { fs }), a = x.length - Math.round(0.3 * fs);
    at[fs] = freqAt(x, f0, a, x.length, fs);
    if (fs === 44100) { // the third partial (25.1 kHz) would land at 19.0 kHz, the fourth (33.5 kHz) at 10.7 kHz
      const h1 = level(x, at[fs], a, x.length, fs);
      for (const n of [3, 4]) { const al = Math.abs(fs - n * at[fs]), l = 20 * Math.log10(level(x, al, a, x.length, fs) / h1); assert.ok(l < -60, `partial ${n} folded to ${al.toFixed(0)} Hz: ${l.toFixed(1)} dB`); }
    }
  }
  assert.ok(Math.abs(cents(at[44100], at[48000])) < 2, `${cents(at[44100], at[48000]).toFixed(2)} ¢`);
});
test('the keys past the manual are stable: A₂, C₁, f♯³ and c⁵ with every stop, under seeded extremes at 44.1 and 48 kHz: no NaN, bounded and not growing (a full-organ A₂ under 2 at the default wind)', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'fullRange'].includes(q.id));
  let seed = 977, worst = 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const all = { octave: true, gedackt: true, mixture: true };
  assert.ok(peakAbs(run(P(all), [[0, 'on', 21, 1]], 2.5)) < 2);
  for (const fs of [44100, 48000]) for (let c = 0; c < 3; c++) {
    const p = P(all);
    for (const q of sliders) { if (q.type === 'checkbox' || rnd() < 0.5) continue; p[q.id] = rnd() < 0.5 ? q.min : q.max; }
    const r = run(p, [21, 24, 90, 108].map((k) => [0, 'on', k, rnd()]), 1.5, { fs });
    let pk = 0;
    for (let i = 0; i < r.L.length; i++) { assert.ok(Number.isFinite(r.L[i] + r.R[i]), `${fs}: NaN with ${JSON.stringify(p)}`); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
    worst = Math.max(worst, pk);
    const mid = rms(r.L, Math.round(0.75 * fs), fs), end = rms(r.L, r.L.length - Math.round(0.25 * fs), r.L.length);
    assert.ok(pk < 20 && end < 2 * mid + 1e-3, `${fs}: peak ${pk.toFixed(2)}, rms ${mid.toFixed(3)} then ${end.toFixed(3)}, with ${JSON.stringify(p)}`);
  }
  console.log(`        loudest of 6: ${worst.toFixed(2)}`);
});

test('stereo from the chest: keys of the C side (C, D, E …) sound left and of the C♯ side right, the biggest pipes outermost (past the manual, at its ends’ places)', () => {
  for (let k = KEY_MIN; k <= KEY_MAX; k++) assert.equal(Math.sign(chestPan(k)), (k - KEY_LO) % 2 === 0 ? -1 : 1, organName(k));
  for (const k of PAST) assert.equal(Math.abs(chestPan(k)), Math.abs(chestPan(k < KEY_LO ? KEY_LO : KEY_HI)), organName(k));
  assert.ok(Math.abs(chestPan(36)) > Math.abs(chestPan(60)) && Math.abs(chestPan(60)) > Math.abs(chestPan(88)));
  for (const [k, side] of [[36, -1], [37, 1], [60, -1], [61, 1]]) {
    const r = run(P(), [[0, 'on', k, 0.7]], 0.6), l = rms(r.L, 14400, 28800), rr = rms(r.R, 14400, 28800);
    assert.ok(Math.sign(rr - l) === side, `${organName(k)}: L ${l.toFixed(4)} R ${rr.toFixed(4)}`);
  }
});

test('live knobs glide: the wind pressure, the wind’s stiffness, the tremulant and a stop drawn mid-chord change the sound without a click (no sample step over twice the steady largest)', () => {
  const base = P({ noise: 0.5 }), keys = [48, 55, 60, 64, 67];
  for (const change of [{ pressure: 1400 }, { pressure: 350 }, { wind: 1 }, { tremulant: true, tremDepth: 1 }, { octave: true }, { principal: false, gedackt: true }]) {
    const r = run(base, [...keys.map((k) => [0, 'on', k, 0.7]), [0.8, 'params', { ...base, ...change }]], 1.0);
    const step = (a, b) => { let m = 0; for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) m = Math.max(m, Math.abs(r.L[i] - r.L[i - 1]), Math.abs(r.R[i] - r.R[i - 1])); return m; };
    const before = step(0.6, 0.8), after = step(0.8, 0.84);
    assert.ok(after < 2 * before, `${JSON.stringify(change)}: step ${after.toExponential(2)} after, ${before.toExponential(2)} before`);
  }
});

console.log('voices');
test('re-pressing a sounding key reopens the same pallet (no second voice); key up stops a c¹ 40 dB down within 0.4 s; a quick tap still sounds; the voice retires', () => {
  const r = run(P(), [[0, 'on', 60, 0.7], [0.5, 'on', 60, 0.7]], 0.8);
  assert.equal(r.e.voices.length, 1);
  const r2 = run(P(), [[0, 'on', 60, 0.7], [0.5, 'off', 60], [0.52, 'on', 60, 0.7], [1.0, 'off', 60]], 1.6);
  assert.ok(r2.e.voices.length <= 1);
  const full = rms(r2.L, Math.round(0.85 * FS), Math.round(0.95 * FS)), after = rms(r2.L, Math.round(1.38 * FS), Math.round(1.42 * FS));
  assert.ok(after < 0.01 * full, `${after} vs ${full}`);
  const tap = run(P(), [[0, 'on', 72, 1], [0.08, 'off', 72]], 0.4);
  assert.ok(peakAbs(tap) > 0.005, `tap ${peakAbs(tap)}`);
  const r3 = run(P(), [[0, 'on', 60, 0.7], [0.5, 'off', 60]], 3);
  assert.equal(r3.e.voices.length, 0, 'the voice retires');
});
test('voice stealing: past 20 keys the quietest released key fades out over 30 ms (no click), never one under 50 ms old', () => {
  const ev = [];
  for (let i = 0; i < 20; i++) ev.push([0.02 * i, 'on', 40 + 2 * i, 0.7], [0.5, 'off', 40 + 2 * i]);
  ev.push([0.55, 'on', 89, 0.7], [0.552, 'on', 87, 0.7]);
  let live = 0, youngStolen = false;
  const r = run(P(), ev, 0.9, { tap: (e, t) => { if (t > 0.56) { live = Math.max(live, e.voices.filter((v) => !v.fading).length); for (const v of e.voices) if (v.fading && (v.key === 89 || v.key === 87)) youngStolen = true; } } });
  assert.ok(live <= 20 && !youngStolen, `${live} live`);
  let jump = 0;
  for (let i = Math.round(0.55 * FS); i < Math.round(0.7 * FS); i++) jump = Math.max(jump, Math.abs(r.L[i] - r.L[i - 1]));
  assert.ok(jump < 0.1, `largest step ${jump}`);
});

console.log('levels and stability');
test('level: a single Principal note peaks at 0.03–0.5 from C to f³ (0.1–0.5 up to c¹) at 44.1 and 48 kHz; a ten-key full-organ chord stays under 2', () => {
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += 6) {
    const pk = peakAbs(run(P(), [[0, 'on', k, 1]], 0.9, { fs }));
    assert.ok(pk < 0.5 && pk > (k <= 60 ? 0.1 : 0.03), `${organName(k)} at ${fs}: ${pk.toFixed(3)}`);
  }
  const chord = run(P({ octave: true, gedackt: true, mixture: true }), [36, 48, 52, 55, 60, 64, 67, 72, 76, 79].map((k) => [0, 'on', k, 1]), 1.5);
  assert.ok(peakAbs(chord) < 2, `chord ${peakAbs(chord)}`);
  console.log(`        full-organ chord peaks at ${peakAbs(chord).toFixed(2)}`);
});
test('stability: seeded random combinations of extreme settings at 44.1 and 48 kHz, changed mid-note: no NaN, bounded, silent after release', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'venue', 'fullRange'].includes(q.id));
  let seed = 4242, worst = 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = () => {
    const p = P();
    for (const q of sliders) { if (rnd() < 0.5) continue; p[q.id] = q.type === 'checkbox' ? rnd() < 0.5 : rnd() < 0.5 ? q.min : q.max; }
    return p;
  };
  for (const fs of [44100, 48000]) for (let c = 0; c < 5; c++) {
    const p1 = pick(), p2 = pick(), ev = [];
    [36, 50, 61, 79, 89].forEach((k, i) => ev.push([0.02 * i, 'on', k, rnd()], [1.0, 'off', k]));
    ev.push([0.4, 'params', p2]);
    const r = run(p1, ev, 3, { fs });
    let pk = 0;
    for (let i = 0; i < r.L.length; i++) { assert.ok(Number.isFinite(r.L[i] + r.R[i]), `${fs}: NaN with ${JSON.stringify(p1)} → ${JSON.stringify(p2)}`); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
    worst = Math.max(worst, pk);
    assert.ok(pk < 12, `${fs}: peak ${pk.toFixed(2)} with ${JSON.stringify(p1)} → ${JSON.stringify(p2)}`);
    // after release each pipe rings down at its own losses (a big bass pipe for a while): the tail is falling, and well down
    const note = rms(r.L, Math.round(0.8 * fs), fs), t1 = rms(r.L, Math.round(2.0 * fs), Math.round(2.1 * fs)), t2 = rms(r.L, r.L.length - Math.round(0.1 * fs), r.L.length);
    assert.ok(t2 < 1e-4 || (t2 < 0.05 * note && t2 < 0.8 * t1), `${fs}: still sounding (${t2.toFixed(5)} after ${t1.toFixed(5)}, note ${note.toFixed(4)}) with ${JSON.stringify(p2)}`);
  }
  console.log(`        loudest of 10: ${worst.toFixed(2)}`);
});
test('presets use their own parameters, and each speaks without NaN', () => {
  for (const pr of PRESETS) {
    const r = run(P(pr.p), [[0, 'on', 55, 0.8], [0, 'on', 64, 0.8]], 1.2);
    let pk = 0;
    for (const v of r.L) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.01, `${pr.name}: ${pk}`);
  }
});
test('CPU: ten held keys of Principal 8′, Octave 4′ and Gedackt 8′ (30 pipes) at 48 kHz in under 30 % of real time', () => {
  const load = (st) => {
    const e = new PipeEngine(FS);
    e.setParams(P(st));
    for (const k of [48, 52, 55, 60, 64, 67, 71, 72, 76, 79]) e.noteOn(k, 0.8);
    const L = new Float32Array(128), R = new Float32Array(128);
    for (let s = 0; s < 0.5 * FS; s += 128) e.process(L, R, 128);
    const sec = 3, t0 = performance.now();
    for (let s = 0; s < sec * FS; s += 128) e.process(L, R, 128);
    return (performance.now() - t0) / (sec * 1000);
  };
  const three = load({ octave: true, gedackt: true }), all = load({ octave: true, gedackt: true, mixture: true });
  assert.ok(three < 0.3, `${(100 * three).toFixed(1)} % of real time`);
  console.log(`        (${(100 * three).toFixed(1)} % of real time for 30 pipes; ${(100 * all).toFixed(1)} % with the Mixture, 60 pipes)`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
