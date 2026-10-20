// Pyrophone checks. Run: node test/pyrophone-tests.mjs
//
// The model against independent results (published eigenvalues, closed forms,
// Rayleigh's criterion, Kirchhoff's wall loss), then the engine against the
// model (pitch, growth, decay, limit-cycle amplitude, both thresholds of the
// hysteresis loop, the spectrum), then the advertised effects, level,
// stability and CPU. The model and the engine are the C++ (native/instruments/pyrophone), built
// as WebAssembly: the model's functions through pyrophone-wasm.js.

import assert from 'node:assert/strict';
import { weakRoot, betaOn, T_HOT, GAIN } from '../pyrophone/src/pyrophone-model.js';
import { INSTRUMENT } from '../pyrophone/src/pyrophone-instrument.js';
import { wasmModel } from '../pyrophone/src/pyrophone-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS } from '../pyrophone/src/pyrophone-params.js';
import { keyFreq } from '../shared/dsp.js';
import { renderEngine } from '../tools/audio-util.mjs';

const PyrophoneEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel(), { root, steadyY, orbitAt, orbitSpectrum, heat } = model;
const tube = (P) => model.tube({ damp: 1, ...P }), bifurcation = (P) => model.tubeTuning(P).bif, tuning = (P) => model.tubeTuning(P).tune;
// King's law's describing function: the first harmonic of the C++'s heat release for u_f = U cos θ,
// relative to the linear one, D(U) = (1/πU) ∫ heat(U cos θ) cos θ dθ / (√3/2) (midpoint rule)
function describing(U, M = 2048) {
  let s = 0;
  for (let i = 0; i < M; i++) { const th = ((i + 0.5) * 2 * Math.PI) / M; s += heat(U * Math.cos(th)) * Math.cos(th); }
  return (2 * s) / (M * U * GAIN);
}

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, drift: 0, ...o });
const cents = (r) => 1200 * Math.log2(r);
const BIF = bifurcation(DEFAULTS), F1 = BIF.fam[0], BH = F1.hopf.beta; // BH: the threshold, the unit of the flame power

