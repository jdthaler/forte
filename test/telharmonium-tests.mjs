// Telharmonium checks: the shafts, the buses, the line, the receiver and the horn against their
// physics, then the engine against the model. Run: node test/telharmonium-tests.mjs
//
// Both are the C++ (native/instruments/telharmonium), built as WebAssembly: the model's functions
// through telharmonium-wasm.js. The independent checks solve the circuits here.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS } from '../telharmonium/src/telharmonium-instrument.js';
import { wasmModel } from '../telharmonium/src/telharmonium-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { tunedFreq } from '../shared/tuning.js';

const TelharmoniumEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const stops = (m, a) => Object.fromEntries(a.map((v, i) => [`${m}${i + 1}`, v]));
const both = (a) => ({ ...stops('a', a), ...stops('m', a) });
// One sine per key on the buses: the ground tone alone, no tooth error, the motor steady.
const PURE = P({ ...both([8, 0, 0, 0, 0, 0, 0, 0]), tooth: 0, droop: 0, contact: 0 });
const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);

function engine(params, { tap = 0, quality, fs = FS } = {}) {
  const e = new TelharmoniumEngine(fs);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  e.tap = tap;
  return e;
}
// Run an engine for sec seconds, 128-sample blocks like the AudioWorklet; returns [L, R].
function run(e, sec, fs = FS) {
  const n = Math.round(sec * fs), L = new Float32Array(n), R = new Float32Array(n);
  for (let s = 0; s < n; s += bl) { e.process(bL, bR, bl); const m = Math.min(bl, n - s); L.set(bL.subarray(0, m), s); R.set(bR.subarray(0, m), s); }
  return [L, R];
}
// Complex amplitude of frequency f in x[a, b) (Hann-windowed, so a sine of amplitude A gives |A|).
function phasor(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0, sw = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); sw += h; re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); }
  return { re: (2 * re) / sw, im: (2 * im) / sw };
}
const tone = (x, f, a, b, fs) => { const p = phasor(x, f, a, b, fs); return Math.hypot(p.re, p.im); };
// The strongest frequency within ±40 ¢ of f0 in x[a, b) (golden-section search on tone).
function peak(x, f0, a, b) {
  let lo = f0 * 2 ** (-40 / 1200), hi = f0 * 2 ** (40 / 1200);
  for (let i = 0; i < 50; i++) { const m1 = hi - 0.618 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1; }
  return (lo + hi) / 2;
}
const cents = (a, b) => 1200 * Math.log2(a / b);
const dB = (x) => 20 * Math.log10(x);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
const keyHz = (key, p = DEFAULTS) => tunedFreq(p, key);
// A key's (or chord's) bus current, held: the side its manual leans to (I left, II right).
function held(keys, params, sec = 1, opts = {}) {
  const e = engine(params, { tap: 1, ...opts });
  for (const k of [].concat(keys)) e.noteOn(k, 1);
  return { e, out: run(e, sec) };
}

// --- the machine on paper ---------------------------------------------------------------------

test('the 1906 C-shaft: C3 is 4 teeth at 129.33 Hz (A = 435), its harmonics 8, 12, … teeth (Weidenaar, Table 4)', () => {
  near(M.cShaft435(4), 129.33, 0.005, 'C3');
  for (let n = 1; n <= 8; n++) near(M.cShaft435(4 * n), 435 * 2 ** (-21 / 12) * n, 1e-9 * n, `harmonic ${n}`);
  // the engine's count is 16 times the 1906 one: C3 is 64 teeth
  assert.deepEqual(M.assign(48), { shaft: 0, teeth: 64 });
});

test('every key has its own alternator on its own pitch class\'s shaft, 4·2^octave teeth; its harmonics are n times those teeth', () => {
  for (let k = 21; k <= 108; k++) {
    const a = M.assign(k);
    assert.equal(a.shaft, k % 12);
    assert.equal(a.teeth, 4 * 2 ** Math.floor(k / 12));
  }
});

