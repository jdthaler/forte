// Trautonium checks: the lamp, the dividers and the circuits against their circuit theory, then
// the engine against the model. Run: node test/trautonium-tests.mjs
//
// Both are the C++ (native/instruments/trautonium), built as WebAssembly: the model's functions
// through trautonium-wasm.js. The independent checks integrate the circuit's equations here.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../trautonium/src/trautonium-instrument.js';
import { wasmModel } from '../trautonium/src/trautonium-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';

const TrautoniumEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();
const { V_STRIKE: VS, V_EXT: VE, CAP } = M;

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name) => P(PRESETS.find((p) => p.name.startsWith(name)).p);
const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);

function engine(params, quality, fs = FS) {
  const e = new TrautoniumEngine(fs);
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

// The capacitor's charge, dV/dt = (S − V)/τ, integrated by RK4 from V0 until it reaches v (time in τ).
function chargeTime(S, V0, v, h = 1e-5) {
  let V = V0, t = 0;
  const f = (x) => S - x;
  while (V < v) {
    const k1 = f(V), k2 = f(V + (h * k1) / 2), k3 = f(V + (h * k2) / 2), k4 = f(V + h * k3);
    const Vn = V + (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
    if (Vn >= v) return t + (h * (v - V)) / (Vn - V);
    V = Vn; t += h;
  }
  return t;
}

console.log('physics');
test('the lamp: a period is R C ln[(S − V_e)/(S − V_s)], as the capacitor\'s charging integrates (100–400 V)', () => {
  for (const S of [95, 120, 150, 250, 400]) {
    const g = chargeTime(S, VE, VS);
    assert.ok(Math.abs(M.periods(S) / g - 1) < 1e-6, `${S} V: ${M.periods(S)} against ${g}`);
  }
});
test('the wire: the resistance for each note is 1/(f C g), so an octave up halves it, as a string\'s length', () => {
  for (const S of [100, 150, 300]) for (const f of [27.5, 261.63, 4186]) {
    const R = M.wireR(f, S), T = R * CAP * chargeTime(S, VE, VS);
    assert.ok(Math.abs(T * f - 1) < 1e-6, `${S} V, ${f} Hz: ${R} Ω plays ${1 / T} Hz`);
    assert.ok(Math.abs(M.wireR(2 * f, S) / R - 0.5) < 1e-12);
  }
});
test('the capture window: a lamp δ of its period short of striking is the sync pulse below the strike voltage', () => {
  for (const S of [100, 150, 300]) for (const sync of [0.004, 0.03, 0.1, 0.25]) {
    const d = M.window(sync, S), K = sync * (VS - VE);
    // the voltage at (1 − δ) of the period, charged from V_e
    const g = M.periods(S), V = S + (VE - S) * Math.exp(-(1 - d) * g);
    assert.ok(Math.abs(V + K - VS) < 1e-9, `${S} V, sync ${sync}: ${V + K} V`);
  }
});
// A divider started in step with the master, its voltage followed from pulse to pulse: the first
// master pulse whose kick takes it over V_s, if one comes before it strikes on its own.
function divide(n, slack, sync, S) {
  const g = M.periods(S), K = sync * (VS - VE), tc = n * (1 + slack); // its time constant, in the master's τ
  for (let k = 1; k < 100; k++) {
    const t = k * g;                                    // the k-th flash, in master τ
    if (t > tc * g + 1e-12) return 0;                   // it struck on its own first
    const V = S + (VE - S) * Math.exp(-t / tc);
    if (V + K >= VS - 1e-12) return k;
  }
  return 0;
}
test('the dividers: the pulse each ÷n fires on, for every n to 24, slack 0–10 % and sync 0.4–25 %, as its voltage gives', () => {
  let early = 0, slips = 0;
  for (const S of [100, 150, 300]) for (const slack of [0, 0.02, 0.05, 0.1]) for (const sync of [0.004, 0.01, 0.03, 0.1, 0.25]) {
    const delta = M.window(sync, S);
    for (let n = 1; n <= 24; n++) {
      const m = M.lockCount(n, slack, delta), want = divide(n, slack, sync, S);
      assert.equal(m, want, `÷${n}, slack ${slack}, sync ${sync}, ${S} V`);
      if (m && m < n) early++;
      if (!m) slips++;
    }
  }
  assert.ok(early > 0 && slips > 0, 'some fire early, some slip');
});
test('the dividers at the defaults: every ÷1 to ÷24 divides true (sync 3 %, slack 2 %, 150 V)', () => {
  const d = M.window(DEFAULTS.sync, DEFAULTS.supply);
  for (let n = 1; n <= 24; n++) assert.equal(M.lockCount(n, DEFAULTS.slack, d), n, `÷${n}`);
});
test('the presets\' sync: weak slips every divider; strong fires ÷10 on the 9th flash and ÷16 on the 15th, and ÷2, ÷5 true', () => {
  const weak = preset('Weak sync'), strong = preset('Strong sync');
  const dw = M.window(weak.sync, weak.supply), ds = M.window(strong.sync, strong.supply);
  for (const n of [2, 3, 4, 5]) assert.equal(M.lockCount(n, weak.slack, dw), 0, `weak ÷${n}`);
  assert.deepEqual([2, 5, 10, 16].map((n) => M.lockCount(n, strong.slack, ds)), [2, 5, 9, 15]);
});
test('a resonant circuit: peak Q/Q_ref at its tuning, half-power bandwidth f/Q', () => {
  for (const [f, Q] of [[500, 8], [1400, 3], [3000, 30]]) {
    const p = P({ dry: 0, f1: f, q1: Q, g1: 1, g2: 0, g3: 0, g4: 0 });
    const [pk] = M.response([f], p);
    assert.ok(Math.abs(pk - Q / 8) < 1e-9, `peak ${pk}`);
    // the −3 dB edges, by bisection on either side
    const edge = (lo, hi, rising) => { for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi), r = M.response([m], p)[0] / pk; if ((r > Math.SQRT1_2) === rising) hi = m; else lo = m; } return Math.sqrt(lo * hi); };
    const bw = edge(f, 20 * f, false) - edge(f / 20, f, true);
    assert.ok(Math.abs(bw / (f / Q) - 1) < 1e-6, `${f} Hz, Q ${Q}: bandwidth ${bw}`);
  }
});

