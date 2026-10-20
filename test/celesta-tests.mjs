// Celesta checks. Run: node test/celesta-tests.mjs
//
// The physics against independent results (Euler–Bernoulli's free–free roots, the first-order
// Timoshenko correction from Rayleigh's quotient, Saint-Venant torsion, a quarter-wave pipe),
// then the engine against the model. Both are the C++ (native/instruments/celesta), built as
// WebAssembly: the model's functions through celesta-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from '../celesta/src/celesta-instrument.js';
import { wasmModel } from '../celesta/src/celesta-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tuningRatio } from '../shared/tuning.js';

const CelestaEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const { STEEL } = M;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// Render through the engine in 128-sample blocks, as the AudioWorklet does, at a Quality (opts.quality,
// High unless given). events: [t, 'on'|'off'|'sus', key|on, vel] and [t, 'msg', message] or [t, 'params', P]
function play(params, sec, events, opts = {}) {
  const e = new CelestaEngine(FS);
  if (opts.quality) e.setQuality(opts.quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  for (let s = 0; s < n; s += bl) {
    while (ev.length && ev[0][0] * FS <= s) {
      const [, type, k, v] = ev.shift();
      if (type === 'on') e.noteOn(k, v); else if (type === 'off') e.noteOff(k); else if (type === 'msg') e.handle(k); else if (type === 'params') e.setParams(k); else e.setSustain(k);
    }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
    opts.each?.(e, s);
  }
  return { L, R, e };
}
const note = (key, params, vel = 0.8, sec = 1) => play(params, sec, [[0, 'on', key, vel]]).L;
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±range cents of f0, to a hundredth of a cent.
function peak(x, f0, a, b, range = 60) {
  let best = f0, bv = -1;
  for (let step = range / 30; step > 0.01; step /= 6) {
    const c0 = best;
    for (let c = -30; c <= 30; c++) { const f = c0 * 2 ** ((c * step) / 1200), v = tone(x, f, a, b); if (v > bv) { bv = v; best = f; } }
  }
  return best;
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

// The free–free Euler–Bernoulli mode n (from 0) and its derivatives, at x ∈ [0, 1] (closed form).
function eb(n, x, d = 0) {
  const b = M.BETA_L[n], s = (Math.cosh(b) - Math.cos(b)) / (Math.sinh(b) - Math.sin(b)), u = b * x;
  const f = [
    () => Math.cosh(u) + Math.cos(u) - s * (Math.sinh(u) + Math.sin(u)),
    () => b * (Math.sinh(u) - Math.sin(u) - s * (Math.cosh(u) + Math.cos(u))),
    () => b * b * (Math.cosh(u) - Math.cos(u) - s * (Math.sinh(u) - Math.sin(u))),
    () => b ** 3 * (Math.sinh(u) + Math.sin(u) - s * (Math.cosh(u) - Math.cos(u))),
  ];
  return f[d]();
}
const integral = (fn, N = 4000) => { let s = 0; for (let i = 0; i < N; i++) s += fn((i + 0.5) / N); return s / N; };

console.log('physics');
test('free–free beam: βL solves cos βL cosh βL = 1', () => {
  for (const b of M.BETA_L) assert.ok(Math.abs(Math.cos(b) * Math.cosh(b) - 1) < 1e-6 * Math.cosh(b), `${b}`);
});
test('a very thin Timoshenko bar has Euler–Bernoulli’s frequencies (to 10⁻⁶)', () => {
  const L = 1, b = 0.02, h = 1e-4, f = M.timoshenkoFreqs(L, b, h, 5);
  assert.equal(f.length, 5);
  f.forEach((fi, n) => assert.ok(Math.abs(fi / M.eulerFreq(L, b, h, n) - 1) < 1e-6, `mode ${n + 1}: ${fi} vs ${M.eulerFreq(L, b, h, n)}`));
});
test('shear and rotary inertia lower each mode as Rayleigh’s quotient predicts, to first order', () => {
  // ω²/ω₀² ≈ 1 − r²∫w'²/∫w² − (E/κG) r²∫w'''²/∫w''², with r² = I/A (slender bar, h/L = 1/200)
  const L = 0.2, b = 0.02, h = 0.001, r2 = (h * h) / 12 / (L * L), f = M.timoshenkoFreqs(L, b, h, 5);
  for (let n = 0; n < 5; n++) {
    const w2 = integral((x) => eb(n, x) ** 2), d1 = integral((x) => eb(n, x, 1) ** 2), d2 = integral((x) => eb(n, x, 2) ** 2), d3 = integral((x) => eb(n, x, 3) ** 2);
    const predicted = r2 * (d1 / w2 + (STEEL.E / (STEEL.kappa * STEEL.G)) * (d3 / d2));
    const actual = 1 - (f[n] / M.eulerFreq(L, b, h, n)) ** 2;
    assert.ok(Math.abs(actual / predicted - 1) < 0.03, `mode ${n + 1}: drop ${actual.toExponential(3)} vs first order ${predicted.toExponential(3)}`);
  }
});
test('the Timoshenko determinant vanishes at each frequency and changes sign across it', () => {
  const L = 0.15, b = 0.027, h = 0.0024, f = M.timoshenkoFreqs(L, b, h, 5);
  for (const fi of f) {
    const lo = M.timoshenkoDet(2 * Math.PI * fi * 0.999, L, b, h), hi = M.timoshenkoDet(2 * Math.PI * fi * 1.001, L, b, h);
    assert.ok(lo * hi < 0, `no sign change at ${fi}`);
  }
});
test('Saint-Venant torsion: a thin strip’s J → bh³/3, and f = n/(2L)·√(GJ/ρIₚ)', () => {
  assert.ok(Math.abs(M.torsionJ(1, 1e-3) / (1e-9 / 3) - 1) < 1e-3);
  assert.ok(Math.abs(M.torsionJ(1, 1) - 0.1406) < 2e-3, `square: ${M.torsionJ(1, 1)} (Roark: 0.1406 a⁴)`);
  const L = 0.2, b = 0.03, h = 0.0025, Ip = (b * h * (b * b + h * h)) / 12;
  assert.ok(Math.abs(M.torsionFreq(L, b, h, 1) - 2 * Math.sqrt((STEEL.G * M.torsionJ(b, h)) / (STEEL.rho * Ip)) / (2 * L)) < 1e-9);
});
test('every key’s bar is cut so that mode 1 sounds its note (to 0.01 ¢), A0–C8', () => {
  for (let k = KEY_MIN; k <= KEY_MAX; k++) {
    const bar = M.bar(k, DEFAULTS.thick);
    assert.ok(Math.abs(cents(bar.modes[0].f, keyFreq(k))) < 0.01, `${k}: ${bar.modes[0].f} vs ${keyFreq(k)}`);
  }
});
test('the bars: 224 mm at C4 down to 50 mm at C8, as a Mustel’s run from about 8 to 2 inches', () => {
  const lo = M.bar(KEY_LO, DEFAULTS.thick), hi = M.bar(KEY_HI, DEFAULTS.thick);
  assert.ok(lo.L > 0.19 && lo.L < 0.24, `C4: ${lo.L}`);
  assert.ok(hi.L > 0.045 && hi.L < 0.056, `C8: ${hi.L}`);
});
test('mode shapes are mass-orthonormal and the blocks sit at mode 1’s nodes (22.4 %)', () => {
  const bar = M.bar(72, DEFAULTS.thick), bends = bar.modes.filter((m) => m.kind === 'bend'), A = bar.b * bar.h, N = bar.NX - 1, dx = bar.L / N;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k <= N; k++) s += (k === 0 || k === N ? 0.5 : 1) * dx * STEEL.rho * A * bends[i].w[k] * bends[j].w[k];
    assert.ok(Math.abs(s - (i === j ? 1 : 0)) < 0.01, `<${i}|${j}> = ${s}`); // rotary inertia holds the rest
  }
  for (const [x, want] of [[bar.nodes[0], 0.2242], [bar.nodes[1], 0.7758]]) assert.ok(Math.abs(x / bar.L - want) < 2e-3, `${x / bar.L}`);
});
test('the box: a quarter-wave pipe (λ/4) once the gap is wide, tuned to its bar with the gap’s air on it', () => {
  const k = 72, f1 = M.bar(k, DEFAULTS.thick).modes[0].f;
  const wide = M.boxState(k, P({ gap: 1e6 })), c = 343.2;
  assert.ok(Math.abs(wide.le / (c / (4 * f1)) - 1) < 1e-3, `${wide.le} vs ${c / (4 * f1)}`);
  for (const gap of [3, 12, 40]) {
    const s = M.boxState(k, P({ gap }));
    assert.ok(Math.abs(cents(Math.sqrt(s.Ka / s.M22) / (2 * Math.PI), f1)) < 1e-6, `gap ${gap}`);
  }
});
test('the coupled pair: the two-oscillator frequencies are the roots of det(K − ω²M) = 0', () => {
  const k = 66, f1 = M.bar(k, DEFAULTS.thick).modes[0].f, s = M.boxState(k, P({ gap: 4 }));
  const K11 = (2 * Math.PI * f1) ** 2, a = s.M11 * s.M22 - s.M12 ** 2, b = -(K11 * s.M22 + s.Ka * s.M11), cc = K11 * s.Ka;
  const roots = [(-b - Math.sqrt(b * b - 4 * a * cc)) / (2 * a), (-b + Math.sqrt(b * b - 4 * a * cc)) / (2 * a)].map((w2) => Math.sqrt(w2) / (2 * Math.PI));
  const kappa = -s.M12 / Math.sqrt(s.M11 * s.M22), pair = M.twoOscillator(f1 / Math.sqrt(s.M11), Math.sqrt(s.Ka / s.M22) / (2 * Math.PI), kappa);
  roots.forEach((r, i) => assert.ok(Math.abs(cents(pair[i], r)) < 1e-6, `${pair[i]} vs ${r}`));
  assert.ok(cents(pair[1], pair[0]) > 20, 'pressed close, the pair splits');
});

