// Electric grand checks. Run: node test/grand-tests.mjs
//
// First the physics against independent results (stiff-string dispersion,
// transmission-line end conditions, the infinite-plate admittance, Weyl's
// mode count, the Rayleigh integral), then the engine against the model.

import assert from 'node:assert/strict';
import {
  stringScale, partialFreq, cpLength, stringCount, keyModel, boardModel, boardMobility, sinFT, keyFreq, STEEL, BOARD, KEY_LO, KEY_HI,
} from '../grand/src/grand-model.js';
import { GrandEngine, C_PIEZO, EQ } from '../grand/src/grand-engine.js';
import { DEFAULTS, GROUPS } from '../grand/src/grand-params.js';

const FS = 48000, TAU = 2 * Math.PI;
let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'sus', on]),
// in 128-sample blocks like the AudioWorklet. Returns the mono sum (L + R) and the engine.
function render(params, events, sec) {
  const e = new GrandEngine(FS);
  e.setParams(params);
  const n = Math.round(sec * FS), x = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  let j = 0, pk = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < events.length && Math.round(events[j][0] * FS) <= s) {
      const [, type, a, b] = events[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else e.setSustain(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { x[s + i] = bL[i] + bR[i]; pk = Math.max(pk, Math.abs(bL[i]), Math.abs(bR[i])); }
  }
  return { x, e, pk };
}
const note = (params, key, vel, sec) => render(params, [[0, 'on', key, vel]], sec).x;
// Amplitude of frequency f in x[a, b) (Hann-windowed DTFT).
function tone(x, f, a, b) {
  const w = (TAU * f) / FS; let re = 0, im = 0;
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
test('stiff string: fₙ = n f₀√(1+Bn²)/√(1+B), B = π³Ed⁴/(64TL²), f₁ on 12-TET (Fletcher 1964)', () => {
  for (const scale of ['cp70', 'concert']) for (const m of [28, 45, 60, 84, 100]) {
    const S = stringScale(m, P({ scale }));
    const B = (Math.PI ** 3 * STEEL.E * S.d ** 4) / (64 * S.T * S.L ** 2);
    assert.ok(Math.abs(S.B / B - 1) < 1e-9, `B ${S.B} vs ${B}`);
    assert.ok(Math.abs(cents(partialFreq(S, 1), keyFreq(m))) < 1e-6, 'f₁ on pitch');
    for (const n of [2, 5, 13]) {
      const want = (n * S.f0 * Math.sqrt(1 + B * n * n)) / Math.sqrt(1 + B);
      assert.ok(Math.abs(cents(partialFreq(S, n), want)) < 1e-6, `${m} n=${n}`);
    }
  }
});
test('CP-70 scale: 0.68 m bass (published: 26¾ in), 15 single-string keys, wire well below breaking', () => {
  assert.ok(Math.abs(cpLength(28) - 0.679) < 0.005, `${cpLength(28)}`);
  let mono = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    if (stringCount(m, 'cp70') === 1) mono++;
    const S = stringScale(m, P());
    assert.ok(S.stress < 0.5 * STEEL.strength, `key ${m}: ${(S.stress / STEEL.strength).toFixed(2)} of breaking`);
  }
  assert.equal(mono, 15);
  assert.ok(stringScale(28, P()).wound && !stringScale(60, P()).wound);
});
test('short bass strings are ~40× more inharmonic than a concert grand\'s: B ∝ d⁴/(T L²)', () => {
  const cp = stringScale(28, P()), cg = stringScale(28, P({ scale: 'concert' }));
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
    const B = boardModel(P({ boardH: h })), mb = B.mb;
    B.mb = 1e-12; // without the bridge's mass
    for (let seg = 0; seg < 3; seg++) {
      let s = 0, n = 0;
      for (let f = 300; f < 1500; f += 0.5) { s += boardMobility(B, seg, f)[0]; n++; }
      assert.ok(Math.abs(s / n / B.Ginf - 1) < 0.08, `h=${h} seg ${seg}: ${(s / n).toExponential(2)} vs ${B.Ginf.toExponential(2)}`);
    }
    B.mb = mb;
  }
});
test('soundboard modes: f₁₁ = (π/2)√(D/ρh)(a⁻² + b⁻²); count N(f) ≈ (S/2)√(ρh/D)·f (Weyl)', () => {
  const B = boardModel(P()), { a, b } = BOARD;
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
    const kl = (B.omega[k] / BOARD.c) * BOARD.ell, R = Math.abs(B.RL[k]) / (kl / Math.hypot(1, kl)); // baffled value
    if (B.m[k] % 2 && B.n[k] % 2) { odd += R; no++; } else { even += R; ne++; }
  }
  assert.ok(even / ne < 0.3 * (odd / no), `even ${even / ne} vs odd–odd ${odd / no}`);
});

