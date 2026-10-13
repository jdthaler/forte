// Reed piano checks. Run: node test/reeds-tests.mjs
//
// The physics against independent results (beam theory, the exact
// tip-mass frequency equation, Laplace's equation, circuit theory, energy
// conservation), then the engine against the model, then each advertised
// effect, then level, stability, clicks and CPU.

import assert from 'node:assert/strict';
import {
  reedFEM, tipMassRoots, tuneReed, keyModel, capCurve, capAt, pickupNode, electrostaticShift, hammerSpeed,
  STEEL, REED, PICKUP, KEY_LO, KEY_HI, keyFreq, EPS0, SLOT_GEOM,
} from '../reeds/src/reeds-model.js';
import { makeSlot, placeReed, solve, reedCharge, slotProfile } from '../reeds/src/slot-field.js';
import { SLOT_GAPS } from '../reeds/src/slot-table.js';
import { ReedEngine, Voice, traceStrike } from '../reeds/src/reeds-engine.js';
import { DEFAULTS, GROUPS } from '../reeds/src/reeds-params.js';

const FS = 48000, TAU = 2 * Math.PI;
let failures = 0;
const t00 = performance.now();
function test(name, fn) { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } }
const note = (s) => console.log(`        ${s}`);
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const DRY = { output: 'direct', drive: 0, tremDepth: 0 };
const cents = (a, b) => 1200 * Math.log2(a / b);
const dB = (a, b) => 20 * Math.log10(a / b);

// Render one note through the engine, 128-sample blocks like the AudioWorklet.
function render(key, params, vel, sec, { off = Infinity, sustain = false } = {}) {
  const e = new ReedEngine(FS);
  e.setParams(params); e.setSustain(sustain);
  e.noteOn(key, vel);
  const n = Math.round(sec * FS), L = new Float32Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  for (let s = 0; s < n; s += bl) {
    if (s <= off * FS && s + bl > off * FS) e.noteOff(key);
    e.process(bL, bR, bl); L.set(bL.subarray(0, Math.min(bl, n - s)), s);
  }
  return { L, e };
}
// Complex amplitude of frequency f in x[a, a + W) (Hann window).
function dft(x, f, a, W) {
  const w = (TAU * f) / FS; let re = 0, im = 0;
  for (let i = 0; i < W; i++) { const h = 0.5 - 0.5 * Math.cos((TAU * i) / W), v = h * x[a + i]; re += v * Math.cos(w * (a + i)); im -= v * Math.sin(w * (a + i)); }
  return { re, im, abs: Math.hypot(re, im), arg: Math.atan2(im, re) };
}
const amp = (x, f, a, W) => dft(x, f, a, W).abs;
// Frequency near f from the phase advance between two windows D samples apart.
function freqNear(x, f, a, W, D) {
  const p = dft(x, f, a, W), q = dft(x, f, a + D, W);
  let d = q.arg - p.arg; d -= TAU * Math.round(d / TAU);
  return f + (d * FS) / (TAU * D);
}
const peakOf = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };

console.log('reed mechanics');
test('FEM reed, no solder: f₁ = (1.8751²/2π)·√(EI/ρA)/L² and overtones at 6.267, 17.55, 34.39 × f₁', () => {
  const L = 0.04, r = reedFEM({ L, nModes: 4 }), c = Math.sqrt(r.EI / r.mu);
  const f1 = ((1.875104 ** 2) / TAU) * c / L ** 2;
  assert.ok(Math.abs(r.omega[0] / TAU / f1 - 1) < 1e-5, `f₁ ${r.omega[0] / TAU} vs ${f1}`);
  [6.2669, 17.5475, 34.3861].forEach((x, i) => assert.ok(Math.abs(r.omega[i + 1] / r.omega[0] / x - 1) < 1e-3, `mode ${i + 2}`));
  // a rectangular tongue: f₁ depends on the thickness h, not on the width
  const wide = reedFEM({ L, b: 2 * REED.b, nModes: 1 });
  assert.ok(Math.abs(wide.omega[0] / r.omega[0] - 1) < 1e-9);
  // mode 1 carries 61.3 % of the tongue's mass (modal effective mass, Γ₁²/m)
  assert.ok(Math.abs(r.Gamma[0] ** 2 / r.m - 0.6131) < 2e-3, `${r.Gamma[0] ** 2 / r.m}`);
});
test('FEM reed with a tip mass solves the exact frequency equation 1 + cos λ cosh λ + μλ(cos λ sinh λ − sin λ cosh λ) = 0', () => {
  for (const mu of [0.1, 0.5, 2, 8]) {
    const L = 0.03, m = STEEL.rho * REED.h * REED.b * L, r = reedFEM({ L, M: mu * m, nModes: 3 });
    const lam = tipMassRoots(mu, 3), c = Math.sqrt(r.EI / r.mu);
    lam.forEach((l, i) => assert.ok(Math.abs(r.omega[i] / ((l * l * c) / (L * L)) - 1) < 2e-4, `μ=${mu} mode ${i + 1}: ${r.omega[i] / ((l * l * c) / (L * L))}`));
  }
  const r2 = tipMassRoots(2, 2);
  note(`solder 2× the tongue's mass: λ₁ = ${r2[0].toFixed(4)}, mode 2 at ${((r2[1] / r2[0]) ** 2).toFixed(2)} × f₁ (bare reed: 6.27)`);
});
test('every key is cut to length so that its first mode is the note (model, < 0.01 ¢)', () => {
  let worst = 0, Lmin = 1, Lmax = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const r = tuneReed(m, 1, 1);
    worst = Math.max(worst, Math.abs(cents(r.omega[0] / TAU, keyFreq(m))));
    Lmin = Math.min(Lmin, r.L); Lmax = Math.max(Lmax, r.L);
  }
  assert.ok(worst < 0.01, `${worst} ¢`);
  note(`free lengths ${(Lmax * 1000).toFixed(1)} mm (A1) … ${(Lmin * 1000).toFixed(1)} mm (C7)`);
});
test('solder knob: the reed is re-cut, so the pitch stays; overtones move up and sustain shortens with a heavier blob', () => {
  const m = 57, light = keyModel(m, P({ solder: 0.2 })), def = keyModel(m, P()), heavy = keyModel(m, P({ solder: 3 }));
  for (const k of [light, def, heavy]) assert.ok(Math.abs(cents(k.modes[0].f, keyFreq(m))) < 0.01);
  assert.ok(light.modes[1].ratio < def.modes[1].ratio && def.modes[1].ratio < heavy.modes[1].ratio);
  const t60 = (k) => 6.91 / k.modes[0].sigma;
  assert.ok(t60(light) > t60(def) && t60(def) > t60(heavy));
  assert.ok(light.info.L > def.info.L && def.info.L > heavy.info.L);
  note(`A3 mode 2: ${light.modes[1].ratio.toFixed(2)} → ${def.modes[1].ratio.toFixed(2)} → ${heavy.modes[1].ratio.toFixed(2)} × f₁; T60 ${t60(light).toFixed(1)} → ${t60(def).toFixed(1)} → ${t60(heavy).toFixed(1)} s`);
});
test('hammer: a lossless strike conserves energy (reed + rebounding hammer = hammer before)', () => {
  const d = { ...keyModel(57, P({ hardness: 1 })).voice };
  d.sigma = new Float64Array(d.n); d.hammer = { ...d.hammer, alpha: 0 };
  const e = new ReedEngine(FS); e.setParams(P());
  e.kF = 0; // switch off the field's pull: no other forces
  const v = new Voice(e, 57, d), v0 = hammerSpeed(0.7), k = 1 / e.fs2, buf = new Float64Array(1);
  v.strike(v0);
  let vh = 0;
  for (let s = 0; s < 0.02 * e.fs2; s++) {
    const was = v.hammerOn; buf[0] = 0; v.render(buf, 1, e);
    if (was) vh = (v.eta - v.etaPrev) / k;
  }
  let Er = 0;
  for (let i = 0; i < v.N; i++) { // energy of each mode from two successive samples (unit modal mass)
    const c = Math.cos(v.om[i] * k), a = v.q[i], b = v.q1[i], A2 = (a * a - 2 * c * a * b + b * b) / Math.sin(v.om[i] * k) ** 2;
    Er += 0.5 * v.om[i] ** 2 * A2;
  }
  const E0 = 0.5 * d.hammer.mass * v0 * v0, Eh = 0.5 * d.hammer.mass * vh * vh;
  assert.ok(Math.abs((Er + Eh) / E0 - 1) < 1e-3, `reed ${Er.toExponential(3)} + hammer ${Eh.toExponential(3)} vs ${E0.toExponential(3)} J`);
  note(`A3 at ${v0.toFixed(1)} m/s: ${(100 * Er / E0).toFixed(0)} % of the hammer's energy goes into the reed, contact ${(v.contactSamples / e.fs2 * 1000).toFixed(2)} ms`);
});