console.log('engine');
test('without boxes, the bar sounds on pitch (within 0.5 ¢) with its overtones where the model puts them', () => {
  for (const k of [60, 79, 96]) {
    const x = note(k, P({ boxes: false, pedalLock: true }), 0.8, 1.2), a = 4800, b = a + 32768, bar = M.bar(k, DEFAULTS.thick);
    assert.ok(Math.abs(cents(peak(x, keyFreq(k), a, b), keyFreq(k))) < 0.5, `${k}: ${peak(x, keyFreq(k), a, b)}`);
    const f2 = bar.modes[1].f;
    if (f2 < 15000) assert.ok(Math.abs(cents(peak(x, f2, a, a + 16384, 20), f2)) < 2, `${k}: mode 2 at ${f2}`);
  }
});
test('the keyboard\'s tuning: at A = 415 Hz, and in ¼-comma meantone (E4 −3.42 ¢, C4 +10.26 ¢), the bar is cut to its tuned pitch and sounds there (within 0.5 ¢)', () => {
  for (const [k, o, c] of [[72, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42], [60, { temperament: 'meantone' }, 10.26]]) {
    const f = keyFreq(k) * 2 ** (c / 1200), Q = P({ boxes: false, pedalLock: true, ...o }), x = note(k, Q, 0.8, 1.2), a = 4800, b = a + 32768;
    assert.ok(Math.abs(cents(M.bar(k, Q.thick, tuningRatio(Q, k)).modes[0].f, f)) < 0.01, `${k}: the model's bar`);
    assert.ok(Math.abs(cents(peak(x, f, a, b), f)) < 0.5, `${k}: ${peak(x, f, a, b)} vs ${f}`);
  }
});
test('the box makes the note louder, and shorter', () => {
  const on = note(72, P({ pedalLock: true }), 0.8, 2), off = note(72, P({ boxes: false, pedalLock: true }), 0.8, 2);
  assert.ok(rms(on, 0, FS / 4) > 4 * rms(off, 0, FS / 4), `${rms(on, 0, FS / 4)} vs ${rms(off, 0, FS / 4)}`);
  const f = keyFreq(72), decay = (x) => tone(x, f, 1.5 * FS - 8192, 1.5 * FS) / tone(x, f, 0.1 * FS, 0.1 * FS + 8192);
  assert.ok(decay(on) < 0.5 * decay(off), `${decay(on)} vs ${decay(off)}`);
});
test('pressed close, bar and box beat: two lines a few hertz apart, as the model says', () => {
  const k = 66, s = M.boxState(k, P({ gap: 2.5 })), f1 = M.bar(k, DEFAULTS.thick).modes[0].f;
  const pair = M.twoOscillator(f1 / Math.sqrt(s.M11), Math.sqrt(s.Ka / s.M22) / (2 * Math.PI), -s.M12 / Math.sqrt(s.M11 * s.M22));
  const x = note(k, P({ gap: 2.5, pedalLock: true }), 0.8, 1.5), a = 2400, b = a + 65536;
  for (const fp of pair) assert.ok(Math.abs(cents(peak(x, fp, a, b, 8), fp)) < 3, `${fp}: found ${peak(x, fp, a, b, 8)}`);
});
test('struck at the centre, mode 2 and torsion 1 are silent; on mode 1’s node the fundamental drops out', () => {
  const k = 72, bar = M.bar(k, DEFAULTS.thick), f2 = bar.modes[1].f, a = 480, b = a + 8192;
  const centre = note(k, P({ strike: 0.5, across: 0, pedalLock: true }), 0.8, 0.3), side = note(k, P({ strike: 0.4, across: 0, pedalLock: true }), 0.8, 0.3);
  assert.ok(tone(centre, f2, a, b) < 0.02 * tone(side, f2, a, b), 'mode 2 at the centre');
  const node = note(k, P({ strike: bar.nodes[0] / bar.L, boxes: false, pedalLock: true }), 0.8, 0.3), off = note(k, P({ strike: 0.4, boxes: false, pedalLock: true }), 0.8, 0.3);
  assert.ok(tone(node, keyFreq(k), a, b) < 0.05 * tone(off, keyFreq(k), a, b), 'the fundamental on the node');
});
test('striking off the centre line brings in the torsional modes', () => {
  const k = 72, ft = M.bar(k, DEFAULTS.thick).modes.find((m) => m.kind === 'tors').f, a = 480, b = a + 8192;
  const on = note(k, P({ across: 0, strike: 0.3 }), 0.8, 0.3), off = note(k, P({ across: 0.8, strike: 0.3 }), 0.8, 0.3);
  assert.ok(tone(off, ft, a, b) > 20 * tone(on, ft, a, b), `${tone(off, ft, a, b)} vs ${tone(on, ft, a, b)}`);
});
test('harder felt reaches the upper modes: brighter, with a shorter contact', () => {
  const k = 60, f4 = M.bar(k, DEFAULTS.thick).modes[3].f, a = 240, b = a + 4096;
  let soft, hard;
  play(P({ hardness: 40 }), 0.1, [[0, 'on', k, 0.8]], { each: (e) => { soft = e.voices[0].lastContactMs || soft; } });
  play(P({ hardness: 3000 }), 0.1, [[0, 'on', k, 0.8]], { each: (e) => { hard = e.voices[0].lastContactMs || hard; } });
  assert.ok(hard < 0.5 * soft, `contact ${hard} ms vs ${soft} ms`);
  const xs = note(k, P({ hardness: 40 }), 0.8, 0.2), xh = note(k, P({ hardness: 3000 }), 0.8, 0.2), f1 = keyFreq(k);
  assert.ok(tone(xh, f4, a, b) / tone(xh, f1, a, b) > 10 * (tone(xs, f4, a, b) / tone(xs, f1, a, b)), 'mode 4 against the fundamental');
});
// A note's own slide (MPE) is its hammer's felt, taken as the hammer is thrown.
const slide = (key, value) => ({ type: 'slide', key, value });
const same = (x, y, what) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) assert.fail(`${what}: sample ${i} differs`); };
test('a note\'s own slide is its hammer\'s felt: a lone note slid to x is the note with the felt at x, bit for bit, from its next strike on', () => {
  const k = 72;
  for (const x of [40, 3000]) {
    same(play(P(), 0.3, [[0, 'msg', slide(k, x)], [0, 'on', k, 0.8]]).L, note(k, P({ hardness: x }), 0.8, 0.3), `felt ${x}`);
    // slid while it rings: the bar rings on as it was struck, and the next strike has the new felt
    same(play(P(), 0.4, [[0, 'on', k, 0.8], [0.1, 'msg', slide(k, x)], [0.2, 'on', k, 0.8]]).L, play(P(), 0.4, [[0, 'on', k, 0.8], [0.1, 'params', P({ hardness: x })], [0.2, 'on', k, 0.8]]).L, `felt ${x}, slid`);
  }
  // the other bar of a chord keeps the knob's felt: the chord is its two notes, apart
  const chord = play(P(), 0.3, [[0, 'msg', slide(k, 3000)], [0, 'on', k, 0.8], [0, 'on', 79, 0.8]]).L;
  const a = note(k, P({ hardness: 3000 }), 0.8, 0.3), b = note(79, P(), 0.8, 0.3);
  let d = 0, pk = 0;
  for (let i = 0; i < chord.length; i++) { d = Math.max(d, Math.abs(chord[i] - a[i] - b[i])); pk = Math.max(pk, Math.abs(chord[i])); }
  assert.ok(d < 1e-5 * pk, `differs by ${(d / pk).toExponential(2)} of the peak`);
});
test('a note\'s slide back to none (NaN) leaves the output bit-identical', () => {
  const ev = [[0, 'on', 60, 0.8], [0, 'on', 67, 0.6], [0.1, 'on', 60, 1]];
  same(play(P(), 0.3, [[0, 'msg', slide(60, 3000)], [0, 'msg', slide(60, NaN)], [0.05, 'msg', slide(67, 20)], [0.05, 'msg', slide(67, NaN)], ...ev]).L, play(P(), 0.3, ev).L, 'slid and back');
});
test('stability: each note\'s own felt swept over its whole range every block, on chords struck again and again, at 44.1, 48 and 96 kHz', () => {
  // the chord's peak, against the same chord with the knob at either end of the felt
  const chord = (fs, o, slid) => {
    const e = new CelestaEngine(fs);
    e.setParams(P(o));
    const keys = [21, 60, 72, 96, 108], L = new Float32Array(128), R = new Float32Array(128);
    let pk = 0;
    for (let b = 0, n = Math.round((0.5 * fs) / 128); b < n; b++) {
      if (slid) keys.forEach((k, i) => e.handle(slide(k, 10 * 1000 ** (0.5 + 0.5 * Math.sin(b / (2 + i))))));
      if (b % 20 === 0) for (const k of keys) e.noteOn(k, 1);
      e.process(L, R, 128);
      for (const y of L) { assert.ok(Number.isFinite(y), `${fs} Hz ${JSON.stringify(o)}: NaN`); pk = Math.max(pk, Math.abs(y)); }
    }
    return pk;
  };
  for (const fs of [44100, 48000, 96000]) for (const o of [{}, { mass: 12, speedMax: 5, fullRange: true }]) {
    const pk = chord(fs, o, true), ends = Math.max(chord(fs, { ...o, hardness: 10 }), chord(fs, { ...o, hardness: 10000 }));
    assert.ok(pk < 1.2 * ends, `${fs} Hz ${JSON.stringify(o)}: peak ${pk.toFixed(2)}, ${ends.toFixed(2)} with the knob`);
  }
});
test('the hammer gives the bar no more energy than it brings (½mv²)', () => {
  for (const k of [60, 84, 108]) {
    let Emax = 0;
    play(P({ pedalLock: true }), 0.1, [[0, 'on', k, 1]], { each: (e) => { const v = e.voices[0]; if (v) Emax = Math.max(Emax, v.E); } });
    const H = M.hammer(k, DEFAULTS), E0 = 0.5 * H.m * DEFAULTS.speedMax ** 2;
    assert.ok(Emax > 0.02 * E0 && Emax <= E0, `${k}: ${Emax} J of ${E0} J`);
  }
});
test('letting the key go drops the damper; the pedal (and Pedal held down) keeps it off', () => {
  const k = 72, f = keyFreq(k), a = 0.6 * FS, w = 4096;
  const damped = play(P(), 1, [[0, 'on', k, 0.8], [0.1, 'off', k]]).L;
  const pedal = play(P(), 1, [[0, 'sus', true], [0, 'on', k, 0.8], [0.1, 'off', k]]).L;
  const lock = play(P({ pedalLock: true }), 1, [[0, 'on', k, 0.8], [0.1, 'off', k]]).L;
  assert.ok(tone(damped, f, a, a + w) < 1e-3 * tone(pedal, f, a, a + w), 'damped');
  assert.ok(Math.abs(tone(lock, f, a, a + w) / tone(pedal, f, a, a + w) - 1) < 0.01, 'locked = pedal');
});
test('output level is sane (peak 0.01 – 1 at full velocity), with no NaNs, A0–C8', () => {
  let pk = 0;
  for (const k of [21, 40, 60, 72, 84, 96, 108]) {
    const x = note(k, P({ fullRange: true }), 1, 0.4);
    let p = 0;
    for (const v of x) { assert.ok(Number.isFinite(v)); p = Math.max(p, Math.abs(v)); }
    if (k >= KEY_LO) assert.ok(p > 0.01, `${k}: peak ${p}`);
    pk = Math.max(pk, p);
  }
  assert.ok(pk < 1, `peak ${pk}`);
});
test('striking a ringing bar again adds to it; every voice ends after release', () => {
  const r = play(P(), 3, [[0, 'on', 72, 0.8], [0.05, 'on', 72, 0.8], [0.1, 'on', 72, 1], [0.3, 'off', 72], [0, 'on', 60, 1], [0.2, 'off', 60]]);
  assert.ok(r.e.voices.length === 0, `${r.e.voices.length} left`);
  assert.ok(rms(r.L, 2.5 * FS) < 1e-6, 'silence');
});
test('only A0–C8 have bars', () => {
  const r = play(P(), 0.2, [[0, 'on', 20, 1], [0, 'on', 109, 1]]);
  assert.equal(rms(r.L), 0);
});
test('Quality: Medium and Low let 16 and 10 bars ring at once and let a bar go at −70 and −60 dB (−90 at High); a bar keeps its pitch and level', () => {
  const ev = [[0, 'sus', true]];
  for (let i = 0; i < 36; i++) ev.push([0.04 * i, 'on', KEY_LO + i, 0.6]);
  const time = {};
  for (const [quality, cap] of [['high', 24], ['medium', 16], ['low', 10]]) {
    let most = 0, t = 0;
    const { L } = play(P(), 4, ev, { quality, each: (e, s) => { if (s % 1280) return; const vs = e.voices; most = Math.max(most, vs.filter((v) => !v.fading).length); t += vs.length; } });
    assert.ok(L.every(Number.isFinite), `${quality}: NaN`);
    assert.ok(most <= cap, `${quality}: ${most} bars`);
    time[quality] = t;
  }
  console.log(`         bars × time at Medium ${((100 * time.medium) / time.high).toFixed(0)} %, Low ${((100 * time.low) / time.high).toFixed(0)} % of High's`);
  assert.ok(time.medium < 0.8 * time.high && time.low < 0.6 * time.high, JSON.stringify(time));
  for (const key of [60, 84, 100]) {
    const f = keyFreq(key), at = (quality) => play(P(), 1, [[0, 'on', key, 0.8]], { quality }).L, hi = at('high');
    for (const quality of ['medium', 'low']) {
      const x = at(quality), c = cents(peak(x, f, 0.1 * FS, FS), peak(hi, f, 0.1 * FS, FS)), d = 20 * Math.log10(rms(x) / rms(hi));
      assert.ok(Math.abs(c) < 0.1 && Math.abs(d) < 1.5, `key ${key} at ${quality}: ${c.toFixed(3)} ¢, ${d.toFixed(2)} dB`);
    }
  }
});
test('CPU: 16 sounding bars render faster than 5× real time', () => {
  const keys = Array.from({ length: 16 }, (_, i) => 60 + 3 * i), t0 = performance.now();
  play(P({ pedalLock: true }), 2, keys.map((k, i) => [0.01 * i, 'on', k, 0.8]));
  const t = (performance.now() - t0) / 1000;
  assert.ok(t < 2 / 5, `${t.toFixed(2)} s for 2 s`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
