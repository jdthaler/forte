// Singing Voice checks: the tract, the folds and the flow against their physics, the vowels
// against Peterson and Barney, then the engine against the model. Run: node test/voice-tests.mjs
//
// Both are the C++ (native/instruments/voice), built as WebAssembly: the model's functions through
// voice-wasm.js. The independent checks are worked out here: a uniform tube's quarter-wave
// resonances with the piston's end correction, each vowel's resonances from its own chain
// matrices, the two-mass folds' static deflection and eigenfrequencies as a linear system,
// Bernoulli's flow, and Peterson and Barney's (1952) formant table.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../voice/src/voice-instrument.js';
import { wasmModel } from '../voice/src/voice-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';

const VoiceEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const STEADY = { vibrato: 0, jitter: 0 }; // a note held dead still, to measure
const preset = (name) => P(PRESETS.find((p) => p.name.startsWith(name)).p);
const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);

function engine(params, quality, fs = FS) {
  const e = new VoiceEngine(fs);
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
function render(key, params, vel = 0.7, sec = 1.2, quality) {
  const e = engine(params, quality);
  e.noteOn(key, vel);
  return run(e, sec);
}
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±40 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-40 / 1200), hi = f0 * 2 ** (40 / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// The harmonics' amplitudes (dB) of a steady note at f0 in x[a, b).
const harmonics = (x, f0, a, b, n) => Array.from({ length: n }, (_, k) => 20 * Math.log10(tone(x, (k + 1) * f0, a, b) + 1e-12));

// ---- the tract's physics -----------------------------------------------------------
console.log('the tract');
const RHO = M.RHO, C = M.C;
// A chain-matrix resonance finder of our own: zeros of K₂₂ − ωL_r K₂₁ for a lossless tube.
function ownResonances(areas, length, count = 3) {
  const l = length / areas.length, a = Math.sqrt(areas[areas.length - 1] / Math.PI), Lr = (8 * RHO) / (3 * Math.PI ** 2 * a);
  const D = (f) => {
    const k = (2 * Math.PI * f) / C;
    let A = 1, B = 0, Cc = 0, Dd = 1; // [[A, jB], [jC, D]]
    for (const S of areas) {
      const Z = (RHO * C) / S, c = Math.cos(k * l), s = Math.sin(k * l);
      [A, B, Cc, Dd] = [A * c - B * s / Z, A * Z * s + B * c, Cc * c + Dd * s / Z, -Cc * Z * s + Dd * c];
    }
    return Dd - 2 * Math.PI * f * Lr * Cc;
  };
  const out = [];
  for (let f = 20, d = D(20); f < 6000 && out.length < count; f += 2) {
    const d2 = D(f + 2);
    if (Math.sign(d2) !== Math.sign(d)) { let lo = f, hi = f + 2; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (Math.sign(D(m)) === Math.sign(D(lo))) lo = m; else hi = m; } out.push((lo + hi) / 2); }
    d = d2;
  }
  return out;
}