console.log('pickup electrostatics');
test('slot solver: exact for the uniform field between full-height plates (C′ = 2ε₀·2H/g)', () => {
  const mm = 1e-3, S = makeSlot({ h: 2 * mm, b: 2.4 * mm, t: 2 * mm, g: 0.3 * mm, tooth: 2 * mm, H: 1 * mm, frame: 'neumann' }, 0.05 * mm);
  placeReed(S, 0); solve(S, 1e-12);
  assert.ok(Math.abs(reedCharge(S) / EPS0 / (2 * 2 / 0.3) - 1) < 1e-6);
});
test('Laplace table: matches a fresh solve between tabulated gaps; C(y) even, largest level with the comb', () => {
  const g = 0.25, ys = [0, 0.5e-3, 1e-3, 2e-3];
  const fresh = slotProfile({ ...SLOT_GEOM, g: g * 1e-3 }, ys, 0.05e-3, 1e-7).map((c) => c * PICKUP.ell);
  const T = capCurve(g);
  ys.forEach((y, i) => assert.ok(Math.abs(capAt(T, y).C / fresh[i] - 1) < 0.03, `y=${y * 1e3} mm: ${capAt(T, y).C} vs ${fresh[i]}`));
  for (const y of [0.3e-3, 1.1e-3, 2.5e-3]) assert.ok(Math.abs(capAt(T, y).C / capAt(T, -y).C - 1) < 1e-6);
  for (let y = 0.05e-3; y < 4e-3; y += 0.05e-3) assert.ok(capAt(T, y).dC < 0, `C falls as the reed leaves the comb (y=${y})`);
  note(`gap ${g} mm: C(0) = ${(capAt(T, 0).C * 1e12).toFixed(3)} pF, C(1 mm) = ${(capAt(T, 1e-3).C * 1e12).toFixed(3)} pF (ℓ = ${PICKUP.ell * 1e3} mm)`);
});
test('narrow gaps approach the parallel-plate value 2ε₀ h/g; wide gaps are all fringe', () => {
  const r = SLOT_GAPS.map((g) => capAt(capCurve(g), 0).C / (EPS0 * PICKUP.ell) / ((2 * REED.h) / (g * 1e-3))); // C′/(2ε₀h/g)
  for (let i = 1; i < r.length; i++) assert.ok(r[i] > r[i - 1], 'fringe share grows with the gap');
  assert.ok(r[0] < 1.8 && r[0] > 1, `${r[0]}`);
  note(`C′(0) / (2ε₀h/g): ${SLOT_GAPS.map((g, i) => `${g} mm ${r[i].toFixed(2)}`).join(', ')}`);
  // in the engine: a narrower gap is louder, but the shape of C(y), so the bark, barely changes
  const m = 57, f = keyFreq(m), a = Math.round(0.1 * FS), W = Math.round(0.3 * FS);
  const at = (gap) => { const { L } = render(m, P({ ...DRY, gap }), 0.7, 0.45); return { pk: peakOf(L), h2: dB(amp(L, 2 * f, a, W), amp(L, f, a, W)) }; };
  const narrow = at(0.15), wide = at(0.6);
  assert.ok(narrow.pk > 2 * wide.pk && Math.abs(narrow.h2 - wide.h2) < 3, `peaks ${narrow.pk} vs ${wide.pk}, H2 ${narrow.h2} vs ${wide.h2}`);
});
test('comb node: v = −V δC/C₀ above the corner (constant charge), −V R dC/dt below it (constant voltage)', () => {
  // drive the engine's node update with a sinusoidal δC and compare with the exact high-pass
  for (const [rb, f] of [[22, 440], [22, 20], [0.5, 220], [5, 55]]) {
    const e = new ReedEngine(FS); e.setParams(P({ rbias: rb }));
    const k = 1 / e.fs2, n = Math.round(0.5 * e.fs2), dC0 = 1e-14;
    let u = 0, xp = 0, a = 0;
    for (let s = 0; s < n; s++) {
      const x = dC0 * Math.sin(TAU * f * s * k);
      u = e.nodeA * u + e.nodeB * (x - xp); xp = x;
      if (s > n / 2) a = Math.max(a, Math.abs(u));
    }
    const { tau } = pickupNode(P({ rbias: rb })), wt = TAU * f * tau, H = wt / Math.hypot(1, wt);
    const want = (DEFAULTS.bias * dC0 / PICKUP.C0) * H;
    assert.ok(Math.abs(a / want - 1) < 0.01, `R ${rb} MΩ, ${f} Hz: ${a} vs ${want}`);
  }
  const { fc } = pickupNode(P());
  note(`22 MΩ × ${PICKUP.C0 * 1e12} pF: corner ${fc.toFixed(1)} Hz, so A1 (55 Hz) is at ωτ = ${(55 / fc).toFixed(2)} and the rest of the keys are in the constant-charge regime`);
});

