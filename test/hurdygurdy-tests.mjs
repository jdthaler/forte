// Hurdy-Gurdy checks: the strings, the tangents, the chien and the board against their physics,
// then the engine against the model. Run: node test/hurdygurdy-tests.mjs
//
// Both are the C++ (native/instruments/hurdygurdy), built as WebAssembly: the model's functions
// through hurdygurdy-wasm.js. The independent checks (Mersenne's law, Schelleng's bounds, the
// chien's free flight and bounce, the plate) are worked out here.

import assert from 'node:assert/strict';
import { INSTRUMENT, DEFAULTS, PRESETS, GROUPS } from '../hurdygurdy/src/hurdygurdy-instrument.js';
import { RANGE } from '../hurdygurdy/src/hurdygurdy-params.js';
import { wasmModel } from '../hurdygurdy/src/hurdygurdy-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { fft } from '../tools/audio-util.mjs';
import { tunedFreq } from '../shared/tuning.js';

const Engine = await loadEngine(INSTRUMENT);
const M = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (± ${tol})`);
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name) => P(PRESETS.find((p) => p.name.startsWith(name)).p);
const cents = (a, b) => 1200 * Math.log2(a / b);
const keyFreq = (k) => 440 * 2 ** ((k - 69) / 12);
const CH1 = 0, TROMP = 2, MOUCHE = 3, PETIT = 4, GROS = 5;
const quiet = { uneven: 0, chanterelles: false, trompette: false, mouche: false, petit: false, gros: false };
const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);

function engine(params, quality, fs = FS) {
  const e = new Engine(fs);
  if (quality) e.setQuality(quality);
  e.setParams(params);
  return e;
}
// Run an engine for sec seconds, 128-sample blocks like the AudioWorklet; returns both channels.
// each(e, i) is called after every block.
function run(e, sec, fs = FS, each) {
  const n = Math.round(sec * fs), L = new Float32Array(n), R = new Float32Array(n);
  for (let s = 0, i = 0; s < n; s += bl, i++) { e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s); R.set(bR.subarray(0, Math.min(bl, n - s)), s); each?.(e, i); }
  return [L, R];
}
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
// The spectral peak nearest f (within 3 %), Hann-windowed, zero-padded and interpolated.
function peakFreq(x, f, fs = FS) {
  const N = 1 << 18, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < x.length && i < N; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / x.length));
  fft(re, im);
  const mag = (k) => Math.hypot(re[k], im[k]);
  let best = Math.round((f * 0.97 * N) / fs);
  for (let k = best; k <= Math.round((f * 1.03 * N) / fs); k++) if (mag(k) > mag(best)) best = k;
  const a = Math.log(mag(best - 1)), b = Math.log(mag(best)), c = Math.log(mag(best + 1));
  return ((best + (0.5 * (a - c)) / (a - 2 * b + c)) * fs) / N;
}
// slips per period of string id over sec seconds of e
function slipsPerPeriod(e, id, sec) {
  const a = e.string(id);
  run(e, sec);
  const b = e.string(id);
  return (b.slips - a.slips) / ((b.steps - a.steps) / (FS * b.os)) / b.f0;
}
// the chien's landings per second over sec seconds
function landings(e, sec) { const h = e.crank.hits; run(e, sec); return (e.crank.hits - h) / sec; }

console.log('the strings and the tangents');
test('every string obeys Mersenne\'s law at its note, in tension a gut string bears (25–60 N, well under gut\'s breaking stress)', () => {
  for (let id = 0; id < 6; id++) {
    const s = M.stringDesign(id, P());
    near(s.f, (1 / (2 * s.L)) * Math.sqrt(s.T / s.mu), 1e-9 * s.f, `${id}: f = √(T/μ)/2L`);
    near(s.Z0, Math.sqrt(s.T * s.mu), 1e-12, `${id}: Z₀ = √(Tμ)`);
    assert.ok(s.T > 25 && s.T < 60, `${id}: T = ${s.T.toFixed(1)} N`);
    if (!s.wound) { const d = Math.sqrt((4 * s.mu) / (Math.PI * 1300)); assert.ok(s.T / ((Math.PI * d * d) / 4) < 200e6, `${id}: stress`); }
  }
  near(cents(M.stringDesign(1, P()).f, M.stringDesign(0, P()).f), DEFAULTS.unison, 1e-6, 'the second chanterelle, unison cents sharp');
  for (const [id, key] of [[TROMP, 62], [MOUCHE, 55], [PETIT, 48], [GROS, 43]]) assert.equal(M.stringDesign(id, P()).key, key, `${id}'s note`);
  assert.equal(M.stringDesign(TROMP, P({ tromNote: 'c4' })).key, 60, 'the trompette retuned');
});
test('the tangents: each key stops the chanterelles at L·f_open/f_key (a semitone a step, G6 at a quarter), turned by at most 60 ¢; the wheel sits further along the shorter string', () => {
  const L = M.stringDesign(0, P()).L;
  assert.equal(M.stopLength(RANGE[0], P()), L, 'open');
  for (let k = RANGE[0] + 1; k <= RANGE[1]; k++) {
    const Ls = M.stopLength(k, P()), turned = cents(L / Ls, keyFreq(k) / keyFreq(RANGE[0]));
    assert.ok(turned > -2 && turned < 60, `key ${k}: ${turned.toFixed(1)} ¢`);
    near(M.loop(0, P(), { Ls }).beta, DEFAULTS.wheelPos / Ls, 1e-12, `β at ${k}`);
  }
  near(M.stopLength(RANGE[1], P()) / L, 0.25, 0.25 * 0.03, 'G6, two octaves up');
  assert.ok(M.loop(0, P(), { Ls: M.stopLength(RANGE[1], P()) }).beta < 0.4, 'the top tangent stays well short of the wheel');
});
test('Schelleng: the force each string bears on the wheel lies between F_min and F_max (2Z₀(v_B + βv₀)/(Δμ β)) at the default speed, on every key', () => {
  const D = P(), vB = Math.PI * M.WHEEL_D * D.crank, dmu = D.mus - D.mud;
  for (let id = 0; id < 6; id++) {
    const keys = id <= 1 ? Array.from({ length: RANGE[1] - RANGE[0] + 1 }, (_, i) => RANGE[0] + i) : [0];
    for (const k of keys) {
      const s = M.stringDesign(id, D), lp = M.loop(id, D, { Ls: id <= 1 ? M.stopLength(k, D) : 0 });
      near(lp.Fmax, (2 * s.Z0 * (vB + lp.beta * D.v0)) / (dmu * lp.beta), 1e-9 * lp.Fmax, `${id} ${k}: F_max`);
      const F = M.voiced(id);
      assert.ok(F > 2 * lp.Fmin && F < lp.Fmax, `${id} ${k}: ${F.toFixed(3)} N in ${lp.Fmin.toFixed(3)}…${lp.Fmax.toFixed(3)}`);
    }
  }
});

