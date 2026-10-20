// Wind Harp checks. Run: node test/windharp-tests.mjs
//
// The wake against independent results (Williamson & Brown's Strouhal–Reynolds fit, the van der Pol
// limit cycle by Runge–Kutta, no shedding below Re = 47); the linear analysis in its limits (de
// Langre's coupled-mode band, the uncoupled roots) and the harmonic balance against its single-mode
// form; then the engine against the model: the linear growth rates, lock-in from rest inside the
// predicted band and not outside it, the harmonic jumps at the predicted winds, the hysteresis at the
// balance's folds, the locked amplitude and its mass–damping collapse; tuning and speech on every key;
// shutters, ring-down, voices, gusts, Kircher's unison, the aeolian tone, levels, stability and CPU.
// The model and the engine are the C++ (native/instruments/windharp), built as WebAssembly: the
// model's functions through windharp-wasm.js; the linear analysis they are held to is written out in
// windharp-model.js.

import assert from 'node:assert/strict';
import {
  TAU, KEY_LO, KEY_HI, AIR, WAKE, U_REF, RE_C, keyFreq, noteName, strouhal, harmonicParams as linearParams, coupledRoots, flutterGrowth, gustSpectrum,
} from '../windharp/src/windharp-model.js';
import { INSTRUMENT } from '../windharp/src/windharp-instrument.js';
import { wasmModel } from '../windharp/src/windharp-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS, PRESETS } from '../windharp/src/windharp-params.js';
import { fft } from '../tools/audio-util.mjs';
import { TUNING_PARAMS, TUNING_KEEP } from '../shared/tuning.js';

const WindHarpEngine = await loadEngine(INSTRUMENT);
const { shedding, stringDesign, courseOffsets, lockBand, lockedAmplitude, lockedRange, homeHarmonic, massDamping, balance, lockedState } = await wasmModel();
// harmonic n of the C++'s string S in the wind U, for the linear analysis
const harmonicParams = (S, n, U) => linearParams(S, n, U, shedding(U, S.D));

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

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key, vel?] | [t, 'params', P] | [t, 'sus', on] | [t, 'press', value, key?]),
// in blocks of `bl` samples; tap(engine, t) after every block.
function run(params, events, sec, { fs = FS, seed = 1, opts = {}, tap, bl = 128, wind } = {}) {
  const e = new WindHarpEngine(fs, seed, opts);
  e.setParams(params);
  if (wind !== undefined) e.Uw = wind;
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b, c] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a, b); else if (type === 'params') e.setParams(a);
      else if (type === 'sus') e.setSustain(a); else if (type === 'press') e.handle({ type: 'pressure', value: a, key: b ?? null });
      void c;
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, (s + bl) / fs);
  }
  return { L, R, e };
}
const hold = (key, p, sec, o = {}) => run(p, [[0, 'on', key, o.vel ?? 0.7]], sec, { wind: p.wind, ...o });
const peakAbs = (r) => { let p = 0; for (const x of [r.L, r.R]) for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// the time (s) at which a key's first string first reaches half its final swing (its course's strings
// rise alike, but their sum beats, so the output's level is no measure of the start)
function onsetOf(params, key, vel, sec, fs = FS) {
  const amps = [];
  run(params, [[0, 'on', key, vel]], sec, { fs, wind: params.wind, tap: (e, t) => { const v = e.voices[0]; amps.push([t, v ? e.dominant(v).amp : 0]); } });
  const fin = amps.slice(-20).reduce((s, a) => s + a[1], 0) / 20, hit = amps.find(([, a]) => a > 0.5 * fin);
  return hit ? hit[0] : Infinity;
}
// the time (s) at which the rms over 10 ms windows first reaches half its final value
function onsetTime(x, fs = FS) {
  const W = Math.round(0.01 * fs), env = [];
  for (let a = 0; a + W <= x.length; a += W) env.push(rms(x, a, a + W));
  const fin = env.slice(-10).reduce((s, v) => s + v, 0) / 10, i = env.findIndex((v) => v > 0.5 * fin);
  return i < 0 ? Infinity : (i * W) / fs;
}
// sounding frequency of x near f over [a, b): phase advance of the demodulated signal
function freqAt(x, f, a, b, fs = FS) {
  const m = 4096, ph = (s, fr) => { const w = (TAU * fr) / fs; let re = 0, im = 0; for (let i = s; i < s + m; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - s)) / m); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); } return Math.atan2(im, re); };
  const wrap = (d) => d - TAU * Math.round(d / TAU);
  const f1 = f + (wrap(ph(a + 512, f) - ph(a, f)) * fs) / (TAU * 512);
  return f1 + (wrap(ph(b - m, f1) - ph(a, f1)) * fs) / (TAU * (b - m - a));
}
// a voice's (first string's) locked harmonic and its swing Ŷ/D (0 if it is not locked)
const lockOf = (e, v = e.voices[0]) => { if (!v) return { n: 0, amp: 0 }; const d = e.dominant(v); return { n: d.n, amp: d.amp / v.S.D }; };
// the design of a key's first string (the treble keys have courses of two or three, a little apart)
const design = (key, p = P()) => stringDesign(key, p, courseOffsets(key)[0]);
// open a key's shutter at once (tests of the linear dynamics); returns its first string
function openNow(e, key) { e.noteOn(key, 1); const v = e.byKey.get(key); v.x = 1; v.target = 1; for (const st of v.strings) { st.e.fill(1); st.x = 1; st.target = 1; } return v.strings[0]; }
// the pitch of x near f over [a, b): its power-weighted mean frequency (demodulated at f, in Hann-weighted
// 20 ms blocks every 10 ms; the instantaneous frequency of z(t) weighted by |z|²), so a beating course
// reads as the mean of its strings
function pitchOf(x, f, a, b, fs = FS) {
  const W = Math.round(0.02 * fs), H = W >> 1, w = (TAU * f) / fs, zr = [], zi = [];
  for (let s = a; s + W <= b; s += H) {
    let re = 0, im = 0;
    for (let i = 0; i < W; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i + 0.5)) / W), t = s + i; re += h * x[t] * Math.cos(w * t); im -= h * x[t] * Math.sin(w * t); }
    zr.push(re); zi.push(im);
  }
  let num = 0, den = 0;
  for (let k = 1; k < zr.length - 1; k++) { const dr = 0.5 * (zr[k + 1] - zr[k - 1]), di = 0.5 * (zi[k + 1] - zi[k - 1]); num += zr[k] * di - zi[k] * dr; den += zr[k] * zr[k] + zi[k] * zi[k]; }
  return f + (num / den) * fs / (TAU * H);
}
// each string's own frequency on harmonic n over the run's last `sec` seconds: its mode's phase, tracked every block
function stringFreqs(params, key, n, sec, fs = FS) {
  const e = new WindHarpEngine(fs); e.setParams(params); e.Uw = params.wind; e.noteOn(key, 0.7);
  const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl), v = e.voices[0], k = v.strings.length;
  const f0 = keyFreq(key), adv = (TAU * f0 * bl) / fs, prev = new Float64Array(k), sum = new Float64Array(k);
  let T = 0;
  const total = Math.round(sec * fs / bl), from = total - Math.round(1.0 * fs / bl);
  for (let b = 0; b < total; b++) {
    e.process(bL, bR, bl);
    v.strings.forEach((st, i) => {
      const ph = Math.atan2(-st.v[n - 1] / st.w[n - 1], st.a[n - 1]);
      if (b > from) { let d = ph - prev[i] - adv; d -= TAU * Math.round(d / TAU); sum[i] += d; }
      prev[i] = ph;
    });
    if (b > from) T += bl / fs;
  }
  return { e, f: Array.from(sum, (d) => f0 + d / (TAU * T)), locks: v.strings.map((st) => e.dominant(st).n) };
}
// least-squares slope of log(y) against t
function logSlope(pts) {
  const n = pts.length, mt = pts.reduce((s, p) => s + p[0], 0) / n, ml = pts.reduce((s, p) => s + Math.log(p[1]), 0) / n;
  let num = 0, den = 0;
  for (const [t, y] of pts) { num += (t - mt) * (Math.log(y) - ml); den += (t - mt) ** 2; }
  return num / den;
}