// Run the engine in 128-sample blocks, like the AudioWorklet. events: [t, fn(engine)];
// probe(engine, t) is called every `every` seconds. Returns both channels and the engine.
function run(params, sec, events = [], probe = null, every = 0.01) {
  const e = new PyrophoneEngine(FS);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.slice().sort((a, b) => a[0] - b[0]);
  let j = 0, next = 0;
  for (let s = 0; s < n; s += bl) {
    const t = s / FS;
    while (j < ev.length && ev[j][0] <= t) ev[j++][1](e);
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    if (probe && t >= next) { probe(e, t); next += every; }
  }
  const out = L.map((v, i) => v + R[i]);
  return { L, R, out, e };
}
const note = (t, key, vel) => [t, (e) => e.noteOn(key, vel)];
const off = (t, key) => [t, (e) => e.noteOff(key)];
const set = (t, o, base) => [t, (e) => e.setParams({ ...base, ...o })];
// Frequency of the component near f in x[a, b): phase advance of the demodulated
// signal, first over a short span (unambiguous to ±23 Hz), then over the whole span.
function freq(x, f, a, b) {
  const m = 2048, ph = (s, fr) => { const w = (2 * Math.PI * fr) / FS; let re = 0, im = 0; for (let i = s; i < s + m; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - s)) / m); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); } return Math.atan2(im, re); };
  const wrap = (d) => d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
  const f1 = f + (wrap(ph(a + 1024, f) - ph(a, f)) * FS) / (2 * Math.PI * 1024);
  return f1 + (wrap(ph(b - m, f1) - ph(a, f1)) * FS) / (2 * Math.PI * (b - m - a));
}
function level(x, f, a, b) { // Hann-windowed amplitude at f
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
function peakFreq(x, a, b, lo, hi) { // strongest component between lo and hi Hz (1 Hz grid, then refined)
  let best = lo, bl = 0;
  for (let f = lo; f <= hi; f += 1) { const v = level(x, f, a, b); if (v > bl) { bl = v; best = f; } }
  return freq(x, best, a, b);
}
const peak = (r) => { let m = 0; for (const x of [r.L, r.R]) for (const v of x) m = Math.max(m, Math.abs(v)); return m; };
const slopeFit = (pts) => { // least-squares slope of ln(amp) against t
  const n = pts.length, mt = pts.reduce((s, p) => s + p[0], 0) / n, ml = pts.reduce((s, p) => s + Math.log(p[1]), 0) / n;
  let num = 0, den = 0;
  for (const [t, a] of pts) { num += (t - mt) * (Math.log(a) - ml); den += (t - mt) ** 2; }
  return num / den;
};

console.log('physics');
test('linear stability reproduces Magri & Juniper (2013): σ = −0.0056 + 3.1848i at β = 0.1, 0.00023 + 3.3570i at β = 0.5', () => {
  // their damping, c₁ = 0.01 and c₂ = 0.004: the bore and damping that give it (c₁ ∝ damp·a², c₂ ∝ damp/a)
  const t0 = tube({ bore: 0.05, xf: 0.25, lag: 0.01 }), r = Math.cbrt(0.01 / t0.c1 / (0.004 / t0.c2));
  const sys = tube({ bore: 0.05 * r, damp: 0.01 / (t0.c1 * r * r), xf: 0.25, lag: 0.01 });
  assert.ok(Math.abs(sys.c1 - 0.01) < 1e-12 && Math.abs(sys.c2 - 0.004) < 1e-12, `c₁ ${sys.c1}, c₂ ${sys.c2}`);
  const a = root(sys, 0, 0.1, 'taylor'), b = root(sys, 0, 0.5, 'taylor');
  assert.ok(Math.abs(a[0] + 0.0056) < 5e-5 && Math.abs(a[1] - 3.1848) < 5e-5, `${a}`);
  assert.ok(Math.abs(b[0] - 0.00023) < 5e-6 && Math.abs(b[1] - 3.3570) < 5e-5, `${b}`);
  const c = root(sys, 0, 0.5); // the exact delay e^{−sτ} instead of their 1 − sτ: τ is small, so nearly the same
  assert.ok(Math.abs(c[0] - b[0]) < 1e-4 && Math.abs(c[1] - b[1]) < 1e-3, `${c}`);
});
test('weak coupling: the exact eigenvalue matches the one-mode Rayleigh formula to O(ζ₁) as β → 0', () => {
  const sys = tube(P()), s0 = root(sys, 0, 0), w0 = weakRoot(sys, 1, 0);
  for (const b of [0.002, 0.01]) { // compare the shifts caused by the flame
    const s = root(sys, 0, b), w = weakRoot(sys, 1, b);
    const err = Math.hypot(s[0] - s0[0] - (w[0] - w0[0]), s[1] - s0[1] - (w[1] - w0[1])) / Math.hypot(w[0] - w0[0], w[1] - w0[1]);
    assert.ok(err < 2 * sys.zeta[0], `β = ${b}: relative error ${err.toFixed(3)}`);
  }
});
test("Rayleigh's criterion: modes 1 and 2 are driven exactly where sin(2jπx_f)·sin(jπτ) > 0", () => {
  for (const lag of [0.25, 0.7]) for (let xf = 0.03; xf < 1; xf += 0.04) {
    const sys = tube(P({ xf, lag }));
    for (const j of [1, 2]) {
      const s = root(sys, j - 1, 0.01), drive = s[0] + sys.zeta[j - 1] / 2, r = Math.sin(2 * j * Math.PI * xf) * Math.sin(j * Math.PI * lag);
      if (Math.abs(r) > 0.05) assert.equal(Math.sign(drive), Math.sign(r), `mode ${j}, x_f ${xf.toFixed(2)}, τ ${lag}`);
    }
  }
});
test("King's law makes the Hopf bifurcation subcritical: D(U) = 1 + (27/32)U² + …, D(1/3) = 8√2/(3π)", () => {
  for (const U of [0.02, 0.05]) assert.ok(Math.abs(describing(U) - (1 + (27 / 32) * U * U)) < 3 * U ** 4, `${U}`);
  assert.ok(Math.abs(describing(1 / 3, 1 << 15) - (8 * Math.SQRT2) / (3 * Math.PI)) < 1e-5);
  assert.ok(describing(0.6) < 1, 'and falls once the flow at the flame reverses');
});
test('harmonic balance: the fold sits at the flow reversal, below the Hopf point by ≈ 1/max D', () => {
  let Dmax = 0;
  for (let U = 0.3; U < 0.37; U += 0.0005) Dmax = Math.max(Dmax, describing(U));
  const r = F1.fold.beta / F1.hopf.beta;
  assert.ok(Math.abs(r - 1 / Dmax) < 0.05, `multi-mode ${r.toFixed(3)} vs one-mode ${(1 / Dmax).toFixed(3)}`);
  assert.ok(Math.abs(F1.fold.y - 1 / 3) < 0.03, `fold amplitude ${F1.fold.y}`);
  assert.ok(Math.abs(root(BIF.sys, 0, F1.hopf.beta)[0]) < 1e-9 && F1.pts[0].beta > F1.fold.beta, 'mode 1\'s growth rate is zero at the Hopf point');
});
test("losses: radiation ∝ (πa/L)²j², wall ∝ √j/bore, matching Kirchhoff's boundary-layer formula", () => {
  const damping = (o) => tube(P(o)), a = damping({ bore: 0.02 }), b = damping({ bore: 0.04 });
  assert.ok(Math.abs(b.c1 / a.c1 - 4) < 1e-12 && Math.abs(a.c2 / b.c2 - 2) < 1e-12);
  // a 0.6 m tube of radius 2 cm at 400 K: σ = (1/a)√(ων/2)(1 + (γ−1)/√Pr), Pr = 0.69 (air at 400 K)
  const c = Math.sqrt(1.4 * 287 * T_HOT), w = (Math.PI * c) / 0.6, sigma = ((1 + 0.4 / Math.sqrt(0.69)) / 0.02) * Math.sqrt((w * 2.6e-5) / 2);
  const zw = damping({ bore: 0.02 / 0.6 }).c2;
  assert.ok(Math.abs(zw / 2 - (sigma * 0.6) / c) / (zw / 2) < 0.02, `${zw / 2} vs ${(sigma * 0.6) / c}`);
});

console.log('engine');
test('every key C3–C6 settles within ±3 ¢ of equal temperament (auto-tuned, warmed up)', () => {
  let worst = 0, wk = 0;
  for (let k = 48; k <= 84; k++) {
    const f0 = keyFreq(k), { out } = run(P({ drift: 4, warm: 0.15 }), 1.6, [note(0, k, 0.7)]);
    const c = cents(freq(out, f0, Math.round(1.1 * FS), out.length) / f0);
    if (Math.abs(c) > worst) { worst = Math.abs(c); wk = k; }
  }
  assert.ok(worst < 3, `worst ${worst.toFixed(2)} ¢ (key ${wk})`);
});
test('the keyboard\'s tuning cuts the tubes: at A = 415 Hz E4 settles at 440·2^(−5/12)·415/440; in ¼-comma meantone E4 at −3.42 ¢, C4 at +10.26 ¢ and A4 at 440 Hz (±3 ¢)', () => {
  for (const [o, k, f0] of [[{ pitch: 415 }, 64, 440 * 2 ** (-5 / 12) * 415 / 440], [{ temperament: 'meantone' }, 64, keyFreq(64) * 2 ** (-3.42 / 1200)], [{ temperament: 'meantone' }, 60, keyFreq(60) * 2 ** (10.26 / 1200)], [{ temperament: 'meantone' }, 69, 440]]) {
    const { out } = run(P({ drift: 4, warm: 0.15, ...o }), 1.6, [note(0, k, 0.7)]), c = cents(freq(out, f0, Math.round(1.1 * FS), out.length) / f0);
    assert.ok(Math.abs(c) < 3, `${JSON.stringify(o)}, key ${k}: ${c.toFixed(2)} ¢ from ${f0.toFixed(2)} Hz`);
  }
});
test('the keys past C3–C6, A0 to C8 (the top keys keep only the modes below 0.45 fs): each settles within ±3 ¢, at 44.1 and 48 kHz; at the top of the flame power, pressed, they sing their note, not a scream', () => {
  const out = [], top = GROUPS.flatMap((g) => g.params).find((p) => p.id === 'flame').max;
  for (const [k, fs] of [[21, 48000], [24, 48000], [30, 48000], [40, 48000], [90, 48000], [96, 44100], [102, 48000], [108, 48000], [108, 44100]]) {
    const f0 = keyFreq(k), sec = k < 36 ? 4 : 1.6, e = new PyrophoneEngine(fs), n = Math.round(sec * fs), x = new Float64Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
    e.setParams(P({ drift: 4, warm: 0.15 })); e.noteOn(k, 0.7);
    for (let s = 0; s < n; s += 128) { e.process(bL, bR, 128); for (let i = 0; i < 128 && s + i < n; i++) x[s + i] = bL[i] + bR[i]; }
    // (freq() reads at 48 kHz: rescale)
    const c = cents((freq(x, (f0 * FS) / fs, n - Math.round(0.5 * fs), n) * fs) / FS / f0), N = e.voices[0].N;
    assert.ok(Math.abs(c) < 3 && Number.isFinite(peak({ L: x, R: x })), `key ${k} at ${fs}: ${c.toFixed(2)} ¢ (${N} modes)`);
    out.push(`${k}${fs === 44100 ? ' (44.1)' : ''}: ${c.toFixed(1)} ¢, ${N} modes`);
  }
  for (const k of [96, 102, 108]) {
    const r = run(P({ flame: top }), 1.5, [note(0, k, 1), [0.3, (e) => e.handle({ type: 'pressure', value: 1, key: k })]]), f0 = keyFreq(k);
    const f = peakFreq(r.out, FS, 1.5 * FS, 0.5 * f0, Math.min(20000, 5 * f0));
    assert.ok(Math.abs(cents(f / f0)) < 50 && peak(r) < 0.6, `key ${k}: strongest ${f.toFixed(0)} Hz, peak ${peak(r).toFixed(3)}`);
  }
  console.log(`        ${out.join('; ')}`);
});
test('onset grows at the linear growth rate of the model', () => {
  const k = 72, Pm = P({ noise: 2e-4 }), amps = [];
  const { e } = run(Pm, 0.4, [note(0, k, 0.7)], (eng, t) => amps.push([t, eng.voices[0].amp]), 0.002);
  const s = root(BIF.sys, 0, betaOn(Pm, 0.7, BH)), pred = (s[0] * 2 * Math.PI * keyFreq(k)) / e.voices[0].W;
  const slope = slopeFit(amps.filter(([t, a]) => t > 0.06 && a > 2e-3 && a < 3e-2)); // after the start-up transient, before saturation
  assert.ok(Math.abs(slope / pred - 1) < 0.03, `measured ${slope.toFixed(2)}/s, theory ${pred.toFixed(2)}/s`);
});
test('after release the tube rings down at the acoustic damping rate ζ₁/2', () => {
  const k = 67, amps = [];
  const { e } = run(P({ keyup: 0 }), 1.4, [note(0, k, 0.7), off(0.8, k)], (eng, t) => eng.voices[0] && t > 0.85 && amps.push([t, eng.voices[0].amp, eng.voices[0].W]), 0.004);
  const s0 = root(BIF.sys, 0, 0), pred = (s0[0] * 2 * Math.PI * keyFreq(k)) / amps[0][2];
  const slope = slopeFit(amps.filter(([, a]) => a < 0.05 && a > 2e-3));
  void e;
  assert.ok(Math.abs(slope / pred - 1) < 0.03, `measured ${slope.toFixed(2)}/s, theory ${pred.toFixed(2)}/s`);
});
test('steady amplitude equals the harmonic-balance limit cycle at three velocities', () => {
  for (const v of [0.1, 0.5, 1]) {
    const Pm = P({ noise: 0.002 }), y = steadyY(BIF, betaOn(Pm, v, BH));
    let a = 0, n = 0;
    run(Pm, 1.2, [note(0, 76, v)], (eng, t) => { if (t > 0.8) { a += eng.voices[0].amp; n++; } });
    assert.ok(Math.abs(a / n / y - 1) < 0.02, `v ${v}: engine ${(a / n).toFixed(4)}, model ${y.toFixed(4)}`);
  }
});
test('hysteresis: a silent tube starts above the Hopf point, a singing one stops below the fold (both ±3 %)', () => {
  // flames fully apart (v = 1), so β = K; C6's short acoustic time makes the thresholds quick to probe
  const bH = F1.hopf.beta, bF = F1.fold.beta, k = 84;
  const fromSilence = (b) => run(P({ flame: b / BH, noise: 0.002 }), 1.5, [note(0, k, 1)]).e.voices[0].amp;
  const fromSinging = (b) => { const base = P({ flame: 0.15 / BH, noise: 0.002 }); return run(base, 1.6, [note(0, k, 1), set(0.4, { flame: b / BH }, base)]).e.voices[0].amp; };
  assert.ok(fromSilence(0.97 * bH) < 0.01, 'just below the Hopf point a silent tube stays silent');
  assert.ok(fromSilence(1.08 * bH) > 0.3, 'just above it, it starts');
  assert.ok(fromSinging(0.97 * bH) > 0.3 && fromSinging(1.03 * bF) > 0.3, 'a singing tube keeps singing below the Hopf point, down to the fold');
  assert.ok(fromSinging(0.97 * bF) < 0.01, 'and stops just below the fold');
});
test('noise-induced triggering: in the bistable band, strong turbulence kicks a silent tube into song', () => {
  const b = 0.985 * F1.hopf.beta, amp = (noise) => run(P({ flame: b / BH, noise }), 1.5, [note(0, 84, 1)]).e.voices[0].amp;
  const calm = amp(0.004), rough = amp(0.1);
  assert.ok(calm < 0.01 && rough > 0.3, `turbulence 0.4 %: ${calm.toFixed(4)}, 10 %: ${rough.toFixed(3)}`);
});
test("flame position (Rayleigh): ⅓ sings the note, ⅔ the octave, ⅞ nothing (one flame, β = 0.3, moved along the tube)", () => {
  const f0 = keyFreq(60), dom = (xf) => { // the flame power is in units of each position's own threshold: hold β fixed instead
    const bH = tuning(P({ xf })).betaH, r = run(P({ xf, flame: 0.3 / bH }), 2, [note(0, 60, 1)]);
    return [peakFreq(r.out, FS, 2 * FS, 200, 600) / f0, peak(r)];
  };
  const [a, pa] = dom(1 / 3), [b] = dom(2 / 3), [, c] = dom(0.875);
  assert.ok(Math.abs(a - 1) < 0.003, `x_f = 1/3: ${a.toFixed(4)} × f`);
  assert.ok(Math.abs(b - 2) < 0.1, `x_f = 2/3: ${b.toFixed(4)} × f`);
  assert.ok(c < 0.1 * pa, `x_f = 7/8: only the flames' breath (peak ${c.toFixed(3)} vs ${pa.toFixed(3)} singing)`);
});
test('the flame at ⅓ sits on the pressure node of mode 3: no 3rd harmonic; moved to 0.4, a strong one', () => {
  const f0 = keyFreq(60), h = (xf) => { const { out } = run(P({ xf }), 1.5, [note(0, 60, 0.8)]); return 20 * Math.log10(level(out, 3 * f0, FS, 1.5 * FS) / level(out, f0, FS, 1.5 * FS)); };
  const a = h(1 / 3), b = h(0.4);
  assert.ok(a < -40 && b > -20, `H3: ${a.toFixed(1)} dB at ⅓, ${b.toFixed(1)} dB at 0.4`);
});
test('the radiated spectrum matches the limit cycle at the top mouth and side-on (where the even modes cancel)', () => {
  const k = 64, f0 = keyFreq(k), pt = orbitAt(BIF.sys, F1, betaOn(DEFAULTS, 0.8, BH));
  for (const listen of [0, 1]) {
    const { out } = run(P({ listen, noise: 0.002 }), 1.5, [note(0, k, 0.8)]), pred = orbitSpectrum(BIF.sys, pt, listen);
    for (const h of [2, 4, 5, 7]) {
      const dm = 20 * Math.log10(level(out, h * f0, FS, 1.5 * FS) / level(out, f0, FS, 1.5 * FS)), dp = 20 * Math.log10(pred[h - 1] / pred[0]);
      assert.ok(Math.abs(dm - dp) < 1.5, `listen ${listen}, H${h}: engine ${dm.toFixed(1)} dB, model ${dp.toFixed(1)} dB`);
    }
  }
  const drop = 20 * Math.log10(orbitSpectrum(BIF.sys, pt, 1)[1] / orbitSpectrum(BIF.sys, pt, 0)[1]) - 20 * Math.log10(orbitSpectrum(BIF.sys, pt, 1)[0] / orbitSpectrum(BIF.sys, pt, 0)[0]);
  assert.ok(drop < -12, `side-on, the octave falls ${drop.toFixed(1)} dB`);
});
test('warm-up: a cold tube starts flat by 600·log₂(T/(T−ΔT)) ¢ and settles with the warm-up time', () => {
  const dT = 30, tw = 1, k = 67, f0 = keyFreq(k);
  const { out } = run(P({ drift: dT, warm: tw, noise: 0.004 }), 3.2, [note(0, k, 1)]);
  const at = (t) => cents(freq(out, f0, Math.round((t - 0.06) * FS), Math.round((t + 0.06) * FS)) / f0);
  const theory = (t) => 600 * Math.log2((T_HOT - dT * Math.exp(-t / tw)) / T_HOT);
  for (const t of [0.4, 1, 2, 3]) assert.ok(Math.abs(at(t) - theory(t)) < 1, `t = ${t}: ${at(t).toFixed(2)} ¢ vs ${theory(t).toFixed(2)} ¢`);
});
test('without auto-tune, playing harder pulls the pitch as the limit cycle predicts', () => {
  const Pm = P({ autotune: false, noise: 0.002 }), tn = tuning(Pm), f0 = keyFreq(69);
  const c = (v) => { const { out } = run(Pm, 1.2, [note(0, 69, v)]); return cents(freq(out, f0, 0.8 * FS, 1.2 * FS) / f0); };
  const W = (v) => { const x = betaOn(Pm, v, BH) / tn.db, i = Math.floor(x); return tn.Ws[i] + (x - i) * (tn.Ws[i + 1] - tn.Ws[i]); };
  const meas = c(1) - c(0.2), pred = cents(W(1) / W(0.2));
  assert.ok(pred > 2 && Math.abs(meas - pred) < 0.5, `measured ${meas.toFixed(2)} ¢, predicted ${pred.toFixed(2)} ¢`);
});

console.log('level, stability, cost');
test('a forte note peaks 0.1–0.5; a six-note forte chord stays under 1', () => {
  for (const k of [21, 33, 48, 60, 72, 84, 96, 108]) {
    const pk = peak(run(P(), 1.5, [note(0, k, 1)]));
    assert.ok(pk > 0.1 && pk < 0.5, `${k}: ${pk.toFixed(3)}`);
  }
  const pk = peak(run(P(), 1.5, [48, 55, 64, 71, 74, 79].map((k) => note(0, k, 1))));
  assert.ok(pk < 1, `chord ${pk.toFixed(3)}`);
});
test('every parameter at its min and max: finite, bounded output; released tubes fall silent', () => {
  const ranges = GROUPS.flatMap((g) => g.params).filter((p) => p.type !== 'checkbox' && p.id !== 'volume' && p.id !== 'room');
  for (const p of ranges) for (const v of [p.min, p.max]) {
    const Pm = { ...DEFAULTS, [p.id]: v };
    const r = run(Pm, 4, [note(0, 50, 1), note(0, 67, 0.6), note(0.05, 84, 1), off(1.2, 50), off(1.2, 67), off(1.2, 84)]);
    for (const x of r.out) assert.ok(Number.isFinite(x), `${p.id} = ${v}: NaN`);
    const pk = peak(r);
    // (the loudest: a 270° flame lag, where the tube sings in mode 5, five times the key's pitch)
    assert.ok(pk < 2, `${p.id} = ${v}: peak ${pk.toFixed(2)}`);
    // with the key-up power in the bistable band, singing tubes are meant to keep singing
    if (!(p.id === 'keyup' && v > 0.9)) assert.ok(r.e.voiceCount() === 0 && r.out[r.out.length - 1] === 0, `${p.id} = ${v}: ${r.e.voiceCount()} tubes left`);
  }
});
test('regression: overdamped upper modes (widest bore, most damping) are integrated exactly, without NaN', () => {
  // was: ζ/2 > jπ for modes 8–10 made √(ω² − ζ²/4) NaN
  const Pm = P({ bore: 0.15, damp: 4 }), sys = tube(Pm);
  assert.ok(sys.zeta[9] / 2 > sys.w[9], 'mode 10 is overdamped here');
  const r = run(Pm, 2, [note(0, 60, 1), note(0, 72, 1), off(1.5, 60), off(1.5, 72)]), v = r.e;
  assert.ok(r.out.every(Number.isFinite) && peak(r) > 0.05, `finite, and the tubes sing (peak ${peak(r).toFixed(3)})`);
  // the one-step matrices against the exact solution from the characteristic roots
  const e = new PyrophoneEngine(FS); e.setParams(Pm); e.noteOn(60, 1);
  const tb = e.voices[0]; e.process(new Float32Array(128), new Float32Array(128), 128);
  for (const j of [0, 7, 9]) {
    const h = tb.h, s = sys.zeta[j] / 2, w = sys.w[j], d = s * s - w * w;
    // η(h) for η(0) = 1, η̇(0) = 0 and for η(0) = 0, η̇(0) = 1
    let m11, m12;
    if (d > 0) { const q = Math.sqrt(d), r1 = -s + q, r2 = -s - q; m11 = (r1 * Math.exp(r2 * h) - r2 * Math.exp(r1 * h)) / (r1 - r2); m12 = (Math.exp(r1 * h) - Math.exp(r2 * h)) / (r1 - r2); }
    else { const q = Math.sqrt(-d); m11 = Math.exp(-s * h) * (Math.cos(q * h) + (s / q) * Math.sin(q * h)); m12 = (Math.exp(-s * h) * Math.sin(q * h)) / q; }
    assert.ok(Math.abs(tb.m11[j] - m11) < 1e-12 && Math.abs(tb.m12[j] - m12) < 1e-12 * h, `mode ${j + 1}: ${tb.m11[j]} vs ${m11}, ${tb.m12[j]} vs ${m12}`);
  }
  void v;
});
test('regression: the flame power is in units of the threshold, so damping and bore no longer decide between silence and a scream', () => {
  // was (power as an absolute β): damping ×0.5 at full power screamed (rms ×4, a six-note chord peaked at 4.95);
  // the widest bore or the most damping left every key silent at the default power
  const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
  const harmonic = (out, f0) => { // share of the power in the harmonics of the note
    const a = 2 * FS, b = 3 * FS, f = peakFreq(out, a, b, 0.97 * f0, 1.03 * f0), n = b - a;
    let hs = 0; for (let h = 1; h <= 10; h++) hs += (2 * level(out, h * f, a, b) / (n / 2)) ** 2 / 2;
    return hs / rms(out, a, b) ** 2;
  };
  const ref = rms(run(P(), 3, [note(0, 60, 1)]).out, 2 * FS, 3 * FS);
  for (const damp of [0.5, 4]) {
    const { out } = run(P({ damp, flame: 6 }), 3, [note(0, 60, 1)]), h = harmonic(out, keyFreq(60)), l = rms(out, 2 * FS, 3 * FS);
    assert.ok(h > 0.9 && l < 1.6 * ref, `damping × ${damp}, full power: ${(100 * h).toFixed(0)} % harmonic, rms ${(l / ref).toFixed(2)}× the default`);
  }
  const chord = peak(run(P({ damp: 0.5, flame: 6 }), 2, [48, 55, 64, 71, 74, 79].map((k) => note(0, k, 1))));
  assert.ok(chord < 1.25, `six-note chord, damping × 0.5, full power: peak ${chord.toFixed(2)}`);
  for (const o of [{ bore: 0.15 }, { damp: 4 }]) {
    const pk = peak(run(P(o), 2, [note(0, 60, 0.7)]));
    assert.ok(pk > 0.1, `${JSON.stringify(o)}, default power: peak ${pk.toFixed(3)} (it sings)`);
  }
});
test('regression: a tube that remembers its note after release stays hot, and in tune', () => {
  // was: warm-up followed the key, so a released tube still singing drifted flat (−14 ¢; −69 ¢ with cold glass)
  // After release it sings on at the key-up gain, whose limit cycle is a little lower (the
  // flame's reactance raises W less): that step is the model's, W(β_up)/W(β_down). Then no drift.
  const tn = tuning(DEFAULTS), Wt = (b) => { const x = b / tn.db, i = Math.floor(x); return tn.Ws[i] + (x - i) * (tn.Ws[i + 1] - tn.Ws[i]); };
  const step = cents(Wt(0.93 * BH) / Wt(betaOn(DEFAULTS, 0.8, BH, tn.betaMax)));
  for (const [dT, tw] of [[4, 1], [30, 3]]) { // the default, and cold glass (still warming when released)
    const k = 64, f0 = keyFreq(k), { out, e } = run(P({ keyup: 0.93, drift: dT, warm: tw }), 11, [note(0, k, 0.8), off(5, k)]);
    const c = (t) => cents(freq(out, f0, Math.round((t - 0.2) * FS), Math.round((t + 0.2) * FS)) / f0);
    const warm = (t) => 600 * Math.log2((T_HOT - dT * Math.exp(-t / tw)) / T_HOT); // c ∝ √T, warming all along
    const ts = [4.5, 5.5, 8, 10.5], got = ts.map(c), want = ts.map((t) => warm(t) + (t > 5 ? step : 0));
    assert.ok(e.voices.length === 1 && got.every((x, i) => Math.abs(x - want[i]) < 1), `ΔT ${dT} K: ${got.map((x) => x.toFixed(1)).join(', ')} ¢ vs ${want.map((x) => x.toFixed(1)).join(', ')} ¢ (released at 5 s)`);
  }
});
test('chords: six forte notes stay under 1 at the default flame power, and under 1.25 at the top of its range', () => {
  for (const power of [1.5, 3.4, 6]) {
    const pk = peak(run(P({ flame: power }), 2, [48, 55, 64, 71, 74, 79].map((k) => note(0, k, 1))));
    assert.ok(pk < (power > 4 ? 1.25 : 1), `K = ${power}: peak ${pk.toFixed(2)}`);
  }
});
test('seeded random combinations of parameter extremes at 44.1 and 48 kHz: no NaN, bounded output', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'velocity'].includes(q.id));
  let seed = 12345, worst = { pk: 0 };
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const fs of [44100, 48000]) for (let c = 0; c < 10; c++) {
    const Pm = { ...DEFAULTS };
    for (const q of sliders) {
      if (rnd() < 0.5) continue;
      Pm[q.id] = q.type === 'checkbox' ? rnd() < 0.5 : rnd() < 0.5 ? q.min : q.max;
    }
    if (Pm.keyup > 0.9) Pm.keyup = 0.2; // (in the bistable band, tubes are meant to sing on)
    const e = new PyrophoneEngine(fs); e.setParams(Pm);
    const ev = [];
    [50, 57, 64, 71, 84].forEach((k, i) => ev.push([0.02 * i, 'on', k, 1], [0.02 * i + 0.06, 'on', k, 1], [1.2, 'off', k]));
    const [L, R] = renderEngine(e, 2.5, ev, fs);
    let pk = 0;
    for (let i = 0; i < L.length; i++) { assert.ok(Number.isFinite(L[i] + R[i]), `${fs} Hz ${JSON.stringify(Pm)}: NaN`); pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    if (pk > worst.pk) worst = { pk, Pm, fs };
  }
  // five notes struck twice at full velocity; the loudest are tubes whose flame sits at an end
  // or whose lag is near 270°, singing in a high mode (several times the key's pitch)
  assert.ok(worst.pk < 3, `${worst.fs} Hz: peak ${worst.pk.toFixed(2)} with ${JSON.stringify(worst.Pm)}`);
  console.log(`        loudest of 20: ${worst.pk.toFixed(2)}`);
});
test('Quality: nothing to trim (every tube sings by its own modes and flame; released ones already fade once silent): Medium and Low play 24 held tubes exactly as High', () => {
  const render = (quality) => {
    const e = new PyrophoneEngine(FS); e.setQuality(quality); e.setParams(P());
    for (let i = 0; i < 24; i++) e.noteOn(36 + 2 * i, 0.8);
    const L = new Float32Array(128), R = new Float32Array(128), out = new Float32Array(0.5 * FS);
    for (let s = 0; s < out.length; s += 128) { e.process(L, R, 128); out.set(L.subarray(0, Math.min(128, out.length - s)), s); }
    return out;
  };
  const hi = render('high');
  for (const quality of ['medium', 'low']) { const q = render(quality); for (let i = 0; i < hi.length; i++) if (q[i] !== hi[i]) throw new Error(`${quality} differs at sample ${i}`); }
});
test('CPU: 10 tubes render in well under 30 % of real time', () => {
  const e = new PyrophoneEngine(FS);
  e.setParams(P());
  for (const k of [48, 52, 55, 60, 64, 67, 71, 72, 76, 79]) e.noteOn(k, 0.8);
  const L = new Float32Array(128), R = new Float32Array(128), sec = 4, t0 = performance.now();
  for (let s = 0; s < sec * FS; s += 128) e.process(L, R, 128);
  const load = (performance.now() - t0) / (sec * 1000);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} % of real time`);
  console.log(`        (${(100 * load).toFixed(1)} % of real time for 10 tubes)`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
