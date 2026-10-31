// Regal checks: the tongue's one mode against the exact cantilever, the curved tongue's contact and
// gap against their integrals, the tube against the quarter-wave pipe, the bellows' wedge, then the
// engine: every reed in tune, the voicer's retuning, the ranks, the wind giving and the bellows
// changing over, the tremulant, the pitch the wind moves, bends, levels, stability, Quality and CPU.
// Run: node test/regal-tests.mjs
//
// The model and the engine are the C++ (native/instruments/regal), built as WebAssembly: the model's
// functions through regal-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS, RESONATORS, KEY_LO, KEY_HI } from '../regal/src/regal-instrument.js';
import { wasmModel } from '../regal/src/regal-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const RegalEngine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000, C = 343, E = 100e9, RHO = 8500, TAU = 2 * Math.PI;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const rankFreq = (key, rank) => keyFreq(key) * 2 ** (rank === 2 && key + 12 > 108 ? 0 : rank - 1);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'params', P] | [t, 'msg',
// message]) in 128-sample blocks, as the AudioWorklet does; tap(e, t) after each block.
function run(params, events, sec, { fs = FS, tap, quality, engine } = {}) {
  const e = engine ?? new RegalEngine(fs);
  if (quality) e.setQuality(quality);
  e.setParams(params);
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
const rms = (x, a = 0, b = x.length) => { let s = 0; a = Math.round(a); b = Math.round(b); for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
// The frequency near f in x[a, b): the phase of f advancing over growing lags (Hann-windowed).
function freqAt(x, f, a, b, fs = FS) {
  a = Math.round(a); b = Math.round(b);
  const m = Math.max(2048, Math.ceil((4 * fs) / f)), ph = (s, fr) => { const w = (TAU * fr) / fs; let re = 0, im = 0; for (let i = s; i < s + m; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - s)) / m); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); } return Math.atan2(im, re); };
  const wrap = (d) => d - TAU * Math.round(d / TAU);
  let fr = f;
  for (const lag of [64, 512, b - m - a]) fr += (wrap(ph(a + lag, fr) - ph(a, fr)) * fs) / (TAU * lag);
  return fr;
}
// What a key's rank sounds alone in the model (the chest held at the bellows' weight), retuned as the
// engine retunes it: cents from its note.
const soundsOff = (key, rank, p) => { const f = M.measure(key, rank, p, FS, p.pressure); return f > 0 ? cents(f, rankFreq(key, rank)) - M.voicingCents(key, rank, p, p.pressure) : NaN; };

// ---- the model ---------------------------------------------------------------------------------

test('the tongue: Rayleigh\'s one mode (ψ = u²(3 − u)/2, k = 3EI/L³) within 1.5 % of the exact clamped–free beam (with its tip weight) for every reed of every rank; the exact beam is 1.8751²/2πL² √(EI/ρA) unweighted', () => {
  let worst = 0;
  for (let key = 21; key <= 108; key++) for (let rank = 0; rank < 3; rank++) {
    const R = M.reed(key, rank, P());
    const f = Math.sqrt(R.k / R.m) / TAU, fe = M.cantilever(R.L, R.h, R.b, R.M);
    assert.ok(Math.abs(R.fNat / f - 1) < 1e-9, `${key}/${rank}: the reed is cut to its own fNat`);
    worst = Math.max(worst, Math.abs(f / fe - 1));
  }
  assert.ok(worst < 0.015, `worst ${(100 * worst).toFixed(2)} %`);
  const L = 0.03, h = 0.4e-3, b = 7e-3, I = (b * h ** 3) / 12;
  const exact = (1.8751041 ** 2 / (TAU * L * L)) * Math.sqrt((E * I) / (RHO * b * h));
  assert.ok(Math.abs(M.cantilever(L, h, b, 0) / exact - 1) < 1e-6, `${M.cantilever(L, h, b, 0)} against ${exact}`);
  assert.ok(M.cantilever(L, h, b, 1e-3) < 0.5 * exact, 'a gram on its tip lowers it');
  console.log(`        (worst ${(100 * worst).toFixed(2)} %)`);
});

