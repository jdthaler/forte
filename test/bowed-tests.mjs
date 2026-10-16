// Viola organista checks. Run: node test/bowed-tests.mjs
//
// First the physics against independent results (Mersenne, the infinite
// plate, Wallace's radiation, the friction curve, Helmholtz and Raman's ideal
// motion, Schelleng's bounds, the torsional echo), then the engine against
// the model (pitch at 48 and 44.1 kHz, decay, the regimes of the Schelleng
// diagram, attacks, dampers, sympathy, the flywheel, the registers' voicing),
// then level, sub-audio content, stability and speed.

import assert from 'node:assert/strict';
import {
  RANGE, STEEL, stringDesign, loopDesign, schelleng, friction, frictionForce, mu, keyForce, riseTime, helmholtz,
  plateYinf, plateDensity, plateFreq, plateShape, boardModes, wallace, BOARD, VOICED, TUNE_TABLE,
  lossFilter, oversample, torsionEcho, stringLoad, wheelOf,
} from '../bowed/src/bowed-model.js';
import { BowedString, simulate, settleTime } from '../bowed/src/string.js';
import { INSTRUMENT } from '../bowed/src/bowed-instrument.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS } from '../bowed/src/bowed-params.js';
import { renderEngine } from '../tools/audio-util.mjs';
import { keyFreq } from '../shared/dsp.js';
import { bowedFreq } from '../tools/bowed-tuning.mjs';

const OrganistaEngine = await loadEngine(INSTRUMENT); // JavaScript, or WebAssembly with FORTE_ENGINE=wasm

const FS = 48000;
let failures = 0;
const T0 = performance.now();
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  const t = performance.now();
  try { fn(); console.log('  ok  ', name, `(${((performance.now() - t) / 1000).toFixed(1)} s)`); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (f, g) => 1200 * Math.log2(f / g);

function play(events, sec, params = P(), fs = FS) {
  const e = new OrganistaEngine(fs);
  e.setParams(params);
  return { e, out: renderEngine(e, sec, events, fs) };
}
// Frequency of a periodic signal in x[a, b): autocorrelation peak near m periods.
function pitchOf(x, a, b, f0, fs = FS) {
  a = Math.round(a); b = Math.round(b);
  const N0 = fs / f0, m = Math.max(1, Math.round(1500 / N0)), lag0 = Math.round(m * N0);
  const ac = (lag) => { let s = 0; for (let i = a; i < b - lag; i++) s += x[i] * x[i + lag]; return s; };
  let best = -Infinity, bl = lag0;
  for (let lag = Math.round(lag0 - 0.4 * N0); lag <= lag0 + 0.4 * N0; lag++) { const s = ac(lag); if (s > best) { best = s; bl = lag; } }
  const y0 = ac(bl - 1), y1 = ac(bl), y2 = ac(bl + 1);
  return (m * fs) / (bl + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2));
}
// Two one-pole low-passes at 20 Hz: what is left below the audio band.
function subAudio(x) { const a = 1 - Math.exp((-2 * Math.PI * 20) / FS); let y1 = 0, y2 = 0; return Float64Array.from(x, (v) => { y1 += a * (v - y1); y2 += a * (y1 - y2); return y2; }); }
// Steady level (dB) of a key held at the voiced touch, started in Helmholtz
// motion (so that a stray attack cannot spoil it): RMS above 30 Hz, 0.5–1 s.
function steadyLevel(key) {
  const e = new OrganistaEngine(FS); e.setParams(P()); e.noteOn(key, 0.7);
  const s = e.S[key]; s.FN = s.FT; s.initHelmholtz(s.L.vB);
  const [x] = renderEngine(e, 1.0, [], FS), a = 1 - Math.exp((-2 * Math.PI * 30) / FS);
  let lp = 0, sum = 0;
  for (let i = 0; i < x.length; i++) { lp += a * (x[i] - lp); if (i >= FS / 2) sum += (x[i] - lp) ** 2; }
  return 10 * Math.log10(sum / (FS / 2));
}
// Amplitude of frequency f in x[a, b) (Hann-windowed).
function tone(x, f, a, b) {
  const w = (2 * Math.PI * f) / FS; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}
