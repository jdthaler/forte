// Huygens keyboard checks. Run: node test/huygens-tests.mjs
// The engine and the model (tunedFreq, deltaOf, lockRatio) are the C++ (native/instruments/huygens),
// built as WebAssembly; sync-theory.js has the closed forms they are held to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INSTRUMENT } from '../huygens/src/huygens-instrument.js';
import { wasmModel } from '../huygens/src/huygens-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq, nearestRatio } from '../huygens/src/tuning.js';
import { DEFAULTS } from '../huygens/src/sync-params.js';
import { kickFor, tongue, captureBound } from '../huygens/src/sync-theory.js';
import { stairPoint, QMAX } from '../huygens/src/staircase.js';
import { FiringLog, pairLock } from '../huygens/src/lock-analysis.js';

const HuygensEngine = await loadEngine(INSTRUMENT);
const model = await wasmModel(), { tunedFreq, deltaOf, lockRatio } = model;

const FS = 48000;
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const c = (r) => 1200 * Math.log2(r);
const CIRCUIT = [DEFAULTS.vNom, DEFAULTS.vStrike, DEFAULTS.vExt];
const delta = (kick, circ = CIRCUIT) => deltaOf(kick, ...circ);
// deterministic "random" numbers in [0, 1)
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function run(keys, eng, sec = 2.5, P = DEFAULTS) {
  const e = new HuygensEngine(FS);
  e.setParams({ pitchHold: 0, ...eng });
  for (const k of keys) e.noteOn(k, 1, { f: tunedFreq(k, P) });
  const L = new Float32Array(128), R = new Float32Array(128);
  let pk = 0, finite = true;
  for (let s = 0; s < sec * FS; s += 128) {
    e.process(L, R, 128);
    for (const v of L) { if (!Number.isFinite(v)) finite = false; pk = Math.max(pk, Math.abs(v)); }
  }
  return { f: e.report(1.0).map((o) => o.f), pk, finite, e };
}

// Two lamps started together (as if they had just fired together), at fs:
// the interval they play (cents) after `sec`, exact if they lock (from the
// firing counts between shared firings), else a least-squares estimate.
function syncPair(f0, cents, kick, { fs = 24000, sec = 0.8, circuit = CIRCUIT } = {}) {
  const e = new HuygensEngine(fs);
  e.setParams({ kick, pitchHold: 0, vNom: circuit[0], vStrike: circuit[1], vExt: circuit[2] });
  const os = [e.noteOn(60, 1, { f: f0, phase: 0, settled: true }), e.noteOn(61, 1, { f: f0 * 2 ** (cents / 1200), phase: 0, settled: true })];
  const L = new Float32Array(64), R = new Float32Array(64), T = [[], []], seen = [0, 0];
  for (let s = 0; s < sec * fs; s += 64) {
    e.process(L, R, 64);
    os.forEach((o, i) => { for (; seen[i] < o.nf; seen[i]++) T[i].push(o.fires[seen[i] & 255]); });
  }
  const lk = pairLock(T[0], T[1], e.t, fs, 0.2);
  if (lk) return c(lk.p / lk.q);
  const [a, b] = e.report(sec * 0.6);
  return c(b.f / a.f);
}