test('the curved tongue: the gap u²(h₀ − q(3 − u)/2) and the shallot\'s push ∫dψ match their integrals; the tongue closes from the root and the gap shuts at q = h₀', () => {
  const h0 = 0.6e-3, bs = 5e-3, Ls = 30e-3, n = 20000;
  for (const q of [-0.2e-3, 0, 0.2e-3, 0.45e-3, 0.6e-3, 0.8e-3, 1.2e-3]) {
    let side = 0, I = 0;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, g = u * u * (h0 - (q * (3 - u)) / 2), psi = (u * u * (3 - u)) / 2;
      side += Math.max(0, g) / n; I += Math.max(0, -g) * psi / n;
    }
    const A = bs * Math.max(0, h0 - q) + 2 * Ls * side;
    assert.ok(Math.abs(M.gapArea(q, h0, bs, Ls) - A) < 1e-4 * A + 1e-12, `q ${q}: gap ${M.gapArea(q, h0, bs, Ls)} against ${A}`);
    const c = M.contact(q, h0);
    assert.ok(Math.abs(c.I - I) < 1e-4 * Math.max(I, 1e-9) + 1e-12, `q ${q}: contact ${c.I} against ${I}`);
    const d = 1e-9, dI = (M.contact(q + d, h0).I - M.contact(q - d, h0).I) / (2 * d);
    assert.ok(Math.abs(c.dI - dI) < 1e-4 + 1e-3 * Math.abs(dI), `q ${q}: dI ${c.dI} against ${dI}`);
  }
  assert.equal(M.contact((2 / 3) * h0 * 0.999, h0).I, 0, 'no contact until the root touches (q = 2h₀/3)');
  assert.ok(M.contact(0.7e-3, h0).I > 0, 'in contact past it');
  assert.equal(M.gapArea(h0, h0, bs, Ls), 0, 'shut at q = h₀');
});

test('the tube: a cylinder\'s first impedance peak is the closed–open pipe\'s, c/4(L + 0.61a) (within 0.1 %), and its impedance at it towers over the half-wave dip', () => {
  for (const [len, d] of [[0.1, 0.01], [0.3, 0.02], [0.05, 0.006]]) {
    const area = (Math.PI * d * d) / 4, a = d / 2, want = C / (4 * (len + 0.61 * a));
    assert.ok(Math.abs(M.endCorrection(area) - 0.61 * a) < 1e-12);
    const f = M.cylinderPeak(len, area, 0.3 * want, 3 * want);
    assert.ok(Math.abs(f / want - 1) < 1e-3, `${len} m: ${f.toFixed(2)} against ${want.toFixed(2)} Hz`);
    const peak = M.cylinder(len, area, want).mag, dip = M.cylinder(len, area, 2 * want).mag;
    assert.ok(peak > 20 * dip, `${len} m: |Z| ${peak.toExponential(2)} against ${dip.toExponential(2)}`);
  }
});

test('the resonators: each reed\'s first impedance peak is cut at the offset its table gives from one of the note\'s harmonics (within 0.1 % of a harmonic), and a longer resonator lowers it', () => {
  for (const [shape] of RESONATORS.slice(0, 3)) for (const key of [36, 48, 60, 72, 84]) {
    const p = P({ resonator: shape }), R = M.reed(key, 1, p), f0 = R.f0;
    const n = M.firstPeak(key, 1, p, 0.5 * f0, 40 * f0) / f0, off = M.tuneOffset(f0, RESONATORS.findIndex(([id]) => id === shape));
    assert.ok(Math.abs(n - off - Math.round(n - off)) < 1e-3, `${shape} ${key}: peak at ${n.toFixed(4)} harmonics, offset ${off}`);
    const longer = M.firstPeak(key, 1, P({ resonator: shape, resLength: 1.4 }), 0.5 * f0, 40 * f0) / f0;
    assert.ok(longer < n, `${shape} ${key}: ${longer.toFixed(2)} against ${n.toFixed(2)}`);
  }
});