console.log('engine');
test('every key is within ±3 ¢ of 12-TET A440 in the engine output', () => {
  let worst = 0, wk = 0;
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const f = keyFreq(m), { L } = render(m, P(DRY), 0.5, 0.75);
    const fm = freqNear(L, f, Math.round(0.08 * FS), Math.round(0.3 * FS), Math.round(0.3 * FS));
    const c = Math.abs(cents(fm, f));
    if (c > worst) { worst = c; wk = m; }
  }
  assert.ok(worst < 3, `key ${wk}: ${worst.toFixed(3)} ¢`);
  note(`worst key ${wk}: ${worst.toFixed(3)} ¢`);
});
test('overtones sit at the FEM modes (A2: mode 2 and 3 present at their frequencies, not at harmonics)', () => {
  const m = 45, k = keyModel(m, P()), { L } = render(m, P(DRY), 0.25, 0.4);
  for (const md of k.modes.slice(1, 3)) {
    const a = Math.round(0.004 * FS), W = Math.round(0.08 * FS);
    const on = amp(L, md.f, a, W), off = amp(L, md.f * 1.025, a, W);
    assert.ok(on > 8 * off, `mode ${md.n + 1} at ${md.f.toFixed(0)} Hz: ${on} vs ${off}`);
  }
});
test('the fundamental decays at the model\'s rate (soft note, linear pickup)', () => {
  for (const m of [45, 69]) {
    const k = keyModel(m, P()), f = keyFreq(m), sig = k.modes[0].sigma, { L } = render(m, P(DRY), 0.1, 1.6);
    const W = Math.round(0.2 * FS), a = Math.round(0.3 * FS), b = Math.round(1.3 * FS);
    const meas = dB(amp(L, f, b, W), amp(L, f, a, W)), want = (-20 * sig * (b - a)) / FS / Math.LN10;
    assert.ok(Math.abs(meas - want) < 0.6, `${m}: ${meas.toFixed(2)} dB vs ${want.toFixed(2)} dB over 1 s`);
  }
});
test('the field pulls the reed: the pitch shift between 10 V and 600 V matches ½k_E/k with k_E = −½V²C″', () => {
  const m = 33, o = { ...DRY, offset: 0.15 }, f = keyFreq(m); // near the top of C(y), where C″ is largest
  const fq = (bias) => { const { L } = render(m, P({ ...o, bias }), 0.05, 1.4); return freqNear(L, f, Math.round(0.2 * FS), Math.round(0.4 * FS), Math.round(0.7 * FS)); };
  const meas = cents(fq(600), fq(10)), k = keyModel(m, P(o));
  const want = electrostaticShift(k, P({ ...o, bias: 600 })).cents - electrostaticShift(k, P({ ...o, bias: 10 })).cents;
  assert.ok(Math.abs(meas - want) < 0.15 * Math.abs(want) + 0.002, `${meas.toFixed(4)} ¢ vs ${want.toFixed(4)} ¢`);
  note(`A1, reed 0.15 mm above the comb's mid-plane: ${meas.toFixed(3)} ¢ measured, ${want.toFixed(3)} ¢ predicted; at 150 V: ${electrostaticShift(k, P(o)).cents.toFixed(4)} ¢`);
});