test('Pierce: a just third (5:4) and minor seventh (7:4) come from the root\'s shaft, in any octave; other intervals fail', () => {
  const c4 = M.assign(60).teeth;
  assert.deepEqual(M.assign(64, 60), { shaft: 0, teeth: (c4 * 5) / 4 });
  assert.deepEqual(M.assign(70, 60), { shaft: 0, teeth: (c4 * 7) / 4 });
  assert.deepEqual(M.assign(76, 60), { shaft: 0, teeth: (c4 * 5) / 2 });
  assert.deepEqual(M.assign(82, 60), { shaft: 0, teeth: (c4 * 7) / 2 });
  for (const k of [61, 62, 63, 65, 67, 69, 72]) assert.equal(M.assign(k, 60).shaft, -1, `${k}`);
  assert.equal([0, 2, 3, 4, 5, 7, 9, 10].every(M.built) && ![1, 6, 8, 11].some(M.built), true);
});

test('the robbing law: N windings in parallel on a bus each carry e/(Z_s + N Z_L), as the circuit\'s node equation solves', () => {
  for (const rho of [0, 0.15, 0.5, 1]) for (const k of [1, 4, 8]) for (let N = 1; N <= 8; N++) {
    // one winding of resistance 1 and EMF 1; the bus's load: the coil (ρ) and the stop's rheostat,
    // set so one note alone gets the stop's level of a full stop's current
    const level = M.stopLevel(k), ZL = (1 + rho) / level - 1;
    const V = (N * ZL) / (1 + N * ZL); // Σ (1 − V)/1 = V/Z_L
    const full = 1 / (1 + rho);        // one note, a full stop
    near(M.busGain(N, level, rho), (1 - V) / full, 1e-12, `ρ ${rho}, ${k} of 8, N ${N}`);
  }
  near(M.stopLevel(8), 1, 1e-12, 'full'); near(dB(M.stopLevel(5)), -9, 1e-9, '5 of 8'); assert.equal(M.stopLevel(0), 0);
});

test('the line: the telegrapher\'s exact response matches 2000 lumped sections, cable and open wire, 50 Hz – 8 kHz', () => {
  const kinds = { cable: [52.8, 0.62e-3, 52e-9], open: [2.6, 2.2e-3, 5.3e-9] };
  for (const [name, [R, L, C]] of Object.entries(kinds)) for (const km of [2, 25, 160]) for (const f of [50, 300, 1000, 3000, 8000]) {
    // cascade of T-sections' ABCD matrices (complex), n of them, each km/n long
    const n = 2000, w = 2 * Math.PI * f, d = km / n;
    const z = [(R * d) / 2, (w * L * d) / 2], y = [0, w * C * d]; // half the series impedance each side, the shunt admittance
    const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
    const mm = (X, Y) => [add(mul(X[0], Y[0]), mul(X[1], Y[2])), add(mul(X[0], Y[1]), mul(X[1], Y[3])), add(mul(X[2], Y[0]), mul(X[3], Y[2])), add(mul(X[2], Y[1]), mul(X[3], Y[3]))];
    const one = [1, 0], zero = [0, 0];
    const half = [one, z, zero, one], shunt = [one, zero, y, one];
    const sec = mm(mm(half, shunt), half);
    let T = [one, zero, zero, one];
    for (let i = 0; i < n; i++) T = mm(T, sec);
    // the current into R_r over its current with no line: (R_s + R_r)/(A R_r + B + R_s C R_r + R_s D)
    const Rs = 600, Rr = 600;
    const den = add(add([T[0][0] * Rr, T[0][1] * Rr], T[1]), add([T[2][0] * Rs * Rr, T[2][1] * Rs * Rr], [T[3][0] * Rs, T[3][1] * Rs]));
    const lumped = (Rs + Rr) / Math.hypot(den[0], den[1]);
    const exact = M.lineExact(f, name, km).abs;
    near(dB(exact), dB(lumped), 0.05, `${name} ${km} km at ${f} Hz (dB)`);
  }
  // at DC the line is its resistance alone
  near(M.lineExact(0, 'cable', 25).abs, 1200 / (1200 + 52.8 * 25), 1e-12, 'DC');
});

