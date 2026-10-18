// Bubble Organ checks. Run: node test/bubbles-tests.mjs
//
// The bubble model (the C++, through the WebAssembly) against Minnaert's formula, the
// limits of the heat-flow theory (adiabatic, isothermal), Devin's real-variable form,
// viscous and radiation damping in closed form, the free surface's image and the rise;
// then the engine against the model: pitch, decay, the kick, the brook's rate and spread,
// re-strikes, voice stealing, levels, stability and CPU.

import assert from 'node:assert/strict';
import { GASES, LIQUIDS, P_ATM, G, KEY_LO, KEY_HI, ROW, HYDRO, keyFreq, nozzleX } from '../bubbles/src/bubbles-tank.js';
import { INSTRUMENT } from '../bubbles/src/bubbles-instrument.js';
import { loadEngine } from '../tools/engine.mjs';
import { wasmModel } from '../bubbles/src/bubbles-wasm.js';
import { DEFAULTS, GROUPS, PRESETS } from '../bubbles/src/bubbles-params.js';

const BubbleEngine = await loadEngine(INSTRUMENT);
const { ambient, nozzleEnv, keyRadius, riseSpeed, riseDistance, peakPressure, snapGain, ...model } = await wasmModel();
const acoustics = (R, env) => model.acoustics(R, env, {});

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const cents = (a, b) => 1200 * Math.log2(a / b);
const rel = (a, b) => Math.abs(a / b - 1);
// an unbounded liquid (no surface), air in water unless o says otherwise (entries of GASES and LIQUIDS, or
// a liquid or gas of the test's own)
const open = (o = {}) => ({ p0: P_ATM, d: 1e9, liq: LIQUIDS.water, gas: GASES.air, ...o });