console.log('the coupling, exactly');
await test('a kick fires exactly the lamps due within δ of a period, δ = ln[(S−V_s+K)/(S−V_s)] / ln[(S−V_e)/(S−V_s)]', () => {
  const r = rng(1);
  for (let i = 0; i < 200; i++) {
    const S = 100 + 300 * r(), vs = 70 + 30 * r(), ve = 40 + 25 * r(), kick = 0.15 * r();
    if (S <= vs + 5 || ve >= vs - 5) continue;
    const d = deltaOf(kick, S, vs, ve), g = Math.log((S - ve) / (S - vs)), K = kick * (vs - ve);
    const V = (phase) => S - (S - ve) * Math.exp(-phase * g);   // capacitor voltage, phase in periods
    assert.ok(Math.abs(V(1 - d) + K - vs) < 1e-9, 'window edge');
    assert.ok(V(1 - 0.999 * d) + K > vs && V(1 - 1.001 * d) + K < vs);
    assert.ok(Math.abs(kickFor(d, S, vs, ve) - kick) < 1e-12);
  }
});
await test('the tongue edges: p:q locks for (p − δ)/q ≤ f_hi/f_lo ≤ p/(q − δ)', () => {
  const d = 0.03;
  for (const [p, q] of [[1, 1], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [5, 3], [8, 5], [9, 8], [7, 4], [15, 8]]) {
    const [lo, hi] = tongue(p, q, d), is = (r) => { const x = lockRatio(r, d); return x.p === p && x.q === q; };
    assert.ok(is(lo * (1 + 1e-9)) && is(hi * (1 - 1e-9)) && is((p / q) * (1 + 1e-4)), `${p}:${q} inside`);
    assert.ok(!is(lo * (1 - 1e-6)) && !is(hi * (1 + 1e-6)), `${p}:${q} outside`);
  }
});
await test('the engine locks exactly where the tongue formula says (0.3 ¢ either side of an edge)', () => {
  const kick = 0.04, d = delta(kick), f0 = 261.6256;
  for (const [p, q, edge] of [[5, 4, 1], [3, 2, 0], [6, 5, 1], [7, 5, 0]]) {
    const e = tongue(p, q, d)[edge], sgn = edge ? -1 : 1;     // inward
    const inside = syncPair(f0, c(e) + sgn * 0.3, kick), outside = syncPair(f0, c(e) - sgn * 0.3, kick);
    assert.ok(Math.abs(inside - c(p / q)) < 0.01, `${p}:${q} inside: ${inside.toFixed(3)} ¢`);
    assert.ok(Math.abs(outside - c(p / q)) > 0.2, `${p}:${q} outside: ${outside.toFixed(3)} ¢`);
  }
});
await test('every interval locks to some p:q (q ≤ 1/δ), and the engine agrees with the map everywhere', () => {
  for (const kick of [0.02, DEFAULTS.kick]) {
    const d = delta(kick), r = rng(7);
    for (let i = 0; i < 2000; i++) { const x = lockRatio(1 + r(), d); assert.ok(x && x.q <= Math.ceil(1 / d), `q = ${x?.q}`); }
  }
  let worst = 0;
  for (let cents = 3; cents < 1200; cents += 29) {
    const x = lockRatio(2 ** (cents / 1200), delta(DEFAULTS.kick));
    worst = Math.max(worst, Math.abs(syncPair(261.6256, cents, DEFAULTS.kick) - c(x.p / x.q)));
  }
  assert.ok(worst < 1e-9, `worst ${worst} ¢`);
});
await test('supply and lamp voltages only rescale the coupling axis (same δ → same locks)', () => {
  const d = 0.05, A = [150, 90, 60], B = [320, 100, 72];
  const kA = kickFor(d, ...A), kB = kickFor(d, ...B);
  assert.ok(Math.abs(kA - kB) > 0.005, 'the two circuits need different kicks');
  for (const cents of [300, 400, 700, 1000, 1100]) {
    const a = syncPair(261.6256, cents, kA, { circuit: A }), b = syncPair(261.6256, cents, kB, { circuit: B });
    assert.ok(Math.abs(a - b) < 0.02, `${cents}: ${a.toFixed(3)} vs ${b.toFixed(3)} ¢`);
  }
});
await test('the map is deterministic and finds the fifth and fourth from 0.28 %, and 16:9, 16:15 and 17:9', () => {
  const P = { ...DEFAULTS, rSrc: 0 }, at = (cents, kick) => stairPoint(P, cents, kick, model)[1];
  for (const kick of [0.003, 0.0075, 0.02]) { assert.equal(at(700, kick), 302); assert.equal(at(500, kick), 403); }
  const k5 = kickFor(3 - 2 * 2 ** (7 / 12), ...CIRCUIT);
  assert.ok(k5 > 0.0027 && k5 < 0.0028, `the ET fifth locks from ${(100 * k5).toFixed(3)} %`);
  assert.equal(at(1000, DEFAULTS.kick), 1609);                 // the ET minor seventh: 16:9
  assert.equal(at(1100, 0.02), 1709);                          // the ET major seventh: 17:9
  assert.equal(at(111.7, 0.0435), 1615);                       // 16:15 has a tongue too
  assert.ok(QMAX >= 17);
});