// A string started in ideal Helmholtz motion, then bowed with force(t).
function bowed(key, params, force, sec, vB = loopDesign(key, params, FS).vB) {
  const s = new BowedString(key, FS);
  s.design(loopDesign(key, params, s.fs)); s.initHelmholtz(vB);
  return simulate(s, friction(params), vB, force, sec);
}
// Schelleng's bounds measured the way Schoonderwaldt, Guettler & Askenfelt
// (2008) did: establish Helmholtz motion, then sweep the force slowly down
// (or up) and note where it is lost for good (≥ 15 periods).
function measuredBound(key, params, dir) {
  const s = new BowedString(key, FS), L = loopDesign(key, params, s.fs), S = schelleng(L, params), Fr = friction(params);
  s.design(L); s.initHelmholtz(L.vB);
  // establish Helmholtz motion (a faster wheel needs a firmer start)
  let F1 = 0;
  for (const x of [0.4, 0.55, 0.7]) {
    for (let i = 0; i < 0.3 * FS; i++) s.tick(0, L.vB, x * S.Fmax, Fr);
    if (s.motion(12).kind === 'helmholtz') { F1 = x * S.Fmax; break; }
  }
  if (!F1) return { S, F: null };
  const Tsw = 3, ratio = dir < 0 ? S.Fmin / F1 / 6 : (6 * S.Fmax) / F1, force = (t) => F1 * ratio ** Math.min(1, t / Tsw);
  const step = 480, need = Math.ceil((15 * FS) / L.f0 / step) + 2;
  let bad = 0, lost = null;
  for (let i = 0; i < Tsw * FS; i++) {
    s.tick(0, L.vB, force(i / FS), Fr);
    if (i % step) continue;
    const m = s.motion(12);
    bad = m.kind === 'helmholtz' ? 0 : bad + 1;
    if (bad === 1) lost = force((i - (12 * FS) / L.f0) / FS);
    if (bad >= need) return { S, F: lost };
  }
  return { S, F: null };
}

console.log('physics');
test('scale: Mersenne pitch, wire stress < 65 % of music wire, inharmonicity small enough to neglect', () => {
  for (let k = RANGE[0]; k <= RANGE[1]; k++) {
    const s = stringDesign(k);
    assert.ok(Math.abs(s.c / (2 * s.L) - s.f0) < 1e-9 * s.f0);
    assert.ok(s.stress < 0.65 * STEEL.uts, `key ${k}: ${(s.stress / 1e9).toFixed(2)} GPa`);
    assert.ok(Math.sqrt(1 + s.B * 100) - 1 < 0.008, `key ${k}: 10th partial ${(1200 * Math.log2(Math.sqrt(1 + s.B * 100))).toFixed(1)} ¢ sharp`);
  }
});
test('soundboard: Weyl mode count and mean point conductance = infinite-plate admittance (Cremer & Heckl)', () => {
  const fM = 3000, n = boardModes(fM, 0.03).length, weyl = plateDensity() * fM;
  assert.ok(Math.abs(n / weyl - 1) < 0.12, `${n} modes below ${fM} Hz vs Weyl ${weyl.toFixed(0)}`);
  // ⟨Re Y⟩ = Σ φ²/M · πδ(ω − ω_m)/2 averaged over 500–2500 Hz and over drive points
  const modes = boardModes(6000, 0.03);
  let sum = 0, cnt = 0;
  for (let p = 0; p < 40; p++) {
    const x = BOARD.a * (0.1 + 0.8 * ((p * 0.618) % 1)), y = BOARD.b * (0.1 + 0.8 * ((p * 0.382) % 1));
    for (const m of modes) if (m.f > 500 && m.f < 2500) sum += plateShape(m.m, m.n, x, y) ** 2 / m.M / 4; // ∫Re Y dω/(2π·Δf)
    cnt++;
  }
  const Ymean = sum / cnt / 2000;
  assert.ok(Math.abs(Ymean / plateYinf() - 1) < 0.15, `⟨Re Y⟩ = ${Ymean.toExponential(3)} vs Y∞ = ${plateYinf().toExponential(3)} s/kg`);
  assert.ok(Math.abs(plateFreq(1, 1) - 47.5) < 1, `f11 = ${plateFreq(1, 1).toFixed(1)}`);
});
test('Wallace radiation: monopole of the volume velocity at low frequency, silence for even modes', () => {
  const f = 2; // k a ≪ 1: the far field of a small source depends only on its volume velocity Q
  for (const [m, n] of [[1, 1], [3, 1], [1, 3], [2, 1], [2, 2]]) {
    const [re, im] = wallace(m, n, f, 0.6, 0.4), k = (2 * Math.PI * f) / 343;
    const Q = m % 2 && n % 2 ? (4 * BOARD.a * BOARD.b) / (Math.PI ** 2 * m * n) : 0; // ∫ sin sin dA
    const odd = m % 2 && n % 2;
    if (odd) assert.ok(Math.abs(Math.hypot(re, im) / (k * Q) - 1) < 0.01, `(${m},${n}): |p| ${Math.hypot(re, im)} vs k·Q = ${k * Q}`);
    else assert.ok(Math.hypot(re, im) < 0.05 * k * BOARD.a * BOARD.b / (m * n), `(${m},${n}) should be a weak multipole`);
  }
});
test('friction junction: the implicit solution lies on the friction curve, sticking only within μs·F_N', () => {
  const Fr = friction(P()), Y = 1.2, FN = 2;
  let r = 12345;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 2000; i++) {
    const vh = 3 * (rnd() - 0.5), state = { s: rnd() < 0.5 ? 0 : rnd() < 0.5 ? 1 : -1 };
    const F = frictionForce(vh, 0.25, FN, Y, Fr, state), dv = vh + Y * F - 0.25;
    if (state.s === 0) { assert.ok(Math.abs(dv) < 1e-12 && Math.abs(F) <= Fr.mus * FN + 1e-9); continue; }
    assert.ok(Math.sign(dv) === state.s, 'slips the way it moves');
    assert.ok(Math.abs(F + state.s * FN * mu(dv, Fr)) < 1e-9, `F = ${F} vs curve ${-state.s * FN * mu(dv, Fr)}`);
  }
});

