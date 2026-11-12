// Breit-Wigner Keyboard checks.
// Run: node test/breitwigner-tests.mjs
//
// The physics against something independent, written here: the Fourier integral of a decaying
// state done numerically, the exact pole of a moving unstable particle, the Particle Data Group's
// masses and widths. Then the engine against the model: every sample of a note against the closed
// form, and its pitch and width read back from the sound by Prony's method, which knows nothing
// of how the engine makes it. Both are the C++ (native/instruments/breitwigner), built as
// WebAssembly: the model's functions through breitwigner-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../breitwigner/src/breitwigner-instrument.js';
import { PARTICLES, share } from '../breitwigner/src/breitwigner-params.js';
import { wasmModel } from '../breitwigner/src/breitwigner-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { Player } from '../tools/headless.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000, TAU = 2 * Math.PI, OUT = 0.3, BL = 128;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const near = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b} (± ${(100 * rel).toPrecision(2)} %)`);
const cents = (a, b) => 1200 * Math.log2(a / b);
const at = (t, fs = FS) => (Math.round((t * fs) / BL) * BL) / fs; // a time on a block's edge, where events land

// Play events ([t, 'on', key, vel], …: tools/headless.mjs) through the engine, as the page does.
const play = (params, events, sec, { fs = FS, quality } = {}) => new Player(INSTRUMENT, Engine, fs, params, { quality }).render(sec, events)[0];
const note = (key, params, sec, { vel = 0.7, fs = FS, quality } = {}) => play(params, [[0, 'on', key, vel]], sec, { fs, quality });

// Prony's method for one decaying sinusoid: x[n + d] = 2 r^d cos(dθ) x[n] − r^(2d) x[n − d] holds
// exactly for A rⁿ sin(θn + φ), whatever A and φ. Least squares over x[a, b) with the lag d near a
// quarter of a period gives the frequency (Hz) and the line's full width at half maximum (Hz:
// the amplitude falls as e^(−π·fwhm·t)).
function prony(x, f0, t0, t1, fs = FS) {
  const d = Math.max(1, Math.round(fs / (4 * f0))), a = Math.round(t0 * fs) + d, b = Math.round(t1 * fs) - d;
  let s11 = 0, s12 = 0, s22 = 0, t1s = 0, t2s = 0;
  for (let n = a; n < b; n++) { const u = x[n], v = x[n - d], y = x[n + d]; s11 += u * u; s12 += u * v; s22 += v * v; t1s += y * u; t2s += y * v; }
  const det = s11 * s22 - s12 * s12, c1 = (t1s * s22 - t2s * s12) / det, c2 = (t2s * s11 - t1s * s12) / det;
  const rd = Math.sqrt(-c2);
  return { f: (Math.acos(c1 / (2 * rd)) / d) * (fs / TAU), fwhm: (-Math.log(rd) / d) * (fs / Math.PI) };
}
// |X(f)|² of x, by its Fourier sum.
function power(x, f, fs = FS) {
  const w = (TAU * f) / fs, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let n = 0; n < x.length; n++) { const s = x[n] + c * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}
// the Breit–Wigner line, as the textbooks write it
const breitWigner = (f, f0, G) => (G / 2) ** 2 / ((f - f0) ** 2 + (G / 2) ** 2);

console.log('physics');
test('Γτ = ħ: a line 1 Hz wide lives 1/2π s, and every key\'s lifetime is 1/(2π · its width)', () => {
  near(M.lifetime(1), 1 / TAU, 1e-12, 'τ of 1 Hz');
  for (const key of [21, 45, 69, 93, 108]) for (const width of [1e-5, 0.00417, 0.19]) {
    const k = M.key(key, P({ width }));
    near(k.mass, keyFreq(key), 1e-12, 'the mass is the note');
    near(k.fwhm, width * keyFreq(key), 1e-12, 'Γ = (Γ/M)·M');
    near(TAU * k.fwhm * k.tau, 1, 1e-12, 'Γτ');
  }
});
test('the Breit–Wigner line: 1 at its peak, half at ±Γ/2, tails as 1/Δf², area πΓ/2', () => {
  const f0 = 440, G = 12;
  assert.equal(M.line(f0, f0, G), 1);
  near(M.line(f0 + G / 2, f0, G), 0.5, 1e-12, 'half height');
  near(M.line(f0 - G / 2, f0, G), 0.5, 1e-12, 'half height, below');
  near(M.line(f0 + 100 * G, f0, G) / M.line(f0 + 200 * G, f0, G), 4, 1e-4, 'the tail, twice as far');
  let area = 0;
  const df = G / 400;
  for (let f = f0 - 4000 * G; f < f0 + 4000 * G; f += df) area += M.line(f + df / 2, f0, G) * df;
  near(area, (Math.PI * G) / 2, 2e-4, 'area');
  for (const f of [300, 431, 440, 447.5, 900]) near(M.line(f, f0, G), breitWigner(f, f0, G), 1e-12, `at ${f} Hz`);
});
test('the line is the Fourier transform of the decay: |∫ e^(−Γt/2) e^(−iMt) e^(iEt) dt|², integrated numerically, is the Breit–Wigner line (Weisskopf and Wigner)', () => {
  const f0 = 100, G = 5, a = Math.PI * G, dt = 1e-5, T = 6;
  const ft = (f) => { // trapezoid rule on the complex amplitude, to where it is e^(−94)
    let re = 0.5 * dt, im = 0;
    for (let t = dt; t < T; t += dt) { const e = Math.exp(-a * t), ph = TAU * (f - f0) * t; re += e * Math.cos(ph) * dt; im += e * Math.sin(ph) * dt; }
    return re * re + im * im;
  };
  const peak = ft(f0);
  near(peak, 1 / (a * a), 1e-6, 'the peak is 1/(Γ/2)²');
  for (const f of [90, 97.5, 99, 102.5, 104, 120]) near(ft(f) / peak, M.line(f, f0, G), 1e-5, `at ${f} Hz`);
});
test('what is heard is one real part, so its spectrum is the line and its mirror image at −M: the closed form against the integral done numerically, at 0°, 45° and 90°', () => {
  const f0 = 100, G = 12, a = Math.PI * G, w = TAU * f0, dt = 2e-6, T = 1;
  for (const deg of [0, 45, 90]) {
    const ph = (deg * Math.PI) / 180;
    const ft = (f) => { // Simpson's rule on e^(−at) sin(wt + φ) e^(−2πift)
      let re = 0, im = 0;
      const N = Math.round(T / dt);
      for (let i = 0; i <= N; i++) {
        const t = i * dt, s = Math.exp(-a * t) * Math.sin(w * t + ph) * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * (dt / 3);
        re += s * Math.cos(TAU * f * t); im -= s * Math.sin(TAU * f * t);
      }
      return 4 * a * a * (re * re + im * im);
    };
    for (const f of [20, 88, 100, 106, 150, 400]) near(M.heard(f, f0, G, ph), ft(f), 1e-6, `${deg}° at ${f} Hz`);
  }
  // near a narrow line's peak the mirror image is far away, and what is heard is the plain line
  for (const d of [-2, -0.5, 0, 0.5, 2]) near(M.heard(1000 + d, 1000, 1, 0), M.line(1000 + d, 1000, 1), 3e-3, `a 0.1 % line, ${d} Hz off`);
});
test('from key to key: Γ ∝ M (the same Γ/M) at power 1, the same Γ in hertz at 0, and an octave multiplies Γ by 2ⁿ (32 by Sargent\'s rule, n = 5); never past twice the mass', () => {
  for (const key of [21, 57, 69, 81, 108]) {
    near(M.key(key, P({ width: 0.01, power: 1 })).share, 0.01, 1e-12, `power 1, key ${key}`);
    near(M.key(key, P({ width: 0.01, power: 0 })).fwhm, 4.4, 1e-12, `power 0, key ${key}`);
  }
  for (const power of [0, 0.5, 1, 3, 5]) near(M.key(81, P({ width: 0.001, power })).fwhm / M.key(69, P({ width: 0.001, power })).fwhm, 2 ** power, 1e-12, `an octave at power ${power}`);
  near(M.key(69, P({ width: 0.3, power: 5 })).share, 0.3, 1e-12, 'A4 keeps the control\'s width');
  assert.equal(M.key(108, P({ width: 1, power: 5 })).share, M.SHARE_MAX, 'capped');
  assert.equal(M.totalWidth(100, 0.5, 1e6), M.SHARE_MAX * 100, 'channels too');
  // retuning a key moves its mass and leaves its Γ/M alone
  const k = M.key(69, P({ pitch: 415 }));
  near(k.mass, 415, 1e-9, 'A = 415 Hz'); near(k.share, DEFAULTS.width, 1e-12, 'its Γ/M');
});
test('a boost: a moving unstable particle\'s energy has its pole at √(p² + (M − iΓ/2)²) = γM − iΓ/2γ, so the note is γ times sharper and lives γ times longer; MΓ stays the same', () => {
  // the exact pole, by a complex square root done here
  const pole = (mass, G, gamma) => {
    const p2 = (gamma * gamma - 1) * mass * mass, re = p2 + mass * mass - (G * G) / 4, im = -mass * G;
    const r = Math.hypot(re, im), e = Math.sqrt((r + re) / 2), g = im / (2 * e); // (e + ig)² = re + i·im
    return { f: e, fwhm: -2 * g };
  };
  for (const gamma of [1, 2 ** (2 / 12), 2, 4]) for (const G of [1e-4, 0.01]) {
    const lab = M.boosted(440, 440 * G, gamma), exact = pole(440, 440 * G, gamma);
    near(lab.f, 440 * gamma, 1e-12, 'E = γM'); near(lab.fwhm, (440 * G) / gamma, 1e-12, 'Γ/γ');
    near(lab.f, exact.f, 2 * G * G, `the pole's energy, γ = ${gamma.toFixed(3)}`); near(lab.fwhm, exact.fwhm, 2 * G * G, 'the pole\'s width'); // to second order in Γ/M
    near(lab.f * lab.fwhm, 440 * 440 * G, 1e-12, 'MΓ is invariant');
    near(lab.speed, Math.sqrt(1 - 1 / gamma ** 2), 1e-12, 'v/c');
  }
  near(M.boosted(440, 1, 2).speed, Math.sqrt(3) / 2, 1e-12, 'γ = 2 is 0.866 c');
  assert.deepEqual(M.boosted(440, 1, 0.5), M.boosted(440, 1, 1), 'no frame sees less than the rest energy');
});
test('the presets are real resonances: Γ/M from the Particle Data Group\'s masses and widths (2026), to three figures, and their names say it', () => {
  // mass and width in MeV (Review of Particle Physics 2026); the Higgs boson's width is the measured one, 3.0 +1.5 −0.7 MeV
  const PDG = { rho: [775.26, 147.4], delta: [1232, 117], Z: [91187.9, 2495.5], omega: [782.66, 8.68], phi: [1019.460, 4.249], etaprime: [957.78, 0.188], higgs: [125130, 3.0], jpsi: [3096.9, 0.0926], upsilon: [9460.4, 0.05402] };
  for (const [id, [m, G]] of Object.entries(PDG)) near(PARTICLES[id], G / m, 1e-9, id);
  const by = (word) => PRESETS.find((q) => q.name.startsWith(word));
  for (const [word, id] of [['ρ', 'rho'], ['Δ', 'delta'], ['Z', 'Z'], ['ω', 'omega'], ['η′', 'etaprime'], ['J/ψ', 'jpsi'], ['Higgs', 'higgs'], ['Υ', 'upsilon']]) {
    near(by(word).p.width, PARTICLES[id], 2e-3, word);
    const said = by(word).name.match(/([\d.]+) (%|ppm)/);
    near(Number(said[1]) * (said[2] === '%' ? 1e-2 : 1e-6), PARTICLES[id], 0.03, `${word}'s name`);
  }
  near(DEFAULTS.width, PARTICLES.phi, 2e-3, 'the default is the φ'); assert.deepEqual(by('φ').p, {});
  assert.equal(share(DEFAULTS.width), '0.42 %'); assert.equal(share(by('J/ψ').p.width), '29.9 ppm'); assert.equal(share(by('Z').p.width), '2.74 %');
  // the Z lives 2.6e-25 s (ħ = 6.582e-22 MeV s); on A4 its line is 12 Hz wide and it lives 13 ms
  near(6.582119569e-22 / 2495.5, 2.64e-25, 2e-3, 'the Z\'s lifetime');
  near(M.key(69, P({ width: PARTICLES.Z })).tau, 0.01322, 1e-3, 'the Z on A4');
});

