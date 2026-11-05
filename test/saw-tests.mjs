// Musical Saw checks. Run: node test/saw-tests.mjs
//
// The physics against independent results (the harmonic well that a gentle bend makes, a
// variational bound worked in Fourier space, the trapped-mode table solved again), then the
// engine against its model: the pitch, the ring, the bow's threshold, the trap's loss, the J that
// traps nothing. Both are the C++ (native/instruments/saw), built as WebAssembly.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../saw/src/saw-instrument.js';
import { wasmModel } from '../saw/src/saw-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';
import { solveTrapped } from '../tools/saw-native-table.mjs';

const SawEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, vibrato: 0, ...o }); // still knees unless a test shakes them
const keyF = (k, o) => tunedFreq(P(o), k);
const cents = (a, b) => 1200 * Math.log2(a / b);

// Play a score through the engine, 128-sample blocks like the AudioWorklet: events [t, fn(e)].
function play(params, sec, events = [], quality) {
  const e = new SawEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  let k = 0;
  for (let s = 0; s < n; s += bl) {
    while (k < ev.length && ev[k][0] * FS <= s) ev[k++][1](e);
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return { x: L, e };
}
const note = (key, params, sec, { vel = 0.7, off = sec, quality } = {}) => play(params, sec, [[0, (e) => e.noteOn(key, vel)], [off, (e) => e.noteOff(key)]], quality);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// The strongest frequency within ±40 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-40 / 1200), hi = f0 * 2 ** (40 / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const sec = (t) => Math.round(t * FS);
// Upward zero crossings in x[a, b), as times (s).
function crossings(x, a, b) {
  const out = [];
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) out.push((i - 1 + x[i - 1] / (x[i - 1] - x[i])) / FS);
  return out;
}

