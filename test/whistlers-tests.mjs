// Whistlers checks. Run: node test/whistlers-tests.mjs
//
// The model (the C++, through whistlers-wasm.js) is checked against independent physics: the cold
// plasma's refractive index differentiated here, the dense-plasma group index in closed form, the
// dipole field line's length integrated here in Cartesian coordinates, Carpenter and Anderson's
// densities, Eckersley's law in the low-frequency limit, the gyrofrequency of the IGRF dipole, the
// waveguide's cutoff c/2h, and the double exponential's spectrum. Then the engine against the
// model: the nose on every key, the falling tone's frequency as it arrives, echoes, the receiver,
// the travel time, the tweeks, ducts, chorus, the release, the duct's cutoff, level and Quality.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../whistlers/src/whistlers-instrument.js';
import { wasmModel } from '../whistlers/src/whistlers-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const K = M.constants;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const P = (o = {}) => ({ ...DEFAULTS, sferic: 0, echo: 0, ...o });
const keyF = (k, p = P()) => tunedFreq(p, k);
const cents = (a, b) => 1200 * Math.log2(a / b);

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events = [], onMessage) {
  const e = new Engine(FS);
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
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel, scaled to a sine's amplitude).
function tone(x, f, a, b) {
  a = Math.max(0, Math.round(a)); b = Math.min(x.length, Math.round(b));
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
// The frequency of the strongest line in [lo, hi] in x[a, b): a scan, then a golden-section search.
function peak(x, lo, hi, a, b) {
  let best = lo, bv = -1;
  for (let i = 0; i <= 80; i++) { const f = lo * (hi / lo) ** (i / 80), v = tone(x, f, a, b); if (v > bv) { bv = v; best = f; } }
  let l = best / (hi / lo) ** (1 / 80), r = best * (hi / lo) ** (1 / 80);
  for (let i = 0; i < 50; i++) {
    const m1 = r - 0.618 * (r - l), m2 = l + 0.618 * (r - l);
    if (tone(x, m1, a, b) > tone(x, m2, a, b)) r = m2; else l = m1;
  }
  return (l + r) / 2;
}
// The power's centroid in [0.8 f0, 1.2 f0] over x[a, b): near a nose the two branches part evenly,
// f − f_n ∝ ±√(t − t_n), so over the Airy region it is the nose.
function centroid(x, f0, a, b) {
  let sw = 0, swf = 0;
  for (let i = 0; i <= 120; i++) { const f = f0 * (0.8 + (0.4 * i) / 120), w = tone(x, f, a, b) ** 2; sw += w; swf += w * f; }
  return swf / sw;
}
// The two loops' signals together: the whistler's amplitude, exactly (it is circularly polarised).
const envelope = (L, R, a, b) => { let m = 0; for (let i = Math.max(0, Math.round(a)); i < Math.min(L.length, Math.round(b)); i++) m = Math.max(m, Math.hypot(L[i], R[i])); return m; };
const rms = (x, a, b) => { a = Math.round(a); b = Math.round(b); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
// The lower branch's frequency arriving at T s after the stroke, after n hops (model.delay inverted by bisection).
const arriving = (L, p, T, n = 1) => {
  const nose = M.line(L, p).nose;
  let lo = nose.f / 1e3, hi = nose.f;
  for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); if (n * M.delay(L, p, m) > T) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
};

console.log('the model');
test('the group index is d(nf)/df of the cold plasma\'s n = √(1 + f_pe² / f (f_ce − f)), and f_pe f_ce / 2√f (f_ce − f)^3/2 in a dense plasma', () => {
  for (const [fpe, fce, f] of [[2e5, 1.4e4, 3e3], [3e4, 900, 400], [9e3, 70, 30], [5e3, 4e3, 3.5e3]]) {
    const n = (x) => Math.sqrt(1 + (fpe * fpe) / (x * (fce - x))), h = f * 1e-5;
    const ng = ((f + h) * n(f + h) - (f - h) * n(f - h)) / (2 * h);
    near(M.groupIndex(fpe, fce, f) / ng, 1, 1e-7, `n_g at ${f} Hz`);
  }
  const fpe = 1e6, fce = 1e4;
  for (const f of [500, 2500, 4000]) near(M.groupIndex(fpe, fce, f) / ((fpe * fce) / (2 * Math.sqrt(f) * (fce - f) ** 1.5)), 1, 1e-3, `dense limit at ${f} Hz`);
});
test('the gyrofrequency is IGRF-13\'s dipole (29 404.8 nT on the equator at the surface) × 27.99 GHz/T, falling as 1/L³', () => {
  near(K.F_CE1, 29404.8e-9 * 27.99249e9, 1e-6, 'f_ce at L = 1');
  for (const L of [2, 4, 6.6, 20]) near(M.fce(L), K.F_CE1 / L ** 3, 1e-9 * K.F_CE1, `L = ${L}`);
  near(M.fce(4), 12861, 1, 'f_ce at L = 4');
});
test('Carpenter and Anderson\'s densities: the plasmasphere 10^(3.9043 − 0.3145 L), tenfold down every 0.1 L past the plasmapause, the trough (5800 + 300·2) L^−4.5 + 1 − e^−(L−2)/10 after midnight', () => {
  near(M.density(4, 4.7), 10 ** (3.9043 - 0.3145 * 4), 1e-9, 'L = 4');
  near(M.density(4.8, 4.7) / M.density(4.7, 4.7), 10 ** (-0.3145 * 4.7 - 1 + 0.3145 * 4.7), 1e-12, 'across the plasmapause');
  for (const L of [6, 8, 12, 25]) near(M.density(L, 4.7), 6400 * L ** -4.5 + 1 - Math.exp(-(L - 2) / 10), 1e-12, `trough at L = ${L}`);
  near(M.density(6, 4.7, 3), 3 * M.density(6, 4.7), 1e-12, 'the density knob scales it');
  assert.equal(M.alpha(4, 4.7), K.ALPHA_PS); assert.equal(M.alpha(10, 4.7), K.ALPHA_TROUGH);
});
test('a whole line\'s delay at a frequency is ∫ n_g ds / c along the dipole line r = L cos²λ, integrated here as a polyline from the ionosphere\'s top to the other side', () => {
  const p = P();
  for (const L of [4.3, 6, 11, 20]) {
    const ln = M.line(L, p), N = 20000, f = 0.25 * ln.fce;
    let t = 0, prev = null;
    for (let i = 0; i <= N; i++) {
      const lam = -ln.lam0 + (2 * ln.lam0 * i) / N, r = L * Math.cos(lam) ** 2, pt = [r * Math.cos(lam), r * Math.sin(lam)];
      if (prev) {
        const lm = lam - ln.lam0 / N, rm = L * Math.cos(lm) ** 2, B = Math.sqrt(1 + 3 * Math.sin(lm) ** 2) / (rm / L) ** 3;
        const fce = ln.fce * B, n = ln.neq * (L / rm) ** ln.alpha;
        t += (M.groupIndex(K.FPE_K * Math.sqrt(n), fce, f) * Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) * K.RE_KM) / K.C_KM;
      }
      prev = pt;
    }
    near(M.delay(L, p, f) / t, 1, 2e-5, `L = ${L}`);
    near(Math.cos(ln.lam0) ** 2 * L, 1 + K.TOP_KM / K.RE_KM, 1e-12, 'the line leaves the ionosphere at its top');
  }
});
test('Eckersley\'s law: far below the nose the delay goes as D / √f (D within 2 % across an octave)', () => {
  const p = P();
  for (const k of [40, 69, 100, 108]) {
    const L = M.lineFor(keyF(k), p), fn = M.line(L, p).nose.f;
    const D1 = M.delay(L, p, fn / 64) * Math.sqrt(fn / 64), D2 = M.delay(L, p, fn / 128) * Math.sqrt(fn / 128);
    near(D1 / D2, 1, 0.02, `key ${k}`);
  }
});
test('the nose: the least delay, between a quarter of the equatorial gyrofrequency (its place were the line all equator) and the duct\'s cutoff at a half', () => {
  const p = P();
  for (const k of [21, 45, 69, 93, 108]) {
    const ln = M.line(M.lineFor(keyF(k), p), p), x = ln.nose.f / ln.fce;
    assert.ok(x > 0.25 && x < K.DUCT_CUTOFF, `key ${k}: ${x}`);
    for (const r of [0.97, 1.03]) assert.ok(M.delay(ln.L, p, r * ln.nose.f) > ln.nose.tau, `key ${k}: not a minimum`);
  }
});
test('tuning: every key\'s field line has its nose on the note, within 0.01 cents, at A = 440 and A = 415 in meantone', () => {
  for (const p of [P(), P({ pitch: 415, temperament: 'meantone' })]) {
    let worst = 0;
    for (let k = 21; k <= 108; k++) { const L = M.lineFor(keyF(k, p), p); worst = Math.max(worst, Math.abs(cents(M.line(L, p).nose.f, keyF(k, p)))); }
    assert.ok(worst < 0.01, `${worst} cents`);
  }
});
test('the keyboard is a map of the magnetosphere: C8 inside the plasmasphere near L = 4, A0 far out near L = 23', () => {
  const p = P();
  const top = M.lineFor(keyF(108), p), bottom = M.lineFor(keyF(21), p);
  assert.ok(top > 4 && top < 4.5 && top < p.plasmapause, `C8: L = ${top}`);
  assert.ok(bottom > 20 && bottom < 26, `A0: L = ${bottom}`);
  // the plasmasphere's thick plasma makes the lines inside it slow
  const inside = M.line(M.lineFor(keyF(105), p), p), outside = M.line(M.lineFor(keyF(100), p), p);
  assert.ok(inside.nose.tau > 3 * outside.nose.tau, `${inside.nose.tau} vs ${outside.nose.tau}`);
});
test('more plasma: every delay about √ as long, the nose hardly moved (only the thin trough\'s finite f_pe / f_ce moves it at all)', () => {
  const p1 = P(), p4 = P({ density: 4 }), L = M.lineFor(keyF(69), p1);
  near(M.delay(L, p4, 200) / M.delay(L, p1, 200), 2, 0.02, 'the delay');
  near(cents(M.line(L, p4).nose.f, M.line(L, p1).nose.f), 0, 10, 'the nose (cents)');
  const Lin = M.lineFor(keyF(106), p1);
  near(cents(M.line(Lin, p4).nose.f, M.line(Lin, p1).nose.f), 0, 3, 'in the plasmasphere (cents)');
});
test('the stroke: the derivative of e^(−t/50 µs) − e^(−t/5 µs), peaking at 1/2π√(τ₁τ₂) ≈ 10 kHz, rising as f below 3 kHz', () => {
  const fp = 1 / (2 * Math.PI * Math.sqrt(50e-6 * 5e-6));
  near(M.stroke(fp), 1, 1e-12, 'its peak');
  for (const r of [0.8, 1.25]) assert.ok(M.stroke(fp * r) < 1);
  near(M.stroke(100) / M.stroke(50), 2, 0.01, 'rising as f');
});
test('the tweeks: the waveguide\'s modes cut off at m c / 2h (1.764 kHz at 85 km), and a mode arrives at d / c √(1 − (f_m/f)²)', () => {
  near(M.tweekCutoff(1, 85), 299792.458 / 170, 1e-9, 'f₁');
  near(M.tweekCutoff(3, 70), (3 * 299792.458) / 140, 1e-9, 'f₃ by day');
  const f = M.tweekFreq(1, 85, 2000, 0.01);
  near(0.01, 2000 / 299792.458 / Math.sqrt(1 - (M.tweekCutoff(1, 85) / f) ** 2), 1e-12, 'arrival');
});

console.log('the engine');
test('every key starts on its note: the sound\'s first moments (its rise and as many Airy times after) centre on the nose, within 10 cents, at A = 440 and at A = 415 in meantone', () => {
  for (const [k, p] of [33, 48, 60, 69, 84, 96, 108].map((k) => [k, P()]).concat([45, 64, 89, 100].map((k) => [k, P({ pitch: 415, temperament: 'meantone' })]))) {
    const L = M.lineFor(keyF(k, p), p), tr = M.track(L, p), f0 = keyF(k, p);
    // near the nose the two branches part evenly, f − f_n ∝ ±√(t − t_n): the power's centroid stays on it
    const n = 4.5 * tr.ta * FS, [x] = note(k, p, n / FS + 0.05), f = centroid(x, f0, 0, n);
    assert.ok(Math.abs(cents(f, f0)) < 10, `key ${k}: ${f.toFixed(2)} Hz vs ${f0.toFixed(2)}`);
  }
});
test('then it falls as the model says: the frequency arriving at each moment is the one whose delay is that moment', () => {
  for (const k of [57, 81, 100]) {
    const p = P(), L = M.lineFor(keyF(k), p), ln = M.line(L, p), tr = M.track(L, p), start = ln.nose.tau - 1.5 * tr.ta;
    const [x] = note(k, p, 2.2 * ln.nose.tau - start + 0.1);
    for (const T of [1.15, 1.4, 1.8].map((r) => r * ln.nose.tau)) {
      const want = arriving(L, p, T), w = Math.min(0.06, 0.04 * ln.nose.tau) * FS, at = (T - start) * FS;
      const got = peak(x, want * 0.8, want * 1.2, at - w / 2, at + w / 2);
      assert.ok(Math.abs(cents(got, want)) < 25, `key ${k} at ${T.toFixed(2)} s: ${got.toFixed(1)} vs ${want.toFixed(1)} Hz`);
    }
  }
});
test('echoes: with a reflection R, the three-hop whistler arrives at three times the nose\'s delay, R² as strong and spread thinner; without, nothing', () => {
  const k = 96, p = P({ echo: 0.6, travel: true }), L = M.lineFor(keyF(k), p), ln = M.line(L, p), T = ln.nose.tau;
  const [x, xr] = note(k, p, 3.3 * T), [y, yr] = note(k, P({ travel: true }), 3.3 * T);
  const e1 = envelope(x, xr, (T - 0.01) * FS, (T + 0.02) * FS), e3 = envelope(x, xr, (3 * T - 0.02) * FS, (3 * T + 0.04) * FS);
  // the Airy peak, (2/τ'')^⅓, goes as 3^−⅓ for three hops' delay
  near(e3 / e1, 0.36 * 3 ** (-1 / 3), 0.03, 'the echo\'s level');
  assert.ok(envelope(x, xr, 2.6 * T * FS, 2.9 * T * FS) < 0.2 * e3, 'nothing new before it arrives');
  assert.ok(envelope(y, yr, (3 * T - 0.02) * FS, (3 * T + 0.04) * FS) < 0.01 * e1, 'without echoes, none');
});
test('the receiver near the lightning hears the two-hop whistler: at twice the delay, with the real travel time on', () => {
  const k = 100, p1 = P({ travel: true }), p2 = P({ travel: true, receiver: 'source' }), L = M.lineFor(keyF(k), p1), ln = M.line(L, p1), fn = ln.nose.f;
  const T = ln.nose.tau, [a, ar] = note(k, p1, 2.3 * T), [b, br] = note(k, p2, 2.3 * T);
  assert.ok(envelope(a, ar, 0, 0.97 * T * FS) < 1e-4, 'silence before the first hop');
  assert.ok(envelope(a, ar, T * FS, (T + 0.01) * FS) > 0.1, 'one hop at τ');
  assert.ok(envelope(b, br, 0, 1.95 * T * FS) < 1e-4, 'nothing near the lightning before two hops');
  const e2 = envelope(b, br, 2 * T * FS, (2 * T + 0.02) * FS);
  assert.ok(e2 > 0.1, `two hops at 2τ: ${e2}`);
  const ta = M.track(L, p1).ta * 2 ** (1 / 3), at = 2 * T * FS, f = centroid(b, fn, at - 1.5 * ta * FS, at + 3 * ta * FS);
  assert.ok(Math.abs(cents(f, fn)) < 30, `on its nose: ${f.toFixed(0)} vs ${fn.toFixed(0)}`);
});
test('the crack: a click at once, then tweeks ringing down onto the waveguide\'s cutoff', () => {
  const p = P({ sferic: 1, distance: 3000 }), [x] = note(100, p, 0.08);
  assert.ok(rms(x, 0, 0.002 * FS) > 1e-3, 'the click');
  const f1 = M.tweekCutoff(1, p.iono), [y] = note(100, P(), 0.08), d = x.map((v, i) => v - y[i]); // the crack alone
  const t = 0.04, want = M.tweekFreq(1, p.iono, p.distance, t + p.distance / K.C_KM);
  const f = peak(d, f1 * 0.98, f1 * 1.3, (t - 0.004) * FS, (t + 0.004) * FS);
  assert.ok(Math.abs(cents(f, want)) < 30 && want > f1 && want < 1.03 * f1, `${f.toFixed(0)} Hz vs ${want.toFixed(0)} (cutoff ${f1.toFixed(0)})`);
});
test('ducts: three ducts sound three noses, the key\'s and the lines a step out and in', () => {
  const k = 84, p = P({ ducts: 3, spread: 0.02, travel: true }), L0 = M.lineFor(keyF(k), p);
  const [x, xr] = note(k, p, 3), [y, yr] = note(k, P({ travel: true }), 3);
  const d = x.map((v, i) => v - y[i]), dr = xr.map((v, i) => v - yr[i]); // the other two ducts alone
  const others = [L0 * 1.02, L0 * 0.98].map((L) => M.line(L, p).nose), first = others.reduce((a, b) => (a.tau < b.tau ? a : b));
  assert.ok(envelope(d, dr, 0, (first.tau - 0.03) * FS) < 1e-3, 'nothing before the first of them');
  const ta = M.track(others[0] === first ? L0 * 1.02 : L0 * 0.98, p).ta, at = first.tau * FS, f = centroid(d, first.f, at - 1.5 * ta * FS, at + 3 * ta * FS);
  assert.ok(Math.abs(cents(f, first.f)) < 15, `${f.toFixed(1)} vs ${first.f.toFixed(1)} Hz`);
  assert.ok(Math.abs(cents(first.f, keyF(k))) > 40, 'a different note from the key\'s');
});
test('chorus: a held key sings rising elements between a tenth and a half of its gyrofrequency, more with key pressure', () => {
  const k = 96, p = P({ chorus: 15, element: 0.05 }), fce = M.line(M.lineFor(keyF(k), p), p).fce;
  const count = (more) => { let n = 0; const els = []; render(p, 2, [[0, (e) => e.noteOn(k, 0.8)], ...more], (m) => { if (m.type === 'chorus') { n++; els.push(m); } }); return [n, els]; };
  const [n0, els] = count([]), [n1] = count([[0.01, (e) => e.handle({ type: 'pressure', key: k, value: 1 })]]);
  assert.ok(n0 > 15 && n0 < 50, `${n0} elements in 2 s at 15 a second`);
  assert.ok(n1 > n0 + 20, `pressure: ${n1} vs ${n0}`);
  for (const e of els) assert.ok(e.f0 >= 0.12 * fce * 0.999 && e.f1 <= 0.5 * fce && e.f1 > e.f0, 'rising, under half the gyrofrequency');
  const [none] = count([[0.01, (e) => e.noteOff(k)]]);
  assert.ok(none <= 1, 'none once the key is up');
});
test('the release: letting go fades the receiver by e every `release` seconds; the pedal keeps it open', () => {
  const k = 60, p = P({ release: 0.5 }), off = 0.5;
  const [a] = note(k, p, 2, 0.8, [[off, (e) => e.noteOff(k)]]);
  const [b] = note(k, p, 2, 0.8, [[0, (e) => e.setSustain(true)], [off, (e) => e.noteOff(k)]]);
  const t = 1.5, r = rms(a, t * FS, (t + 0.05) * FS) / rms(b, t * FS, (t + 0.05) * FS);
  near(20 * Math.log10(r), 20 * Math.log10(Math.exp(-(t + 0.025 - off) / 0.5)), 1.5, 'dB');
});
test('the duct lets go at half the gyrofrequency: the rising branch ends there', () => {
  const p = P();
  for (const k of [33, 81, 108]) {
    const L = M.lineFor(keyF(k), p), ln = M.line(L, p), tr = M.track(L, p), top = tr.f.length - 1;
    near(tr.f[top], K.DUCT_CUTOFF * ln.fce, 1e-9 * ln.fce, 'the last frequency');
    assert.equal(tr.amp[top], 0, 'silent there');
    const below = tr.f.findIndex((f, i) => i > K.NLO && f > (K.DUCT_CUTOFF - K.DUCT_EDGE) * ln.fce) - 1;
    assert.ok(tr.amp[below] > 0 && tr.f.every((f) => f <= K.DUCT_CUTOFF * ln.fce), 'heard below it, nothing above');
  }
});
test('the whistler is circularly polarised: the crossed loops hear it a quarter cycle apart, equally loud', () => {
  const [L, R] = note(69, P(), 0.5);
  const a = 0.05 * FS, b = 0.15 * FS;
  near(rms(L, a, b) / rms(R, a, b), 1, 0.05, 'level');
  let c = 0; for (let i = a; i < b; i++) c += L[i] * R[i];
  assert.ok(Math.abs(c / (b - a)) < 0.05 * rms(L, a, b) ** 2, 'uncorrelated (in quadrature)');
});
test('level: a forte note peaks between 0.1 and 0.5 on every octave, finite, and the receivers close after a release', () => {
  for (const k of [21, 33, 45, 57, 69, 81, 93, 105, 108]) {
    const [L, R, e] = note(k, { ...DEFAULTS }, 1.2, 1, [[0.6, (x) => x.noteOff(k)]]);
    let pk = 0; for (let i = 0; i < L.length; i++) { assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), 'finite'); pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    assert.ok(pk > 0.1 && pk < 0.5, `key ${k}: peak ${pk}`);
    void e;
  }
  const [, , e] = note(69, { ...DEFAULTS, release: 0.1 }, 2, 1, [[0.2, (x) => x.noteOff(69)]]);
  assert.equal(e.voiceCount(), 0, 'closed');
});
test('every preset plays, finite and under the limiter\'s reach', () => {
  for (const pr of PRESETS) {
    const p = { ...DEFAULTS, ...pr.p }, [L] = render(p, 1.5, [[0, (e) => { e.noteOn(96, 0.9); e.noteOn(72, 0.9); e.noteOn(60, 0.9); }]]);
    let pk = 0; for (const v of L) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk < 1.5, `${pr.name}: ${pk}`);
  }
});
test('Quality: Medium and Low hear 16 and 10 strokes at once (High 24), fewer ducts and echoes; one plain note is the same at every quality', () => {
  const one = (q) => render(P(), 0.5, [[0, (x) => { x.setQuality(q); x.noteOn(84, 0.8); }]])[0];
  const high = one('high');
  for (const [q, cap] of [['high', 24], ['medium', 16], ['low', 10]]) {
    const [A, , e] = render({ ...DEFAULTS }, 0.6, [[0, (x) => { x.setQuality(q); x.setSustain(true); }], ...Array.from({ length: 30 }, (_, i) => [0.01 * i, (x) => { x.noteOn(30 + 2 * i, 0.8); x.noteOff(30 + 2 * i); }])]);
    assert.ok(e.voiceCount() === cap, `${q}: ${e.voiceCount()} voices`);
    assert.ok(A.every(Number.isFinite), `${q}: not finite`);
    assert.ok(one(q).every((v, i) => v === high[i]), `${q}: a single note differs from High's`);
  }
  // five ducts: Low plays two of them, so it is quieter between the noses than High
  const k = 96, p = P({ ducts: 5, spread: 0.02 }), five = (q) => render(p, 1, [[0, (x) => { x.setQuality(q); x.noteOn(k, 0.8); }]])[0];
  assert.ok(rms(five('low'), 0, FS) < 0.9 * rms(five('high'), 0, FS), 'Low: fewer ducts');
});
test('CPU: ten strokes with five ducts and echoes render well faster than real time', () => {
  const t0 = performance.now();
  render({ ...DEFAULTS, ducts: 5, echo: 0.8, sferic: 1, chorus: 20 }, 5, Array.from({ length: 10 }, (_, i) => [0, (e) => e.noteOn(60 + 4 * i, 0.8)]));
  const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 1.5, `${dt.toFixed(2)} s for 5 s of audio`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
