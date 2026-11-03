// Birdsong checks: the syrinx's normal form against its bifurcation theory and an independent
// integration, the vocal tract against its delay-line recursion, then the engine against the model.
// Run: node test/birdsong-tests.mjs
//
// Both are the C++ (native/instruments/birdsong), built as WebAssembly: the model's functions
// through birdsong-wasm.js. The independent checks integrate the equations here, in JavaScript.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../birdsong/src/birdsong-instrument.js';
import { wasmModel } from '../birdsong/src/birdsong-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';

const BirdsongEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const { ALPHA_REST, C_AIR } = M;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name) => P(PRESETS.find((p) => p.name.startsWith(name)).p);
const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);

function engine(params, quality, fs = FS) {
  const e = new BirdsongEngine(fs);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  return e;
}
// Run an engine for sec seconds, 128-sample blocks like the AudioWorklet; returns the left channel.
function run(e, sec, fs = FS) {
  const n = Math.round(sec * fs), L = new Float32Array(n);
  for (let s = 0; s < n; s += bl) { e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s); }
  return L;
}
function render(key, params, vel, sec, quality) {
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
// The strongest frequency within ±c ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b, c = 40) {
  let lo = f0 * 2 ** (-c / 1200), hi = f0 * 2 ** (c / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const maxAbs = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// ---- the normal form, integrated independently ------------------------------------------------
// dx/dτ = v, dv/dτ = α + βx + x² − x³ − xv − x²v (Sitt et al. 2010; Amador et al. 2013)
const g = (a, b, x) => a + b * x + x * x - x * x * x;
const acc = (a, b, x, v) => g(a, b, x) - x * v - x * x * v;
// the labia at rest: the rightmost root of g, by Newton from far right (g falls from +∞ to −∞)
function rest(a, b) { let x = 3; for (let i = 0; i < 200; i++) x -= g(a, b, x) / (b + 2 * x - 3 * x * x); return x; }
// Integrate from rest at (α, β) with a midpoint-free method of our own (Heun's, RK2) at a fine
// step; returns the steady period's Ω and x's extent (or null: the labia came to rest).
function cycleJS(a, b, { h = 0.004, T = 2500 } = {}) {
  let x = rest(ALPHA_REST, b), v = 0, t = 0, prev = 0, last = -1;
  const per = []; let xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i * h < T; i++) {
    const ax = v, av = acc(a, b, x, v);
    const x1 = x + h * ax, v1 = v + h * av;
    const nx = x + 0.5 * h * (ax + v1), nv = v + 0.5 * h * (av + acc(a, b, x1, v1));
    x = nx; v = nv; t += h;
    if (t > 0.6 * T) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
    if (prev < 0 && v >= 0) { const tc = t - (h * v) / (v - prev); if (last >= 0 && t > 0.6 * T) per.push(tc - last); last = tc; }
    prev = v;
  }
  if (per.length < 3 || xmax - xmin < 1e-3) return null; // (a swing still dying away is rest)
  return { omega: (2 * Math.PI) / per.at(-1), xmin, xmax };
}

test('the onset: where a breath from rest first sets the labia swinging, by integration; the saddle-node meets g = g′ = 0, the Hopf line α = 0', () => {
  for (const tau of [-0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.5, 0.9]) {
    const b = -tau, a0 = M.onset(b);
    if (tau < 0.25) {
      const x = (2 + Math.sqrt(4 + 12 * b)) / 6;
      assert.ok(Math.abs(g(a0, b, x)) < 1e-12 && Math.abs(b + 2 * x - 3 * x * x) < 1e-12, `τ ${tau}: a saddle-node`);
    } else assert.equal(a0, 0, `τ ${tau}: the Hopf line`);
    assert.ok(cycleJS(a0 - 0.01, b, { T: 1500 }), `τ ${tau}: swings just past the onset`);
    assert.equal(cycleJS(a0 + 0.02, b, { T: 1500 }), null, `τ ${tau}: rests just short of it`);
  }
});

test('the limit cycle\'s frequency agrees with an independent integration (Heun, step 0.004) to 0.1 ¢, both sides of the corner', () => {
  for (const [tau, d] of [[-0.1, 0.05], [0, 0.03], [0.2, 0.1], [0.5, 0.08], [0.9, 0.3]]) {
    const b = -tau, a = M.onset(b) - d, c = M.cycle(a, b), j = cycleJS(a, b);
    assert.ok(c.ok && j, `τ ${tau}`);
    assert.ok(Math.abs(cents(c.omega, j.omega)) < 0.1, `τ ${tau} d ${d}: ${c.omega} vs ${j.omega} (${cents(c.omega, j.omega).toFixed(3)} ¢)`);
    assert.ok(Math.abs(c.xmax - j.xmax) < 2e-3 && Math.abs(c.xmin - j.xmin) < 2e-3, `τ ${tau}: the swing's extent`);
  }
});

test('Hopf: just past the line the labia swing at the linear frequency √(−g′(x₀)) with an amplitude ∝ √(drive)', () => {
  for (const tau of [0.4, 0.7, 1]) {
    const b = -tau, d = 0.002;
    const c1 = M.cycle(-d, b), c4 = M.cycle(-4 * d, b);
    // the focus: g(x₀) = 0 nearest 0, and its linear frequency; Ω departs from it as the swing² grows
    const lin = (dd) => { let x0 = 0; for (let i = 0; i < 50; i++) x0 -= g(-dd, b, x0) / (b + 2 * x0 - 3 * x0 * x0); return Math.sqrt(-(b + 2 * x0 - 3 * x0 * x0)); };
    const e1 = Math.abs(cents(c1.omega, lin(d))), e4 = Math.abs(cents(c4.omega, lin(4 * d)));
    assert.ok(e1 < 25 && e1 < 0.6 * e4, `τ ${tau}: Ω ${c1.omega.toFixed(4)} vs ${lin(d).toFixed(4)} (${e1.toFixed(1)} ¢; ${e4.toFixed(1)} ¢ at 4× the drive)`);
    const r = (c4.xmax - c4.xmin) / (c1.xmax - c1.xmin);
    assert.ok(Math.abs(r - 2) < 0.15, `τ ${tau}: 4× the drive swings ${r.toFixed(3)}× as wide`);
  }
});

test('saddle-node on the cycle (SNILC): the note is born at zero frequency, Ω ∝ √(drive), with a swing of finite size', () => {
  for (const tau of [-0.2, -0.1, 0]) {
    const b = -tau, a0 = M.onset(b);
    const c1 = M.cycle(a0 - 0.001, b), c4 = M.cycle(a0 - 0.004, b);
    assert.ok(c1.omega < 0.1, `τ ${tau}: Ω ${c1.omega.toFixed(4)} near the onset`);
    assert.ok(Math.abs(c4.omega / c1.omega - 2) < 0.12, `τ ${tau}: Ω(4d)/Ω(d) = ${(c4.omega / c1.omega).toFixed(3)}`);
    assert.ok(c1.xmax - c1.xmin > 0.4, `τ ${tau}: swing ${(c1.xmax - c1.xmin).toFixed(3)} at birth`);
  }
});

test('spectral richness (Sitt et al. 2008): near the saddle-node the cycle is pulse-like, near the Hopf line almost a sine', () => {
  const rich = (c) => Math.hypot(...c.c.slice(1)) / c.c[0];
  const sn = M.cycle(M.onset(0) - 0.01, 0), hopf = M.cycle(-0.01, -0.6);
  assert.ok(rich(sn) > 0.6, `saddle-node: harmonics/fundamental ${rich(sn).toFixed(3)}`);
  assert.ok(rich(hopf) < 0.08, `Hopf: ${rich(hopf).toFixed(4)}`);
  // and the Fourier series rebuilds the swing's extent
  for (const c of [sn, hopf]) assert.ok(2 * c.c.reduce((s, a) => s + a, 0) >= 0.95 * (c.xmax - c.xmin), 'Σ|cₖ| bounds the swing');
});

test('one RK4 step matches a Taylor series of the flow to fifth order', () => {
  const [a, b, x, v, h] = [-0.07, -0.3, 0.12, -0.25, 1e-3];
  const [nx, nv] = M.rk4(x, v, a, b, h);
  // Taylor to h²: x'' = acc, v'' = d(acc)/dτ = (β + 2x − 3x² − v − 2xv) v − (x + x²) acc
  const ac = acc(a, b, x, v), dac = (b + 2 * x - 3 * x * x - v - 2 * x * v) * v - (x + x * x) * ac;
  assert.ok(Math.abs(nx - (x + h * v + (h * h / 2) * ac)) < 1e-9, 'x');
  assert.ok(Math.abs(nv - (v + h * ac + (h * h / 2) * dac)) < 1e-9, 'v');
});

test('the trachea: its gain, as the recursion Pᵢ = s − r Pᵢ(t − T) gives for a sine; peaks of 1 at c/4L, 3c/4L; troughs (1 − r)/(1 + r)', () => {
  const L = 0.035, r = 0.7, T = (2 * L) / C_AIR;
  for (const f of [600, 2450, 4000, 4900, 7350]) {
    // the recursion by brute force, finely sampled
    const fsim = 4e6, n = Math.round(0.02 * fsim), D = T * fsim, Pi = new Float64Array(n);
    let amp = 0;
    for (let i = 0; i < n; i++) {
      const di = i - D, j = Math.floor(di), fr = di - j;
      const past = j >= 0 ? Pi[j] + (Pi[j + 1] - Pi[j]) * fr : 0;
      Pi[i] = Math.sin((2 * Math.PI * f * i) / fsim) - r * past;
      if (i > n / 2) amp = Math.max(amp, Math.abs(Pi[i]));
    }
    assert.ok(Math.abs((1 - r) * amp - M.tracheaGain(f, L, r)) < 2e-3, `${f} Hz: ${((1 - r) * amp).toFixed(4)} vs ${M.tracheaGain(f, L, r).toFixed(4)}`);
  }
  assert.ok(Math.abs(M.tracheaGain(C_AIR / (4 * L), L, r) - 1) < 1e-9 && Math.abs(M.tracheaGain((3 * C_AIR) / (4 * L), L, r) - 1) < 1e-9, 'quarter-wave peaks');
  assert.ok(Math.abs(M.tracheaGain(C_AIR / (2 * L), L, r) - (1 - r) / (1 + r)) < 1e-9, 'trough');
});

test('the mouth (OEC): unit gain at its resonance, half power where f/fo − fo/f = ±1/Q', () => {
  for (const Q of [0.7, 2, 8]) {
    const fo = 3000;
    assert.ok(Math.abs(M.oecGain(fo, fo, Q) - 1) < 1e-12);
    const u = (1 / (2 * Q)) + Math.sqrt(1 + 1 / (4 * Q * Q));
    assert.ok(Math.abs(M.oecGain(fo * u, fo, Q) - Math.SQRT1_2) < 1e-9 && Math.abs(M.oecGain(fo / u, fo, Q) - Math.SQRT1_2) < 1e-9, `Q ${Q}`);
  }
});

// ---- the engine ------------------------------------------------------------------------------
test('every key A0–C8 sings its note in the keyboard\'s tuning (within 0.5 ¢), soft and hard, Hopf and saddle-node', () => {
  const sets = [[P({ noise: 0 }), 0.8], [P({ noise: 0 }), 0.15], [P({ ...preset('Zebra finch'), noise: 0 }), 0.8]];
  for (const [params, vel] of sets) for (let k = 21; k <= 108; k += 7) {
    const f = tunedFreq(params, k), sec = k < 40 ? 2.2 : 0.9;
    const x = render(k, params, vel, sec), a = Math.round((sec - 0.6) * FS), b = x.length;
    const c = cents(peak(x, f, a, b), f);
    assert.ok(Math.abs(c) < 0.5, `key ${k}, velocity ${vel}, tension ${params.tension}: ${c.toFixed(2)} ¢`);
  }
});

test('the engine\'s labia settle where the model says: their measured frequency is the note, γΩ/2π', () => {
  for (const k of [45, 69, 93]) {
    const e = engine(P()); e.noteOn(k, 0.7); run(e, 0.8);
    const [v] = e.voices;
    assert.ok(Math.abs(cents(v.fSung, v.fNote)) < 2, `key ${k}: sung ${v.fSung.toFixed(2)} vs ${v.fNote.toFixed(2)}`);
    assert.ok(Math.abs(cents((v.gamma * v.omega) / (2 * Math.PI), keyFreq(k))) < 1e-6, 'γΩ/2π');
    const c = M.cycle(M.onset(-DEFAULTS.tension) - v.d, -DEFAULTS.tension);
    assert.ok(Math.abs(v.omega - c.omega) < 1e-12, 'its Ω is the model\'s');
  }
});

test('out of the beak: with a fixed mouth, the harmonics are the cycle\'s × the tract\'s response (within 1.5 dB, the first four)', () => {
  const params = P({ ...preset('Zebra finch'), noise: 0 }), k = 69, f = tunedFreq(params, k);
  const x = render(k, params, 0.8, 1.2), a = 0.6 * FS, b = x.length;
  const e = engine(params); e.noteOn(k, 0.8); run(e, 0.05);
  const c = M.cycle(M.onset(-params.tension) - e.voices[0].d, -params.tension);
  const H = (fk) => M.tracheaGain(fk, params.trachea / 100, params.reflect) * M.oecGain(fk, params.oec, params.q);
  const want = (n) => c.c[n - 1] * H(n * f), got = (n) => tone(x, n * f, a, b);
  for (let n = 2; n <= 4; n++) {
    const dB = 20 * Math.log10((got(n) / got(1)) / (want(n) / want(1)));
    assert.ok(Math.abs(dB) < 1.5, `harmonic ${n}: ${dB.toFixed(2)} dB off`);
  }
});

test('a tuned mouth whistles: the second harmonic falls well below a fixed mouth\'s', () => {
  const k = 72, f = keyFreq(k);
  const h2 = (params) => { const x = render(k, params, 0.8, 1); return tone(x, 2 * f, 24000, 48000) / tone(x, f, 24000, 48000); };
  const base = { tension: 0.1, drive: 0.05, q: 2 };
  const tuned = h2(P({ ...base, track: true })), fixed = h2(P({ ...base, track: false, oec: 3000 }));
  assert.ok(tuned < 0.25 * fixed, `2nd/1st: tuned ${tuned.toFixed(3)}, fixed ${fixed.toFixed(3)}`);
});

test('onsets: a Hopf note is born at a finite frequency; a saddle-node note at zero frequency, running up', () => {
  const k = 76, f = keyFreq(k);
  const born = (params) => {
    const e = engine(params); e.noteOn(k, 0.8);
    // from the moment α crosses the onset, the lowest frequency the labia sing over 30 ms
    let i = 0;
    for (; i < 400; i++) { run(e, 128 / FS); const v = e.voices[0]; if (v.e > 0.02 && v.alpha < M.onset(v.beta)) break; }
    let first = Infinity;
    for (let j = 0; j < Math.round(0.03 * FS / 128); j++) { run(e, 128 / FS); const fs = e.voices[0].fSung; if (fs !== e.voices[0].fNote) first = Math.min(first, fs); }
    const early = e.voices[0].fSung; run(e, 0.4);
    return { first, early, late: e.voices[0].fSung };
  };
  const hopf = born(P({ noise: 0 })), sn = born(P({ ...preset('Zebra finch'), noise: 0, inhale: 0.03 }));
  assert.ok(hopf.first > 0.8 * hopf.late && hopf.early > 0.8 * hopf.late && Math.abs(cents(hopf.late, f)) < 5, `Hopf: ${hopf.first.toFixed(0)} Hz at birth, ${hopf.late.toFixed(1)} Hz later`);
  assert.ok(sn.first < 0.7 * sn.late && Math.abs(cents(sn.late, f)) < 5, `saddle-node: ${sn.first.toFixed(1)} Hz at birth, ${sn.late.toFixed(1)} Hz later`);
});

test('pitch rises with the pressure, as in a real bird: aftertouch sharpens a held note', () => {
  const k = 69, e = engine(P()); e.noteOn(k, 0.5); run(e, 0.6);
  const before = e.voices[0].fSung;
  e.handle({ type: 'pressure', value: 1, key: k }); run(e, 0.6);
  const after = e.voices[0].fSung;
  assert.ok(cents(after, before) > 20 && Math.abs(cents(before, keyFreq(k))) < 3, `${before.toFixed(2)} → ${after.toFixed(2)} Hz`);
});

test('syllables: a trill repeats at the syllable rate with silent mini-breaths; sweeps glide up or down through each syllable', () => {
  const k = 81, rate = 10;
  const x = render(k, P({ syllable: 'trill', rate, duty: 0.5 }), 0.9, 2.05);
  // the bursts: 5 ms frames louder than a third of the loudest, counted where they start
  const fr = 240, lev = []; for (let i = 0; i + fr <= x.length; i += fr) lev.push(maxAbs(x.subarray(i, i + fr)));
  const top = Math.max(...lev); let bursts = 0, on = false;
  for (const l of lev) { if (!on && l > top / 3) { bursts++; on = true; } else if (on && l < top / 10) on = false; }
  assert.ok(Math.abs(bursts - 2.05 * rate) <= 1, `${bursts} syllables in 2.05 s at ${rate}/s`);
  for (const [syl, sign] of [['up', 1], ['down', -1]]) {
    const e = engine(P({ syllable: syl, rate: 2, duty: 0.9 })); e.noteOn(k, 0.9);
    run(e, 0.12); const f1 = e.voices[0].fSung; run(e, 0.25); const f2 = e.voices[0].fSung;
    assert.ok(sign * cents(f2, f1) > 300, `${syl}: ${f1.toFixed(0)} → ${f2.toFixed(0)} Hz`);
  }
});

test('the trachea\'s resonance lifts the harmonics near c/4L: with a broad mouth the loudest harmonic follows it as the trachea grows', () => {
  const k = 57, f = keyFreq(k);
  const loudest = (L) => {
    const x = render(k, P({ tension: 0, drive: 0.03, track: false, oec: 3000, q: 0.7, trachea: L, reflect: 0.9 }), 0.8, 1);
    let best = 1, bv = 0; for (let n = 1; n <= 16; n++) { const a = tone(x, n * f, 24000, 48000); if (a > bv) { bv = a; best = n; } }
    return best * f;
  };
  for (const L of [5, 8, 11]) {
    const fr = C_AIR / (4 * L / 100), at = loudest(L);
    assert.ok(Math.abs(Math.log2(at / fr)) < 0.35, `${L} cm: loudest harmonic ${at.toFixed(0)} Hz, c/4L ${fr.toFixed(0)} Hz`);
  }
});

test('pitch bend and MPE: the wheel retunes ±2 semitones, a note\'s own bend up to two octaves, CC74 its syllable rate', () => {
  const k = 69;
  const e = engine(P()); e.noteOn(k, 0.7); e.handle({ type: 'bend', value: 1 }); run(e, 0.8);
  assert.ok(Math.abs(cents(e.voices[0].fSung, keyFreq(k)) - 200) < 3, `wheel: ${cents(e.voices[0].fSung, keyFreq(k)).toFixed(1)} ¢`);
  const m = engine(P()); m.handle({ type: 'noteBend', key: k, value: 2 }); m.noteOn(k, 0.7); run(m, 0.8);
  assert.ok(Math.abs(cents(m.voices[0].fSung, keyFreq(k)) - 1200) < 5, `note bend: ${cents(m.voices[0].fSung, keyFreq(k)).toFixed(1)} ¢`);
  const s = engine(P({ syllable: 'trill', rate: 5 })); s.handle({ type: 'slide', key: k, value: 20 }); s.noteOn(k, 0.8);
  const x = run(s, 1.05), fr = 240, lev = []; for (let i = 0; i + fr <= x.length; i += fr) lev.push(maxAbs(x.subarray(i, i + fr)));
  const top = Math.max(...lev); let bursts = 0, on = false;
  for (const l of lev) { if (!on && l > top / 3) { bursts++; on = true; } else if (on && l < top / 10) on = false; }
  assert.ok(bursts >= 18, `slide to 20/s: ${bursts} syllables in 1.05 s`);
});

test('release: a let-go key falls silent within a few breath times, and its voice ends', () => {
  const e = engine(P()); e.noteOn(69, 0.8); run(e, 0.5); e.noteOff(69);
  const x = run(e, 0.4);
  assert.ok(maxAbs(x.subarray(Math.round(0.25 * FS))) < 1e-3, `tail ${maxAbs(x.subarray(Math.round(0.25 * FS))).toExponential(2)}`);
  assert.equal(e.voices.length, 0);
});

test('output level is sane: a C5 at full velocity peaks 0.1–0.5; no preset passes 1', () => {
  const pk = maxAbs(render(72, P(), 1, 0.8));
  assert.ok(pk > 0.1 && pk < 0.5, `default ${pk.toFixed(3)}`);
  for (const p of PRESETS) {
    const params = P(p.p);
    for (const k of [45, 72, 96]) {
      const m = maxAbs(render(k, params, 1, 0.6));
      assert.ok(m < 1 && m > (k === 45 ? 1e-3 : 0.01), `${p.name}, key ${k}: ${m.toFixed(3)}`);
    }
  }
});

test('extremes at 44.1 and 48 kHz: no NaN or blow-up with the knobs at their ends, bent and pressed, chords on every syllable', () => {
  const ends = [];
  for (const p of INSTRUMENT.groups.flatMap((gr) => gr.params)) if (p.min !== undefined && !['volume', 'room'].includes(p.id)) ends.push({ [p.id]: p.min }, { [p.id]: p.max });
  for (const fs of [44100, 48000]) for (const o of [...ends, ...['trill', 'up', 'down', 'warble'].map((s) => ({ syllable: s, sweep: 0.9, tension: 0 }))]) {
    const e = engine(P(o), undefined, fs);
    for (const k of [21, 60, 64, 67, 108]) e.noteOn(k, 1);
    e.handle({ type: 'pressure', value: 1 }); e.handle({ type: 'bend', value: -1 });
    const x = run(e, 0.3, fs);
    assert.ok(x.every(Number.isFinite) && maxAbs(x) < 4, `${JSON.stringify(o)} at ${fs}: ${maxAbs(x)}`);
  }
});

test('Quality: at most 24 birds sing at High, 12 at Medium, 6 at Low; a note keeps its pitch (0.5 ¢) and level (1 dB)', () => {
  for (const [quality, cap] of [['high', 24], ['medium', 12], ['low', 6]]) {
    const e = engine(P(), quality);
    for (let i = 0; i < 30; i++) { e.noteOn(40 + i, 0.7); run(e, 0.02); }
    run(e, 0.2);
    assert.equal(e.voices.length, cap, quality);
  }
  for (const k of [48, 84, 105]) {
    const f = keyFreq(k), hi = render(k, P(), 0.7, 0.8);
    for (const quality of ['medium', 'low']) {
      const x = render(k, P(), 0.7, 0.8, quality), a = 0.4 * FS;
      assert.ok(Math.abs(cents(peak(x, f, a, x.length), peak(hi, f, a, x.length))) < 0.5, `key ${k} ${quality}: pitch`);
      assert.ok(Math.abs(20 * Math.log10(rms(x, a) / rms(hi, a))) < 1, `key ${k} ${quality}: level`);
      const e = engine(P(), quality); e.noteOn(k, 0.7); run(e, 0.01);
      const eh = engine(P()); eh.noteOn(k, 0.7); run(eh, 0.01);
      assert.ok(e.voices[0].sub <= eh.voices[0].sub, `key ${k} ${quality}: no more steps than High`);
    }
  }
});

test('CPU: ten birds, the high ones in several RK4 steps a sample, render well faster than real time', () => {
  const e = engine(P({ syllable: 'warble' }));
  for (const k of [48, 55, 60, 64, 67, 72, 79, 88, 96, 103]) e.noteOn(k, 0.8);
  run(e, 0.2);
  const t0 = performance.now(); run(e, 2); const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 0.6, `${(dt / 2 * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