test('loop filters: finite and passive on all 49 keys at the sliders\' extremes and their combinations (44.1, 48, 96 kHz)', () => {
  const ext = (id) => { const p = GROUPS.flatMap((g) => g.params).find((q) => q.id === id); return [p.min, p.def, p.max]; };
  for (const fs of [44100, 48000, 96000]) for (const beta of ext('beta')) for (const losses of ext('losses')) for (const mobility of ext('mobility')) for (const torsionQ of [5, 300]) {
    const pp = P({ beta, losses, mobility, torsionQ });
    for (let k = RANGE[0]; k <= RANGE[1]; k++) {
      const L = loopDesign(k, pp, fs * oversample(k, fs)), at = `key ${k} at ${fs} Hz, β ${beta}, losses ${losses}, mobility ${mobility}`;
      for (const [g, p, D] of [[L.gb, L.pb, L.Db], [L.gn, L.pn, L.Dn]]) {
        assert.ok(Number.isFinite(g + p + D + L.rtb + L.rtn), `${at}: g ${g}, p ${p}, D ${D}`);
        assert.ok(g > 0 && g <= 1 && p >= 0 && p < 1 && D >= 1, `${at}: g ${g}, p ${p}, D ${D}`); // DC gain ≤ 1; a delay of ≥ 1 sample
      }
    }
  }
  // a trip so short that its own loss is below the passivity margin: a flat gain G₀ < 1, no low-pass
  const short = lossFilter(554, 1, 4000, 30, 192000, 1e-5);
  assert.ok(short.p === 0 && short.g === Math.exp(-1e-5), `p ${short.p}, g ${short.g}`);
});
test('the strings load the board: each plate mode loses Σ Z₀φ²/2M to them, 2–6 × the wood\'s own loss for (1,1)', () => {
  const modes = boardModes(2400, 0.03), M = (BOARD.rhoH * BOARD.a * BOARD.b) / 4, u = (k) => (k - RANGE[0]) / (RANGE[1] - RANGE[0]);
  for (const m of modes.slice(0, 6)) {
    let s = 0;
    for (let k = RANGE[0]; k <= RANGE[1]; k++) s += stringDesign(k).Z0 * plateShape(m.m, m.n, BOARD.a * (0.18 + 0.6 * u(k)), BOARD.b * (0.78 - 0.5 * u(k))) ** 2;
    assert.ok(Math.abs(m.sigma - Math.PI * m.f * 0.03 - s / (2 * M)) < 1e-9 * m.sigma, `(${m.m},${m.n})`);
  }
  const wood = Math.PI * modes[0].f * 0.03, ratio = stringLoad(1, 1) / wood;
  assert.ok(ratio > 2 && ratio < 6, `(1,1): strings ${stringLoad(1, 1).toFixed(1)} s⁻¹, wood ${wood.toFixed(1)} s⁻¹`);
});