console.log('the wake');
test('the Strouhal relation: Williamson & Brown’s St = 0.2698 − 1.0271/√Re (0.167 at Re = 100, rising towards 0.27); every key’s string is as thick as makes St(U₀D/ν)·U₀/D its note, with Re between 47 and 1500 at U₀ = 4 m/s', () => {
  assert.ok(Math.abs(strouhal(100) - 0.16709) < 1e-5, `${strouhal(100)}`);
  for (let Re = 50; Re < 5000; Re *= 1.3) assert.ok(strouhal(Re * 1.3) > strouhal(Re) && strouhal(Re) < 0.2698);
  let lo = Infinity, hi = 0;
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const D = stringDesign(k, P()).D, Re = (U_REF * D) / AIR.nu, sh = shedding(U_REF, D);
    assert.ok(rel(sh.fs, keyFreq(k)) < 1e-9 && rel((strouhal(Re) * U_REF) / D, keyFreq(k)) < 1e-9, `${k}`);
    lo = Math.min(lo, Re); hi = Math.max(hi, Re);
  }
  assert.ok(lo > 60 && hi < 1500, `Re ${lo.toFixed(0)}–${hi.toFixed(0)}`);
  console.log(`        Re at U₀: ${lo.toFixed(0)} (C7) to ${hi.toFixed(0)} (G3); D ${(stringDesign(KEY_HI, P()).D * 1e3).toFixed(3)}–${(stringDesign(KEY_LO, P()).D * 1e3).toFixed(2)} mm`);
});
test('no shedding below Re = 47: the wake’s growth εΩr/2 changes sign there (r ∝ Re − 47, the Landau onset) and is full from Re = 60; in the engine a C7 string in a wind with Re = 40 keeps a still wake and no sound, while at Re = 70 it sheds', () => {
  const onset = (Re) => shedding((Re * AIR.nu) / 1e-3, 1e-3).r;
  assert.ok(onset(RE_C - 1) < 0 && onset(RE_C + 1) > 0 && onset(60) === 1 && onset(30) === -1);
  assert.ok(!shedding(1, 0.4e-3).sheds && shedding(3, 0.4e-3).sheds);
  const S = design(96), U40 = (40 * AIR.nu) / S.D, U70 = (70 * AIR.nu) / S.D, qOf = (r) => Math.max(...r.e.voices[0].strings.flatMap((st) => Array.from(st.q, Math.abs)));
  const still = hold(96, P({ wind: U40 }), 1.0), qmax = qOf(still);
  const live = hold(96, P({ wind: U70 }), 1.0), qlive = qOf(live);
  assert.ok(qmax < 1e-3 && qlive > 1, `|q| ${qmax} at Re 40, ${qlive} at Re 70`);
  assert.ok(rms(still.L, 24000, 48000) < 1e-3 * rms(hold(96, P(), 1.0).L, 24000, 48000) + 1e-9, 'silent');
});
test('a fixed cylinder’s wake: the engine’s station sheds at the Strouhal frequency (within 0.05 %, through κ(ε) = 1 − ε²/16 + 17ε⁴/3072) with the swing of the van der Pol limit cycle found by Runge–Kutta (within 1 %), at C4 and C6, 44.1 and 48 kHz', () => {
  // reference: q'' + ε(q² − 1)q' + q = 0 by RK4, its frequency and the amplitude of its fundamental
  const eps = WAKE.eps, rhs = (q, v) => [v, -eps * (q * q - 1) * v - q];
  let q = 2, v = 0; const h = 0.002, xs = [];
  for (let i = 0; i < 200000; i++) {
    const [a1, b1] = rhs(q, v), [a2, b2] = rhs(q + 0.5 * h * a1, v + 0.5 * h * b1), [a3, b3] = rhs(q + 0.5 * h * a2, v + 0.5 * h * b2), [a4, b4] = rhs(q + h * a3, v + h * b3);
    q += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4); v += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    if (i >= 100000) xs.push(q);
  }
  const ups = []; for (let i = 1; i < xs.length; i++) if (xs[i - 1] < 0 && xs[i] >= 0) ups.push(i - 1 + xs[i - 1] / (xs[i - 1] - xs[i]));
  const wRef = (TAU * (ups.length - 1)) / ((ups[ups.length - 1] - ups[0]) * h);
  let re = 0, im = 0; const a0 = Math.ceil(ups[0]), b0 = Math.floor(ups[ups.length - 1]);
  for (let i = a0; i < b0; i++) { re += xs[i] * Math.cos(wRef * i * h); im += xs[i] * Math.sin(wRef * i * h); }
  const aRef = (2 * Math.hypot(re, im)) / (b0 - a0);
  // the wake's own Ω is set so that its limit cycle runs at f_s: f_s/Ω is the van der Pol κ(ε)
  const sh = shedding(U_REF, design(60).D), kappa = (TAU * sh.fs) / sh.Om, series = 1 - (eps * eps) / 16 + (17 * eps ** 4) / 3072;
  assert.ok(sh.r === 1 && Math.abs(wRef - kappa) < 1e-4 && Math.abs(series - kappa) < 1e-12, `RK4 ${wRef} vs κ ${kappa} (series ${series})`);
  for (const fs of [44100, 48000]) for (const key of [60, 84]) {
    const p = P(), S = design(key, p), e = new WindHarpEngine(fs, 1, { rigid: true, noise: 0 });
    e.setParams(p); e.Uw = p.wind; const vc = openNow(e, key), bL = new Float32Array(1), bR = new Float32Array(1), rec = [];
    for (let i = 0; i < 0.6 * fs; i++) { e.process(bL, bR, 1); if (i > 0.2 * fs) rec.push(vc.q[2]); }
    const zc = []; for (let i = 1; i < rec.length; i++) if (rec[i - 1] < 0 && rec[i] >= 0) zc.push(i - 1 + rec[i - 1] / (rec[i - 1] - rec[i]));
    const f = ((zc.length - 1) * fs) / (zc[zc.length - 1] - zc[0]);
    let cr = 0, ci = 0; const i0 = Math.ceil(zc[0]), i1 = Math.floor(zc[zc.length - 1]);
    for (let i = i0; i < i1; i++) { cr += rec[i] * Math.cos((TAU * f * i) / fs); ci += rec[i] * Math.sin((TAU * f * i) / fs); }
    const amp = (2 * Math.hypot(cr, ci)) / (i1 - i0);
    assert.ok(rel(f, shedding(p.wind, S.D).fs) < 5e-4, `${key} at ${fs}: ${f.toFixed(3)} vs f_s ${shedding(p.wind, S.D).fs.toFixed(3)}`);
    assert.ok(rel(amp, aRef) < 0.01, `${key} at ${fs}: amplitude ${amp.toFixed(4)} vs ${aRef.toFixed(4)}`);
  }
  console.log(`        limit cycle: ω = ${wRef.toFixed(5)} (κ = ${kappa.toFixed(5)}), fundamental ${aRef.toFixed(4)}`);
});