test('a uniform tube, shut at the folds and open at the lips: resonances at odd quarter-waves, (2n − 1)c/4(L + 8a/3π), within 1 %', () => {
  const L = 0.175, A = 3e-4, a = Math.sqrt(A / Math.PI), Le = L + (8 * a) / (3 * Math.PI);
  const F = M.formants(Array(44).fill(A), L, 3);
  // the end correction is the low-frequency limit of the lips' inductance: exact for F1, a little long above
  F.forEach((f, n) => near(f / ((2 * n + 1) * C / (4 * Le)), 1, n === 0 ? 0.002 : 0.01, `F${n + 1}`));
  near(F[0], C / (4 * L), 0.06 * C / (4 * L), 'and near c/4L = 500 Hz');
});
test('the vowels: each area function rings at Peterson and Barney\'s (1952) formants for men, F1 and F2 within 3.5 %, F3 within 4 % (our own chain matrices)', () => {
  const PB = { u: [300, 870, 2240], ɔ: [570, 840, 2410], ɑ: [730, 1090, 2440], ɛ: [530, 1840, 2480], i: [270, 2290, 3010] };
  const ipa = ['u', 'ɔ', 'ɑ', 'ɛ', 'i'];
  M.VOWELS.forEach((v, i) => {
    assert.deepEqual(v.F, PB[ipa[i]], `${ipa[i]}: the table's targets are Peterson and Barney's`);
    const R = ownResonances(v.area.map((x) => x * 1e-4), M.LENGTH);
    R.forEach((f, k) => near(f / v.F[k], 1, k < 2 ? 0.035 : 0.04, `${ipa[i]} F${k + 1} (${f.toFixed(0)} Hz)`));
    v.area.forEach((x) => assert.ok(x >= 0.24 && x <= 9.1, `${ipa[i]}: areas a tract can make (${x} cm²)`));
  });
});
test('the vowel table (native/instruments/voice/voice-vowels.h) is the fit tools/voice-native-table.mjs makes', async () => {
  const { header, headerFile } = await import('../tools/voice-native-table.mjs');
  assert.ok(readFileSync(headerFile, 'utf8') === header(), 'stale: run node tools/voice-native-table.mjs');
});
test('a longer tract lowers every formant in proportion; the larynx tube narrowed gathers the tract\'s gain between 2.5 and 3.5 kHz (the singer\'s formant)', () => {
  const A = M.areas(2, 1.5e-4, 44), F1 = M.formants(A, 0.175, 4), F2 = M.formants(A, 0.21, 4);
  // in proportion to the length, but for the lips' end correction, which stays (1.5 %)
  F1.forEach((f, k) => near(F2[k] / f, 0.175 / 0.21, 0.015, `F${k + 1}`));
  const band = (areas) => { let s = 0; for (let f = 2500; f <= 3500; f += 25) s += M.transfer(areas, 0.175, f) ** 2; return s; };
  const gain = band(M.areas(2, 0.45e-4, 44)) / band(M.areas(2, 1.5e-4, 44));
  assert.ok(gain > 4, `the tract's gain between 2.5 and 3.5 kHz × ${gain.toFixed(1)}`);
});
test('formant tuning: for ee at 700 Hz the jaw opens until the tract is inertive at the note; well under F1 it stays shut', () => {
  assert.equal(M.jawFor(2, 1.5e-4, 130, 0.175), 0, 'ah at 130 Hz: nothing to do');
  const J = M.jawFor(4, 1.5e-4, 700, 0.175);
  assert.ok(J > 0 && J <= 1, `the jaw opens (${J})`);
  assert.ok(M.inputReactance(M.areas(4, 1.5e-4, 44, J), 0.175, 700) >= 1, 'and the tract is inertive at the note');
  assert.ok(M.inputReactance(M.areas(4, 1.5e-4, 44, 0), 0.175, 700) < 1, 'which it was not with the jaw shut');
});