test('the bellows: a wedge\'s board presses P₀ cos θ / cos θ_max, so the wind rises 3.2 % as it sinks from full to empty, steadily', () => {
  assert.ok(Math.abs(M.bellowsPressure(600, 1) - 600) < 1e-9);
  assert.ok(Math.abs(M.bellowsPressure(600, 0) / 600 - 1 / Math.cos(0.25)) < 1e-9, `${M.bellowsPressure(600, 0)}`);
  let last = 0;
  for (let f = 1; f >= 0; f -= 0.1) { const p = M.bellowsPressure(600, f); assert.ok(p >= last); last = p; }
});

// ---- the engine --------------------------------------------------------------------------------

test('every reed of every rank and resonator shape speaks its note, retuned as the engine retunes it (within 1 ¢, alone, at the default wind)', () => {
  let worst = 0, where = '';
  for (const [shape] of RESONATORS) for (let key = 21; key <= 108; key++) for (let rank = 0; rank < 3; rank++) {
    const c = soundsOff(key, rank, P({ resonator: shape }));
    assert.ok(Number.isFinite(c), `${shape} ${key}/${rank}: silent`);
    if (Math.abs(c) > Math.abs(worst)) { worst = c; where = `${shape} ${key}/${rank}`; }
  }
  assert.ok(Math.abs(worst) < 1, `${where}: ${worst.toFixed(2)} ¢`);
  console.log(`        (worst ${worst.toFixed(3)} ¢, ${where})`);
});

test('the engine plays them in tune at 44.1, 48 and 96 kHz alike (within 4 ¢ on a steady blower, 6 ¢ on hand bellows, C2–C6), since every reed steps at its own rate', () => {
  for (const fs of [44100, 48000, 96000]) for (const bellows of ['blower', 'hand']) for (const key of [36, 48, 60, 72, 84]) {
    const { L } = run(P({ bellows }), [[0, 'on', key, 0.7]], 1.6, { fs });
    const c = cents(freqAt(L, keyFreq(key), 0.9 * fs, 1.6 * fs, fs), keyFreq(key));
    assert.ok(Math.abs(c) < (bellows === 'blower' ? 4 : 6), `${fs} ${bellows} ${key}: ${c.toFixed(2)} ¢`);
  }
});

test('the voicer\'s retuning: every preset in tune (within 0.6 ¢), though the same reeds unretuned sound up to semitones off; knobs moved together are put right from the second press of a key (within 2 ¢)', () => {
  let raw = 0;
  for (const pr of PRESETS) {
    const p = P(pr.p);
    for (const key of [KEY_LO, 43, 48, 55, 60, 67, 72, 79, KEY_HI]) {
      const c = soundsOff(key, 1, p);
      assert.ok(Math.abs(c) < 0.6, `${pr.name} ${key}: ${c.toFixed(2)} ¢`);
      raw = Math.max(raw, Math.abs(c + M.voicingCents(key, 1, p, p.pressure)));
    }
  }
  assert.ok(raw > 100, `unretuned at most ${raw.toFixed(0)} ¢ off`);
  const p = P({ curve: 0.9, thickness: 1.3, q: 200, resLength: 0.7, bellows: 'blower' }), e = new RegalEngine(FS);
  for (const key of [41, 48, 60]) {
    const press = () => { const { L } = run(p, [[0, 'on', key, 0.7], [1.6, 'off', key]], 2.1, { engine: e }); return cents(freqAt(L, keyFreq(key), 0.8 * FS, 1.6 * FS), keyFreq(key)); };
    const first = press(), second = press();
    assert.ok(Math.abs(second) < 2, `${key}: ${first.toFixed(1)} ¢, then ${second.toFixed(1)} ¢`);
  }
  console.log(`        (presets unretuned up to ${raw.toFixed(0)} ¢ off)`);
});