test('the line\'s delay: 160 km of open wire takes ℓ√(LC) ≈ 0.55 ms at 2–6 kHz (near the speed of light)', () => {
  const ph = (f) => { const h = M.lineExact(f, 'open', 160); return Math.atan2(h.im, h.re); };
  const expect = 160 * Math.sqrt(2.2e-3 * 5.3e-9);
  for (const f of [2000, 4000, 6000]) {
    let dphi = ph(f + 1) - ph(f - 1); while (dphi > Math.PI) dphi -= 2 * Math.PI; while (dphi < -Math.PI) dphi += 2 * Math.PI;
    const tg = -dphi / (2 * 2 * Math.PI);
    near(tg, expect, 0.05 * expect, `group delay at ${f} Hz (s)`);
  }
  assert.ok(expect * 1000 > 0.5 && expect * 1000 < 0.6);
});

test('the receiver: a clamped soft-iron disc 5 cm across and 1/100 inch thick rings at f01 = λ²/(2πa²)·√(D/ρh) ≈ 1005 Hz; Arthur\'s at 0.3 of it', () => {
  const E = 200e9, rho = 7870, nu = 0.29, a = 0.025, h = 0.000254;
  const D = (E * h ** 3) / (12 * (1 - nu * nu));
  const f = (10.2158 / (2 * Math.PI * a * a)) * Math.sqrt(D / (rho * h));
  near(M.plateF01(a, h), f, 1e-9, 'f01');
  near(M.F0_THIN, 1004.75, 0.05, 'thin');
  near(M.F0_ARTHUR / M.F0_THIN, 0.3, 1e-12, 'ten times the area, three times as thick');
  // its response peaks at f01 with Q 4
  const r = (x) => M.receiver(x, 'telephone').abs, f0 = M.F0_THIN;
  assert.ok(r(f0) > r(f0 * 0.97) && r(f0) > r(f0 * 1.03));
  near(r(f0), 4, 1e-9, 'Q at resonance');
});

test('the horn: a cone\'s resonances at n·c/2L (within 12 %, the mouth\'s end correction); no horn is the bare diaphragm\'s acceleration', () => {
  for (const L of [1, 1.8, 3]) {
    const g = (f) => M.horn(f, L).abs, base = M.C_AIR / (2 * L);
    for (let n = 1; n <= 3; n++) {
      // the local maximum of |H| nearest n c/2L
      let best = 0, at = 0;
      for (let f = base * (n - 0.45); f < base * (n + 0.45); f += base / 400) if (g(f) > best) { best = g(f); at = f; }
      near(at / (n * base), 1, 0.12, `L ${L} m, n ${n}`);
    }
  }
  near(M.horn(2000, 0).abs / M.horn(1000, 0).abs, 2, 1e-12, 'bare: rises 6 dB an octave');
});

// --- the engine -------------------------------------------------------------------------------

test('every key A0–C8 sounds its alternator\'s frequency, in the keyboard\'s tuning, to 0.1 ¢', () => {
  for (const key of [21, 33, 45, 50, 57, 60, 66, 69, 75, 81, 93, 105, 108]) {
    const { out } = held(key, PURE, 0.6), x = out[key >= 60 ? 1 : 0];
    const f0 = keyHz(key), a = 4800, b = x.length;
    near(cents(peak(x, f0, a, b), f0), 0, 0.1, `key ${key}`);
  }
});