console.log('the bowed string');
test('Helmholtz motion (Raman): sticks for 1 − β of the period at v_B, slips back at −v_B(1 − β)/β', () => {
  for (const [key, beta] of [[48, 0.12], [60, 0.2]]) { // Raman's string has no torsion
    const pp = P({ beta, torsionQ: 0 }), L = loopDesign(key, pp, FS), { v } = bowed(key, pp, () => 0.4 * schelleng(L, pp).Fmax, 0.8);
    const h = helmholtz(L.beta, L.vB);
    let stick = 0, slip = 0, vs = 0;
    for (let i = 0.4 * FS; i < 0.8 * FS; i++) { if (Math.abs(v[i] - L.vB) < 0.02 * L.vB) stick++; else if (v[i] < 0.5 * h.vSlip) { slip++; vs += v[i]; } }
    const n = 0.4 * FS;
    assert.ok(Math.abs(stick / n - h.stick) < 0.04, `key ${key}: stuck ${(stick / n).toFixed(3)} of the time, ideal ${h.stick.toFixed(3)}`);
    assert.ok(Math.abs(vs / slip / h.vSlip - 1) < 0.15, `slip velocity ${(vs / slip).toFixed(2)} vs ${h.vSlip.toFixed(2)} m/s`);
  }
});
test('Helmholtz bridge force: a sawtooth (harmonics ∝ 1/n), amplitude ∝ v_B/β', () => {
  const key = 60, FN = (pp) => 0.4 * schelleng(loopDesign(key, pp, FS), pp).Fmax;
  const amp = (pp) => { const { fbr } = bowed(key, pp, () => FN(pp), 1.0), f0 = pitchOf(fbr, 0.4 * FS, FS, keyFreq(key)); return [1, 2, 3, 4, 5, 6].map((n) => tone(fbr, n * f0, 0.4 * FS, FS)); };
  const a = amp(P()), best = (arr) => Math.max(...arr.slice(0, 1)); // fundamental
  for (let n = 2; n <= 6; n++) {
    const db = 20 * Math.log10((a[n - 1] * n) / a[0]);
    assert.ok(Math.abs(db) < 2.5, `harmonic ${n}: ${db.toFixed(1)} dB off 1/n`);
  }
  const fast = amp(P({ speed: 0.5 })), far = amp(P({ beta: 0.24 }));
  assert.ok(Math.abs(best(fast) / best(a) - 2) < 0.2, `2 × v_B: × ${(best(fast) / best(a)).toFixed(2)}`);
  assert.ok(Math.abs(best(far) / best(a) - 0.5) < 0.08, `2 × β: × ${(best(far) / best(a)).toFixed(2)}`);
});
test('Schelleng\'s maximum force (modified for the friction curve): within 30 %, slope −1 in β, ∝ v_B', () => {
  const F = (key, o) => measuredBound(key, P(o), 1);
  const a = F(60, {}), b = F(60, { beta: 0.06 }), c = F(60, { speed: 0.5 }), d = F(48, {});
  for (const [r, name] of [[a, 'C4'], [b, 'C4 β/2'], [c, 'C4 2v_B'], [d, 'C3']]) assert.ok(r.F && Math.abs(r.F / r.S.Fmax - 1) < 0.3, `${name}: ${r.F?.toFixed(3)} N vs ${r.S.Fmax.toFixed(3)} N`);
  const slope = Math.log(b.F / a.F) / Math.log(0.5);
  assert.ok(slope < -0.7 && slope > -1.3, `F_max ∝ β^${slope.toFixed(2)}`);
});
test('Schelleng\'s minimum force: slope ≈ −2 in β; corner rounding raises it to 1–3 × his lossless value', () => {
  const a = measuredBound(60, P(), -1), b = measuredBound(60, P({ beta: 0.06 }), -1), c = measuredBound(48, P(), -1);
  for (const [r, name] of [[a, 'C4'], [b, 'C4 β/2'], [c, 'C3']]) assert.ok(r.F && r.F / r.S.Fmin > 0.9 && r.F / r.S.Fmin < 3, `${name}: ${r.F?.toFixed(4)} N vs ${r.S.Fmin.toFixed(4)} N`);
  const slope = Math.log(b.F / a.F) / Math.log(0.5);
  assert.ok(slope < -1.4 && slope > -2.6, `F_min ∝ β^${slope.toFixed(2)}`);
});
test('the string\'s free decay matches its loop losses (bridge dashpot + string)', () => {
  const pp = P({ mobility: 4 });
  for (const key of [48, 66]) {
    const s = new BowedString(key, FS), L = loopDesign(key, pp, s.fs);
    s.design(L); s.initHelmholtz(L.vB);
    const { fbr } = simulate(s, friction(pp), L.vB, () => 0, 1.2);
    const W = 8192, a = tone(fbr, L.f0, 0.1 * FS, 0.1 * FS + W), b = tone(fbr, L.f0, 1.0 * FS, 1.0 * FS + W);
    const sigma = Math.log(a / b) / 0.9;
    assert.ok(Math.abs(sigma / L.sigma1 - 1) < 0.1, `key ${key}: σ = ${sigma.toFixed(2)} vs ${L.sigma1.toFixed(2)} s⁻¹`);
    const sigB = -L.f0 * Math.log(1 - (2 * L.G * L.Z0) / (1 + L.G * L.Zall));
    assert.ok(sigB > 0.5 * L.sigma1, 'the bridge dominates with a mobile board');
  }
});