console.log('the linear analysis');
test('de Langre’s coupled-mode flutter: with ε = λ = 0 the roots of (s² + δ²)(s² + 1) = AMs² leave the imaginary axis exactly for |δ − 1| < √AM, growing at Im√(½(1 + δ² − AM) + ½i√(4δ² − (1 + δ² − AM)²)); uncoupled (AM → 0) the roots are the wake’s ε/2 ± i√(1 − ε²/4) and the string’s −λ/2 ± i√(δ² − λ²/4)', () => {
  for (const AM of [2e-4, 7e-4, 2e-3]) {
    const r = Math.sqrt(AM);
    for (const [d, inside] of [[1 - 0.98 * r, true], [1 + 0.98 * r, true], [1 - 1.02 * r, false], [1 + 1.02 * r, false], [1, true]]) {
      const g = flutterGrowth(d, 0, AM, 0).re;
      if (inside) {
        const A = 0.5 * (1 + d * d - AM), B = 0.5 * Math.sqrt(4 * d * d - (1 + d * d - AM) ** 2), mod = Math.hypot(A, B), im = Math.sqrt(0.5 * (mod - A));
        assert.ok(Math.abs(g - im) < 1e-9 && g > 0, `AM ${AM}, δ ${d}: ${g} vs ${im}`);
      } else assert.ok(Math.abs(g) < 1e-9, `AM ${AM}, δ ${d}: ${g}`);
    }
  }
  const eps = 0.3, lam = 0.01, d = 1.3, roots = coupledRoots(d, lam, 1e-12, eps);
  const want = [[eps / 2, Math.sqrt(1 - eps * eps / 4)], [-lam / 2, Math.sqrt(d * d - lam * lam / 4)]];
  for (const [wr, wi] of want) assert.ok(roots.some(([re, im]) => Math.abs(re - wr) < 1e-8 && Math.abs(Math.abs(im) - wi) < 1e-8), `${wr} ± ${wi}i`);
});
test('the band in wind: each harmonic’s band edges solve δ(U) = 1 ± √AM(U); a heavier string’s band is narrower in proportion to 1/√m*; the single-mode balance’s locked state solves its equations', () => {
  const S = stringDesign(67, P());
  for (const n of [2, 3, 4, 5]) {
    const b = lockBand(S, n), hl = harmonicParams(S, n, b.lo), hh = harmonicParams(S, n, b.hi);
    assert.ok(Math.abs(hl.delta - 1 - Math.sqrt(hl.AM)) < 1e-9 && Math.abs(hh.delta - 1 + Math.sqrt(hh.AM)) < 1e-9, `n ${n}`);
  }
  const S4 = stringDesign(67, P({ mass: 4 })), b1 = lockBand(S, 3), b4 = lockBand(S4, 3);
  const ratio = (b1.hi - b1.lo) / (b4.hi - b4.lo), want = Math.sqrt(S4.mu / S.mu);
  assert.ok(rel(ratio, want) < 0.03, `width ratio ${ratio.toFixed(3)} vs √(m*₄/m*₁) ${want.toFixed(3)}`);
  // the single-mode balance's locked state solves (1 − ω² + iεωP)(δ² − ω² + iλω) = −AMω² with P = |Q̂|²/4 − r
  const h = harmonicParams(S, 3, b1.mid * 1.01), s1 = lockedState(h.delta, h.lam, h.AM, h.M, WAKE.eps, h.r), w = s1.w, Pq = (s1.Q * s1.Q) / 4 - h.r;
  const ar = 1 - w * w, ai = WAKE.eps * w * Pq, br = h.delta ** 2 - w * w, bi = h.lam * w;
  assert.ok(Math.hypot(ar * br - ai * bi + h.AM * w * w, ar * bi + ai * br) < 1e-9, 'balance residual');
  assert.ok(balance(h.delta, h.lam, h.AM, h.M).length >= 1);
});
test('engine against the linear model (ε turned down to 0.001, no turbulence): at the band’s middle a C4 and a C6 string grow at the coupled-mode rate Re s (within 3 %), at Im s/2π (within 3 ¢); 1.5 half-widths outside the band they do not', () => {
  const out = [];
  for (const key of [60, 84]) {
    const p = P(), S = design(key, p), b = lockBand(S, 3), hw = 0.5 * (b.hi - b.lo);
    for (const [U, inside] of [[b.mid, true], [b.hi + 1.5 * hw, false]]) {
      const h = harmonicParams(S, 3, U), g = flutterGrowth(h.delta, h.lam, h.AM, 0.001);
      const e = new WindHarpEngine(FS, 1, { eps: 0.001, noise: 0 });
      e.setParams(P({ wind: U })); e.Uw = U;
      const v = openNow(e, key), bL = new Float32Array(16), bR = new Float32Array(16), pts = [], ph = [];
      assert.ok(rel(v.S.D, S.D) < 1e-12, 'the first string');
      const amp0 = () => Math.hypot(v.a[2], v.v[2] / v.w[2]) / S.D;
      for (let s = 0; s < 1.2 * FS; s += 16) {
        e.process(bL, bR, 16);
        const a = amp0(), t = s / FS;
        if (a > 1e-8 && a < 1e-3 && t > 0.03) { pts.push([t, a]); ph.push([t, Math.atan2(-v.v[2] / v.w[2], v.a[2])]); }
      }
      if (inside) {
        const rate = logSlope(pts), want = g.re * h.Om;
        // frequency: the unwrapped phase of mode 3 over the fitted window
        let un = 0, prev = ph[0][1], tot = 0;
        for (let i = 1; i < ph.length; i++) { let d = ph[i][1] - prev; d -= TAU * Math.round(d / TAU); un += d; prev = ph[i][1]; tot = ph[i][0] - ph[0][0]; }
        const fMeas = Math.abs(un) / (TAU * tot), fWant = (g.im * h.Om) / TAU;
        // the phase advances by ω per second plus whole turns per sample interval: compare to ω mod the sampling of 16 samples
        const fs16 = FS / 16, fAlias = Math.abs(fWant - Math.round(fWant / fs16) * fs16);
        assert.ok(rel(rate, want) < 0.03, `${key}: engine ${rate.toFixed(2)}/s, model ${want.toFixed(2)}/s`);
        assert.ok(Math.abs(cents(fMeas + 1e-9, fAlias + 1e-9)) < 3 || Math.abs(fMeas - fAlias) < 0.05, `${key}: ${fMeas} vs ${fAlias}`);
        out.push(`${noteName(key)} ${rate.toFixed(1)}/s (model ${want.toFixed(1)})`);
      } else {
        const tail = []; for (let s = 0; s < 0.3 * FS; s += 16) { e.process(bL, bR, 16); tail.push([s / FS, amp0()]); }
        const rate = logSlope(tail.filter(([, a]) => a > 0)), inRate = flutterGrowth(...(() => { const hm = harmonicParams(S, 3, b.mid); return [hm.delta, hm.lam, hm.AM, 0.001]; })()).re * harmonicParams(S, 3, b.mid).Om;
        assert.ok(rate < 0.2 * inRate, `${key} outside: ${rate.toFixed(2)}/s vs ${inRate.toFixed(2)}/s inside`);
      }
    }
  }
  console.log(`        ${out.join('; ')}`);
});
test('engine against the linear model at the published ε = 0.3: a kicked wake on a still string grows at the wake root’s Re s (≈ εΩ/2, within 3 %), at C4 and C6; the string then grows more slowly than the coupled-mode rate (0.3–0.8 of it, from 3 % to 30 % of its locked swing), the wake having saturated first', () => {
  const out = [];
  for (const key of [60, 84]) {
    const p = P(), S = design(key, p), U = lockBand(S, 3).mid, h = harmonicParams(S, 3, U);
    let best = -Infinity; for (const [re] of coupledRoots(h.delta, h.lam, h.AM, WAKE.eps)) best = Math.max(best, re);
    const want = best * h.Om, e = new WindHarpEngine(FS, 1, { noise: 0 });
    e.setParams(P({ wind: U })); e.Uw = U;
    const v = openNow(e, key), bL = new Float32Array(4), bR = new Float32Array(4), pts = [], sp = [];
    for (let j = 0; j < v.J; j++) { v.q[j] = 1e-8 * (1 + j / v.J); v.qv[j] = 0; }
    let mx = 0, k = 0;
    const per = Math.ceil(FS / shedding(U, S.D).fs / 4) + 1;
    for (let s = 0; s < 0.2 * FS; s += 4) {
      e.process(bL, bR, 4);
      sp.push([s / FS, Math.hypot(v.a[2], v.v[2] / v.w[2]) / S.D]);
      for (const qj of v.q) mx = Math.max(mx, Math.abs(qj));
      if (++k >= per) { if (mx > 1e-6 && mx < 0.05) pts.push([s / FS, mx]); mx = 0; k = 0; }
    }
    const rate = logSlope(pts);
    assert.ok(pts.length > 4 && rel(rate, want) < 0.03, `${key}: engine ${rate.toFixed(1)}/s, model ${want.toFixed(1)}/s (${pts.length} points)`);
    // the string's own rise once the wake has saturated, against de Langre's coupled-mode rate
    const flutter = flutterGrowth(h.delta, h.lam, h.AM, 0).re * h.Om;
    let fin = 0;
    for (let s = 0.2 * FS; s < (key < 70 ? 3 : 1) * FS; s += 4) { e.process(bL, bR, 4); fin = Math.hypot(v.a[2], v.v[2] / v.w[2]) / S.D; sp.push([s / FS, fin]); }
    const r2 = logSlope(sp.filter(([, a]) => a > 0.03 * fin && a < 0.3 * fin)) / flutter;
    assert.ok(r2 > 0.3 && r2 < 0.8, `${key}: string rises at ${r2.toFixed(2)} of the coupled-mode rate`);
    out.push(`${noteName(key)}: wake ${rate.toFixed(0)}/s (model ${want.toFixed(0)}), string ${r2.toFixed(2)} × the coupled-mode ${flutter.toFixed(1)}/s`);
  }
  console.log(`        ${out.join('; ')}`);
});