console.log('oscillators');
await test('analytic firing times: an uncoupled oscillator plays its design pitch exactly', () => {
  for (const k of [36, 60, 96]) {
    const { f } = run([k], { kick: 0 });
    assert.ok(Math.abs(c(f[0] / keyFreq(k))) < 0.01, `${k}: ${c(f[0] / keyFreq(k))} ¢`);
  }
});
await test('uncoupled ET intervals keep their ET values', () => {
  const { f } = run([60, 64, 67], { kick: 0 });
  assert.ok(Math.abs(c(f[1] / f[0]) - 400) < 0.05 && Math.abs(c(f[2] / f[0]) - 700) < 0.05);
});

console.log('locking');
await test('pulse coupling locks simple ratios: fifth, major third, harmonic seventh', () => {
  const lock = (k2, p, q, kick) => { const { f } = run([60, k2], { kick }); return c(f[1] / f[0] / (p / q)); };
  assert.ok(Math.abs(lock(67, 3, 2, 0.02)) < 0.3, 'fifth');
  assert.ok(Math.abs(lock(64, 5, 4, 0.06)) < 0.3, 'third');
  assert.ok(Math.abs(lock(70, 7, 4, 0.1)) < 0.4, 'harmonic seventh');
});
await test('minor second stays apart at 4% and merges into a unison at 6%; the ET tritone finds 7:5', () => {
  const { f } = run([60, 61], { kick: 0.04 });
  const nr = nearestRatio(f[1] / f[0], 9);
  assert.ok(Math.abs(nr.cents) > 1, `minor second sits ${nr.cents.toFixed(2)} ¢ from ${nr.p}:${nr.q}`);
  const m = run([60, 61], { kick: 0.06 }).f;
  assert.ok(Math.abs(c(m[1] / m[0])) < 0.3, 'unison capture');
  const t = run([60, 66], { kick: 0.08 }).f;
  assert.ok(Math.abs(c(t[1] / t[0] / 1.4)) < 0.3, 'septimal tritone');
});
await test('weak coupling captures fifths before thirds (tongue width falls with ratio complexity)', () => {
  const { f: a } = run([60, 67], { kick: 0.015 });
  const { f: b } = run([60, 64], { kick: 0.015 });
  assert.ok(Math.abs(c(a[1] / a[0] / 1.5)) < 0.3);
  assert.ok(Math.abs(c(b[1] / b[0] / 1.25)) > 5);
});
await test('mistuned keys are captured anyway', () => {
  const P = { ...DEFAULTS, mistune: 25 };
  const { f } = run([60, 64, 67], { kick: 0.08 }, 3, P);
  assert.ok(Math.abs(c(f[1] / f[0] / 1.25)) < 0.4 && Math.abs(c(f[2] / f[0] / 1.5)) < 0.4, `${c(f[1] / f[0] / 1.25)}, ${c(f[2] / f[0] / 1.5)}`);
});
await test('pitch-hold servo keeps a locked chord at pitch; intervals stay locked', () => {
  const free = run([60, 64, 67, 70], { kick: 0.09, pitchHold: 0 }, 3);
  const held = run([60, 64, 67, 70], { kick: 0.09, pitchHold: 1 }, 3);
  const mean = (f) => [60, 64, 67, 70].reduce((s, k, i) => s + c(f[i] / keyFreq(k)), 0) / 4;
  assert.ok(mean(free.f) > 10 && Math.abs(mean(held.f)) < 2, `free ${mean(free.f).toFixed(1)} ¢, held ${mean(held.f).toFixed(1)} ¢`);
  assert.ok(Math.abs(c(held.f[1] / held.f[0] / 1.25)) < 0.4);
  console.log(`        4:5:6:7 chord: ${mean(free.f).toFixed(1)} ¢ sharp without the servo, ${mean(held.f).toFixed(1)} ¢ with it`);
});
await test('the outer keys play their design pitch; the servo hears A0 (four firings in its 120 ms window) and holds a bass chord on it', () => {
  for (const k of [21, 22, 108]) {
    const r = run([k], { kick: 0 }, 1.5);
    assert.ok(r.finite && r.pk > 0.01 && Math.abs(c(r.f[0] / keyFreq(k))) < 0.5, `key ${k}: ${r.f[0]} Hz, peak ${r.pk}`);
    const f = r.e.report(0.12)[0].f; // what the servo measures
    assert.ok(Math.abs(c(f / keyFreq(k))) < 1, `key ${k}: the servo's 120 ms reads ${f} Hz`);
  }
  const keys = [21, 25, 28, 31]; // 4:5:6:7 on A0
  const free = run(keys, { kick: 0.09, pitchHold: 0 }, 4), held = run(keys, { kick: 0.09, pitchHold: 1 }, 4);
  const mean = (f) => keys.reduce((s, k, i) => s + c(f[i] / keyFreq(k)), 0) / 4;
  assert.ok(mean(free.f) > 10 && Math.abs(mean(held.f)) < 2, `free ${mean(free.f).toFixed(1)} ¢, held ${mean(held.f).toFixed(1)} ¢`);
});