test('the torsional echo: near β* = c/(c + c_t), where the twist a slip launches returns from the nut with the corner, the note runs flat', () => {
  const key = 65, be = torsionEcho(key);
  const flat = (o) => { const pp = P(o), L = loopDesign(key, pp, FS); return cents(bowedFreq(key, pp, 0.5 * schelleng(L, pp).Fmax).f, L.f0); };
  const scan = []; for (let b = 0.08; b < 0.1301; b += 0.004) scan.push([b, flat({ beta: b })]);
  const worst = scan.reduce((m, x) => (x[1] < m[1] ? x : m)), away = Math.min(scan[0][1], scan.at(-1)[1]);
  assert.ok(Math.abs(worst[0] - be) < 0.012, `flattest at β = ${worst[0].toFixed(3)}; β* = ${be.toFixed(3)}`);
  assert.ok(worst[1] < away - 8, `${worst[1].toFixed(1)} ¢ there, ${away.toFixed(1)} ¢ well away from it`);
  const plain = [0.088, 0.096, 0.104, 0.12].map((b) => flat({ beta: b, torsionQ: 0 })); // a string that cannot roll
  assert.ok(Math.max(...plain) - Math.min(...plain) < 3, `without torsion: ${plain.map((c) => c.toFixed(1)).join(', ')} ¢`);
  console.log(`        F4: ${worst[1].toFixed(1)} ¢ at β = ${worst[0].toFixed(3)} (β* = ${be.toFixed(3)}), ${away.toFixed(1)} ¢ well away from it`);
});