test('the voicer\'s ear hears each press alone: a key played again and again, each time before its reed falls silent, stays on its note (within 2 ¢ every press), with and without knobs moved together', () => {
  for (const p of [P({ bellows: 'blower' }), P({ curve: 0.9, thickness: 1.3, q: 200, resLength: 0.7, bellows: 'blower' })]) {
    const e = new RegalEngine(FS), key = 60, heard = [];
    for (let i = 0; i < 6; i++) {
      const { L } = run(p, [[0, 'on', key, 0.7], [0.7, 'off', key]], 0.85, { engine: e });
      heard.push(cents(freqAt(L, keyFreq(key), 0.35 * FS, 0.69 * FS), keyFreq(key)));
    }
    for (const c of heard.slice(1)) assert.ok(Math.abs(c) < 2, `presses: ${heard.map((c) => c.toFixed(1)).join(', ')} ¢`);
  }
});

test('the ranks: the 4′ sounds an octave up (breaking back past C8), the Sordun 16′ an octave down, each in tune in the engine (within 4 ¢)', () => {
  assert.ok(Math.abs(M.reed(96, 2, P()).f0 / (2 * keyFreq(96)) - 1) < 1e-9);
  assert.ok(Math.abs(M.reed(100, 2, P()).f0 / keyFreq(100) - 1) < 1e-9, 'the 4′ breaks back past C8');
  for (const [rank, stops] of [[0, { regal8: false, regal16: true }], [2, { regal8: false, regal4: true }]]) for (const key of [48, 60, 72]) {
    const { L } = run(P({ ...stops, bellows: 'blower' }), [[0, 'on', key, 0.7]], 1.6), f = rankFreq(key, rank);
    const c = cents(freqAt(L, f, 0.9 * FS, 1.6 * FS), f);
    assert.ok(Math.abs(c) < 4, `rank ${rank} key ${key}: ${c.toFixed(2)} ¢`);
  }
});

test('the wind moves the pitch, as a regal\'s does: a reed cut for 600 Pa sounds flat on less wind and sharp on more (C4: 30–100 ¢ flat at 450 Pa, 30–100 ¢ sharp at 700 Pa), louder on more', () => {
  const at = (pa) => cents(M.measure(60, 1, P(), FS, pa), keyFreq(60));
  const lo = at(450), hi = at(700);
  assert.ok(lo < -30 && lo > -100, `450 Pa: ${lo.toFixed(1)} ¢`);
  assert.ok(hi > 30 && hi < 100, `700 Pa: ${hi.toFixed(1)} ¢`);
  const level = (pressure) => rms(run(P({ pressure, bellows: 'blower' }), [[0, 'on', 60, 0.7]], 1.2).L, 0.6 * FS, 1.2 * FS);
  assert.ok(level(900) > 1.3 * level(450), `${level(900).toFixed(4)} against ${level(450).toFixed(4)}`);
});

test('the bellows\' weight is retuned as it moves: the wind pressure raised under a held note leaves its pitch (within 5 ¢), and key pressure leans a quarter more wind on the bellows', () => {
  const base = P({ bellows: 'blower' }), ev = [[0, 'on', 60, 0.7]];
  for (let t = 1; t <= 1.5; t += 0.02) ev.push([t, 'params', { ...base, pressure: 600 + (200 * (t - 1)) / 0.5 }]);
  const { L } = run(base, ev, 3);
  const before = cents(freqAt(L, keyFreq(60), 0.4 * FS, FS), keyFreq(60)), after = cents(freqAt(L, keyFreq(60), 2.2 * FS, 3 * FS), keyFreq(60));
  assert.ok(Math.abs(after - before) < 5, `${before.toFixed(1)} ¢, then ${after.toFixed(1)} ¢ at 800 Pa`);
  let w0 = 0, w1 = 0;
  run(base, [[0, 'on', 60, 0.7], [0.5, 'msg', { type: 'pressure', value: 1 }]], 1.2, { tap: (e, t) => { if (t < 0.5) w0 = e.wind.Pbellows; else w1 = e.wind.Pbellows; } });
  assert.ok(Math.abs(w1 / w0 - 1.25) < 0.01, `${w0.toFixed(0)} → ${w1.toFixed(0)} Pa`);
});