test('as built, at A = 435: C3 is 129.33 Hz; on eight shafts C♯, F♯, A♭ and B are the just thirds of A, D, E and G (13.7 ¢ flat)', () => {
  const p = P({ ...PURE, pitch: 435, shafts: 'eight' });
  let { out } = held(48, p, 0.6);
  near(peak(out[0], 129.33, 4800, out[0].length), 129.33, 0.005, 'C3 (Hz)');
  for (const key of [61, 66, 68, 71]) {
    ({ out } = held(key, p, 0.6));
    const f = peak(out[1], keyHz(key, p), 4800, out[1].length);
    near(cents(f, keyHz(key - 4, p)), 1200 * Math.log2(5 / 4), 0.1, `key ${key} over its root`);
    near(cents(f, keyHz(key, p)), -13.69, 0.1, `key ${key} against tempered`);
  }
});

test('Pierce\'s intonation: over a held C4, E4 is a just 5:4 and B♭4 a 7:4, wherever they lie in the chord window', () => {
  const p = P({ ...PURE, intonation: 'pierce' });
  for (const order of [[60, 64, 70], [70, 64, 60]]) {
    const e = engine(p, { tap: 1 });
    for (const k of order) e.noteOn(k, 1);
    const [, x] = run(e, 0.8), c = peak(x, keyHz(60), 9600, x.length);
    near(cents(peak(x, keyHz(64), 9600, x.length), c), 1200 * Math.log2(5 / 4), 0.1, `E4 (order ${order})`);
    near(cents(peak(x, keyHz(70), 9600, x.length), c), 1200 * Math.log2(7 / 4), 0.1, `B♭4 (order ${order})`);
    const roots = Object.fromEntries(e.keys.map((k) => [k.key, k.root]));
    assert.deepEqual(roots, { 60: -1, 64: 60, 70: 60 });
  }
});

test('the harmonics: each stop brings in n times the key\'s frequency at its level; those past the top alternator are not there', () => {
  const p = P({ ...both([8, 7, 6, 5, 4, 3, 2, 1]), tooth: 0, droop: 0, contact: 0, voicing: 0 });
  const { out, e } = held(60, p, 0.8), x = out[1], f = keyHz(60);
  const g1 = tone(x, f, 9600, x.length);
  for (let n = 2; n <= 8; n++) {
    // the EMF ∝ ω through the winding's R + iωL: the current is flat but for the circuit's iωτ/(1 + iωτ)
    const want = M.stopLevel(9 - n) * (M.circuit(n * f, DEFAULTS.tau / 1000).abs / M.circuit(f, DEFAULTS.tau / 1000).abs);
    near(dB(tone(x, n * f, 9600, x.length) / g1), dB(want), 0.1, `harmonic ${n} (dB)`);
  }
  assert.equal(e.keys[0].harmonics, 8);
  for (const [key, top] of [[84, 4000], [96, 4000], [108, 4000], [72, 1000], [60, 16000]]) {
    const { e: e2 } = held(key, P({ ...p, top }), 0.05);
    const f0 = keyHz(key);
    assert.equal(e2.keys[0].harmonics, Math.max(1, Math.min(8, Math.floor((top * (1 + 1e-9)) / f0))), `key ${key}, top ${top}`);
  }
});

test('robbing in the engine: a second note on the same buses takes each note down to busGain(2), as the circuit says', () => {
  for (const robbing of [0.15, 0.5]) for (const k of [8, 5]) {
    const p = P({ ...PURE, ...both([k, 0, 0, 0, 0, 0, 0, 0]), robbing });
    const alone = held(60, p, 0.6).out[1], pair = held([60, 67], p, 0.6).out[1], f = keyHz(60);
    const ratio = tone(pair, f, 9600, pair.length) / tone(alone, f, 9600, alone.length);
    near(ratio, M.busGain(2, M.stopLevel(k), robbing) / M.busGain(1, M.stopLevel(k), robbing), 0.002, `ρ ${robbing}, ${k} of 8`);
  }
});