console.log('the chien and the board');
test('the chien at rest: under a pull below the tirant it stays on the board, which pushes back with F_t − F', () => {
  for (const F of [0, 1, 2.5]) {
    const r = M.chien({ force: F, Ft: 2.7, m: 0.0012, e: 0.35, sec: 0.05, y0: -(2.7 - F) / M.CHIEN_K });
    assert.equal(r.hits, 0, `F ${F}`);
    for (let i = r.y.length - 100; i < r.y.length; i++) assert.ok(r.y[i] <= 0, `F ${F}: stays down`);
    near(r.c[r.c.length - 1], 2.7 - F, 0.01 * 2.7, `F ${F}: contact force`);
  }
});
test('the chien in flight: a pull ΔF above the tirant lifts it as y = ΔF t²/2m, and it falls back under the tirant as a projectile, to bounce', () => {
  const m = 0.0012, Ft = 2.7, dF = 0.8, dt = 1 / 192000;
  const r = M.chien({ force: (t) => (t < 0.002 ? Ft + dF : 0), Ft, m, e: 0.35, sec: 0.006, dt, y0: 0 });
  for (const t of [0.0005, 0.001, 0.002]) near(r.y[Math.round(t / dt) - 1], (dF * t * t) / (2 * m), 0.02 * (dF * t * t) / (2 * m), `lift at ${t * 1000} ms`);
  // then F = 0: a projectile under F_t from y₁ at speed v₁ lands at the root of y₁ + v₁τ − F_t τ²/2m
  const y1 = (dF * 0.002 ** 2) / (2 * m), v1 = (dF * 0.002) / m, a = Ft / m, tau = (v1 + Math.sqrt(v1 * v1 + 2 * a * y1)) / a;
  const land = r.y.findIndex((y, i) => i * dt > 0.002 && y < 0) * dt;
  near(land, 0.002 + tau, 2e-5, 'lands');
  assert.ok(r.hits >= 2, `it lands, and bounces (${r.hits} landings)`);
});
test('the chien\'s bounce: dropped on the board it rebounds with its coefficient of restitution', () => {
  for (const e of [0.2, 0.35, 0.7]) {
    const dt = 1 / 192000, r = M.chien({ force: 0, Ft: 1e-9, m: 0.0012, e, sec: 0.002, dt, y0: 1e-6, v0: -0.05 });
    const up = r.y.findIndex((y, i) => i > 10 && y > 2e-6);
    assert.ok(up > 0, `e ${e}: it bounces`);
    near((r.y[up + 20] - r.y[up]) / (20 * dt) / 0.05, e, 0.04, `e ${e}`);
  }
});
test('the board: its point admittance is Cremer and Heckl\'s Y∞ = 1/(8√(ρh)(D_x D_y)^¼), its first mode the orthotropic plate\'s, below the open strings', () => {
  const rhoH = 420 * 0.003, Dx = 60, Dy = 8, a = 0.32, b = 0.24;
  near(M.yinf(), 1 / (8 * Math.sqrt(rhoH) * (Dx * Dy) ** 0.25), 1e-12, 'Y∞');
  const modes = M.boardModes(4000);
  near(modes[0].f, (Math.PI / 2) * (Math.sqrt(Dx) / a ** 2 + Math.sqrt(Dy) / b ** 2) / Math.sqrt(rhoH), 1e-9, 'f₁₁');
  assert.ok(modes.length >= 20 && modes.length <= 96, `${modes.length} modes below 4 kHz`);
});
test('a coup: a sin² surge 70 ms long, at each of N points a turn', () => {
  const r = 1.2, N = 2, w = 0.07 * r * N;
  near(M.coupShape(w / 2, N, r), 1, 1e-12, 'peak');
  assert.equal(M.coupShape(w * 1.01, N, r), 0, 'over');
  assert.equal(M.coupShape(0.5, 0, r), 0, 'none');
  near(M.coupShape(0.4, 1, 20), Math.sin((Math.PI * 0.4) / 0.8) ** 2, 1e-12, 'at most 80 % of a slot');
});