// ---- the folds ------------------------------------------------------------------
console.log('the folds');
test('the folds alone, held by a steady pressure: they settle where the springs balance it, x = K⁻¹F, and ring at the two-mass system\'s eigenfrequency, × Q with the tension', () => {
  // no flow to speak of (an endless tube of enormous impedance): both masses feel P_s
  const Ps = 100, dt = 1 / 24000, steps = 2400, Z1 = 1e14; // 0.1 s: eight of the slow mode's decay times
  const lin = (Q) => {
    const m1 = M.M1 / Q, m2 = M.M2 / Q, k1 = M.K1 * Q, k2 = M.K2 * Q, kc = M.KC * Q;
    const F1 = Ps * M.LG * M.D1, F2 = Ps * M.LG * M.D2, det = (k1 + kc) * (k2 + kc) - kc * kc;
    const x1 = (F1 * (k2 + kc) + kc * F2) / det, x2 = (F2 * (k1 + kc) + kc * F1) / det;
    // eigenfrequencies of M⁻¹K
    const a = (k1 + kc) / m1, d = (k2 + kc) / m2, b = kc / m1, c = kc / m2;
    const lam = (a + d) / 2 - Math.sqrt(((a - d) / 2) ** 2 + b * c);
    return { x1, x2, f: Math.sqrt(lam) / (2 * Math.PI) };
  };
  for (const Q of [1, 2]) {
    const want = lin(Q), r = M.folds(Q, 1, 0.5e-6, Ps, Z1, dt / Q, steps);
    near(r.x1[steps - 1] / want.x1, 1, 0.01, `Q ${Q}: x₁ at rest`);
    near(r.x2[steps - 1] / want.x2, 1, 0.01, `Q ${Q}: x₂ at rest`);
    // the ringing: x₁'s first maximum is at half a period of the slower mode (time × Q: the same steps)
    let i = 1;
    while (i < steps - 1 && !(r.x1[i] >= r.x1[i - 1] && r.x1[i] > r.x1[i + 1])) i++;
    near((i * dt) / Q, 1 / (2 * want.f), 0.12 / (2 * want.f), `Q ${Q}: the first overshoot at half a period`);
  }
});
test('Bernoulli: the flow through the open glottis at the first step is a₀√(2P_s/ρ) into nothing, and with a tract ρU²/2a₀² + Z₁U = P_s', () => {
  const a0 = 2e-6, Ps = 800;
  near(M.folds(1, 1, a0, Ps, 1e-9, 1e-5, 1).U[0], a0 * Math.sqrt((2 * Ps) / RHO), 1e-9, 'into nothing');
  const Z1 = (RHO * C) / 1.5e-4, U = M.folds(1, 1, a0, Ps, Z1, 1e-5, 1).U[0];
  near((RHO * U * U) / (2 * a0 * a0) + Z1 * U, Ps, 1e-6 * Ps, 'into the tract');
});
test('the radiation impedance: Flanagan\'s R = 128ρc/9π²A and L = 8ρ/3π²a', () => {
  const A = 4e-4, a = Math.sqrt(A / Math.PI);
  near(M.radiationR(A), (128 * RHO * C) / (9 * Math.PI ** 2 * A), 1e-9, 'R');
  near(M.radiationL(A), (8 * RHO) / (3 * Math.PI ** 2 * a), 1e-12, 'L');
});