console.log('physics');
test('a gentle bend is a harmonic well: Ω² → 1 + (2n + 1)√2 ε and widths √((n + ½)√2/ε) as ε → 0 (the table, within 0.1 %)', () => {
  for (const eps of [0.0012, 0.003, 0.006]) {
    for (let n = 0; n < 3; n++) {
      const t = M.trapped(eps, n), W2 = 1 + (2 * n + 1) * Math.SQRT2 * eps, rms = Math.sqrt(((n + 0.5) * Math.SQRT2) / eps);
      assert.ok(Math.abs(t.Omega ** 2 - W2) < 5e-3 * (W2 - 1), `ε ${eps}, n ${n}: Ω² ${t.Omega ** 2} vs ${W2}`);
      assert.ok(Math.abs(t.rms / rms - 1) < 0.005, `ε ${eps}, n ${n}: width ${t.rms} vs ${rms}`);
    }
  }
});
test('the trapped mode against a Gaussian worked in Fourier space: the table\'s Ω₀² is under the variational bound (to the table\'s 10⁻⁴), and within 5 % of it (ε 0.03 to 1)', () => {
  // Ω² ≤ [∫ |g|² (1 + k²)² + ε² ∫ |g′|² / (1 + k²)²] / ∫ |g|², g(k) = e^(−k²s²/2), best s
  const bound = (eps) => {
    let best = Infinity;
    for (let ls = -2; ls <= 3; ls += 0.005) {
      const s = 10 ** ls, K = 12 / s + 12, dk = K / 4000;
      let a = 0, b = 0, c = 0;
      for (let k = dk / 2; k < K; k += dk) {
        const g = Math.exp(-0.5 * k * k * s * s), g1 = -k * s * s * g, q = 1 + k * k;
        a += g * g * q * q; b += (g1 * g1) / (q * q); c += g * g;
      }
      best = Math.min(best, (a + eps * eps * b) / c);
    }
    return best;
  };
  for (const eps of [0.03, 0.3, 1]) {
    const W2 = M.trapped(eps, 0).Omega ** 2, B = bound(eps);
    assert.ok(W2 <= B * (1 + 2e-4), `ε ${eps}: table ${W2} above the bound ${B}`);
    assert.ok(B - W2 < 0.05 * W2, `ε ${eps}: table ${W2}, bound ${B}`);
  }
});
test('the trapped-mode table (native/instruments/saw/saw-table.h) is tools/saw-native-table.mjs\'s solve: three entries solved again agree, and a finer grid moves Ω₀ by under 10⁻⁴', () => {
  for (const eps of [10 ** -2, 10 ** -0.5, 10 ** 0.5]) {
    const m = solveTrapped(eps), fine = solveTrapped(eps, { span: 13, res: 18, maxN: 560 });
    for (let n = 0; n < 3; n++) {
      const t = M.trapped(eps, n);
      assert.ok(Math.abs(t.Omega - Math.sqrt(m[n].W2)) < 1e-6 * t.Omega, `ε ${eps}, n ${n}: ${t.Omega} vs ${Math.sqrt(m[n].W2)}`);
    }
    assert.ok(Math.abs(Math.sqrt(fine[0].W2) / Math.sqrt(m[0].W2) - 1) < 1e-4, `ε ${eps}: ${Math.sqrt(fine[0].W2)} vs ${Math.sqrt(m[0].W2)}`);
  }
});
test('across the blade: free–free beam shapes, ±2 at the edges and orthonormal; along it: Hermite functions, orthonormal', () => {
  const N = 4000;
  for (const [m, n] of [[0, 0], [1, 1], [0, 1]]) {
    let s = 0;
    for (let i = 0; i < N; i++) { const u = (i + 0.5) / N; s += M.cross(m, u) * M.cross(n, u); }
    assert.ok(Math.abs(s / N - (m === n ? 1 : 0)) < 1e-3, `φ${m}·φ${n} = ${s / N}`);
  }
  assert.ok(Math.abs(M.cross(0, 0) - 2) < 1e-6 && Math.abs(M.cross(0, 1) - 2) < 1e-6 && Math.abs(M.cross(1, 1) + 2) < 1e-6, 'edges');
  for (const [m, n] of [[0, 0], [1, 1], [2, 2], [0, 2], [1, 2]]) {
    let s = 0;
    for (let x = -12; x < 12; x += 0.001) s += M.hermite(m, x) * M.hermite(n, x) * 0.001;
    assert.ok(Math.abs(s - (m === n ? 1 : 0)) < 1e-6, `h${m}·h${n} = ${s}`);
  }
});
test('the blade\'s compass: about two octaves (C4 to C♯6), the inflection walking toward the tip as the note rises; keys past it play a scaled saw, f·λ fixed and ε unchanged', () => {
  const lo = M.noteAt(P(), M.S_LO), hi = M.noteAt(P(), M.S_HI);
  assert.ok(Math.abs(cents(lo, keyF(60))) < 100 && Math.abs(cents(hi, keyF(85))) < 100, `${lo.toFixed(1)} – ${hi.toFixed(1)} Hz`);
  let s = 0;
  for (let k = 60; k <= 84; k++) { const p = M.plan(keyF(k), P()); assert.ok(p.s > s && p.lambda === 1, `key ${k}: s ${p.s}`); s = p.s; }
  const edge = M.plan(lo, P());
  for (const k of [21, 36, 48]) {
    const p = M.plan(keyF(k), P());
    assert.ok(Math.abs((p.lambda * keyF(k)) / lo - 1) < 1e-9 && Math.abs(p.eps2 / edge.eps2 - 1) < 1e-9, `key ${k}: λ ${p.lambda}, ε ${p.eps2}`);
  }
});
test('the trap: a tighter bend squeezes the mode and raises the note at the same place; a looser one leaks to the hands (Gamow\'s rate) far faster', () => {
  const z = 0.5, f = (b) => M.noteAt(P({ bend: b }), z);
  assert.ok(f(3) < f(6) && f(6) < f(12), `${f(3)}, ${f(6)}, ${f(12)}`);
  const at = (b) => M.plan(keyF(67), P({ bend: b }));
  assert.ok(at(12).ell[0] < at(6).ell[0] && at(6).ell[0] < at(3).ell[0], 'the mode narrows as the bend tightens');
  assert.ok(at(2).leak[0] > 1000 * Math.max(at(6).leak[0], 1e-6), `leak: bend 2 ${at(2).leak[0]}/s, bend 6 ${at(6).leak[0]}/s`);
  assert.ok(at(6).leak[0] < 0.1 * at(6).sigma[0], 'a well-bent saw keeps its note: most of its loss is the steel\'s and the air\'s');
});

