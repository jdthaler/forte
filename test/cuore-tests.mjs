// CUORE checks. Run: node test/cuore-tests.mjs
//
// The physics against what is known independently (Debye's law against the collaboration's heat
// capacity, the thermistor's resistance at 10 mK, the rest's power balance, energy conservation
// through a pulse, the tail's decay against the linearised network's slowest mode, the measured
// pulse shape), then the engine against the model. Both are the C++ (native/instruments/cuore),
// built as WebAssembly: the model's functions through cuore-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../cuore/src/cuore-instrument.js';
import { wasmModel } from '../cuore/src/cuore-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';
import { keyPan } from '../shared/dsp.js';

const CuoreEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  const t0 = performance.now(); try { fn(); console.log("  ok  ", name, process.env.TIMES ? `${(performance.now() - t0).toFixed(0)} ms` : ""); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const MEV = 1.602176634e-13, KB = 1.380649e-23, NA = 6.02214076e23;
const C = model.constants;

// Render keys through the engine, 128-sample blocks like the AudioWorklet, at a Quality.
function render(keys, params, vel, sec, { quality, off = Infinity, events = [] } = {}) {
  const e = new CuoreEngine(FS);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  for (const k of [keys].flat()) e.noteOn(k, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) {
    if (s <= off * FS && s + bl > off * FS) for (const k of [keys].flat()) e.noteOff(k);
    for (const [t, fn] of events) if (s <= t * FS && s + bl > t * FS) fn(e);
    e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return Object.assign(L, { engine: e });
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
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

// One pulse of E MeV from rest, the thermistor's voltage below its rest (V) every dt s, and its
// peak and CUORE's two times: 10 → 90 % on the rise, 90 → 30 % on the fall.
function pulse(params, E, dt = 0.002, n = 2000) {
  const rest = model.rest(params), tr = model.train(params, E, 0, dt / 2, n, { sub: 1, stride: 2 });
  const x = Array.from(tr.V, (v) => rest.V - v);
  let pk = 0, at = 0;
  x.forEach((v, i) => { if (v > pk) { pk = v; at = i; } });
  let r10 = -1, r90 = -1, d90 = -1, d30 = -1;
  for (let i = 0; i <= at; i++) { if (r10 < 0 && x[i] >= 0.1 * pk) r10 = i; if (r90 < 0 && x[i] >= 0.9 * pk) r90 = i; }
  for (let i = at; i < x.length; i++) { if (d90 < 0 && x[i] < 0.9 * pk) d90 = i; if (d30 < 0 && x[i] < 0.3 * pk) d30 = i; }
  return { x, tr, rest, peak: pk, rise: (r90 - r10) * dt, fall: (d30 - d90) * dt };
}

console.log('physics');
test('Debye\'s T³ law for a 5 cm cube of TeO₂ (752 g, Θ = 232 K) gives CUORE\'s 2.2 nJ/K at 10 mK', () => {
  const mass = C.RHO * 125, atoms = (3 * mass * NA) / C.MOLAR;
  const debye = (T) => ((12 * Math.PI ** 4) / 5) * atoms * KB * (T / C.THETA_D) ** 3;
  assert.ok(Math.abs(model.mass(5) - 752.5) < 0.1, `${model.mass(5)} g`);
  assert.ok(Math.abs(model.capacity(5, 0.01) / 2.2e-9 - 1) < 0.05, `${model.capacity(5, 0.01)} J/K`); // the 2022 model's Table 1
  for (const [side, T] of [[3, 0.008], [5, 0.012], [8, 0.02]]) {
    assert.ok(Math.abs(model.capacity(side, T) / (debye(T) * (side / 5) ** 3) - 1) < 1e-9, `${side} cm at ${T} K`);
  }
});
test('the thermistor: R₀ exp(√(T₀/T)) is about 100 MΩ at 10 mK (Carrettoni & Vignati), and falls 9 % for 1 % warmer there', () => {
  const R = model.resistance(3.4, 0.01);
  assert.ok(R > 90e6 && R < 130e6, `${(R / 1e6).toFixed(1)} MΩ`);
  const eta = Math.log(model.resistance(3.4, 0.0101) / R) / Math.log(1.01);
  assert.ok(Math.abs(eta + 0.5 * Math.sqrt(3.4 / 0.01)) < 0.1, `d ln R / d ln T = ${eta.toFixed(2)}`);
});
test('at rest the Joule heat flows through every link to the sink, and the bias divides across R_L and R', () => {
  for (const o of [{}, { tbase: 8 }, { tbase: 14 }, { bias: 25 }, { clamp: 2 }, { t0: 5 }]) {
    const p = P(o), r = model.rest(p), G = p.clamp * 1e-9, Ts = p.tbase * 1e-3;
    const joule = r.V ** 2 / r.R, ep = C.G_EP * (r.Te ** 5 - r.Tc ** 5);
    for (const [name, flow] of [['electrons → crystal', ep], ['crystal → Teflon', G * (r.Tc - r.Tt)], ['Teflon → copper', G * (r.Tt - Ts)]]) {
      assert.ok(Math.abs(flow / joule - 1) < 1e-6, `${JSON.stringify(o)}: ${name} ${flow} W against ${joule} W`);
    }
    assert.ok(Math.abs(r.V / ((p.bias * r.R) / (r.R + C.RL)) - 1) < 1e-9, `${JSON.stringify(o)}: the divider`);
  }
});
test('energy is conserved through a pulse: the extra heat into the copper is the pulse plus the change in Joule heating', () => {
  for (const [o, E] of [[{}, 2.528], [{}, 40], [{ tbase: 8 }, 5], [{ bias: 20, side: 3 }, 1]]) {
    const p = P(o), r = model.rest(p), G = p.clamp * 1e-9, Ts = p.tbase * 1e-3, dt = 0.03, n = 2000; // a minute
    const tr = model.train(p, E, 0, dt, n, { sub: 30 }), J0 = r.V ** 2 / r.R;
    let sink = 0, joule = 0;
    for (let i = 0; i < n; i++) {
      sink += (G * (tr.Tt[i] - Ts) - G * (r.Tt - Ts)) * dt;
      joule += (tr.V[i] ** 2 / model.resistance(p.t0, tr.Te[i]) - J0) * dt;
    }
    const want = E * MEV + joule;
    assert.ok(Math.abs(sink / want - 1) < 0.01, `${JSON.stringify(o)}, ${E} MeV: ${sink} J out against ${want} J (Joule ${(joule / (E * MEV) * 100).toFixed(1)} %)`);
  }
});
test('the pulse\'s tail decays at the network\'s slowest rate, linearised about the rest (within 1 %)', () => {
  for (const o of [{}, { tbase: 12 }, { wire: 3000 }]) {
    const p = P(o), r = model.rest(p), G = p.clamp * 1e-9, Cp = p.wire * 1e-12;
    // the Jacobian, from the network's equations (README), at the rest
    const s = Math.sqrt(p.t0 / r.Te), dlnR = -s / (2 * r.Te), Ce = C.GAMMA_E * r.Te, Cc = model.capacity(p.side, r.Tc), Ct = C.C_PTFE * r.Tt;
    const Ge = 5 * C.G_EP * r.Te ** 4, Gc = 5 * C.G_EP * r.Tc ** 4, J = r.V ** 2 / r.R;
    const A = [
      [(-1 / C.RL - 1 / r.R) / Cp, (r.V / r.R) * dlnR / Cp, 0, 0],
      [(2 * r.V / r.R) / Ce, (-J * dlnR - Ge) / Ce, Gc / Ce, 0],
      [0, Ge / Cc, (-Gc - G) / Cc, G / Cc],
      [0, 0, G / Ct, (-2 * G) / Ct],
    ];
    // its eigenvalues: the characteristic polynomial (Faddeev–LeVerrier), then its roots (Durand–Kerner)
    const mul = (X, Y) => X.map((row, i) => row.map((_, j) => row.reduce((t, _v, k) => t + X[i][k] * Y[k][j], 0)));
    const I = A.map((row, i) => row.map((_, j) => +(i === j)));
    let M = I.map((r_) => r_.slice()), c = [1];
    for (let k = 1; k <= 4; k++) {
      const AM = mul(A, M), ck = -AM.reduce((t, row, i) => t + row[i], 0) / k;
      c.push(ck); M = AM.map((row, i) => row.map((v, j) => v + ck * I[i][j]));
    }
    // roots of the monic polynomial in λ/scale
    const scale = Math.abs(A[0][0]);
    const cs = c.map((ci, k) => ci / scale ** k);
    const evalP = (z) => cs.reduce((acc, ci) => ({ re: acc.re * z.re - acc.im * z.im + ci, im: acc.re * z.im + acc.im * z.re }), { re: 0, im: 0 });
    let roots = [0, 1, 2, 3].map((k) => ({ re: 0.4 * Math.cos(k + 0.3), im: 0.9 * Math.sin(k + 0.3) }));
    for (let it = 0; it < 2000; it++) {
      roots = roots.map((z, i) => {
        let d = { re: 1, im: 0 };
        roots.forEach((w, j) => { if (j !== i) { const a = z.re - w.re, b = z.im - w.im; d = { re: d.re * a - d.im * b, im: d.re * b + d.im * a }; } });
        const pz = evalP(z), den = d.re ** 2 + d.im ** 2;
        return { re: z.re - (pz.re * d.re + pz.im * d.im) / den, im: z.im - (pz.im * d.re - pz.re * d.im) / den };
      });
    }
    const slowest = Math.max(...roots.map((z) => z.re * scale)); // the least negative
    // the tail, 20 to 40 s after a small pulse
    const tr = model.train(p, 0.01, 0, 0.02, 2000, { sub: 8 }), x = Array.from(tr.V, (v) => r.V - v);
    const got = Math.log(x[1999] / x[999]) / (1000 * 0.02);
    assert.ok(Math.abs(got / slowest - 1) < 0.01, `${JSON.stringify(o)}: ${got.toFixed(4)}/s against ${slowest.toFixed(4)}/s`);
  }
});
test('the pulse is CUORE\'s: rise and fall within 50 % of the measured 55 ms and 220 ms, about 100–200 µV per MeV', () => {
  const p = pulse(P(), 2.615); // the ²⁰⁸Tl line Carrettoni & Vignati fit
  assert.ok(p.rise > 0.055 / 1.5 && p.rise < 0.055 * 1.5, `rise ${(p.rise * 1e3).toFixed(0)} ms`);
  assert.ok(p.fall > 0.22 / 1.5 && p.fall < 0.22 * 1.5, `fall ${(p.fall * 1e3).toFixed(0)} ms`);
  const perMeV = p.peak / 2.615;
  assert.ok(perMeV > 100e-6 && perMeV < 200e-6, `${(perMeV * 1e6).toFixed(0)} µV/MeV`);
});
test('the thermistor saturates: 50 MeV gives under two thirds the voltage per MeV of 1 MeV, and a longer fall', () => {
  const small = pulse(P(), 1), big = pulse(P(), 50);
  assert.ok(big.peak / 50 < (2 / 3) * small.peak, `${(big.peak / 50 * 1e6).toFixed(0)} against ${(small.peak * 1e6).toFixed(0)} µV/MeV`);
  assert.ok(big.fall > 1.5 * small.fall, `fall ${(big.fall * 1e3).toFixed(0)} against ${(small.fall * 1e3).toFixed(0)} ms`);
  const tiny = pulse(P(), 0.001), smaller = pulse(P(), 0.0001);
  assert.ok(Math.abs(tiny.peak / smaller.peak / 10 - 1) < 1e-3, 'small pulses are in proportion');
});
test('a warmer sink: 14 mK is twenty times quieter and slower to fall; 8 mK\'s hot electrons fall fast', () => {
  const p10 = pulse(P(), 2.528), p14 = pulse(P({ tbase: 14 }), 2.528), p8 = pulse(P({ tbase: 8 }), 2.528), r8 = model.rest(P({ tbase: 8 }));
  assert.ok(p14.peak < p10.peak / 15, `14 mK: ${(p14.peak * 1e6).toFixed(1)} µV against ${(p10.peak * 1e6).toFixed(1)}`);
  assert.ok(p14.fall > 2 * p10.fall, `14 mK falls in ${(p14.fall * 1e3).toFixed(0)} ms`);
  assert.ok(r8.Te - r8.Tc > 1e-3, `8 mK: electrons ${((r8.Te - r8.Tc) * 1e3).toFixed(2)} mK above the crystal`);
  assert.ok(p8.fall < p10.fall / 2 && p8.peak > 1.5 * p10.peak, `8 mK: ${(p8.fall * 1e3).toFixed(0)} ms, ${(p8.peak * 1e6).toFixed(0)} µV`);
});
test('the hints: longer wires slow the rise, a smaller crystal gives more signal, firmer clips a quicker fall', () => {
  const p0 = pulse(P(), 2.528);
  assert.ok(pulse(P({ wire: 3000 }), 2.528).rise > 1.5 * p0.rise, 'wires');
  const small = pulse(P({ side: 3 }), 2.528);
  assert.ok(small.peak > 2 * p0.peak && small.fall < p0.fall, 'a 3 cm crystal');
  assert.ok(pulse(P({ clamp: 30 }), 2.528).fall < 0.6 * p0.fall, 'clips');
  // the bias: the gain grows, then falls
  const g = [0.5, 5, 30].map((bias) => pulse(P({ bias }), 0.1).peak);
  assert.ok(g[1] > g[0] && g[1] > g[2], `bias ${g.map((v) => (v * 1e6).toFixed(1)).join(', ')} µV`);
});

console.log('engine');
test('every key sounds its heater\'s rate: the fundamental on the note (within 0.5 ¢), in the keyboard\'s tuning too', () => {
  for (const [o, keys] of [[{}, [33, 45, 57, 69, 81, 93]], [{ pitch: 1, temperament: 2 }, [40, 64, 76]]]) {
    for (const k of keys) {
      const f = tunedFreq(P(o), k), x = render(k, P(o), 0.7, 1.2);
      const got = peak(x, f, 9600, 9600 + 32768);
      assert.ok(Math.abs(cents(got, f)) < 0.5, `key ${k}: ${got.toFixed(3)} Hz against ${f.toFixed(3)}`);
    }
  }
});
test('the engine plays the model: A0\'s first pulse is the model\'s, sped up 1,320 times, through the gain', () => {
  const p = P(), S = p.periodA4 * 440, x = render(21, p, 1, 0.03).map((v) => v / keyPan(21)[0]); // the left channel, its pan undone
  const r = model.rest(p), tr = model.train(p, p.energy, 0, S / FS, x.length, { sub: 2 });
  // through the output's DC block (5 Hz) as the engine's
  const R = Math.exp((-2 * Math.PI * 5) / FS), want = [];
  let x1 = 0, y1 = 0;
  for (const v of tr.V) { const u = (p.gain * (r.V - v)) / C.ADC_FULL; y1 = u - x1 + R * y1; x1 = u; want.push(y1); }
  const top = Math.max(...want);
  let worst = 0;
  for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - want[i]));
  assert.ok(worst < 0.02 * top, `worst ${worst.toExponential(2)} against a peak of ${top.toFixed(4)}`);
});
test('velocity is the pulse\'s energy: half the velocity, about half the note', () => {
  const a = rms(render(57, P(), 1, 0.5), 4800), b = rms(render(57, P(), 0.5, 0.5), 4800);
  assert.ok(Math.abs(b / a - 0.5) < 0.06, `${(b / a).toFixed(3)}`);
});
test('the mod wheel warms the sink: the note fades', () => {
  const a = rms(render(57, P(), 0.7, 0.5), 4800), b = rms(render(57, P({ tbase: 14 }), 0.7, 0.5), 4800);
  assert.ok(b < a / 8, `${(b / a).toFixed(3)}`);
});
test('the pitch wheel bends the heater: +1 is two semitones up', () => {
  const f = tunedFreq(P(), 57) * 2 ** (2 / 12), x = render(57, P(), 0.7, 1.2, { events: [[0, (e) => e.handle?.({ type: 'bend', value: 1 })]] });
  const got = peak(x, f, 14400, 14400 + 32768);
  assert.ok(Math.abs(cents(got, f)) < 1, `${got.toFixed(2)} Hz against ${f.toFixed(2)}`);
});
test('a let-go key\'s heater stops and its last pulse drains away: silent and freed', () => {
  for (const k of [21, 57, 96]) {
    const x = render(k, P(), 1, 1, { off: 0.4 });
    // (a high key's pulses pile up and warm the crystal: the output's DC block lets that go as
    // a slow subsonic swell)
    const tail = Math.max(...Array.from(x.subarray(Math.round(0.7 * FS)), Math.abs));
    assert.ok(tail < 1e-3, `key ${k}: ${tail} 0.3 s after`);
    assert.equal(x.engine.voiceCount(), 0, `key ${k}: still sounding`);
  }
});
test('Space keeps the heaters firing until the pedal comes up', () => {
  const x = render(57, P(), 0.7, 1.2, { off: 0.1, events: [[0, (e) => e.setSustain(true)], [0.8, (e) => e.setSustain(false)]] });
  assert.ok(rms(x, Math.round(0.5 * FS), Math.round(0.75 * FS)) > 0.3 * rms(x, 2400, Math.round(0.1 * FS)), 'it plays on');
  assert.ok(rms(x, Math.round(1 * FS)) < 1e-4 && x.engine.voiceCount() === 0, 'and stops');
});
test('every preset, and the extremes, on every octave: finite, and a chord stays under 1', () => {
  const sets = [...PRESETS.map((p) => P(p.p)), P({ tbase: 7, bias: 30, t0: 5, wire: 50, energy: 50 }), P({ tbase: 20, bias: 0.2, t0: 2, side: 10, clamp: 1 }), P({ periodA4: 0.05 }), P({ periodA4: 300, side: 1, clamp: 100 })];
  for (const p of sets) {
    const e = new CuoreEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
    e.setParams(p);
    for (const k of [21, 45, 69, 93, 108]) e.noteOn(k, 1);
    for (let b = 0; b < 150; b++) { e.process(bL, bR, 128); assert.ok(bL.every(Number.isFinite) && bR.every(Number.isFinite), `NaN with ${JSON.stringify(p).slice(0, 80)}`); }
  }
  let pk = 0;
  const x = render([48, 52, 55, 60], P(), 1, 1);
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk > 0.05 && pk < 1, `peak ${pk}`);
});
test('CPU: ten crystals render 5 times faster than real time', () => {
  const e = new CuoreEngine(FS), bL = new Float32Array(128), bR = new Float32Array(128);
  e.setParams(P());
  for (let i = 0; i < 10; i++) e.noteOn(36 + 5 * i, 0.7);
  for (let b = 0; b < 400; b++) e.process(bL, bR, 128); // V8's optimising tier
  const t0 = performance.now();
  for (let b = 0; b < 375 * 2; b++) e.process(bL, bR, 128);
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `${ms.toFixed(0)} ms for 2 s`);
});