console.log('the engine');
test('tuning: every key on the chanterelles and every drone sounds its note within 3 ¢, at 48 and 44.1 kHz', () => {
  for (const fs of [48000, 44100]) {
    for (let k = RANGE[0]; k <= RANGE[1]; k += fs === 48000 ? 1 : 4) {
      const e = engine(P({ ...quiet, chanterelles: true, unison: 0 }), null, fs);
      e.noteOn(k, 0.5);
      const [L] = run(e, 2.6, fs);
      near(cents(peakFreq(L.subarray(Math.round(1.0 * fs)), keyFreq(k), fs), keyFreq(k)), 0, 3, `key ${k} at ${fs}`);
    }
  }
  for (const [o, key] of [[{ trompette: true }, 62], [{ trompette: true, tromNote: 'c4' }, 60], [{ mouche: true }, 55], [{ petit: true }, 48], [{ gros: true }, 43]]) {
    const e = engine(P({ ...quiet, ...o, keep: true, tirant: 8 }));
    const [L] = run(e, 1.8);
    near(cents(peakFreq(L.subarray(Math.round(0.8 * FS)), keyFreq(key)), keyFreq(key)), 0, 3, JSON.stringify(o));
  }
});
test('the keyboard\'s tuning moves the chanterelles and the drones alike (A = 415 Hz: a semitone flat)', () => {
  const D415 = P({ ...quiet, chanterelles: true, unison: 0, pitch: 415 }), e = engine(D415);
  e.noteOn(74, 0.5);
  const [L] = run(e, 2.6), f = tunedFreq(D415, 74);
  near(cents(peakFreq(L.subarray(Math.round(1.0 * FS)), f), f), 0, 3, 'D5 at 415');
  near(cents(M.stringDesign(GROS, D415).f, M.stringDesign(GROS, P()).f), cents(415, 440), 1e-6, 'the gros bourdon');
});
test('the highest key held is the note; letting it go falls back to the next; with none held, Keep turning plays the open G4', () => {
  const e = engine(P({ ...quiet, chanterelles: true, keep: true }));
  e.noteOn(72, 0.5); run(e, 0.1);
  e.noteOn(79, 0.5); run(e, 0.1);
  assert.equal(e.crank.melody, 79);
  e.noteOn(76, 0.5); run(e, 0.1);
  assert.equal(e.crank.melody, 79, 'a lower key under it changes nothing');
  e.noteOff(79); run(e, 0.1);
  assert.equal(e.crank.melody, 76);
  e.noteOff(76); e.noteOff(72); run(e, 0.1);
  assert.equal(e.crank.melody, RANGE[0], 'open');
  near(e.string(CH1).beta, DEFAULTS.wheelPos / M.stringDesign(0, P()).L, 1e-12, 'β of the open string');
});
test('Helmholtz motion: at the default speed every chanterelle note and every drone slips once a period', () => {
  for (const k of [67, 70, 74, 79, 84, 88, 91]) {
    const e = engine(P({ ...quiet, chanterelles: true }));
    e.noteOn(k, 0.5); run(e, 1.0);
    near(slipsPerPeriod(e, CH1, 0.5), 1, 0.05, `key ${k}: the first`);
    near(slipsPerPeriod(e, 1, 0.5), 1, 0.05, `key ${k}: the second`);
  }
  for (const id of [TROMP, MOUCHE, PETIT, GROS]) {
    const e = engine(P({ ...quiet, [['', '', 'trompette', 'mouche', 'petit', 'gros'][id]]: true, keep: true }));
    run(e, 0.5);
    near(slipsPerPeriod(e, id, 0.5), 1, 0.05, `string ${id}`);
  }
});
test('louder with the crank: a chanterelle\'s sound grows with the wheel\'s speed (Helmholtz amplitude ∝ v_B)', () => {
  // one string (Low bows one): two in near unison add at whatever phase they fall into
  const level = (crank) => { const e = engine(P({ ...quiet, chanterelles: true, crank }), 'low'); e.noteOn(74, 0.5); const [L] = run(e, 1.2); return rms(L, 0.5 * FS); };
  const r = level(1.6) / level(0.8);
  assert.ok(r > 1.5 && r < 2.6, `× ${r.toFixed(2)} for twice the speed`);
});
test('the chien buzzes once the crank passes the model\'s threshold (Z₀v_B/β plus the drag beats the tirant), and not below; a tighter tirant needs more', () => {
  for (const tirant of [2.7, 3.6]) {
    const thr = M.threshold(P({ tirant }));
    const at = (k) => { const e = engine(P({ ...quiet, trompette: true, keep: true, tirant, crank: thr * k })); run(e, 0.6); return landings(e, 1); };
    assert.equal(at(0.8), 0, `${tirant} N: at 0.8× the threshold`);
    assert.ok(at(1.35) > 0.8 * keyFreq(62), `${tirant} N: at 1.35× it lands about once a period or more (${at(1.35)}/s)`);
  }
  assert.ok(M.threshold(P({ tirant: 3.6 })) > M.threshold(P()) * 1.3, 'tighter, higher');
});
test('the coups: two a turn give two bursts of buzz a turn, in time with the crank', () => {
  const e = engine(P({ ...quiet, trompette: true, keep: true, coups: 'two' }));
  run(e, 0.5);
  let bursts = 0, was = false, last = e.crank.hits;
  run(e, 2.5, FS, (x, i) => { if (i % 8) return; const h = x.crank.hits, on = h > last; if (on && !was) bursts++; was = on; last = h; }); // 21 ms windows
  near(bursts / 2.5, 2 * DEFAULTS.crank, 0.6, 'bursts a second');
});
test('the coup from the pedal and from pressure buzzes while held; a key struck hard buzzes on its start, a soft one not', () => {
  const e = engine(P({ ...quiet, trompette: true, chanterelles: true }));
  e.noteOn(74, 0.4); run(e, 0.5);
  assert.equal(landings(e, 0.4), 0, 'soft key, no coup');
  e.setSustain(true); run(e, 0.1);
  assert.ok(landings(e, 0.4) > 100, 'pedal held');
  e.setSustain(false); run(e, 0.2);
  assert.equal(landings(e, 0.4), 0, 'pedal up');
  e.handle({ type: 'pressure', value: 1, key: null }); run(e, 0.1);
  assert.ok(landings(e, 0.4) > 100, 'pressure');
  e.handle({ type: 'pressure', value: 0, key: null }); run(e, 0.3);
  e.noteOn(79, 1.0);
  assert.ok(landings(e, 0.15) > 10, 'a hard key');
});
test('letting go: the hand stops the wheel, the last tangent held until it has stopped, and the strings fall silent', () => {
  const e = engine(P());
  e.noteOn(76, 0.5); run(e, 0.8);
  const [L0] = run(e, 0.2);
  e.noteOff(76);
  run(e, 0.03);
  assert.equal(e.crank.melody, 76, 'the tangent stays while the wheel slows');
  run(e, 0.3);
  assert.ok(e.crank.rate < 1e-3, `stopped: ${e.crank.rate}`);
  assert.equal(e.crank.melody, RANGE[0], 'then lets go');
  run(e, 1.2);
  const [L] = run(e, 0.2);
  assert.ok(rms(L) < rms(L0) * 1e-3, `${rms(L)} after, ${rms(L0)} playing`);
});
test('a drone switched off leaves the wheel and rings out; pitch bend pushes the chanterelles\' tangent (+2 semitones at full) and leaves the drones', () => {
  const e = engine(P({ keep: true }));
  run(e, 0.3);
  assert.ok(e.string(GROS).FN > 0);
  e.setParams(P({ keep: true, gros: false })); run(e, 0.1);
  assert.equal(e.string(GROS).FN, 0, 'off the wheel');
  const b = engine(P({ ...quiet, chanterelles: true, mouche: true, unison: 0 }));
  b.noteOn(74, 0.5); b.handle({ type: 'bend', value: 1 });
  const [L] = run(b, 2.6);
  const x = L.subarray(FS);
  near(cents(peakFreq(x, keyFreq(76)), keyFreq(76)), 0, 4, 'D5 bent up a tone');
  near(cents(peakFreq(x, keyFreq(55)), keyFreq(55)), 0, 3, 'the mouche unmoved');
});
test('level: the default drones and a melody note peak between 0.1 and 0.6; nothing goes non-finite at the parameters\' extremes at 44.1, 48 and 96 kHz', () => {
  const e = engine(P());
  e.noteOn(74, 0.7);
  const [L, R] = run(e, 1.5);
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  assert.ok(pk > 0.1 && pk < 0.6, `peak ${pk.toFixed(3)}`);
  const num = GROUPS.flatMap((g) => g.params).filter((p) => typeof p.def === 'number' && p.min !== undefined && !['volume', 'room', 'pitch', 'tuningRoot'].includes(p.id) && !/^cents/.test(p.id));
  for (const fs of [44100, 48000, 96000]) for (const end of ['min', 'max']) {
    const o = Object.fromEntries(num.map((p) => [p.id, p[end]]));
    const x = engine(P({ ...o, petit: true, keep: true, coups: 'eight' }), null, fs);
    x.noteOn(91, 1); x.noteOn(67, 1); x.setSustain(true);
    const [a, b] = run(x, 0.8, fs);
    let peak = 0;
    for (let i = 0; i < a.length; i++) { assert.ok(Number.isFinite(a[i] + b[i]), `${end} at ${fs}`); peak = Math.max(peak, Math.abs(a[i]), Math.abs(b[i])); }
    assert.ok(peak < 20, `${end} at ${fs}: peak ${peak}`); // (five times the pressure at four turns a second grinds: loud, but bounded)
  }
});
test('every preset plays, finite, and sounds', () => {
  for (const pr of PRESETS) {
    const e = engine(P(pr.p));
    e.noteOn(74, 0.8);
    const [L] = run(e, 0.6);
    assert.ok(L.every(Number.isFinite), pr.name);
    assert.ok(rms(L, 0.3 * FS) > 1e-3, `${pr.name}: sounds`);
  }
  assert.ok(M.threshold(preset('Sec')) > preset('Sec').crank, 'Sec: the crank alone doesn\'t buzz');
  assert.ok(M.threshold(preset('Gras')) < preset('Gras').crank * (1 + preset('Gras').coup), 'Gras: a small coup buzzes');
});
test('Quality: High bows the chanterelles at 8 steps a sample, Medium 4 with the drones at 1, Low 2 on one chanterelle; the note keeps its pitch and level', () => {
  const os = (q) => { const e = engine(P(), q); return [0, 1, 2, 3, 4, 5].map((id) => e.string(id).os); };
  assert.deepEqual(os('high'), [8, 8, 4, 2, 1, 1]);
  assert.deepEqual(os('medium'), [4, 4, 2, 1, 1, 1]);
  assert.deepEqual(os('low'), [2, 2, 2, 1, 1, 1]);
  assert.equal(engine(P(), 'low').string(1).FT, 0, 'Low: the second chanterelle off the wheel');
  const play = (q) => { const e = engine(P({ ...quiet, chanterelles: true }), q); e.noteOn(74, 0.5); return run(e, 2.6)[0]; };
  const hi = play('high');
  for (const q of ['medium', 'low']) {
    const x = play(q);
    near(cents(peakFreq(x.subarray(FS), keyFreq(74)), keyFreq(74)), 0, 4, `${q}: pitch`);
    near(20 * Math.log10(rms(x, FS) / rms(hi, FS)), 0, 2, `${q}: level (dB)`);
  }
});
test('CPU: the six strings on the wheel, buzzing, render well faster than real time', () => {
  const e = engine(P({ petit: true, crank: 2.2 }));
  e.noteOn(88, 0.8);
  run(e, 0.2);
  const t0 = performance.now(); run(e, 2); const dt = (performance.now() - t0) / 1000;
  assert.ok(dt < 0.4, `${((dt / 2) * 100).toFixed(1)} % of real time`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