console.log('engine');
test('tuning: every key within ±1 ¢ of 12-TET at the voiced touch, at 48 and at 44.1 kHz (measured from the output)', () => {
  for (const fs of [48000, 44100]) {
    let worst = 0, wk = 0;
    const stray = [];
    for (let k = RANGE[0]; k <= RANGE[1]; k++) {
      let { e, out } = play([[0, 'on', k, 0.7]], 1.3, P(), fs);
      if (e.S[k].motion(16).kind !== 'helmholtz') { // a stray two-slip start (≈ 1 % of notes): tune it in Helmholtz motion
        stray.push(k);
        e = new OrganistaEngine(fs); e.setParams(P()); e.noteOn(k, 0.7);
        const s = e.S[k]; s.FN = s.FT; s.initHelmholtz(s.L.vB);
        out = renderEngine(e, 1.3, [], fs);
      }
      const c = cents(pitchOf(out[0], 0.75 * fs, 1.3 * fs, keyFreq(k), fs), keyFreq(k));
      if (Math.abs(c) > Math.abs(worst)) { worst = c; wk = k; }
    }
    assert.ok(Math.abs(worst) < 1, `${fs} Hz: worst ${worst.toFixed(2)} ¢ at key ${wk}`);
    assert.ok(stray.length <= 2, `${fs} Hz: keys ${stray.join(', ')} did not settle`);
    console.log(`        ${fs} Hz: worst ${worst.toFixed(2)} ¢ (key ${wk}); not yet in Helmholtz motion at 1.3 s: ${stray.join(', ') || 'none'}`);
  }
});
test('flattening: the bowed pitch falls with force; the free string rings at the tuner\'s offset', () => {
  for (const key of [48, 72]) {
    const pp = P(), L = loopDesign(key, pp, FS), Fm = schelleng(L, pp).Fmax;
    const f = [0.15, 0.35, 0.6].map((x) => { const { fbr } = bowed(key, pp, () => x * Fm, 1.0); return pitchOf(fbr, 0.4 * FS, FS, L.f0); });
    assert.ok(f[0] > f[1] && f[1] > f[2], `key ${key}: ${f.map((x) => cents(x, L.fKey).toFixed(1)).join(', ')} ¢`);
  }
  const key = 72, { out } = play([[0, 'on', key, 0.7], [0.9, 'off', key]], 1.6, P({ lifted: true }));
  const fFree = pitchOf(out[0], 1.0 * FS, 1.6 * FS, keyFreq(key));
  assert.ok(Math.abs(cents(fFree, keyFreq(key)) - TUNE_TABLE[key - RANGE[0]]) < 1, `released: ${cents(fFree, keyFreq(key)).toFixed(2)} ¢ vs tuning +${TUNE_TABLE[key - RANGE[0]].toFixed(2)} ¢`);
});
test('the regimes: too little force → multiple slips, voiced → Helmholtz, too much → aperiodic', () => {
  const state = (key, force) => {
    const e = new OrganistaEngine(FS); e.setParams(P({ force }));
    renderEngine(e, 1.5, [[0, 'on', key, 0.7]], FS);
    return e.S[key].motion(16);
  };
  for (const key of [48, 60]) {
    assert.equal(state(key, 1).kind, 'helmholtz', `key ${key} voiced`);
    const lo = state(key, 0.08);
    assert.ok(lo.kind === 'multiple' && lo.spp > 1.8, `key ${key} light: ${lo.kind} ${lo.spp.toFixed(2)}`);
    const hi = state(key, 4);
    assert.ok(hi.kind !== 'helmholtz', `key ${key} heavy: ${hi.kind}`);
  }
});
test('attacks (Guettler): a quick key settles within 30 periods; a lazy one takes longer; too much force never does', () => {
  const quick = [], lazy = [];
  for (const key of [44, 52, 60, 68, 76]) {
    const pp = P(), s = new BowedString(key, FS), L = loopDesign(key, pp, s.fs), Fr = friction(pp);
    s.design(L);
    const FN = keyForce(key, 0.7, 1);
    quick.push(settleTime(s, Fr, L.vB, FN, riseTime(0.7, 8), 1) * L.f0);
    lazy.push(settleTime(s, Fr, L.vB, FN, 0.15, 1) * L.f0);
    assert.equal(settleTime(s, Fr, L.vB, 1.5 * schelleng(L, pp).Fmax, 0.005, 0.6), Infinity, `key ${key} raucous`);
  }
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  assert.ok(med(quick) < 30, `quick keys: ${quick.map((x) => x.toFixed(0)).join(', ')} periods`);
  assert.ok(med(lazy) > med(quick), `lazy: ${lazy.map((x) => x.toFixed(0)).join(', ')} periods`);
});
test('aftertouch raises the bow force of its key (poly) or of all held keys (channel)', () => {
  const e = new OrganistaEngine(FS); e.setParams(P());
  renderEngine(e, 0.3, [[0, 'on', 48, 0.7], [0, 'on', 55, 0.7]], FS);
  const f0 = e.S[48].FN, g0 = e.S[55].FN;
  e.handle({ type: 'pressure', value: 1, key: 48 });
  renderEngine(e, 0.2, [], FS);
  assert.ok(Math.abs(e.S[48].FN / f0 - 2.5) < 0.01 && e.S[55].FN === g0, 'poly');
  e.handle({ type: 'pressure', value: 0.5, key: null });
  renderEngine(e, 0.2, [], FS);
  assert.ok(Math.abs(e.S[48].FN / f0 - 1.75) < 0.01 && Math.abs(e.S[55].FN / g0 - 1.75) < 0.01, 'channel');
});
test('sympathy: with the dampers lifted, C3 sets its octave ringing, not its neighbour', () => {
  // The attack's transient rings every string a little, so compare one string
  // (C4) when its sub-octave C3 is bowed and when C♯3 is.
  const energy = (bow, k) => {
    const e = new OrganistaEngine(FS); e.setParams(P({ lifted: true }));
    renderEngine(e, 2.5, [[0, 'on', bow, 0.8]], FS);
    let x = 0; for (const v of e.S[k].nl) x += v * v; return x;
  };
  const res = energy(48, 60), off = energy(49, 60), fifth = energy(48, 55), offf = energy(49, 55);
  // (only ~10 dB: the free strings are tuned a few cents sharp so that their
  // bowed notes are in tune, which puts C4's resonance ≈ 1 Hz off C3's 2nd harmonic)
  assert.ok(res > 5 * off, `C4: ${res.toExponential(1)} with C3 bowed, ${off.toExponential(1)} with C♯3`);
  assert.ok(fifth > 3 * offf, `G3: ${fifth.toExponential(1)} with C3 bowed, ${offf.toExponential(1)} with C♯3`);
});
test('dampers: a released string falls at its damper rate and leaves the loop; the board rings out after it', () => {
  const { e, out } = play([[0, 'on', 48, 0.8], [1, 'off', 48]], 2.2);
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += out[0][i] ** 2; return Math.sqrt(s / (b - a)); };
  const drop = 20 * Math.log10(rms(1.7 * FS, 1.8 * FS) / rms(0.8 * FS, 0.9 * FS));
  assert.ok(drop < -45, `${drop.toFixed(1)} dB after 0.8 s`);
  assert.equal(e.nAct, 0);
  const s = new BowedString(48, FS); s.design(loopDesign(48, P(), s.fs)); s.initHelmholtz(0.25); s.setDamper(true, 6.91 / 0.25);
  const { fbr } = simulate(s, friction(P()), 0.25, () => 0, 0.5);
  const db = 20 * Math.log10(tone(fbr, keyFreq(48), 0.3 * FS, 0.3 * FS + 4096) / tone(fbr, keyFreq(48), 0.05 * FS, 0.05 * FS + 4096));
  assert.ok(Math.abs(db - -60 * 0.25 / 0.25) < 6, `string: ${db.toFixed(1)} dB in 0.25 s with T60 = 0.25 s`);
});
test('no clicks: key-down and release are smooth; the attack scratch stays within 2.5 × the steady slope', () => {
  for (const key of [36, 48, 60, 72, 84]) {
    const { out } = play([[0.1, 'on', key, 1], [0.8, 'off', key]], 1.2);
    const x = out[0], jump = (a, b) => { let j = 0; for (let i = Math.round(a) + 1; i < b; i++) j = Math.max(j, Math.abs(x[i] - x[i - 1])); return j; };
    const steady = jump(0.5 * FS, 0.8 * FS);
    assert.ok(jump(0.1 * FS - 10, 0.105 * FS) < 0.25 * steady, `key ${key}: first 5 ms ${jump(0.1 * FS - 10, 0.105 * FS).toFixed(4)} vs ${steady.toFixed(4)}`);
    assert.ok(jump(0.1 * FS, 0.4 * FS) < 2.5 * steady, `key ${key}: attack ${jump(0.1 * FS, 0.4 * FS).toFixed(4)} vs ${steady.toFixed(4)}`);
    assert.ok(jump(0.8 * FS, 1.2 * FS) < 1.2 * steady, `key ${key}: release ${jump(0.8 * FS, 1.2 * FS).toFixed(4)} vs ${steady.toFixed(4)}`);
  }
});

