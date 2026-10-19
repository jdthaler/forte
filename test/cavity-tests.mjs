// RF Cavity Bells checks. Run: node test/cavity-tests.mjs
//
// The model (the C++, through cavity-wasm.js) is checked against independent physics: Bessel
// zeros from the tables, the coupled cells' eigenproblem solved here as a matrix, the voltage a
// charge sees integrated along the axis, the pillbox's stored energy integrated over the cell, and
// niobium's measured losses. Then the engine against the model: pitch, ring times, the couplers,
// the beam's offset and length, beam loading, the Lorentz detuning, a quench, the probes.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../cavity/src/cavity-instrument.js';
import { wasmModel } from '../cavity/src/cavity-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { symEig } from '../shared/linalg.js';

const CavityEngine = await loadEngine(INSTRUMENT);
const Model = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const QUIET = { lorentz: 0, offset: 0, qhom: 1e6 }; // the effects a test is not about, out of the way

// Abramowitz & Stegun, table 9.5: zeros of J0, J1
const J01 = 2.4048255577, J02 = 5.5200781103, J11 = 3.8317059702, J12 = 7.0155866698;

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events, onMessage) {
  const e = new CavityEngine(FS);
  if (onMessage) e.post = onMessage;
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
const note = (key, params, sec, vel = 0.8, more = [], onMessage) => render(params, sec, [[0, (e) => e.noteOn(key, vel)], ...more], onMessage);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The frequency of the strongest line near f in x[a, b): a golden-section search on the Goertzel.
function peak(x, f, a, b, span = 0.01) {
  let lo = f * (1 - span), hi = f * (1 + span);
  for (let i = 0; i < 60; i++) {
    const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo);
    if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}
const cents = (f, g) => 1200 * Math.log2(f / g);
const db = (r) => 20 * Math.log10(r);
const kickOf = (m) => Math.hypot(m.kick[0], m.kick[1]);
const piMode = (modes, N) => modes[N - 1];

// The circuit model, solved here: N cells, (ω_c/ω)² X_n = X_n + (k/2)(X_{n−1} + X_{n+1}), the cell
// past each end an image of the end cell (−X: end cells tuned so the π mode is flat) or nothing.
function circuit(N, k, tuned) {
  const V = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : Math.abs(i - j) === 1 ? k / 2 : 0)));
  if (tuned) { V[0][0] -= k / 2; V[N - 1][N - 1] -= k / 2; }
  const lambda = symEig(V, N);
  return Array.from({ length: N }, (_, c) => ({ lambda: lambda[c], x: V.map((row) => row[c]) }));
}