console.log('engine');
test('every key A0–C8 plays its note in the keyboard\'s tuning, to 0.01 ¢ (the lamp\'s firings)', () => {
  for (const o of [{}, { pitch: 415 }, { temperament: 'meantone' }, { supply: 100 }, { supply: 400 }]) {
    const e = engine(P(o));
    for (let k = 21; k <= 108; k++) e.noteOn(k, 0.7);
    run(e, 0.3);
    for (const v of e.voices) {
      const f = FS / v.lamps[0].interval, want = tunedFreq(P(o), v.key);
      assert.ok(Math.abs(cents(f, want)) < 0.01, `${JSON.stringify(o)} key ${v.key}: ${cents(f, want).toFixed(4)} ¢`);
    }
  }
});
test('and the sound is on pitch (within 0.5 ¢, A2, C4, A5)', () => {
  for (const k of [45, 60, 81]) {
    const x = render(k, P({ dry: 1, g1: 0, g2: 0 }), 0.8, 0.8), f = keyFreq(k);
    assert.ok(Math.abs(cents(peak(x, f, 4800, 4800 + 32768), f)) < 0.5, `key ${k}`);
  }
});
test('the engine\'s dividers fire where the model says: the defaults, weak and strong sync, low to high keys', () => {
  for (const [name, p] of [['defaults', P({ sub1: 0.5, sub2: 0.5, sub3: 0.5, sub4: 0.5 })], ['weak', preset('Weak sync')], ['strong', preset('Strong sync')], ['÷24', P({ div1: 24, sub1: 1 })]]) {
    const delta = M.window(p.sync, p.supply);
    for (const k of [33, 60, 96]) {
      const e = engine(p);
      e.noteOn(k, 0.8);
      run(e, k < 40 ? 3 : 0.5);
      const v = e.voices[0];
      for (let i = 0; i < 4; i++) {
        const n = p[`div${i + 1}`], want = M.lockCount(n, p.slack, delta), l = v.lamps[1 + i];
        assert.equal(l.count, want, `${name} key ${k} ÷${n}`);
        const f = FS / l.interval, fw = want ? v.f / want : v.f / (n * (1 + p.slack)); // a slipping one runs at its own pace
        assert.ok(Math.abs(cents(f, fw)) < 0.05, `${name} key ${k} ÷${n}: ${f} Hz, not ${fw}`);
      }
    }
  }
});
test('the Mixtur preset sounds the undertones f/2 … f/5; the defaults (dividers off) don\'t', () => {
  const f = keyFreq(60), mix = render(60, preset('Mixtur'), 0.8, 1), plain = render(60, P(), 0.8, 1), a = 9600, b = a + 32768;
  for (const n of [2, 3, 4, 5]) {
    const on = tone(mix, f / n, a, b), off = tone(plain, f / n, a, b), ref = tone(mix, f, a, b);
    assert.ok(on > 0.05 * ref && off < 1e-3 * ref, `f/${n}: ${on / ref} against ${off / ref}`);
  }
});
test('the circuits stay put: a sharp circuit at 1.2 kHz picks the harmonic nearest it on every note', () => {
  const p = P({ dry: 0, f1: 1200, q1: 30, g1: 1, g2: 0 });
  for (const k of [45, 50, 55, 60, 65]) {
    const f = keyFreq(k), x = render(k, p, 0.8, 1), a = 9600, b = a + 32768;
    const amps = Array.from({ length: Math.floor(5000 / f) }, (_, i) => tone(x, (i + 1) * f, a, b));
    const best = amps.indexOf(Math.max(...amps)) + 1, want = Math.round(1200 / f);
    assert.ok(Math.abs(best * f - 1200) <= Math.abs(want * f - 1200) + 1e-9, `key ${k}: harmonic ${best} (${(best * f).toFixed(0)} Hz) loudest, not ${want}`);
  }
});
test('One wire: a held key slides to the next in the glide time, 1/f (the wire\'s resistance) moving evenly; letting go slides back', () => {
  const glide = 0.2, e = engine(P({ mode: 'wire', glide }));
  e.noteOn(60, 0.8); run(e, 0.1);
  e.noteOn(72, 0.8);
  const us = [], ts = [], step = 8; // blocks of 128 samples
  for (let i = 0; i < 40; i++) { for (let b = 0; b < step; b++) e.process(bL, bR, bl); us.push(1 / e.voices[0].f); ts.push(((i + 1) * step * bl) / FS); }
  assert.equal(e.voices.length, 1, 'one voice');
  const u0 = 1 / keyFreq(60), u1 = 1 / keyFreq(72);
  for (let i = 0; i < 40 && ts[i] < glide - 0.005; i++) {
    const want = u0 + ((u1 - u0) * ts[i]) / glide;
    assert.ok(Math.abs(us[i] - want) < 0.01 * (u0 - u1), `at ${ts[i].toFixed(3)} s: 1/f ${us[i]} not ${want}`);
  }
  assert.ok(Math.abs(cents(1 / us[39], keyFreq(72))) < 0.01, 'lands on C5');
  e.noteOff(72); run(e, glide * 1.2);
  assert.ok(Math.abs(cents(e.voices[0].f, keyFreq(60))) < 0.01 && e.voices[0].held, 'back on C4, still held');
  e.noteOff(60); run(e, 1);
  assert.equal(e.voices.length, 0, 'lifted');
});
test('pitch bend and MPE: the wheel bends ±2 semitones, a note\'s own bend an octave, CC74 tunes its first circuit', () => {
  const e = engine(P());
  e.noteOn(60, 0.8); e.noteOn(67, 0.8); run(e, 0.1);
  e.handle({ type: 'bend', value: 1 }); run(e, 0.3);
  for (const v of e.voices) assert.ok(Math.abs(cents(v.f, keyFreq(v.key)) - 200) < 0.1, `wheel: key ${v.key}`);
  e.handle({ type: 'bend', value: 0 });
  e.handle({ type: 'noteBend', key: 60, value: 2 }); e.handle({ type: 'slide', key: 60, value: 2000 }); run(e, 0.3);
  const [c4, g4] = [60, 67].map((k) => e.voices.find((v) => v.key === k));
  assert.ok(Math.abs(cents(c4.f, keyFreq(60)) - 1200) < 0.5, `C4 bent: ${cents(c4.f, keyFreq(60))}`);
  assert.ok(Math.abs(cents(g4.f, keyFreq(67))) < 0.1, 'G4 left alone');
  assert.ok(Math.abs(c4.f1 - 2000) < 1 && Math.abs(g4.f1 - DEFAULTS.f1) < 1e-9, `circuits ${c4.f1}, ${g4.f1}`);
});
test('pressure: velocity sets the press, aftertouch presses fully down (louder by 1/velocity)', () => {
  const e = engine(P());
  e.noteOn(60, 0.3);
  const a = run(e, 0.4);
  e.handle({ type: 'pressure', value: 1, key: 60 });
  const b = run(e, 0.4);
  const r = rms(b, FS * 0.2) / rms(a, FS * 0.2);
  assert.ok(Math.abs(r - 1 / 0.3) < 0.05 * r, `louder by ${r.toFixed(2)}`);
});
test('attack: a hard key presses in less time than a soft one ((1.5 − v) × the press time)', () => {
  const press = 0.04, rise = (vel) => {
    const e = engine(P({ press }));
    e.noteOn(60, vel);
    for (let i = 1; i < 2000; i++) { e.process(bL, bR, 16); if (e.voices[0].p >= 0.9 * vel) return (i * 16) / FS; }
    return Infinity;
  };
  for (const v of [0.2, 0.6, 1]) {
    const t = rise(v), want = press * (1.5 - v) * Math.log(10);
    assert.ok(Math.abs(t / want - 1) < 0.05, `velocity ${v}: ${t.toFixed(4)} s, not ${want.toFixed(4)}`);
  }
});
test('release: a lifted key goes silent within 10 lift times; pressed again it is the same voice', () => {
  const e = engine(P());
  e.noteOn(60, 0.8); run(e, 0.2);
  e.noteOn(60, 0.6); run(e, 0.05);
  assert.equal(e.voices.length, 1, 'struck again: one voice');
  e.noteOff(60);
  run(e, 10 * DEFAULTS.lift);
  assert.equal(e.voices.length, 0, 'gone');
  const x = run(e, 0.1);
  assert.ok(x.every((v) => v === 0), 'silent');
});
test('every key speaks within a period of its note and the press (the lamps start in step)', () => {
  for (const k of [21, 40, 60, 84, 108]) {
    const e = engine(P());
    e.noteOn(k, 0.8);
    const n = Math.ceil((FS / keyFreq(k) + 3 * DEFAULTS.press * 0.7 * FS) / 16) + 2;
    for (let i = 0; i < n; i++) e.process(bL, bR, 16);
    const v = e.voices[0];
    assert.ok(v.lamps[0].nf >= 1 && v.p > 0.9 * 0.8, `key ${k}: ${v.lamps[0].nf} flashes, pressure ${v.p}`);
  }
});
test('the volume pedal (CC11) scales the output', () => {
  const full = render(60, P(), 0.8, 0.5), half = render(60, P({ swell: 0.5 }), 0.8, 0.5);
  assert.ok(Math.abs(rms(half, FS * 0.2) / rms(full, FS * 0.2) - 0.5) < 0.01);
});
test('output level is sane: a C4 at full velocity peaks 0.1–0.5; no preset passes 1.2', () => {
  let pk = 0;
  for (const v of render(60, P(), 1, 0.5)) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk > 0.1 && pk < 0.5, `peak ${pk}`);
  for (const pr of PRESETS) for (const k of [24, 60, 100]) {
    let q = 0;
    for (const v of render(k, P(pr.p), 1, 0.8)) q = Math.max(q, Math.abs(v));
    assert.ok(q < 1.2 && (q > 0.005 || k < 60), `${pr.name}, key ${k}: peak ${q}`); // (÷24 under a low key flashes once a second)
  }
});
test('extremes at 44.1 and 48 kHz: no NaN or blow-up with the knobs at their ends, bent four octaves, chords on every preset', () => {
  const ends = [
    { supply: 95, sync: 0.25, slack: 0, q1: 40, q2: 40, f1: 6000, f2: 80, press: 0.001, lift: 0.002 },
    { supply: 400, sync: 0, slack: 0.15, q1: 1, f1: 80, dry: 1, master: 0, sub1: 1, sub2: 1, sub3: 1, sub4: 1, div1: 1, div2: 24, div3: 23, div4: 13 },
    { mode: 'wire', glide: 0.005, sub1: 1, sub2: 1, g3: 1, g4: 1, q3: 40, q4: 40, f3: 6000, f4: 6000 },
  ];
  for (const fs of [44100, 48000]) for (const o of [...ends, ...PRESETS.map((p) => p.p)]) {
    const e = engine(P(o), undefined, fs);
    for (const k of [21, 60, 107, 108]) e.noteOn(k, 1);
    e.handle({ type: 'pressure', value: 1 });
    e.handle({ type: 'noteBend', key: 108, value: 16 }); e.handle({ type: 'noteBend', key: 21, value: 1 / 16 });
    e.handle({ type: 'bend', value: 1 });
    const x = run(e, 0.5, fs);
    let pk = 0;
    for (const v of x) { assert.ok(Number.isFinite(v), `${JSON.stringify(o)} at ${fs}`); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk < 10, `${JSON.stringify(o)} at ${fs}: peak ${pk}`); // four notes at full pressure, Q 40 on a harmonic: loud, bounded
  }
});
test('Quality: at most 32 manuals sound at High, 12 at Medium, 6 at Low; the stolen let go, a note keeps its pitch and level', () => {
  for (const [quality, cap] of [['high', 32], ['medium', 12], ['low', 6]]) {
    const e = engine(P(), quality);
    for (let i = 0; i < 40; i++) { e.noteOn(40 + i, 0.7); run(e, 0.02); }
    run(e, 0.2);
    assert.equal(e.voices.length, cap, quality);
  }
  for (const k of [48, 69]) {
    const hi = render(k, P(), 0.7, 0.5);
    for (const quality of ['medium', 'low']) {
      const x = render(k, P(), 0.7, 0.5, quality);
      assert.ok(x.every((v, i) => v === hi[i]), `key ${k} at ${quality}: one note sounds the same`);
    }
  }
});
test('CPU: ten manuals with their dividers and four circuits render well faster than real time', () => {
  const e = engine(preset('Mixtur'));
  for (const k of [36, 43, 48, 55, 60, 64, 67, 72, 76, 79]) e.noteOn(k, 0.8);
  run(e, 0.2);
  const t0 = performance.now(); run(e, 2); const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 0.6, `${(dt / 2 * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