test('shared alternators are one machine: C4\'s octave and C5\'s ground tone add in phase (coherent, not √2)', () => {
  const p = P({ tooth: 0, droop: 0, contact: 0, robbing: 0, ...stops('a', [0, 0, 0, 0, 0, 0, 0, 0]), ...stops('m', [8, 8, 0, 0, 0, 0, 0, 0]) });
  const f = keyHz(72);
  const a = held(60, p, 0.6).out[1], b = held(72, p, 0.6).out[1], ab = held([60, 72], p, 0.6).out[1];
  const pa = phasor(a, f, 9600, a.length), pb = phasor(b, f, 9600, b.length), pab = phasor(ab, f, 9600, ab.length);
  // C4's harmonic 2 and C5's harmonic 1 sit on different buses (and no robbing on C5's octave's)
  near(Math.hypot(pab.re, pab.im), Math.hypot(pa.re + pb.re, pa.im + pb.im), 1e-3, 'sum');
  const angle = Math.atan2(pa.im * pb.re - pa.re * pb.im, pa.re * pb.re + pa.im * pb.im);
  near(Math.abs(angle), 0, 0.01, 'phase between them (rad)');
});

test('the switch: a winding closed at once starts at zero current, and leaves an offset decaying as e^{−t/τ} (τ = L/R)', () => {
  for (const tau of [4, 25]) {
    const p = P({ ...PURE, tau });
    const e = engine(p, { tap: 1 });
    run(e, 0.01);
    e.noteOn(60, 1);
    const [, x] = run(e, 0.6);
    const f = keyHz(60), n = x.length, q = phasor(x, f, n - 9600, n);
    // the steady sine, fitted at the end, taken away: the offset left
    const w = (2 * Math.PI * f) / FS, r = (i) => x[i] - (q.re * Math.cos(w * i) - q.im * Math.sin(w * i));
    assert.ok(Math.abs(x[0]) < 0.02 * Math.hypot(q.re, q.im), `starts from zero: ${x[0]}`);
    const T = Math.round((tau / 1000) * FS), r0 = r(0);
    assert.ok(Math.abs(r0) > 0.05 * Math.hypot(q.re, q.im) || Math.abs(r0) < 1e-3, 'an offset (unless struck at a zero crossing)');
    if (Math.abs(r0) > 1e-3) near(r(T) / r0, Math.exp(-1), 0.02, `after τ = ${tau} ms`);
  }
});

test('the relay\'s contacts: the current follows them in and out over the contact time, and leaves the bus empty after', () => {
  const p = P({ ...PURE, contact: 6 });
  const e = engine(p, { tap: 1 });
  e.noteOn(60, 1);
  const [, a] = run(e, 0.3);
  const steady = Math.max(...a.slice(a.length - 4800).map(Math.abs));
  // half way in, it is under the steady level; past the contacts and a few τ it has got there
  assert.ok(Math.max(...a.slice(0, 144).map(Math.abs)) < 0.8 * steady, 'closing');
  e.noteOff(60);
  const [, b] = run(e, 0.1), pc = Math.round(0.006 * FS);
  assert.ok(Math.max(...b.slice(pc + 1).map(Math.abs)) === 0, 'open: no current');
  assert.equal(e.busCount(8), 0);
  assert.ok(Math.max(...b.slice(0, pc).map(Math.abs)) < 1.3 * steady, 'no spike as the contacts part');
});

test('the line in the engine: after 25 km of cable a note\'s harmonics are where the telegrapher\'s line puts them (made up at 300 Hz)', () => {
  const p = P({ ...both([8, 8, 8, 0, 0, 0, 0, 0]), tooth: 0, droop: 0, contact: 0 });
  const e0 = engine(p, { tap: 2 }), e1 = engine(P({ ...p, distance: 25 }), { tap: 2 });
  for (const e of [e0, e1]) e.noteOn(60, 1);
  const [, x0] = run(e0, 0.8), [, x1] = run(e1, 0.8), f = keyHz(60), n = x0.length;
  for (let h = 1; h <= 3; h++) {
    const want = M.lineExact(h * f, 'cable', 25).abs / M.lineExact(M.TAP_HZ, 'cable', 25).abs;
    near(dB(tone(x1, h * f, n - 24000, n) / tone(x0, h * f, n - 24000, n)), dB(want), 0.1, `harmonic ${h} (dB)`);
  }
  assert.ok(e1.lineTaps > M.LINE_DELAY && e0.lineTaps === 0);
});

