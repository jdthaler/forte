// ABRACADABRA checks: the axion's flux against the experiment's numbers and Ampère's law, the
// elliptic integrals against their closed forms, the halo's speeds and line against the Standard
// Halo Model, the field's statistics (Gaussian, Rayleigh amplitudes, its coherence), and the
// engine against the model: pitch, level, the SQUID's noise floor, the magnet's ramp, a field that
// lives on between notes, the stream, the halo's heat, Quality, and CPU.
// Run: node test/abracadabra-tests.mjs
//
// The model and the engine are the C++ (native/instruments/abracadabra), built as WebAssembly.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../abracadabra/src/abracadabra-instrument.js';
import { wasmModel } from '../abracadabra/src/abracadabra-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq, keyPan } from '../shared/dsp.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel(), K = M.constants;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const C = 299792.458; // km/s

// Render through the engine in 128-sample blocks like the AudioWorklet; events [t, fn(engine)].
function render(params, sec, events = [], onMessage) {
  const e = new Engine(FS);
  e.post = onMessage ?? (() => {});
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
const note = (key, params, sec, vel = 1, more = [], onMessage) => render(params, sec, [[0, (x) => x.noteOn(key, vel)], ...more], onMessage);
const rms = (x, a, b) => { a = Math.round(a); b = Math.round(b); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
// Power at frequency f in x[a, b) (Hann-windowed Goertzel).
function power(x, f, a, b) {
  a = Math.round(a); b = Math.round(b);
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return re * re + im * im;
}
// x[a, b) mixed down from f and averaged to about 64 Hz (complex), as the engine's search does;
// then its power at d Hz above f (Hann).
function baseband(x, f, a, b) {
  const D = 750, re = [], im = [], w = (2 * Math.PI * f) / FS;
  for (let s = Math.round(a); s + D <= b; s += D) { let r = 0, q = 0; for (let i = s; i < s + D; i++) { r += x[i] * Math.cos(w * i); q -= x[i] * Math.sin(w * i); } re.push(r / D); im.push(q / D); }
  return { re, im, rate: FS / D };
}
function bpower(bb, d) {
  const n = bb.re.length; let a = 0, b = 0;
  for (let i = 0; i < n; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n), ph = (-2 * Math.PI * d * i) / bb.rate, c = Math.cos(ph), s = Math.sin(ph); a += h * (bb.re[i] * c - bb.im[i] * s); b += h * (bb.re[i] * s + bb.im[i] * c); }
  return a * a + b * b;
}
// ∫ f over [a, b] (Simpson, n even).
function integrate(f, a, b, n = 4000) { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return (s * h) / 3; }

console.log('physics');
test('an axion of 1 neV oscillates at E/h = 241.8 kHz (h and e exact since 2019)', () => {
  const f = (1e-9 * 1.602176634e-19) / 6.62607015e-34;
  near(M.axionFrequency(1e-9), f, 1e-6 * f, 'f');
  near(M.axionMass(f), 1e-9, 1e-15, 'm');
  // the keyboard: A4 = 440 kHz, 1.82 neV; ABRACADABRA-10 cm's 75 kHz–2 MHz is D2 to B6
  near(M.axionMass(K.SCALE * 440) * 1e9, 1.8197, 1e-3, 'A4 in neV');
});
test('g √ρ: 0.4 GeV/cm³ of dark matter coupled at 10⁻¹⁰ GeV⁻¹ makes B_a/B = 8.9×10⁻¹⁶ per meter (natural units, ħc = 197.33 MeV fm)', () => {
  // ρ in J/m³, then (ħc)³: GeV⁴; √ρ g in GeV; ÷ ħc in GeV m
  const GeV = 1.602176634e-10, hbarc = 1.054571817e-34 * 2.99792458e8 / GeV; // GeV m
  const rho = 0.4 * 1e6 * GeV;                                                 // J/m³
  const rhoNat = (rho / GeV) * hbarc ** 3;                                     // GeV⁴
  const expect = (1e-10 * Math.sqrt(rhoNat)) / hbarc;
  near(M.couplingPerMeter(1e-10, 0.4), expect, 1e-6 * expect, 'g√ρ');
  near(expect, 8.88e-16, 0.01e-16, 'value');
});
test('the elliptic integrals: K(1/√2) = Γ(¼)²/4√π, E(1/√2) = 1.350644, and Legendre\'s relation E K′ + E′ K − K K′ = π/2', () => {
  const k = Math.SQRT1_2, G14 = 3.6256099082219083;
  near(M.ellipK(k), G14 ** 2 / (4 * Math.sqrt(Math.PI)), 1e-12, 'K');
  near(M.ellipE(k), 1.3506438810476755, 1e-12, 'E');
  for (const k of [0.1, 0.6, 0.95]) {
    const kp = Math.sqrt(1 - k * k), L = M.ellipE(k) * M.ellipK(kp) + M.ellipE(kp) * M.ellipK(k) - M.ellipK(k) * M.ellipK(kp);
    near(L, Math.PI / 2, 1e-12, `k ${k}`);
  }
});
test('the pickup\'s coupling: a tall toroid gives Ampère\'s V_B = π a² R ln(Ro/R); ABRACADABRA-10 cm\'s, as a rectangle, comes within 25 % of its COMSOL 𝒢 = 0.027', () => {
  // a long toroid: the effective current is a thick solenoid, its field in the hole ∫ J dr
  const a = K.ABRA_LOOP, R = K.ABRA_R_IN, Ro = K.ABRA_R_OUT, h = 50;
  const VB = M.geometryFactor(a, R, Ro, h) * Math.PI * (Ro ** 2 - R ** 2) * h;
  const amp = Math.PI * a * a * R * Math.log(Ro / R);
  near(VB / amp, 1, 2e-3, 'long limit');
  // ABRACADABRA-10 cm: 3 to 6 cm, 12 cm tall, the loop 2.01 cm; the real one has rounded windings
  // (V = 890 cm³, not a rectangle's 1018) and a superconducting shield, which COMSOL includes
  const G = M.geometryFactor(a, R, Ro, K.ABRA_H);
  assert.ok(Math.abs(G / K.ABRA_G - 1) < 0.25, `𝒢 ${G}`);
  // and a loop at the hole's wall couples more than one at its centre would
  assert.ok(M.geometryFactor(0.029, R, Ro, K.ABRA_H) > G && G > M.geometryFactor(0.01, R, Ro, K.ABRA_H), 'grows with the loop');
});
test('ABRACADABRA-10 cm\'s reach: with its numbers (𝒢 V, M_in / L_T, 1 μΦ₀/√Hz, 2.45×10⁶ s) the radiometer equation puts the 95 % reach within 3× of its best limit, 1.4×10⁻¹⁰ GeV⁻¹', () => {
  // SNR = (A / S) √(T / Δf) for an integration far longer than the coherence time
  const fa = 750e3, T = 2.45e6, df = 1e-6 * fa;
  const snr = (g) => (M.squidFlux(g, 0.4, 1, 0.12) ** 2 / K.SQUID_NOISE ** 2) * Math.sqrt(T / df);
  const reach = 1.4e-10 * Math.sqrt(1.645 / snr(1.4e-10));
  assert.ok(reach > 1.4e-10 / 3 && reach < 1.4e-10 * 3, `reach ${reach}`);
  // and the flux itself: g √ρ 𝒢 V B, 1.4×10⁻⁵ Φ₀ at the pickup for 1.4×10⁻¹⁰
  near(M.pickupFlux(1.4e-10, 0.4, 1, 0.12) / K.PHI0, 1.44e-5, 0.02e-5, 'pickup flux');
});
test('the flux grows as g, B and the toroid\'s volume; the noise in a channel as √f', () => {
  const f0 = M.pickupFlux(1e-9, 0.4, 1, 0.12);
  near(M.pickupFlux(3e-9, 0.4, 1, 0.12) / f0, 3, 1e-9, 'g');
  near(M.pickupFlux(1e-9, 0.4, 5, 0.12) / f0, 5, 1e-9, 'B');
  near(M.pickupFlux(1e-9, 0.4, 1, 0.24) / f0, 8, 1e-9, 'size');
  near(M.pickupFlux(1e-9, 1.6, 1, 0.12) / f0, 2, 1e-9, '√ρ');
  near(M.channelNoise(1, 1760) / M.channelNoise(1, 440), 2, 1e-9, '√f');
  near(M.channelNoise(1, 440), Math.sqrt((Math.PI * 440) / (2 * K.CHANNEL_Q)), 1e-9, 'noise bandwidth π f / 2Q');
});
test('the Standard Halo Model in the lab: normalised, ⟨v⟩ = 3/2 ... and ⟨v²⟩ = v_lab² + 3/2 v0²', () => {
  for (const [v0, vl] of [[220, 232], [40, 232], [1200, 232]]) {
    const top = vl + 6 * v0;
    near(integrate((v) => M.speedPdf(v, v0, vl), 0, top), 1, 1e-6, `norm ${v0}`);
    near(integrate((v) => v * v * M.speedPdf(v, v0, vl), 0, top) / (vl * vl + 1.5 * v0 * v0), 1, 1e-6, `⟨v²⟩ ${v0}`);
  }
  // the most likely speed sits near v_lab for a cold halo
  let best = 0, bv = 0;
  for (let v = 1; v < 400; v += 0.5) { const p = M.speedPdf(v, 20, 232); if (p > bv) { bv = p; best = v; } }
  near(best, 232, 3, 'cold halo');
});
test('the line: one-sided, normalised, its mean f ⟨v²⟩/2c², a millionth of the frequency wide', () => {
  const fa = 440e3, mean = M.lineMean(fa, 220, 232);
  near(mean, (fa * (232 ** 2 + 1.5 * 220 ** 2)) / (2 * C * C), 1e-12, 'mean');
  assert.equal(M.linePdf(-0.01, fa, 220, 232), 0);
  near(integrate((d) => M.linePdf(d, fa, 220, 232), 1e-9, 20 * mean, 20000), 1, 2e-3, 'norm');
  near(integrate((d) => d * M.linePdf(d, fa, 220, 232), 1e-9, 20 * mean, 20000) / mean, 1, 2e-3, 'mean');
  const spread = M.lineSpread(fa, 220, 232) / fa;
  assert.ok(spread > 3e-7 && spread < 1e-6, `σ/f ${spread}`);
});
test('the field\'s waves: their speeds are the halo\'s (⟨v²⟩ and its spread), the stream\'s 420 ± 20 km/s', () => {
  let s1 = 0, s2 = 0, n = 0, t1 = 0, tn = 0;
  for (let seed = 1; seed <= 300; seed++) {
    M.seedField(seed);
    const { halo, stream } = M.fieldSpeeds(220, 232, 420);
    for (const v of halo) { s1 += v * v; s2 += v ** 4; n++; }
    for (const v of stream) { t1 += v; tn++; }
  }
  const m2 = s1 / n, var2 = s2 / n - m2 * m2;
  near(m2 / (232 ** 2 + 1.5 * 220 ** 2), 1, 0.02, '⟨v²⟩');
  near(Math.sqrt(var2) / Math.sqrt(2 * 232 ** 2 * 220 ** 2 + 1.5 * 220 ** 4), 1, 0.04, 'σ(v²)');
  near(t1 / tn, 420, 1.5, 'stream');
});
test('the field is Gaussian: |a|² is exponential (mean 1, P(|a|² > 3) = e⁻³), so its amplitude is Rayleigh', () => {
  let s = 0, s2 = 0, over = 0, n = 0;
  for (let seed = 1; seed <= 400; seed++) {
    M.seedField(seed);
    for (let t = 0; t < 40; t += 2) {
      const { re, im } = M.fieldAt(t, 440e3), p = re * re + im * im;
      s += p; s2 += p * p; over += p > 3; n++;
    }
  }
  near(s / n, 1, 0.05, 'mean');
  near(s2 / n / (s / n) ** 2, 2, 0.15, '⟨|a|⁴⟩/⟨|a|²⟩²');
  near(over / n, Math.exp(-3), 0.012, 'tail');
});
test('the field\'s coherence: its autocorrelation is the line\'s characteristic function, and the coherence time (2.3 s at A4\'s 440 kHz, ~1/f a million times over) where it falls to 1/e', () => {
  const fa = 440e3;
  const cf = (tau) => {
    const top = 20 * M.lineMean(fa, 220, 232);
    const re = integrate((d) => M.linePdf(d, fa, 220, 232) * Math.cos(2 * Math.PI * d * tau), 1e-9, top, 8000);
    const im = integrate((d) => M.linePdf(d, fa, 220, 232) * Math.sin(2 * Math.PI * d * tau), 1e-9, top, 8000);
    return Math.hypot(re, im);
  };
  for (const tau of [0.5, 1.5, 3]) {
    let re = 0, im = 0, n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      M.seedField(seed);
      for (let t = 0; t < 20; t += 5) {
        const a = M.fieldAt(t, fa), b = M.fieldAt(t + tau, fa);
        re += a.re * b.re + a.im * b.im; im += a.im * b.re - a.re * b.im; n++;
      }
    }
    near(Math.hypot(re, im) / n, cf(tau), 0.06, `τ ${tau} s`);
  }
  // the readout's coherence time is where the true one falls to 1/e, within 25 %
  const tc = M.coherenceTime(fa, 220, 232);
  let lo = 0.01, hi = 30;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (cf(m) > Math.exp(-1)) lo = m; else hi = m; }
  assert.ok(Math.abs(tc / lo - 1) < 0.25, `readout ${tc} s, 1/e at ${lo} s`);
  assert.ok(lo * fa > 3e5 && lo * fa < 3e6, `cycles ${lo * fa}`);
});

