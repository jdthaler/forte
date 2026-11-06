// NMR Spin Echo checks. Run: node test/nmr-tests.mjs
//
// The model (the spins' quantum mechanics, in C++ built as WebAssembly) against results worked out
// by hand: Pascal's-triangle multiplets, the AB quartet's closed form, the first-order J
// modulation of a Hahn echo, the line shapes' Fourier transforms and the diffusion attenuation of
// an echo in a gradient (Hahn 1950, Carr and Purcell 1954). Then the engine against the model:
// pitch, chord, decay, echoes, echo trains, saturation, the receiver, bend, level and Quality.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS } from '../nmr/src/nmr-instrument.js';
import { wasmModel } from '../nmr/src/nmr-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { tunedFreq } from '../shared/tuning.js';

const NmrEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, noise: -100, ...o });
const TAU = 2 * Math.PI;

// Play a script through the engine in 128-sample blocks, as the AudioWorklet does: events
// [{ at (s), on: key, vel } | { at, off: key } | { at, pedal: bool } | { at, bend } | { at, press, key }],
// for sec seconds.
function play(params, events, sec, { quality, engine } = {}) {
  const e = engine ?? new NmrEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  const n = Math.round(sec * FS), L = new Float32Array(n), R = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = [...events].sort((a, b) => a.at - b.at);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j].at * FS <= s + 1e-6) {
      const x = ev[j++];
      if (x.on !== undefined) e.noteOn(x.on, x.vel ?? 1);
      if (x.off !== undefined) e.noteOff(x.off);
      if (x.pedal !== undefined) e.setSustain(x.pedal);
      if (x.bend !== undefined) e.handle?.({ type: 'bend', value: x.bend });
      if (x.press !== undefined) e.handle({ type: 'pressure', key: x.key ?? -1, value: x.press });
    }
    e.process(bL, bR, bl);
    const m = Math.min(bl, n - s);
    L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s);
  }
  return { L, R, e };
}
const note = (key, params, sec, vel = 1) => play(params, [{ at: 0, on: key, vel }], sec);
// Amplitude of frequency f in x[a, b) (Hann-windowed Goertzel), as a sine's amplitude.
function tone(x, f, a, b) {
  const w = (TAU * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
// The strongest frequency within ±20 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-20 / 1200), hi = f0 * 2 ** (20 / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
// The quadrature envelope |L + iR| at time t (s), averaged over a few ms.
const envAt = ({ L, R }, t, w = 0.003) => {
  const a = Math.max(0, Math.round((t - w / 2) * FS)), b = Math.min(L.length, Math.round((t + w / 2) * FS));
  let s = 0;
  for (let i = a; i < b; i++) s += Math.hypot(L[i], R[i]);
  return s / Math.max(1, b - a);
};
// its largest value within ±w/2 of t: an echo's top
const peakEnv = ({ L, R }, t, w = 0.004) => {
  let m = 0;
  for (let i = Math.max(0, Math.round((t - w / 2) * FS)); i < Math.min(L.length, Math.round((t + w / 2) * FS)); i++) m = Math.max(m, Math.hypot(L[i], R[i]));
  return m;
};
// π pulses fire on the engine's 128-sample blocks: these times fall on them
const onBlock = (t) => (Math.round((t * FS) / 128) * 128) / FS;
// a note's start, as it would be in a perfect field (once the receiver has opened, at 2 ms)
const startOf = (key, o) => envAt(note(key, { ...o, shim: 0.2 }, 0.01), 0.003, 0.001);
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };

// the lines near f (Hz), within ±w Hz
const near = (lines, f, w) => lines.filter((l) => Math.abs(l.f - f) < w);
const sum = (ls) => ls.reduce((s, l) => s + l.intensity, 0);

console.log('physics');
test('the key\'s magnet puts the sample\'s lowest line on the note: A4 is ethanol\'s CH₃ at 1.06 ppm in a 415 MHz (9.75 T) magnet; B₀ = 2π f₀/γ', () => {
  const k = model.keySystem(69, P());
  assert.ok(Math.abs(k.f0 - 440 / 1.06e-6) < 1e-3, `${k.f0}`);
  assert.ok(Math.abs(k.B0 - k.f0 / 42.577478518e6) < 1e-9);
  assert.ok(Math.abs(k.fAnchor - 440) < 1e-9);
  const top = model.keySystem(108, P());
  assert.ok(top.B0 > model.STRONGEST_T, 'C8 needs a magnet past any built');
  assert.ok(model.keySystem(88, P()).B0 < model.STRONGEST_T && model.keySystem(89, P()).B0 > model.STRONGEST_T, 'E6 is within reach of the strongest (30.5 T), F6 not');
});
test('each group\'s lines carry its share of the protons (ethanol 3 : 2 : 1, ethyl acetate 3 : 3 : 2, 2-propanol 6 : 1), and every line adds to the start of the signal', () => {
  for (const [sample, want] of [['ethanol', [3, 2, 1]], ['ethylAcetate', [3, 3, 2]], ['propanol', [6, 1]], ['water', [1]]]) {
    const k = model.keySystem(100, P({ sample })), s = model.sample(sample), N = want.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum(k.lines) - 1) < 1e-9, `${sample}: total ${sum(k.lines)}`);
    s.groups.forEach((g, i) => {
      const got = sum(near(k.lines, g.ppm * 1e-6 * k.f0, 60));
      assert.ok(Math.abs(got - want[i] / N) < 1e-6, `${sample} group ${i}: ${got} vs ${want[i] / N}`);
    });
  }
});
test('first order (a strong magnet): each multiplet is Pascal\'s triangle at J spacing (ethanol\'s CH₃ 1 : 2 : 1, ethyl acetate\'s CH₂ 1 : 3 : 3 : 1, 2-propanol\'s CH 1 : 6 : 15 : 20 : 15 : 6 : 1)', () => {
  for (const [sample, group, n, J, total] of [['ethanolFast', 0, 2, 7, 6], ['ethylAcetate', 2, 3, 7, 8], ['propanol', 1, 6, 6, 7]]) {
    const s = model.sample(sample), k = model.keySystem(108, P({ sample }));
    const c = s.groups[group].ppm * 1e-6 * k.f0, nH = s.groups[group].n;
    for (let m = 0; m <= n; m++) {
      const got = sum(near(k.lines, c + (m - n / 2) * J, 0.5)), want = (nH / total) * binom(n, m) / 2 ** n;
      assert.ok(Math.abs(got - want) < 2e-3 * want + 1e-5, `${sample} line ${m}: ${got.toFixed(5)} vs ${want.toFixed(5)}`);
    }
  }
});
test('second order: two coupled protons make the AB quartet, ν = ν̄ ± J/2 ± D/2 with D = √(Δν² + J²), inner lines (1 + J/D)/(1 − J/D) times the outer', () => {
  for (const [dppm, J, f0] of [[0.1, 10, 100e6], [0.05, 12, 60e6], [0.02, 7, 100e6]]) {
    const k = model.customSystem([{ n: 1, ppm: 2 }, { n: 1, ppm: 2 + dppm }], [{ a: 0, b: 1, J }], f0);
    const dv = dppm * 1e-6 * f0, D = Math.hypot(dv, J), c = (2 + dppm / 2) * 1e-6 * f0;
    const want = [[c - J / 2 - D / 2, 1 - J / D], [c + J / 2 - D / 2, 1 + J / D], [c - J / 2 + D / 2, 1 + J / D], [c + J / 2 + D / 2, 1 - J / D]];
    assert.equal(k.lines.length, 4);
    want.forEach(([f, a], i) => {
      assert.ok(Math.abs(k.lines[i].f - f) < 1e-6, `line ${i}: ${k.lines[i].f} vs ${f}`);
      assert.ok(Math.abs(k.lines[i].intensity - a / 4) < 1e-9, `line ${i}: ${k.lines[i].intensity} vs ${a / 4}`);
    });
  }
});
test('a π pulse refocuses the chemical shifts: water comes back whole at 2τ, whenever the pulse', () => {
  for (const tau of [0.0013, 0.05, 0.31]) {
    const s = model.keySignal(60, P({ sample: 'water' }), [tau], 2 * tau);
    assert.ok(Math.abs(Math.hypot(s.re, s.im) - 1) < 1e-9, `τ ${tau}: ${s.re}, ${s.im}`);
  }
});
test('but not the J couplings: the echo at 2τ is Σ_g n_g Π_h cos(2πJ_gh τ)^n_h / N (first order; ethanol in DMSO, both couplings)', () => {
  const s = model.sample('ethanol'), N = 6, groups = s.groups, couplings = s.couplings;
  for (const tau of [0.004, 0.017, 0.05, 0.123]) {
    let want = 0;
    groups.forEach((g, i) => {
      let f = g.n;
      for (const c of couplings) {
        const other = c.a === i ? c.b : c.b === i ? c.a : -1;
        if (other >= 0) f *= Math.cos(TAU * c.J * tau) ** groups[other].n;
      }
      want += f / N;
    });
    const got = model.customSignal(groups, couplings, 1e11, [tau], 2 * tau); // a magnet so strong that J ≪ Δν
    assert.ok(Math.abs(Math.abs(got.re) - Math.abs(want)) < 1e-4 && Math.abs(got.im) < 1e-6, `τ ${tau}: ${got.re.toFixed(5)} vs ${want.toFixed(5)}`);
  }
});
test('the field\'s spread: the fade is the profile\'s Fourier transform (Lorentzian e^(−πΔν t), Gaussian, a gradient\'s sinc), by brute force over the distribution', () => {
  const W = 1; // FWHM, Hz: S = 2π W t
  const dists = {
    lorentz: (x) => (W / 2 / Math.PI) / (x * x + (W / 2) ** 2),
    gauss: (x) => { const sg = W / 2.3548200450309493; return Math.exp(-(x * x) / (2 * sg * sg)) / (sg * Math.sqrt(TAU)); },
    gradient: (x) => (Math.abs(x) <= W / 2 ? 1 / W : 0),
  };
  for (const [name, pdf] of Object.entries(dists)) {
    for (const t of [0.1, 0.4, 0.9, 1.7]) {
      let s = 0, norm = 0;
      const lim = name === 'lorentz' ? 2000 : 6, n = name === 'lorentz' ? 4e6 : 2e4;
      for (let i = 0; i < n; i++) { const x = -lim + ((i + 0.5) / n) * 2 * lim, p = pdf(x); s += p * Math.cos(TAU * x * t); norm += p; }
      const want = s / norm, got = model.dephasing(name, TAU * W * t);
      assert.ok(Math.abs(got - want) < 2e-3, `${name} at ${t} s: ${got.toFixed(4)} vs ${want.toFixed(4)}`);
    }
  }
});