test('the flywheel: the wheels follow a change of treadle speed with a 0.5 s time constant (no step for the mod wheel)', () => {
  const e = new OrganistaEngine(FS); e.setParams(P());
  renderEngine(e, 0.1, [[0, 'on', 60, 0.7]], FS);
  e.setParams(P({ speed: 0.5 }));
  renderEngine(e, 0.5, [], FS);
  const frac = (e.vB - 0.25) / 0.25;
  assert.ok(Math.abs(frac - (1 - Math.exp(-1))) < 0.01, `after 0.5 s: ${(frac * 100).toFixed(1)} % of the way`);
});
test('voicing: the four wheels even out the registers (medians within 3 dB); every key within 13 dB (one wheel: 7 and 19 dB)', () => {
  const lv = []; for (let k = RANGE[0]; k <= RANGE[1]; k++) lv.push(steadyLevel(k));
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const reg = [0, 1, 2, 3].map((w) => med(lv.filter((_, i) => wheelOf(RANGE[0] + i) === w)));
  const spread = Math.max(...reg) - Math.min(...reg), span = Math.max(...lv) - Math.min(...lv);
  assert.ok(spread < 3, `register medians ${reg.map((x) => x.toFixed(1)).join(', ')} dB`);
  assert.ok(span < 13, `keys ${Math.min(...lv).toFixed(1)} … ${Math.max(...lv).toFixed(1)} dB`);
  console.log(`        register medians ${reg.map((x) => x.toFixed(1)).join(', ')} dB; keys within ${span.toFixed(1)} dB`);
});
test('a string that goes non-finite is stopped alone: the bridge stays clean and the other note plays on', () => {
  const e = new OrganistaEngine(FS), msgs = []; e.setParams(P()); e.post = (m) => msgs.push(m.type);
  const [a] = renderEngine(e, 0.8, [[0, 'on', 48, 0.7], [0, 'on', 60, 0.7], [0.4, 'off', 60]], FS);
  const [b] = renderEngine(e, 0.8, [[0, 'on', 60, 0.7]], FS);
  e.S[60].fb.fill(NaN); // e.g. a loop filter gone bad
  const [c] = renderEngine(e, 0.8, [], FS);
  assert.ok(c.every(Number.isFinite), 'output stays finite');
  assert.ok(!e.S[60].down && e.S[48].down && e.S[48].motion(16).kind === 'helmholtz', 'C4 stopped, C3 still bowed');
  assert.ok(msgs.includes('error'), 'the page is told');
  const rms = (x, i0) => { let s = 0; for (let i = i0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (x.length - i0)); };
  assert.ok(Math.abs(20 * Math.log10(rms(c, 0.3 * FS) / rms(a, 0.6 * FS))) < 1.5, 'C3 at its level');
  void b;
});