test('the receiver\'s pull is the flux squared: two harmonics without their ground tone make it, ∝ 1/magnet (the resultant)', () => {
  const p = P({ ...stops('a', [0, 0, 0, 0, 0, 0, 0, 0]), ...stops('m', [0, 8, 8, 0, 0, 0, 0, 0]), tooth: 0, droop: 0, contact: 0 });
  const f = keyHz(60), ratio = [];
  for (const magnet of [100, 200, 400]) {
    const e = engine(P({ ...p, magnet }), { tap: 3 });
    e.noteOn(60, 1);
    const [, x] = run(e, 0.8), n = x.length;
    ratio.push(tone(x, f, n - 24000, n) / tone(x, 2 * f, n - 24000, n));
  }
  near(ratio[0] / ratio[1], 2, 0.1, '100 vs 200');
  near(ratio[1] / ratio[2], 2, 0.1, '200 vs 400');
  // without the receiver's square there is none on the buses
  const { out } = held(60, p, 0.8), x = out[1], n = x.length;
  assert.ok(tone(x, f, n - 24000, n) < 1e-4 * tone(x, 2 * f, n - 24000, n));
});

test('the motor: under load the shafts droop by droop × load through the flywheel\'s time constant, and every key flattens alike', () => {
  const p = P({ ...both([8, 8, 8, 8, 8, 8, 8, 8]), tooth: 0, droop: 40, flywheel: 0.5 });
  const e = engine(p, { tap: 1 }), chord = [36, 40, 43, 48, 52, 60, 64, 67, 72, 76];
  for (const k of chord) e.noteOn(k, 1);
  run(e, 0.5);
  const after = e.cents, load = e.load, target = -40 * load;
  near(after / target, 1 - Math.exp(-1), 0.05, 'one time constant in');
  const [, x] = run(e, 3);
  near(e.cents, target, 0.02 * Math.abs(target), 'settled');
  assert.ok(load > 0.1 && load < 1, `load ${load}`);
  near(cents(peak(x, keyHz(72), x.length - 24000, x.length), keyHz(72)), e.cents, 0.1, 'C5 sounds it');
});

test('pitch bend: the field rheostat swings the motor ±2 semitones, through the flywheel', () => {
  const e = engine(P({ ...PURE, flywheel: 0.2 }), { tap: 1 });
  e.noteOn(60, 1); run(e, 0.1);
  e.handle({ type: 'bend', value: 1 }); run(e, 0.2);
  near(e.cents / 200, 1 - Math.exp(-1), 0.05, 'a time constant in');
  const [, x] = run(e, 2);
  near(cents(peak(x, keyHz(62), x.length - 24000, x.length), keyHz(60)), 200, 0.2, 'settled (¢)');
});

test('touch: at 0 velocity changes nothing; at 1 the level is the velocity; aftertouch presses it to full', () => {
  const lvl = (touch, vel, after) => {
    const e = engine(P({ ...PURE, touch }), { tap: 1 });
    e.noteOn(60, vel); if (after != null) e.handle({ type: 'pressure', value: after, key: 60 });
    const [, x] = run(e, 0.5); return tone(x, keyHz(60), 9600, x.length);
  };
  near(lvl(0, 0.2) / lvl(0, 1), 1, 1e-3, 'touch 0');
  near(lvl(1, 0.25) / lvl(1, 1), 0.25, 2e-3, 'touch 1');
  near(lvl(1, 0.25, 1) / lvl(1, 1), 1, 2e-3, 'aftertouch');
});