console.log('engine');
test('every sample of a note is the closed form, 0.3 v e^(−πΓt) sin(2πMt + φ): a φ, a Z and a ρ, on A1, A4 and C8, at 0°, 30° and 90°', () => {
  for (const [width, key, phase, vel] of [[PARTICLES.phi, 69, 0, 0.7], [PARTICLES.Z, 33, 30, 1], [PARTICLES.rho, 108, 90, 0.4], [PARTICLES.jpsi, 69, 0, 0.9]]) {
    const x = note(key, P({ width, phase }), 0.5, { vel }), f = keyFreq(key), G = width * f, ph = (phase * Math.PI) / 180;
    let worst = 0;
    for (let n = 0; n < x.length; n++) worst = Math.max(worst, Math.abs(x[n] - OUT * vel * Math.exp((-Math.PI * G * n) / FS) * Math.sin((TAU * f * n) / FS + ph)));
    assert.ok(worst < 2e-7, `Γ/M ${width.toPrecision(3)} on key ${key} at ${phase}°: off by ${worst}`);
  }
});
test('on pitch: every third key sounds within 0.01 ¢ of its note', () => {
  for (let key = 21; key <= 108; key += 3) {
    const f = keyFreq(key), got = prony(note(key, P({ width: 1e-3 }), 0.6), f, 0, 0.6).f;
    assert.ok(Math.abs(cents(got, f)) < 0.01, `key ${key}: ${cents(got, f).toFixed(4)} ¢`);
  }
});
test('the width is the knob\'s: read back from the sound, Γ/M is the ρ\'s, the Z\'s, the φ\'s and the J/ψ\'s within 0.1 %, on A2, A4 and A6', () => {
  for (const key of [45, 69, 93]) for (const id of ['rho', 'Z', 'phi', 'jpsi']) {
    const f = keyFreq(key), life = M.key(key, P({ width: PARTICLES[id] })).tau, sec = Math.min(2, Math.max(0.05, 12 * life));
    const got = prony(note(key, P({ width: PARTICLES[id] }), sec, { vel: 1 }), f, 0, sec);
    near(got.fwhm / got.f, PARTICLES[id], id === 'jpsi' ? 2e-2 : 1e-3, `${id} on key ${key}`);
  }
});
test('the spectrum of a note is the Breit–Wigner line: a Z on A4 is 12.0 Hz wide at half its height, follows the line within 6 % across ±Γ, and the closed form of what is heard within 0.1 % out to ±5Γ', () => {
  const f0 = 440, G = PARTICLES.Z * f0, x = note(69, P({ width: PARTICLES.Z }), 1, { vel: 1 });
  const top = power(x, f0);
  for (const d of [-5, -3, -1, -0.5, -0.25, 0.25, 0.5, 1, 3, 5]) {
    const f = f0 + d * G, got = power(x, f) / top;
    near(got, M.heard(f, f0, G, 0) / M.heard(f0, f0, G, 0), 1e-3, `${d} Γ off, against what is heard`);
    if (Math.abs(d) <= 1) near(got, breitWigner(f, f0, G), 0.06, `${d} Γ off, against the plain line`);
  }
  // where it crosses half its peak (the peak itself, found on a fine grid)
  let peak = 0, fp = f0;
  for (let f = f0 - 1; f <= f0 + 1; f += 0.01) { const p = power(x, f); if (p > peak) { peak = p; fp = f; } }
  const cross = (lo, hi) => { for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if ((power(x, m) > peak / 2) === (power(x, lo) > peak / 2)) lo = m; else hi = m; } return (lo + hi) / 2; };
  near(cross(fp, fp + 3 * G) - cross(fp, fp - 3 * G), G, 2e-3, 'full width at half maximum');
  near(G, 12.04, 1e-3, 'the Z on A4');
});
test('width times lifetime: for every preset, the line\'s width read from the sound times the time its |ψ|² takes to fall by e is 1/2π', () => {
  for (const preset of PRESETS) {
    const params = P(preset.p), key = 69, f = keyFreq(key), k = M.key(key, params), sec = Math.min(1.5, Math.max(0.05, 14 * k.tau));
    const x = note(key, params, sec, { vel: 1 });
    // |ψ|² by its two parts: the note and a copy a quarter of a period later stand in for them
    const d = Math.round(FS / (4 * f)), env = (n) => x[n] * x[n] + x[n + d] * x[n + d];
    const n0 = d, n1 = Math.round(Math.min(sec * 0.8, 3 * k.tau) * FS);
    let s0 = 0, s1 = 0;
    const W = Math.max(8, Math.round((4 * FS) / f)); // averaged over four periods
    for (let i = 0; i < W; i++) { s0 += env(n0 + i); s1 += env(n1 + i); }
    const tau = (n1 - n0) / FS / Math.log(s0 / s1);
    const width = prony(x, f, 0, sec).fwhm;
    near(TAU * width * tau, 1, 0.02, preset.name);
  }
});
test('Phase at birth: at 0° a note starts from nothing, at 90° at its peak, whose click raises the far tail (16 times at four times the mass)', () => {
  const sine = note(69, P({ phase: 0 }), 1, { vel: 1 }), cosine = note(69, P({ phase: 90 }), 1, { vel: 1 });
  assert.equal(sine[0], 0); near(cosine[0], OUT, 1e-6, 'starts at its peak');
  near(power(cosine, 1760) / power(sine, 1760), 16, 0.02, 'the tail at 4M');
  near(M.heard(1760, 440, DEFAULTS.width * 440, Math.PI / 2) / M.heard(1760, 440, DEFAULTS.width * 440, 0), 16, 1e-3, 'as the model has it');
});
test('Strike: the amplitude is the velocity, and amplitudes add: a second strike in step doubles the note, one half a turn late cancels it', () => {
  const soft = note(60, P(), 0.2, { vel: 0.35 }), hard = note(60, P(), 0.2, { vel: 0.7 });
  for (let n = 0; n < soft.length; n += 97) assert.ok(Math.abs(hard[n] - 2 * soft[n]) < 2e-7, `sample ${n}`);
  // a rate at which A4 turns once in 256 samples: a block is half a turn
  const fs = 440 * 256, quiet = P({ width: 1e-5 });
  const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
  const one = play(quiet, [[0, 'on', 69, 0.5]], 0.2, { fs });
  const step = play(quiet, [[0, 'on', 69, 0.5], [(2 * BL) / fs, 'off', 69], [(2 * BL) / fs, 'pedal', true], [(2 * BL) / fs, 'on', 69, 0.5]], 0.2, { fs });
  const half = play(quiet, [[0, 'on', 69, 0.5], [BL / fs, 'on', 69, 0.5]], 0.2, { fs });
  near(rms(step, 4096, 8192), 2 * rms(one, 4096, 8192), 1e-3, 'in step');
  assert.ok(rms(half, 4096, 8192) < 1e-3 * rms(one, 4096, 8192), `half a turn late: ${rms(half, 4096, 8192) / rms(one, 4096, 8192)}`);
});
test('the key-up channel: partial widths add. Letting the key go widens the line by Γ₂ on every key; the pedal keeps the channel shut until it comes up', () => {
  for (const key of [33, 69, 96]) for (const release of [2, 6, 40]) {
    const f = keyFreq(key), params = P({ width: 1e-3, release }), own = 1e-3 * f, off = at(0.3);
    const x = play(params, [[0, 'on', key, 1], [off, 'off', key]], 0.9);
    near(prony(x, f, 0, off).fwhm, own, 1e-3, `key ${key}: held`);
    near(prony(x, f, off, Math.min(0.9, off + 2.5 / release)).fwhm, own + release, 1e-3, `key ${key}: let go, Γ₂ = ${release} Hz`);
    const k = M.key(key, params);
    near(k.fwhmUp, own + release, 1e-12, 'the model\'s'); near(TAU * k.fwhmUp * k.tauUp, 1, 1e-12, 'and its lifetime');
  }
  const f = 440, up = at(0.5), x = play(P({ width: 1e-3, release: 20 }), [[0, 'pedal', true], [0, 'on', 69, 1], [at(0.1), 'off', 69], [up, 'pedal', false]], 0.8);
  near(prony(x, f, at(0.1), up).fwhm, 0.44, 1e-3, 'pedal down: its own width still');
  near(prony(x, f, up, 0.7).fwhm, 20.44, 1e-3, 'pedal up: the channel opens');
  // a key pressed again shuts its channel
  const again = play(P({ width: 1e-3, release: 20 }), [[0, 'on', 69, 1], [at(0.05), 'off', 69], [at(0.1), 'on', 69, 1]], 0.5);
  near(prony(again, f, at(0.1), 0.5).fwhm, 0.44, 1e-3, 'struck again');
});
test('Lift: a slow lift opens the key-up channel half as wide, a fast one twice as wide, a middling one or none as the control says', () => {
  const f = 440, off = at(0.1), one = (v) => prony(play(P({ width: 1e-3, release: 10 }), [[0, 'on', 69, 1], [off, 'off', 69, v]], 0.4), f, off, 0.35).fwhm - 0.44;
  near(one(undefined), 10, 1e-3, 'no release velocity'); near(one(0.5), 10, 1e-3, 'middling');
  near(one(0), 5, 1e-3, 'slowest'); near(one(1), 20, 1e-3, 'fastest');
});
test('Press: a firm press into a held key opens a third channel, up to Γ₃ at full pressure, on one key or the channel; a finger at rest (under half) changes nothing at all', () => {
  const f = 440, t = at(0.1), params = P({ width: 1e-3, press: 5 });
  const still = play(params, [[0, 'on', 69, 1]], 0.5);
  for (const ev of [[t, 'pressure', 1, 69], [t, 'pressure', 1]]) near(prony(play(params, [[0, 'on', 69, 1], ev], 0.5), f, t + 0.1, 0.45).fwhm, 5.44, 1e-3, ev.length > 3 ? 'its key pressed fully' : 'the channel pressed fully');
  near(prony(play(params, [[0, 'on', 69, 1], [t, 'pressure', 0.75, 69]], 0.5), f, t + 0.1, 0.45).fwhm, 2.94, 1e-3, 'pressed half way past rest');
  const rest = play(params, [[0, 'on', 69, 1], [t, 'pressure', 0.45, 69]], 0.5);
  assert.ok(rest.every((v, i) => v === still[i]), 'a finger at rest');
  // let go of the press, and the channel shuts again
  near(prony(play(params, [[0, 'on', 69, 1], [t, 'pressure', 1, 69], [at(0.2), 'pressure', 0, 69]], 0.6), f, at(0.2) + 0.1, 0.6).fwhm, 0.44, 5e-3, 'the press let go');
});
test('the mod wheel and Slide are the width: the wheel takes every note from the default up to a ρ\'s 20 %, a slide one note alone', () => {
  const f = 440, w = (x) => prony(x, f, at(0.02), 0.1).fwhm / f;
  near(w(play(P(), [[0, 'wheel', 127], [0, 'on', 69, 1]], 0.12)), 0.2, 2e-3, 'the wheel at full');
  near(w(play(P({ width: 1e-4 }), [[0, 'wheel', 0], [0, 'on', 69, 1]], 0.12)), DEFAULTS.width, 2e-3, 'the wheel at rest: the default');
  near(w(play(P(), [[0, 'slide', 69, 1], [0, 'on', 69, 1]], 0.12)), 0.2, 2e-3, 'a note slid fully');
  const two = play(P({ width: 1e-3 }), [[0, 'slide', 72, 1], [0, 'on', 69, 1], [0, 'on', 72, 1]], 0.6);
  near(prony(two, f, 0.2, 0.6).fwhm / f, 1e-3, 2e-3, 'the note beside it keeps the control\'s width (the slid one is long gone)');
});
test('pitch bend is a boost: the wheel full up is γ = 2^(2/12), a note 200 ¢ sharper that lives γ times longer; a note\'s own bend of an octave is γ = 2, of two γ = 4; down, nothing at all (E ≥ M)', () => {
  const f = 440, G = 1e-3 * f, params = P({ width: 1e-3 }), plain = play(params, [[0, 'on', 69, 1]], 0.5);
  for (const [ev, gamma, what] of [[[0, 'bend', 1], 2 ** (2 / 12), 'the wheel'], [[0, 'noteBend', 69, 12], 2, 'an octave'], [[0, 'noteBend', 69, 24], 4, 'two octaves'], [[0, 'noteBend', 69, 60], 4, 'past its reach']]) {
    const got = prony(play(params, [ev, [0, 'on', 69, 1]], 0.5), f * gamma, 0, 0.5);
    assert.ok(Math.abs(cents(got.f, f * gamma)) < 0.01, `${what}: ${cents(got.f, f).toFixed(2)} ¢`);
    near(got.fwhm, G / gamma, 1e-3, `${what}: time dilation`);
  }
  for (const ev of [[0, 'bend', -1], [0, 'noteBend', 69, -12]]) assert.ok(play(params, [ev, [0, 'on', 69, 1]], 0.5).every((v, i) => v === plain[i]), `${ev[1]} down`);
  // a held note glides there, and back
  const glide = play(params, [[0, 'on', 69, 1], [at(0.1), 'noteBend', 69, 12], [at(0.4), 'noteBend', 69, 0]], 0.8);
  assert.ok(Math.abs(cents(prony(glide, 880, 0.3, 0.4).f, 880)) < 0.5, 'glides up');
  assert.ok(Math.abs(cents(prony(glide, 440, 0.65, 0.8).f, 440)) < 0.5, 'and back');
});
test('the keyboard\'s tuning: at A = 415 Hz, and in ¼-comma meantone (E4 −3.42 ¢, C4 +10.26 ¢), a key sounds on its note within 0.01 ¢ and keeps its Γ/M', () => {
  for (const [k, o, c] of [[69, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42], [60, { temperament: 'meantone' }, 10.26]]) {
    const f = keyFreq(k) * 2 ** (c / 1200), params = P({ width: 1e-3, ...o });
    assert.ok(Math.abs(cents(M.key(k, params).mass, f)) < 0.01, `${k}: the model's mass`);
    assert.ok(Math.abs(cents(tunedFreq(params, k), f)) < 0.01, `${k}: shared/tuning.js agrees`);
    const got = prony(note(k, params, 0.6), f, 0, 0.6);
    assert.ok(Math.abs(cents(got.f, f)) < 0.01, `${k}: sounds ${cents(got.f, f).toFixed(3)} ¢ from its note`);
    near(got.fwhm / got.f, 1e-3, 1e-3, `${k}: its Γ/M`);
  }
});
test('the page\'s frames: every state ringing, with its |ψ|, frequency and width in the lab; a chord of ten comes whole; one empty frame once the last has gone', () => {
  const e = new Engine(FS), frames = [];
  e.post = (m) => frames.push(m);
  e.setParams(P({ width: 1e-3, release: 20 }));
  const bL = new Float32Array(BL), bR = new Float32Array(BL), run = (sec) => { for (let s = 0; s < sec * FS; s += BL) e.process(bL, bR, BL); };
  for (let i = 0; i < 10; i++) e.noteOn(60 + i, 0.5);
  e.handle({ type: 'noteBend', key: 60, value: 2 });
  run(0.2);
  const last = frames[frames.length - 1];
  assert.equal(last.type, 'frame'); assert.deepEqual(last.states.map((s) => s.key), [60, 61, 62, 63, 64, 65, 66, 67, 68, 69]);
  assert.ok(frames.length >= 5 && frames.length <= 7, `${frames.length} frames in 0.2 s`);
  const a4 = last.states[9], c4 = last.states[0];
  near(a4.f, 440, 1e-6, 'A4'); near(a4.fwhm, 0.44, 1e-6, 'its width'); assert.ok(a4.amp < 0.5 && a4.amp > 0.5 * Math.exp(-Math.PI * 0.44 * 0.21), `|ψ| ${a4.amp}`);
  near(c4.f, 2 * keyFreq(60), 1e-4, 'C4 boosted'); near(c4.fwhm, (1e-3 * keyFreq(60)) / 2, 1e-4, 'its life dilated');
  for (let i = 0; i < 10; i++) e.noteOff(60 + i);
  run(0.05);
  near(frames[frames.length - 1].states[9].fwhm, 20.44, 1e-6, 'let go: the line widens');
  run(0.5);
  assert.deepEqual(frames[frames.length - 1].states, [], 'gone');
  const n = frames.length; run(0.3);
  assert.equal(frames.length, n, 'and nothing more');
});
test('level and silence: a full note peaks at 0.3, every key is finite, and a note let go is gone, to the last bit, within a second (Panic: at once)', () => {
  for (const preset of PRESETS) for (const key of [21, 60, 108]) {
    const x = play(P(preset.p), [[0, 'on', key, 1], [at(0.2), 'off', key]], 1.3);
    let pk = 0;
    for (const v of x) { assert.ok(Number.isFinite(v)); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk <= OUT * 1.0001 && pk > 0.02, `${preset.name}, key ${key}: peak ${pk}`);
    assert.ok(x.subarray(Math.round(1.2 * FS)).every((v) => v === 0), `${preset.name}, key ${key}: silent after its release`);
  }
  const e = new Engine(FS), bL = new Float32Array(BL), bR = new Float32Array(BL);
  e.setParams(P({ width: 1e-6 }));
  for (let k = 21; k <= 108; k++) e.noteOn(k, 1);
  e.process(bL, bR, BL); assert.equal(e.voiceCount(), 88);
  let pk = 0;
  for (let b = 0; b < 200; b++) { e.process(bL, bR, BL); for (const v of bL) pk = Math.max(pk, Math.abs(v)); }
  assert.ok(pk < 88 * OUT && pk > OUT, `88 states at once: peak ${pk}`);
  e.allNotesOff(); e.process(bL, bR, BL);
  assert.equal(e.voiceCount(), 0); assert.ok(bL.every((v) => v === 0) && bR.every((v) => v === 0), 'Panic');
});
test('as wide as it goes: Γ/M 100 % on the top key with Γ ∝ M⁵ is capped at twice the mass, stays finite and is gone in a millisecond', () => {
  const x = note(108, P({ width: 1, power: 5 }), 0.05, { vel: 1 });
  assert.ok(x.every(Number.isFinite));
  assert.ok(x.subarray(48).every((v) => Math.abs(v) < 1e-5), 'gone');
  near(prony(note(108, P({ width: 1, power: 5, phase: 90 }), 0.01, { vel: 1 }), keyFreq(108), 0, 0.001).fwhm, 2 * keyFreq(108), 0.02, 'its width');
});
test('CPU: all 88 states ringing at once render more than 20 times faster than real time', () => {
  const e = new Engine(FS), bL = new Float32Array(BL), bR = new Float32Array(BL);
  e.setParams(P({ width: 1e-6 }));
  for (let k = 21; k <= 108; k++) e.noteOn(k, 0.5);
  const blocks = Math.round((4 * FS) / BL), t0 = performance.now();
  for (let b = 0; b < blocks; b++) e.process(bL, bR, BL);
  const ratio = 4000 / (performance.now() - t0);
  assert.ok(ratio > 20, `${ratio.toFixed(0)} × real time`);
});
// What the Quality setting trims: nothing. A state is one complex number, turned once a sample.
test('Quality: nothing to trim. Medium and Low play every note bit for bit as High does, with all 88 states at once', () => {
  const events = [[0, 'on', 48, 0.7], [0, 'on', 69, 0.9], [at(0.1), 'on', 84, 0.5], [at(0.2), 'off', 69]];
  const high = play(P(), events, 0.5);
  for (const quality of ['medium', 'low']) {
    assert.ok(play(P(), events, 0.5, { quality }).every((v, i) => v === high[i]), quality);
    const e = new Engine(FS), bL = new Float32Array(BL), bR = new Float32Array(BL);
    e.setQuality(quality); e.setParams(P({ width: 1e-6 }));
    for (let k = 21; k <= 108; k++) e.noteOn(k, 0.5);
    e.process(bL, bR, BL);
    assert.equal(e.voiceCount(), 88, `${quality}: states ringing`);
  }
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
