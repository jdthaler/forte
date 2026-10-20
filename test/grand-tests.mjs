// Electric grand checks. Run: node test/grand-tests.mjs
//
// First the physics against independent results (stiff-string dispersion,
// transmission-line end conditions, the infinite-plate admittance, Weyl's
// mode count, the Rayleigh integral), then the engine against the model. Both are the C++
// (native/instruments/grand), built as WebAssembly: the model through
// grand-wasm.js.

import assert from 'node:assert/strict';
import { INSTRUMENT } from '../grand/src/grand-instrument.js';
import { wasmModel } from '../grand/src/grand-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { DEFAULTS, GROUPS } from '../grand/src/grand-params.js';
import { renderEngine } from '../tools/audio-util.mjs';
import { keyFreq } from '../shared/dsp.js';

const GrandEngine = await loadEngine(INSTRUMENT);
const { keyModel, boardModel, boardMobility, boardResponse, sinFT } = await wasmModel();
const [KEY_LO, KEY_HI] = INSTRUMENT.range; // A0–C8, the CP-80's 88 keys
const CP70 = [28, 100]; // the CP-70's 73, E1–E7
// What the checks compare against, stated here rather than read from the model: steel's Young's
// modulus and breaking stress, the plate's size, the speed of sound and the baffle's size for the
// short circuit (grand-model.h), and the circuit's piezo capacitance and EQ corners (grand-engine.h).
const STEEL = { E: 2.0e11, rho: 7850, strength: 2.2e9 }, PLATE = { a: 1.3, b: 0.77, c: 343, ell: 0.5 };
const C_PIEZO = 10e-9, EQ = { bass: 120, mid: 1000, midQ: 0.8, treble: 3500 };
// A stiff string's partial 2 sits above twice its fundamental by this many cents.
const octaveStretch = (B) => 1200 * Math.log2(Math.sqrt(1 + 4 * B) / Math.sqrt(1 + B));