console.log('engine');
test('every key within ±3 ¢ of 12-TET A440 (measured from the output)', () => {
  let worst = 0, wk = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    // 1.2 s windows: long enough to resolve the unison pair rather than track its beating
    const x = note(P(), m, 0.6, 1.3), f = peakFreq(x, keyFreq(m), Math.round(0.1 * FS), x.length);
    const c = Math.abs(cents(f, keyFreq(m)));
    if (c > worst) { worst = c; wk = m; }
  }
  assert.ok(worst < 3, `worst ${worst.toFixed(2)} ¢ at key ${wk}`);
  console.log(`        (worst ${worst.toFixed(2)} ¢ at key ${wk})`);
});
test('the zing is in the output: E1\'s 10th partial at the model\'s +159 ¢ (concert scale: +5 ¢)', () => {
  for (const scale of ['cp70', 'concert']) {
    const p = P({ scale }), km = keyModel(28, p), want = km.partials[9].f;
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
test('one string on a stiff bridge decays at σ_int + G(T + EIk²)/L', () => {
  const p = P({ stringing: 'single', tilt: 0, gFrame: 1e-3 }), km = keyModel(60, p), x = note(p, 60, 0.7, 1.6);
  for (const j of [0, 2]) {
    const pp = km.partials[j], want = pp.sigInt + pp.bridgeV, got = decay(x, pp.f, 0.3, 1.2);
    assert.ok(Math.abs(got / want - 1) < 0.05, `n=${j + 1}: ${got.toFixed(3)} vs ${want.toFixed(3)} s⁻¹`);
  }
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
  const S = stringScale(60, P()), want = cents(1 - S.T / (kH * S.L), 1);
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
test('hammer: contact 0.5–5 ms, shorter when the felt is harder or the blow faster', () => {
  const contact = (o, vel) => { const { e } = render(P(o), [[0, 'on', 60, vel]], 0.03); return (e.voices[0].contactSamples / FS) * 1000; };
  const mf = contact({}, 0.7), hard = contact({ hardness: 4 }, 0.7), ff = contact({}, 1), pp = contact({}, 0.2);
  assert.ok(mf > 0.5 && mf < 5, `${mf} ms`);
  assert.ok(hard < mf && ff < mf && pp > mf, `hard ${hard.toFixed(2)}, ff ${ff.toFixed(2)}, mf ${mf.toFixed(2)}, pp ${pp.toFixed(2)} ms`);
});
test('level: a forte note peaks within 0.1–0.6 (either channel) across the keyboard, on either mount', () => {
  for (const mount of ['frame', 'board']) for (const m of [28, 34, 40, 46, 52, 58, 64, 70, 76, 82, 88, 94, 100]) {
    const { pk } = render(P({ mount }), [[0, 'on', m, 1]], 0.25);
    assert.ok(pk > 0.1 && pk < 0.6, `${mount} key ${m}: ${pk.toFixed(3)}`);
  }
});
test('stability: every parameter at its min and max gives finite, bounded output', () => {
  const ps = GROUPS.flatMap((g) => g.params);
  const cases = [];
  for (const p of ps) {
    if (p.type === 'select') for (const [v] of p.options) cases.push({ [p.id]: v });
    else if (p.type !== 'checkbox') cases.push({ [p.id]: p.min }, { [p.id]: p.max });
  }
  for (const c of cases) for (const mount of ['frame', 'board']) {
    const x = render(P({ mount, ...c }), [[0, 'on', 28, 1], [0, 'on', 64, 1], [0, 'on', 100, 1], [0.15, 'off', 64]], 0.3).x;
    const pk = peak(x) / 2;
    assert.ok(Number.isFinite(pk) && pk < 1.5, `${JSON.stringify(c)} ${mount}: peak ${pk}`);
    if (c.volume === undefined) assert.ok(pk > 1e-3, `${JSON.stringify(c)} ${mount}: silent (${pk})`);
  }
});
test('CPU: 10 voices render in ≤ 30 % of real time', () => {
  const keys = [28, 33, 40, 43, 48, 52, 55, 60, 64, 67];
  const t0 = performance.now();
  render(P(), keys.map((k) => [0, 'on', k, 0.8]), 4);
  const load = (performance.now() - t0) / 4000;
  console.log(`        (10 bass-heavy voices: ${(100 * load).toFixed(1)} % of real time)`);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