console.log('the default coupling');
await test('no coupling locks 8:5 and keeps semitones apart; the default locks 8:5 (a bare semitone merges)', () => {
  const m6 = kickFor(8 - 5 * 2 ** (8 / 12), ...CIRCUIT), m2 = kickFor(1 - 2 ** (-1 / 12), ...CIRCUIT);
  assert.ok(m6 > m2, `minor sixth needs ${(100 * m6).toFixed(2)} %, semitones merge from ${(100 * m2).toFixed(2)} %`);
  assert.ok(DEFAULTS.kick > m6 + 0.002, `default ${DEFAULTS.kick}`);
  const x = lockRatio(2 ** (1 / 12), delta(DEFAULTS.kick));
  assert.ok(x.p === 1 && x.q === 1);
});
await test('at the default every voicing of the major and minor triads goes just, in every register', () => {
  const J = { 0: 1, 3: 6 / 5, 4: 5 / 4, 5: 4 / 3, 7: 3 / 2, 12: 2, 16: 5 / 2 };
  const V = [[0, 4, 7], [0, 4, 7, 12], [4, 7, 12], [7, 12, 16], [0, 7, 16], [0, 3, 7], [0, 3, 7, 12], [0, 7, 12], [0, 5, 7]];
  const r = rng(3), fs = 24000;
  const just = (keys, iv, kick) => {
    const e = new HuygensEngine(fs); e.setParams({ kick, pitchHold: 1 });
    for (const k of keys) e.noteOn(k, 1, { f: keyFreq(k), phase: r() });
    const L = new Float32Array(256), R = new Float32Array(256);
    for (let s = 0; s < 6 * fs; s += 256) e.process(L, R, 256);
    const f = e.report(1.5).map((o) => o.f);
    let w = 0;
    for (let i = 1; i < iv.length; i++) w = Math.max(w, Math.abs(c(f[i] / f[0]) - c(J[iv[i]] / J[iv[0]])));
    return w;
  };
  for (const iv of V) for (const root of [36, 48, 60, 72]) {
    const w = just(iv.map((x) => root + x), iv, DEFAULTS.kick);
    assert.ok(w < 0.5, `${iv} on ${root}: ${w.toFixed(2)} ¢ from just`);
  }
  // the old default, 4.5 %, could not lock C–E–G–C′: E–C′ (8:5) is outside its tongue
  assert.ok(just([60, 64, 67, 72], [0, 4, 7, 12], 0.045) > 10);
});