console.log('level, stability, speed');
test('no DC, no sub-audio thump: below 20 Hz the output stays within 12 % of the note\'s peak at key-down and key-up', () => {
  for (const key of [36, 60]) {
    const { out } = play([[0.5, 'on', key, 0.7], [2.0, 'off', key]], 3), x = out[0], lf = subAudio(x);
    let pk = 0, mean = 0, lfp = 0;
    for (let i = 1.5 * FS; i < 2 * FS; i++) { pk = Math.max(pk, Math.abs(x[i])); mean += x[i] / (0.5 * FS); }
    for (const v of lf) lfp = Math.max(lfp, Math.abs(v));
    assert.ok(lfp < 0.12 * pk, `key ${key}: < 20 Hz ${lfp.toFixed(4)} vs peak ${pk.toFixed(3)}`);
    assert.ok(Math.abs(mean) < 0.01 * pk, `key ${key}: mean ${mean.toExponential(1)} vs peak ${pk.toFixed(3)}`);
  }
});
test('level: single forte notes peak 0.03–0.5 (0.07–0.19 from C2 to C6); a 10-note chord stays under 1', () => {
  for (const k of [36, 48, 60, 72, 84]) {
    const { out } = play([[0, 'on', k, 1]], 1);
    let pk = 0; for (const v of out[0]) pk = Math.max(pk, Math.abs(v));
    assert.ok(pk > 0.03 && pk < 0.5, `key ${k}: peak ${pk.toFixed(3)}`);
  }
  const chord = [36, 43, 48, 52, 55, 60, 64, 67, 72, 76];
  const { out } = play(chord.map((k) => [0, 'on', k, 1]), 1.5);
  let pk = 0; for (const ch of out) for (const v of ch) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk < 1, `chord peak ${pk.toFixed(2)}`);
});
test('every parameter at its min and max: finite output, no blow-up', () => {
  const ev = [[0, 'on', 36, 1], [0, 'on', 60, 1], [0, 'on', 84, 1], [0.35, 'off', 60]];
  for (const p of GROUPS.flatMap((g) => g.params)) {
    for (const v of p.type === 'checkbox' ? [false, true] : [p.min, p.max]) {
      const { out } = play(ev, 0.5, P({ [p.id]: v }));
      let pk = 0; for (const ch of out) for (const x of ch) { assert.ok(Number.isFinite(x), `${p.id} = ${v}: NaN`); pk = Math.max(pk, Math.abs(x)); }
      assert.ok(pk < (p.id === 'volume' ? 2 : 1.5), `${p.id} = ${v}: peak ${pk.toFixed(2)}`);
    }
  }
});
test('CPU: 10 voices render in under 30 % of real time', () => {
  const chord = [36, 43, 48, 55, 60, 64, 67, 72, 79, 84];
  play(chord.map((k) => [0, 'on', k, 0.8]), 0.5); // warm up the JIT
  const t = performance.now();
  play(chord.map((k) => [0, 'on', k, 0.8]), 3);
  const load = (performance.now() - t) / 3000;
  console.log(`        10 voices: ${(load * 100).toFixed(1)} % of real time`);
  assert.ok(load < 0.3, `${(load * 100).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : `\nall passed (${((performance.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(failures ? 1 : 0);