// What the Quality setting trims (the README says it): fewer crystals at once, and fewer steps a
// sample (8 at most at High, 2 at Medium, 1 at Low).
test('Quality: past 24 crystals at Medium and 12 at Low the oldest\'s heater stops; Medium plays the defaults as High, Low within a few per cent', () => {
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (const [quality, cap] of [['high', 36], ['medium', 24], ['low', 12]]) {
    const e = new CuoreEngine(FS);
    e.setQuality(quality); e.setParams(P());
    for (let i = 0; i < 36; i++) { e.noteOn(36 + i, 0.7); for (let b = 0; b < 4; b++) e.process(bL, bR, 128); }
    for (let b = 0; b < 100; b++) e.process(bL, bR, 128);
    assert.equal(e.voiceCount(), cap, `${quality}: crystals sounding`);
  }
  const hi = render(57, P(), 0.7, 0.5), med = render(57, P(), 0.7, 0.5, { quality: 'medium' }), lo = render(57, P(), 0.7, 0.5, { quality: 'low' });
  assert.ok(hi.every((v, i) => v === med[i]), 'Medium is High at the defaults');
  const d = 20 * Math.log10(rms(lo, 4800) / rms(hi, 4800)), f = tunedFreq(P(), 57);
  assert.ok(Math.abs(d) < 1 && Math.abs(cents(peak(lo, f, 4800, 20000), f)) < 0.5, `Low: ${d.toFixed(2)} dB`);
  const slow = render(57, P({ periodA4: 10 }), 0.7, 0.3), slowMed = render(57, P({ periodA4: 10 }), 0.7, 0.3, { quality: 'medium' });
  assert.ok(!slow.every((v, i) => v === slowMed[i]), 'at a larger speed-up Medium takes fewer steps');
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