await test('chords: a dominant seventh settles into a long 67:85:100:120 pattern at the default, 4:5:6:7 at 7 %', () => {
  const chord = (kick, root, phases) => {
    const fs = 24000, e = new HuygensEngine(fs); e.setParams({ kick, pitchHold: 1 });
    const keys = [root, root + 4, root + 7, root + 10], log = new FiringLog(3);
    keys.forEach((k, i) => e.noteOn(k, 1, { f: keyFreq(k), phase: phases[i] }));
    const L = new Float32Array(256), R = new Float32Array(256), fb = new Float64Array(32 * 258), ob = new Float64Array(96);
    for (let s = 0; s < 8 * fs; s += 256) {
      e.process(L, R, 256);
      log.ingest({ t: e.t, fs, hold: e.hold, osc: ob.slice(0, e.summary(ob)), fires: fb.slice(0, e.drainFirings(fb)) });
    }
    return log.analyze().pairs.slice(0, 3).map((p) => p.lock && `${p.lock.p}:${p.lock.q}`).join(' ');
  };
  for (const root of [48, 60]) {
    assert.equal(chord(DEFAULTS.kick, root, [0.1, 0.3, 0.6, 0.9]), '85:67 100:67 120:67', `root ${root}`);
    assert.equal(chord(0.07, root, [0.2, 0.7, 0.4, 0.1]), '5:4 3:2 7:4', `root ${root}`);
  }
});

console.log('capture');
await test('a pair locks within one beat of its ratio: t ≤ (1 − δ(p+q))/|p f_lo − q f_hi| + (q+1)/f_lo', () => {
  const d = delta(DEFAULTS.kick), fs = 24000;
  const capture = (k1, k2, ph1, ph2) => {
    const e = new HuygensEngine(fs); e.setParams({ kick: DEFAULTS.kick, pitchHold: 1 });
    const a = e.noteOn(k1, 1, { f: keyFreq(k1), phase: ph1, settled: true }), b = e.noteOn(k2, 1, { f: keyFreq(k2), phase: ph2, settled: true });
    const L = new Float32Array(64), R = new Float32Array(64);
    let sa = 0, sb = 0;
    for (let s = 0; s < 5 * fs; s += 64) {
      e.process(L, R, 64);
      const A = [];
      for (; sa < a.nf; sa++) A.push(a.fires[sa & 255]);
      for (; sb < b.nf; sb++) if (A.includes(b.fires[sb & 255])) return b.fires[sb & 255] / fs;
    }
    return Infinity;
  };
  for (const [k1, k2, p, q] of [[36, 43, 3, 2], [60, 67, 3, 2], [36, 40, 5, 4], [48, 53, 4, 3]]) {
    const bound = captureBound(p, q, keyFreq(k1), keyFreq(k2), d);
    let worst = 0;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) worst = Math.max(worst, capture(k1, k2, i / 8, (j + 0.5) / 8));
    assert.ok(worst <= bound && worst > 0.6 * bound, `${k1}–${k2}: worst ${worst.toFixed(3)} s, bound ${bound.toFixed(3)} s`);
    if (k1 === 36 && p === 3) assert.ok(bound > 2.5, 'the bass fifth takes seconds');
  }
});