console.log('effects');
test('bark: harder strikes swing further over C(y), raising the 2nd harmonic', () => {
  const m = 57, f = keyFreq(m);
  const h2 = (vel) => { const { L } = render(m, P(DRY), vel, 0.6); const a = Math.round(0.1 * FS), W = Math.round(0.4 * FS); return dB(amp(L, 2 * f, a, W), amp(L, f, a, W)); };
  const soft = h2(0.1), hard = h2(1);
  assert.ok(hard > soft + 15, `soft ${soft.toFixed(1)} dB, hard ${hard.toFixed(1)} dB`);
  note(`A3 2nd harmonic re fundamental: pp ${soft.toFixed(1)} dB → ff ${hard.toFixed(1)} dB`);
});
test('a reed centred in the slot: C(y) is even, so the fundamental cancels and the octave remains', () => {
  const m = 57, f = keyFreq(m), { L } = render(m, P({ ...DRY, offset: 0 }), 0.6, 0.6), a = Math.round(0.1 * FS), W = Math.round(0.4 * FS);
  const r = dB(amp(L, 2 * f, a, W), amp(L, f, a, W));
  assert.ok(r > 25, `octave/fundamental ${r.toFixed(1)} dB`);
});
test('constant voltage (small feed resistor) differentiates: bass fundamental falls by the predicted |H|', () => {
  const m = 33, f = keyFreq(m), a = Math.round(0.1 * FS), W = Math.round(0.3 * FS);
  const lev = (rb) => amp(render(m, P({ ...DRY, rbias: rb }), 0.1, 0.45).L, f, a, W);
  const H = (rb) => { const wt = TAU * f * pickupNode(P({ rbias: rb })).tau; return wt / Math.hypot(1, wt); };
  const meas = dB(lev(0.5), lev(22)), want = dB(H(0.5), H(22));
  assert.ok(Math.abs(meas - want) < 0.5, `${meas.toFixed(2)} vs ${want.toFixed(2)} dB`);
  note(`A1 fundamental, 0.5 MΩ vs 22 MΩ feed: ${meas.toFixed(1)} dB (theory ${want.toFixed(1)} dB)`);
});
test('striking on mode 2\'s node leaves mode 2 out', () => {
  const m = 45, k = keyModel(m, P()), L = k.info.L;
  let xn = 0; // node of mode 2: where its shape crosses zero
  for (let x = 0.2 * L; x < L; x += L / 2000) if (k.reed.shape(1, x) * k.reed.shape(1, x + L / 2000) <= 0) { xn = x; break; }
  const a2 = (strike) => { const t = traceStrike({ ...keyModel(m, P({ strike })).voice }, P({ strike }), 0.5, FS, 0.05); return t.amps[1] / t.amps[0]; };
  const on = a2(xn / L), off = a2(DEFAULTS.strike);
  assert.ok(on < 0.03 * off, `${on} vs ${off}`);
  note(`A2 mode 2 node at ${(100 * xn / L).toFixed(1)} % of the length; mode 2 at the slot ${dB(on, off).toFixed(0)} dB re default strike`);
});
test('tremolo: the photocell lights fast and darkens slowly, so the level drops faster than it recovers', () => {
  const rate = 5.6, e = new ReedEngine(FS); e.setParams(P({ ...DRY, tremDepth: 1, tremRate: rate }));
  // a steady 1.5 kHz capacitance swing on the comb node stands in for a reed
  let ph = 0;
  e.voices.push({ key: -1, dead: false, render(buf, n) { for (let s = 0; s < n; s++) { buf[s] += 2e-14 * Math.sin(ph); ph += (TAU * 1500) / e.fs2; } } });
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl), n = Math.round(2 * FS / bl), env = [];
  for (let i = 0; i < n; i++) { e.process(L, R, bl); env.push(peakOf(L)); }
  const per = FS / bl / rate, tail = env.slice(Math.round(n / 2));
  let lo = Infinity, hi = 0; for (const v of tail) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  // durations of falling and rising halves of one cycle
  let fall = 0, rise = 0;
  for (let i = 1; i < tail.length; i++) { if (tail[i] < tail[i - 1]) fall++; else rise++; }
  assert.ok(hi / lo > 2, `depth ${dB(hi, lo).toFixed(1)} dB`);
  assert.ok(fall < 0.8 * rise, `falling ${fall} blocks, rising ${rise}`);
  note(`depth ${dB(hi, lo).toFixed(1)} dB; falls in ${(100 * fall / (fall + rise)).toFixed(0)} % of each cycle (period ${per.toFixed(0)} blocks)`);
});
test('speakers: the A1 fundamental drops out, the cone break-up near 2.6 kHz is boosted', () => {
  const m = 33, f = keyFreq(m), a = Math.round(0.1 * FS), W = Math.round(0.4 * FS);
  const d = render(m, P({ output: 'direct', drive: 0 }), 0.7, 0.6).L, s = render(m, P({ output: 'speaker', drive: 0 }), 0.7, 0.6).L;
  const g = (fx) => dB(amp(s, fx, a, W), amp(d, fx, a, W));
  const h48 = 48 * f; // 2.64 kHz harmonic
  assert.ok(g(f) - g(18 * f) < -15, `fundamental ${g(f).toFixed(1)} dB vs 990 Hz ${g(18 * f).toFixed(1)} dB`);
  assert.ok(g(h48) - g(18 * f) > 3, `2.6 kHz ${g(h48).toFixed(1)} dB vs 990 Hz ${g(18 * f).toFixed(1)} dB`);
});
test('dampers stop the note on release; the pedal keeps it; released notes free their voice', () => {
  const lvl = (sus) => { const { L, e } = render(60, P(), 0.8, 1.2, { off: 0.3, sustain: sus }); return { r: peakOf(L.subarray(Math.round(1.0 * FS))), e }; };
  const held = lvl(true), damped = lvl(false);
  assert.ok(held.r > 30 * damped.r, `${held.r} vs ${damped.r}`);
  const { e } = render(60, P(), 0.8, 3.0, { off: 0.3 });
  assert.equal(e.voiceCount(), 0);
});