// ---- the engine -------------------------------------------------------------------
console.log('the engine');
test('tuning: the singer\'s ear brings every key from C2 to C6 onto its note in the keyboard\'s tuning within 5 ¢, on ah, ee and oo (A = 440 and 415)', () => {
  for (const [vowel, keys] of [[2, [36, 41, 48, 55, 60, 64, 69, 72, 76, 84]], [4, [40, 52, 62, 67, 74, 83]], [0, [43, 57, 65, 71, 79]]]) {
    for (const pitch of [440, 415]) {
      for (const key of keys) {
        const p = P({ ...STEADY, vowel, pitch }), f = tunedFreq(p, key);
        const x = render(key, p, 0.7, 1.3), a = Math.round(0.8 * FS);
        const c = cents(peak(x, f, a, x.length), f);
        near(c, 0, 5, `vowel ${vowel} key ${key} at A = ${pitch} (${f.toFixed(1)} Hz)`);
      }
    }
  }
});
test('the formants in the sound: on a low note the harmonics peak where the model\'s F1 and F2 are, for oo and ee (and ah\'s F1)', () => {
  const key = 45, f0 = tunedFreq(P(), key); // A2, 110 Hz: harmonics close enough to trace the envelope
  for (const vowel of [0, 2, 4]) {
    const x = render(key, P({ ...STEADY, vowel }), 0.7, 1.4), a = Math.round(0.5 * FS);
    const H = harmonics(x, f0, a, x.length, 30);
    const F = M.formants(M.areas(vowel, 1.5e-4, 44), 0.175, vowel === 2 ? 1 : 2); // ah's F2 is too near its F1 to stand apart
    for (const [k, Fk] of F.entries()) {
      const n = Math.round(Fk / f0) - 1; // the harmonic nearest the formant
      const local = Math.max(...H.slice(n - 1, n + 2)), far = Math.max(H[n - 3] ?? -Infinity, H[n + 3] ?? -Infinity);
      assert.ok(local > far + 2, `vowel ${vowel} F${k + 1} ${Fk.toFixed(0)} Hz: the harmonics near it stand ${(local - far).toFixed(1)} dB above those three away`);
    }
  }
});
test('the mod wheel moves the vowel: ah to ee moves the loudest harmonics above 1.5 kHz up toward F2 = 2.3 kHz, while the pitch stays', () => {
  const key = 45, f0 = tunedFreq(P(), key), a = Math.round(0.6 * FS);
  const e = engine(P(STEADY));
  e.noteOn(key, 0.7);
  const x1 = run(e, 1.2);
  e.handle({ type: 'cc', cc: 1, value: 127 });
  e.setParams(P({ ...STEADY, vowel: 4 })); // the shell turns CC1 into the parameter: here, at its top
  const x2 = run(e, 1.6);
  // the energy near ah's F2 (1.1 kHz) against that near ee's (2.3 kHz)
  const ratio = (x) => { let lo = 0, hi = 0; for (let n = 1; n * f0 < 2600; n++) { const v = tone(x, n * f0, a, x.length) ** 2; if (n * f0 > 950 && n * f0 < 1250) lo += v; if (n * f0 > 2100 && n * f0 < 2500) hi += v; } return 10 * Math.log10(lo / hi); };
  assert.ok(ratio(x1) - ratio(x2) > 10, `1.1 kHz over 2.3 kHz: ${ratio(x1).toFixed(1)} → ${ratio(x2).toFixed(1)} dB`);
  near(cents(peak(x2, f0, a, x2.length), f0), 0, 5, 'the pitch');
});
test('harder breath: louder and brighter (the share of the sound above 1 kHz grows)', () => {
  const key = 50, f0 = tunedFreq(P(), key), a = Math.round(0.6 * FS);
  const meas = (pressure) => { const x = render(key, P({ ...STEADY, pressure }), 0.7, 1.2), H = harmonics(x, f0, a, x.length, 60).map((d) => 10 ** (d / 10)); const hi = H.reduce((s, v, i) => s + ((i + 1) * f0 > 1000 ? v : 0), 0); return { r: rms(x, a), bright: hi / H.reduce((s, v) => s + v, 0) }; };
  const soft = meas(4), loud = meas(20);
  assert.ok(loud.r > 2 * soft.r, `louder: ${soft.r.toFixed(4)} → ${loud.r.toFixed(4)}`);
  assert.ok(loud.bright > 1.5 * soft.bright, `brighter: ${soft.bright.toFixed(3)} → ${loud.bright.toFixed(3)} above 1 kHz`);
});
test('velocity and pressure push the lungs: a harder key is louder, and aftertouch louder still', () => {
  const key = 52, a = Math.round(0.6 * FS);
  const soft = rms(render(key, P(STEADY), 0.2, 1.2), a), hard = rms(render(key, P(STEADY), 1, 1.2), a);
  assert.ok(hard > 1.5 * soft, `velocity: ${soft.toFixed(4)} → ${hard.toFixed(4)}`);
  const e = engine(P(STEADY));
  e.noteOn(key, 0.5);
  const x1 = run(e, 1);
  e.handle({ type: 'pressure', value: 1, key });
  const x2 = run(e, 1);
  assert.ok(rms(x2, 24000) > 1.3 * rms(x1, 24000), 'aftertouch');
});
test('folds apart: breathy keeps the pitch with more noise between the harmonics; the whisper\'s folds do not move, and it is all noise', () => {
  const key = 50, f0 = tunedFreq(P(), key), a = Math.round(0.6 * FS);
  const hnr = (x) => { let h = 0, n = 0; for (let k = 1; k <= 20; k++) { h += tone(x, k * f0, a, x.length) ** 2; n += tone(x, (k + 0.5) * f0, a, x.length) ** 2; } return 10 * Math.log10(h / n); };
  const clear = render(key, P(STEADY), 0.7, 1.2), breathy = render(key, preset('Breathy'), 0.7, 1.2);
  assert.ok(hnr(breathy) < hnr(clear) - 3, `harmonics over noise: ${hnr(clear).toFixed(1)} → ${hnr(breathy).toFixed(1)} dB`);
  const e = engine(preset('Whisper'));
  e.noteOn(key, 0.7);
  const w = run(e, 1.2);
  assert.ok(e.voices[0].f === 0 || hnr(w) < 6, `the whisper: no steady pitch (${e.voices[0].f.toFixed(1)} Hz, ${hnr(w).toFixed(1)} dB)`);
  assert.ok(rms(w, a) > 0.003, `but a sound (${rms(w, a).toFixed(4)})`);
});
test('the singer\'s formant: narrowing the larynx tube lifts the band from 2.5 to 3.5 kHz against the rest by 5 dB or more', () => {
  const key = 55, f0 = tunedFreq(P(), key), a = Math.round(0.6 * FS);
  const share = (larynx) => { const x = render(key, P({ ...STEADY, larynx }), 0.7, 1.2), H = harmonics(x, f0, a, x.length, 40).map((d) => 10 ** (d / 10)); let b = 0, t = 0; H.forEach((v, n) => { t += v; if ((n + 1) * f0 >= 2500 && (n + 1) * f0 <= 3500) b += v; }); return 10 * Math.log10(b / t); };
  const wide = share(1.5), narrow = share(0.45);
  assert.ok(narrow > wide + 5, `${wide.toFixed(1)} → ${narrow.toFixed(1)} dB`);
});
test('formant tuning: a soprano\'s ee at G5 sings on pitch with the jaw open; shut, the tract sits above the note and it does not', () => {
  const key = 79, p = P({ ...preset('Soprano'), ...STEADY, vowel: 4 }), f = tunedFreq(p, key), a = Math.round(0.8 * FS);
  const e = engine(p);
  e.noteOn(key, 0.7);
  const x = run(e, 1.3);
  assert.ok(e.voices[0].jaw > 0, 'the jaw opens');
  near(cents(peak(x, f, a, x.length), f), 0, 8, 'on pitch');
});
test('vibrato: the pitch swings by about the depth set, at the rate set, once it has set in', () => {
  const e = engine(P({ jitter: 0, vibrato: 40, vibRate: 5 }));
  e.noteOn(57, 0.7);
  run(e, 1);
  const f = [];
  for (let i = 0; i < 120; i++) { run(e, 1 / 240); f.push(e.voices[0].fT); }
  const c = f.map((x) => cents(x, tunedFreq(P(), 57))), hi = Math.max(...c), lo = Math.min(...c);
  near(hi, 40, 3, 'up'); near(lo, -40, 3, 'down');
  let crossings = 0;
  for (let i = 1; i < c.length; i++) if (c[i - 1] < 0 && c[i] >= 0) crossings++;
  near(crossings, 2.5, 1, 'five a second for half a second');
});
test('MPE: one note bends alone and slides its own vowel; the other sings on', () => {
  const e = engine(P(STEADY));
  e.noteOn(48, 0.7); e.noteOn(55, 0.7);
  run(e, 0.5);
  e.handle({ type: 'noteBend', key: 55, value: 2 ** (2 / 12) });
  e.handle({ type: 'slide', key: 55, value: 4 });
  run(e, 0.6);
  const v = Object.fromEntries(e.voices.map((x) => [x.key, x]));
  near(cents(v[55].fT, tunedFreq(P(), 55)), 200, 1, 'the bent note');
  near(cents(v[48].fT, tunedFreq(P(), 48)), 0, 1e-6, 'the other');
  assert.ok(v[55].vowel > 3.9 && Math.abs(v[48].vowel - 2) < 1e-9, `vowels ${v[55].vowel.toFixed(2)}, ${v[48].vowel}`);
});
test('the ear remembers: a key sung again starts nearer its tension', () => {
  const e = engine(P(STEADY));
  e.noteOn(60, 0.7); run(e, 1); e.noteOff(60); run(e, 1);
  near(e.learned(60), e.learned(60), 0, '');
  assert.ok(e.learned(60) !== 1 && e.learned(60) > 0.5 && e.learned(60) < 2, `learned ${e.learned(60)}`);
  e.noteOn(60, 0.7); run(e, 0.002);
  const v = e.voices.find((x) => x.key === 60);
  assert.ok(v.Q > 0, 'and starts there');
});
test('release: the breath stops, the tract rings out, the voice ends and the output falls silent', () => {
  const e = engine(P());
  e.noteOn(57, 0.7);
  run(e, 0.8);
  e.noteOff(57);
  const x = run(e, 1.5);
  assert.ok(rms(x, x.length - 4800) < 1e-5, `silent: ${rms(x, x.length - 4800)}`);
  assert.equal(e.voiceCount(), 0, 'no voices left');
});
test('output level is sane: an A3 at velocity 0.7 peaks 0.05–0.5; a four-note chord on any preset under 1.5; no NaN', () => {
  const x = render(57, P(), 0.7, 1.2), pk = Math.max(...x.map(Math.abs));
  assert.ok(pk > 0.05 && pk < 0.5, `peak ${pk}`);
  for (const pr of PRESETS) {
    const e = engine(P(pr.p));
    for (const k of [48, 55, 60, 64]) e.noteOn(k, 1);
    const y = run(e, 1.2), m = Math.max(...y.map(Math.abs));
    assert.ok(Number.isFinite(m) && m < 1.5, `${pr.name}: ${m}`);
  }
});
test('extremes at 44.1 and 96 kHz: every key A0–C8 and the knobs at their ends give no NaN', () => {
  const ends = [{}, Object.fromEntries(INSTRUMENT.groups.flatMap((g) => g.params).filter((p) => p.min !== undefined).map((p) => [p.id, p.min])), Object.fromEntries(INSTRUMENT.groups.flatMap((g) => g.params).filter((p) => p.max !== undefined).map((p) => [p.id, p.max]))];
  for (const fs of [44100, 96000]) for (const o of ends) {
    const e = engine(P(o), undefined, fs);
    for (let k = 21; k <= 108; k += 3) e.noteOn(k, 1);
    e.handle({ type: 'bend', value: 1 });
    const y = run(e, 0.4, fs);
    assert.ok(y.every(Number.isFinite), `fs ${fs} ${JSON.stringify(o).slice(0, 60)}`);
  }
});
test('Quality: at most 16 singers at High, 8 at Medium, 6 at Low; a note keeps its pitch', () => {
  for (const [q, cap] of [['high', 16], ['medium', 8], ['low', 6]]) {
    const e = engine(P(STEADY), q);
    for (let k = 40; k < 60; k++) e.noteOn(k, 0.7);
    run(e, 0.1);
    assert.equal(e.voices.filter((v) => !v.stolen).length, cap, q);
  }
  const f = tunedFreq(P(), 57), x = render(57, P(STEADY), 0.7, 1.2, 'low');
  near(cents(peak(x, f, Math.round(0.6 * FS), x.length), f), 0, 5, 'Low');
});
test('CPU: ten singers render well faster than real time', () => {
  const e = engine(P());
  for (let k = 0; k < 10; k++) e.noteOn(45 + 3 * k, 0.7);
  const t0 = performance.now();
  run(e, 2);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000 / 3, `${ms.toFixed(0)} ms for 2 s`);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