console.log('physics');
test('Bessel zeros: J0, J1 vanish at the tabulated zeros, and the pillbox modes stand at their ratios', () => {
  for (const [n, z] of [[0, J01], [0, J02], [1, J11], [1, J12]]) assert.ok(Math.abs(Model.bessel(n, z)) < 1e-9, `J${n}(${z}) = ${Model.bessel(n, z)}`);
  assert.ok(Math.abs(Model.bessel(1, 1) - 0.4400505857) < 1e-9, 'J1(1)'); // A&S table 9.1
  const k = 0.0187;
  for (const [b, r] of [[2, J11 / J01], [5, J02 / J01], [6, J12 / J01]]) assert.ok(Math.abs(Model.bandRatio(b, 1, k) / r - 1) < 1e-9, `${Model.bands[b].name}: ${Model.bandRatio(b, 1, k)} vs ${r}`);
});
test('TM011 and TM012: a pillbox cell β_g λ/2 long, from c √((j/R)² + (pπ/d)²)', () => {
  const c = 299792458, fpi = 1.3e9;
  for (const [k, betag] of [[0.0187, 1], [0.03, 0.61]]) {
    const fc = fpi * Math.sqrt(1 - k), R = (J01 * c) / (2 * Math.PI * fc), d = (betag * c) / (2 * fpi);
    for (const [b, p] of [[1, 1], [4, 2], [3, 1]]) {
      const j = b === 3 ? J11 : J01, f = (c / (2 * Math.PI)) * Math.hypot(j / R, (p * Math.PI) / d);
      assert.ok(Math.abs(Model.bandRatio(b, betag, k) - f / fc) < 1e-9, `${Model.bands[b].name} at β_g ${betag}: ${Model.bandRatio(b, betag, k)} vs ${f / fc}`);
    }
  }
});
test('coupled cells: every passband\'s modes are the circuit model\'s eigenmodes', () => {
  for (const N of [1, 2, 5, 9, 12]) for (const k of [0.0187, 0.05]) {
    const modes = Model.modes(60, P({ cells: N, coupling: k })), fpi = keyFreq(60), fc = fpi * Math.sqrt(1 - k);
    for (const [band, tuned] of [[0, true], [2, false]]) {
      const ev = circuit(N, k, tuned), ratio = Model.bandRatio(band, 1, k);
      const ms = modes.filter((m) => m.band === band).sort((a, b) => a.f - b.f);
      ev.sort((a, b) => b.lambda - a.lambda).forEach((e, i) => { // highest λ: lowest frequency
        const f = (fc * ratio) / Math.sqrt(e.lambda), m = ms[i];
        assert.ok(Math.abs(m.f / f - 1) < 1e-9, `N ${N}, ${Model.bands[band].name} mode ${i}: ${m.f} vs ${f}`);
        const x = Array.from({ length: N }, (_, n) => Model.modeShape(tuned, N, m.mode, n + 1));
        const dot = x.reduce((s, v, n) => s + v * e.x[n], 0);
        assert.ok(Math.abs(Math.abs(dot) - 1) < 1e-6, `N ${N}, mode ${m.mode}: shape overlap ${dot}`);
      });
    }
  }
});
test('TESLA\'s passband: the π mode is flat, and k = 2(f_π − f_0)/(f_π + f_0) is the coupling', () => {
  const N = 9, k = 0.0187, x = Array.from({ length: N }, (_, n) => Model.modeShape(true, N, N, n + 1));
  for (let n = 0; n < N; n++) assert.ok(Math.abs(Math.abs(x[n]) - 1 / 3) < 1e-12 && Math.sign(x[n]) === (n % 2 ? -1 : 1), `cell ${n + 1}: ${x[n]}`);
  // the band's edges, φ = 0 and π (Aune et al. 2000, Phys. Rev. ST Accel. Beams 3, 092001: k_cc 1.87 %)
  const f0 = 1 / Math.sqrt(1 + k), fp = 1 / Math.sqrt(1 - k), kcc = (2 * (fp - f0)) / (fp + f0);
  assert.ok(Math.abs(kcc / k - 1) < 1e-3, `k_cc ${kcc}`);
  const ms = Model.modes(69, P()), lo = Math.min(...ms.filter((m) => m.band === 0).map((m) => m.f));
  assert.ok(Math.abs(cents(lo, 440) - cents(Math.sqrt((1 - k) / (1 + k * Math.cos(Math.PI / 9))), 1)) < 1e-6, `π/9 mode ${cents(lo, 440).toFixed(1)} ¢`);
  assert.ok(cents(lo, 440) < -25 && cents(lo, 440) > -35, `the passband spans ${cents(lo, 440).toFixed(1)} ¢ below the π mode`);
});
test('transit-time factor: a uniform cell gives sin(θ/2)/(θ/2); a TM0n1 cell matches the integral along the axis', () => {
  for (const th of [0.3, Math.PI, 2, 5.5]) {
    const t = Model.transit(0, th), T = Math.sin(th / 2) / (th / 2);
    assert.ok(Math.abs(Math.hypot(t.re, t.im) - Math.abs(T)) < 1e-12, `θ ${th}: ${Math.hypot(t.re, t.im)} vs ${T}`);
    for (const p of [1, 2]) {
      let re = 0, im = 0;
      const M = 20000;
      for (let i = 0; i < M; i++) { const u = (i + 0.5) / M, e = Math.cos(p * Math.PI * u); re += (e * Math.cos(th * u)) / M; im += (e * Math.sin(th * u)) / M; }
      const tp = Model.transit(p, th);
      assert.ok(Math.hypot(tp.re - re, tp.im - im) < 1e-8, `p ${p}, θ ${th}`);
    }
  }
});
test('a bunch in step rings the π mode, √N in its field units; the other modes by the voltage they show it', () => {
  for (const N of [1, 4, 9]) {
    const modes = Model.modes(60, P({ cells: N, offset: 0, bunch: 0.005 }));
    const pi = piMode(modes, N), ff = Math.exp(-0.5 * (2 * Math.PI * 0.005) ** 2);
    assert.ok(Math.abs(kickOf(pi) / (Math.sqrt(N) * ff) - 1) < 1e-9, `N ${N}: ${kickOf(pi)}`);
    // the voltage along the axis, integrated here: E_z = x_n in cell n, the charge at z = v t
    for (const m of modes.filter((q) => q.band === 0)) {
      const th = Math.PI * (m.f / pi.f), M = 400 * N;
      let re = 0, im = 0;
      for (let i = 0; i < M; i++) {
        const z = ((i + 0.5) / M) * N, n = Math.floor(z) + 1, e = Model.modeShape(true, N, m.mode, n);
        re += (e * Math.cos(th * z) * N) / M; im += (e * Math.sin(th * z) * N) / M;
      }
      const want = (Math.hypot(re, im) * (Math.PI / 2)) * Math.exp(-0.5 * (2 * Math.PI * (m.f / pi.f) * 0.005) ** 2);
      assert.ok(Math.abs(kickOf(m) - want) < 2e-4 * Math.sqrt(N), `N ${N}, mode ${m.mode}: ${kickOf(m)} vs ${want}`);
    }
  }
});
test('a bunch out of step rings the passband\'s mode it keeps step with', () => {
  for (const beta of [0.9, 0.75, 0.6]) {
    const modes = Model.modes(60, P({ beta, offset: 0 })).filter((m) => m.band === 0);
    const best = modes.reduce((a, b) => (kickOf(b) > kickOf(a) ? b : a));
    const th = (((Math.PI / beta) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), folded = th > Math.PI ? 2 * Math.PI - th : th;
    const nearest = modes.reduce((a, b) => (Math.abs(b.phase - folded) < Math.abs(a.phase - folded) ? b : a));
    assert.ok(Math.abs(best.phase - nearest.phase) <= Math.PI / 9 + 1e-9, `β ${beta}: rings ${best.mode}π/9 most, in step with ${(folded / Math.PI).toFixed(2)}π`);
    const matched = kickOf(piMode(Model.modes(60, P({ offset: 0 })), 9));
    assert.ok(kickOf(piMode(modes, 9)) < 0.8 * matched, `β ${beta}: the π mode rung less (${kickOf(piMode(modes, 9)).toFixed(2)} vs ${matched.toFixed(2)})`);
  }
});
test('pillbox stored energy: the modes\' share of a bunch\'s energy, integrated over the cell here', () => {
  // the stored energy per unit on-axis field, ∫|E|²dV, by quadrature over r (E_z and, for p ≥ 1, E_r)
  const besselJ = (n, x) => { let s = 0; for (let m = 0; m < 400; m++) s += Math.cos(n * (m + 0.5) * (Math.PI / 400) - x * Math.sin((m + 0.5) * (Math.PI / 400))) / 400; return s; }; // Bessel's integral
  const dJ = (n, x) => (besselJ(n - 1, x) - besselJ(n + 1, x)) / 2;
  const energy = (m, j, p, dOverR) => {
    let s = 0;
    const M = 400, kz = (p * Math.PI) / dOverR / j;
    for (let i = 0; i < M; i++) {
      const r = (i + 0.5) / M, ez = besselJ(m, j * r) ** 2, er = kz * kz * (dJ(m, j * r) ** 2 + (m ? (besselJ(m, j * r) / (j * r)) ** 2 : 0));
      s += (r / M) * (p ? 0.5 * ez + 0.5 * er : ez);
    }
    return s * (m ? Math.PI : 2 * Math.PI);
  };
  // one cell, a bunch on the axis: TM020 against TM010, both uniform along the cell
  const k = 0.0187, dOverR = (Math.PI * Math.sqrt(1 - k)) / J01;
  const modes = Model.modes(60, P({ cells: 1, offset: 0, bunch: 0.005 })), ff = (m) => Math.exp(-0.5 * (2 * Math.PI * (m.f / modes[0].f) * 0.005) ** 2);
  const ratio = (b) => kickOf(modes[b]) / ff(modes[b]) / (kickOf(modes[0]) / ff(modes[0]));
  const T = (b) => { const t = Model.transit(Model.bands[b].p, Math.PI * (modes[b].f / modes[0].f)); return Math.hypot(t.re, t.im); };
  for (const b of [5, 1]) {
    const B = Model.bands[b], want = (T(b) / T(0)) * Math.sqrt(energy(0, J01, 0, dOverR) / energy(B.m, B.j, B.p, dOverR));
    assert.ok(Math.abs(ratio(b) / want - 1) < 2e-3, `${B.name}: ${ratio(b)} vs ${want}`);
  }
});
test('niobium: TESLA\'s surface resistance at 2 K and 4.2 K, Q0 > 5×10⁹, a gap Δ ≈ 1.9 kTc, a normal metal above 9.25 K', () => {
  const Q = (f, T) => 270 / Model.surfaceResistance(f, T), Rres = Model.surfaceResistance(1.3e9, 1.0); // at 1 K, all but residual
  // Aune et al. 2000: R_BCS at 1.3 GHz about 15 nΩ at 2 K and 800 nΩ at 4.2 K; G = 270 Ω, Q0 > 5×10⁹
  for (const [T, R] of [[2, 15e-9], [4.2, 800e-9]]) assert.ok(Math.abs((Model.surfaceResistance(1.3e9, T) - Rres) / R - 1) < 0.1, `R_BCS(${T} K) ${((Model.surfaceResistance(1.3e9, T) - Rres) * 1e9).toFixed(1)} nΩ`);
  assert.ok(Q(1.3e9, 2) > 5e9 && Q(1.3e9, 2) < 3e10, `Q0(2 K) ${Q(1.3e9, 2).toExponential(2)}`);
  // ln(R_BCS·T) against 1/T: the slope is −Δ/k; niobium's gap is 1.55 meV, Δ/k = 18 K (BCS: 1.76 kTc = 16.3 K)
  const rb = (T) => (Model.surfaceResistance(1.3e9, T) - Rres) * T;
  const slope = (Math.log(rb(4)) - Math.log(rb(3))) / (1 / 4 - 1 / 3);
  assert.ok(-slope > 16 && -slope < 18.5, `Δ/k = ${(-slope).toFixed(2)} K`);
  assert.ok(Q(1.3e9, 9.3) < 1e-4 * Q(1.3e9, 2), `above Tc: ${Q(1.3e9, 9.3).toExponential(2)}`);
  const r1 = Model.surfaceResistance(1e9, 4.2) - 1e-8, r2 = Model.surfaceResistance(2e9, 4.2) - 1e-8;
  assert.ok(Math.abs(r2 / r1 - 4) < 1e-6, 'R_BCS ∝ f²');
});
test('couplers: the input coupler damps the π mode at its Q, the HOM couplers leave the accelerating passband alone', () => {
  for (const [qext, temp] of [[1e9, 1.6], [1e8, 2], [1e10, 4.2]]) {
    const pi = piMode(Model.modes(60, P({ qext, temp })), 9), Q0 = 270 / Model.surfaceResistance(Model.physicalFrequency(pi.f, pi.f), temp);
    const QL = (Math.PI * pi.f) / pi.sigma / Model.QSCALE, want = 1 / (1 / qext + 1 / Q0);
    assert.ok(Math.abs(QL / want - 1) < 1e-9, `Q_ext ${qext.toExponential(0)} at ${temp} K: Q_L ${QL.toExponential(3)}, 1/(1/Q_ext + 1/Q0) ${want.toExponential(3)}`);
  }
  assert.ok(Model.physicalFrequency(keyFreq(30), keyFreq(30)) === 1.3e9, 'every key\'s π mode stands for 1.3 GHz');
  const a = Model.modes(60, P({ qhom: 1e6 })), b = Model.modes(60, P({ qhom: 1e11 }));
  a.forEach((m, j) => { if (m.band === 0) assert.equal(m.sigma, b[j].sigma); else assert.ok(m.sigma > 50 * b[j].sigma); });
  // a mode with little field in the end cells is trapped: it rings longest in its band
  const tm110 = b.filter((m) => m.band === 2), weakest = tm110.reduce((x, y) => (y.wHom < x.wHom ? y : x));
  assert.ok(tm110.every((m) => m.sigma >= weakest.sigma), 'the trapped mode rings longest');
});

console.log('engine');
test('the π mode is the note, within a cent, across the keyboard', () => {
  for (const key of [21, 40, 69, 96, 108]) {
    const [L] = note(key, P(QUIET), 1.2), f = keyFreq(key), a = 2400, b = a + 48000;
    const got = peak(L, f, a, b, 0.004);
    assert.ok(Math.abs(cents(got, f)) < 1, `${key}: ${cents(got, f).toFixed(2)} ¢`);
  }
});
test('the ring time is the loaded Q\'s: T60 = ln 1000 · Q_L / (π f)', () => {
  for (const [key, qext] of [[60, 1e9], [72, 3e8]]) {
    const params = P({ ...QUIET, qext }), m = piMode(Model.modes(key, params), 9), f = keyFreq(key), W = 16384;
    const [L] = note(key, params, 1.6), a = 2400, b = a + 48000;
    const fall = db(tone(L, f, b, b + W) / tone(L, f, a, a + W)), want = -(20 / Math.log(10)) * m.sigma;
    assert.ok(Math.abs(fall - want) < Math.max(0.3, 0.006 * Math.abs(want)), `${key}: ${fall.toFixed(2)} dB in 1 s, the model ${want.toFixed(2)}`);
  }
});
test('the higher-order modes ring where the model puts them, and their couplers damp them', () => {
  const params = P({ lorentz: 0, offset: 0.3, bunch: 0.02, qhom: 1e10 }), modes = Model.modes(57, params);
  const loudest = (b) => modes.filter((m) => m.band === b).reduce((x, y) => (kickOf(y) > kickOf(x) ? y : x));
  const [L] = note(57, params, 0.8), [Ld] = note(57, P({ ...params, qhom: 1e7 }), 0.8);
  for (const b of [1, 2, 5]) {
    const m = loudest(b), got = peak(L, m.f, 2400, 2400 + 32768, 0.0015);
    assert.ok(Math.abs(cents(got, m.f)) < 3, `${Model.bands[b].name} mode ${m.mode}: ${got.toFixed(2)} vs ${m.f.toFixed(2)} Hz`);
    assert.ok(tone(Ld, m.f, 9600, 9600 + 16384) < 0.3 * tone(L, m.f, 9600, 9600 + 16384), `${Model.bands[b].name} damped by the HOM couplers`);
  }
});
test('the dipole modes need an offset beam, and grow with it as J1', () => {
  const at = (offset) => { const params = P({ lorentz: 0, offset, qhom: 1e10 }), m = Model.modes(60, params).filter((q) => q.band === 2).reduce((x, y) => (kickOf(y) > kickOf(x) ? y : x)); return [m, note(60, params, 0.5)[0]]; };
  const [m0, L0] = at(0), [m1, L1] = at(0.1), [m2, L2] = at(0.2);
  assert.ok(kickOf(m0) === 0, 'none on the axis');
  const a1 = tone(L1, m1.f, 2400, 2400 + 16384), a2 = tone(L2, m2.f, 2400, 2400 + 16384), want = Model.bessel(1, J11 * 0.2) / Model.bessel(1, J11 * 0.1);
  assert.ok(tone(L0, m1.f, 2400, 2400 + 16384) < 0.02 * a1, 'silent on the axis');
  assert.ok(Math.abs(a2 / a1 / want - 1) < 0.05, `0.2 vs 0.1: ${(a2 / a1).toFixed(3)}, J1 ${want.toFixed(3)}`);
});
test('a shorter bunch rings the higher modes more, by the Gaussian form factor', () => {
  const run = (bunch) => { const params = P({ ...QUIET, qhom: 1e10, bunch }), ms = Model.modes(60, params); return [ms, note(60, params, 0.5)[0]]; };
  const [ma, La] = run(0.1), [mb, Lb] = run(0.02), f020 = ma.filter((m) => m.band === 5).reduce((x, y) => (kickOf(y) > kickOf(x) ? y : x));
  const r = (L, ms) => tone(L, f020.f, 2400, 2400 + 16384) / tone(L, piMode(ms, 9).f, 2400, 2400 + 16384);
  const ratio = (f, fpi, s) => Math.exp(-0.5 * (2 * Math.PI * (f / fpi) * s) ** 2) / Math.exp(-0.5 * (2 * Math.PI * s) ** 2);
  const want = ratio(f020.f, piMode(ma, 9).f, 0.02) / ratio(f020.f, piMode(ma, 9).f, 0.1);
  const got = r(Lb, mb) / r(La, ma);
  assert.ok(Math.abs(got / want - 1) < 0.1, `TM020 against the π mode: ×${got.toFixed(2)}, the form factor ×${want.toFixed(2)}`);
});
test('beam loading: a held key\'s bunch train builds the π mode to q|K|/(1 − e^(−σT_b))', () => {
  const params = P({ ...QUIET, current: 1, spacing: 4 }), key = 60, m = piMode(Model.modes(key, params), 9);
  let last = null;
  note(key, params, 8, 0.6, [], (msg) => { if (msg.type === 'cells') last = msg; });
  const Tb = 4 / m.f, want = (Model.TRAIN * 0.6 * kickOf(m)) / 3 / (1 - Math.exp(-m.sigma * Tb));
  assert.ok(Math.abs(last.peak / want - 1) < 0.03, `field ${last.peak.toFixed(3)}, the series ${want.toFixed(3)}`);
  let off = null;
  note(key, params, 8, 0.6, [[0.05, (e) => e.noteOff(key)]], (msg) => { if (msg.type === 'cells') off = msg; });
  assert.ok(!off || off.peak < 0.01, 'no train once the key is up');
});
test('key pressure adds beam current', () => {
  const params = P({ ...QUIET, current: 0 });
  let a = null, b = null;
  note(60, params, 3, 0.6, [], (m) => { if (m.type === 'cells') a = m; });
  note(60, params, 3, 0.6, [[0.01, (e) => e.handle({ type: 'pressure', value: 1, key: 60 })]], (m) => { if (m.type === 'cells') b = m; });
  assert.ok(b.peak > 3 * a.peak, `pressed ${b.peak.toFixed(3)} vs ${a.peak.toFixed(3)}`);
});
test('Lorentz detuning: a hard strike starts flat by K·E² and rises to pitch', () => {
  const params = P({ lorentz: 30, mech: 80, offset: 0, qhom: 1e6 }), key = 69, f = keyFreq(key);
  const [L] = note(key, params, 3, 1), W = 8192;
  const early = peak(L, f, 1200, 1200 + W, 0.03), late = peak(L, f, 2.5 * FS, 2.5 * FS + W, 0.03);
  const m = piMode(Model.modes(key, params), 9), E2 = (kickOf(m) / 3) ** 2, t = (1200 + W / 2) / FS;
  const want = -30 * E2 * Math.exp(-2 * m.sigma * t); // E² decays at 2σ
  assert.ok(Math.abs(cents(early, f) - want) < 1.5, `early ${cents(early, f).toFixed(2)} ¢, K·E² ${want.toFixed(2)} ¢`);
  assert.ok(Math.abs(cents(late, f)) < Math.abs(cents(early, f)) / 3, `late ${cents(late, f).toFixed(2)} ¢`);
});
test('a quench: the field collapses past the quench field, and the cavity recovers', () => {
  const params = P({ ...QUIET, current: 1, quench: 1.0, recovery: 0.5 }), key = 60, f = keyFreq(key);
  const log = [];
  const [L] = note(key, params, 3, 1, [], (m) => { if (m.type === 'cells') log.push(m); });
  const q = log.findIndex((m) => m.quenched);
  assert.ok(q > 0, 'it quenches');
  const before = Math.max(...log.slice(0, q).map((m) => m.peak));
  assert.ok(before > 0.95 && log[q + 2].peak < 0.05 * before, `field ${before.toFixed(2)} → ${log[q + 2].peak.toFixed(3)}`);
  const back = log.findIndex((m, i) => i > q && !m.quenched);
  assert.ok(back > q && Math.abs((back - q) / 30 - 0.5) < 0.1, `superconducting again after ${((back - q) / 30).toFixed(2)} s`);
  assert.ok(log.slice(back).some((m) => m.peak > 0.5), 'the train builds it up again');
  assert.ok(L.every(Number.isFinite));
  void f;
});
test('the helium bath: warmer walls shorten the ring as BCS says; above Tc only a click', () => {
  const key = 60, f = keyFreq(key), W = 16384;
  for (const temp of [2, 4.2, 6]) {
    const params = P({ ...QUIET, temp }), m = piMode(Model.modes(key, params), 9);
    const [L] = note(key, params, 1.2), fall = db(tone(L, f, 2400 + 24000, 2400 + 24000 + W) / tone(L, f, 2400, 2400 + W));
    const want = -(20 / Math.log(10)) * m.sigma * 0.5;
    assert.ok(Math.abs(fall - want) < 0.3, `${temp} K: ${fall.toFixed(2)} dB in 0.5 s, the model ${want.toFixed(2)}`);
  }
  const [hot] = note(key, P({ ...QUIET, temp: 10 }), 0.2);
  let late = 0;
  for (let i = 480; i < hot.length; i++) late = Math.max(late, Math.abs(hot[i]));
  assert.ok(late < 1e-6, `normal niobium: ${late} 10 ms on`);
});
test('letting go pushes the coupler in; the pedal keeps it back', () => {
  const key = 60, f = keyFreq(key), W = 1024, params = P(QUIET), off = [[0.3, (e) => e.noteOff(key)]];
  const [L] = note(key, params, 1, 0.8, off), [S] = note(key, params, 1, 0.8, [[0, (e) => e.setSustain(true)], ...off]);
  const m = piMode(Model.modes(key, params, { released: true }), 9), a = Math.round(0.31 * FS), b = Math.round(0.34 * FS);
  const fall = db(tone(L, f, b, b + W) / tone(L, f, a, a + W)), want = -(20 / Math.log(10)) * m.sigma * ((b - a) / FS);
  assert.ok(Math.abs(fall - want) < 0.5, `released: ${fall.toFixed(1)} dB in 30 ms, the model ${want.toFixed(1)}`);
  assert.ok(tone(S, f, b, b + W) > 0.9 * tone(S, f, a, a + W), 'the pedal keeps it ringing');
});
test('the probes: the π mode is in phase at both ends of an odd cavity, opposite in an even one', () => {
  for (const [cells, sign] of [[9, 1], [8, -1]]) {
    const [L, R] = note(60, P({ ...QUIET, cells }), 0.3);
    let lr = 0, ll = 0;
    for (let i = 2400; i < L.length; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; }
    assert.ok(Math.sign(lr) === sign && Math.abs(lr / ll) > 0.9, `${cells} cells: ${(lr / ll).toFixed(3)}`);
  }
});
test('pitch bend moves every mode by up to two semitones', () => {
  const f = keyFreq(60), [L] = note(60, P(QUIET), 1, 0.8, [[0, (e) => e.handle({ type: 'bend', value: 1 })]]);
  const got = peak(L, f * 2 ** (2 / 12), 24000, 24000 + 16384, 0.01);
  assert.ok(Math.abs(cents(got, f) - 200) < 1, `${cents(got, f).toFixed(2)} ¢`);
});
test('voice stealing: past 24 keys the quietest one let go fades out (no click), not the oldest', () => {
  const loud = Array.from({ length: 24 }, (_, i) => 60 + i), params = P(QUIET);
  const play = (withQuiet) => render(params, 0.5, [
    [0, (e) => e.setSustain(true)],
    ...(withQuiet ? [[0, (e) => e.noteOn(36, 0.3)], [0.05, (e) => e.noteOff(36)]] : []),
    ...loud.map((k, i) => [0.1 + 0.004 * i, (e) => e.noteOn(k, 1)]),
  ]);
  const [a, , e] = play(true), [b] = play(false);
  assert.equal(e.voiceCount(), 24, `${e.voiceCount()} voices`);
  let jump = 0, amp = 0;
  for (let i = 1; i < a.length; i++) { jump = Math.max(jump, Math.abs((a[i] - b[i]) - (a[i - 1] - b[i - 1]))); amp = Math.max(amp, Math.abs(a[i] - b[i])); }
  assert.ok(amp > 0 && jump < 0.05 * amp, `largest step ${(jump / amp).toFixed(3)} of the stolen voice's level`);
  let late = 0;
  for (let i = Math.round(0.3 * FS); i < a.length; i++) late = Math.max(late, Math.abs(a[i] - b[i]));
  assert.ok(late < 1e-3 * amp, `the stolen voice is gone: ${late}`);
});
test('every preset plays: sane level (peak 0.02 – 1), no NaN, silent after release', () => {
  for (const pr of PRESETS) {
    const params = P(pr.p), keys = [24, 48, 60, 72, 96, 108];
    const [L, R, e] = render(params, 4, [...keys.map((k) => [0, (x) => x.noteOn(k, 1)]), ...keys.map((k) => [0.5, (x) => x.noteOff(k)])]);
    let pk = 0;
    for (let i = 0; i < 0.5 * FS; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    assert.ok(L.every(Number.isFinite) && R.every(Number.isFinite), `${pr.name}: NaN`);
    assert.ok(pk > 0.02 && pk < 1.2, `${pr.name}: peak ${pk.toFixed(3)} (six keys)`);
    let tail = 0;
    for (let i = 3.5 * FS; i < 4 * FS; i++) tail = Math.max(tail, Math.abs(L[i]));
    assert.ok(tail < 1e-3, `${pr.name}: ${tail} after release`);
    assert.equal(e.voiceCount(), 0, `${pr.name}: voices finish`);
  }
  let pk = 0;
  for (const v of note(60, P(), 0.3, 1)[0]) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk > 0.1 && pk < 0.5, `one forte note peaks at ${pk.toFixed(3)}`);
});
test('CPU: ten voices, a held bunch train, faster than real time ×4', () => {
  const e = new CavityEngine(FS);
  e.setParams(P({ current: 0.5, cells: 12, qhom: 1e10 }));
  for (const k of [36, 43, 48, 52, 55, 60, 64, 67, 72, 76]) e.noteOn(k, 0.8);
  const bL = new Float32Array(128), bR = new Float32Array(128), sec = 2, t0 = performance.now();
  for (let s = 0; s < FS * sec; s += 128) e.process(bL, bR, 128);
  const x = (sec * 1000) / (performance.now() - t0);
  assert.ok(x > 4, `×${x.toFixed(1)} real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