console.log('lock-in: the engine against the analysis');
test('lock-in from rest: with the shutter opened at a steady wind, the string locks onto its harmonic inside the band (±0.3 of its half-width from its middle) and not beyond the locked branch’s reach (2.5 half-widths out), for C4, C6 (harmonic 3) and E5 (harmonic 4)', () => {
  const out = [];
  for (const [key, n] of [[60, 3], [84, 3], [76, 4]]) {
    const S = design(key), b = lockBand(S, n), hw = 0.5 * (b.hi - b.lo), Y = lockedAmplitude(S, n, b.mid), T = key < 70 ? 4 : 1.5;
    for (const [x, inside] of [[-0.3, true], [0.3, true], [-2.5, false], [2.5, false]]) {
      const U = b.mid + x * hw, r = hold(key, P({ wind: U }), T, { vel: 1 }), l = lockOf(r.e);
      if (inside) assert.ok(l.n === n && l.amp > 0.5 * Y, `${noteName(key)} at ${U.toFixed(3)} m/s (band ${b.lo.toFixed(3)}–${b.hi.toFixed(3)}): harmonic ${l.n}, Ŷ/D ${l.amp.toFixed(4)} (balance ${Y.toFixed(4)})`);
      else assert.ok(l.amp < 0.15 * Y, `${noteName(key)} at ${U.toFixed(3)} m/s outside the band: Ŷ/D ${l.amp.toFixed(4)}`);
    }
    out.push(`${noteName(key)} n = ${n}: ${b.lo.toFixed(2)}–${b.hi.toFixed(2)} m/s`);
  }
  console.log(`        bands: ${out.join('; ')}`);
});
test('harmonic jumps at the predicted winds: as the wind rises slowly past a C6 string it locks onto harmonics 3, 4, 5 in turn, each where its band begins (within 2 %); falling, onto 5, 4, 3 where each band ends (within 2 %)', () => {
  const key = 84, S = design(key), u0 = 3.3, u1 = 7.3, rate = 0.15, T1 = (u1 - u0) / rate;
  const first = { up: {}, down: {} }, Ymid = {};
  for (const n of [3, 4, 5]) Ymid[n] = lockedAmplitude(S, n, lockBand(S, n).mid);
  run(P({ wind: u0 }), [[0, 'on', key, 1]], 1 + 2 * T1, { wind: u0, bl: 256, tap: (e, t) => {
    const U = t < 0.5 ? u0 : t < 0.5 + T1 ? u0 + rate * (t - 0.5) : Math.max(u0, u1 - rate * (t - 0.5 - T1));
    e.P = { ...e.P, wind: U }; e.Uw = U;
    const l = lockOf(e), dir = t < 0.5 + T1 ? 'up' : 'down';
    if (Ymid[l.n] && l.amp > 0.5 * Ymid[l.n] && first[dir][l.n] === undefined) first[dir][l.n] = U;
  } });
  const out = [];
  for (const n of [3, 4, 5]) {
    const b = lockBand(S, n);
    assert.ok(first.up[n] !== undefined && rel(first.up[n], b.lo) < 0.02, `up, harmonic ${n}: locked at ${first.up[n]?.toFixed(3)}, band begins ${b.lo.toFixed(3)}`);
    assert.ok(first.down[n] !== undefined && rel(first.down[n], b.hi) < 0.02, `down, harmonic ${n}: locked at ${first.down[n]?.toFixed(3)}, band ends ${b.hi.toFixed(3)}`);
    out.push(`${n}: ↑${first.up[n].toFixed(2)} (${b.lo.toFixed(2)}) ↓${first.down[n].toFixed(2)} (${b.hi.toFixed(2)})`);
  }
  console.log(`        locks at (predicted): ${out.join('; ')} m/s`);
});
test('hysteresis: once locked, a C5 string holds its harmonic beyond the band on both sides as the wind is stepped away, letting go where the harmonic balance’s locked branch ends (within 2 %)', () => {
  const key = 72, S = design(key), R = lockedRange(S, 3), out = [];
  for (const dir of [1, -1]) {
    const e = new WindHarpEngine(FS, 1); e.setParams(P({ wind: R.mid })); e.Uw = R.mid; e.noteOn(key, 1);
    const bL = new Float32Array(256), bR = new Float32Array(256), go = (sec) => { for (let s = 0; s < sec * FS; s += 256) e.process(bL, bR, 256); };
    go(2);
    let U = R.mid, last = R.mid;
    for (let i = 0; i < 80; i++) {
      U += dir * 0.0025 * R.mid; e.P = { ...e.P, wind: U }; e.Uw = U; go(0.7);
      const l = lockOf(e);
      if (l.n !== 3 || l.amp < 0.4 * R.Ymid) break;
      last = U;
    }
    const want = dir > 0 ? R.upTo : R.downTo, edge = dir > 0 ? R.hi : R.lo;
    assert.ok(dir > 0 ? last > edge * 1.01 : last < edge * 0.995, `${dir > 0 ? 'up' : 'down'}: held to ${last.toFixed(3)}, band edge ${edge.toFixed(3)}`);
    assert.ok(rel(last, want) < 0.02, `${dir > 0 ? 'up' : 'down'}: held to ${last.toFixed(3)}, balance ${want.toFixed(3)}`);
    out.push(`${dir > 0 ? 'rising' : 'falling'}: held to ${last.toFixed(3)} m/s (balance ${want.toFixed(3)}, band edge ${edge.toFixed(3)})`);
  }
  console.log(`        ${out.join('; ')}`);
});
test('the locked swing: at the band’s middle, without turbulence, the engine’s Ŷ/D is the distributed harmonic balance’s (within 3 %) at G3, C4, C6 and C7; the wake’s turbulence takes up to 10 % off it at the high-Re (bass) strings', () => {
  const out = [];
  for (const key of [55, 60, 84, 96]) {
    const S = design(key), b = lockBand(S, 3), Y = lockedAmplitude(S, 3, b.mid), T = key < 70 ? 5 : 2;
    const l = lockOf(hold(key, P({ wind: b.mid }), T, { vel: 1, opts: { noise: 0 } }).e), lt = lockOf(hold(key, P({ wind: b.mid }), T + 1, { vel: 1 }).e);
    assert.ok(l.n === 3 && rel(l.amp, Y) < 0.03, `${noteName(key)}: engine ${l.amp.toFixed(4)}, balance ${Y.toFixed(4)}`);
    assert.ok(lt.n === 3 && lt.amp < l.amp * 1.01 && lt.amp > 0.9 * l.amp, `${noteName(key)} with turbulence: ${lt.amp.toFixed(4)}`);
    out.push(`${noteName(key)} ${l.amp.toFixed(4)} (${Y.toFixed(4)}; ${lt.amp.toFixed(4)} with turbulence)`);
  }
  console.log(`        Ŷ/D engine (balance): ${out.join(', ')}`);
});
test('mass–damping: the locked swing follows m*ζ alone (a ×4 heavier string with 4× the Q swings as the light one, within 4 %) and falls as m*ζ grows; the heavy string’s band is half as wide, so a wind inside the light string’s band but 1.6 of its own half-widths out leaves it silent', () => {
  const key = 96, light = P({ q: 500 }), heavy = P({ mass: 4, q: 2000 });
  const S1 = design(key, light), S4 = design(key, heavy), b1 = lockBand(S1, 3), b4 = lockBand(S4, 3);
  const amp = (p, U) => lockOf(hold(key, { ...p, wind: U }, 3, { vel: 1 }).e).amp;
  const a1 = amp(light, b1.mid), a4 = amp(heavy, b4.mid);
  assert.ok(rel(massDamping(S1), massDamping(S4)) < 0.01 && rel(a1, a4) < 0.04, `m*ζ ${massDamping(S1).toFixed(3)}, ${massDamping(S4).toFixed(3)}: Ŷ/D ${a1.toFixed(4)}, ${a4.toFixed(4)}`);
  const series = [250, 500, 1000, 2000].map((q) => { const p = P({ q }), S = design(key, p); return [massDamping(S), amp(p, lockBand(S, 3).mid)]; });
  for (let i = 1; i < series.length; i++) assert.ok(series[i][1] > series[i - 1][1], `${series.map(([m, a]) => `${m.toFixed(2)}: ${a.toFixed(4)}`).join(', ')}`);
  const hw4 = 0.5 * (b4.hi - b4.lo), U = b4.mid + 1.6 * hw4;
  assert.ok(U < b1.hi && amp(light, U) > 0.5 * a1 && amp(heavy, U) < 0.15 * a4, 'the narrower band');
  console.log(`        Ŷ/D against m*ζ: ${series.map(([m, a]) => `${m.toFixed(2)} → ${a.toFixed(4)}`).join(', ')}`);
});