console.log('level, stability, clicks, CPU');
test('a forte note peaks at 0.1–0.5 anywhere on the keyboard; a 6-note forte chord stays under 1', () => {
  let lo = 1, hi = 0;
  for (const m of [33, 40, 48, 57, 64, 72, 81, 88, 96]) { const p = peakOf(render(m, P(), 1, 0.4).L); lo = Math.min(lo, p); hi = Math.max(hi, p); }
  assert.ok(lo > 0.1 && hi < 0.5, `peaks ${lo.toFixed(3)} … ${hi.toFixed(3)}`);
  const e = new ReedEngine(FS); e.setParams(P());
  for (const m of [36, 48, 55, 60, 64, 67]) e.noteOn(m, 1);
  const bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  let pk = 0;
  for (let i = 0; i < 0.5 * FS / bl; i++) { e.process(L, R, bl); pk = Math.max(pk, peakOf(L)); }
  assert.ok(pk < 1, `chord ${pk}`);
  note(`single forte notes ${lo.toFixed(2)} … ${hi.toFixed(2)}; chord ${pk.toFixed(2)}`);
});
test('stable at every parameter\'s min and max (alone and all together): finite, peak < 2', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((p) => p.type !== 'select' && p.type !== 'checkbox');
  const cases = [];
  for (const p of sliders) for (const v of [p.min, p.max]) cases.push({ [p.id]: v });
  cases.push(Object.fromEntries(sliders.map((p) => [p.id, p.max])), Object.fromEntries(sliders.map((p) => [p.id, p.min])), { output: 'direct' });
  let worst = 0, worstCase = '';
  for (const c of cases) for (const m of [KEY_LO, 64, KEY_HI]) {
    const { L } = render(m, P(c), 1, 0.25);
    for (const v of L) assert.ok(Number.isFinite(v), `NaN with ${JSON.stringify(c)} key ${m}`);
    const p = peakOf(L);
    if (p > worst) { worst = p; worstCase = `${JSON.stringify(c)} key ${m}`; }
  }
  assert.ok(worst < 2, `peak ${worst} with ${worstCase}`);
  note(`${cases.length} cases × 3 keys; loudest ${worst.toFixed(2)} (${worstCase})`);
});
test('no clicks at onset or release: no sample jump far above the signal\'s own slope', () => {
  for (const m of [33, 57, 81]) for (const vel of [0.2, 1]) {
    const { L } = render(m, P(), vel, 1.0, { off: 0.5 });
    let typ = 0, n = 0;
    for (let i = Math.round(0.05 * FS); i < Math.round(0.45 * FS); i++) { typ += Math.abs(L[i] - L[i - 1]); n++; }
    typ /= n;
    const jump = (a, b) => { let j = 0; for (let i = a; i < b; i++) j = Math.max(j, Math.abs(L[i] - L[i - 1])); return j; };
    const on = jump(1, Math.round(0.02 * FS)), off = jump(Math.round(0.5 * FS), Math.round(0.6 * FS));
    assert.ok(on < 12 * typ && off < 6 * typ, `key ${m} vel ${vel}: onset ${(on / typ).toFixed(1)}×, release ${(off / typ).toFixed(1)}× typical slope`);
  }
});
test('CPU: 10 sounding voices at ≤ 30 % of real time', () => {
  const e = new ReedEngine(FS); e.setParams(P());
  const keys = Array.from({ length: 10 }, (_, i) => 36 + 5 * i), bl = 128, L = new Float32Array(bl), R = new Float32Array(bl);
  keys.forEach((k) => e.noteOn(k, 0.8));
  for (let i = 0; i < 50; i++) e.process(L, R, bl);
  const blocks = 1500;
  let ms = 0, minVoices = 99;
  for (let i = 0; i < blocks; i++) {
    if (i % 300 === 0) keys.forEach((k) => e.noteOn(k, 0.8)); // re-strike so all ten keep sounding
    const t0 = performance.now(); e.process(L, R, bl); ms += performance.now() - t0;
    minVoices = Math.min(minVoices, e.voiceCount());
  }
  const audio = (blocks * bl * 1000) / FS;
  assert.equal(minVoices, 10);
  note(`${(100 * ms / audio).toFixed(1)} % of one core for 10 voices`);
  assert.ok(ms < 0.3 * audio);
});

console.log(`\n${((performance.now() - t00) / 1000).toFixed(1)} s`);
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