// Devin's (1959) real form of the heat-flow theory, an independent route to the C++'s complex Φ
// (Prosperetti 1977): the polytropic exponent κ = Re Φ/3 and the thermal damping constant
// d_th = Im Φ/Re Φ, with X = R√(2ω/D) = √(2/χ). (Written over cosh X, so that it holds for any X.)
function devin(X, gamma) {
  const ch = Math.cosh(X), t = Math.tanh(X), s = Math.sin(X) / ch, c = 1 - Math.cos(X) / ch, A = (t + s) / c, B = (t - s) / c, g = 3 * (gamma - 1);
  const d = (g * (X * A - 2)) / (X * X + g * X * B);
  const kappa = gamma / ((1 + d * d) * (1 + (g / X) * B));
  return { kappa, d };
}
// Every key's nozzle at the defaults (as cut), and tuned to its note under P(o) ("keep in tune").
const nominalRadius = (k) => keyRadius(k, P());
const tunedRadius = (k, o) => keyRadius(k, P({ ...o, keepInTune: true }));
// Everything about a bubble of radius R released at a nozzle under p.
function bubbleModel(R, p) {
  const env = nozzleEnv(p), a = acoustics(R, env);
  return { ...a, U: riseSpeed(R, env.liq), d0: p.depth, p0: env.p0, liq: env.liq, gas: env.gas, env, R0: R, pb0: a.pb, T60: Math.log(1000) / a.b, Q: 1 / a.delta };
}
// The glide while it rises, as the C++ engine rings it (glideRing, bubbles-model.cpp): t seconds
// after release from d0 the bubble has risen, the liquid pressure has fallen by ρgz, the bubble has
// swollen as p_b^(−1/3n), and it rings with Φ kept as it was at release. pTank: the air pressure
// above the water then (Pa). Returns the ring's frequency (Hz); out gets b.
function glideAt(t, rel, pTank, out = {}) {
  const g = model.glide(rel.R0, rel.env, [t], pTank);
  out.b = g.b[0];
  return g.fd[0];
}
// The hydrophones' gains (1/r spreading from the nozzle), relative to a centre nozzle's distance R_REF.
const rHydro = (x, i) => Math.hypot(x - HYDRO.x[i], HYDRO.back), R_REF = rHydro(ROW / 2, 0);
const hydrophoneGains = (key) => [R_REF / rHydro(nozzleX(key), 0), R_REF / rHydro(nozzleX(key), 1)];

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key] | [t, 'params', P] | [t, 'press', key, v]),
// in 128-sample blocks like the AudioWorklet; tap(engine) after every block.
function run(params, events, sec, { fs = FS, tap, seed, log, opts } = {}) {
  const e = new BubbleEngine(fs, seed, opts);
  if (log) e.log = [];
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b] = ev[j++];
      if (type === 'on') e.noteOn(a, b); else if (type === 'off') e.noteOff(a); else if (type === 'params') e.setParams(a);
      else if (type === 'press') e.handle({ type: 'pressure', key: a, value: b });
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, s);
  }
  return { L, R, e };
}
const peakAbs = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rmsDb = (x) => { let s = 0; for (const v of x) s += v * v; return 10 * Math.log10(s / x.length + 1e-30); };
// Frequency from interpolated upward zero crossings over [a, b).
function zeroCrossFreq(x, a, b, fs = FS) {
  let first = -1, last = -1, n = 0;
  for (let i = a + 1; i < b; i++) if (x[i - 1] <= 0 && x[i] > 0) { const t = i - 1 + x[i - 1] / (x[i - 1] - x[i]); if (first < 0) first = t; else { n++; last = t; } }
  return (n * fs) / (last - first);
}
// Decay rate b (1/s): a straight line through ln x at the ring's positive peaks (for e^(−bt) cos(ωt + φ)
// they are exactly one period apart, each e^(−bT) of the last), between `from` and `to` samples.
function decayRate(x, f, from, to, fs = FS) {
  const ts = [], ls = [];
  for (let i = from + 1; i < to - 1; i++) if (x[i] > 0 && x[i] > x[i - 1] && x[i] >= x[i + 1]) {
    const a = x[i - 1], b = x[i], c = x[i + 1], d = (0.5 * (a - c)) / (a - 2 * b + c); // parabolic peak
    ts.push((i + d) / fs); ls.push(Math.log(b - 0.25 * (a - c) * d));
  }
  const n = ts.length, mt = ts.reduce((p, q) => p + q) / n, ml = ls.reduce((p, q) => p + q) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (ts[i] - mt) * (ls[i] - ml); sxx += (ts[i] - mt) ** 2; }
  return -sxy / sxx;
}
// One ping of key k: the first bubble only (the key is let go before the next is due).
const ping = (k, p, vel = 0.8, sec = 0.6, o) => run(p, [[0, 'on', k, vel], [0.02, 'off', k]], sec, o);
const firstSample = (x) => { for (let i = 0; i < x.length; i++) if (x[i] !== 0) return i; return 0; };
// The model's mean ring frequency over [t0, t1] after release, as the bubble rises (what zero crossings measure).
// pTank: the air pressure above the water (Pa), or a function of t.
// the glide's mean frequency and b over [t0, t1] (400 points), the tank at pTank (Pa, or a function of t)
const glideOver = (m, t0, t1, pTank) => {
  const t = Array.from({ length: 400 }, (_, i) => t0 + ((i + 0.5) / 400) * (t1 - t0));
  return model.glide(m.R0, m.env, t, typeof pTank === 'function' ? t.map(pTank) : pTank);
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const meanGlide = (m, t0, t1, pTank = m.p0 - m.liq.rho * G * m.d0) => mean(glideOver(m, t0, t1, pTank).fd);
const meanB = (m, t0, t1, pTank = m.p0 - m.liq.rho * G * m.d0) => mean(glideOver(m, t0, t1, pTank).b);

console.log('the bubble');
test('Minnaert: f₀R = √(3γp₀/ρ)/2π = 3.26 kHz·mm for air in water (1 bar, 1000 kg/m³, adiabatic); the model reproduces it with no heat flow, surface tension, losses or surface, and approaches it as real bubbles grow, short of it by exactly √(κ/γ) and the tension 2σ/R', () => {
  const fr = Math.sqrt((3 * 1.4 * 1e5) / 1000) / (2 * Math.PI);
  assert.ok(Math.abs(fr - 3.2617) < 1e-4, `${fr}`);
  // the model reproduces it with no heat flow, surface tension, losses or surface (a liquid and gas of the test's own)
  const liq = { rho: 1000, mu: 0, sigma: 0, c: 1e12 }, gas = { ...GASES.air, K: 1e-30 };
  for (const R of [0.5e-3, 1e-3, 1e-2]) {
    const a = acoustics(R, open({ p0: 1e5, liq, gas }));
    assert.ok(rel(a.fd * R, fr) < 1e-6, `R ${R}: f·R = ${a.fd * R}`);
  }
  // at 1 atm in water at 20 °C (998.2 kg/m³) the adiabatic product is 3.29 kHz·mm
  const fw = Math.sqrt((3 * 1.4 * P_ATM) / 998.2) / (2 * Math.PI);
  assert.ok(Math.abs(fw - 3.286) < 1e-3);
  // centimetre bubbles in deep water: heat flow leaves κ just short of γ, and tension adds
  // 2(3κ−1)σ/R to 3κp₀; within 0.5 % of Minnaert, closer as they grow
  let prev = 1;
  for (const R of [1e-2, 2e-2, 5e-2, 0.1]) {
    const a = acoustics(R, open()), k = a.kappa, gap = Math.abs((a.f0 * R) / fw - 1);
    assert.ok(rel((a.f0 * R) / fw, Math.sqrt((k / 1.4) * (1 + (2 * (3 * k - 1) * 0.0728) / (3 * k * P_ATM * R)))) < 1e-9, `R ${R}: f₀R ${a.f0 * R}, κ ${k}`);
    assert.ok(gap < 0.005 && gap < prev, `R ${R}: ${gap}`);
    prev = gap;
  }
});
// Φ as the C++ computes it for bubbles from 1 µm to 30 cm under 10⁻⁶ to 100 atm, for air, helium
// and SF₆ (γ 1.4, 5/3, 1.1): χ = D/ωR² from 10⁻⁹ to 10³.
const PHI = Object.fromEntries(['air', 'helium', 'sf6'].map((g) => {
  const out = [];
  for (let lp = -6; lp <= 2; lp += 0.25) for (let lr = -6; lr <= -0.5; lr += 0.125) {
    const a = acoustics(10 ** lr, open({ p0: P_ATM * 10 ** lp, gas: GASES[g] }));
    out.push({ chi: a.chi, re: a.phiRe, im: a.phiIm, D: a.D, pb: a.pb });
  }
  return [g, out.sort((a, b) => b.chi - a.chi)];
}));
test('heat flow: Φ → 3γ (adiabatic) as χ → 0 and → 3 (isothermal) as χ → ∞, with the boundary-layer and the slow-diffusion asymptotes', () => {
  for (const [g, list] of Object.entries(PHI)) {
    const gamma = GASES[g].gamma;
    let nA = 0, nI = 0;
    for (const { chi, re, im } of list) {
      if (chi <= 1e-5) { // Im Φ/Re Φ → 3(γ−1)√(χ/2): a thermal layer √(2D/ω) thin against R
        nA++;
        assert.ok(rel(re, 3 * gamma) < 4 * (gamma - 1) * Math.sqrt(chi / 2) + 1e-9, `γ ${gamma}, χ ${chi}: Re Φ ${re}`);
        assert.ok(rel(im / re, 3 * (gamma - 1) * Math.sqrt(chi / 2)) < 0.02, `γ ${gamma}, χ ${chi}: ${im / re}`);
      }
      if (chi >= 40) { // Re Φ → 3, Im Φ → (γ−1)/(5γχ)
        nI++;
        assert.ok(Math.abs(re - 3) < 1e-3, `γ ${gamma}, χ ${chi}: Re Φ ${re}`);
        assert.ok(rel(im, (gamma - 1) / (5 * gamma * chi)) < 0.01, `γ ${gamma}, χ ${chi}: Im Φ ${im}`);
      }
    }
    assert.ok(nA > 10 && nI > 3, `${g}: ${nA} adiabatic, ${nI} isothermal`);
    // κ = Re Φ/3 climbs monotonically from 1 to γ as the bubble grows (χ falls)
    let prev = 0;
    for (const { re } of list) { const k = re / 3; assert.ok(k >= prev - 1e-12 && k >= 1 - 1e-9 && k <= gamma + 1e-9, `${g}: κ ${k} after ${prev}`); prev = k; }
  }
});
test('Devin (1959): his real-variable κ and d_th agree with the C++\'s complex Φ (Prosperetti: two routes to the same theory) to 10⁻⁹ from X = 0.2 up; D is the ideal gas\'s K/ρ_g c_p', () => {
  for (const [g, list] of Object.entries(PHI)) {
    const gas = GASES[g];
    for (const { chi, re, im, D, pb } of list) {
      const X = Math.sqrt(2 / chi), d = devin(X, gas.gamma);
      // (the solver's Φ is from its ω one step before χ's, which moves the last digits; below X = 0.2
      // both forms lose them to cancellation)
      if (X >= 0.2) assert.ok(Math.abs(re / 3 - d.kappa) < 1e-9 && Math.abs(im / re - d.d) < 1e-9, `${g}, χ ${chi}: κ ${re / 3} vs ${d.kappa}, d ${im / re} vs ${d.d}`);
      assert.ok(rel(D, gas.K / (((pb * gas.M) / (8.314462618 * 293.15)) * gas.cp)) < 1e-12, `${g}: D ${D}`);
    }
  }
});
test('damping constants for air in water at 1 atm: δ_rad = ωR/c ≈ 0.0137, δ_vis = 4μ/ρωR², δ_th peaks near R ≈ 10–20 µm', () => {
  const ths = [];
  for (const R of [1e-5, 1e-4, 1e-3, 1e-2]) {
    const a = acoustics(R, open());
    assert.ok(rel(a.drad, (a.omega0 * R) / 1482) < 1e-9, `R ${R}: δ_rad ${a.drad}`);
    assert.ok(rel(a.dvis, (4 * 1.002e-3) / (998.2 * a.omega0 * R * R)) < 1e-9, `R ${R}: δ_vis ${a.dvis}`);
    ths.push(a.dth);
  }
  const big = acoustics(1e-3, open());
  assert.ok(Math.abs(big.drad - 0.0137) < 3e-4, `δ_rad at 1 mm ${big.drad}`);
  // thermal: small for tiny (isothermal) and large (adiabatic) bubbles, largest in between
  let best = 0, Rbest = 0;
  for (let lr = -6; lr <= -2; lr += 0.05) { const a = acoustics(10 ** lr, open()); if (a.dth > best) { best = a.dth; Rbest = 10 ** lr; } }
  assert.ok(Rbest > 8e-6 && Rbest < 2.5e-5 && best > 0.1 && best < 0.13, `peak δ_th ${best} at ${Rbest}`);
  assert.ok(ths[3] < ths[2] && ths[2] < ths[1], 'δ_th falls as bubbles grow past the peak');
});
test('surface tension: ω₀² = [3κp₀ + 2(3κ−1)σ/R]/ρR², worth about +1 ¢ on the smallest bubble', () => {
  for (const R of [0.8e-3, 5e-3]) {
    const a = acoustics(R, open()), k = a.kappa, s = 0.0728;
    assert.ok(rel(a.omega0 ** 2, (3 * k * P_ATM + 2 * (3 * k - 1) * s / R) / (998.2 * R * R)) < 1e-9);
  }
  // against the same bubble without the tension term, √(3κp₀/ρR²)
  const R = 0.78e-3, a = acoustics(R, open()), c = cents(a.f0, Math.sqrt((3 * a.kappa * P_ATM) / (998.2 * R * R)) / (2 * Math.PI));
  assert.ok(c > 0.5 && c < 2, `${c.toFixed(2)} ¢`);
});
test('pitch ∝ √p₀: with depth (p₀ = p_air + ρgh) and with the tank\'s pressure, to within the small change in κ', () => {
  assert.ok(rel(ambient(P({ depth: 10, pressure: 2 })), 2 * P_ATM + 998.2 * G * 10) < 1e-12);
  const liq = { ...LIQUIDS.water, sigma: 0 }, gas = { ...GASES.air, K: 1e-30 }; // adiabatic, tensionless: exact
  const f = (p0) => acoustics(5e-3, open({ p0, liq, gas })).f0;
  for (const p0 of [0.25 * P_ATM, 4 * P_ATM, 11 * P_ATM]) assert.ok(rel(f(p0) / f(P_ATM), Math.sqrt(p0 / P_ATM)) < 1e-9, `p₀ ${p0}: ${f(p0) / f(P_ATM)}`);
  // the full model (heat flow, tension, surface): √(p₀ ratio) times √(κ ratio), κ moving a little because
  // the gas's thermal diffusivity ∝ 1/p (thin gas is more isothermal), to 0.3 %
  for (const o of [{ depth: 10 }, { depth: 50 }, { pressure: 0.25 }, { pressure: 4 }]) for (const k of [60, 84, 105]) {
    const R = nominalRadius(k), a = bubbleModel(R, P(o)), b = bubbleModel(R, P());
    const ratio = Math.sqrt((ambient(P(o)) / ambient(P())) * (a.kappa / b.kappa) * (b.m / a.m)); // m: the surface's image
    assert.ok(rel(a.fd / b.fd, ratio) < 0.003, `${JSON.stringify(o)} key ${k}: ${(a.fd / b.fd).toFixed(4)} vs ${ratio.toFixed(4)}`);
    assert.ok(Math.abs(a.kappa / b.kappa - 1) < 0.06);
  }
});
test('gas: helium vs air is exactly √(γ ratio) = 1.0911 when both are adiabatic and 1 when both are isothermal; on the keyboard helium falls short, argon does not', () => {
  // exactly, with no tension and the gas's conductivity taken to 0 or to ∞
  const liq = { ...LIQUIDS.water, sigma: 0 };
  const adK = (g) => acoustics(5e-3, open({ liq, gas: { ...GASES[g], K: 1e-30 } })).f0, isoK = (g) => acoustics(5e-3, open({ liq, gas: { ...GASES[g], K: 1e6 } })).f0;
  assert.ok(Math.abs(adK('helium') / adK('air') - Math.sqrt(5 / 3 / 1.4)) < 1e-9, `${adK('helium') / adK('air')}`);
  assert.ok(Math.abs(isoK('helium') / isoK('air') - 1) < 1e-4, `${isoK('helium') / isoK('air')}`);
  // and on real gases: a 10 cm bubble under 100 atm (χ ~ 10⁻⁸: adiabatic) and under 10⁻⁴ atm (χ ~ 10–100: isothermal)
  const f = (g, p0) => acoustics(0.1, open({ p0, gas: GASES[g] })).f0, ad = f('helium', 100 * P_ATM) / f('air', 100 * P_ATM), iso = f('helium', 1e-4 * P_ATM) / f('air', 1e-4 * P_ATM);
  assert.ok(rel(ad, Math.sqrt(5 / 3 / 1.4)) < 3e-4, `${ad}`);
  assert.ok(Math.abs(iso - 1) < 1e-4, `${iso}`);
  const full = cents(Math.sqrt(5 / 3 / 1.4), 1); // 151 ¢
  let prev = Infinity;
  for (let k = KEY_LO; k <= KEY_HI; k += 6) {
    const R = nominalRadius(k), air = bubbleModel(R, P()).fd, he = bubbleModel(R, P({ gas: 'helium' })).fd, ar = bubbleModel(R, P({ gas: 'argon' })).fd;
    const sh = cents(he, air), sa = cents(ar, air);
    assert.ok(sh < full - 15 && sh <= prev + 1e-9, `key ${k}: helium +${sh.toFixed(1)} ¢`);
    assert.ok(sa > full - 25 && sa < full + 1, `key ${k}: argon +${sa.toFixed(1)} ¢`);
    prev = sh;
  }
  assert.ok(prev < 60, `top key: helium only +${prev.toFixed(0)} ¢`);
});
test('glycerol: its viscous damping kills the treble (Q < 4 on C8) but the bass still rings (Q > 30 on A3), as δ_vis = 4μ/ρωR² ∝ 1/R', () => {
  const top = bubbleModel(nominalRadius(KEY_HI), P({ liquid: 'glycerol' })), bot = bubbleModel(nominalRadius(KEY_LO), P({ liquid: 'glycerol' }));
  assert.ok(top.Q < 4 && top.dvis > 0.8 * top.delta, `C8: Q ${top.Q.toFixed(1)}, δ_vis ${top.dvis.toFixed(3)} of ${top.delta.toFixed(3)}`);
  assert.ok(bot.Q > 30, `A3: Q ${bot.Q.toFixed(1)}`);
  const water = bubbleModel(nominalRadius(KEY_HI), P());
  assert.ok(rel(top.dvis / water.dvis, (1.41 / 1.002e-3) * (998.2 / 1261) * (water.omega0 / top.omega0) * (water.m / top.m)) < 1e-9);
  // in the engine: the top key in glycerol falls 40 dB within 5 periods; in water it takes over 30
  const fall = (liquid) => {
    const { L } = ping(KEY_HI, P({ liquid, snap: 0.01 })), i0 = firstSample(L), f = bubbleModel(nominalRadius(KEY_HI), P({ liquid })).fd, per = FS / f;
    let pk = 0; for (let i = i0; i < i0 + per; i++) pk = Math.max(pk, Math.abs(L[i]));
    for (let n = 1; n < 200; n++) { let m = 0; for (let i = Math.round(i0 + n * per); i < i0 + (n + 1) * per; i++) m = Math.max(m, Math.abs(L[i])); if (m < 0.01 * pk) return n; }
    return 200;
  };
  const g = fall('glycerol'), w = fall('water');
  assert.ok(g <= 5 && w > 30, `−40 dB after ${g} periods in glycerol, ${w} in water`);
});
test('the free surface: its image (opposite sign, 2d away) lightens the liquid, m = 1 − (R/2d)cos 2kd, and cuts radiation by 1 − sin 2kd/2kd', () => {
  const R = 10e-3, far = acoustics(R, open());
  for (const d of [0.05, 0.1, 0.3, 1]) {
    const a = acoustics(R, open({ d })), ks = (a.omega0 / 1482) * 2 * d;
    assert.ok(rel(a.m, 1 - (R / (2 * d)) * Math.cos(ks)) < 1e-12);
    assert.ok(rel(a.radFactor, 1 - Math.sin(ks) / ks) < 1e-12);
    // a shallow, low bubble: higher, and it radiates a few per cent of its free-field power
    if (ks < 1) assert.ok(a.f0 > far.f0 && a.radFactor < 0.2, `d ${d}: ${cents(a.f0, far.f0).toFixed(1)} ¢, radiation × ${a.radFactor.toFixed(3)}`);
  }
  // pitch rises as (1 − R/2d)^(−1/2) for a compact pair (kd ≪ 1)
  const near = acoustics(R, open({ d: 0.1 }));
  assert.ok(rel(near.f0 / far.f0, 1 / Math.sqrt(1 - R / 0.2)) < 0.002, `${near.f0 / far.f0}`);
  // and 10 m down it is all but gone: within 0.5 ¢ of the unbounded liquid
  assert.ok(Math.abs(cents(acoustics(R, open({ d: 10 })).f0, far.f0)) < 0.5);
});
test('rise: Hadamard–Rybczynski ρgR²/3μ for small bubbles in glycerol, 0.2–0.4 m/s for mm–cm bubbles in water, and z(t) = (U²/2g) ln cosh(2gt/U)', () => {
  const gl = LIQUIDS.glycerol, R = 0.5e-3, U = riseSpeed(R, gl), uh = (gl.rho * G * R * R) / (3 * gl.mu);
  assert.ok(rel(U, uh) < 0.001 && (gl.rho * U * 2 * R) / gl.mu < 0.01, `${U} vs ${uh}`);
  for (let k = KEY_LO; k <= KEY_HI; k += 4) { const u = riseSpeed(nominalRadius(k), LIQUIDS.water); assert.ok(u > 0.2 && u < 0.42, `key ${k}: ${u} m/s`); }
  const Ut = 0.3; let v = 0, z = 0; const dt = 1e-6;
  for (let t = 0; t < 0.2; t += dt) { const a = 2 * G * (1 - (v * v) / (Ut * Ut)); z += v * dt + 0.5 * a * dt * dt; v += a * dt; }
  assert.ok(Math.abs(z - riseDistance(0.2, Ut)) < 1e-5, `${z} vs ${riseDistance(0.2, Ut)}`);
});
test('the glide is small: the brief\'s "bloop" — 1 m down the biggest bubble falls 4 ¢ in its first 0.1 s; 10 cm down the surface\'s image wins and it rises', () => {
  const at = (depth, k, t) => { const R = nominalRadius(k), b = bubbleModel(R, P({ depth })); return cents(glideAt(t, b, P_ATM), glideAt(0, b, P_ATM)); };
  const deep = at(1, KEY_LO, 0.1), shallow = at(0.1, KEY_LO, 0.1), small = at(1, 96, 0.03);
  assert.ok(deep < -3 && deep > -5, `1 m, A3: ${deep.toFixed(2)} ¢ in 0.1 s`);
  assert.ok(shallow > 20, `10 cm, A3: +${shallow.toFixed(1)} ¢ in 0.1 s`);
  assert.ok(Math.abs(small) < 1, `1 m, C7 over its ring: ${small.toFixed(2)} ¢`);
});

console.log('tuning');
test('every key A3–C8 sounds on pitch at the defaults (its first bubble, within ±1.5 ¢) at 44.1 and 48 kHz', () => {
  let worst = 0;
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += fs === 48000 ? 1 : 3) {
    const { L } = ping(k, P(), 0.8, 0.25, { fs }), i0 = firstSample(L) + Math.round(0.0005 * fs), per = fs / keyFreq(k);
    const f = zeroCrossFreq(L, i0, Math.round(i0 + Math.min(Math.max(12, 0.02 * keyFreq(k)), 60) * per), fs);
    const c = cents(f, keyFreq(k));
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 1.5, `key ${k} at ${fs}: ${c.toFixed(2)} ¢`);
  }
  console.log(`         worst ${worst.toFixed(2)} ¢`);
});
test('keep in tune: under 20 m of water, helium, glycerol or a quarter atmosphere every key stays within 2 ¢; off, it moves as the model says', () => {
  for (const o of [{ depth: 20 }, { gas: 'helium' }, { liquid: 'glycerol' }, { pressure: 0.25 }, { gas: 'sf6', depth: 5 }]) {
    for (let k = KEY_LO + 2; k <= KEY_HI; k += 7) {
      const R = tunedRadius(k, o);
      assert.ok(Math.abs(cents(bubbleModel(R, P(o)).fd, keyFreq(k))) < 0.01);
    }
    for (const k of [62, 83]) {
      const on = ping(k, P({ ...o, keepInTune: true }), 0.8, 0.3).L, off = ping(k, P(o), 0.8, 0.3).L;
      const meas = (x) => { const i0 = firstSample(x) + 40; return zeroCrossFreq(x, i0, i0 + Math.round(10 * FS / keyFreq(k))); };
      assert.ok(Math.abs(cents(meas(on), keyFreq(k))) < 2, `${JSON.stringify(o)} key ${k} in tune: ${cents(meas(on), keyFreq(k)).toFixed(2)} ¢`);
      const pred = bubbleModel(nominalRadius(k), P(o)).fd;
      assert.ok(Math.abs(cents(meas(off), pred)) < 2, `${JSON.stringify(o)} key ${k} retuned: ${meas(off).toFixed(2)} vs ${pred.toFixed(2)} Hz`);
    }
  }
});