console.log('tuning and speech');
test('tuning: at the reference wind every key G3–C7 locks onto its 3rd harmonic and sounds its note within 3 ¢ (48 kHz; every fourth key at 44.1 kHz), the mean of its course; with n₀ = 2 and 5, sampled keys too', () => {
  let worst = 0;
  const check = (key, p, fs, n0) => {
    const T = key < 72 ? 2.6 : 1.9, r = hold(key, p, T, { fs }), l = lockOf(r.e), f = pitchOf(r.L, keyFreq(key), Math.round((T - 1.5) * fs), r.L.length, fs), c = cents(f, keyFreq(key));
    worst = Math.max(worst, Math.abs(c));
    assert.ok(l.n === n0 && Math.abs(c) < 3, `${noteName(key)} n₀ ${n0} at ${fs}: harmonic ${l.n}, ${c.toFixed(2)} ¢`);
  };
  for (let k = KEY_LO; k <= KEY_HI; k++) check(k, P(), 48000, 3);
  for (let k = KEY_LO; k <= KEY_HI; k += 4) check(k, P(), 44100, 3);
  for (const n0 of [2, 5]) for (const k of [57, 69, 81, 93]) check(k, P({ n0 }), 48000, n0);
  console.log(`        worst ${worst.toFixed(2)} ¢`);
});
test('the keyboard\'s tuning: at the reference wind E4 at A = 415 Hz sounds 101.27 ¢ low, in ¼-comma meantone E4 −3.42 ¢ and C4 +10.26 ¢ from equal temperament, A4 at 440 Hz (within 3 ¢, on its 3rd harmonic); in unison every string follows the unison key\'s', () => {
  for (const [o, key, want] of [[{ pitch: 415 }, 64, keyFreq(64) * 415 / 440], [{ temperament: 'meantone' }, 64, keyFreq(64) * 2 ** (-3.42 / 1200)],
    [{ temperament: 'meantone' }, 60, keyFreq(60) * 2 ** (10.26 / 1200)], [{ temperament: 'meantone' }, 69, 440]]) {
    const T = 2.6, r = hold(key, P(o), T), l = lockOf(r.e), c = cents(pitchOf(r.L, want, Math.round((T - 1.5) * FS), r.L.length), want);
    assert.ok(l.n === 3 && Math.abs(c) < 3, `${JSON.stringify(o)}, ${noteName(key)}: harmonic ${l.n}, ${c.toFixed(2)} ¢`);
  }
  const p = P({ tuning: 'unison', unison: 55, pitch: 415 });
  assert.ok(Math.abs(cents(stringDesign(74, p).target, keyFreq(55) * 415 / 440)) < 1e-9, 'unison at 415 Hz');
});
test('unison courses: one string a key to B4, two from C5 to C7; at the reference wind every string of every course locks onto the 3rd harmonic on its own, within 3 ¢ of the note, its strings 0.5–4 ¢ apart (they beat slowly: the course shimmers)', () => {
  const courseSize = (k) => courseOffsets(k).length;
  assert.ok(courseSize(55) === 1 && courseSize(71) === 1 && courseSize(72) === 2 && courseSize(96) === 2);
  let lo = Infinity, hi = 0;
  for (let k = 72; k <= KEY_HI; k += 2) {
    const { f, locks } = stringFreqs(P(), k, 3, 2.0), c = f.map((x) => cents(x, keyFreq(k)));
    assert.ok(locks.length === courseSize(k) && locks.every((n) => n === 3), `${noteName(k)}: ${locks}`);
    assert.ok(c.every((x) => Math.abs(x) < 3), `${noteName(k)}: ${c.map((x) => x.toFixed(2))} ¢`);
    const spread = Math.max(...c) - Math.min(...c);
    assert.ok(spread > 0.5 && spread < 4, `${noteName(k)}: spread ${spread.toFixed(2)} ¢`);
    lo = Math.min(lo, spread); hi = Math.max(hi, spread);
  }
  console.log(`        course spreads ${lo.toFixed(2)}–${hi.toFixed(2)} ¢`);
});
test('every key speaks at the default touch and wind: its string reaches half its final swing within 1.2 s (G3–C7)', () => {
  const t = [];
  for (let k = KEY_LO; k <= KEY_HI; k++) { const o = onsetOf(P(), k, 0.7, k < 72 ? 3 : 1.5); assert.ok(o < 1.2, `${noteName(k)}: ${o}`); t.push(o); }
  console.log(`        onsets ${(Math.min(...t) * 1000).toFixed(0)}–${(Math.max(...t) * 1000).toFixed(0)} ms (G3 ${(t[0] * 1000).toFixed(0)}, C4 ${(t[5] * 1000).toFixed(0)}, C5 ${(t[17] * 1000).toFixed(0)}, C7 ${(t[41] * 1000).toFixed(0)} ms)`);
});
test('Kircher’s harp: every string tuned to G3, only the gauge differs; G4, D5, G5, B5 and F6 lock onto harmonics 2, 3, 4, 5 and 7 and sound them (within 3 ¢ of n f₀ √(1 + Bn²), so the 7th 31 ¢ under F6); A4 and C♯6, between harmonics, stay unlocked', () => {
  const p = P({ tuning: 'unison', unison: 55 }), out = [];
  for (const [key, n] of [[67, 2], [74, 3], [79, 4], [83, 5], [89, 7]]) {
    const S = stringDesign(key, p), r = hold(key, p, 2.6), l = lockOf(r.e), f = pitchOf(r.L, S.f[n - 1], 48000, r.L.length);
    assert.ok(homeHarmonic(S) === n && l.n === n && Math.abs(cents(f, S.f[n - 1])) < 3, `${noteName(key)}: harmonic ${l.n} (want ${n}), ${f.toFixed(2)} Hz vs ${S.f[n - 1].toFixed(2)}`);
    out.push(`${noteName(key)} ${n}: ${cents(f, keyFreq(key)).toFixed(1)} ¢`);
  }
  for (const key of [69, 85]) { const l = lockOf(hold(key, p, 2).e); assert.ok(l.amp < 0.01, `${noteName(key)}: Ŷ/D ${l.amp}`); }
  const S = stringDesign(67, p);
  assert.ok(rel(stringDesign(96, p).f0, S.f0) < 0.01, 'unison');
  console.log(`        against equal temperament: ${out.join(', ')}`);
});
test('the aeolian tone: between bands the string does not lock, and what is heard is the shedding itself: the strongest line in the output is at the Strouhal frequency (within 1 %), 20 dB or more under the locked note', () => {
  const key = 72, S = design(key), b3 = lockBand(S, 3), b4 = lockBand(S, 4), U = 0.5 * (lockedRange(S, 3).upTo + b4.lo);
  const r = hold(key, P({ wind: U }), 1.5), N = 32768, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = r.L[r.L.length - N + i] * (0.5 - 0.5 * Math.cos((TAU * i) / N));
  fft(re, im, false);
  let kb = 1; for (let k = 2; k < N / 2; k++) if (re[k] ** 2 + im[k] ** 2 > re[kb] ** 2 + im[kb] ** 2) kb = k;
  const fPeak = (kb * FS) / N, fsh = shedding(U, S.D).fs;
  assert.ok(rel(fPeak, fsh) < 0.01, `peak ${fPeak.toFixed(1)} Hz, f_s ${fsh.toFixed(1)} Hz`);
  const locked = hold(key, P({ wind: b3.mid }), 1.5), dB = 20 * Math.log10(rms(r.L, 24000, r.L.length) / rms(locked.L, 24000, locked.L.length));
  assert.ok(dB < -20, `${dB.toFixed(1)} dB`);
  console.log(`        C5 at ${U.toFixed(2)} m/s: ${fPeak.toFixed(1)} Hz (f_s ${fsh.toFixed(1)}), ${dB.toFixed(1)} dB under the locked note`);
});