console.log('engine');
test('a note sounds on its key (water, within 0.2 ¢), and follows the keyboard\'s tuning: A = 415 Hz, ¼-comma meantone (E4 −3.42 ¢, C4 +10.26 ¢)', () => {
  const sharp = { sample: 'water', shim: 0.2, t2: 20, t1: 30, acquire: 'ring' };
  for (const [k, o, c] of [[69, {}, 0], [45, {}, 0], [69, { pitch: 415 }, cents(415, 440)], [64, { temperament: 'meantone' }, -3.42], [60, { temperament: 'meantone' }, 10.26]]) {
    const f = keyFreq(k) * 2 ** (c / 1200);
    assert.ok(Math.abs(cents(tunedFreq(P(o), k), f)) < 0.01, `${k}: shared/tuning.js agrees`);
    const x = note(k, P({ ...sharp, ...o }), 1.2).L, got = peak(x, f, 2400, 2400 + 49152);
    assert.ok(Math.abs(cents(got, f)) < 0.2, `${k}: ${cents(got, f).toFixed(3)} ¢`);
  }
});
test('a molecule is a chord: ethanol\'s CH₂ and OH sound at 3.44/1.06 and 4.63/1.06 of its CH₃, the note', () => {
  const x = note(57, P({ shim: 0.5, t2: 5, t1: 5 }), 1).L, f = keyFreq(57);
  for (const r of [1, 3.44 / 1.06, 4.63 / 1.06]) {
    const a = tone(x, f * r, 1200, 1200 + 32768), off = tone(x, f * r + 30, 1200, 1200 + 32768); // (30 Hz off: past the multiplets)
    assert.ok(a > 10 * off, `${r.toFixed(3)}: ${a} against ${off}`);
  }
});
test('the fade: water\'s note falls as e^(−t/T₂ − πΔν t), Δν the shim\'s share of the Larmor frequency', () => {
  const shim = 10, t2 = 2, key = 60, o = P({ sample: 'water', shim, t2, t1: 10, acquire: 'ring' });
  const r = note(key, o, 0.6), f0 = model.keySystem(key, o).f0, dv = shim * 1e-9 * f0;
  const want = Math.exp(-0.3 / t2 - Math.PI * dv * 0.3), got = envAt(r, 0.4) / envAt(r, 0.1);
  assert.ok(Math.abs(got / want - 1) < 0.02, `${got.toFixed(4)} vs ${want.toFixed(4)}`);
});
test('Hahn\'s echo: hold a key, press the pedal at τ, and the faded note swells back at 2τ to e^(−2τ/T₂) of its start', () => {
  const t2 = 1.5, o = P({ sample: 'water', shim: 400, t2, t1: 5 }), tau = onBlock(0.24);
  const r = play(o, [{ at: 0, on: 60, vel: 1 }, { at: tau, pedal: true }], 0.8);
  const start = startOf(60, o), dead = envAt(r, tau - 0.01), echo = peakEnv(r, 2 * tau);
  assert.ok(dead < 0.02 * start, `dephased before the pulse: ${dead / start}`);
  const want = Math.exp(-2 * tau / t2);
  assert.ok(Math.abs(echo / start / want - 1) < 0.03, `echo ${(echo / start).toFixed(4)} vs ${want.toFixed(4)}`);
  assert.ok(envAt(r, 2 * tau + 0.05) < 0.1 * echo, 'and it fades again');
  assert.equal(r.e.pulses, 1);
});
test('an echo train (CPMG): with the pedal held, π pulses every echo time bring an echo after each, falling by T₂ alone', () => {
  const t2 = 1, sp = onBlock(0.16), o = P({ sample: 'water', shim: 400, t2, t1: 5, train: true, spacing: sp });
  const r = play(o, [{ at: 0, on: 60, vel: 1 }, { at: sp / 2, pedal: true }], 1.2);
  const start = startOf(60, o);
  for (let n = 1; n <= 6; n++) {
    const t = n * sp, got = peakEnv(r, t) / start, want = Math.exp(-t / t2);
    assert.ok(Math.abs(got / want - 1) < 0.04, `echo ${n} at ${t.toFixed(2)} s: ${got.toFixed(4)} vs ${want.toFixed(4)}`);
  }
  assert.ok(r.e.pulses >= 5);
});
test('Press: a firm press into a held key runs its own echo train, π pulses on its sample alone every echo time, up to four times as often; a resting finger none', () => {
  const sp = onBlock(0.32), o = P({ sample: 'water', shim: 400, t2: 1, t1: 5, spacing: sp, acquire: 'ring' });
  const run = (press, sec = 1) => play(o, [{ at: 0, on: 60 }, { at: 0, on: 64 }, ...(press === undefined ? [] : [{ at: 0.05, press, key: 60 }])], sec);
  const plain = run(), resting = run(0.45), full = run(1), half = run(0.75);
  assert.equal(plain.e.pulses, 0);
  assert.equal(resting.e.pulses, 0, 'a finger at rest');
  // at once, then every sp / (1 + 3x) over the 0.95 s left: x = 1 at full, ½ at 0.75
  assert.ok(Math.abs(full.e.pulses - (1 + Math.floor(0.95 / (sp / 4)))) <= 1, `full: ${full.e.pulses}`);
  assert.ok(Math.abs(half.e.pulses - (1 + Math.floor(0.95 / (sp / 2.5)))) <= 1, `half: ${half.e.pulses}`);
  // its own sample's magnetisation turned over each time; the other key's left alone
  assert.ok(Math.abs(full.e.mz(60) - plain.e.mz(60)) > 0.01, `key 60: ${full.e.mz(60)} vs ${plain.e.mz(60)}`);
  assert.equal(full.e.mz(64), plain.e.mz(64), 'key 64');
  // and the echoes keep the dephased note sounding, as the pedal's train does
  assert.ok(envAt(full, 0.6) > 3 * envAt(plain, 0.6), `${envAt(full, 0.6)} vs ${envAt(plain, 0.6)}`);
});
test('diffusion in a gradient steals the echo: exp(−⅔ γ²G² D τ³), γG = 2πΔν/L (Hahn 1950; Carr and Purcell 1954)', () => {
  const shim = 2000, t2 = 20, key = 96, tau = onBlock(0.15), o = P({ sample: 'water', profile: 'gradient', shim, t2, t1: 30, acquire: 'ring' });
  const k = model.keySystem(key, o), D = model.sample('water').D, gG = (TAU * shim * 1e-9 * k.f0) / model.COIL_M;
  const r = play(o, [{ at: 0, on: key, vel: 1 }, { at: tau, pedal: true }], 2 * tau + 0.05);
  const got = peakEnv(r, 2 * tau, 0.002) / startOf(key, o);
  const want = Math.exp(-2 * tau / t2) * Math.exp((-2 / 3) * gG * gG * D * tau ** 3);
  assert.ok(want < 0.8, `the test should see diffusion: ${want}`);
  assert.ok(Math.abs(got / want - 1) < 0.05, `${got.toFixed(4)} vs ${want.toFixed(4)}`);
});
test('saturation: a 90° pulse leaves no magnetisation along the field, which comes back by T₁; a key struck again too soon is quieter by 1 − e^(−t/T₁)', () => {
  const t1 = 0.8, o = P({ sample: 'water', t1, t2: 0.5, acquire: 'ring' });
  const r = play(o, [{ at: 0, on: 60, vel: 1 }], 0.3);
  const want = 1 - Math.exp(-0.3 / t1);
  assert.ok(Math.abs(r.e.mz(60) - want) < 2e-3, `mz ${r.e.mz(60)} vs ${want}`);
  const again = play(o, [{ at: 0, on: 60, vel: 1 }, { at: 0.3, on: 60, vel: 1 }], 0.35);
  const fresh = envAt(again, 0.02), second = envAt(again, 0.32); // (after the first note's fade)
  assert.ok(Math.abs(second / fresh - want) < 0.03, `${(second / fresh).toFixed(3)} vs ${want.toFixed(3)}`);
});
test('a π pulse turns the sounding samples\' magnetisation upside down; a softer pulse (smaller angle) leaves cos θ along the field and sounds as sin θ', () => {
  const o = P({ sample: 'water', t1: 100, t2: 1, acquire: 'ring' });
  const r = play(o, [{ at: 0, on: 60, vel: 0.5 }, { at: 0.1, pedal: true }], 0.15);
  const c = Math.cos(Math.PI / 4);
  assert.ok(Math.abs(r.e.mz(60) + c) < 2e-3, `inverted: ${r.e.mz(60)} vs ${-c}`);
  const a = envAt(note(60, o, 0.02, 0.5), 0.01), b = envAt(note(60, o, 0.02, 1), 0.01);
  assert.ok(Math.abs(a / b - Math.sin(Math.PI / 4)) < 0.01, `${a / b}`);
});
test('quadrature: the right channel is the imaginary one, a quarter of a period behind the left', () => {
  const { L, R } = note(69, P({ sample: 'water', shim: 0.2, t2: 10, t1: 10 }), 0.3);
  let lr = 0, ll = 0, rr = 0, dl = 0;
  const w = (TAU * 440) / FS;
  for (let i = 4800; i < 14400; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; dl += R[i] * L[i - 1]; }
  assert.ok(Math.abs(lr) < 0.01 * ll, 'the channels are in quadrature');
  assert.ok(Math.abs(rr / ll - 1) < 0.01, 'and as loud');
  assert.ok(Math.sign(dl) === Math.sign(Math.sin(w)), 'the right channel lags');
  const mono = note(69, P({ sample: 'water', channels: 'real' }), 0.1);
  assert.ok(mono.L.every((v, i) => v === mono.R[i]), 'the real channel alone is mono');
});
test('the receiver: closes when the key comes up (held), or keeps listening until the signal has gone (ring)', () => {
  const o = P({ sample: 'water', shim: 1, t2: 5, t1: 5 });
  const held = play(o, [{ at: 0, on: 60 }, { at: 0.2, off: 60 }], 0.4);
  assert.ok(envAt(held, 0.3) < 1e-5, `${envAt(held, 0.3)}`);
  const ring = play({ ...o, acquire: 'ring' }, [{ at: 0, on: 60 }, { at: 0.2, off: 60 }], 0.4);
  assert.ok(envAt(ring, 0.3) > 0.3 * envAt(ring, 0.19));
  assert.equal(held.e.voiceCount(), 0);
});
test('the pitch wheel, and a note\'s own bend (MPE), move the field: every line by the same number of hertz (ethanol\'s CH₂ moves as far as its CH₃, not by the same ratio)', () => {
  const o = P({ shim: 0.3, t2: 5, t1: 5 }), key = 57, f = keyFreq(key), up = f * (2 ** (2 / 12) - 1);
  const r = play(o, [{ at: 0, bend: 1 }, { at: 0.05, on: key }], 1.2);
  const a = 0.15 * FS, b = a + 32768;
  const fCH3 = peak(r.L, f + up, a, b), fCH2 = peak(r.L, f * 3.44 / 1.06 + up, a, b);
  assert.ok(Math.abs(fCH3 - (f + up)) < 0.3, `CH₃ ${fCH3} vs ${f + up}`);
  assert.ok(Math.abs(fCH2 - (f * 3.44 / 1.06 + up)) < 0.5, `CH₂ ${fCH2} vs ${f * 3.44 / 1.06 + up}`);
  // a note's own bend (MPE) is its own magnet's offset, the same way: −2 semitones of its CH₃
  const e = new NmrEngine(FS), down = f * (2 ** (-2 / 12) - 1);
  e.handle({ type: 'noteBend', key, value: 2 ** (-2 / 12) });
  const m = play(o, [{ at: 0, on: key }], 1.2, { engine: e });
  const gCH3 = peak(m.L, f + down, a, b), gCH2 = peak(m.L, f * 3.44 / 1.06 + down, a, b);
  assert.ok(Math.abs(gCH3 - (f + down)) < 0.3 && Math.abs(gCH2 - (f * 3.44 / 1.06 + down)) < 0.5, `bent note: CH₃ ${gCH3}, CH₂ ${gCH2}`);
});
test('output level is sane (peak 0.05 – 1 at full velocity), finite, and silent after release', () => {
  let pk = 0;
  for (const sample of model.samples) for (const k of [21, 36, 60, 84, 96, 108]) {
    const r = play(P({ sample }), [{ at: 0, on: k }, { at: 0.2, off: k }], 0.3);
    for (let i = 0; i < r.L.length; i++) { assert.ok(Number.isFinite(r.L[i]) && Number.isFinite(r.R[i])); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
    assert.ok(envAt(r, 0.29) < 1e-6, `${sample} ${k} after release`);
  }
  assert.ok(pk > 0.05 && pk < 1, `peak ${pk}`);
});

// What the Quality setting trims (the README says it): fewer samples at once, and fewer lines a
// sample, counted rather than timed; a note keeps its pitch and level.
test('Quality: 24 samples sound at once at High, 12 at Medium and 6 at Low; ethanol keeps every line at High, at Medium and Low lines closer than 0.05 and 0.5 Hz merge and the 32 and 16 strongest stay; pitch and level kept', () => {
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (const [quality, cap, lines] of [['high', 24, model.keySystem(69, P()).lines.length], ['medium', 12, 32], ['low', 6, 16]]) {
    const e = new NmrEngine(FS);
    e.setQuality(quality); e.setParams(P({ t2: 10, t1: 10, shim: 0.3 }));
    for (let i = 0; i < 30; i++) { e.noteOn(40 + i, 0.8); for (let b = 0; b < 4; b++) e.process(bL, bR, 128); }
    for (let b = 0; b < 20; b++) e.process(bL, bR, 128);
    assert.equal(e.voiceCount(), cap, `${quality}: samples sounding`);
    const got = e.lines(69);
    assert.ok(quality === 'high' ? got === lines : got <= lines && got >= 9, `${quality}: ${got} lines`);
  }
  const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
  for (const k of [48, 69, 84]) {
    const f = keyFreq(k), hi = note(k, P(), 0.3).L;
    for (const quality of ['medium', 'low']) {
      const x = play(P(), [{ at: 0, on: k }], 0.3, { quality }).L, c = cents(peak(x, f, 0, x.length), peak(hi, f, 0, hi.length)), d = 20 * Math.log10(rms(x) / rms(hi));
      assert.ok(Math.abs(c) < 0.1 && Math.abs(d) < 1.5, `key ${k} at ${quality}: ${c.toFixed(3)} ¢, ${d.toFixed(2)} dB`);
    }
  }
});
test('CPU: 10 ethanol samples, a chord held with an echo train, render at least 4× faster than real time', () => {
  const o = P({ train: true, spacing: 0.1, shim: 1, t2: 5, t1: 5 }), ev = [];
  for (let i = 0; i < 10; i++) ev.push({ at: 0.01 * i, on: 48 + 3 * i });
  ev.push({ at: 0.2, pedal: true });
  const t = performance.now();
  play(o, ev, 3);
  const ms = performance.now() - t;
  assert.ok(ms < 3000 / 4, `${ms.toFixed(0)} ms for 3 s`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