console.log('sound');
await test('key release: no low thump (output keyed, then a coupling capacitor)', () => {
  for (const key of [36, 60, 84]) {
    const e = new HuygensEngine(FS); e.setParams({ kick: 0, pitchHold: 1 });
    e.noteOn(key, 1, { f: keyFreq(key) });
    const n = FS * 1.5, off = FS - (FS % 128), out = new Float64Array(n), L = new Float32Array(128), R = new Float32Array(128);
    for (let s = 0; s < n; s += 128) { if (s === off) e.noteOff(key); e.process(L, R, 128); out.set(L.subarray(0, Math.min(128, n - s)), s); }
    let pk = 0, mean = 0;
    for (let i = off - 0.3 * FS; i < off; i++) { pk = Math.max(pk, Math.abs(out[i])); mean += out[i]; }
    mean /= 0.3 * FS;
    const a = Math.exp((-2 * Math.PI * 40) / FS);              // what is left below 40 Hz
    let y = 0, held = 0, after = 0;
    for (let i = 0; i < n; i++) { y = a * y + (1 - a) * out[i]; if (i > off - 0.3 * FS && i < off) held = Math.max(held, Math.abs(y)); if (i >= off) after = Math.max(after, Math.abs(y)); }
    assert.ok(Math.abs(mean) < 0.01 * pk, `key ${key}: DC ${(mean / pk).toFixed(3)}`);
    assert.ok(after < held * 1.4, `key ${key}: below 40 Hz, ${(20 * Math.log10(after / pk)).toFixed(1)} dB after release vs ${(20 * Math.log10(held / pk)).toFixed(1)} dB held`);
    assert.equal(e.osc.length, 0, 'switched off once silent');
  }
});
await test('stereo spread follows the knob for notes already sounding', () => {
  const e = new HuygensEngine(FS);
  const o = e.noteOn(84, 1, { f: keyFreq(84) });
  const before = o.panR / o.panL;
  e.setParams({ width: 0 });
  assert.ok(before > 1.2 && Math.abs(o.panR / o.panL - 1) < 1e-12);
});

console.log('page');
await test('the worklet posts at most 30 states a second, each with only the new firings', async () => {
  const sent = [];
  globalThis.sampleRate = FS;
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: (m) => sent.push(m) }; } };
  let Proc = null;
  globalThis.registerProcessor = (name, cls) => { if (name === 'forte-processor') Proc = cls; };
  await import('../shared/worklet.js');
  const p = new Proc({ processorOptions: { wasm: { name: INSTRUMENT.wasm.name, bytes: readFileSync(new URL(INSTRUMENT.wasm.binary)) } } });
  for (const k of [48, 52, 55, 60, 64, 67, 70, 72, 76, 79, 84, 88]) p.handle({ type: 'noteOn', key: k, velocity: 1, data: { f: keyFreq(k) } });
  const out = [[new Float32Array(128), new Float32Array(128)]];
  const blocks = 2 * FS / 128;
  for (let i = 0; i < blocks; i++) p.process([], out);
  const states = sent.filter((m) => m.type === 'state');
  assert.ok(states.length <= 61, `${states.length} states in 2 s`);
  let delivered = 0, bytes = 0;
  for (const m of states) { bytes += m.fires.byteLength + m.osc.byteLength; for (let i = 0; i < m.fires.length; i += 2 + m.fires[i + 1]) delivered += m.fires[i + 1]; }
  const fired = p.engine.osc.reduce((s, o) => s + o.nf, 0);
  assert.ok(fired - delivered >= 0 && fired - delivered < 0.05 * fired, `${delivered} of ${fired} firings delivered`);
  console.log(`        ${(states.length / 2).toFixed(0)} states/s, ${(bytes / states.length / 1024).toFixed(1)} kB each (12 notes)`);
});
await test('lock display: a locked bass triad reads locked in every update; an unlocked chord never', () => {
  const view = (keys, kick, phases, sec = 8, from = 4) => {
    const e = new HuygensEngine(FS); e.setParams({ kick, pitchHold: 1 });
    keys.forEach((k, i) => e.noteOn(k, 1, { f: keyFreq(k), phase: phases[i] }));
    const L = new Float32Array(128), R = new Float32Array(128), fb = new Float64Array(32 * 258), ob = new Float64Array(96);
    const log = new FiringLog(3), every = Math.ceil(FS / 128 / 30), seen = [];
    for (let b = 0; b * 128 < sec * FS; b++) {
      e.process(L, R, 128);
      if (b % every) continue;
      log.ingest({ t: e.t, fs: FS, hold: e.hold, osc: ob.slice(0, e.summary(ob)), fires: fb.slice(0, e.drainFirings(fb)) });
      if (b * 128 > from * FS && b % (4 * every) === 0) seen.push(log.analyze());
    }
    return { seen, truth: e.report(2.5).map((o) => o.f) };
  };
  const r = rng(11);
  for (let trial = 0; trial < 3; trial++) {
    const { seen } = view([36, 40, 43], DEFAULTS.kick, [r(), r(), r()]);
    const ok = seen.filter((a) => a.pairs.length === 3 && a.pairs.every((p) => p.lock)).length;
    assert.equal(ok, seen.length, `C2 triad read locked in ${ok}/${seen.length} updates`);
    const [ce, cg, eg] = seen.at(-1).pairs.map((p) => `${p.lock.p}:${p.lock.q}`);
    assert.deepEqual([ce, cg, eg], ['5:4', '3:2', '6:5']);
  }
  const free = view([48, 52, 55], 0, [0.1, 0.5, 0.9], 3, 1).seen;
  assert.ok(free.every((a) => a.pairs.every((p) => !p.lock)), 'uncoupled');
  // a dominant seventh at the default settles into one long pattern; the display must not claim 9:5
  const { seen: dom, truth } = view([48, 52, 55, 58], DEFAULTS.kick, [0.2, 0.4, 0.6, 0.8], 10, 6);
  for (const a of dom) for (const p of a.pairs) if (p.lock) {
    const i = [48, 52, 55, 58].indexOf(p.a.key), j = [48, 52, 55, 58].indexOf(p.b.key);
    const err = c(truth[j] / truth[i] / (p.lock.p / p.lock.q));
    assert.ok(Math.abs(err) < 0.5, `${p.a.key}–${p.b.key} shown ${p.lock.p}:${p.lock.q}, off by ${err.toFixed(2)} ¢`);
  }
});