test('release: a lifted key\'s windings leave its buses and the output falls silent within a second', () => {
  for (const name of ['Telharmonic', 'Heavy thumps', '160 km']) {
    const e = engine(preset(name));
    for (const k of [36, 60, 64]) e.noteOn(k, 0.9);
    run(e, 0.5);
    for (const k of [36, 60, 64]) e.noteOff(k);
    const [L, R] = run(e, 1.2), tail = (x) => Math.max(...x.slice(x.length - 4800).map(Math.abs));
    assert.ok(tail(L) < 1e-4 && tail(R) < 1e-4, `${name}: ${tail(L)}, ${tail(R)}`);
    assert.equal(e.voiceCount(), 0);
  }
});

test('output level is sane: a C4 at full velocity peaks 0.05–1; no preset\'s chord passes 1.5', () => {
  const [, x] = run((() => { const e = engine(P()); e.noteOn(60, 1); return e; })(), 1);
  const pk = Math.max(...x.map(Math.abs));
  assert.ok(pk > 0.05 && pk < 1, `C4 peak ${pk}`);
  for (const pr of PRESETS) {
    const e = engine(P(pr.p));
    for (const k of [36, 43, 52, 60, 64, 67, 72, 79]) e.noteOn(k, 1);
    const [L, R] = run(e, 0.8), m = Math.max(...L.map(Math.abs), ...R.map(Math.abs));
    assert.ok(m < 1.5, `${pr.name}: ${m}`);
  }
});

test('extremes at 44.1 and 48 kHz: no NaN or blow-up with the knobs at their ends, bent, chords on every preset', () => {
  const ends = [{}, { top: 16000, tooth: 0.1, voicing: 1, tau: 40, contact: 0, robbing: 1, distance: 250, magnet: 10, horn: 3 },
    { top: 1000, tooth: 0, voicing: 0, tau: 0.5, contact: 20, robbing: 0, cable: 'open', distance: 250, receiver: 'arthur', magnet: 2000, horn: 0, droop: 60, flywheel: 0.2 }];
  for (const fs of [44100, 48000]) for (const o of [...ends, ...PRESETS.map((p) => p.p)]) {
    const e = engine(P(o), { fs });
    for (const k of [21, 33, 48, 60, 61, 64, 70, 84, 96, 108]) e.noteOn(k, 1);
    e.handle({ type: 'bend', value: -1 });
    const [L, R] = run(e, 0.3, fs);
    for (const k of [21, 60, 108]) e.noteOff(k);
    const [L2] = run(e, 0.2, fs);
    for (const x of [L, R, L2]) for (const v of x) assert.ok(Number.isFinite(v) && Math.abs(v) < 10, `${fs} ${JSON.stringify(o)}: ${v}`);
  }
});

test('Quality: at most 32 keys sound at High, 16 at Medium, 10 at Low (the oldest lets go); Low drops the tooth error', () => {
  for (const [q, cap] of [['high', 32], ['medium', 16], ['low', 10]]) {
    const e = engine(P(), { quality: q });
    for (let k = 40; k < 80; k++) { e.noteOn(k, 0.8); run(e, 0.005); }
    run(e, 0.1);
    assert.equal(e.voiceCount(), cap, q);
    assert.ok(e.keys.every((k) => k.key >= 80 - cap), `${q}: the newest stay`);
  }
  const twelfth = (q) => {
    const e = engine(P({ ...PURE, tooth: 0.1 }), { tap: 1, quality: q });
    e.noteOn(60, 1);
    const [, x] = run(e, 0.5); return tone(x, 3 * keyHz(60), 9600, x.length) / tone(x, keyHz(60), 9600, x.length);
  };
  assert.ok(twelfth('high') > 0.05 && twelfth('low') < 1e-4, `${twelfth('high')}, ${twelfth('low')}`);
});

test('CPU: twenty keys with every stop out, through 25 km of cable, render well faster than real time', () => {
  const e = engine(P({ ...both([8, 8, 8, 8, 8, 8, 8, 8]), distance: 25 }));
  for (let k = 36; k < 96; k += 3) e.noteOn(k, 0.8);
  run(e, 0.2);
  const t0 = performance.now(); run(e, 2); const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 0.6, `${((dt / 2) * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