test('the wind gives: a chord coming in draws the chest down (by 1–20 %) and it recovers; the reeds draw nothing once the keys are up, and the chest returns to the bellows\' pressure', () => {
  let min = Infinity, pre = 0, end = 0, draw = 1;
  const keys = [48, 55, 60, 64, 67, 72];
  run(P({ bellows: 'blower', regal4: true }), [...keys.map((k) => [0.5, 'on', k, 0.9]), ...keys.map((k) => [2, 'off', k])], 3.5, { tap: (e, t) => {
    const w = e.wind;
    if (t < 0.5) pre = w.Pchest; else if (t < 1) min = Math.min(min, w.Pchest);
    if (t > 3.3) { end = w.Pchest; draw = Math.abs(w.draw); }
  } });
  const dip = 1 - min / pre;
  assert.ok(dip > 0.01 && dip < 0.2, `dip ${(100 * dip).toFixed(1)} %`);
  assert.ok(Math.abs(end / pre - 1) < 0.002, `${end.toFixed(1)} against ${pre.toFixed(1)} Pa`);
  assert.ok(draw < 1e-6, `still drawing ${(draw * 1000).toFixed(4)} L/s`);
});

test('the hand bellows: a full chord empties one bellows and the calcant\'s other takes over (the wind rising as it sinks), and the wind holds near its weight through the changes (60–110 % of it)', () => {
  const keys = [48, 52, 55, 60, 64, 67, 72];
  let changes = 0, last = 0, lo = Infinity, hi = 0, rose = false, fillLo = 1;
  run(P({ regal4: true, regal16: true }), keys.map((k) => [0, 'on', k, 0.7]), 8, { tap: (e, t) => {
    const w = e.wind;
    if (w.active !== last) { changes++; last = w.active; }
    if (t > 0.5) { lo = Math.min(lo, w.Pchest); hi = Math.max(hi, w.Pchest); }
    fillLo = Math.min(fillLo, w.fill[w.active]);
    if (w.fill[w.active] < 0.3 && w.Pbellows > 600) rose = true;
  } });
  assert.ok(changes >= 2, `${changes} changes`);
  assert.ok(fillLo < 0.05, `the bellows sank to ${fillLo.toFixed(2)}`);
  assert.ok(rose, 'the wind rose as a bellows sank');
  assert.ok(lo > 360 && hi < 660, `${lo.toFixed(0)}–${hi.toFixed(0)} Pa`);
});

test('the tremulant: the wind, and every reed\'s loudness with it, pulses at its rate (the envelope\'s strongest beat within 0.2 Hz of it, an eighth or more deep)', () => {
  for (const tremRate of [4, 7]) {
    const { L } = run(P({ tremulant: true, tremRate, bellows: 'blower' }), [[0, 'on', 60, 0.7], [0, 'on', 64, 0.7], [0, 'on', 67, 0.7]], 4);
    const w = 480, env = [];
    for (let i = FS; i + w <= 4 * FS; i += w) env.push(rms(L, i, i + w));
    const mean = env.reduce((a, b) => a + b) / env.length;
    let best = 0, bf = 0;
    for (let f = 2; f <= 10; f += 0.05) {
      let re = 0, im = 0;
      env.forEach((x, i) => { const t = (i * w) / FS; re += (x - mean) * Math.cos(TAU * f * t); im += (x - mean) * Math.sin(TAU * f * t); });
      if (Math.hypot(re, im) > best) { best = Math.hypot(re, im); bf = f; }
    }
    const depth = (Math.max(...env) - Math.min(...env)) / (Math.max(...env) + Math.min(...env));
    assert.ok(Math.abs(bf - tremRate) < 0.2, `${tremRate}/s: the envelope beats at ${bf.toFixed(2)}/s`);
    assert.ok(depth > 0.12 && depth < 0.8, `${tremRate}/s: depth ${depth.toFixed(2)}`);
  }
});

