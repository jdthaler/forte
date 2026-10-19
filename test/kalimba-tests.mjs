// Kalimba checks. Run: node test/kalimba-tests.mjs
//
// The tine model against beam theory: the clamped–free limit, Chapman's analytic special case,
// an independent finite-element beam (written here), the cantilever's static deflection and its
// effective masses. The box against the two-oscillator model's closed forms, and the engine's
// box in time against the box's frequency response. Then the engine: pitch, overtones, decay,
// the pluck point, the thumb, the hole, the caps, the fingers, level and CPU. Model and engine
// are the C++ (native/instruments/kalimba), built as WebAssembly.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../kalimba/src/kalimba-instrument.js';
import { wasmModel } from '../kalimba/src/kalimba-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { genEig } from '../shared/linalg.js';

const KalimbaEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (±${tol})`);

// Render through the engine, 128-sample blocks like the AudioWorklet: events [t, 'on'|'off'|'sustain', key, vel].
function render(params, sec, events) {
  const e = new KalimbaEngine(FS);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * FS), ...r]).sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += bl) {
    while (k < ev.length && ev[k][0] < s + bl) {
      const [, type, key, vel] = ev[k++];
      if (type === 'on') e.noteOn(key, vel); else if (type === 'off') e.noteOff(key); else if (type === 'sustain') e.setSustain(key);
    }
    e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return L;
}
const note = (key, params = P(), vel = 0.7, sec = 1) => render(params, sec, [[0, 'on', key, vel]]);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const db = (x) => 20 * Math.log10(x);

// An independent model: the tine as Hermite-cubic Euler–Bernoulli beam elements over ξ in [−r, 1]
// (EI = μ = 1, front length 1), clamped at −r, pinned at 0, free at 1. Returns its βL (λ = β⁴)
// and a static solver for a unit point load at a node.
function femBeam(r, nFront = 60) {
  const nBack = r > 0 ? Math.max(4, Math.round(nFront * r)) : 0;
  const xs = [];
  if (nBack) for (let i = 0; i <= nBack; i++) xs.push(-r + (r * i) / nBack);
  else xs.push(0);
  for (let i = 1; i <= nFront; i++) xs.push(i / nFront);
  const N = 2 * xs.length, K = new Float64Array(N * N), M = new Float64Array(N * N);
  for (let e = 0; e + 1 < xs.length; e++) {
    const l = xs[e + 1] - xs[e];
    const k = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]].map((r) => r.map((v) => v / l ** 3));
    const m = [[156, 22 * l, 54, -13 * l], [22 * l, 4 * l * l, 13 * l, -3 * l * l], [54, 13 * l, 156, -22 * l], [-13 * l, -3 * l * l, -22 * l, 4 * l * l]].map((r) => r.map((v) => (v * l) / 420));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { K[(2 * e + i) * N + 2 * e + j] += k[i][j]; M[(2 * e + i) * N + 2 * e + j] += m[i][j]; }
  }
  const bridge = xs.indexOf(0), fixed = new Set([0, 1, 2 * bridge]);
  const free = [...Array(N).keys()].filter((d) => !fixed.has(d)), n = free.length;
  const Kr = new Float64Array(n * n), Mr = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { Kr[i * n + j] = K[free[i] * N + free[j]]; Mr[i * n + j] = M[free[i] * N + free[j]]; }
  const beta = () => Array.from(genEig(Kr, Mr, n, 0).lambda.slice(0, 6), (l) => l ** 0.25);
  // K u = f by Gaussian elimination; returns w at every node
  const deflect = (xp) => {
    const node = xs.findIndex((x) => Math.abs(x - xp) < 1e-9), A = Array.from({ length: n }, (_, i) => [...Kr.subarray(i * n, i * n + n), free[i] === 2 * node ? 1 : 0]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
      [A[c], A[p]] = [A[p], A[c]];
      for (let i = c + 1; i < n; i++) { const f = A[i][c] / A[c][c]; for (let j = c; j <= n; j++) A[i][j] -= f * A[c][j]; }
    }
    const u = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * u[j]; u[i] = s / A[i][i]; }
    return xs.map((x, i) => [x, fixed.has(2 * i) ? 0 : u[free.indexOf(2 * i)]]);
  };
  return { beta, deflect };
}

console.log('the tine');
test('clamped at the bridge (no back length): βL solves cos βL cosh βL = −1', () => {
  const { beta } = model.beam(0);
  for (const b of beta.slice(0, 6)) assert.ok(Math.abs(Math.cos(b) * Math.cosh(b) + 1) < 1e-6 * Math.cosh(b), `${b}`);
  near(beta[0], 1.875104, 1e-5, 'βL₁');
  near((beta[1] / beta[0]) ** 2, 6.267, 1e-3, 'f2/f1');
});
test('back as long as the front: βL = π/2, 3π/2, 5π/2… are modes (Chapman’s analytic case)', () => {
  const { beta } = model.beam(1);
  for (const k of [1, 3, 5, 7]) assert.ok(beta.some((b) => Math.abs(b - (k * Math.PI) / 2) < 1e-7), `${k}π/2 in ${beta.map((b) => b.toFixed(5))}`);
  near((beta[2] / beta[0]) ** 2, 9, 1e-6, 'f3/f1: the 9th harmonic');
});
test('modes agree with an independent finite-element beam (back 0, 0.5, 1.12, 1.5)', () => {
  for (const r of [0, 0.5, 1.12, 1.5]) {
    const fem = femBeam(r).beta(), { beta } = model.beam(r);
    for (let n = 0; n < 5; n++) near(beta[n] / fem[n], 1, 2e-4, `r = ${r}, mode ${n + 1}`);
  }
});
test('the default tine’s first overtone is 5.3–5.9 × its fundamental, as Chapman measured', () => {
  const m = model.keyModes(60, P());
  const ratio = m[1].f / m[0].f;
  assert.ok(ratio > 5.3 && ratio < 5.9, `${ratio}`);
});
test('mode shapes are orthonormal over the whole tine, clamp to tip', () => {
  for (const r of [0, 1.12]) {
    const b = model.beam(r), N = 4000;
    for (let m = 0; m < 4; m++) for (let n = 0; n < 4; n++) {
      let s = 0;
      for (let i = 0; i < N; i++) { const x = -r + ((i + 0.5) * (1 + r)) / N; s += b.shape(m, x) * b.shape(n, x); }
      near((s * (1 + r)) / N, m === n ? 1 : 0, 2e-3, `r = ${r}: <${m}|${n}>`);
    }
  }
});
test('cantilever: effective masses 61.3 %, 18.8 %, 6.5 % of the tine; mode 2’s node at 78.3 %', () => {
  const b = model.beam(0);
  [0.6131, 0.1882, 0.0647].forEach((m, n) => near(b.area(n) ** 2, m, 1e-3, `mode ${n + 1}`));
  near(Math.abs(b.shape(1, 0.7834)), 0, 2e-3, 'mode 2 at 0.7834 L');
});
test('pushed down at the pluck point, the tine bends as beam theory says (cantilever, F x²(3p − x)/6EI)', () => {
  const p = 0.9, Q = P({ back: 0, pluck: p, thick: 1 }), t = model.tine(64, Q);
  for (const xi of [0.2, 0.5, 0.8, 0.9, 1]) {
    const x = Math.min(xi, p), y = Math.max(xi, p), exact = (t.force * t.L ** 3 * x * x * (3 * y - x)) / (6 * t.EI);
    near(model.staticDeflection(64, Q, xi) / exact, 1, 2e-3, `ξ = ${xi}`);
  }
});
test('…and as the finite-element beam says with the back segment; the thumb’s point goes down by its push', () => {
  const p = 0.9, Q = P({ back: 1.12, pluck: p }), t = model.tine(64, Q);
  for (const [xi, w] of femBeam(1.12).deflect(p).filter((_, i) => i % 9 === 0)) {
    near(model.staticDeflection(64, Q, xi), (t.force * t.L ** 3 * w) / t.EI, 3e-3 * t.depth, `ξ = ${xi.toFixed(2)}`);
  }
  near(model.staticDeflection(64, Q, p), t.depth, 1e-4 * t.depth, 'w(pluck)');
});
test('the thumb pushes soft tines 3 mm down, and stiff ones as far as 8 N takes them', () => {
  const soft = model.tine(48, P()), stiff = model.tine(84, P());
  near(soft.depth, 0.003, 1e-9, 'C3 depth'); assert.ok(soft.force < 8, `C3 force ${soft.force}`);
  near(stiff.force, 8, 1e-9, 'C6 force'); assert.ok(stiff.depth < 0.003, `C6 depth ${stiff.depth}`);
  assert.ok(model.tine(48, P({ thick: 2 })).force > 2 * soft.force, 'a thicker tine takes more force');
});
test('at release the supports carry the thumb’s force (the modes are complete)', () => {
  const Q = P({ thumb: 0.05, back: 1.12 }), t = model.tine(55, Q), m = model.keyModes(55, Q);
  near(m.reduce((s, x) => s + x.amp, 0) / t.force, 1, 0.05, 'Σ amp / F');
});
test('a raised-cosine release: half-sine pulse spectrum, flat at low f, first zero at 1.5/τ', () => {
  near(model.releaseSpectrum(10, 1e-4), 1, 1e-4, 'low f');
  assert.ok(model.releaseSpectrum(1.5 / 2e-3, 2e-3) < 1e-9, 'zero');
  near(model.releaseSpectrum(1 / 2e-3, 2e-3), Math.abs(Math.cos(Math.PI) / (1 - 4)), 1e-9, 'u = 2');
});

console.log('the box');
const V0 = 0.17 * 0.13 * 0.04;
function helmholtz(Q) {
  const V = Q.box / 1000, h = 0.004 * Math.cbrt(V / V0), r = Q.hole / 2000, A = Math.PI * r * r * (1 - Q.cover), re = Math.sqrt(A / Math.PI);
  return (343 / (2 * Math.PI)) * Math.sqrt(A / (V * (h + 1.7 * re)));
}
test('the hole on rigid walls is a Helmholtz resonator: f = (c/2π) √(A / V L_eff)', () => {
  for (const Q of [P(), P({ box: 4, hole: 40 }), P({ cover: 0.6 })]) near(model.box(Q).fH / helmholtz(Q), 1, 1e-9, `${Q.box} L, ${Q.hole} mm, ${Q.cover}`);
});
test('the top, simply supported: f₁₁ = (π/2) √(D/ρh) (1/a² + 1/b²), and its odd–odd modes in proportion', () => {
  const b = model.box(P()), s = Math.cbrt(P().box / 1000 / V0), h = 0.004 * s, D = (9e9 * h ** 3) / (12 * (1 - 0.09));
  const f = (m, n) => (Math.PI / 2) * Math.sqrt(D / (650 * h)) * ((m / (0.17 * s)) ** 2 + (n / (0.13 * s)) ** 2);
  near(b.fp / f(1, 1), 1, 1e-9, 'f11'); near(b.plate[1] / f(3, 1), 1, 1e-9, 'f31'); near(b.plate[3] / f(3, 3), 1, 1e-9, 'f33');
  near(model.box(P({ box: 0.88 * 8 })).fp / b.fp, 0.5, 1e-6, 'twice the size, an octave down');
});
test('two oscillators: f₋ f₊ = f_top f_hole and f₋² + f₊² = f_top,sealed² + f_hole² (Christensen–Vistisen)', () => {
  for (const Q of [P(), P({ hole: 50 }), P({ box: 3 })]) {
    const b = model.box(Q);
    near((b.fLo * b.fHi) / (b.fp * b.fH), 1, 1e-9, 'product');
    near((b.fLo ** 2 + b.fHi ** 2) / (b.fpSealed ** 2 + b.fH ** 2), 1, 1e-9, 'sum');
    assert.ok(b.fLo < b.fH && b.fHi > b.fpSealed, 'the pair is pushed apart');
  }
});
test('the engine’s box in time rings where the closed forms say, and matches the frequency response', () => {
  const n = 1 << 15, x = model.boxImpulse(P(), 0, 60, FS, n), b = model.box(P());
  // the spectrum of the impulse response (DFT at chosen frequencies)
  const H = (f) => { let re = 0, im = 0; for (let i = 0; i < n; i++) { const w = (2 * Math.PI * f * i) / FS; re += x[i] * Math.cos(w); im -= x[i] * Math.sin(w); } return Math.hypot(re, im) / FS; };
  const pressure = (f) => (1.2 / (4 * Math.PI)) * model.boxResponse(P(), 0, 60, f); // Pa at 1 m per N
  // (the trapezoidal rule is tuned to each mode's frequency; its bandwidths stay warped a little)
  for (const f of [120, b.fLo, 400, b.fHi, 1500, 3000, 7000]) near(db(H(f) / pressure(f)), 0, 0.5, `${f.toFixed(0)} Hz (dB)`);
  // and its peaks: the air's resonance near f₋, the top's near f₊
  const peak = (lo, hi) => { let best = lo, v = 0; for (let f = lo; f < hi; f += 0.5) { const p = pressure(f); if (p > v) { v = p; best = f; } } return best; };
  near(peak(150, 400) / b.fLo, 1, 0.03, 'air peak'); near(peak(500, 1000) / b.fHi, 1, 0.03, 'top peak');
});
test('the hole shut: the air’s resonance is gone, the top sits on the sealed cavity', () => {
  const b = model.box(P({ cover: 1 }));
  assert.ok(!b.open); near(b.fHi, b.fpSealed, 1e-9);
  const open = model.boxResponse(P(), 0, 60, model.box(P()).fLo), shut = model.boxResponse(P(), 1, 60, model.box(P()).fLo);
  assert.ok(db(open / shut) > 20, `${db(open / shut).toFixed(1)} dB more at f₋ with the hole open`);
});

console.log('the engine');
test('each key sounds its note: the fundamental stands out at keyFreq', () => {
  for (const k of [57, 60, 67, 76, 88, 96]) {
    const x = note(k, P({ fullRange: true }), 0.7, 0.8), f = keyFreq(k), a = 9600, b = a + 16384;
    assert.ok(tone(x, f, a, b) > 20 * tone(x, f * 1.04, a, b) && tone(x, f, a, b) > 20 * tone(x, f / 1.04, a, b), `key ${k}`);
  }
});
test('the first overtone sounds at the model’s ratio, and fades much sooner than the fundamental', () => {
  const x = note(67, P(), 0.8, 1.5), m = model.keyModes(67, P()), W = 8192;
  assert.ok(tone(x, m[1].f, 0, W) > 10 * tone(x, m[1].f * 1.03, 0, W), 'overtone present');
  const d1 = db(tone(x, m[0].f, FS, FS + W) / tone(x, m[0].f, 0, W)), d2 = db(tone(x, m[1].f, FS, FS + W) / tone(x, m[1].f, 0, W));
  assert.ok(d2 < d1 - 15, `fundamental ${d1.toFixed(1)} dB, overtone ${d2.toFixed(1)} dB over 1 s`);
});
test('decay: C4’s fundamental falls as its Ring time says', () => {
  const x = note(60, P({ t60: 2 }), 0.7, 2.2), f = keyFreq(60), W = 8192;
  near(db(tone(x, f, 4800 + FS, 4800 + FS + W) / tone(x, f, 4800, 4800 + W)), -30, 1, 'dB in 1 s (T60 2 s: −30)');
});
test('plucked on the first overtone’s node, the overtone is silent', () => {
  const m = model.keyModes(64, P());
  const on = note(64, P({ pluck: 0.7113 }), 0.7, 0.4), off = note(64, P({ pluck: 0.9 }), 0.7, 0.4);
  assert.ok(tone(on, m[1].f, 0, 8192) < 0.02 * tone(off, m[1].f, 0, 8192));
});
test('a soft thumb (slow release) takes the overtones away, as its pulse spectrum says', () => {
  const m = model.keyModes(60, P()), nail = note(60, P({ thumb: 0.05 }), 0.7, 0.3), flesh = note(60, P({ thumb: 1.5 / m[1].f * 1000 }), 0.7, 0.3);
  const r = (x) => tone(x, m[1].f, 0, 8192) / tone(x, m[0].f, 0, 8192);
  assert.ok(r(flesh) < 0.01 * r(nail), `${r(flesh)} vs ${r(nail)}`);
});
test('covering the hole takes the air’s boost away from the low tines (the wah)', () => {
  const open = rms(note(60, P(), 0.7, 0.5)), shut = rms(note(60, P({ cover: 1 }), 0.7, 0.5));
  assert.ok(db(open / shut) > 6, `${db(open / shut).toFixed(1)} dB`);
});
test('the caps sit still under soft notes and rattle under loud ones', () => {
  const soft = note(60, P({ buzz: 6 }), 0.05, 0.5), softBare = note(60, P(), 0.05, 0.5);
  assert.ok(soft.every((v, i) => v === softBare[i]), 'soft: not a sample different');
  const loud = note(60, P({ buzz: 6 }), 1, 0.5), bare = note(60, P(), 1, 0.5);
  const high = (x) => tone(x, 4100, 0, 12000) + tone(x, 3700, 0, 12000) + tone(x, 4500, 0, 12000);
  assert.ok(high(loud) > 3 * high(bare), `rattle above 3 kHz: ${high(loud)} vs ${high(bare)}`);
});
test('tines ring on after the key is let go; with Let ring off a finger stops them, unless the pedal is down', () => {
  const ev = [[0, 'on', 60, 0.7], [0.2, 'off', 60]];
  const ring = render(P(), 1.2, ev), finger = render(P({ ring: false }), 1.2, ev), pedal = render(P({ ring: false }), 1.2, [[0, 'sustain', true], ...ev]);
  const late = (x) => rms(x, FS, 1.2 * FS), early = rms(ring, 0, 0.2 * FS);
  assert.ok(db(late(ring) / early) > -20, `rings: ${db(late(ring) / early).toFixed(1)} dB`);
  assert.ok(db(late(finger) / early) < -60, `finger: ${db(late(finger) / early).toFixed(1)} dB`);
  assert.ok(late(pedal) > 0.5 * late(ring), 'pedal holds the finger off');
});
test('output level is sane, finite everywhere, and Panic leaves silence', () => {
  let pk = 0;
  for (let k = 21; k <= 108; k += 3) for (const v of note(k, P({ fullRange: true, buzz: 8 }), 1, 0.25)) { assert.ok(Number.isFinite(v), `key ${k}`); pk = Math.max(pk, Math.abs(v)); }
  assert.ok(pk > 0.1 && pk < 1.5, `peak ${pk}`);
  const e = new KalimbaEngine(FS); e.setParams(P({ buzz: 4 }));
  for (const k of [60, 64, 67, 72]) e.noteOn(k, 1);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let i = 0; i < 20; i++) e.process(L, R, 128);
  e.allNotesOff(); e.process(L, R, 128);
  assert.ok(L.every((v) => v === 0), 'silent after Panic');
});
test('CPU: 10 tines with 8 caps render 10× faster than real time', () => {
  const e = new KalimbaEngine(FS); e.setParams(P({ buzz: 8, fullRange: true }));
  for (let k = 0; k < 10; k++) e.noteOn(48 + 4 * k, 0.9);
  const L = new Float32Array(128), R = new Float32Array(128), n = (2 * FS) / 128, t0 = performance.now();
  for (let i = 0; i < n; i++) e.process(L, R, 128);
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `${ms.toFixed(0)} ms for 2 s`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