console.log('the engine');
test('a single ping is the model\'s ring: frequency within 0.5 ¢ and decay rate b within 3 %, in water, helium and glycerol', () => {
  for (const o of [{}, { gas: 'helium' }, { liquid: 'glycerol' }, { depth: 10 }]) for (const k of [60, 79, 96]) {
    const p = P({ ...o, snap: 0.01 }), m = bubbleModel(nominalRadius(k), p);
    if (m.Q < 6) continue; // too short to fit
    const sec = Math.min(1.2, 4 / m.b), { L } = ping(k, p, 0.8, sec + 0.05), i0 = firstSample(L) + 4;
    const span = Math.min(Math.round((2.3 / m.b) * FS), L.length - i0 - 1); // the first 20 dB
    const f = zeroCrossFreq(L, i0, i0 + span), b = decayRate(L, m.fd, i0, i0 + span), fm = meanGlide(m, 0, span / FS), bm = meanB(m, 0, span / FS);
    assert.ok(Math.abs(cents(f, fm)) < 0.5, `${JSON.stringify(o)} key ${k}: ${f.toFixed(3)} vs ${fm.toFixed(3)} Hz (${m.fd.toFixed(3)} at release)`);
    assert.ok(rel(b, bm) < 0.03, `${JSON.stringify(o)} key ${k}: b ${b.toFixed(2)} vs ${bm.toFixed(2)} /s (${m.b.toFixed(2)} at release)`);
  }
});
test('the kick: every bubble starts at the same pressure, 2εσ/r (bigger bubbles move more volume, more slowly), linear in velocity', () => {
  const p0 = peakPressure(LIQUIDS.water, 0.8);
  assert.ok(rel(p0, (2 * 0.5 * 0.8 * LIQUIDS.water.sigma) / R_REF) < 1e-12, `${p0} Pa`); // ε = 0.5 × velocity
  for (const k of [KEY_LO, 66, 77, 90, 101]) {
    const { L, R } = ping(k, P({ snap: 0.01 }), 0.8, 0.1), g = hydrophoneGains(k);
    const pk = Math.max(peakAbs(L) / g[0], peakAbs(R) / g[1]); // OUT = 1 per pascal
    assert.ok(Math.abs(20 * Math.log10(pk / p0)) < 0.5, `key ${k}: ${pk.toFixed(4)} Pa vs ${p0.toFixed(4)}`);
  }
  const a = peakAbs(ping(72, P(), 1, 0.1).L), b = peakAbs(ping(72, P(), 0.25, 0.1).L);
  assert.ok(rel(a / b, 4) < 1e-6, `velocity 1 vs 0.25: ×${(a / b).toFixed(4)}`);
  assert.ok(Math.abs(R_REF - 0.465) < 0.001);
});
test('neck snap: a 1 ms pinch-off barely rings the treble (as the ramp\'s spectrum predicts) and leaves the bass', () => {
  for (const k of [KEY_LO, 84, 100]) {
    // the ring once the slow neck has closed (after 1 ms), against an instant snap, in the same window
    const m = bubbleModel(nominalRadius(k), P()), a = firstSample(ping(k, P({ snap: 0.01 }), 1, 0.01).L) + Math.round(0.0012 * FS), b = a + Math.round((3 * FS) / m.fd);
    const win = (x) => { let p = 0; for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i])); return p; };
    const slow = win(ping(k, P({ snap: 1 }), 1, 0.05).L), fast = win(ping(k, P({ snap: 0.01 }), 1, 0.05).L);
    const pred = snapGain(m.fd, 1e-3) * Math.exp(m.b * 0.0005); // centred 0.5 ms later, it has decayed less
    assert.ok(Math.abs(20 * Math.log10(slow / fast / pred)) < 1, `key ${k}: ${(20 * Math.log10(slow / fast)).toFixed(1)} dB vs ${(20 * Math.log10(pred)).toFixed(1)}`);
  }
});
test('held keys keep releasing at the set rate: exactly periodic at irregularity 0, Poisson on average at 1; aftertouch up to triples it', () => {
  const count = (o, sec, press) => {
    const ev = [[0, 'on', 72, 0.6]]; if (press) ev.push([0, 'press', 72, 1]);
    const { e } = run(P(o), ev, sec, { log: true });
    return e.log.filter((r) => r.key === 72);
  };
  const reg = count({ rate: 8, irregular: 0 }, 5);
  const gaps = reg.slice(1).map((r, i) => r.frame - reg[i].frame);
  assert.ok(gaps.every((g) => Math.abs(g - FS / 8) <= 1), `gaps ${Math.min(...gaps)}–${Math.max(...gaps)} samples`);
  const poi = count({ rate: 10, irregular: 1 }, 20), n = poi.length, expect = 20 * 10 + 1;
  assert.ok(Math.abs(n - expect) < 3 * Math.sqrt(expect), `${n} bubbles in 20 s at 10/s`);
  const pg = poi.slice(1).map((r, i) => (r.frame - poi[i].frame) / FS), m = pg.reduce((a, b) => a + b) / pg.length, sd = Math.sqrt(pg.reduce((a, b) => a + (b - m) ** 2, 0) / pg.length);
  assert.ok(Math.abs(sd / m - 1) < 0.15, `Poisson gaps: sd/mean ${(sd / m).toFixed(3)}`);
  const pressed = count({ rate: 4, irregular: 0 }, 5, true).length;
  assert.ok(Math.abs(pressed - (5 * 12 + 1)) <= 1, `aftertouch: ${pressed} in 5 s at 4 × 3/s`);
});
test('size spread: the first bubble of a press is the nozzle\'s own size; the rest scatter by the set spread', () => {
  const { e } = run(P({ rate: 20, spread: 5 }), [[0, 'on', 70, 0.6], [6, 'off', 70], [6.2, 'on', 70, 0.6]], 6.25, { log: true });
  const Rn = nominalRadius(70), first = e.log.filter((r) => r.first), rest = e.log.filter((r) => !r.first);
  assert.equal(first.length, 2);
  for (const r of first) assert.ok(rel(r.R, Rn) < 1e-12);
  const d = rest.map((r) => r.R / Rn - 1), m = d.reduce((a, b) => a + b) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length);
  assert.ok(Math.abs(sd / 0.05 - 1) < 0.12 && Math.abs(m) < 0.01, `spread ${(100 * sd).toFixed(2)} %, mean ${(100 * m).toFixed(2)} %`);
});
test('re-striking a held key releases its next bubble at once from the same nozzle (no second voice, no doubled rate); a quick tap still sounds; seeded renders repeat exactly', () => {
  const { e } = run(P({ rate: 5, irregular: 0 }), [[0, 'on', 65, 0.6], [0.1, 'on', 65, 0.6], [0.3, 'on', 65, 0.6]], 1.3, { log: true });
  const fr = e.log.map((r) => r.frame / FS);
  // releases at 0, 0.1 and 0.3 s (the re-strikes), then every 0.2 s from the last: 0.5, 0.7, 0.9, 1.1
  const want = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.1];
  assert.equal(fr.length, want.length, `releases at ${fr.map((t) => t.toFixed(3)).join(', ')}`);
  fr.forEach((t, i) => assert.ok(Math.abs(t - want[i]) < 128 / FS + 1e-9, `release ${i} at ${t}`));
  assert.equal(e.nozzles.filter((z) => z.held).length, 1);
  // a tap shorter than one audio block still releases its bubble (and only one)
  const tap = new BubbleEngine(FS); tap.log = []; tap.setParams(P()); tap.noteOn(70, 0.7); tap.noteOff(70);
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (let i = 0; i < 400; i++) tap.process(bL, bR, 128);
  assert.equal(tap.log.length, 1, `${tap.log.length} bubbles from a quick tap`);
  const a = run(P(), [[0, 'on', 70, 0.6], [0, 'on', 77, 0.6]], 1.5).L, b = run(P(), [[0, 'on', 70, 0.6], [0, 'on', 77, 0.6]], 1.5).L, c = run(P(), [[0, 'on', 70, 0.6], [0, 'on', 77, 0.6]], 1.5, { seed: 7 }).L;
  assert.ok(a.every((v, i) => v === b[i]), 'same seed, same output');
  assert.ok(a.some((v, i) => v !== c[i]), 'another seed, another brook');
});
test('voice stealing: ten keys at 40 bubbles/s stay within the pool; the quietest old bubbles fade out without clicks; none under 12 ms is taken', () => {
  const keys = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72], ev = keys.map((k) => [0, 'on', k, 0.8]), p = P({ rate: 40 });
  let maxLive = 0, young = 0;
  const a = run(p, ev, 2.5, {
    tap: (eng) => {
      let live = 0;
      for (const b of eng.pool) if (b.on) { if (b.fadeStep === 0) live++; else if (b.age < 0.012 * FS && b.fade < 1 && b.fadeStep < 1 / (0.003 * FS)) young++; }
      maxLive = Math.max(maxLive, live);
    },
  });
  assert.ok(maxLive <= 160, `${maxLive} ringing`);
  assert.equal(young, 0, 'a bubble younger than 12 ms was stolen');
  // the same brooks with room for every bubble: the difference is the stolen bubbles' faded tails
  const b = run(p, ev, 2.5, { opts: { pool: 4000, soft: Infinity } });
  assert.ok(b.e.voiceCount() > 200, `${b.e.voiceCount()} would ring without stealing`);
  const d = a.L.map((v, i) => v - b.L[i]);
  let dmax = 0, d2 = 0;
  for (let i = 2; i < d.length; i++) { dmax = Math.max(dmax, Math.abs(d[i])); d2 = Math.max(d2, Math.abs(d[i] - 2 * d[i - 1] + d[i - 2])); }
  // a click would put a step into d (second difference ~ its size); a smooth fade of tones below
  // 600 Hz keeps it near (2π·600/fs)² = 0.006 of it
  assert.ok(dmax > 0 && d2 < 0.02 * dmax, `second difference ${(d2 / dmax).toFixed(4)} of the stolen tails' ${dmax.toFixed(3)}`);
});
test('level: a forte ping peaks at 0.1–0.5 on every key at 44.1 and 48 kHz; a 4-key forte and a 6-key mf chord stay under 1; every preset within 10 dB of the default', () => {
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += 3) {
    const { L, R } = ping(k, P(), 1, 0.2, { fs }), pk = Math.max(peakAbs(L), peakAbs(R));
    assert.ok(pk > 0.1 && pk < 0.5, `key ${k} at ${fs}: ${pk.toFixed(3)}`);
  }
  // held for 3 s: the brooks' first bubbles start together, then pile up at random
  const chord = (keys, vel) => { const { L, R } = run(P(), keys.map((k) => [0, 'on', k, vel]), 3); return Math.max(peakAbs(L), peakAbs(R)); };
  const c4 = chord([60, 64, 67, 72], 1), c6 = chord([65, 69, 72, 76, 79, 84], 0.6);
  assert.ok(c4 < 1 && c6 < 1, `chords ${c4.toFixed(3)}, ${c6.toFixed(3)}`);
  const phrase = (p) => rmsDb(run(p, [60, 64, 67, 72, 76].flatMap((k, i) => [[0.3 * i, 'on', k, 0.7], [0.3 * i + 0.25, 'off', k]]), 2.5).L);
  const ref = phrase(P());
  for (const pr of PRESETS) { const d = phrase(P(pr.p)) - ref; assert.ok(Math.abs(d) < 10, `${pr.name}: ${d.toFixed(1)} dB`); }
});
test('stability: seeded random combinations of extreme settings at 44.1 and 48 kHz, changed mid-brook: no NaN, bounded, and silence after release', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((p) => !p.type && !['volume', 'room', 'velocity'].includes(p.id));
  let seed = 2024;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const gases = Object.keys(GASES), liquids = Object.keys(LIQUIDS);
  for (let trial = 0; trial < 16; trial++) {
    const fs = trial % 2 ? 44100 : 48000, p = P();
    for (const q of sliders) { const r = rnd(); p[q.id] = r < 0.4 ? q.min : r < 0.8 ? q.max : q.def; }
    p.gas = gases[trial % 4]; p.liquid = liquids[Math.floor(trial / 4) % 3]; p.keepInTune = trial % 3 === 0;
    const q = { ...p, pressure: p.pressure > 1 ? 0.25 : 4, depth: p.depth > 1 ? 0.1 : 100, gas: gases[(trial + 1) % 4], liquid: liquids[(trial + 1) % 3] };
    const keys = [KEY_LO, 70, 88, KEY_HI];
    const { L, R, e } = run(p, [...keys.map((k) => [0, 'on', k, 1]), [0.4, 'params', q], [0.45, 'on', 70, 1], [0.8, 'params', p], ...keys.map((k) => [1, 'off', k])], 1.2, { fs });
    for (let i = 0; i < L.length; i++) assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i]), `trial ${trial}: NaN at ${i}`);
    assert.ok(Math.max(peakAbs(L), peakAbs(R)) < 20, `trial ${trial}: peak ${Math.max(peakAbs(L), peakAbs(R)).toFixed(2)}`);
    // after the keys are let go, everything rings out and frees its slot (SF₆ in a shallow tank takes longest)
    const bL = new Float32Array(128), bR = new Float32Array(128);
    for (let i = 0; i < (20 * fs) / 128 && e.voiceCount(); i++) e.process(bL, bR, 128);
    assert.equal(e.voiceCount(), 0, `trial ${trial}: ${e.voiceCount()} bubbles still ringing after 20 s`);
  }
});
test('the tank\'s pressure, moved while a bubble rings, retunes it smoothly as the model says (squeezed as well as stiffened: more than √(p ratio))', () => {
  const p = P(), q = P({ pressure: 2 }), k = KEY_LO;
  const { L } = run(p, [[0, 'on', k, 0.8], [0.02, 'off', k], [0.1, 'params', q]], 0.5);
  const m = bubbleModel(nominalRadius(k), p), fA = zeroCrossFreq(L, Math.round(0.01 * FS), Math.round(0.09 * FS)), fB = zeroCrossFreq(L, Math.round(0.35 * FS), Math.round(0.45 * FS));
  const pT = (t) => P_ATM * (2 - Math.exp(-Math.max(0, t - 0.1) / 0.05)); // the tank follows its knob in 50 ms
  const pA = meanGlide(m, 0.01, 0.09), pB = meanGlide(m, 0.35, 0.45, pT), ratio = Math.sqrt(ambient(q) / ambient(p));
  assert.ok(Math.abs(cents(fA, pA)) < 0.5, `before: ${fA.toFixed(3)} vs ${pA.toFixed(3)} Hz`);
  assert.ok(Math.abs(cents(fB, pB)) < 0.5, `after: ${fB.toFixed(3)} vs ${pB.toFixed(3)} Hz`);
  assert.ok(pB / pA > ratio * 1.05, `×${(pB / pA).toFixed(4)} vs √(p ratio) ${ratio.toFixed(4)}`);
  let before = 0, after = 0;
  for (let i = 2; i < L.length; i++) { const d = Math.abs(L[i] - 2 * L[i - 1] + L[i - 2]) / (Math.abs(L[i - 1]) + 1e-3 * peakAbs(L)); if (i < 0.1 * FS && i > 0.01 * FS) before = Math.max(before, d); else if (i >= 0.1 * FS && i < 0.3 * FS) after = Math.max(after, d); }
  assert.ok(after < 4 * before, 'no click as the pressure moves');
});
test('CPU: ten held keys at 48 kHz in well under 30 % of real time (default rate, and 40 bubbles/s each)', () => {
  for (const rate of [DEFAULTS.rate, 40]) {
    const e = new BubbleEngine(FS); e.setParams(P({ rate }));
    for (let i = 0; i < 10; i++) e.noteOn(KEY_LO + 5 * i, 0.8);
    const bL = new Float32Array(128), bR = new Float32Array(128);
    for (let i = 0; i < Math.round((2 * FS) / 128); i++) e.process(bL, bR, 128); // let the brooks fill
    const n = Math.round((4 * FS) / 128), t0 = performance.now();
    for (let i = 0; i < n; i++) e.process(bL, bR, 128);
    const load = (performance.now() - t0) / 1000 / 4;
    console.log(`         ${rate}/s: ${(100 * load).toFixed(1)} % of real time, ${e.voiceCount()} bubbles ringing`);
    assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
  }
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