console.log('shutters, voices, gusts');
test('shutters: a fast key (velocity 1, 10 ms) speaks sooner than a slow one (0.05, 250 ms); key up shuts it and the string rings down at its own damping ζω = ω/2Q (within 5 %), the flow’s damping gone; a quicker release shuts sooner; the pedal holds the shutter open', () => {
  const key = 72, fast = onsetOf(P(), key, 1, 1.5), slow = onsetOf(P(), key, 0.05, 1.5);
  assert.ok(fast < slow - 0.1, `fast ${fast}, slow ${slow}`);
  const S = design(key), sig = (TAU * S.f[2]) / (2 * P().q), env = [];
  run(P(), [[0, 'on', key, 1], [1.2, 'off', key]], 2.4, { tap: (e, t) => { if (t > 1.5) { const v = e.voices[0].strings[0]; env.push([t, Math.hypot(v.a[2], v.v[2] / v.w[2])]); } } });
  const rate = -logSlope(env);
  assert.ok(rel(rate, sig) < 0.05, `ring-down ${rate.toFixed(3)}/s, ζω ${sig.toFixed(3)}/s`);
  const shutAt = (vel) => { let t0 = null; run(P(), [[0, 'on', key, 1], [0.5, 'off', key, vel]], 0.8, { bl: 16, tap: (e, t) => { if (t0 === null && t > 0.5 && e.voices[0].x === 0) t0 = t - 0.5; } }); return t0; };
  assert.ok(shutAt(1) < shutAt(0.1), `${shutAt(1)} ${shutAt(0.1)}`);
  const ped = run(P(), [[0, 'sus', true], [0, 'on', key, 1], [0.5, 'off', key], [1.5, 'sus', false]], 1.8, { tap: (e, t) => { if (t > 1.0 && t < 1.4) assert.equal(e.voices[0].x, 1, 'held by the pedal'); } });
  assert.ok(ped.e.voices[0].target === 0, 'released with the pedal');
});
test('voices: re-pressing a sounding key reopens its shutter on the same string (one voice, keeping most of its swing); past 12 keys the quietest released key fades out over 30 ms without a click, never one under 50 ms old; a shut string retires once silent', () => {
  let n = 0, drop = Infinity, before = 0;
  run(P(), [[0, 'on', 79, 1], [0.6, 'off', 79], [0.65, 'on', 79, 0.7]], 1.2, { tap: (e, t) => { n = Math.max(n, e.voices.length); const a = lockOf(e).amp; if (t < 0.6) before = a; else if (t < 0.9) drop = Math.min(drop, a / before); } });
  assert.ok(n === 1 && drop > 0.7, `${n} voices, swing ratio ${drop}`);
  const ev = [];
  for (let i = 0; i < 12; i++) ev.push([0.02 * i, 'on', 57 + 3 * i, 0.8], [0.5, 'off', 57 + 3 * i]);
  ev.push([0.6, 'on', 94, 0.8], [0.602, 'on', 95, 0.8]);
  let live = 0, young = false;
  const r = run(P(), ev, 0.9, { tap: (e, t) => { if (t > 0.61) { live = Math.max(live, e.voices.filter((v) => !v.fading && !v.dead).length); for (const v of e.voices) if (v.fading && (v.key === 94 || v.key === 95)) young = true; } } });
  assert.ok(live <= 12 && !young, `${live} live`);
  let jump = 0, steady = 0;
  for (let i = Math.round(0.6 * FS); i < Math.round(0.7 * FS); i++) jump = Math.max(jump, Math.abs(r.L[i] - r.L[i - 1]));
  for (let i = Math.round(0.4 * FS); i < Math.round(0.5 * FS); i++) steady = Math.max(steady, Math.abs(r.L[i] - r.L[i - 1]));
  assert.ok(jump < 2 * steady + 1e-3, `step ${jump} vs ${steady}`);
  const gone = run(P(), [[0, 'on', 93, 1], [0.4, 'off', 93]], 4);
  assert.equal(gone.e.voices.length, 0, 'retired');
});
test('gusts: seeded (the same seed repeats exactly, another differs); the wind’s turbulence has the set intensity (within 10 %) and the two-process spectrum, which follows the von Kármán f^(−5/3) fall within 2 dB from f_c/3 to 6 f_c', () => {
  const p = P({ gust: 0.08, gustTime: 1 }), ev = [[0, 'on', 72, 0.8]];
  const a = run(p, ev, 1.5, { seed: 7 }), b = run(p, ev, 1.5, { seed: 7 }), c = run(p, ev, 1.5, { seed: 8 });
  let same = true, diff = 0;
  for (let i = 0; i < a.L.length; i++) { if (a.L[i] !== b.L[i]) same = false; diff = Math.max(diff, Math.abs(a.L[i] - c.L[i])); }
  assert.ok(same && diff > 1e-3, `${same} ${diff}`);
  // the engine's wind, a block at a time: 160 half-overlapping Hann-windowed spans of 2¹⁶ blocks (175 s each)
  const e = new WindHarpEngine(FS, 3); e.setParams(p); e.Uw = p.wind;
  const M = 1 << 16, N = 81 * M, dt = 128 / FS, us = new Float64Array(N);
  for (let i = 0; i < N; i++) us[i] = e.wind(128) / p.wind - 1;
  const m = us.reduce((s, x) => s + x, 0) / N, sd = Math.sqrt(us.reduce((s, x) => s + (x - m) ** 2, 0) / N);
  assert.ok(rel(sd, 0.08) < 0.1, `rms ${sd}`);
  const pow = new Float64Array(M / 2), re = new Float64Array(M), im = new Float64Array(M);
  for (let a = 0; a + M <= N; a += M / 2) {
    for (let i = 0; i < M; i++) { re[i] = (0.5 - 0.5 * Math.cos((TAU * i) / M)) * us[a + i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < M / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
  }
  // its spectrum against the target's shape, in bands ±10 % wide, relative to the band below f_c/4
  const fc = 1 / TAU, df = 1 / (M * dt);
  const band = (f0, f1) => { let s = 0, n = 0; for (let k = 2; k < M / 2 && k * df < f1; k++) if (k * df >= f0) { s += pow[k] / gustSpectrum(k * df, 1); n++; } return s / n; };
  const ref = band(0, fc / 4);
  for (let f = fc / 3; f <= 6 * fc; f *= 1.2) { const dB = 10 * Math.log10(band(f / 1.1, f * 1.1) / ref); assert.ok(Math.abs(dB) < 2, `${f.toFixed(3)} Hz: ${dB.toFixed(2)} dB`); }
});
test('gusts make a string near a switch flicker: a C6 held between its 3rd harmonic’s fold and its 4th harmonic’s band changes harmonic or drops in and out of lock many times in 10 s with 5 % gusts, and holds steady in a steady wind', () => {
  const key = 84, S = design(key), R = lockedRange(S, 3), U = R.hi;
  const flips = (gust) => { let n = 0, prev = -1; run(P({ wind: U, gust, gustTime: 0.7 }), [[0, 'on', key, 1]], 10, { wind: U, bl: 512, tap: (e, t) => { if (t < 1) return; const l = lockOf(e), s = l.amp > 0.4 * R.Ymid ? l.n : 0; if (s !== prev) { if (prev >= 0) n++; prev = s; } } }); return n; };
  const g = flips(0.05), still = flips(0);
  assert.ok(g >= 4 && still === 0, `${g} changes with gusts, ${still} without`);
  console.log(`        ${g} changes of harmonic or lock in 10 s`);
});

test('the keys past G3–C7: ropes down to A0 (Re up to 10⁴) and threads up to E7 (Re 50) lock onto their 3rd harmonic within 3 ¢, speak within 6 s (A0 in 5), and a forte note peaks 0.1–0.5; F7 would shed only below Re 47', () => {
  const out = [];
  for (const k of [21, 24, 31, 43, 50, 97, 100]) {
    const S = stringDesign(k, P());
    assert.ok(S.Re0 > RE_C, `${noteName(k)}: Re ${S.Re0}`);
    const { f, locks } = stringFreqs(P(), k, 3, k < 55 ? 8 : 2.0), c = f.map((x) => cents(x, keyFreq(k)));
    assert.ok(locks.every((n) => n === 3) && c.every((x) => Math.abs(x) < 3), `${noteName(k)}: harmonics ${locks}, ${c.map((x) => x.toFixed(2))} ¢`);
    const o = onsetOf(P(), k, 0.7, k < 55 ? 8 : 1.5), pk = peakAbs(hold(k, P(), k < 55 ? 6 : 2, { vel: 1 }));
    assert.ok(o < 6 && pk > 0.1 && pk < 0.5, `${noteName(k)}: onset ${o} s, peak ${pk}`);
    out.push(`${noteName(k)} ${(S.D * 1e3).toFixed(2)} mm ${o.toFixed(2)} s ${pk.toFixed(2)}`);
  }
  assert.ok(stringDesign(101, P()).Re0 < RE_C, 'F7');
  console.log(`        ${out.join(', ')}`);
});

console.log('levels and stability');
test('level: at the reference wind a single forte note peaks at 0.1–0.5 on every key from G3 to C7, at 44.1 and 48 kHz; a ten-key chord stays under 1.5; every preset within 12 dB of the default', () => {
  const pks = {};
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += fs === 48000 ? 1 : 4) {
    const pk = peakAbs(hold(k, P(), k < 72 ? 2.5 : 2, { fs, vel: 1 }));
    assert.ok(pk > 0.1 && pk < 0.5, `${noteName(k)} at ${fs}: ${pk.toFixed(3)}`);
    if (fs === 48000) pks[k] = pk;
  }
  const reg = (a, b) => { const v = Object.entries(pks).filter(([k]) => k >= a && k <= b).map(([, x]) => x); return `${Math.min(...v).toFixed(2)}–${Math.max(...v).toFixed(2)}`; };
  console.log(`        peaks: G3–B3 ${reg(55, 59)}, C4–B4 ${reg(60, 71)}, C5–B5 ${reg(72, 83)}, C6–C7 ${reg(84, 96)}`);
  const chord = run(P(), [55, 59, 62, 67, 71, 74, 79, 83, 86, 91].map((k) => [0, 'on', k, 1]), 2.5);
  assert.ok(peakAbs(chord) < 1.5, `chord ${peakAbs(chord)}`);
  const ref = rms(hold(67, P(), 2.5).L, 72000, 120000);
  for (const pr of PRESETS) {
    const key = pr.p.tuning === 'unison' ? 79 : 67, lv = rms(hold(key, P(pr.p), 2.5).L, 72000, 120000), dB = 20 * Math.log10(lv / ref);
    assert.ok(Math.abs(dB) < 12, `${pr.name}: ${dB.toFixed(1)} dB`);
  }
});
test('stability: seeded random combinations of extreme settings at 44.1 and 48 kHz, changed mid-note, with full aftertouch: no NaN, bounded, and falling away after release', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'venue', ...TUNING_KEEP].includes(q.id));
  let seed = 4242, worst = { pk: 0 };
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // the keyboard's tuning drawn apart, from its own sequence, so that the other parameters' combinations stay the ones they were
  let tseed = 777;
  const trnd = () => ((tseed = (tseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const tune = (p) => { for (const q of TUNING_PARAMS) { if (trnd() < 0.5) continue; p[q.id] = q.options ? q.options[Math.floor(trnd() * q.options.length)][0] : trnd() < 0.5 ? q.min : q.max; } return p; };
  const pick = () => {
    const p = P();
    for (const q of sliders) {
      if (rnd() < 0.5) continue;
      p[q.id] = q.type === 'checkbox' ? rnd() < 0.5 : q.type === 'select' ? q.options[Math.floor(rnd() * q.options.length)][0] : rnd() < 0.5 ? q.min : q.max;
    }
    return tune(p);
  };
  for (const fs of [44100, 48000]) for (let c = 0; c < 5; c++) {
    const p1 = pick(), p2 = pick(), ev = [];
    [55, 64, 72, 85, 96].forEach((k, i) => ev.push([0.02 * i, 'on', k, rnd()], [1.2, 'off', k]));
    ev.push([0.5, 'params', p2], [0.6, 'press', 1], [0.8, 'press', 0]);
    const r = run(p1, ev, 2.4, { fs, wind: p1.wind });
    let pk = 0;
    for (let i = 0; i < r.L.length; i++) { assert.ok(Number.isFinite(r.L[i] + r.R[i]), `${fs}: NaN with ${JSON.stringify(p1)} → ${JSON.stringify(p2)}`); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
    if (pk > worst.pk) worst = { pk, p1, p2, fs };
    const note = rms(r.L, Math.round(0.9 * fs), Math.round(1.2 * fs)), t1 = rms(r.L, Math.round(1.6 * fs), Math.round(1.7 * fs)), t2 = rms(r.L, r.L.length - Math.round(0.1 * fs), r.L.length);
    assert.ok(t2 < 1e-3 || t2 < 1.2 * t1 || t2 < 0.1 * note, `${fs}: still growing after release (${t2.toFixed(4)} after ${t1.toFixed(4)}, note ${note.toFixed(4)}) with ${JSON.stringify(p2)}`);
  }
  assert.ok(worst.pk < 4, `${worst.fs}: peak ${worst.pk.toFixed(2)} with ${JSON.stringify(worst.p1)} → ${JSON.stringify(worst.p2)}`);
  console.log(`        loudest of 10: ${worst.pk.toFixed(2)}`);
});
test('regression: the top strings in a 12 m/s wind, their shedding up to 0.29 of 44.1 kHz (Ω h 1.2–1.8; at the sample rate the wake’s leapfrog went to NaN): a fixed C7 and E7 (at A = 440 and 466 Hz) shed at f_s (within 0.5 %) with the van der Pol swing 2√r (within 1 %), and C7, C♯7, D7 and E7 alone in an 8 m/s wind with 30 % gusts stay finite, under a peak of 4, their wakes under 3 × that swing', () => {
  for (const [key, pitch] of [[96, 440], [96, 466], [100, 466]]) {
    const fs = 44100, p = P({ wind: 8, pitch }), S = design(key, p), e = new WindHarpEngine(fs, 1, { rigid: true, noise: 0 });
    e.setParams(p); e.Uw = p.wind; e.handle({ type: 'pressure', value: 1, key: null }); // aftertouch: 12 m/s
    const vc = openNow(e, key), bL = new Float32Array(1), bR = new Float32Array(1), rec = [];
    for (let i = 0; i < 0.8 * fs; i++) { e.process(bL, bR, 1); if (i > 0.3 * fs) rec.push(vc.q[2]); }
    const sh = shedding(e.U, S.D), zc = [];
    for (let i = 1; i < rec.length; i++) if (rec[i - 1] < 0 && rec[i] >= 0) zc.push(i - 1 + rec[i - 1] / (rec[i - 1] - rec[i]));
    const f = ((zc.length - 1) * fs) / (zc[zc.length - 1] - zc[0]), swing = Math.max(...rec.map(Math.abs));
    assert.ok(Math.abs(e.U - 12) < 1e-3 && sh.Om / fs > 1.19, `${noteName(key)} at ${pitch}: U ${e.U}, Ω h ${(sh.Om / fs).toFixed(3)}`);
    assert.ok(rel(f, sh.fs) < 5e-3 && rel(swing, 2) < 0.01, `${noteName(key)} at ${pitch}: ${f.toFixed(1)} Hz vs f_s ${sh.fs.toFixed(1)}, swing ${swing.toFixed(4)}`);
  }
  let worst = { pk: 0, q: 0 };
  for (const pitch of [440, 466]) for (const key of [96, 97, 98, 100]) {
    let q = 0;
    const r = run(P({ wind: 8, gust: 0.3, pitch }), [[0, 'on', key, 0.7]], 2.5, { fs: 44100, wind: 8, tap: (e) => { for (const v of e.voices) for (const st of v.strings) for (const x of st.q) q = Math.max(q, Math.abs(x)); } });
    let pk = 0;
    for (let i = 0; i < r.L.length; i++) { assert.ok(Number.isFinite(r.L[i] + r.R[i]), `${noteName(key)} at ${pitch}: NaN at ${(i / 44100).toFixed(3)} s`); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
    assert.ok(pk < 4 && q < 6, `${noteName(key)} at ${pitch}: peak ${pk.toFixed(2)}, |q| ${q.toFixed(2)}`);
    worst = { pk: Math.max(worst.pk, pk), q: Math.max(worst.q, q) };
  }
  console.log(`        loudest ${worst.pk.toFixed(2)}, wake |q| ≤ ${worst.q.toFixed(2)}`);
});
test('live knobs glide: wind, gustiness, Q and aftertouch moved mid-note change the sound without a click (no sample step over twice the steady largest)', () => {
  const steadyStep = (r, a, b) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(r.L[i] - r.L[i - 1])); return m; };
  const ev = [[0, 'on', 72, 0.9], [1.2, 'params', P({ wind: 4.08, q: 900 })], [1.4, 'press', 0.04], [1.6, 'params', P({ wind: 4.08, q: 900, gust: 0.02 })]];
  const r = run(P(), ev, 2.0);
  const before = steadyStep(r, Math.round(0.9 * FS), Math.round(1.19 * FS)), after = steadyStep(r, Math.round(1.19 * FS), Math.round(1.9 * FS));
  assert.ok(after < 2 * before, `${after} vs ${before}`);
});
test('presets use their own parameters, and each speaks without NaN', () => {
  for (const pr of PRESETS) {
    const key = pr.p.tuning === 'unison' ? 79 : 67, r = run(P(pr.p), [[0, 'on', key, 0.8], [0, 'on', key + 7, 0.8]], 1.5, { wind: P(pr.p).wind });
    let pk = 0;
    for (const v of r.L) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.005, `${pr.name}: ${pk}`);
  }
});
test('Quality: Medium and Low let fewer shut keys ring at once (8, 6) and retire a shut string sooner (about 90 and 70 dB down), never a held or pedalled one; a held string plays exactly as at High', () => {
  const play = (quality, events, sec) => {
    const e = new WindHarpEngine(FS, 1); e.setQuality(quality); e.setParams(P()); e.Uw = DEFAULTS.wind;
    const n = Math.round(sec * FS), L = new Float64Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
    const ev = events.map(([t, ...r]) => [Math.round(t * FS), ...r]).sort((a, b) => a[0] - b[0]);
    for (let s = 0, j = 0; s < n; s += 128) {
      while (j < ev.length && ev[j][0] <= s) { const [, type, a, b] = ev[j++]; if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a, b); else e.setSustain(a); }
      e.process(bL, bR, 128);
      for (let i = 0; i < 128 && s + i < n; i++) L[s + i] = bL[i];
    }
    return { L, e };
  };
  const live = (e) => e.voices.filter((v) => !v.fading && !v.dead);
  // four keys let go, then four more held: Medium keeps all eight, Low lets two shut ones go
  const four = [60, 64, 67, 72], ev = [...four.map((k) => [0, 'on', k, 0.8]), ...four.map((k) => [0.4, 'off', k]), ...four.map((k, i) => [0.5 + 0.06 * i, 'on', k + 2, 0.8])];
  const res = [];
  for (const [quality, n] of [['high', 8], ['medium', 8], ['low', 6]]) {
    const { e } = play(quality, ev, 0.9);
    assert.equal(live(e).length, n, `${quality}: ${live(e).length} keys`);
    assert.equal(live(e).filter((v) => v.held).length, 4, `${quality}: every held key sounds`);
    // ten held (or pedalled) keys: none is let go below 12
    const held = play(quality, [[0, 'sus', true], ...Array.from({ length: 10 }, (_, i) => [0.05 * i, 'on', 55 + 3 * i, 0.8]), ...Array.from({ length: 5 }, (_, i) => [0.6, 'off', 55 + 3 * i])], 0.8);
    assert.equal(live(held.e).length, 10, `${quality}: ${live(held.e).length} of 10 held and pedalled keys`);
    res.push(`${quality} ${n}`);
  }
  // a released C5 retires sooner; a held one is the same to the last bit
  const gone = {};
  for (const quality of ['high', 'medium', 'low']) {
    const { e } = play(quality, [[0, 'on', 72, 0.8], [1, 'off', 72]], 1.5);
    let s = 1.5; for (; s < 12 && e.voiceCount(); s += 0.05) e.process(new Float32Array(2400), new Float32Array(2400), 2400);
    gone[quality] = s;
  }
  assert.ok(gone.medium < 0.8 * gone.high && gone.low < gone.medium, `released C5 retires at ${Object.values(gone).map((x) => x.toFixed(2)).join(', ')} s`);
  const hi = play('high', [[0, 'on', 72, 0.8]], 1).L, lo = play('low', [[0, 'on', 72, 0.8]], 1).L;
  for (let i = 0; i < hi.length; i++) if (hi[i] !== lo[i]) throw new Error(`Low differs from High at sample ${i}`);
  console.log(`        keys left: ${res.join(', ')}; released C5 gone at ${Object.values(gone).map((x) => x.toFixed(1)).join(' / ')} s`);
});
test('CPU: ten sounding keys across the compass (15 strings in their courses), locked at the reference wind, at 48 kHz in under 30 % of one core', () => {
  const e = new WindHarpEngine(FS);
  e.setParams(P());
  for (const k of [55, 59, 62, 67, 71, 74, 79, 83, 86, 91]) e.noteOn(k, 0.8);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let s = 0; s < 0.5 * FS; s += 128) e.process(L, R, 128);
  const sec = 4, t0 = performance.now();
  for (let s = 0; s < sec * FS; s += 128) e.process(L, R, 128);
  const load = (performance.now() - t0) / (sec * 1000);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} % of real time`);
  const strings = e.voices.reduce((n, v) => n + v.strings.length, 0);
  console.log(`        (${(100 * load).toFixed(1)} % of real time for 10 keys, ${strings} strings)`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