await test('the design tuning: equal temperament; 5-limit just above the tonic; a mistuning fixed for each key, within the setting', () => {
  const JUST = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
  for (let k = INSTRUMENT.range[0]; k <= INSTRUMENT.range[1]; k++) {
    assert.ok(Math.abs(c(tunedFreq(k, DEFAULTS) / keyFreq(k))) < 1e-9, `key ${k}`);
    for (const tonic of [0, 5, 11]) {
      const deg = (((k - tonic) % 12) + 12) % 12, f = tunedFreq(k, { ...DEFAULTS, tuning: 'just', tonic });
      assert.ok(Math.abs(c(f / (keyFreq(k - deg) * JUST[deg]))) < 1e-9, `key ${k}, tonic ${tonic}`);
    }
  }
  const P = { ...DEFAULTS, mistune: 33.5 }, dev = [];
  for (let k = INSTRUMENT.range[0]; k <= INSTRUMENT.range[1]; k++) { const d = c(tunedFreq(k, P) / keyFreq(k)); assert.ok(Math.abs(d) <= 33.5 && tunedFreq(k, P) === tunedFreq(k, { ...P }), `key ${k}: ${d}`); dev.push(Math.abs(d)); }
  assert.ok(Math.max(...dev) > 25 && new Set(dev.map((d) => d.toFixed(3))).size > 50, 'every key its own');
});
await test('the keyboard\'s tuning, on top of the lamps\': uncoupled, the engine\'s own E4 at A = 415 Hz is 101.27 ¢ low; in ¼-comma meantone E4 −3.42 ¢, C4 +10.26 ¢, A4 at 440 Hz; with just intonation each key takes both, and the page\'s design frequency is the engine\'s', () => {
  const play = (k, o) => {
    const e = new HuygensEngine(FS), L = new Float32Array(128), R = new Float32Array(128);
    e.setParams({ ...DEFAULTS, pitchHold: 0, kick: 0, ...o });
    e.noteOn(k, 1); // no note data: the engine's own tuning
    for (let s = 0; s < 1.5 * FS; s += 128) e.process(L, R, 128);
    return e.report(1.0)[0].f;
  };
  const JUST = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
  for (const [o, k, want] of [[{ pitch: 415 }, 64, keyFreq(64) * 415 / 440], [{ temperament: 'meantone' }, 64, keyFreq(64) * 2 ** (-3.42 / 1200)],
    [{ temperament: 'meantone' }, 60, keyFreq(60) * 2 ** (10.26 / 1200)], [{ temperament: 'meantone' }, 69, 440],
    [{ tuning: 'just', pitch: 415 }, 64, keyFreq(60) * JUST[4] * 415 / 440]]) {
    assert.ok(Math.abs(c(play(k, o) / want)) < 0.01, `${JSON.stringify(o)}, key ${k}: ${c(play(k, o) / want).toFixed(3)} ¢`);
    assert.ok(Math.abs(c(tunedFreq(k, { ...DEFAULTS, ...o }) / want)) < 0.01, `${JSON.stringify(o)}, key ${k}: the page's design frequency`);
  }
});
await test('the lock map: with the supply\'s sag vanishing, the simulated points (the engine) find the exact map\'s locks; with sag, they are reproducible', () => {
  const P = { ...DEFAULTS, rSrc: 0 };
  for (let cents = 0; cents <= 1200; cents += 37) {
    const exact = stairPoint(P, cents, 0.04, model), sim = stairPoint({ ...P, rSrc: 1e-6 }, cents, 0.04, model);
    assert.ok(sim[1] === exact[1] && Math.abs(sim[0] - exact[0]) < 0.05, `${cents} ¢: ${sim} vs ${exact}`);
  }
  const sag = { ...P, rSrc: 150e3 };
  for (const cents of [386, 700, 1000]) assert.deepEqual(stairPoint(sag, cents, 0.05, model), stairPoint(sag, cents, 0.05, model));
});

