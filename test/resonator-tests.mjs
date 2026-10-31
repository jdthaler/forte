// Magnetic Resonator Piano checks. Run: node test/resonator-tests.mjs
//
// The physics against independent results (the stiff string's partials, a resistive bridge's
// loss, a coil's pull ∝ i², a phase-locked loop's lock), then the engine against the model and
// McPherson's own observations of the MRP (JNMR 2010): notes grow out of silence, bass strings
// take seconds, a coil on a partial's node cannot drive it, the calibrated phase is the loudest,
// fifteen notes at once. Both are the C++ (native/instruments/resonator), built as WebAssembly.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../resonator/src/resonator-instrument.js';
import { wasmModel } from '../resonator/src/resonator-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';

const ResonatorEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });

// Play a script through the engine in 128-sample blocks, like the AudioWorklet: events at
// times (s) are [t, fn(engine)]. Returns the left channel and the engine.
function play(params, sec, events, quality) {
  const e = new ResonatorEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a[0] - b[0]);
  let at = 0;
  for (let s = 0; s < n; s += bl) {
    while (at < ev.length && ev[at][0] * FS <= s) ev[at++][1](e);
    e.process(bL, bR, bl);
    L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return { x: L, e };
}
const note = (key, params, sec, vel = 0.8, quality) => play(params, sec, [[0, (e) => e.noteOn(key, vel)]], quality);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel), and its level in dB.
function tone(x, f, a = 0, b = x.length) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
const dB = (v) => 20 * Math.log10(v + 1e-15);
// The strongest frequency within ±20 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-20 / 1200), hi = f0 * 2 ** (20 / 1200);
  for (let i = 0; i < 40; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const sec = (t) => Math.round(t * FS);

console.log('physics');
test('the strings: the first partial is the note, the rest the stiff string\'s n f₀√(1 + Bn²) with f₀ = √(T/μ)/2L and B = π³Ed⁴/64TL²', () => {
  for (const k of [21, 36, 48, 60, 72, 84, 96, 108]) {
    const s = M.strings(k, P({ unison: 0 })), f0 = Math.sqrt(s.T / s.mu) / (2 * s.L), B = (Math.PI ** 3 * 2e11 * s.d ** 4) / (64 * s.T * s.L * s.L);
    assert.ok(Math.abs(B / s.B - 1) < 1e-9, `${k}: B`);
    assert.ok(Math.abs(cents(s.partials[0].f, keyFreq(k))) < 1e-6, `${k}: on its note`);
    s.partials.forEach((p, i) => { const n = i + 1; assert.ok(Math.abs(cents(p.f, n * f0 * Math.sqrt(1 + B * n * n))) < 1e-6, `${k}: partial ${n}`); });
    assert.ok(s.T > 300 && s.T < 2000, `${k}: tension ${s.T.toFixed(0)} N`);
  }
  // a grand's inharmonicity: of order 10⁻⁴ in the tenor, 10⁻³–10⁻² high in the treble (Fletcher & Rossing, Fig. 12.13)
  const B = (k) => M.strings(k, P()).B;
  assert.ok(B(48) > 5e-5 && B(48) < 1e-3 && B(84) > 1e-3 && B(84) < 3e-2, `B(C3) ${B(48).toExponential(2)}, B(C6) ${B(84).toExponential(2)}`);
});
test('a resistive bridge takes a string\'s energy at σ = GT/L whatever the partial; its coupling is β = √(2GT/L), less the stiffness\'s share', () => {
  for (const k of [30, 60, 90]) {
    const s = M.strings(k, P());
    assert.ok(Math.abs(s.sigmaBridge / ((s.G * s.T) / s.L) - 1) < 1e-9 && s.G <= M.BRIDGE_G && s.G >= M.BRIDGE_G / 2);
    s.partials.forEach((p, i) => assert.ok(Math.abs((p.beta * p.beta * (1 + s.B * (i + 1) ** 2)) / (2 * s.sigmaBridge) - 1) < 1e-9, `${k}: β²(1 + Bn²) = 2σ`));
  }
});
test('the coil: its pull on partial n is sin(nπx) averaged over its width; McPherson\'s nodes (5th partial at C2 and C3, 4th at C4, 3rd at C5)', () => {
  for (const [n, x, w] of [[1, 0.2, 0.05], [7, 0.31, 0.1], [12, 0.25, 0.02]]) {
    let s = 0; const N = 20000;
    for (let i = 0; i < N; i++) s += Math.sin(n * Math.PI * (x - w / 2 + (w * (i + 0.5)) / N));
    assert.ok(Math.abs(M.coilWeight(n, x, w) - s / N) < 1e-6, `n ${n}`);
  }
  for (const [k, n] of [[36, 5], [48, 5], [60, 4], [72, 3]]) {
    const s = M.strings(k, P()), node = Math.abs(s.partials[n - 1].psiA), most = Math.max(...s.partials.slice(0, 8).map((p) => Math.abs(p.psiA)));
    assert.ok(node < 0.08 * most, `key ${k}: partial ${n} under the coil at ${(s.xa * 100).toFixed(1)} %: ${(node / most).toFixed(3)} of the most`);
  }
});

console.log('engine');
test('with the hammers off, a note grows out of silence and the loop locks to the string', () => {
  const { x, e } = note(60, P(), 3);
  const early = rms(x, 0, sec(0.05)), late = rms(x, sec(2.5), sec(3));
  assert.ok(dB(late) - dB(early) > 30, `first 50 ms ${dB(early).toFixed(1)} dB, at 2.5 s ${dB(late).toFixed(1)} dB`);
  const v = e.voices[0];
  assert.ok(v.driven && Math.abs(v.cents) < 2, `the oscillator ${v.cents.toFixed(2)} ¢ from the partial`);
});
test('it sustains on pitch across the keyboard (within 2 ¢ of the note) and keeps its level while held', () => {
  for (const k of [36, 48, 60, 72, 84, 96]) {
    const { x } = note(k, P(), 8), f = keyFreq(k);
    const c = cents(peak(x, f, sec(6), sec(8)), f);
    assert.ok(Math.abs(c) < 2, `${k}: ${c.toFixed(2)} ¢`);
  }
  for (const k of [48, 72, 96]) { // a bass string takes seconds to settle, and detuned unisons beat slowly
    const y = note(k, P({ unison: 0 }), 11).x, d = dB(rms(y, sec(10), sec(11))) - dB(rms(y, sec(9), sec(10)));
    assert.ok(Math.abs(d) < 1, `${k}: ${d.toFixed(2)} dB a second, held`);
  }
});
test('the keyboard\'s tuning: at A = 415 Hz and in ¼-comma meantone the strings are retuned and the loop follows them (within 2 ¢)', () => {
  for (const [k, o] of [[69, { pitch: 415 }], [64, { temperament: 'meantone' }], [60, { temperament: 'meantone' }]]) {
    const f = tunedFreq(P(o), k), s = M.strings(k, P(o));
    assert.ok(Math.abs(cents(s.partials[0].f, f)) < 1e-6, `${k}: the model`);
    const { x } = note(k, P(o), 4);
    assert.ok(Math.abs(cents(peak(x, f, sec(3), sec(4)), f)) < 2, `${k}: sounds ${cents(peak(x, f, sec(3), sec(4)), f).toFixed(2)} ¢ off`);
  }
});
test('as loud as a struck note (McPherson: C4 "comparable to a hammer-struck note"), within 6 dB', () => {
  const drive = rms(note(60, P(), 4).x, sec(3), sec(4));
  const struck = rms(note(60, P({ hammer: 0.6, drive: 0 }), 0.5).x, 0, sec(0.5));
  assert.ok(Math.abs(dB(drive) - dB(struck)) < 6, `driven ${dB(drive).toFixed(1)} dB, struck ${dB(struck).toFixed(1)} dB`);
});
test('the bass takes seconds to swell, the treble a fraction of one: rise time ∝ 1/σ (C2 short of full after 5 s)', () => {
  const rise = (k) => {
    const { x } = note(k, P({ attack: 0.01 }), 8), end = rms(x, sec(7.5), sec(8));
    for (let t = 0; t < 8; t += 0.05) if (rms(x, sec(t), sec(t + 0.05)) > end / 2) return t;
    return 8;
  };
  const [c2, c4, c6] = [rise(36), rise(60), rise(84)];
  assert.ok(c2 > c4 && c4 > c6 && c2 > 1 && c6 < 0.5, `−6 dB of full at C2 ${c2.toFixed(2)} s, C4 ${c4.toFixed(2)} s, C6 ${c6.toFixed(2)} s`);
  const { x } = note(36, P({ attack: 0.01 }), 12);
  assert.ok(rms(x, sec(4.5), sec(5)) < 0.95 * rms(x, sec(11.5), sec(12)), 'C2 still growing at 5 s');
});
test('the calibrated phase is the loudest (within 45°); ±90° puts in little, 180° nothing', () => {
  const level = (phase) => rms(note(55, P({ phase, attack: 0.01 }), 3).x, sec(2.5), sec(3));
  const scan = [-90, -60, -30, 0, 30, 60, 90].map((ph) => [ph, level(ph)]);
  const best = scan.reduce((a, b) => (b[1] > a[1] ? b : a));
  assert.ok(Math.abs(best[0]) <= 45, `loudest at ${best[0]}°: ${scan.map(([p, l]) => `${p}° ${dB(l).toFixed(1)}`).join(', ')}`);
  assert.ok(dB(level(0)) - dB(level(90)) > 6, `90° much weaker (${(dB(level(0)) - dB(level(90))).toFixed(1)} dB)`);
  assert.ok(dB(level(0)) - dB(level(180)) > 15, `180° grows nothing (${(dB(level(0)) - dB(level(180))).toFixed(1)} dB)`);
});
test('the Harmonic choice: the string sings that partial alone; the coil on its node cannot drive it', () => {
  const lv = (k, h, n) => { const { x } = note(k, P({ harmonic: h, wave: 'sine', attack: 0.01 }), 4), s = M.strings(k, P()); return dB(tone(x, s.partial(n), sec(3), sec(4))); };
  for (const [h, n] of [['2', 2], ['3', 3]]) {
    const own = lv(48, h, n), fund = lv(48, h, 1);
    assert.ok(own - fund > 20, `harmonic ${h} at C3: its partial ${own.toFixed(1)} dB, the fundamental ${fund.toFixed(1)} dB`);
  }
  const fourth = lv(48, '4', 4), fifth = lv(48, '5', 5);
  assert.ok(fourth - fifth > 25, `C3's coil on the 5th partial's node: 4th ${fourth.toFixed(1)} dB, 5th ${fifth.toFixed(1)} dB`);
  const { x } = note(48, P({ harmonic: '12', wave: 'sine', attack: 0.01 }), 4), s = M.strings(48, P());
  const d = dB(tone(x, s.partial(1), sec(3), sec(4))) - dB(tone(x, s.partial(2), sec(3), sec(4)));
  assert.ok(Math.abs(d) < 10, `two loops: partials 1 and 2 within 10 dB (${d.toFixed(1)})`);
});
test('the loop finds stretched partials that an open loop at the tuned pitch misses (the 2nd at C6)', () => {
  const lv = (loop) => rms(note(84, P({ loop, harmonic: '2', wave: 'sine', attack: 0.01, unison: 0 }), 3).x, sec(2), sec(3));
  assert.ok(dB(lv('pll')) - dB(lv('open')) > 6, `locked ${dB(lv('pll')).toFixed(1)} dB, open ${dB(lv('open')).toFixed(1)} dB`);
});
test('a coil only pulls: with little bias the troughs clip and the pull doubles the frequency (the octave grows)', () => {
  const ratio = (bias) => { const { x } = note(60, P({ bias, wave: 'sine', attack: 0.01, drive: 0.25 }), 3), s = M.strings(60, P()); return dB(tone(x, s.partial(2), sec(2), sec(3))) - dB(tone(x, s.partial(1), sec(2), sec(3))); };
  const low = ratio(0.3), high = ratio(3);
  assert.ok(low - high > 6, `octave against fundamental: bias 0.3 ${low.toFixed(1)} dB, bias 3 ${high.toFixed(1)} dB`);
});
test('the interference guard holds a loop whose neighbour is louder in the pickup', () => {
  const run = (guard) => play(P({ guard, hammer: 1 }), 0.6, [[0, (e) => e.noteOn(60, 1)], [0.1, (e) => e.noteOn(61, 0.1)]]).e.voices.find((v) => v.key === 61);
  assert.ok(run(true).gain < 0.5, `guarded: gain ${run(true).gain.toFixed(2)}`);
  assert.ok(run(false).gain === 1, 'unguarded');
});
test('fifteen channels: the sixteenth note takes the oldest one\'s, which rings on undriven', () => {
  const ev = Array.from({ length: 16 }, (_, i) => [i * 0.01, (e) => e.noteOn(40 + 2 * i, 0.8)]);
  const { e } = play(P(), 0.3, ev);
  const vs = e.voices;
  assert.equal(vs.filter((v) => v.driven).length, 15);
  assert.ok(!vs.find((v) => v.key === 40).driven && vs.find((v) => v.key === 40).keyDown, 'the first key is held but undriven');
});
test('dampers: a released key falls silent within half a second; with the pedal down it rings on', () => {
  const tail = (pedal) => { const { x } = play(P({ hammer: 0.6 }), 2, [[0, (e) => { e.setSustain(pedal); e.noteOn(60, 0.8); }], [1, (e) => e.noteOff(60)]]); return dB(rms(x, sec(1.5), sec(1.6))) - dB(rms(x, sec(0.9), sec(1))); };
  assert.ok(tail(false) < -30, `damped: ${tail(false).toFixed(1)} dB`);
  assert.ok(tail(true) > -10, `pedal: ${tail(true).toFixed(1)} dB`);
  const { e, x } = play(P({ hammer: 0.6 }), 3, [[0, (e) => e.noteOn(60, 0.8)], [0.5, (e) => e.noteOff(60)]]);
  assert.equal(e.voiceCount(), 0, 'the voice ends');
  assert.ok(rms(x, sec(2.9), sec(3)) === 0, 'silence after release');
});
test('pressing a held key harder (aftertouch) pushes more current; each note\'s own brightness (MPE slide)', () => {
  const lv = (press) => rms(play(P({ attack: 0.01 }), 2, [[0, (e) => { e.noteOn(60, 0.8); if (press) e.handle({ type: 'pressure', value: 1, key: 60 }); }]]).x, sec(1.5), sec(2));
  assert.ok(dB(lv(true)) - dB(lv(false)) > 3, `pressure ${(dB(lv(true)) - dB(lv(false))).toFixed(1)} dB`);
  const top = (b) => { const { x } = play(P({ attack: 0.01 }), 2, [[0, (e) => { e.handle({ type: 'slide', value: b, key: 48 }); e.noteOn(48, 0.8); }]]), s = M.strings(48, P()); return dB(tone(x, s.partial(3), sec(1.5), sec(2))) - dB(tone(x, s.partial(1), sec(1.5), sec(2))); };
  assert.ok(top(1) - top(0) > 6, `3rd partial against the 1st: bright ${top(1).toFixed(1)} dB, dark ${top(0).toFixed(1)} dB`);
});
test('levels: every preset plays a chord with no NaN and under the limiter (peak 0.02 – 1.5)', () => {
  for (const pr of PRESETS) {
    const { x } = play(P(pr.p), 3, [[0, (e) => { for (const k of [48, 55, 60, 64, 67]) e.noteOn(k, 0.8); }]]);
    let pk = 0;
    for (const v of x) { assert.ok(Number.isFinite(v), `${pr.name}: NaN`); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.02 && pk < 1.5, `${pr.name}: peak ${pk.toFixed(3)}`);
  }
});
test('Quality: fewer partials at Medium (16) and Low (8, two strings), the pitch and level kept', () => {
  const N = (q) => note(60, P(), 0.1, 0.8, q).e.voices[0].N;
  assert.deepEqual([N('high'), N('medium'), N('low')], [3 * M.strings(60, P()).n, 48, 16]);
  for (const k of [48, 72]) {
    const f = keyFreq(k), hi = note(k, P(), 3).x;
    for (const q of ['medium', 'low']) {
      const x = note(k, P(), 3, 0.8, q).x, c = cents(peak(x, f, sec(2), sec(3)), peak(hi, f, sec(2), sec(3))), d = dB(rms(x, sec(2), sec(3))) - dB(rms(hi, sec(2), sec(3)));
      assert.ok(Math.abs(c) < 1 && Math.abs(d) < 3, `key ${k} at ${q}: ${c.toFixed(2)} ¢, ${d.toFixed(2)} dB`);
    }
  }
});
test('CPU: ten notes, struck and driven, render well faster than real time', () => {
  const t = performance.now();
  play(P({ hammer: 0.5 }), 5, [[0, (e) => { for (const k of [36, 40, 43, 48, 52, 55, 60, 64, 67, 72]) e.noteOn(k, 0.8); }]]);
  const r = (performance.now() - t) / 5000;
  assert.ok(r < 0.3, `${(100 * r).toFixed(0)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