console.log('engine');
test('pitch: each note is its key, sharp by the line\'s mean offset (0.31 Hz at A4), in real Hz', () => {
  for (const key of [57, 69, 81]) {
    const f = keyFreq(key), mean = M.lineMean(K.SCALE * f, 220, 232);
    const [L, R] = note(key, P({ noise: 0, ramp: 0.005 }), 20);
    const x = L.map((v, i) => v + R[i]);
    const bb = baseband(x, f, FS, 20 * FS);
    let sw = 0, sp = 0;
    for (let d = -1; d <= 1 + 8 * mean; d += 0.02) { const p = bpower(bb, d); sw += p * d; sp += p; }
    const centroid = sw / sp;
    assert.ok(Math.abs(centroid - mean) < 0.12 + 0.5 * mean, `${key}: centroid ${centroid.toFixed(3)} Hz, mean ${mean.toFixed(3)}`);
  }
});
test('level: the louder of the axion and the channel\'s noise plays at 0.1 rms at full charge; a note peaks under 0.5', () => {
  const key = 69, [gl, gr] = keyPan(key);
  // noise only (an axion too faint to hear): rms 0.1 in the channel
  const [L, R] = note(key, P({ coupling: 1e-12 }), 3);
  near(rms(L, FS, 3 * FS) / gl, 0.1, 0.012, 'noise only');
  // the axion only: rms 0.1 × |a|, so a note's mean square is 0.01 × the field's, which wanders
  let peak = 0;
  for (const k of [40, 52, 64, 76, 88, 100]) { const [A] = note(k, P({ noise: 0 }), 2); for (const v of A) peak = Math.max(peak, Math.abs(v)); }
  assert.ok(peak < 0.5 && peak > 0.02, `peak ${peak}`);
  assert.ok(gl > 0 && gr > 0);
});
test('velocity charges the magnet: the axion\'s flux follows the field (half the velocity, half the flux); the noise does not', () => {
  const [A] = note(60, P({ noise: 0 }), 1, 1), [B] = note(60, P({ noise: 0 }), 1, 0.5);
  near(rms(B, 0.5 * FS, FS) / rms(A, 0.5 * FS, FS), 0.5, 1e-3, 'flux');
  const [Cn] = note(60, P({ coupling: 1e-12 }), 1, 1), [Dn] = note(60, P({ coupling: 1e-12 }), 1, 0.5);
  near(rms(Dn, 0.5 * FS, FS) / rms(Cn, 0.5 * FS, FS), 1, 0.1, 'noise');
});
test('the SQUID\'s noise in the search: the mixed-down spectrum\'s floor is noise² μΦ₀²/Hz, and the axion\'s power is its flux²', () => {
  const base = [];
  note(69, P({ coupling: 1e-12, noise: 2 }), 20, 1, [], (m) => { if (m.type === 'base') base.push(m); });
  const re = base.flatMap((m) => m.re), im = base.flatMap((m) => m.im), rate = base[0].rate;
  near(rate, 64, 0.1, 'rate');
  // the power within ±8 Hz of the carrier, over its bandwidth: the floor (one-sided, so ÷ 2)
  const SEG = 256; let sum = 0, n = 0;
  for (let s = 64; s + SEG <= re.length; s += SEG) {
    for (let k = -32; k <= 32; k++) {
      let a = 0, b = 0;
      for (let i = 0; i < SEG; i++) { const ph = (-2 * Math.PI * k * i) / SEG; a += re[s + i] * Math.cos(ph) - im[s + i] * Math.sin(ph); b += re[s + i] * Math.sin(ph) + im[s + i] * Math.cos(ph); }
      sum += (a * a + b * b) / (rate * SEG) / 2; n++;
    }
  }
  near(sum / n / 4, 1, 0.15, 'floor / noise²');
  // with no noise, the mean square of the baseband is 2 × the flux² × the field's mean square
  const b2 = [];
  note(69, P({ noise: 0, ramp: 0.005 }), 4, 1, [], (m) => { if (m.type === 'base') b2.push(m); });
  const flux = M.squidFlux(DEFAULTS.coupling, 0.4, DEFAULTS.field, DEFAULTS.size / 100);
  const ms = b2.slice(2).flatMap((m) => m.re.map((r, i) => r * r + m.im[i] ** 2));
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length / (2 * flux * flux);
  assert.ok(mean > 0.05 && mean < 6, `|a|² ${mean}`); // one realisation of an exponential
});
test('the magnet charges linearly over the ramp time, and discharges when the key and pedal let go; then silence', () => {
  // A0: its coherence time is half a minute, so the field holds still while the magnet charges
  const [A] = note(21, P({ noise: 0, ramp: 1 }), 1.2);
  const r1 = rms(A, 0.2 * FS, 0.3 * FS), r2 = rms(A, 0.6 * FS, 0.7 * FS);
  near(r1 / r2, 0.25 / 0.65, 0.03, 'linear charge');
  const [B] = note(60, P({ ramp: 0.2 }), 1.5, 1, [[0.5, (x) => x.noteOff(60)]]);
  assert.ok(rms(B, 0.4 * FS, 0.5 * FS) > 0.01, 'sounding');
  assert.ok(rms(B, 0.62 * FS, 0.68 * FS) < rms(B, 0.4 * FS, 0.5 * FS), 'discharging');
  near(rms(B, 0.8 * FS, 1.5 * FS), 0, 1e-6, 'silent once empty');
  const [Cp, , e] = note(60, P({ ramp: 0.05 }), 1.5, 1, [[0.05, (x) => x.setSustain(true)], [0.3, (x) => x.noteOff(60)], [1, (x) => x.setSustain(false)]]);
  assert.ok(rms(Cp, 0.8 * FS, 0.95 * FS) > 0.01, 'the pedal keeps it charged');
  near(rms(Cp, 1.2 * FS, 1.5 * FS), 0, 1e-6, 'and lets it go');
  assert.equal(e.voiceCount(), 0);
});
test('the axion\'s field lives on while the key is up: a key struck again finds the field where it would be', () => {
  const p = P({ noise: 0, ramp: 0.02 });
  const [A] = note(64, p, 2);
  const [B] = note(64, p, 2, 1, [[0.5, (x) => x.noteOff(64)], [1.2, (x) => x.noteOn(64, 1)]]);
  let d = 0, s = 0;
  for (let i = 1.4 * FS; i < 2 * FS; i++) { d += (A[i] - B[i]) ** 2; s += A[i] ** 2; }
  assert.ok(Math.sqrt(d / s) < 1e-3, `differs by ${Math.sqrt(d / s)}`);
});
test('a stream adds a second, steadier line, sharp of the halo\'s by its speed', () => {
  const f = keyFreq(69), fa = K.SCALE * f, ds = (fa * 800 ** 2) / (2 * C * C);
  const band = (x, d0, d1) => { const bb = baseband(x, f, FS, 16 * FS); let s = 0; for (let d = d0; d <= d1; d += 0.02) s += bpower(bb, d); return s; };
  const [A] = note(69, P({ noise: 0, ramp: 0.005 }), 16), [B] = note(69, P({ noise: 0, ramp: 0.005, stream: 0.5, streamSpeed: 800 }), 16);
  const ratio = (x) => band(x, ds - 0.15, ds + 0.15) / band(x, -0.5, 4);
  assert.ok(ratio(B) > 0.25 && ratio(B) > 5 * ratio(A), `stream share at ${ds.toFixed(2)} Hz: ${ratio(B).toFixed(3)} vs ${ratio(A).toFixed(3)}`);
});
test('a hotter halo widens the line (and so blurs the tone), as the model\'s spread', () => {
  const key = 57, f = keyFreq(key), fa = K.SCALE * f;
  const width = (v0) => {
    const [L] = note(key, P({ noise: 0, ramp: 0.005, halo: v0 }), 12);
    let s = 0, s1 = 0, s2 = 0;
    const top = M.lineMean(fa, v0, 232) + 6 * M.lineSpread(fa, v0, 232), bb = baseband(L, f, 0.5 * FS, 12 * FS);
    for (let d = -1; d <= top; d += top / 400) { const p = bpower(bb, d); s += p; s1 += p * d; s2 += p * d * d; }
    return Math.sqrt(s2 / s - (s1 / s) ** 2);
  };
  const w1 = width(400), w2 = width(1200), want = M.lineSpread(fa, 1200, 232) / M.lineSpread(fa, 400, 232);
  assert.ok(Math.abs(w2 / w1 / want - 1) < 0.4, `${w1.toFixed(3)} → ${w2.toFixed(3)} Hz: ×${(w2 / w1).toFixed(2)}, the model ×${want.toFixed(2)}`);
});
test('no NaNs, all notes off, and every key from A0 to C8 plays', () => {
  const [L, R, e] = render(P({ stream: 0.2 }), 1, [[0, (x) => { for (let k = 21; k <= 108; k += 3) x.noteOn(k, 0.8); }], [0.5, (x) => x.allNotesOff()]]);
  assert.ok(L.every(Number.isFinite) && R.every(Number.isFinite));
  near(rms(L, 0.6 * FS, FS), 0, 1e-9, 'silent');
  assert.equal(e.voiceCount(), 0);
  for (const k of [21, 108]) { const [A] = note(k, P({ noise: 0 }), 0.6); assert.ok(rms(A, 0.2 * FS, 0.6 * FS) > 1e-3, `${k}`); }
});
test('Quality: Medium and Low hear 16 and 10 keys at once (High 24); a note keeps its level', () => {
  for (const [q, cap] of [['high', 24], ['medium', 16], ['low', 10]]) {
    const [, , e] = render(P(), 0.3, [[0, (x) => x.setQuality(q)], ...Array.from({ length: 30 }, (_, i) => [0.005 * i, (x) => x.noteOn(30 + 2 * i, 0.8)])]);
    assert.equal(e.voiceCount(), cap, q);
  }
  const lvl = (q) => { const [A] = render(P({ coupling: 1e-12 }), 2, [[0, (x) => { x.setQuality(q); x.noteOn(60, 1); }]]); return rms(A, 0.5 * FS, 2 * FS); };
  near(lvl('low') / lvl('high'), 1, 0.1, 'noise level');
});
test('CPU: ten keys with a stream and the noise render well faster than real time', () => {
  const e = new Engine(FS); e.post = () => {};
  e.setParams(P({ stream: 0.2 }));
  for (let k = 0; k < 10; k++) e.noteOn(40 + 5 * k, 0.8);
  const bL = new Float32Array(128), bR = new Float32Array(128), t0 = performance.now(), sec = 4;
  for (let s = 0; s < sec * FS; s += 128) e.process(bL, bR, 128);
  const load = (performance.now() - t0) / 1000 / sec;
  assert.ok(load < 0.15, `load ${(100 * load).toFixed(1)} %`);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