test('the pallet: a fast key starts the reed sooner than a slow one', () => {
  const onset = (v) => { const { L } = run(P({ bellows: 'blower' }), [[0, 'on', 72, v]], 0.8), ref = rms(L, 0.5 * FS, 0.8 * FS); for (let i = 0; i < 0.5 * FS; i += 48) if (rms(L, i, i + 480) > 0.5 * ref) return i / FS; return 1; };
  const fast = onset(1), slow = onset(0.1);
  assert.ok(fast < slow - 0.004, `${(1000 * fast).toFixed(1)} ms against ${(1000 * slow).toFixed(1)} ms`);
});

test('level: a single note peaks at 0.005–0.5 across the compass on every shape; seven keys on three ranks stay under 2', () => {
  for (const [resonator] of RESONATORS) for (const key of [KEY_LO, 48, 60, 72, KEY_HI]) {
    const { L } = run(P({ resonator }), [[0, 'on', key, 0.7]], 1);
    let pk = 0; for (const v of L) pk = Math.max(pk, Math.abs(v));
    assert.ok(pk > 0.005 && pk < 0.5, `${resonator} ${key}: ${pk.toFixed(4)}`);
  }
  const { L } = run(P({ regal4: true, regal16: true, resonator: 'funnel' }), [36, 43, 48, 55, 60, 64, 67].map((k) => [0, 'on', k, 1]), 1.5);
  let pk = 0; for (const v of L) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk < 2, `${pk.toFixed(2)}`);
});

test('stability: seeded random combinations of extreme settings at 44.1 and 48 kHz, changed mid-note, with bends: no NaN, bounded, silent after release', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ext = () => P({
    resonator: pick(RESONATORS)[0], facing: pick(['brass', 'leather']), bellows: pick(['hand', 'blower']),
    curve: pick([0.3, 1.2]), thickness: pick([0.7, 1.4]), q: pick([30, 400]), resLength: pick([0.6, 1.7]),
    pressure: pick([400, 1000]), regal16: rnd() < 0.5, regal4: rnd() < 0.5, regal8: rnd() < 0.7, tremulant: rnd() < 0.5, tremRate: pick([3, 9]), fullRange: true,
  });
  for (let i = 0; i < 8; i++) {
    const fs = i % 2 ? 44100 : 48000, p1 = ext(), p2 = ext(), keys = [pick([21, 28, 36]), pick([48, 55, 60]), pick([84, 96, 108])];
    const ev = [...keys.map((k) => [0, 'on', k, rnd()]), [0.3, 'params', p2], [0.4, 'msg', { type: 'bend', value: pick([-1, 1]) }], [0.5, 'msg', { type: 'pressure', value: 1 }], ...keys.map((k) => [0.9, 'off', k])];
    const { L, R, e } = run(p1, ev, 2.6, { fs }); // (released at 0.9 s: every reed let go by 2.4 s)
    let pk = 0;
    for (let j = 0; j < L.length; j++) { assert.ok(Number.isFinite(L[j] + R[j]), `${fs}: NaN with ${JSON.stringify(p1)}`); pk = Math.max(pk, Math.abs(L[j])); }
    assert.ok(pk < 5, `${fs}: peak ${pk.toFixed(2)}`);
    assert.equal(e.voiceCount(), 0, `${fs}: voices still sounding after release with ${JSON.stringify(p2)}: ${JSON.stringify(e.voices())}`);
    assert.ok(rms(L, L.length - 0.1 * fs, L.length) < 1e-5, `${fs}: the tail ${rms(L, L.length - 0.1 * fs, L.length)}`);
  }
});

