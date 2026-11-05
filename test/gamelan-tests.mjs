// Gamelan checks. Run: node test/gamelan-tests.mjs
//
// The physics against independent results (Euler–Bernoulli's free–free roots, a finite-element
// Timoshenko beam, Saint-Venant torsion, a stopped pipe's losses, the measured gongs of Perrin et
// al. and Krueger et al., the laras as defined), then the engine against the model: pitch, the
// pairs' beat, the gong's own beat from its curvature, the damping hand, decay, level, Quality.
// Both are the C++ (native/instruments/gamelan), built as WebAssembly: the model's functions
// through gamelan-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../gamelan/src/gamelan-instrument.js';
import { wasmModel } from '../gamelan/src/gamelan-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { genEig } from '../shared/linalg.js';

const GamelanEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const dB = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);

// Play events [[t, 'on'|'off'|'sustain'|'slide'|'params', key, value]] through an engine in 128-sample
// blocks, at a Quality (High unless given); `watch(e, t)` is called after each block.
function play(params, sec, events, { fs = FS, watch, quality } = {}) {
  const e = new GamelanEngine(fs);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += bl) {
    for (; k < ev.length && ev[k][0] * fs <= s; k++) {
      const [, what, key, v] = ev[k];
      if (what === 'on') e.noteOn(key, v); else if (what === 'off') e.noteOff(key);
      else if (what === 'sustain') e.setSustain(v); else if (what === 'slide') e.handle({ type: 'slide', key, value: v });
      else if (what === 'params') e.setParams(v);
    }
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s);
    watch?.(e, (s + bl) / fs);
  }
  return { L, R, e };
}
const mono = ({ L, R }) => L.map((x, i) => x + R[i]);
const render = (key, params, vel, sec) => mono(play(params, sec, [[0, 'on', key, vel]]));
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im) / (b - a);
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// The strongest line within ±c cents of f (golden section).
function line(x, f, a, b, c = 30) {
  let lo = f * 2 ** (-c / 1200), hi = f * 2 ** (c / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
// The beat on the band around f: the envelope of a window too short to tell the two lines apart,
// its decay taken out, and the rate that best fits what is left (Hz).
function beatRate(x, f, t0, t1, { win = 0.12, lo = 0.5, hi = 16 } = {}) {
  const W = Math.round(win * FS), H = Math.round(0.01 * FS), t = [], y = [];
  for (let s = Math.round(t0 * FS); s + W < t1 * FS; s += H) { t.push((s + W / 2) / FS); y.push(Math.log(tone(x, f, s, s + W) + 1e-12)); }
  const n = t.length, mt = t.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (t[i] - mt) * (y[i] - my); sxx += (t[i] - mt) ** 2; }
  const k = sxy / sxx, r = y.map((v, i) => v - my - k * (t[i] - mt));
  let best = 0, bestA = 0;
  for (let fb = lo; fb <= hi; fb += 0.01) {
    let re = 0, im = 0; for (let i = 0; i < n; i++) { re += r[i] * Math.cos(2 * Math.PI * fb * t[i]); im += r[i] * Math.sin(2 * Math.PI * fb * t[i]); }
    const A = Math.hypot(re, im) / n; if (A > bestA) { bestA = A; best = fb; }
  }
  return { rate: best, depth: bestA };
}

// A Timoshenko beam by finite elements, independent of Huang's determinant: linear elements for the
// deflection and the slices' rotation, the shear integrated at one point (no locking), consistent
// masses; L = 1, EI = 1, ρA = 1, so ω = b.
function feTimoshenko(hL, ne = 240) {
  const { E, nu, kappa } = M.bronze, G = E / (2 * (1 + nu)), r2 = hL * hL / 12, kGA = 1 / (r2 * E / (kappa * G));
  const n = 2 * (ne + 1), K = new Float64Array(n * n), Mm = new Float64Array(n * n), l = 1 / ne;
  for (let e = 0; e < ne; e++) {
    const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3], B = [0, -1 / l, 0, 1 / l], S = [-1 / l, -0.5, 1 / l, -0.5];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i] * n + d[j]] += l * B[i] * B[j] + kGA * l * S[i] * S[j];
    for (const [a, b, m] of [[d[0], d[2], l / 6], [d[1], d[3], (r2 * l) / 6]]) { Mm[a * n + a] += 2 * m; Mm[b * n + b] += 2 * m; Mm[a * n + b] += m; Mm[b * n + a] += m; }
  }
  return Array.from(genEig(K, Mm, n, 1).lambda).filter((v) => v > 1).slice(0, 4).map(Math.sqrt);
}