console.log('robustness');
await test('finite output and sane level across settings', () => {
  for (const eng of [{ kick: 0.15, rSrc: 200e3 }, { kick: 0, vNom: 400 }, { kick: 0.1, vNom: 100, vStrike: 95, vExt: 85, drift: 20, driftRate: 2 }]) {
    const r = run([21, 36, 48, 55, 60, 64, 67, 70, 72, 84, 96, 108], eng, 0.8);
    assert.ok(r.finite && r.pk < 5, JSON.stringify(eng));
  }
});
await test('Quality: nothing to trim (every lamp kicks every other, so leaving one out would move where they lock): Medium and Low play 24 coupled lamps exactly as High', () => {
  const render = (quality) => {
    const e = new HuygensEngine(FS); e.setQuality(quality); e.setParams({ kick: 0.08 });
    for (let i = 0; i < 24; i++) e.noteOn(36 + 2 * i, 1, { f: keyFreq(36 + 2 * i) });
    const L = new Float32Array(128), R = new Float32Array(128), out = new Float32Array(0.5 * FS);
    for (let s = 0; s < out.length; s += 128) { e.process(L, R, 128); out.set(L.subarray(0, Math.min(128, out.length - s)), s); }
    return out;
  };
  const hi = render('high');
  for (const quality of ['medium', 'low']) { const q = render(quality); for (let i = 0; i < hi.length; i++) if (q[i] !== hi[i]) throw new Error(`${quality} differs at sample ${i}`); }
});
await test('performance: 24 oscillators', () => {
  const e = new HuygensEngine(FS); e.setParams({ kick: 0.08 });
  for (let i = 0; i < 24; i++) e.noteOn(36 + 2 * i, 1, { f: keyFreq(36 + 2 * i) });
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let i = 0; i < 50; i++) e.process(L, R, 128);
  const blocks = 2000, t0 = performance.now();
  for (let i = 0; i < blocks; i++) e.process(L, R, 128);
  const ms = performance.now() - t0, audio = (blocks * 128 * 1000) / FS;
  console.log(`        ${(100 * ms / audio).toFixed(1)} % of one core`);
  assert.ok(ms < 0.4 * audio);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