test('presets use their own parameters, and each speaks without NaN', () => {
  const ids = new Set(Object.keys(DEFAULTS));
  for (const pr of PRESETS) {
    for (const k of Object.keys(pr.p)) assert.ok(ids.has(k), `${pr.name}: ${k}`);
    const { L } = run(P(pr.p), [[0, 'on', 60, 0.8], [0, 'on', 67, 0.8]], 1);
    let pk = 0;
    for (const v of L) { assert.ok(Number.isFinite(v), pr.name); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.005, `${pr.name}: ${pk}`);
  }
});

test(`bends: the wheel (±2 semitones) and a key's own MPE bend (±${INSTRUMENT.mpe.bend}) run its reeds faster or slower, and they sound there (within 1 ¢); a bend of 1 changes nothing`, () => {
  const p = P({ bellows: 'blower' }), max = INSTRUMENT.mpe.bend;
  const bent = (st) => run(p, [[0, 'msg', { type: 'noteBend', key: 60, value: 2 ** (st / 12) }], [0, 'on', 60, 0.7]], 1.6).L;
  assert.deepEqual(bent(0), run(p, [[0, 'on', 60, 0.7]], 1.6).L);
  for (const st of [max, -max]) {
    const want = keyFreq(60) * 2 ** (st / 12), c = cents(freqAt(bent(st), want, 0.9 * FS, 1.6 * FS), want);
    assert.ok(Math.abs(c - cents(freqAt(bent(0), keyFreq(60), 0.9 * FS, 1.6 * FS), keyFreq(60))) < 1, `${st}: ${c.toFixed(2)} ¢`);
  }
  const { L } = run(p, [[0, 'msg', { type: 'bend', value: 1 }], [0, 'on', 60, 0.7]], 1.6), want = keyFreq(60) * 2 ** (2 / 12);
  assert.ok(Math.abs(cents(freqAt(L, want, 0.9 * FS, 1.6 * FS), want)) < 2, 'the wheel');
});

test('Quality: Medium and Low let fewer keys sound (16, 10, 6); a key\'s pitch and level stay', () => {
  const ref = {};
  for (const [q, cap] of [['high', 16], ['medium', 10], ['low', 6]]) {
    let live = 0;
    run(P({ fullRange: true }), Array.from({ length: 22 }, (_, i) => [0.1 * i, 'on', 40 + 2 * i, 0.7]), 3, { quality: q, tap: (e, t) => { if (t > 2.6) live = Math.max(live, e.voiceCount()); } });
    assert.equal(live, cap, `${q}: keys sounding`);
    const { L } = run(P({ bellows: 'blower' }), [[0, 'on', 60, 0.7]], 1.2, { quality: q });
    const f = freqAt(L, keyFreq(60), 0.6 * FS, 1.2 * FS), lvl = rms(L, 0.6 * FS, 1.2 * FS);
    if (q === 'high') Object.assign(ref, { f, lvl });
    assert.ok(Math.abs(cents(f, ref.f)) < 0.5 && Math.abs(lvl / ref.lvl - 1) < 0.02, `${q}: ${cents(f, ref.f).toFixed(2)} ¢, ${lvl} against ${ref.lvl}`);
  }
});

test('CPU: ten held keys on the 8′ and 4′ (20 reeds) with the hand bellows at 48 kHz in under 40 % of real time', () => {
  const e = new RegalEngine(FS);
  e.setParams(P({ regal4: true }));
  for (const k of [48, 52, 55, 60, 64, 67, 71, 72, 76, 79]) e.noteOn(k, 0.8);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let s = 0; s < 0.5 * FS; s += 128) e.process(L, R, 128);
  const sec = 3, t0 = performance.now();
  for (let s = 0; s < sec * FS; s += 128) e.process(L, R, 128);
  const load = (performance.now() - t0) / (sec * 1000);
  assert.ok(load < 0.4, `${(100 * load).toFixed(1)} % of real time`);
  console.log(`        (${(100 * load).toFixed(1)} % of real time)`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
