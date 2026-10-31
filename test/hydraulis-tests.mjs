// Hydraulis checks: the wind's hydrostatics and the water's bounce against their formulas, the
// pumps, the slides and their springs, the ancient scaling, then the engine: pitch, odd
// harmonics, the wind sagging and refilling, the rim capping it, the keyboard's tuning, MPE,
// levels, stability, Quality and CPU.
// Run: node test/hydraulis-tests.mjs
//
// The model and the engine are the C++ (native/instruments/hydraulis), built as WebAssembly: the
// model's functions through hydraulis-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, GROUPS, PRESETS, KEY_LO, KEY_HI } from '../hydraulis/src/hydraulis-instrument.js';
import { strokeTime as strokeTimeJS } from '../hydraulis/src/hydraulis-params.js';
import { wasmModel } from '../hydraulis/src/hydraulis-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { freqAt } from '../tools/pipes-tuning.mjs';
import { keyFreq } from '../shared/dsp.js';
import { TUNING_KEEP, TUNING_PARAMS } from '../shared/tuning.js';

const HydraulisEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000, RHO_W = 1000, G = 9.81;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const near = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) < tol, `${what}: ${a} against ${b}`);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'params', P] |
// [t, 'msg', message]) in 128-sample blocks, as the AudioWorklet does; tap(e, t) after each block.
function run(params, events, sec, { fs = FS, seed = 1, track = false, still = false, tap, quality, before } = {}) {
  const e = new HydraulisEngine(fs, seed, { track, still });
  if (quality) e.setQuality(quality);
  e.setParams(params);
  before?.(e);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bL = new Float32Array(128), bR = new Float32Array(128);
  for (let s = 0, j = 0; s < n; s += 128) {
    while (j < ev.length && ev[j][0] * fs <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a, b); else if (type === 'params') e.setParams(a); else if (type === 'msg') e.handle(a);
    }
    e.process(bL, bR, 128);
    for (let i = 0; i < 128 && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, (s + 128) / fs);
  }
  return { L, R, e };
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
function tone(x, f, a, b) { // amplitude of f in x[a, b), Hann-windowed
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The wind over a run: the engine's own state, every block.
function windOf(params, events, sec, opts = {}) {
  const t = [], p = [], dV = [];
  let strokes = 0, bubbles = 0;
  const r = run(params, events, sec, { ...opts, tap: (e, tt) => { const w = e.wind(); t.push(tt); p.push(w.pc); dV.push(w.dV); strokes = w.strokes; bubbles = w.bubbles; opts.tap?.(e, tt); } });
  return { ...r, t, p, dV, strokes, bubbles, between: (a, b) => p.filter((_, i) => t[i] >= a && t[i] < b) };
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

console.log('physics');
test('hydrostatics: the full wind is ρg times the water inside falling to the rim, plus the water outside rising: p_rim = ρg·x_rim(1 + A_in/A_out), and the air under the bowl then holds it (V_rim/C_h = p_rim)', () => {
  for (const size of [0.5, 1, 2]) for (const rim of [350, 700, 1500]) {
    const c = M.cistern(size, rim);
    near(RHO_W * G * c.xRim * (1 + c.Ain / c.Aout), rim, 1e-9, `${size}, ${rim}: p_rim`);
    near(1 / c.Ch, RHO_W * G * (1 / c.Ain + 1 / c.Aout), 1e-9, `${size}: C_h`);
    near(c.Vrim / c.Ch, rim, 1e-9, `${size}, ${rim}: V_rim/C_h`);
    near(c.Vrim, c.Ain * c.xRim, 1e-9, `${size}, ${rim}: V_rim`);
  }
});
test('the water\'s bounce: f_b = (1/2π)√((1/C_h + 1/C_a)/M_w), with C_a = V_air/γP₀; the engine\'s bowl, set off by 50 Pa and left alone, rings there (within 2 %) and dies away at the damping ratio zeta', () => {
  const c = M.cistern(1, 700);
  near(c.fb, Math.sqrt((1 / c.Ch + 1 / c.Ca) / c.Mw) / (2 * Math.PI), 1e-9, 'f_b');
  assert.ok(c.fb > 1 && c.fb < 6, `${c.fb} Hz`);
  const dV0 = c.Vrim - 0.2 * M.STROKE_V; // no room for a stroke: the pumpers rest
  const w = windOf(P(), [], 2, { before: (e) => { e.process(new Float32Array(128), new Float32Array(128), 128); e.setWind('dV', dV0); e.setWind('pc', dV0 / c.Ch + 50); e.setWind('Qw', 0); } });
  assert.equal(w.strokes, 0);
  const x = w.p.map((v, i) => v - w.dV[i] / c.Ch), ups = [], peaks = [];
  const m = mean(x.slice(-100));
  for (let i = 1; i < x.length; i++) if (x[i - 1] < m && x[i] >= m) ups.push(w.t[i - 1] + ((m - x[i - 1]) / (x[i] - x[i - 1])) * (w.t[i] - w.t[i - 1]));
  for (let i = 1; i < x.length - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > m) peaks.push(x[i] - m);
  const f = (ups.length - 1) / (ups[ups.length - 1] - ups[0]);
  near(f, c.fb * Math.sqrt(1 - 0.15 ** 2), 0.02, 'measured');
  const zeta = Math.log(peaks[0] / peaks[1]) / Math.sqrt(4 * Math.PI ** 2 + Math.log(peaks[0] / peaks[1]) ** 2);
  assert.ok(Math.abs(zeta - 0.15) < 0.03, `ζ ${zeta.toFixed(3)}`);
});
test('a bubble breaking away rings at Minnaert\'s frequency, f·R ≈ 3.3 m/s in water at 1 atm', () => {
  for (const R of [0.008, 0.015, 0.022]) assert.ok(Math.abs(M.minnaert(R) * R - 3.3) < 0.1, `${R}: ${M.minnaert(R) * R}`);
});
test('the slides: a hole\'s opening is the lens two circles overlap (πr² at d = 0, (2π/3 − √3/2)r² at d = r, nothing at 2r); shut at rest (with its margin), wide open pushed in, opening steadily between', () => {
  const r = 0.004;
  near(M.lensArea(r, 0), Math.PI * r * r, 1e-12, 'd = 0');
  near(M.lensArea(r, r), ((2 * Math.PI) / 3 - Math.sqrt(3) / 2) * r * r, 1e-12, 'd = r');
  assert.equal(M.lensArea(r, 2 * r), 0);
  assert.equal(M.slideOpen(0), 0);
  assert.ok(M.slideOpen(M.MARGIN / (1 + M.MARGIN) - 1e-6) === 0 && M.slideOpen(M.MARGIN / (1 + M.MARGIN) + 0.01) > 0, 'the margin: the holes meet once the slide is a sixth in');
  near(M.slideOpen(1), 1, 1e-12, 'pushed in');
  for (let x = 0.01; x <= 1; x += 0.01) assert.ok(M.slideOpen(x) >= M.slideOpen(x - 0.01));
});
test('the pumps: a stroke is 2 L; a cycle takes 4 s at no effort and 0.4 s at full (the page\'s strokeTime the same); a pump delivers (p_push − p)/R_valve, no faster than its pace, nothing against a wind it cannot beat', () => {
  near(M.STROKE_V, M.PISTON_A * 0.16, 1e-12, 'stroke');
  assert.ok(Math.abs(M.STROKE_V - 0.00196) < 2e-5);
  for (const e of [0, 0.3, 0.5, 1]) near(M.strokeTime(e), strokeTimeJS(e), 1e-12, `${e}`);
  near(M.strokeTime(0), 4, 1e-12, 'no effort'); near(M.strokeTime(1), 0.4, 1e-12, 'full');
  const push = M.pushPressure(0.5, 700);
  near(M.pistonFlow(push, 700, 1, 0.1, 1.26), (push - 700) / M.R_VALVE, 1e-12, 'mid-stroke');
  near(M.pistonFlow(push, 0, 1, 0.1, 4), (1.5 * M.STROKE_V) / (M.DELIVER * 4), 1e-12, 'no faster than the pace');
  assert.equal(M.pistonFlow(push, push + 1, 1, 0.1, 1.26), 0);
  assert.equal(M.pistonFlow(push, 700, 1, 1, 1.26), 0);
});
test('the bore: 34 mm at G3, narrowing slowly over the compass (by a quarter over two octaves: D ∝ f^−0.21), widening below it (open pipes as f^−1.5, stopped as f^−1) up to Töpfer\'s width, narrowing as Töpfer\'s past it', () => {
  const fLo = keyFreq(KEY_LO), fHi = keyFreq(KEY_HI);
  near(M.boreD(fLo, 0.21), 0.034, 1e-12, 'G3');
  near(M.boreD(fHi, 0.21) / M.boreD(fLo, 0.21), 4 ** -0.21, 1e-9, 'over the compass');
  near(M.boreD(fLo / 2, 0.21), 0.034 * 2 ** 1.5, 1e-9, 'an octave below, open');
  near(M.boreD(fLo / 2, 0.21, true), 0.034 * 2, 1e-9, 'an octave below, stopped');
  near(M.boreD(fHi * 4, 0.21) / M.boreD(fHi, 0.21), 4 ** -0.75, 1e-9, 'two octaves above');
  for (let k = 21; k <= 108; k++) for (let r = 0; r < 4; r++) {
    const R = M.pipeModel(M.pipeFreq(k, r), r > 0, P());
    assert.ok(R.L > 0, `key ${k} rank ${r}: ${R.L} m long`);
  }
});
test('the ranks: open and stopped at the note, stopped an octave below (the unison under A1) and an octave above', () => {
  for (const k of [33, 55, 67, 79]) { near(M.pipeFreq(k, 0), keyFreq(k), 1e-12, `${k}`); near(M.pipeFreq(k, 1), keyFreq(k), 1e-12, `${k}`); near(M.pipeFreq(k, 2), keyFreq(k) / 2, 1e-12, `${k}`); near(M.pipeFreq(k, 3), 2 * keyFreq(k), 1e-12, `${k}`); }
  near(M.pipeFreq(32, 2), keyFreq(32), 1e-12, 'below A1');
});

console.log('engine');
test('every pipe of the compass speaks its note: the open and stopped ranks within 1 ¢ on a still wind, the stopped pipe with its odd harmonics over its even', () => {
  for (const k of [KEY_LO, 60, 67, 72, KEY_HI]) for (const [r, stops] of [[0, { open: true }], [1, { open: false, stopped: true }]]) {
    const f = M.pipeFreq(k, r), { L } = run(P({ ...stops, noise: 0 }), [[0, 'on', k, 0.7]], 1.6, { still: true });
    const c = cents(freqAt(L, f, 0.9 * FS, 1.6 * FS), f);
    assert.ok(Math.abs(c) < 1, `key ${k} rank ${r}: ${c.toFixed(2)} ¢`);
    if (r === 1 && k <= 67) { const a = 0.9 * FS, b = 1.6 * FS; assert.ok(tone(L, 3 * f, a, b) > 3 * tone(L, 2 * f, a, b), `key ${k}: 3f ${tone(L, 3 * f, a, b).toExponential(2)}, 2f ${tone(L, 2 * f, a, b).toExponential(2)}`); }
  }
});
test('the keyboard\'s tuning: at A = 415 Hz and in ¼-comma meantone (C4 +10.26 ¢) the pipes are cut for the note and sound it (within 1 ¢)', () => {
  for (const [k, o, c] of [[69, { pitch: 415 }, cents(415, 440)], [60, { temperament: 'meantone' }, 10.26]]) {
    const f = keyFreq(k) * 2 ** (c / 1200), packed = M.keyModels(k, P(o));
    const { L } = run(P({ ...o, noise: 0 }), [[0, 'on', k, 0.7]], 1.6, { still: true, before: (e) => { e.modelsFor = () => packed; } });
    const got = cents(freqAt(L, f, 0.9 * FS, 1.6 * FS), f);
    assert.ok(Math.abs(got) < 1, `${k}: ${got.toFixed(2)} ¢`);
  }
});
test('before a note the bowl is full: the wind at the rim, the water at its depth, the pumpers resting', () => {
  const w = windOf(P(), [], 1);
  assert.ok(w.p.every((v) => Math.abs(v - 700) < 1e-6), 'the wind');
  near(w.dV[w.dV.length - 1], M.cistern(1, 700).Vrim, 1e-9, 'the water');
  assert.equal(w.strokes, 0);
});
test('a chord draws the wind down (a dip of 5–20 %), and the pumpers keep it near full (above 90 % on average)', () => {
  const w = windOf(P(), [55, 62, 67, 74].map((k) => [0.2, 'on', k, 0.7]), 5);
  const dip = Math.min(...w.between(0.2, 1)) / 700;
  assert.ok(dip > 0.8 && dip < 0.95, `dip to ${(100 * dip).toFixed(1)} %`);
  assert.ok(w.strokes >= 2, `${w.strokes} strokes`);
  assert.ok(mean(w.between(1.5, 5)) > 0.9 * 700, `mean ${mean(w.between(1.5, 5)).toFixed(0)} Pa`);
});
test('tired pumpers fall behind four ranks: the wind sags under a chord (below 65 % of full), and pumping hard holds most of it (above 75 %)', () => {
  const all = { stopped: true, low: true, high: true }, chord = [60, 64, 67].map((k) => [0, 'on', k, 0.7]);
  const tired = mean(windOf(P({ ...all, effort: 0.1 }), chord, 6).between(3, 6)), hard = mean(windOf(P({ ...all, effort: 1 }), chord, 6).between(3, 6));
  assert.ok(tired < 0.65 * 700, `tired: ${tired.toFixed(0)} Pa`);
  assert.ok(hard > 0.75 * 700, `hard: ${hard.toFixed(0)} Pa`);
});
test('the rim caps the wind: eager pumpers overfill the bowl, the air bubbles out under its rim, and the wind holds at full (within 5 % on average; a stroke\'s push overshoots it by less than 30 %)', () => {
  const w = windOf(P({ effort: 1 }), [[0, 'on', 67, 0.7]], 6), p = w.between(0.5, 6);
  assert.ok(w.bubbles > 5, `${w.bubbles} bubbles`);
  assert.ok(Math.abs(mean(p) / 700 - 1) < 0.05, `mean ${mean(p).toFixed(0)} Pa`);
  assert.ok(Math.max(...p) < 1.3 * 700, `max ${Math.max(...p).toFixed(0)} Pa`);
});
test('a stroke puts its 2 L into the bowl: one pump, from three strokes short of full, three strokes, and the water pushed out plus the air squeezed is 3 × 2 L (within 0.5 %)', () => {
  const c = M.cistern(1, 700), dV0 = c.Vrim - 3.2 * M.STROKE_V;
  const w = windOf(P({ pumps: 'one' }), [], 6, { before: (e) => { e.process(new Float32Array(128), new Float32Array(128), 128); e.setWind('dV', dV0); e.setWind('pc', dV0 / c.Ch); e.setWind('Qw', 0); } });
  assert.equal(w.strokes, 3);
  const e = w.e.wind(), pumped = e.dV - dV0 + c.Ca * (e.pc - dV0 / c.Ch); // the water pushed out, and the air squeezed
  near(pumped, 3 * M.STROKE_V, 0.005, 'pumped');
});
test('the slide: pushed in over the push time (10 ms at velocity 0.7, twice that at 0.4), its holes open as the lens; the spring, preloaded, pulls it back to its stop in its set time (2 cos ωt − 1 = 0), the holes shutting just before', () => {
  for (const [vel, push, spring] of [[0.7, 10, 15], [0.4, 10, 40]]) {
    let tIn = 0, tShut = 0, lens = true;
    run(P({ push, spring }), [[0, 'on', 67, vel], [0.2, 'off', 67]], 0.4, { tap: (e, t) => {
      const v = e.voices()[0]; if (!v) return;
      if (!tIn && v.s >= 1) tIn = t;
      if (t > 0.2 && !tShut && v.open <= 0) tShut = t - 0.2;
      lens &&= Math.abs(v.open - M.slideOpen(v.s)) < 1e-9;
    } });
    // the spring, preloaded by one travel: x = 2 cos ωt − 1 from x = 1, at its stop once ωt = π/3; the holes shut at x = MARGIN/(1 + MARGIN)
    const want = (push / 1000) * 2 ** ((0.7 - vel) / 0.3), blk = 128 / FS, w = M.springOmega(spring), xs = M.MARGIN / (1 + M.MARGIN);
    near(Math.PI / 3 / w, spring / 1000, 1e-12, 'ω');
    assert.ok(lens, 'the opening is the lens');
    assert.ok(Math.abs(tIn - want) <= blk, `in after ${(tIn * 1000).toFixed(1)} ms, want ${(want * 1000).toFixed(1)}`);
    assert.ok(Math.abs(tShut - Math.acos((1 + xs) / 2) / w) <= blk, `shut after ${(tShut * 1000).toFixed(1)} ms, want ${(1000 * Math.acos((1 + xs) / 2) / w).toFixed(1)}`);
  }
});
test('a stopcock shut cuts its rank\'s wind: a rank turned off under a held key falls silent, and the pipes draw less', () => {
  let drawBoth = 0, drawOne = 0;
  const r = run(P({ stopped: true }), [[0, 'on', 67, 0.7], [1, 'params', P({ stopped: false })]], 2, { tap: (e, t) => {
    if (t > 0.7 && t < 0.9) drawBoth = e.wind().Qdraw;
    if (t > 1.7 && t < 1.9) drawOne = e.wind().Qdraw;
  } });
  const v = r.e.voices()[0];
  assert.ok(v.pipes[1].foot < 1e-6, `the stopped pipe's foot: ${v.pipes[1].foot}`);
  assert.ok(drawOne < 0.7 * drawBoth, `${drawOne} against ${drawBoth}`);
});
test('leaning on a key (key pressure) and the mod wheel work the pumpers harder', () => {
  const eff = (ev) => { const r = run(P({ effort: 0.2 }), [[0, 'on', 60, 0.7], ...ev], 1.5); return r.e.wind().effort; };
  assert.ok(Math.abs(eff([]) - 0.2) < 1e-3);
  assert.ok(eff([[0.1, 'msg', { type: 'pressure', key: 60, value: 1 }]]) > 0.95, 'pressure');
  assert.equal(INSTRUMENT.modWheel, 'effort');
});
test('silence after release (the gurgle off: the pumpers top the bowl up, and it may bubble): released notes leave no voices', () => {
  const r = run(P({ stopped: true, low: true, gurgle: 0 }), [[0, 'on', 60, 0.7], [0, 'on', 67, 0.7], [1, 'off', 60], [1, 'off', 67]], 3);
  assert.equal(r.e.voices().length, 0);
  assert.ok(rms(r.L, 2.5 * FS, 3 * FS) < 1e-4, `${rms(r.L, 2.5 * FS, 3 * FS)}`);
});

console.log('levels, stability and the rest');
test('level: a single note peaks at 0.01–0.5 across the compass; a chord of four ranks stays under 2', () => {
  for (let k = KEY_LO; k <= KEY_HI; k += 6) {
    const { L } = run(P(), [[0, 'on', k, 1]], 0.8);
    const pk = Math.max(...L.map(Math.abs));
    assert.ok(pk > 0.01 && pk < 0.5, `${k}: ${pk.toFixed(3)}`);
  }
  const { L } = run(P({ stopped: true, low: true, high: true, effort: 1 }), [55, 60, 64, 67, 72, 79].map((k) => [0, 'on', k, 1]), 1.5);
  const pk = Math.max(...L.map(Math.abs));
  assert.ok(pk < 2, `chord ${pk}`);
});
test('stability: seeded random combinations of extreme settings at 44.1 and 48 kHz, changed mid-note: no NaN, bounded, silent after release', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !['volume', 'room', 'venue', ...TUNING_KEEP].includes(q.id));
  let seed = 4242, tseed = 777;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const trnd = () => ((tseed = (tseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = () => {
    const p = P();
    for (const q of sliders) { if (rnd() < 0.5) continue; p[q.id] = q.type === 'checkbox' ? rnd() < 0.5 : q.options ? q.options[Math.floor(rnd() * q.options.length)][0] : rnd() < 0.5 ? q.min : q.max; }
    for (const q of TUNING_PARAMS) { if (trnd() < 0.5) continue; p[q.id] = q.options ? q.options[Math.floor(trnd() * q.options.length)][0] : trnd() < 0.5 ? q.min : q.max; }
    return p;
  };
  let worst = 0;
  for (const fs of [44100, 48000]) for (let c = 0; c < 4; c++) {
    const p1 = pick(), p2 = pick(), ev = [];
    [36, 55, 61, 79, 96].forEach((k, i) => ev.push([0.02 * i, 'on', k, rnd()], [1.0, 'off', k]));
    ev.push([0.4, 'params', p2]);
    let bubbling = 0;
    const r = run(p1, ev, 2.5, { fs, tap: (e, t) => { if (t > 2.2 && t < 2.4) bubbling = e.wind().bubbles; } });
    let pk = 0;
    for (let i = 0; i < r.L.length; i++) { assert.ok(Number.isFinite(r.L[i] + r.R[i]), `${fs}: NaN with ${JSON.stringify(p1)} → ${JSON.stringify(p2)}`); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
    worst = Math.max(worst, pk);
    assert.ok(pk < 12, `${fs}: peak ${pk.toFixed(2)}`);
    // after release each pipe rings down at its own losses (a big bass pipe for a while): the tail is falling, and well down
    const tail = rms(r.L, r.L.length - Math.round(0.1 * fs), r.L.length), t1 = rms(r.L, Math.round(1.8 * fs), Math.round(1.9 * fs)), note = rms(r.L, Math.round(0.6 * fs), fs);
    const bubbled = r.e.wind().bubbles > bubbling && p2.gurgle > 0; // the bowl, topped up after the chord, bubbling
    assert.ok(r.e.voices().every((v) => !v.down), `${fs}: a key still down`);
    assert.ok(tail < 1e-4 || (tail < 0.7 * t1 && tail < 0.5 * note) || bubbled, `${fs}: still sounding (${tail.toFixed(5)} after ${t1.toFixed(5)}, note ${note.toFixed(4)}) with ${JSON.stringify(p2)}`);
  }
  console.log(`        loudest of 8: ${worst.toFixed(2)}`);
});
test('presets use their own parameters, and each speaks without NaN', () => {
  const ids = new Set(Object.keys(DEFAULTS));
  for (const pr of PRESETS) {
    for (const k of Object.keys(pr.p)) assert.ok(ids.has(k), `${pr.name}: ${k}`);
    const r = run(P(pr.p), [[0, 'on', 60, 0.8], [0, 'on', 67, 0.8]], 1.2);
    let pk = 0;
    for (const v of r.L) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.005, `${pr.name}: ${pk}`);
  }
});
test(`MPE: a key's own bend reaches the WebAssembly as far as ±${INSTRUMENT.mpe.bend} semitones: G4's open pipe bent so far sounds there (within 6 ¢), and a bend of 1 changes nothing`, () => {
  const p = P({ noise: 0 }), max = INSTRUMENT.mpe.bend;
  const bent = (st) => run(p, [[0, 'msg', { type: 'noteBend', key: 67, value: 2 ** (st / 12) }], [0, 'on', 67, 0.7]], 1, { still: true });
  assert.deepEqual(bent(0).L, run(p, [[0, 'on', 67, 0.7]], 1, { still: true }).L);
  for (const s of [1, -1]) {
    const want = keyFreq(67) * 2 ** ((s * max) / 12), f = freqAt(bent(s * max).L, want, 0.5 * FS, FS);
    assert.ok(Math.abs(cents(f, want)) < 6, `${s * max}: ${cents(f, want).toFixed(1)} ¢`);
  }
});
test('Quality: Medium and Low let fewer keys sound (12, 8) and give each pipe fewer modes (8, 5); a chord of two ranks keeps its pitches and level', () => {
  const ref = {};
  for (const [q, cap, modes] of [['high', 20, 10], ['medium', 12, 8], ['low', 8, 5]]) {
    let live = 0;
    run(P({ fullRange: true }), Array.from({ length: 22 }, (_, i) => [0.03 * i, 'on', 40 + 2 * i, 0.7]), 1, { quality: q, tap: (e) => { live = Math.max(live, e.voices().filter((v) => !v.fading).length); } });
    assert.equal(live, cap, `${q}: keys sounding`);
    const { L, e } = run(P({ stopped: true, noise: 0 }), [[0, 'on', 60, 0.7]], 1.2, { quality: q, still: true }), v = e.voices()[0];
    const f = [0, 1].map((r) => freqAt(L, M.pipeFreq(60, r) * (r ? 1 : 1), 0.6 * FS, 1.2 * FS)), lvl = rms(L, 0.6 * FS, 1.2 * FS), n = v.pipes[0].modes;
    if (q === 'high') Object.assign(ref, { f, lvl, n });
    assert.ok(q === 'high' ? n <= modes : n === Math.min(modes, ref.n), `${q}: the open pipe plays ${n} modes`);
    assert.ok(Math.abs(cents(f[0], ref.f[0])) < 1, `${q}: ${cents(f[0], ref.f[0]).toFixed(2)} ¢ from High`);
    assert.ok(Math.abs(20 * Math.log10(lvl / ref.lvl)) < 1.5, `${q}: ${(20 * Math.log10(lvl / ref.lvl)).toFixed(2)} dB from High`);
  }
});
test('CPU: ten held keys of the open and stopped ranks (20 pipes) with the wind and its pumps at 48 kHz in under 25 % of real time', () => {
  const e = new HydraulisEngine(FS);
  e.setParams(P({ stopped: true, fullRange: true }));
  for (const k of [48, 52, 55, 60, 64, 67, 71, 72, 76, 79]) e.noteOn(k, 0.8);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let s = 0; s < 0.5 * FS; s += 128) e.process(L, R, 128);
  const sec = 3, t0 = performance.now();
  for (let s = 0; s < sec * FS; s += 128) e.process(L, R, 128);
  const load = (performance.now() - t0) / (sec * 1000);
  assert.ok(load < 0.25, `${(100 * load).toFixed(1)} % of real time`);
  console.log(`        (${(100 * load).toFixed(1)} % of real time)`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
