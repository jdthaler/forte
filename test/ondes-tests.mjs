// Ondes Martenot checks: the heterodyne, the intensity key and the diffuseurs against their
// physics, then the engine against the model. Run: node test/ondes-tests.mjs
//
// Both are the C++ (native/instruments/ondes), built as WebAssembly: the model's functions
// through ondes-wasm.js. The independent checks integrate Adler's equation here, take the
// intensity key's numbers from Quartier et al. (2015), the free plate's from Leissa (1969) and
// Fletcher & Rossing, the springs' transition from Parker & Bilbao, and the timbres' spectra from
// their Fourier series.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../ondes/src/ondes-instrument.js';
import { wasmModel } from '../ondes/src/ondes-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';

const OndesEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const DRY = { dPalme: 0 }; // the principal loudspeaker alone
const preset = (name) => P(PRESETS.find((p) => p.name.startsWith(name)).p);
const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);

function engine(params, quality, fs = FS) {
  const e = new OndesEngine(fs);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  return e;
}
// Run an engine for sec seconds, 128-sample blocks like the AudioWorklet; returns [L, R].
function run2(e, sec, fs = FS) {
  const n = Math.round(sec * fs), L = new Float32Array(n), R = new Float32Array(n);
  for (let s = 0; s < n; s += bl) { e.process(bL, bR, bl); const m = Math.min(bl, n - s); L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s); }
  return [L, R];
}
const run = (e, sec, fs) => run2(e, sec, fs)[0];
function render(key, params, vel, sec, quality) {
  const e = engine(params, quality);
  e.noteOn(key, vel);
  return run(e, sec);
}
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±20 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-20 / 1200), hi = f0 * 2 ** (20 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// Harmonics 1..n of a steady note at f, relative to the first.
function harmonics(x, f, n, a = 19200, b = a + 38400) {
  const h1 = tone(x, f, a, b);
  return Array.from({ length: n }, (_, k) => tone(x, f * (k + 1), a, b) / h1);
}
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(4)} against ${want.toFixed(4)}`);

// Adler's equation dφ/dt = Δ − K sin φ, integrated by RK4 (step h) for t seconds from φ0.
function adler(delta, K, phi0, t, h = 1e-6) {
  let phi = phi0;
  const f = (p) => delta - K * Math.sin(p);
  for (let s = 0; s < t / h; s++) {
    const k1 = f(phi), k2 = f(phi + (h * k1) / 2), k3 = f(phi + (h * k2) / 2), k4 = f(phi + h * k3);
    phi += (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
  }
  return phi;
}

console.log('physics');
test('the heterodyne: the mean beat of two pulling oscillators is √(Δ² − K²) (Adler, 1946), as the equation integrates', () => {
  for (const [D, K] of [[100, 0], [100, 30], [100, 80], [40, 39]]) {
    const w = 2 * Math.PI, T = 2, phi = adler(w * D, w * K, 0, T, 2e-5);
    const measured = phi / (2 * Math.PI * T); // turns per second, to within a turn over T
    near(measured, M.beat(D, K), 0.5 / T + 0.01, `Δ ${D} Hz, K ${K} Hz`);
  }
  assert.equal(M.beat(20, 30), 0, 'locked: no beat');
});
test('locked (K > Δ): the phase settles where sin φ = Δ/K, the fixed point of Adler\'s equation', () => {
  const D = 2 * Math.PI * 10, K = 2 * Math.PI * 25, phi = adler(D, K, 0, 1, 2e-5);
  near(Math.sin(phi), D / K, 1e-6, 'sin φ');
});
test('the beat\'s harmonics fall as rⁿ, r = (Δ − √(Δ² − K²))/K, as an integration of Adler\'s equation shows', () => {
  // the closed-form spectrum against cos φ(t) integrated here and Fourier-analysed over one period
  const D = 2 * Math.PI * 100, K = 2 * Math.PI * 60, Om = Math.sqrt(D * D - K * K), T = (2 * Math.PI) / Om, n = 4000;
  const c = new Float64Array(5), s = new Float64Array(5);
  let phi = 0;
  const h = T / n, f = (p) => D - K * Math.sin(p);
  for (let i = 0; i < n; i++) {
    for (let k = 1; k <= 4; k++) { c[k] += Math.cos(phi) * Math.cos(k * Om * i * h); s[k] += Math.cos(phi) * Math.sin(k * Om * i * h); }
    const k1 = f(phi), k2 = f(phi + (h * k1) / 2), k3 = f(phi + (h * k2) / 2), k4 = f(phi + h * k3);
    phi += (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
  }
  const r = M.ratio(D, K);
  near(r, (D - Om) / K, 1e-12, 'r');
  for (let k = 2; k <= 4; k++) near(Math.hypot(c[k], s[k]) / Math.hypot(c[1], s[1]), r ** (k - 1), 2e-3, `harmonic ${k}`);
});
test('the intensity key: the level for a force follows Quartier et al.\'s Table II (45 dB at 0.39 N to 95 dB at 9.6 N)', () => {
  const table = [[0.39, 45], [0.47, 53.3], [0.52, 61.6], [0.62, 70], [0.82, 78.3], [1.34, 86.6], [9.6, 95]];
  for (const [F, dB] of table) near(M.levelDb(F), dB, 1e-9, `${F} N`);
  near(M.keyGain(9.6), 1, 1e-12, 'hardest');
  assert.equal(M.keyGain(0.04), 0, 'the contact opens at the top');
  // velocity spans the usual finger forces, 0.3 to 3 N, in log force; aftertouch presses to 9.6 N
  near(M.keyForce(0), 0.3, 1e-12, 'v 0'); near(M.keyForce(1), 3, 1e-12, 'v 1'); near(M.keyForce(0.5), Math.sqrt(0.9), 1e-12, 'v 0.5');
  near(M.keyForce(0.5, 1), 9.6, 1e-12, 'aftertouch');
});
test('the tam-tam: the free plate\'s frequency equation gives Leissa\'s (1969) λ² for ν = 0.3 to 5×10⁻⁴; its modes for bronze are its roots', () => {
  // Leissa, Vibration of Plates (NASA SP-160): (2,0) (0,1) (3,0) (1,1) (4,0) (5,0) (2,1) (0,2)
  const leissa = [[2, 5.358], [0, 9.003], [3, 12.439], [1, 20.475], [4, 21.835], [5, 33.495], [2, 35.260], [0, 38.443]];
  for (const [m, l2] of leissa) {
    let lo = Math.sqrt(l2) * 0.99, hi = Math.sqrt(l2) * 1.01;
    const f = (x) => M.plateEquation(m, x, 0.3), flo = f(lo);
    assert.ok((flo > 0) !== (f(hi) > 0), `a root near (${m}) ${l2}`);
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if ((f(mid) > 0) === (flo > 0)) lo = mid; else hi = mid; }
    assert.ok(Math.abs(lo * lo / l2 - 1) < 5e-4, `m ${m}: λ² ${(lo * lo).toFixed(4)} against ${l2}`);
  }
  const modes = M.plateModes();
  for (const x of modes.slice(0, 40)) assert.ok(Math.abs(M.plateEquation(x.m, x.lam)) < 1e-6, `root (${x.m}, λ ${x.lam})`);
  // Kirchhoff: f = λ² √(D/ρh) / (2π a²), D = E h³/12(1 − ν²)
  const a = 0.275, h = M.GONG_H, D = (M.BRONZE_E * h ** 3) / (12 * (1 - M.BRONZE_NU ** 2));
  near(M.plateHz(0.55), Math.sqrt(D / (M.BRONZE_RHO * h)) / (2 * Math.PI * a * a), 1e-9, 'Hz per λ²');
});
test('the springs: F_C is Parker & Bilbao\'s 3r√(E/ρ)/(16√5 π R²) within 0.5 %, and the dispersion falls to zero at k = 1/R', () => {
  const c = Math.sqrt(M.BRASS_E / M.BRASS_RHO), fc = (3 * M.SPRING_r * c) / (16 * Math.sqrt(5) * Math.PI * M.SPRING_R ** 2);
  assert.ok(Math.abs(M.springFc() / fc - 1) < 0.005, `${M.springFc()} against ${fc}`);
  assert.ok(M.springOmega(1 / M.SPRING_R) < 1e-9, 'the whole coil moving sideways');
  // the low-frequency limit: a wave of constant speed κ/R along the wire
  const kappa = 0.5 * M.SPRING_r * c, k = 0.01 / M.SPRING_R;
  near(M.springOmega(k) / k, kappa / M.SPRING_R, 1e-3 * kappa / M.SPRING_R, 'c₀');
});

console.log('engine');
test('tuning: every key sounds its note in the keyboard\'s tuning within 1 ¢, pulled or not (A = 440 and 415)', () => {
  for (const o of [{}, { pull: 20 }, { pitch: 415 }, { temperament: 'meantone' }]) {
    for (const k of [21, 28, 33, 45, 57, 60, 69, 81, 93, 100, 108]) {
      const p = P({ ...DRY, ...o }), f = tunedFreq(p, k), x = render(k, p, 0.7, 1.2);
      const got = peak(x, f, 9600, 57600);
      assert.ok(Math.abs(cents(got, f)) < 1, `${JSON.stringify(o)} key ${k}: ${got.toFixed(3)} Hz against ${f.toFixed(3)} (${cents(got, f).toFixed(2)} ¢)`);
    }
  }
});
test('the engine\'s beat: its harmonics fall as rⁿ with the pull (the onde through a weak detector)', () => {
  const k = 52, f = tunedFreq(P(), k), K = 40, D = M.trim(f, K), r = M.ratio(D, K);
  const x = render(k, P({ ...DRY, pull: K, balance: 0.02 }), 0.7, 1.4);
  const h = harmonics(x, f, 3, 9600, 9600 + 48000);
  near(h[1], r, 0.03 * r + 0.002, 'second'); near(h[2], r * r, 0.05 * r * r + 0.002, 'third');
});
test('the detector: equal oscillators give a full-wave rectified sine, harmonics 1/(4n² − 1): 2nd 0.2, 3rd 3/35', () => {
  const k = 57, f = tunedFreq(P(), k), x = render(k, P({ ...DRY, pull: 0, balance: 1 }), 0.7, 1.4);
  const h = harmonics(x, f, 3);
  near(h[1], 0.2, 0.006, 'second'); near(h[2], 3 / 35, 0.004, 'third');
});
test('the timbres: G odd harmonics 1/n, g 1/n², C the even ones of a half-wave rectifier, N a pulse\'s sin(nπw)/n, 8 the octave', () => {
  const k = 57, f = tunedFreq(P(), k), base = { ...DRY, tO: false, pull: 0 };
  const h = (o) => harmonics(render(k, P({ ...base, ...o }), 0.7, 1.4), f, 5);
  const G = h({ tG: true }), g = h({ tg: true }), C = h({ tC: true }), N = h({ tN: true, width: 0.2 });
  near(G[2], 1 / 3, 0.01, 'G 3rd'); near(G[4], 1 / 5, 0.01, 'G 5th'); assert.ok(G[1] < 0.005, `G 2nd ${G[1]}`);
  near(g[2], 1 / 9, 0.006, 'g 3rd'); near(g[4], 1 / 25, 0.004, 'g 5th'); assert.ok(g[1] < 0.005, `g 2nd ${g[1]}`);
  // ½ cos θ + (2/3π) cos 2θ − (2/15π) cos 4θ …: relative 4/3π and 4/15π, no odd ones past the first
  near(C[1], 4 / (3 * Math.PI), 0.01, 'C 2nd'); near(C[3], 4 / (15 * Math.PI), 0.006, 'C 4th'); assert.ok(C[2] < 0.005, `C 3rd ${C[2]}`);
  for (const n of [2, 3, 4]) near(N[n - 1], Math.abs(Math.sin(n * Math.PI * 0.2) / (n * Math.sin(Math.PI * 0.2))), 0.012, `N ${n}`);
  const x = render(k, P({ ...base, octave: 1 }), 0.7, 1.4);
  assert.ok(tone(x, f, 19200, 57600) < 0.01 * tone(x, 2 * f, 19200, 57600), 'the octaviant alone: no fundamental');
});
test('band-limiting: the gamba\'s square at E7 keeps its loudest alias (11th harmonic, folded to 19 kHz) 30 dB down', () => {
  const k = 100, f = tunedFreq(P(), k), x = render(k, P({ ...DRY, tO: false, tG: true, pull: 0, dP: 1 }), 0.7, 1.2);
  const alias = Math.abs(11 * f - FS), a = tone(x, alias, 9600, 48000), h1 = tone(x, f, 9600, 48000);
  assert.ok(20 * Math.log10(a / h1) < -30, `${(20 * Math.log10(a / h1)).toFixed(1)} dB (naive: ${(20 * Math.log10(1 / 11)).toFixed(1)} dB before the loudspeaker)`);
});
test('the intensity key in the engine: two velocities differ in level as Table II says for their forces', () => {
  const k = 60, f = tunedFreq(P(), k), lv = (v) => 20 * Math.log10(tone(render(k, P(DRY), v, 1), f, 19200, 43200));
  for (const [v1, v2] of [[0.2, 0.5], [0.5, 0.9]]) {
    const want = M.levelDb(0.3 * 10 ** v2) - M.levelDb(0.3 * 10 ** v1);
    near(lv(v2) - lv(v1), want, 0.3, `${v1} → ${v2}`);
  }
});
test('aftertouch presses harder: louder, up to the loudest nuance at 9.6 N', () => {
  const e = engine(P(DRY));
  e.noteOn(60, 0.4); run(e, 0.5);
  const before = e.voices[0].F;
  e.handle({ type: 'pressure', value: 1, key: 60 }); run(e, 0.5);
  near(before, M.keyForce(0.4), 0.01, 'velocity\'s force'); near(e.voices[0].F, 9.6, 0.05, 'aftertouch\'s');
});
test('release: the key comes up, the level dies away, the voice ends and the output falls silent', () => {
  const e = engine(P(DRY));
  e.noteOn(60, 0.8); run(e, 0.4); e.noteOff(60); run(e, 0.3);
  assert.equal(e.voiceCount(), 0);
  const x = run(e, 0.2);
  assert.ok(rms(x) < 1e-5, `rms ${rms(x)}`);
});
test('the ribbon: one voice slides from key to key, evenly in semitones (the geometric mean halfway), and back', () => {
  const glide = 0.2, e = engine(P({ ...DRY, mode: 'ribbon', glide }));
  e.noteOn(48, 0.7); run(e, 0.2); e.noteOn(60, 0.7);
  run(e, glide / 2);
  assert.equal(e.voices.length, 1);
  const f1 = tunedFreq(P(), 48), f2 = tunedFreq(P(), 60);
  near(cents(e.voices[0].f, Math.sqrt(f1 * f2)), 0, 15, 'halfway');
  run(e, glide);
  near(cents(e.voices[0].f, f2), 0, 0.01, 'arrived');
  e.noteOff(60); run(e, glide * 1.5);
  near(cents(e.voices[0].f, f1), 0, 0.01, 'back to the key still held');
});
test('the keyboard\'s vibrato: the note swings ±depth cents at the rate set; the mod wheel\'s own slide (MPE) on one key alone', () => {
  const e = engine(P({ ...DRY, vibrato: 30, vibRate: 5 }));
  e.noteOn(60, 0.7); run(e, 0.2);
  let lo = Infinity, hi = 0;
  for (let i = 0; i < 100; i++) { run(e, 0.004); const f = e.voices[0].f; lo = Math.min(lo, f); hi = Math.max(hi, f); }
  near(cents(hi, lo) / 2, 30, 1, 'depth');
  const m = engine(P(DRY));
  m.noteOn(60, 0.7); m.noteOn(64, 0.7);
  m.handle({ type: 'noteBend', key: 64, value: 2 ** (5 / 12) }); run(m, 0.3);
  const [a, b] = [...m.voices].sort((x, y) => x.key - y.key);
  near(cents(a.f, tunedFreq(P(), 60)), 0, 0.01, 'unbent'); near(cents(b.f, tunedFreq(P(), 64)), 500, 0.5, 'bent a fourth');
});
test('drift: none at the defaults; with it on, the oscillators wander by about the rms set, the same hertz on every voice', () => {
  const e = engine(P(DRY));
  e.noteOn(40, 0.7); run(e, 1);
  assert.equal(e.drift, 0);
  const d = engine(P({ ...DRY, drift: 1 }));
  d.noteOn(40, 0.7); d.noteOn(80, 0.7);
  let s = 0, n = 0;
  for (let i = 0; i < 300; i++) { run(d, 0.1); s += d.drift ** 2; n++; const [a, b] = d.voices; near(a.delta - M.trim(a.f, P().pull), b.delta - M.trim(b.f, P().pull), 1e-6, 'same on both'); }
  const r = Math.sqrt(s / n);
  assert.ok(r > 0.5 && r < 1.6, `rms ${r.toFixed(2)} Hz over 30 s`);
});
test('the springs ring on after the note, at about the T60 set (at 500 Hz)', () => {
  const t60 = 2, e = engine(P({ dP: 0, dPalme: 0, dR: 1, springT60: t60 }));
  const modes = e.bank(0).filter((m) => m.f > 400 && m.f < 650);
  for (const m of modes) near(6.9078 / m.sigma, Math.min(3 * t60, (t60 * 500) / m.f), 0.02, `mode at ${m.f.toFixed(0)} Hz`);
  e.noteOn(60, 0.8); run(e, 0.3); e.noteOff(60);
  const tail = run(e, 1);
  assert.ok(rms(tail, 4800, 9600) > 0.01 * rms(tail, 0, 480) && rms(tail, 4800, 9600) > 1e-4, 'still ringing 0.1 s after the key');
});
test('the tam-tam\'s modes are the plate\'s for its diameter, driven where the coil meets it, decaying with a constant loss factor', () => {
  const e = engine(P({ dP: 0, dPalme: 0, dM: 1, gongD: 60, gongT60: 4 }));
  const hz = M.plateHz(0.6), want = M.plateModes().filter((m) => hz * m.lam ** 2 >= 40 && hz * m.lam ** 2 <= 6000 && m.w * m.w >= 1e-4);
  const got = e.bank(1);
  assert.equal(got.length, want.length);
  for (let i = 0; i < got.length; i += 17) {
    near(got[i].f / (hz * want[i].lam ** 2), 1, 1e-9, `mode ${i}`);
    near(6.9078 / got[i].sigma / Math.min(12, 4000 / got[i].f), 1, 1e-4, `T60 of mode ${i}`);
  }
});
test('the palme: a note rings its own string on after the key, for about the T60 set', () => {
  const t60 = 4, k = 57, f = tunedFreq(P(), k), e = engine(P({ dP: 0, dPalme: 1, palmeT60: t60 }));
  e.noteOn(k, 0.8); run(e, 1); e.noteOff(k);
  const x = run(e, 2.2);
  const a1 = tone(x, f, 4800, 4800 + 19200), a2 = tone(x, f, 4800 + 48000 * 1.5, 4800 + 48000 * 1.5 + 19200);
  const t = (-60 * 1.5) / (20 * Math.log10(a2 / a1));
  assert.ok(t > 0.7 * t60 && t < 1.3 * t60, `T60 ${t.toFixed(2)} s`);
});
test('the diffuseurs stand apart: the principal in the middle, the Résonance left, the Métallique right', () => {
  const lr = (o) => { const e = engine(P({ dP: 0, dPalme: 0, ...o })); e.noteOn(60, 0.7); const [L, R] = run2(e, 0.6); return rms(L, 9600) / rms(R, 9600); };
  near(lr({ dP: 1 }), 1, 1e-6, 'principal');
  assert.ok(lr({ dR: 1 }) > 2, 'Résonance left'); assert.ok(lr({ dM: 1 }) < 0.5, 'Métallique right');
});
test('output level is sane: a C4 at velocity 0.7 peaks 0.05–0.5; a chord on any preset under 1.5; no NaN', () => {
  const x = render(60, P(), 0.7, 1), pk = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(pk > 0.05 && pk < 0.5, `peak ${pk}`);
  for (const pr of PRESETS) {
    const e = engine(P(pr.p));
    for (const k of [48, 55, 60, 64]) e.noteOn(k, 0.9);
    const [L, R] = run2(e, 0.8);
    let m = 0;
    for (let i = 0; i < L.length; i++) { assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), pr.name); m = Math.max(m, Math.abs(L[i]), Math.abs(R[i])); }
    assert.ok(m < 1.5, `${pr.name}: ${m}`);
  }
});
test('extremes at 44.1 and 96 kHz: no NaN with the knobs at their ends, bent four octaves, with every diffuseur', () => {
  for (const fs of [44100, 96000]) {
    for (const o of [{ pull: 40, balance: 1 }, { tO: true, tC: true, tg: true, tG: true, tN: true, width: 0.05, octave: 1, souffle: 1 }, { dR: 1, dM: 1, dPalme: 1, springT60: 8, gongT60: 15, palmeT60: 15, gongD: 40 }, { mode: 'ribbon', glide: 0.005, drift: 3 }]) {
      const e = engine(P(o), undefined, fs);
      for (const k of [21, 60, 108]) e.noteOn(k, 1);
      e.handle({ type: 'noteBend', key: 108, value: 16 }); e.handle({ type: 'noteBend', key: 21, value: 1 / 16 });
      const x = run(e, 0.5, fs);
      for (const v of x) assert.ok(Number.isFinite(v) && Math.abs(v) < 10, `${JSON.stringify(o)} at ${fs}`);
    }
  }
});
test('Quality: at most 32 voices sound at High, 12 at Medium, 6 at Low; the tam-tam and springs keep fewer modes; a note keeps its sound', () => {
  for (const [quality, cap] of [['high', 32], ['medium', 12], ['low', 6]]) {
    const e = engine(P(DRY), quality);
    for (let i = 0; i < 40; i++) { e.noteOn(40 + i, 0.7); run(e, 0.02); }
    run(e, 0.2);
    assert.equal(e.voices.length, cap, quality);
  }
  const n = (q) => { const e = engine(P({ dM: 1, dR: 1 }), q); return [e.bank(0).length, e.bank(1).length]; };
  const [h, m, l] = [n('high'), n('medium'), n('low')];
  assert.ok(m[0] < 0.7 * h[0] && l[0] < 0.7 * m[0] && m[1] < 0.7 * h[1] && l[1] < 0.7 * m[1], `springs ${h[0]}/${m[0]}/${l[0]}, tam-tam ${h[1]}/${m[1]}/${l[1]}`);
  const hi = render(60, P(), 0.7, 0.5);
  for (const q of ['medium', 'low']) assert.ok(render(60, P(), 0.7, 0.5, q).every((v, i) => v === hi[i]), `${q}: the defaults' note sounds the same`);
});
test('CPU: ten voices through all four diffuseurs render well faster than real time', () => {
  const e = engine(P({ dR: 1, dM: 1, dPalme: 1, tG: true, octave: 0.5 }));
  for (const k of [36, 43, 48, 55, 60, 64, 67, 72, 76, 79]) e.noteOn(k, 0.8);
  run(e, 0.2);
  const t0 = performance.now(); run(e, 2); const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 0.6, `${(dt / 2 * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