console.log('engine');
test('struck, every key sounds on its note (within 0.5 ¢; A0 to C8 in fifths)', () => {
  for (let k = 21; k <= 108; k += 7) {
    const f = keyF(k), { x } = note(k, P({ excite: 'mallet' }), 0.9), a = sec(0.1), b = sec(0.9);
    const c = cents(peak(x, f, a, b), f);
    assert.ok(Math.abs(c) < 0.5, `key ${k}: ${c.toFixed(2)} ¢`);
  }
});
test('bowed, the note speaks and holds on pitch across the compass (within 3 ¢: the bow pulls it a little flat), its level within 3 dB from note to note', () => {
  const lv = [];
  for (const k of [55, 60, 64, 69, 76, 81, 86]) {
    const f = keyF(k), { x } = note(k, P(), 2), a = sec(1.2), b = sec(2);
    const c = cents(peak(x, f, a, b), f), r = rms(x, a, b);
    assert.ok(Math.abs(c) < 3, `key ${k}: ${c.toFixed(2)} ¢`);
    assert.ok(r > 0.02, `key ${k}: rms ${r}`);
    lv.push(20 * Math.log10(r));
  }
  assert.ok(Math.max(...lv) - Math.min(...lv) < 3, `levels ${lv.map((v) => v.toFixed(1)).join(' ')} dB`);
});
test('the bow\'s threshold: at half the force the note never speaks, at 2.5 times it does (A4)', () => {
  const quiet = note(69, P({ force: 0.5 }), 1.5, { vel: 0.5 }).x, loud = note(69, P(), 1.5, { vel: 0.5 }).x;
  const a = sec(1.1), b = sec(1.5);
  assert.ok(rms(quiet, a, b) < 0.01 * rms(loud, a, b), `${rms(quiet, a, b)} vs ${rms(loud, a, b)}`);
});
test('struck, the note rings as the model\'s loss says (within 1 dB over a second, A4 and G5)', () => {
  for (const k of [69, 79]) {
    const f = keyF(k), pl = M.plan(f, P({ excite: 'mallet' })), { x } = note(k, P({ excite: 'mallet' }), 1.7);
    const W = 8192, a = sec(0.3), b = sec(1.3);
    const db = 20 * Math.log10(tone(x, f, b, b + W) / tone(x, f, a, a + W)), want = -20 * Math.log10(Math.E) * pl.sigma[0];
    assert.ok(Math.abs(db - want) < 1, `key ${k}: ${db.toFixed(2)} dB, the model ${want.toFixed(2)} dB`);
  }
});
test('a J traps nothing: bowed it stays silent, struck it dies at least ten times faster than the S', () => {
  const Jb = note(69, P({ shape: 'J' }), 1.5).x;
  assert.ok(rms(Jb, sec(1), sec(1.5)) < 1e-3, `bowed J ${rms(Jb, sec(1), sec(1.5))}`);
  const rate = (shape, a, b) => { const { x } = note(69, P({ shape, excite: 'mallet' }), 1); return (20 * Math.log10(rms(x, sec(a), sec(a + 0.01)) / rms(x, sec(b), sec(b + 0.01)))) / (b - a); };
  const S = rate('S', 0.1, 0.6), J = rate('J', 0.02, 0.07);
  assert.ok(J > 10 * S, `decay: S ${S.toFixed(1)} dB/s, J ${J.toFixed(1)} dB/s`);
});
test('the sweet spot: bowed 5 cm off the inflection, A4 falls silent (30 dB down) and C6 jumps to its second trapped mode', () => {
  const on = note(69, P(), 2).x, off = note(69, P({ place: 5 }), 2).x;
  assert.ok(rms(off, sec(1.5), sec(2)) < 0.03 * rms(on, sec(1.5), sec(2)), `A4: ${rms(off, sec(1.5), sec(2))} vs ${rms(on, sec(1.5), sec(2))}`);
  const f = keyF(84), f1 = M.plan(f, P()).fm[1], { x } = note(84, P({ place: 5 }), 2);
  assert.ok(tone(x, f1, sec(1), sec(2)) > 100 * tone(x, f, sec(1), sec(2)), 'C6 sounds its second mode');
});
test('One saw: a key pressed while another is held slides the one note there in about the re-bending time, with the bow on', () => {
  const p = P({ mode: 'saw', glide: 0.2 });
  const { x, e } = play(p, 2, [[0, (en) => en.noteOn(64, 0.7)], [1, (en) => en.noteOn(71, 0.7)]]);
  assert.equal(e.voiceCount(), 1);
  const f0 = keyF(64), f1 = keyF(71);
  assert.ok(Math.abs(cents(peak(x, f0, sec(0.7), sec(1)), f0)) < 3, 'the first note');
  const zc = crossings(x, sec(1.05), sec(1.15)), mid = (zc.length - 1) / (zc.at(-1) - zc[0]);
  assert.ok(mid > f0 * 1.05 && mid < f1 * 0.97, `halfway through the slide: ${mid.toFixed(1)} Hz`);
  assert.ok(Math.abs(cents(peak(x, f1, sec(1.5), sec(2)), f1)) < 3, 'lands on the second');
});
test('the knee\'s vibrato: ±20 ¢ at 5 Hz wobbles the bowed note by ±20 ¢ (within 3 ¢), once it has started', () => {
  const { x } = note(69, P({ vibrato: 20, vibRate: 5 }), 3), zc = crossings(x, sec(1.5), sec(3));
  const f = [];
  for (let i = 0; i + 20 < zc.length; i += 10) f.push(20 / (zc[i + 20] - zc[i]));
  const c = f.map((v) => cents(v, keyF(69))), dev = (Math.max(...c) - Math.min(...c)) / 2;
  assert.ok(Math.abs(dev - 20) < 3, `±${dev.toFixed(1)} ¢`);
});
test('pitch bend: the wheel at full bends the blade two semitones', () => {
  const { x } = play(P({ excite: 'mallet' }), 1, [[0, (e) => e.handle({ type: 'bend', value: 1 })], [0, (e) => e.noteOn(69, 0.8)]]);
  const f = keyF(69) * 2 ** (2 / 12);
  assert.ok(Math.abs(cents(peak(x, f, sec(0.3), sec(1)), f)) < 1);
});
test('a key let go lays a hand on the blade (silent within half a second); with the pedal down it rings on', () => {
  const off = note(69, P(), 2.5, { off: 1.5 }).x;
  const ped = play(P(), 2.5, [[0, (e) => { e.setSustain(true); e.noteOn(69, 0.7); }], [1.5, (e) => e.noteOff(69)]]).x;
  const a = sec(2.0), b = sec(2.5), ref = rms(off, sec(1), sec(1.5));
  assert.ok(rms(off, a, b) < 1e-3 * ref, `damped ${rms(off, a, b)}`);
  assert.ok(rms(ped, a, b) > 0.05 * ref, `ringing ${rms(ped, a, b)}`);
});
test('output level is sane (peak 0.02 – 1 at the defaults, under 2 at the ends of every parameter, where the limiter takes it) and finite', () => {
  const ends = [{}, { excite: 'mallet', contact: 0.2 }, { force: 12, speed: 0.6 }, { force: 12, speed: 0.05 }, { bend: 20, thickness: 1.2 }, { bend: 1.5, thickness: 0.5 }, { place: 8 }, { place: -8 }, { ring: 12, vibrato: 60, vibRate: 9 }];
  for (const o of ends) {
    let pk = 0;
    for (const k of [21, 48, 69, 96, 108]) {
      const { x } = note(k, P({ ...o }), 0.8, { vel: 1 });
      for (const v of x) { assert.ok(Number.isFinite(v), `${JSON.stringify(o)} key ${k}: NaN`); pk = Math.max(pk, Math.abs(v)); }
    }
    assert.ok(pk > 0.02 && pk < (Object.keys(o).length ? 2 : 1), `${JSON.stringify(o)}: peak ${pk}`);
  }
});