const FS = 48000, TAU = 2 * Math.PI;
const t00 = performance.now();
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'sus', on] | [t, 'params', P]),
// in 128-sample blocks like the AudioWorklet. Returns the mono sum (L + R) and the engine.
function render(params, events, sec, fs = FS) {
  const e = new GrandEngine(fs);
  e.setParams(params);
  const n = Math.round(sec * fs), x = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  let j = 0, pk = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < events.length && Math.round(events[j][0] * fs) <= s) {
      const [, type, a, b] = events[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else if (type === 'params') e.setParams(a); else e.setSustain(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { x[s + i] = bL[i] + bR[i]; pk = Math.max(pk, Math.abs(bL[i]), Math.abs(bR[i])); }
  }
  return { x, e, pk };
}
const note = (params, key, vel, sec) => render(params, [[0, 'on', key, vel]], sec).x;
// Amplitude of frequency f in x[a, b) (Hann-windowed DTFT).
function tone(x, f, a, b, fs = FS) {
  const w = (TAU * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return (4 * Math.hypot(re, im)) / (b - a);
}
// Frequency of the strongest component within ±c cents of f (golden-section search).
function peakFreq(x, f, a, b, c = 20) {
  let lo = f * 2 ** (-c / 1200), hi = f * 2 ** (c / 1200);
  // coarse scan first, so the search starts on the right peak
  let best = lo, bv = -1;
  for (let i = 0; i <= 40; i++) { const g = lo * (hi / lo) ** (i / 40), v = tone(x, g, a, b); if (v > bv) { bv = v; best = g; } }
  lo = best * 2 ** (-c / 40 / 1200); hi = best * 2 ** (c / 40 / 1200);
  const r = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 30; it++) {
    const m1 = hi - r * (hi - lo), m2 = lo + r * (hi - lo);
    if (tone(x, m1, a, b) > tone(x, m2, a, b)) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}
// Decay rate σ (s⁻¹) of the component at f between windows starting at t1 and t2.
function decay(x, f, t1, t2, W = 0.25) {
  const w = Math.round(W * FS), a1 = Math.round(t1 * FS), a2 = Math.round(t2 * FS);
  return Math.log(tone(x, f, a1, a1 + w) / tone(x, f, a2, a2 + w)) / (t2 - t1);
}
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

console.log('physics');
test('stiff string: fₙ = n f₀√(1+Bn²)/√(1+B), B = π³Ed⁴/(64TL²), f₁ on its target (Fletcher 1964)', () => {
  for (const stretch of [true, false]) for (const scale of ['cp70', 'concert']) for (const m of [28, 45, 60, 84, 100]) {
    const km = keyModel(m, P({ scale, stretch, maxFreq: 16000 })), S = km.S;
    const B = (Math.PI ** 3 * STEEL.E * S.d ** 4) / (64 * S.T * S.L ** 2);
    assert.ok(Math.abs(S.B / B - 1) < 1e-9, `B ${S.B} vs ${B}`);
    assert.ok(Math.abs(cents(km.partials[0].f, S.f0)) < 1e-6, 'f₁ on target');
    if (!stretch) assert.ok(Math.abs(cents(S.f0, keyFreq(m))) < 1e-9, 'target: 12-TET');
    for (const { n, f } of km.partials.slice(1)) {
      const want = (n * S.f0 * Math.sqrt(1 + B * n * n)) / Math.sqrt(1 + B);
      assert.ok(Math.abs(cents(f, want)) < 1e-6, `${m} n=${n}`);
    }
  }
});
test('CP-70 scale: 0.68 m bass (published: 26¾ in), 15 single-string keys, wire well below breaking up to C8', () => {
  const L28 = keyModel(28, P()).S.L;
  assert.ok(Math.abs(L28 - 0.679) < 0.005, `${L28}`);
  let mono = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const km = keyModel(m, P());
    if (km.ns === 1 && m >= CP70[0] && m <= CP70[1]) mono++;
    assert.ok(km.S.stress < 0.5 * STEEL.strength, `key ${m}: ${(km.S.stress / STEEL.strength).toFixed(2)} of breaking`);
  }
  assert.equal(mono, 15);
  assert.ok(keyModel(28, P()).S.wound && !keyModel(60, P()).S.wound);
});
test('short bass strings are ~40× more inharmonic than a concert grand\'s: B ∝ d⁴/(T L²)', () => {
  const cp = keyModel(28, P()).S, cg = keyModel(28, P({ scale: 'concert' })).S;
  assert.ok(cp.B / cg.B > 20, `${cp.B} vs ${cg.B}`);
  const p10 = (sc) => keyModel(28, P({ scale: sc })).partials[9].stretch;
  assert.ok(p10('cp70') > 100 && p10('concert') < 10, `${p10('cp70')} vs ${p10('concert')} ¢`);
});
test('bridge force Σ bₙqₙ = T ∂y/∂x at the bridge, for any shape (flexible string)', () => {
  const km = keyModel(60, P({ stiffness: 0 })), S = km.S, ps = km.partials;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const q = ps.map((p) => rnd() / p.n ** 2);
  const y = (x) => ps.reduce((s, p, j) => s + q[j] * Math.sqrt(2 / (S.mu * S.L)) * Math.sin(p.k * x), 0);
  const h = 1e-6 * S.L, slope = (y(S.L + h) - y(S.L - h)) / (2 * h);
  const F = ps.reduce((s, p, j) => s + p.b * q[j], 0);
  assert.ok(Math.abs(F / (S.T * slope) - 1) < 1e-6, `${F} vs ${S.T * slope}`);
});
test('resistive bridge: σ = G T/L, the small-G root of tan kL = iGZ₀ (σ = c·atanh(GZ₀)/L)', () => {
  for (const G of [1e-4, 1e-3, 3e-3]) {
    const km = keyModel(60, P({ stiffness: 0, gFrame: G })), S = km.S;
    const exact = (S.cT * Math.atanh(G * Math.sqrt(S.T * S.mu))) / S.L;
    for (const p of km.partials.slice(0, 5)) assert.ok(Math.abs(p.bridgeV / exact - 1) < 0.01, `${p.bridgeV} vs ${exact}`);
  }
});
test('spring-supported end: H sits flat by T/(K L), the root of T k cos kL + K sin kL = 0', () => {
  for (const K of [1e5, 1e6]) {
    const km = keyModel(60, P({ stiffness: 0, kH: K })), S = km.S;
    let k = Math.PI / S.L; // Newton on g(k) = T k cos kL + K sin kL
    for (let i = 0; i < 30; i++) k -= (S.T * k * Math.cos(k * S.L) + K * Math.sin(k * S.L)) / (S.T * Math.cos(k * S.L) - S.T * k * S.L * Math.sin(k * S.L) + K * S.L * Math.cos(k * S.L));
    const exact = cents(k, Math.PI / S.L), model = cents(km.partials[0].fH, km.partials[0].f);
    assert.ok(Math.abs(model - exact) < 0.02 * Math.abs(exact), `${model.toFixed(3)} vs ${exact.toFixed(3)} ¢`);
  }
});
test('soundboard: mean bridge conductance → 1/(8√(Dρh)), the infinite plate (Cremer & Heckl)', () => {
  for (const h of [6, 9, 14]) {
    const B = boardModel(P({ boardH: h })), Ginf = 1 / (8 * Math.sqrt(B.D * B.rhoh));
    for (let seg = 0; seg < 3; seg++) {
      let s = 0, n = 0;
      for (let f = 300; f < 1500; f += 0.5) {
        // without the bridge's mass, which sits in series: 1/Y = 1/Y_tot − iω m_b
        const [re, im] = boardMobility(B, seg, f), yy = re * re + im * im, zr = re / yy, zi = -im / yy - TAU * f * B.mb;
        s += zr / (zr * zr + zi * zi); n++;
      }
      assert.ok(Math.abs(s / n / Ginf - 1) < 0.08, `h=${h} seg ${seg}: ${(s / n).toExponential(2)} vs ${Ginf.toExponential(2)}`);
    }
  }
});
test('soundboard modes: f₁₁ = (π/2)√(D/ρh)(a⁻² + b⁻²); count N(f) ≈ (S/2)√(ρh/D)·f (Weyl)', () => {
  const B = boardModel(P()), { a, b } = PLATE;
  const f11 = (Math.PI / 2) * Math.sqrt(B.D / B.rhoh) * (a ** -2 + b ** -2);
  assert.ok(Math.abs(B.f11 / f11 - 1) < 1e-9 && B.f11 > 35 && B.f11 < 60, `${B.f11}`);
  const n3k = Array.from(B.omega).filter((w) => w < TAU * 3000).length, weyl = ((a * b) / 2) * Math.sqrt(B.rhoh / B.D) * 3000;
  assert.ok(Math.abs(n3k / weyl - 1) < 0.15, `${n3k} modes vs Weyl ${weyl.toFixed(0)}`);
});
test('Rayleigh integral: closed-form ∫sin(qx)e^{iκx}dx; even modes radiate weakly at low f', () => {
  for (const [q, kap] of [[Math.PI, 0.3], [2 * Math.PI, 1.7], [5 * Math.PI, 5 * Math.PI], [3 * Math.PI, 0]]) {
    const n = 20000; let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; re += Math.sin(q * x) * Math.cos(kap * x) / n; im += Math.sin(q * x) * Math.sin(kap * x) / n; }
    const [r, j] = sinFT(q, kap, 1);
    assert.ok(Math.hypot(r - re, j - im) < 1e-6, `q=${q} κ=${kap}`);
  }
  const B = boardModel(P());
  let odd = 0, no = 0, even = 0, ne = 0;
  for (let k = 0; k < B.K && B.omega[k] < TAU * 300; k++) {
    const kl = (B.omega[k] / PLATE.c) * PLATE.ell, R = Math.abs(B.RL[k]) / (kl / Math.hypot(1, kl)); // baffled value
    if (B.m[k] % 2 && B.n[k] % 2) { odd += R; no++; } else { even += R; ne++; }
  }
  assert.ok(even / ne < 0.3 * (odd / no), `even ${even / ne} vs odd–odd ${odd / no}`);
});