const NOTIE = { ombak: 0, damping: 'ring', tubes: 0 }; // one instrument, nothing stopping it, no tube

console.log('physics');
test('free–free bar: with neither shear nor rotary inertia, Huang\'s determinant has Euler–Bernoulli\'s roots, cos βL cosh βL = 1 (4.7300, 7.8532, 10.9956, 14.1372)', () => {
  const b = M.timoshenko(1e-6, 4), EB = [4.730040745, 7.853204624, 10.99560784, 14.13716549];
  b.forEach((x, n) => near(Math.sqrt(x), EB[n], 1e-5, `mode ${n + 1}`));
  for (const x of EB) assert.ok(Math.abs(Math.cos(x) * Math.cosh(x) - 1) < 1e-8 * Math.cosh(x));
});
test('a thick bar is a Timoshenko beam: Huang\'s roots agree with a finite-element beam within 0.05 % (h/L = 0.03, 0.06, 0.1), and the second partial falls from 2.756 to 2.60 at h/L = 0.1 (a Balinese ugal bar\'s measured 2.61, Jones et al. 2010)', () => {
  for (const hL of [0.03, 0.06, 0.1]) {
    const b = M.timoshenko(hL, 3), fe = feTimoshenko(hL);
    b.forEach((x, n) => assert.ok(Math.abs(x / fe[n] - 1) < 5e-4, `h/L ${hL}, mode ${n + 1}: ${x} vs ${fe[n]}`));
  }
  const b = M.timoshenko(0.1, 2);
  near(b[1] / b[0], 2.60, 0.01, 'h/L = 0.1');
  const t = M.timoshenko(0.03, 2);
  assert.ok(t[1] / t[0] > 2.73 && t[1] / t[0] < 2.756, `h/L = 0.03: ${t[1] / t[0]}`);
});
test('each bar is cut so its first bending mode is its note: f₁ = b₁ √(EI/ρA) / 2πL² for the bar\'s own h/L; a saron\'s bars are thicker, so shorter for the same note', () => {
  const { E, rho } = M.bronze;
  for (const family of ['gangsa', 'saron']) for (const f of [65.4, 261.6, 1046.5, 4186]) {
    const bar = M.bar(family, f), b1 = M.timoshenko(bar.h / bar.L, 1)[0], c = Math.sqrt(E / rho) * bar.h / Math.sqrt(12);
    near((b1 * c) / (2 * Math.PI * bar.L ** 2), f, 1e-6 * f, `${family} ${f}`);
  }
  near(M.bar('gangsa', 261.6).h, 0.007, 1e-12, 'a gangsa\'s 7 mm'); near(M.bar('saron', 261.6).h, 0.012, 1e-12, 'a saron\'s 12 mm');
  assert.ok(M.bar('gangsa', 523.3).L < M.bar('gangsa', 261.6).L && M.bar('gangsa', 261.6).L > 0.25 && M.bar('gangsa', 261.6).L < 0.4, 'a C4 gangsa bar ~31 cm');
  // the width grown with the length as Jones et al.'s bars (6.4 cm at 17 cm, 9.3 cm at 40 cm)
  for (const [L, w] of [[0.17, 0.064], [0.398, 0.093]]) near(0.064 * (L / 0.17) ** 0.45, w, 0.002, `${L} m`);
});
test('torsion: Saint-Venant\'s constant for a rectangle (Roark: 0.1406 w⁴ for a square, w h³/3 for a thin strip), and f_n = (n/2L) √(GK/ρJ)', () => {
  near(M.torsionK(1, 1), 0.1406, 0.0005, 'square');
  near(M.torsionK(1, 0.01) / (1e-6 / 3), 1, 0.01, 'thin strip');
  const { E, nu, rho } = M.bronze, G = E / (2 * (1 + nu)), L = 0.3, w = 0.08, h = 0.007, J = (w * h * (w * w + h * h)) / 12;
  for (const n of [1, 2, 3]) near(M.torsionFreq(L, w, h, n), (n / (2 * L)) * Math.sqrt((G * M.torsionK(w, h)) / (rho * J)), 1e-9, `n = ${n}`);
});
test('the strike point: at the bar\'s centre the second bending mode (a node there) and, on the centre line, every torsion mode are silent; at the end every mode speaks', () => {
  const at = (o) => M.design(60, P({ instrument: 'saron', ...o }));
  const c = at({ along: 0, across: 0 }).modes, end = at({ along: 0.9, across: 0.5 }).modes;
  const bend2 = (m) => m.find((x) => x.kind === 'bend' && x.order === 2);
  assert.ok(Math.abs(bend2(c).amp) < 1e-9, `bend 2 at the centre: ${bend2(c).amp}`);
  for (const m of c.filter((x) => x.kind === 'torsion')) assert.ok(Math.abs(m.amp) < 1e-12, 'torsion on the centre line');
  assert.ok(Math.abs(bend2(end).amp) > 0.3 && end.filter((x) => x.kind === 'torsion').every((m) => Math.abs(m.amp) > 1e-3));
  // EB mode 1 is symmetric, mode 2 antisymmetric about the centre; mode 1's nodes at 22.4 %
  near(M.bendShape(1, 0.5), 0, 1e-9, 'mode 2 at the centre'); near(M.bendShape(0, 0.2242), 0, 2e-3, 'mode 1\'s node');
});
test('the tube: a stopped pipe whose losses are radiation from the open end, f(ka)², and the wall\'s boundary layer, ω δ_v (1 + (γ−1)/√Pr) / 2a; narrow (ka ≤ 0.3) at high notes', () => {
  for (const f of [130.8, 523.3, 2093]) {
    const t = M.tube(0.08, f), k = (2 * Math.PI * f) / 343.2, a = Math.min(0.032, 0.3 / k);
    near(t.a, Math.max(a, 0.004), 1e-12, `${f}: radius`);
    const dv = Math.sqrt((2 * 1.5e-5) / (2 * Math.PI * f)), wall = (2 * Math.PI * f * dv * (1 + 0.4 / Math.sqrt(0.71))) / (2 * t.a);
    near(t.sigma, f * (k * t.a) ** 2 + wall, 0.01 * t.sigma, `${f}: σ`);
  }
});
test('a small kettle gong\'s modes are Perrin et al.\'s (2014), as ratios to (0,1) at 458 Hz; a gong ageng\'s are Krueger et al.\'s (2010), its second round mode set by the ombak 2f₁ − f₂ (121.25 Hz at 2.25 Hz)', () => {
  const PERRIN = [458, 240, 244, 527, 556, 697, 734, 1284, 2005, 2093, 2529, 2606, 3044, 3089, 3726, 3748];
  M.gongTable('bonang').forEach((m, i) => near(m.ratio * 458, PERRIN[i], 1e-9, `bonang ${i}`));
  const KRUEGER = [61.75, 92.0, 101.75, 121.25, 150.25, 153.25, 160.0, 162.5, 236.0];
  M.gongTable('gong').forEach((m, i) => near(m.ratio * 61.75, KRUEGER[i], 1e-9, `gong ${i}`));
  const d = M.design(33, P({ instrument: 'gong', laras: 'keyboard' }));
  near(d.modes[d.round2].f / d.f1, 2 - 2.25 / 61.75, 1e-12, 'f₂/f₁ at the default');
  near(d.modes[d.round2].f, 2 * d.f1 * 0.98178137, 1e-3, 'scales with the note');
  const e = M.design(33, P({ instrument: 'gong', gongBeat: 5 }));
  near(2 * e.f1 - e.modes[e.round2].f, (5 * e.f1) / 61.75, 1e-9, 'the beat it sets');
});
test('the boss: struck there, the round modes speak and the ones with nodal diameters hardly (J_m ∝ r^m); out on the face they come in', () => {
  for (const instrument of ['bonang', 'gong']) {
    const at = (s) => M.design(60, P({ instrument, gongStrike: s })).modes;
    const dia = (m) => m.filter((x) => x.kind === 'diameters').reduce((a, x) => a + Math.abs(x.amp), 0) / Math.abs(m[0].amp);
    assert.ok(dia(at(0)) < 0.3 && dia(at(0.8)) > 3 * dia(at(0)), `${instrument}: ${dia(at(0))} → ${dia(at(0.8))}`);
  }
});
test('the laras: pélog\'s seven on the white keys are ninths of an octave (0 1 2 4 5 6 7, 1 on C); sléndro\'s five on the black are 240 ¢ apart, sléndro 6 (G♯) on pélog 6 (A); the keyboard\'s twelve are equal temperament', () => {
  const at = (pc) => 100 * pc + M.larasCents(60 + pc, 'gamelan');
  [0, 2, 4, 5, 7, 9, 11].forEach((pc, i) => near(at(pc), (1200 / 9) * [0, 1, 2, 4, 5, 6, 7][i], 1e-9, `white ${pc}`));
  const black = [1, 3, 6, 8, 10].map(at);
  for (let i = 1; i < 5; i++) near(black[i] - black[i - 1], 240, 1e-9, `sléndro step ${i}`);
  near(at(8), at(9), 1e-9, 'sléndro 6 = pélog 6');
  assert.deepEqual([60, 62, 64, 65, 67, 69, 71].map((k) => M.larasDegree(k, 'gamelan')), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([61, 63, 66, 68, 70].map((k) => M.larasDegree(k, 'gamelan')), [-2, -3, -5, -6, -1]);
  for (let k = 21; k <= 108; k++) assert.equal(M.larasCents(k, 'keyboard'), 0);
  for (let k = 21; k <= 108; k++) assert.ok(Math.abs(M.larasCents(k, 'gamelan')) < 170, `${k}: within a semitone and a half of its key`);
});
test('Hertz contact: a mallet\'s contact goes as v^(−1/5) and f^(−1/2) (a gong\'s 1/f) from its family\'s at C4 (0.3, 0.3, 1, 2.5 ms); a half-sine pulse has its first zero at 1.5/τ', () => {
  for (const [fam, ms] of [['gangsa', 0.3], ['saron', 0.3], ['bonang', 1], ['gong', 2.5]]) near(M.contact(fam, 1, 261.6256, 1) * 1000, ms, 1e-9, fam);
  near(M.contact('bonang', 1, 261.6256, 1 / 32) / M.contact('bonang', 1, 261.6256, 1), 2, 1e-9, 'v^(−1/5)');
  near(M.contact('bonang', 2, 4 * 261.6256, 1) / M.contact('bonang', 1, 261.6256, 1), 1, 1e-9, '× softness, ∝ f^(−1/2)');
  near(M.contact('gong', 1, 2 * 261.6256, 1) / M.contact('gong', 1, 261.6256, 1), 0.5, 1e-9, 'a gong twice as high, its beater half the size');
  const tau = 1e-3;
  assert.ok(M.pulse(1.5 / tau, tau) < 1e-9 && Math.abs(M.pulse(1, tau) - 1) < 1e-5);
});

console.log('the engine');
test('every key sounds its note: equal temperament × the laras (pélog and sléndro), within 1 ¢ (one instrument, a soft stroke)', () => {
  for (const instrument of ['saron', 'gangsa', 'bonang']) for (const key of [40, 55, 60, 61, 66, 71, 82, 94]) {
    const f = keyFreq(key) * 2 ** (M.larasCents(key, 'gamelan') / 1200), x = render(key, P({ ...NOTIE, instrument }), 0.3, 0.6);
    const c = cents(line(x, f, 2400, 2400 + 16384), f);
    assert.ok(Math.abs(c) < 1, `${instrument} ${key}: ${c.toFixed(2)} ¢`);
  }
});
test('the keyboard\'s tuning moves every note on top of the laras: A = 415 Hz, and ¼-comma meantone (E4 −3.42 ¢)', () => {
  for (const [key, o, c] of [[69, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42]]) {
    const f = keyFreq(key) * 2 ** ((M.larasCents(key, 'gamelan') + c) / 1200);
    near(cents(M.noteFreq(key, P(o)), f), 0, 0.01, `${key}: the model`);
    const x = render(key, P({ ...NOTIE, instrument: 'saron', ...o }), 0.3, 0.6);
    assert.ok(Math.abs(cents(line(x, f, 2400, 2400 + 16384), f)) < 1, `${key}: sounds`);
  }
});
test('the sound is at the model\'s modes: a saron\'s bending and torsion lines, struck off-centre', () => {
  const key = 57, Q = P({ ...NOTIE, instrument: 'saron', laras: 'keyboard', along: 0.5, across: 0.5 }), d = M.design(key, Q, 0.8);
  const x = render(key, Q, 0.8, 0.5), a = 0, b = 12000;
  for (const m of d.modes.slice(0, 6).filter((m) => d.modes.every((o) => o === m || Math.abs(o.f / m.f - 1) > 0.06))) { // the lines that stand apart
    const c = cents(line(x, m.f, a, b, 15), m.f);
    assert.ok(Math.abs(c) < 3, `${m.kind} ${m.order} at ${m.f.toFixed(1)} Hz: ${c.toFixed(2)} ¢`);
  }
});
test('paired tuning (ombak): the pengumbang beat/2 under the note and the pengisep beat/2 over it, panned apart; the beat is the same number of hertz up the keyboard, so the partners\' cents shrink', () => {
  const beats = [];
  for (const key of [55, 72, 88]) {
    const Q = P({ instrument: 'saron', damping: 'ring', laras: 'keyboard', ombak: 6 }), f = keyFreq(key);
    const r = play(Q, 3, [[0, 'on', key, 0.8]], { watch: (e, t) => { if (t > 0.1 && t < 0.11) { assert.equal(e.partners(key), 2); near(e.partnerF1(key, 0), f - 3, 1e-6, 'low'); near(e.partnerF1(key, 1), f + 3, 1e-6, 'high'); } } });
    const x = mono(r), b = beatRate(x, f, 0.2, 2.8);
    near(b.rate, 6, 0.15, `key ${key}: beat`);
    beats.push(cents(f + 3, f - 3));
    // the low partner on the left: the left channel's line is the lower
    const fl = line(r.L, f, 2400, 2400 + 65536, 8), fr = line(r.R, f, 2400, 2400 + 65536, 8);
    assert.ok(fl < fr, `${key}: left ${fl.toFixed(2)}, right ${fr.toFixed(2)}`);
  }
  assert.ok(beats[0] > 2 * beats[1] && beats[1] > 2 * beats[2], `the pairs' cents: ${beats.map((c) => c.toFixed(1))}`);
  const x = render(60, P({ instrument: 'saron', damping: 'ring', ombak: 0 }), 0.8, 2.5), f = M.noteFreq(60, P());
  assert.ok(beatRate(x, f, 0.2, 2.3).depth < 0.02, 'no pair: no beat');
});
test('the mod wheel (ombak) retunes a sounding pair, and splits one instrument into a pair; a note\'s own slide (MPE) is its own beat; the gongs are no pairs', () => {
  const Q = P({ instrument: 'gangsa', damping: 'ring', ombak: 0 });
  // what the engine says at the first block past each of the times
  const at = (params, sec, events, times, f) => { const seen = []; play(params, sec, events, { watch: (e, t) => { while (seen.length < times.length && t >= times[seen.length]) seen.push(f(e)); } }); return seen; };
  assert.deepEqual(at(Q, 1, [[0, 'on', 60, 0.8], [0.3, 'params', 0, P({ ...Q, ombak: 4 })], [0.6, 'slide', 60, 9]], [0.2, 0.5, 0.8], (e) => [e.partners(60), e.beat(60)]), [[1, 0], [2, 4], [2, 9]]);
  assert.deepEqual(at(P({ instrument: 'gong' }), 0.3, [[0, 'on', 40, 0.8]], [0.2], (e) => e.partners(40)), [1]);
});
test('the tubes: a gangsa\'s note louder at first and shorter, its energy handed to the air; off the note, less so', () => {
  const key = 64, f = M.noteFreq(key, P()), Q = (o) => P({ instrument: 'gangsa', ombak: 0, damping: 'ring', along: 0, across: 0, ...o });
  const ring = (o) => { const x = render(key, Q(o), 0.8, 2.5); return [tone(x, f, 0, 4800), tone(x, f, 1.5 * FS, 1.6 * FS)]; };
  const [a0, b0] = ring({ tubes: 0 }), [a1, b1] = ring({ tubes: 1 }), [a2, b2] = ring({ tubes: 1, tubeTune: 250 });
  assert.ok(a1 > 1.25 * a0, `louder at first: ${dB(a1 / a0).toFixed(1)} dB`);
  assert.ok(b1 / a1 < 0.7 * (b0 / a0), `shorter: ${dB(b1 / a1).toFixed(1)} vs ${dB(b0 / a0).toFixed(1)} dB at 1.5 s`);
  assert.ok(b2 / a2 > b1 / a1, `a mistuned tube takes less: ${dB(b2 / a2).toFixed(1)} dB`);
});
test('decay: one bar\'s note falls 60 dB in its ring time (t60 × 0.8 for a saron, ∝ 1/√f), its overtones faster (σ ∝ f^rolloff)', () => {
  for (const key of [48, 67]) {
    const Q = P({ ...NOTIE, instrument: 'saron', laras: 'keyboard', along: 0, across: 0 }), f = keyFreq(key), x = render(key, Q, 0.6, 2.5);
    const a = tone(x, f, 0.2 * FS, 0.4 * FS), b = tone(x, f, 2.0 * FS, 2.2 * FS), T = M.ringTime('saron', DEFAULTS.t60, f);
    near(-dB(b / a) / 1.8, 60 / T, 0.05 * (60 / T), `key ${key}: dB/s`);
    const d = M.design(key, Q);
    near(d.modes[1].sigma / d.modes[0].sigma, (d.modes[1].f / d.modes[0].f) ** DEFAULTS.rolloff, 1e-9, 'rolloff');
  }
});
test('the gong\'s curvature: its note makes its own second harmonic, as the square of its amplitude and in proportion to the curvature; on a gong ageng it beats with the second round mode at 2f₁ − f₂ (the gong ageng\'s ombak); flat, the band at 2f₁ holds only that mode and does not beat', () => {
  // on a bonang, whose second round mode (2.80) lies far from 2f₁, the harmonic stands alone
  const kb = 60, B = (o) => P({ instrument: 'bonang', ombak: 0, damping: 'ring', laras: 'keyboard', gongStrike: 0, ...o }), fb = keyFreq(kb);
  const h = (v, o = {}) => { const x = render(kb, B(o), v, 0.6); return tone(x, 2 * fb, 0.05 * FS, 0.6 * FS) / tone(x, fb, 0.05 * FS, 0.6 * FS); };
  // the note's own amplitude goes as v × the mallet's pulse at f₁ (its contact shortens as v^(−1/5))
  const u = (v) => v * M.pulse(fb, M.contact('bonang', 1, fb, v));
  near(dB(h(0.8) / h(0.4)), dB(u(0.8) / u(0.4)), 0.5, 'the harmonic over the note, against velocity: ∝ the note\'s amplitude');
  assert.ok(h(0.8, { curvature: 0 }) < 0.05 * h(0.8), `flat: ${h(0.8, { curvature: 0 })} vs ${h(0.8)}`);
  near(h(0.8, { curvature: 2 }) / h(0.8), 2, 0.2, '∝ the curvature');
  const key = 33, Q = (o) => P({ instrument: 'gong', laras: 'keyboard', gongStrike: 0, ...o }), f1 = keyFreq(key), f2 = f1 * (2 - 2.25 / 61.75);
  const beat = (o) => beatRate(render(key, Q(o), 1, 6), (2 * f1 + f2) / 2, 0.3, 5.5, { win: 0.15, lo: 0.6, hi: 6 });
  const b = beat({});
  near(b.rate, (2.25 * f1) / 61.75, 0.15, 'the beat');
  assert.ok(beat({ curvature: 0 }).depth < 0.3 * b.depth, 'flat: no beat');
  near(beat({ gongBeat: 4 }).rate, (4 * f1) / 61.75, 0.2, 'the smith\'s other ombak');
});
test('the damping hand: each stroke stops the player\'s last bar (a chord rings on), Space lifts the hand, and in the ensemble each player stops only their own; gongs ring on', () => {
  const state = (o, events, at, keys) => { const out = {}; play(P(o), at + 0.01, events, { watch: (e, t) => { if (Math.abs(t - at) < 0.002) for (const k of keys) out[k] = e.damped(k); } }); return out; };
  assert.deepEqual(state({}, [[0, 'on', 60, 0.7], [0.01, 'on', 64, 0.7], [0.3, 'on', 67, 0.7]], 0.4, [60, 64, 67]), { 60: true, 64: true, 67: false });
  assert.deepEqual(state({}, [[0, 'on', 60, 0.7], [0.005, 'on', 64, 0.7]], 0.2, [60, 64]), { 60: false, 64: false });
  assert.deepEqual(state({}, [[0, 'sustain', 0, true], [0.01, 'on', 60, 0.7], [0.3, 'on', 62, 0.7]], 0.4, [60, 62]), { 60: false, 62: false });
  assert.deepEqual(state({}, [[0, 'sustain', 0, true], [0.01, 'on', 60, 0.7], [0.3, 'on', 62, 0.7], [0.5, 'sustain', 0, false]], 0.6, [60, 62]), { 60: true, 62: false });
  assert.deepEqual(state({ instrument: 'ensemble' }, [[0, 'on', 60, 0.7], [0.1, 'on', 73, 0.7], [0.2, 'on', 62, 0.7]], 0.3, [60, 73, 62]), { 60: true, 73: false, 62: false });
  assert.deepEqual(state({ instrument: 'gong' }, [[0, 'on', 40, 0.7], [0.1, 'on', 42, 0.7]], 0.3, [40, 42]), { 40: false, 42: false });
  assert.deepEqual(state({ damping: 'release' }, [[0, 'on', 60, 0.7], [0.1, 'on', 62, 0.7], [0.2, 'off', 60]], 0.3, [60, 62]), { 60: true, 62: false });
  assert.deepEqual(state({ damping: 'ring' }, [[0, 'on', 60, 0.7], [0.1, 'on', 62, 0.7], [0.2, 'off', 60]], 0.3, [60, 62]), { 60: false, 62: false });
  // a damped bar falls silent in its hand's T60
  const x = mono(play(P(), 1.2, [[0, 'on', 60, 0.8], [0.3, 'on', 62, 0.8]])), f = M.noteFreq(60, P());
  assert.ok(dB(tone(x, f, 0.9 * FS, 1.1 * FS) / tone(x, f, 0.1 * FS, 0.25 * FS)) < -40, 'stopped');
});
test('a softer mallet reaches fewer overtones: the energy above 3× the note falls', () => {
  const key = 60, f = M.noteFreq(key, P()), Q = (m) => P({ ...NOTIE, instrument: 'saron', mallet: m, along: 0.6, across: 0.4 });
  const hi = (m) => { const d = M.design(key, Q(m), 0.8); return d.modes.filter((x) => x.f > 3 * f).reduce((a, x) => a + x.amp * x.amp, 0) / d.modes[0].amp ** 2; };
  assert.ok(hi(3) < 0.2 * hi(0.5), `${hi(0.5)} → ${hi(3)}`);
});
test('output level is sane: a full stroke peaks 0.02–1 on every instrument, no NaN, and every preset plays', () => {
  for (const instrument of ['gangsa', 'saron', 'bonang', 'gong', 'ensemble']) for (const key of [24, 45, 60, 79, 100]) {
    const x = render(key, P({ instrument }), 1, 0.5);
    let pk = 0; for (const v of x) { assert.ok(Number.isFinite(v), `${instrument} ${key}: NaN`); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.02 && pk < 1, `${instrument} ${key}: peak ${pk.toFixed(3)}`);
  }
  for (const pr of PRESETS) {
    const x = mono(play(P(pr.p), 1, [48, 60, 64, 67, 72].map((k, i) => [i * 0.05, 'on', k, 1])));
    let pk = 0; for (const v of x) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.02 && pk < 1.5, `${pr.name}: ${pk}`);
  }
});
test('silence: a damped note goes quiet and its voice ends; Panic stops everything', () => {
  const r = play(P({ damping: 'release' }), 2, [[0, 'on', 60, 1], [0.2, 'off', 60]], { watch: (e, t) => { if (t > 1.9) assert.equal(e.voiceCount(), 0, 'the voice ended'); } });
  assert.ok(rms(mono(r), 1.5 * FS, 2 * FS) < 1e-4);
  play(P({ instrument: 'gong' }), 0.5, [[0, 'on', 30, 1]], { watch: (e, t) => { if (Math.abs(t - 0.3) < 0.002) { e.allNotesOff(); assert.equal(e.voiceCount(), 0); } } });
});
test('Quality: each partner rings 16 modes at High, 10 at Medium and 6 at Low; past 24 voices at Medium and 12 at Low the oldest is damped; a note keeps its pitch and level', () => {
  for (const [quality, top] of [['high', 16], ['medium', 10], ['low', 6]]) {
    let n = 0; play(P({ instrument: 'bonang' }), 0.2, [[0, 'on', 60, 0.8]], { quality, watch: (e) => { n = Math.max(n, e.modes(60)); } });
    assert.equal(n, top, quality);
  }
  for (const [quality, cap] of [['medium', 24], ['low', 12]]) {
    const keys = Array.from({ length: 30 }, (_, i) => 40 + i);
    let ringing = 0;
    play(P({ damping: 'ring' }), 0.5, keys.map((k, i) => [i * 0.01, 'on', k, 0.6]), { quality, watch: (e, t) => { if (Math.abs(t - 0.45) < 0.002) ringing = keys.filter((k) => e.active(k) && !e.damped(k)).length; } });
    assert.ok(ringing <= cap + 1, `${quality}: ${ringing} ringing`);
  }
  for (const key of [48, 62, 79]) {
    const Q = P({ ...NOTIE, instrument: 'saron' }), f = M.noteFreq(key, Q), at = (quality) => mono(play(Q, 1, [[0, 'on', key, 0.8]], { quality })), hi = at('high');
    for (const quality of ['medium', 'low']) {
      const x = at(quality), d = dB(rms(x, 0, x.length) / rms(hi, 0, hi.length)), c = cents(line(x, f, 4800, FS), line(hi, f, 4800, FS));
      assert.ok(Math.abs(d) < 1.5 && Math.abs(c) < 0.1, `key ${key} at ${quality}: ${d.toFixed(2)} dB, ${c.toFixed(3)} ¢`);
    }
  }
});
test('CPU: 10 paired notes render faster than 5× real time', () => {
  const keys = [48, 52, 55, 60, 64, 67, 71, 72, 76, 79], sec = 2;
  const t0 = performance.now();
  play(P({ damping: 'ring' }), sec, keys.map((k, i) => [i * 0.01, 'on', k, 0.8]));
  const ms = performance.now() - t0;
  assert.ok(ms < (1000 * sec) / 5, `${ms.toFixed(0)} ms for ${sec} s`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