// What the Quality setting trims (README ## Quality): fewer modes a saw and fewer saws at once,
// counted, and the note keeps its pitch and level.
test('Quality: 5, 3 and 2 modes a saw, 16, 10 and 6 saws at once; a note keeps its pitch and level', () => {
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (const [quality, modes, cap] of [['high', 5, 16], ['medium', 3, 10], ['low', 2, 6]]) {
    const e = new SawEngine(FS);
    e.setQuality(quality); e.setParams(P());
    for (let i = 0; i < 20; i++) { e.noteOn(48 + i, 0.7); for (let b = 0; b < 4; b++) e.process(bL, bR, 128); }
    for (let b = 0; b < 40; b++) e.process(bL, bR, 128); // the stolen saws fade
    assert.equal(e.voice(67).M, modes, `${quality}: modes`);
    let live = 0;
    for (let i = 0; i < 20; i++) live += e.voice(48 + i).alive && e.voice(48 + i).sigma < 30 ? 1 : 0;
    assert.equal(live, cap, `${quality}: saws sounding`);
  }
  for (const k of [60, 69, 84]) {
    const f = keyF(k), hi = note(k, P(), 1.5).x;
    for (const quality of ['medium', 'low']) {
      const x = note(k, P(), 1.5, { quality }).x, c = cents(peak(x, f, sec(1), sec(1.5)), peak(hi, f, sec(1), sec(1.5)));
      const d = 20 * Math.log10(rms(x, sec(1), sec(1.5)) / rms(hi, sec(1), sec(1.5)));
      assert.ok(Math.abs(c) < 2 && Math.abs(d) < 1.5, `key ${k} at ${quality}: ${c.toFixed(2)} ¢, ${d.toFixed(2)} dB`);
    }
  }
});
test('CPU: ten bowed saws play at least 10 times faster than real time', () => {
  const e = new SawEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P({ vibrato: 12 }));
  for (let i = 0; i < 10; i++) e.noteOn(55 + 3 * i, 0.7);
  const blocks = Math.round((2 * FS) / 128), t0 = performance.now();
  for (let b = 0; b < blocks; b++) e.process(bL, bR, 128);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000 / 10, `${ms.toFixed(0)} ms for 2 s`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