console.log('engine');
test('stretch off: every key within ±3 ¢ of 12-TET A440 (measured from the output)', () => {
  let worst = 0, wk = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    // 1.2 s windows: long enough to resolve the unison pair rather than track its beating
    const x = note(P({ stretch: false }), m, 0.6, 1.3), f = peakFreq(x, keyFreq(m), Math.round(0.1 * FS), x.length);
    const c = Math.abs(cents(f, keyFreq(m)));
    if (c > worst) { worst = c; wk = m; }
  }
  assert.ok(worst < 3, `worst ${worst.toFixed(2)} ¢ at key ${wk}`);
  console.log(`        (worst ${worst.toFixed(2)} ¢ at key ${wk})`);
});
test('the keyboard’s tuning: at A = 415 Hz every key 415/440 of 12-TET A440, in ¼-comma meantone E4 −3.42 ¢ and C4 +10.26 ¢; stretched, its octaves still beatless', () => {
  // ¼-comma meantone on C, A kept: E sits a fifth's narrowing (q − 700) from 12-TET, C 2100 − 3q
  const q = 1200 * Math.log2(3 / 2) - 300 * Math.log2(81 / 80);
  const cases = [[{ pitch: 415 }, 64, cents(415, 440)], [{ pitch: 415 }, 60, cents(415, 440)], [{ temperament: 'meantone' }, 64, q - 700], [{ temperament: 'meantone' }, 60, 2100 - 3 * q]];
  for (const [o, m, want] of cases) {
    const S = keyModel(m, P({ stretch: false, ...o })).S;
    assert.ok(Math.abs(cents(S.f0, keyFreq(m)) - want) < 1e-9, `${JSON.stringify(o)} key ${m}: target ${cents(S.f0, keyFreq(m))} ¢, not ${want} ¢`);
    const f = keyFreq(m) * 2 ** (want / 1200), x = note(P({ stretch: false, ...o }), m, 0.6, 1.3);
    const c = cents(peakFreq(x, f, Math.round(0.1 * FS), x.length), f);
    assert.ok(Math.abs(c) < 3, `${JSON.stringify(o)} key ${m}: sounds ${c.toFixed(2)} ¢ off`);
  }
  for (let m = 40; m + 12 <= 90; m += 7) { // the stretch on top: each octave still that of its lower note's partial 2
    const lo = keyModel(m, P({ temperament: 'meantone' })), hi = keyModel(m + 12, P({ temperament: 'meantone' }));
    assert.ok(Math.abs(lo.partials[1].f - hi.partials[0].f) < 1e-3, `${m}–${m + 12}: beats`);
  }
});
test('stretch tuning: every octave\'s 2:1 partials coincide, so the octaves stop beating (12-TET: up to 25 Hz)', () => {
  for (const scale of ['cp70', 'concert']) {
    let worst = 0, beat12 = 0;
    for (let m = KEY_LO; m + 12 <= KEY_HI; m++) {
      const lo = keyModel(m, P({ scale })), hi = keyModel(m + 12, P({ scale }));
      worst = Math.max(worst, Math.abs(lo.partials[1].f - hi.partials[0].f));
      const lo0 = keyModel(m, P({ scale, stretch: false })), hi0 = keyModel(m + 12, P({ scale, stretch: false }));
      beat12 = Math.max(beat12, Math.abs(lo0.partials[1].f - hi0.partials[0].f));
      // the stretch of each octave is exactly that of its lower note's partial 2
      assert.ok(Math.abs(hi.S.cents - lo.S.cents - octaveStretch(lo.S.B)) < 1e-4);
    }
    assert.ok(worst < 1e-3 && beat12 > 10, `${scale}: worst 2:1 beat ${worst.toExponential(1)} Hz (12-TET ${beat12.toFixed(1)} Hz)`);
  }
  assert.ok(Math.abs(keyModel(69, P()).S.cents) < 1e-9); // A4 stays at 440 Hz
  // in the output: partial 2 of the lower note on the upper note's fundamental
  for (const [m, was] of [[84, 14.7], [81, 9.8]]) {
    const lo = keyModel(m, P()), hi = keyModel(m + 12, P());
    const a = note(P(), m, 0.7, 1.3), b = note(P(), m + 12, 0.7, 1.3), i0 = Math.round(0.1 * FS);
    const beat = Math.abs(peakFreq(a, lo.partials[1].f, i0, a.length, 10) - peakFreq(b, hi.partials[0].f, i0, b.length, 10));
    assert.ok(beat < 0.5, `${m}–${m + 12}: ${beat.toFixed(2)} Hz (12-TET: ${was} Hz)`);
  }
  let worst = 0; // and each key on its stretched target
  for (let m = KEY_LO; m <= KEY_HI; m += 6) {
    const want = keyModel(m, P()).S.f0, x = note(P(), m, 0.6, 1.3);
    worst = Math.max(worst, Math.abs(cents(peakFreq(x, want, Math.round(0.1 * FS), x.length), want)));
  }
  assert.ok(worst < 3, `worst ${worst.toFixed(2)} ¢ off its stretched target`);
  const sc = (m) => keyModel(m, P()).S.cents.toFixed(1);
  console.log(`        (CP-70 stretch: E1 ${sc(28)} ¢, C4 ${sc(60)} ¢, C7 ${sc(96)} ¢, E7 ${sc(100)} ¢)`);
});
test('the zing is in the output: E1\'s 10th partial at the model\'s +159 ¢ (concert scale: +5 ¢)', () => {
  for (const scale of ['cp70', 'concert']) {
    // the linear model's partial: tension modulation would raise it while the blow rings (its own test)
    const p = P({ scale, kc: false }), km = keyModel(28, p), want = km.partials[9].f;
    const x = note(p, 28, 0.8, 1.2), f = peakFreq(x, want, Math.round(0.1 * FS), x.length, 10);
    assert.ok(Math.abs(cents(f, want)) < 2, `${scale}: ${f.toFixed(2)} vs ${want.toFixed(2)} Hz`);
    assert.ok(scale === 'cp70' ? km.partials[9].stretch > 140 : km.partials[9].stretch < 10);
  }
});
test('the piezo hears Σ bₙqₙ: partial n is n × its displacement (harmonic string)', () => {
  const p = P({ stiffness: 0, stringing: 'single', tilt: 0, rIn: 10000 });
  const { x, e } = render(p, [[0, 'on', 57, 0.7]], 0.3);
  const v = e.voices[0], km = v.data, t = x.length - 4096;
  const ratio = [];
  for (let j = 0; j < 6; j++) {
    const c = Math.cos((TAU * km.freq[j]) / FS), q0 = v.q[j], q1 = v.q1[j]; // amplitude from two samples
    const A = Math.sqrt((q0 * q0 + q1 * q1 - 2 * q0 * q1 * c) / (1 - c * c));
    ratio.push(tone(x, km.freq[j], t, x.length) / A);
  }
  for (let j = 1; j < 6; j++) assert.ok(Math.abs(ratio[j] / ratio[0] / (j + 1) - 1) < 0.03, `n=${j + 1}: ${(ratio[j] / ratio[0]).toFixed(3)}`);
});
test('the bridge drains every partial at its model rate, up to 15 kHz, at 44.1 and 48 kHz (implicit solve)', () => {
  let worst = 0, wf = 0;
  for (const fs of [44100, 48000]) for (const key of [84, 96]) {
    // a full blow's pitch glide would move the partials off the frequencies the decay is read at;
    // the undamped treble's strings, ringing along, would add to them
    const p = P({ stringing: 'single', tilt: 0, gFrame: 3e-3, maxFreq: 16000, hardness: 3, kc: false, sympathy: 0 }), km = keyModel(key, p, null, fs);
    const x = render(p, [[0, 'on', key, 1]], 1.2, fs).x;
    for (const pp of km.partials) {
      if (pp.f < 1500) continue;
      const W = Math.round(0.1 * fs), want = pp.sigInt + pp.bridgeV, t2 = Math.min(0.05 + 2.5 / want, 1.0);
      const got = Math.log(tone(x, pp.f, Math.round(0.05 * fs), Math.round(0.05 * fs) + W, fs) / tone(x, pp.f, Math.round(t2 * fs), Math.round(t2 * fs) + W, fs)) / (t2 - 0.05);
      if (Math.abs(got / want - 1) > worst) { worst = Math.abs(got / want - 1); wf = pp.f; }
    }
  }
  assert.ok(worst < 0.03, `worst ${(100 * worst).toFixed(1)} % at ${(wf / 1000).toFixed(1)} kHz`);
  console.log(`        (worst partial ${(100 * worst).toFixed(1)} % off at ${(wf / 1000).toFixed(1)} kHz)`);
});
test('one string on a stiff bridge decays at σ_int + G(T + EIk²)/L', () => {
  const p = P({ stringing: 'single', tilt: 0, gFrame: 1e-3 }), km = keyModel(60, p), x = note(p, 60, 0.7, 1.6);
  for (const j of [0, 2]) {
    const pp = km.partials[j], want = pp.sigInt + pp.bridgeV, got = decay(x, pp.f, 0.3, 1.2);
    assert.ok(Math.abs(got / want - 1) < 0.05, `n=${j + 1}: ${got.toFixed(3)} vs ${want.toFixed(3)} s⁻¹`);
  }
});
test('tension modulation: a hard blow starts sharp and glides down; a soft one barely moves', () => {
  // the stretch weights are ∂ω²/∂T, k²/μ for every mode (μ with the winding); the core alone
  // stretches: ΔT = (E A_core/2L)∫u_x²
  const km = keyModel(40, P()), rel = (a, b) => Math.abs(a / b - 1);
  for (let i = 0; i < km.n; i += 5) {
    const pp = km.partials.find((x) => x.n === km.idx[i]);
    assert.ok(rel(km.g[i], (pp.k * pp.k) / km.S.mu) < 1e-12, `g of mode ${i}`);
  }
  assert.ok(rel(km.kc, (STEEL.E * (km.S.muCore / STEEL.rho)) / (2 * km.S.L)) < 1e-12, `kc ${km.kc}`);
  // E2, one string: the fundamental's pitch with the stretch, re without
  const f = keyModel(40, P({ stringing: 'single' })).partials[0].f;
  const shift = (vel, t) => {
    const at = (kc) => { const x = note(P({ stringing: 'single', kc }), 40, vel, t + 0.12); return peakFreq(x, f, Math.round(t * FS), Math.round((t + 0.1) * FS), 80); };
    return cents(at(true), at(false));
  };
  const hard = shift(1, 0.02), late = shift(1, 1.8), soft = shift(0.2, 0.02);
  console.log(`        (E2 at full velocity: +${hard.toFixed(1)} ¢ at the start, +${late.toFixed(1)} ¢ after 1.8 s; at 0.2 +${soft.toFixed(2)} ¢)`);
  assert.ok(hard > 5 && hard < 60, `hard ${hard}`);
  assert.ok(late < hard / 4, `late ${late}`);
  assert.ok(Math.abs(soft) < hard / 10, `soft ${soft}`);
});
test('Weinreich: two strings in phase drain twice as fast; mistuning and tilt leave an aftersound', () => {
  const base = { gFrame: 1e-3, tilt: 0, detune: 0 }, f = keyFreq(60);
  const one = decay(note(P({ ...base, stringing: 'single' }), 60, 0.7, 1.2), f, 0.2, 0.8);
  const two = decay(note(P(base), 60, 0.7, 1.2), f, 0.2, 0.8);
  const km = keyModel(60, P(base)), sb = km.partials[0].bridgeV, si = km.partials[0].sigInt;
  assert.ok(Math.abs((two - si) / (one - si) - 2) < 0.1, `bridge share ${(two - si).toFixed(3)} vs ${(one - si).toFixed(3)} (σ_b = ${sb.toFixed(3)})`);
  const x = note(P({ gFrame: 1e-3, tilt: 8, detune: 1.5 }), 60, 0.7, 7);
  const early = decay(x, f, 0.2, 1.2, 0.5), late = decay(x, f, 4, 6, 0.5);
  assert.ok(late < 0.5 * early, `early ${early.toFixed(2)}, late ${late.toFixed(2)} s⁻¹`);
});
test('the frame keeps the energy in the strings: longer sustain than on a soundboard', () => {
  const lvl = (x, t) => { let s = 0; const a = Math.round(t * FS); for (let i = a; i < a + 4800; i++) s += x[i] * x[i]; return Math.sqrt(s); };
  const keys = [40, 46, 52, 58, 64, 70, 76, 82]; // each partial drains at its own rate on a board, so average
  const drop = (mount) => keys.reduce((s, m) => { const x = note(P({ mount, listen: 0 }), m, 0.7, 3.2); return s + 20 * Math.log10(lvl(x, 0.1) / lvl(x, 3)) / keys.length; }, 0);
  const fr = drop('frame'), bo = drop('board');
  assert.ok(bo > fr + 5, `frame ${fr.toFixed(1)} dB, board ${bo.toFixed(1)} dB over 3 s`);
  console.log(`        (mean level drop over 3 s: frame ${fr.toFixed(1)} dB, soundboard ${bo.toFixed(1)} dB)`);
});
test('H polarisation in the output sits T/(K_H L) flat of V', () => {
  const kH = 2e5, p = (tilt) => P({ stringing: 'single', tilt, pickH: 1, kH });
  const fV = peakFreq(note(p(0), 60, 0.7, 1.5), keyFreq(60), 4800, 72000, 30), fH = peakFreq(note(p(90), 60, 0.7, 1.5), keyFreq(60), 4800, 72000, 30);
  const S = keyModel(60, P()).S, want = cents(1 - S.T / (kH * S.L), 1);
  assert.ok(Math.abs(cents(fH, fV) - want) < 0.3, `${cents(fH, fV).toFixed(2)} vs ${want.toFixed(2)} ¢`);
});
test('striking at the middle leaves out the even partials', () => {
  const p = P({ strike: 0.5, stringing: 'single' }), km = keyModel(55, p), x = note(p, 55, 0.7, 0.6);
  const a = (j) => tone(x, km.partials[j].f, 4800, x.length);
  for (const j of [1, 3]) assert.ok(a(j) < 0.03 * Math.min(a(j - 1), a(j + 1)), `partial ${j + 1}`);
});
test('piezo + preamp: a high-pass at 1/(2πRC)', () => {
  const lo = note(P({ rIn: 22 }), 48, 0.7, 0.6), hi = note(P({ rIn: 10000 }), 48, 0.7, 0.6);
  const fc = 1 / (TAU * 22e3 * C_PIEZO), fcHi = 1 / (TAU * 1e7 * C_PIEZO), km = keyModel(48, P());
  for (const j of [0, 3, 9]) {
    const f = km.partials[j].f, H = (g) => (f / g) / Math.hypot(1, f / g);
    const got = 20 * Math.log10(tone(lo, f, 4800, lo.length) / tone(hi, f, 4800, hi.length)), want = 20 * Math.log10(H(fc) / H(fcHi));
    assert.ok(Math.abs(got - want) < 0.5, `n=${j + 1}: ${got.toFixed(2)} vs ${want.toFixed(2)} dB`);
  }
});
test('EQ: shelves and mid peak follow their analog RC prototypes', () => {
  const flat = note(P(), 52, 0.7, 0.6), eq = note(P({ bass: 12, mid: -9, treble: 9 }), 52, 0.7, 0.6), km = keyModel(52, P());
  const H = (f) => { // analog: (s + gω)/(s + ω) · RBJ peak · (gs + ω)/(s + ω)
    const s = f, gb = 10 ** (12 / 20), gt = 10 ** (9 / 20), A = 10 ** (-9 / 40), Q = EQ.midQ, u = f / EQ.mid;
    const lo = Math.hypot(s, gb * EQ.bass) / Math.hypot(s, EQ.bass), hi = Math.hypot(gt * s, EQ.treble) / Math.hypot(s, EQ.treble);
    const pk = Math.hypot(1 - u * u, (u * A) / Q) / Math.hypot(1 - u * u, u / (A * Q));
    return 20 * Math.log10(lo * pk * hi);
  };
  for (const j of [0, 5, 12, 20]) {
    const f = km.partials[j].f, got = 20 * Math.log10(tone(eq, f, 4800, eq.length) / tone(flat, f, 4800, flat.length));
    assert.ok(Math.abs(got - H(f)) < 0.5, `${f.toFixed(0)} Hz: ${got.toFixed(2)} vs ${H(f).toFixed(2)} dB`);
  }
});
test('dampers: release stops a note ≥ 40 dB in 0.5 s; the pedal holds it; no dampers above E6', () => {
  const rms = (x, t) => { let s = 0; const a = Math.round(t * FS); for (let i = a; i < a + 2400; i++) s += x[i] * x[i]; return Math.sqrt(s) + 1e-12; };
  const rel = render(P(), [[0, 'on', 60, 0.7], [0.3, 'off', 60]], 0.9).x;
  assert.ok(20 * Math.log10(rms(rel, 0.25) / rms(rel, 0.8)) > 40, 'damped');
  const sus = render(P(), [[0, 'sus', true], [0, 'on', 60, 0.7], [0.3, 'off', 60]], 0.9).x;
  assert.ok(20 * Math.log10(rms(sus, 0.25) / rms(sus, 0.8)) < 6, 'pedal');
  const top = render(P(), [[0, 'on', 92, 0.7], [0.3, 'off', 92]], 0.9).x;
  assert.ok(20 * Math.log10(rms(top, 0.25) / rms(top, 0.8)) < 10, 'undamped treble');
  const { e } = render(P(), [[0, 'on', 60, 0.7], [0.2, 'off', 60]], 2.5);
  assert.equal(e.voiceCount(), 0, 'voice freed after release');
});
test('a key struck again after a physics knob moved does not double: the old voice fades out', () => {
  for (const [key, ev] of [[60, [[0, 'sus', true], [0, 'on', 60, 0.7], [0.1, 'off', 60]]], [92, [[0, 'on', 92, 0.7], [0.1, 'off', 92]]]]) {
    const { e } = render(P(), [...ev, [1.0, 'params', P({ detune: 1.3 })], [1.0, 'on', key, 0.7], [1.1, 'off', key]], 1.5);
    assert.equal(e.voices.filter((v) => v.key === key).length, 1, `key ${key}`);
  }
});
test('repetition: the hammer needs ~60 ms to come back, so a blow every 11 ms does not pump the string', () => {
  // the linear string: the peak depends on where in its cycle each blow lands, and tension
  // modulation's glide moves those phases (within the same spread as other blow intervals)
  const p = P({ kc: false }), single = render(p, [[0, 'on', 28, 1]], 0.4).pk;
  const ev = [[0, 'sus', true]];
  for (let i = 0; i < 30; i++) ev.push([i * 0.011, 'on', 28, 1]);
  const fast = render(p, ev, 0.65), struck = fast.e.voices[0].struck;
  assert.ok(fast.pk < 1.6 * single, `peak ${fast.pk.toFixed(3)} vs one blow ${single.toFixed(3)}`);
  assert.ok(struck > 0.25 * FS, 'later blows still land once the hammer is back');
});
test('hammer: contact 0.5–5 ms, shorter when the felt is harder or the blow faster', () => {
  const contact = (o, vel) => { const { e } = render(P(o), [[0, 'on', 60, vel]], 0.03); return (e.voices[0].contactSamples / FS) * 1000; };
  const mf = contact({}, 0.7), hard = contact({ hardness: 4 }, 0.7), ff = contact({}, 1), pp = contact({}, 0.2);
  assert.ok(mf > 0.5 && mf < 5, `${mf} ms`);
  assert.ok(hard < mf && ff < mf && pp > mf, `hard ${hard.toFixed(2)}, ff ${ff.toFixed(2)}, mf ${mf.toFixed(2)}, pp ${pp.toFixed(2)} ms`);
});
test('the CP-80\'s keys past the CP-70\'s E1–E7: the wire\'s stress held at E7\'s, the blow at about two periods, so C8 speaks with E7', () => {
  const e7 = keyModel(CP70[1], P()).S;
  for (let m = CP70[1] + 1; m <= KEY_HI; m++) {
    const S = keyModel(m, P()).S; // a plain wire's stress is 4ρ(Lf)², whatever its gauge
    assert.ok(Math.abs(S.stress / e7.stress - 1) < 0.02, `key ${m}: ${(100 * S.stress / STEEL.strength).toFixed(1)} % of breaking, E7 ${(100 * e7.stress / STEEL.strength).toFixed(1)} %`);
  }
  const blow = (m) => { const { x, e } = render(P(), [[0, 'on', m, 0.8]], 0.06); let s = 0; for (const v of x) s += v * v; return { periods: (e.voices[0].contactSamples / FS) * keyModel(m, P()).S.f0, db: 10 * Math.log10(s) }; };
  const top = blow(KEY_HI), mid = blow(CP70[1]);
  assert.ok(top.periods < 2.5 && Math.abs(top.db - mid.db) < 6, `C8: contact ${top.periods.toFixed(2)} periods, ${(top.db - mid.db).toFixed(1)} dB re E7`);
  for (const m of [KEY_LO, KEY_HI]) for (const fs of [44100, 48000]) {
    const { x } = render(P(), [[0, 'on', m, 1]], 0.3, fs);
    assert.ok(x.every(Number.isFinite), `key ${m} at ${fs} Hz: NaN`);
  }
  console.log(`        (C8: ${(100 * keyModel(KEY_HI, P()).S.stress / STEEL.strength).toFixed(1)} % of breaking, contact ${top.periods.toFixed(2)} periods, ${(top.db - mid.db).toFixed(1)} dB re E7)`);
});
test('level: a forte note peaks within 0.1–0.6 (either channel) across the keyboard, on either mount, at 44.1 and 48 kHz', () => {
  for (const fs of [44100, 48000]) for (const mount of ['frame', 'board']) for (const m of [21, 28, 34, 40, 46, 52, 58, 63, 70, 76, 82, 88, 94, 100, 104, 108]) {
    const { pk } = render(P({ mount }), [[0, 'on', m, 1]], 0.25, fs);
    assert.ok(pk > 0.1 && pk < 0.6, `${fs} Hz ${mount} key ${m}: ${pk.toFixed(3)}`);
  }
});
test('the soundboard microphones: about as loud as the piezo on a phrase (mono or stereo), and in phase at the two mics', () => {
  const keys = [40, 52, 60, 67, 76, 88], ev = [];
  keys.forEach((k, i) => ev.push([i * 0.4, 'on', k, 0.6], [i * 0.4 + 0.35, 'off', k]));
  [48, 55, 64, 67].forEach((k) => ev.push([2.4, 'on', k, 0.9], [3.4, 'off', k]));
  const lv = (o) => {
    const e = new GrandEngine(FS); e.setParams(P(o));
    const [L, R] = renderEngine(e, 3.7, ev, FS);
    let m = 0, st = 0, lr = 0, ll = 0, rr = 0;
    for (let i = 0; i < L.length; i++) { m += (0.5 * (L[i] + R[i])) ** 2; st += 0.5 * (L[i] ** 2 + R[i] ** 2); lr += L[i] * R[i]; ll += L[i] ** 2; rr += R[i] ** 2; }
    return { mono: 10 * Math.log10(m), stereo: 10 * Math.log10(st), corr: lr / Math.sqrt(ll * rr) };
  };
  const pz = lv({}), mic = lv({ mount: 'board', listen: 1 });
  assert.ok(Math.abs(mic.mono - pz.mono + 4) < 2 && Math.abs(mic.stereo - pz.stereo + 4) < 2 && mic.corr > 0.5,
    `mic re piezo: mono ${(mic.mono - pz.mono).toFixed(1)} dB, stereo ${(mic.stereo - pz.stereo).toFixed(1)} dB, L/R correlation ${mic.corr.toFixed(2)}`);
  console.log(`        (microphones re piezo: ${(mic.mono - pz.mono).toFixed(1)} dB mono, ${(mic.stereo - pz.stereo).toFixed(1)} dB stereo; L/R correlation ${mic.corr.toFixed(2)})`);
});
test('soundboard above its modal band: the residual path matches the plate\'s full modal sum (9–16 mm boards, 6–16 kHz)', () => {
  const band = (B, f1, f2) => { let e = 0, n = 0; for (let f = f1; f < f2; f += 7) for (let seg = 0; seg < 3; seg++) for (let mic = 0; mic < 2; mic++) { e += boardResponse(B, seg, f, mic) ** 2; n++; } return 10 * Math.log10(e / n); };
  for (const h of [9, 14]) {
    const B = boardModel(P({ boardH: h }));
    const X = boardModel(P({ boardH: h }), { fmax: 25000, maxModes: 9000 }); // the same plate, every mode to 25 kHz
    const nores = { ...B, residual: false };
    for (const [f1, f2] of [[6000, 7500], [7500, 9000], [9000, 12000], [12000, 16000]]) {
      const d = band(B, f1, f2) - band(X, f1, f2);
      assert.ok(Math.abs(d) < 1.5, `${h} mm, ${f1 / 1000}–${f2 / 1000} kHz: ${d.toFixed(1)} dB (without the residual ${(band(nores, f1, f2) - band(X, f1, f2)).toFixed(1)} dB)`);
    }
  }
});
test('sympathetic strings: an undamped key rings along where its partials meet the sounding ones, never with its own voice; a damped one, or after Panic, stays still', () => {
  // keys held (struck softly) and staccato notes struck hard, the pedal up or down, after every
  // key's group has been made (one a block); each key's group's energy after `sec` s
  const run = ({ held = [], strike = [], pedal = false, sec = 1, panic = false, ...o } = {}) => {
    const e = new GrandEngine(FS);
    e.setParams(P({ sympathy: 0.25, ...o }));
    const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
    for (let b = 0; b < 100; b++) e.process(L, R, bl);
    e.setSustain(pedal);
    for (const k of held) e.noteOn(k, 0);
    for (const k of strike) e.noteOn(k, 0.9);
    let peak = 0;
    for (let b = 0; b < Math.round((sec * FS) / bl); b++) {
      if (b === Math.round((0.3 * FS) / bl)) for (const k of strike) e.noteOff(k);
      if (panic && b === Math.round((0.6 * FS) / bl)) e.allNotesOff();
      e.process(L, R, bl);
      for (let i = 0; i < bl; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
    return { E: (k) => e.sympathetic(k).energy, size: (k) => e.sympathetic(k).size, damped: (k) => e.sympathetic(k).damped, running: e.sympatheticRunning(), peak };
  };
  const c4 = run({ held: [60], strike: [48] }), cs4 = run({ held: [61], strike: [48] });
  for (const k of [KEY_LO, 60, 100]) assert.ok(c4.size(k) > 0, `key ${k} has no group`); // (C8's fundamental is above 4 kHz: none)
  assert.ok(c4.E(60) > 30 * cs4.E(61), `C4 held, C3 struck: C4's group ${c4.E(60).toExponential(2)}; C♯4 held: ${cs4.E(61).toExponential(2)}`);
  assert.ok(c4.E(61) === 0 && c4.damped(61), `C♯4, not held: ${c4.E(61).toExponential(2)}`);
  const own = run({ held: [48] }), pair = run({ held: [48, 60] });
  assert.ok(own.E(48) < 1e-2 * pair.E(60), `C3 held: its own group ${own.E(48).toExponential(2)}; C4's, held with it, ${pair.E(60).toExponential(2)}`);
  assert.ok(!c4.damped(100) && c4.E(100) > 0, 'the keys above E6 have no dampers: they ring along');
  const ped = run({ strike: [48], pedal: true });
  assert.ok(ped.E(60) > 30 * cs4.E(61) && !ped.damped(30), `the pedal lifts every damper: C4's group ${ped.E(60).toExponential(2)}`);
  const off = run({ held: [60], strike: [48], sympathy: 0 });
  assert.ok(off.running === 0 && off.E(60) === 0, 'off: no group runs');
  const hush = run({ strike: [36, 40, 43], pedal: true, panic: true });
  for (const k of [48, 60, 100]) assert.ok(hush.E(k) === 0, `after Panic: key ${k}'s group ${hush.E(k)}`);
  const board = run({ held: [60], strike: [48], mount: 'board' });
  assert.ok(board.E(60) > 5 * c4.E(60), `a soundboard couples the strings more than the iron frame: ${board.E(60).toExponential(2)} vs ${c4.E(60).toExponential(2)}`);
  for (const mount of ['frame', 'board']) {
    const loud = run({ strike: [36, 40, 43, 48, 52, 55, 60], pedal: true, sympathy: 1, sec: 2, mount });
    assert.ok(Number.isFinite(loud.peak) && loud.peak < 2, `a pedalled chord at 100 % (${mount}): peak ${loud.peak}`);
  }
  console.log(`        (C3 struck: held C4's group ${(c4.E(60) / cs4.E(61)).toFixed(0)} × held C♯4's, ${(board.E(60) / c4.E(60)).toFixed(0)} × more on a soundboard; ${ped.running} partials ring with the pedal down)`);
});
test('Quality: Medium and Low strike voices with fewer partials (none above 6 and 4.5 kHz but the first 8, none from the 80th and 56th), hold a lower ceiling under the page\'s budget, give the sympathetic strings 3 partials and none; a note keeps its pitch and level', () => {
  const fTop = { high: Infinity, medium: 6000, low: 4500 }, nTop = { high: Infinity, medium: 80, low: 56 };
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  const engine = (quality) => {
    const e = new GrandEngine(FS);
    e.setQuality(quality); e.setParams(P());
    for (let b = 0; b < 100; b++) e.process(L, R, bl); // (every key's group made, one a block)
    return e;
  };
  // the partials a strike sets going: a prefix of each polarisation's, partial by partial
  const want = (d, q) => {
    const top = (i0, i1) => { let i = i0; while (i < i1 && d.idx[i] < nTop[q] && (d.freq[i] < fTop[q] || d.idx[i] <= 8)) i += d.ns; return i - i0; };
    return top(0, d.nV) + top(d.nV, d.n);
  };
  const chord = [28, 31, 36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84];
  const res = {};
  for (const q of ['high', 'medium', 'low']) {
    const e = engine(q);
    e.setSustain(true);
    let modes = 0, full = 0;
    for (const k of chord) {
      const v = e.noteOn(k, 0.9);
      assert.equal(v.active, want(v.data, q), `${q}: key ${k} sets ${v.active} of ${v.N} modes going`);
      modes += v.active; full += v.N;
    }
    for (let b = 0; b < Math.round((0.5 * FS) / bl); b++) {
      e.process(L, R, bl);
      for (let i = 0; i < bl; i++) assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), `${q}: not finite`);
    }
    const size = Math.max(...chord.map((k) => e.sympathetic(k).size));
    res[q] = { modes, full, sym: e.sympatheticRunning(), size };
    // the ceiling: Low holds 1400 oscillators, and a page's budget below it still rules
    if (q === 'low') {
      for (let k = 30; k <= 90; k += 2) e.noteOn(k, 0.9);
      let total = 0; for (const u of e.voices) if (!u.killing) total += u.active;
      assert.ok(total <= 1400, `Low: ${total} oscillators sounding`);
      e.handle({ type: 'budget', modes: 1000 });
      total = 0; for (const u of e.voices) if (!u.killing) total += u.active;
      assert.ok(total <= 1000, `Low: ${total} oscillators after the page's budget fell to 1000`);
    }
    e.destroy();
  }
  assert.ok(res.medium.modes < 0.85 * res.high.modes && res.low.modes < 0.7 * res.high.modes, `modes ${res.high.modes}, ${res.medium.modes}, ${res.low.modes}`);
  assert.ok(res.high.size === 16 && res.medium.size === 3 && res.low.size === 0 && res.high.sym > 600 && res.medium.sym <= 3 * 88 && res.low.sym === 0,
    `sympathetic strings: ${res.high.size}, ${res.medium.size}, ${res.low.size} partials, ${res.high.sym}, ${res.medium.sym}, ${res.low.sym} running`);
  // single notes: the same pitch (a fraction of a cent) and level (within 1 dB)
  const dB = [], dc = [];
  for (const key of [28, 52, 76]) {
    const x = {};
    for (const q of ['high', 'medium', 'low']) {
      const e = engine(q), n = FS, out = new Float64Array(n);
      e.noteOn(key, 0.9);
      for (let s = 0; s < n; s += bl) { e.process(L, R, bl); for (let i = 0; i < bl && s + i < n; i++) out[s + i] = L[i] + R[i]; }
      e.destroy();
      x[q] = { rms: Math.sqrt(out.reduce((a, v) => a + v * v, 0) / n), f: peakFreq(out, keyFreq(key), 4800, n) };
    }
    for (const q of ['medium', 'low']) {
      dB.push(20 * Math.log10(x[q].rms / x.high.rms)); dc.push(cents(x[q].f, x.high.f));
      assert.ok(Math.abs(dB.at(-1)) < 1, `key ${key}, ${q}: ${dB.at(-1).toFixed(2)} dB`);
      assert.ok(Math.abs(dc.at(-1)) < 0.1, `key ${key}, ${q}: ${dc.at(-1).toFixed(3)} ¢`);
    }
  }
  console.log(`        (pedalled chord: ${res.high.modes} → ${res.medium.modes} → ${res.low.modes} oscillators, ${res.high.sym} → ${res.medium.sym} → ${res.low.sym} sympathetic partials; notes within ${Math.max(...dB.map(Math.abs)).toFixed(2)} dB, ${Math.max(...dc.map(Math.abs)).toFixed(3)} ¢)`);
});
test('stability: every parameter at its min and max gives finite, bounded output', () => {
  const ps = GROUPS.flatMap((g) => g.params);
  const cases = [];
  for (const p of ps) {
    if (p.type === 'select') for (const [v] of p.options) cases.push({ [p.id]: v });
    else if (p.type !== 'checkbox') cases.push({ [p.id]: p.min }, { [p.id]: p.max });
  }
  for (const c of cases) for (const mount of ['frame', 'board']) {
    const { x, e } = render(P({ mount, ...c }), [[0, 'on', 28, 1], [0, 'on', 64, 1], [0, 'on', 100, 1], [0.15, 'off', 64]], 0.3);
    e.destroy(); // its WebAssembly memory: the cases (the tuning's among them) would exhaust it
    const pk = peak(x) / 2;
    assert.ok(Number.isFinite(pk) && pk < 1.5, `${JSON.stringify(c)} ${mount}: peak ${pk}`);
    if (c.volume === undefined) assert.ok(pk > 1e-3, `${JSON.stringify(c)} ${mount}: silent (${pk})`);
  }
});
test('CPU: 10 voices, and a pedalled 25-note arpeggio, render in ≤ 30 % of real time', () => {
  const keys = [28, 33, 40, 43, 48, 52, 55, 60, 64, 67];
  let t0 = performance.now();
  render(P(), keys.map((k) => [0, 'on', k, 0.8]), 4);
  const load = (performance.now() - t0) / 4000;
  const arp = []; for (let k = 36; k <= 84; k += 2) arp.push(k);
  t0 = performance.now();
  render(P(), [[0, 'sus', true], ...arp.map((k, i) => [i * 0.05, 'on', k, 0.7])], 3);
  const load2 = (performance.now() - t0) / 3000;
  console.log(`        (10 bass-heavy voices: ${(100 * load).toFixed(1)} %, pedalled 25-note arpeggio: ${(100 * load2).toFixed(1)} % of real time)`);
  assert.ok(load < 0.3 && load2 < 0.3, `${(100 * load).toFixed(1)} %, ${(100 * load2).toFixed(1)} %`);
});
test('CPU follows the sound: died-away partials stop being integrated; the page can lower the oscillator budget', () => {
  const e = new GrandEngine(FS); e.setParams(P()); e.setSustain(true);
  const v = e.noteOn(60, 0.8), L = new Float32Array(128), R = new Float32Array(128), full = v.active;
  for (let i = 0; i < 3 * FS / 128; i++) e.process(L, R, 128);
  const later = v.active;
  e.noteOn(60, 0.8);
  assert.ok(later < 0.8 * full && v.active === full, `C4 integrates ${full} → ${later} oscillators after 3 s; ${v.active} once struck again`);
  for (let k = 36; k <= 84; k += 3) e.noteOn(k, 0.8);
  e.handle({ type: 'budget', modes: 1000 });
  let total = 0; for (const u of e.voices) if (!u.killing) total += u.active;
  assert.ok(total <= 1000, `${total} oscillators after the budget fell to 1000`);
});

console.log(`\n${((performance.now() - t00) / 1000).toFixed(1)} s`);
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
