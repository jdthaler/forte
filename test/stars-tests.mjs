// Star Keyboard checks. Run: node test/stars-tests.mjs
//
// The C++ (native/instruments/stars), built as WebAssembly: the model's stars through stars-wasm.js,
// the engine through loadEngine. The scaling relations against the solar reference values and the mean density; the asymptotic
// pattern, its small separations and the échelle ridges; the mixed-mode condition against its own
// period spacings; E_lm(i); rotation; the evolutionary track and the tuning of every key; then the
// engine against the model: Lorentzian lines of the set width and power from the stochastic driving,
// the ring-down at Γ, the flare's echo at 1/Δν, rotation and inclination in the output, the δ Scuti
// amplitude equation, voices, levels, stability and cost.

import assert from 'node:assert/strict';
import { INSTRUMENT, KEY_LO, KEY_HI, DEFAULTS, GROUPS, PRESETS } from '../stars/src/stars-instrument.js';
import { K0 } from '../stars/src/stars-params.js';
import { wasmModel, starId } from '../stars/src/stars-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';
import { fft } from '../tools/audio-util.mjs';

const StarEngine = await loadEngine(INSTRUMENT);
const { keyStar, zams, starAt, Elm } = await wasmModel();

// What the tests hold the model and the engine to: the Sun (Huber et al. 2011, and 25.4 d at the
// equator), the key the Sun sits on (G6), δ Scuti's Ledoux constant, and the engine's output scale
// (a star's rms is OUT·√½·drive) and voicing (+3 dB an octave down the keyboard).
const SUN = { numax: 3090, dnu: 135.1, teff: 5777, rot: 1e6 / (25.4 * 86400) }, SUN_KEY = 91, DS_C = 0.05;
const OUT = 0.088, voicing = (key) => 2 ** ((60 - key) / 48);
const cents = (a, b) => 1200 * Math.log2(a / b);
// C2–C7: the keyboard the stars were first laid on, and the pan is drawn across (keys beyond sit at its ends)
const C2 = 36, C7 = 96;
const panOf = (key) => { const a = ((0.6 * Math.max(-1, Math.min(1, (2 * (key - C2)) / (C7 - C2) - 1)) + 1) * Math.PI) / 4; return [Math.cos(a), Math.sin(a)]; };

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const rel = (a, b) => Math.abs(a / b - 1);

// Run the engine through events ([t, 'on', key, vel, data?] | [t, 'off', key] | [t, 'sus', on] | [t, 'params', P] | [t, 'msg', m])
// in 128-sample blocks like the AudioWorklet. Returns L + R (or [L, R, engine]).
function run(params, events, sec, { fs = FS, stereo = false, tap } = {}) {
  const e = new StarEngine(fs);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b, c] = ev[j++];
      if (type === 'on') e.noteOn(a, b, c); else if (type === 'off') e.noteOff(a); else if (type === 'sus') e.setSustain(a); else if (type === 'params') e.setParams(a); else if (type === 'msg') e.handle(a);
    }
    e.process(bL, bR, bl);
    for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; R[s + i] = bR[i]; }
    tap?.(e, s);
  }
  if (stereo) return [L, R, e];
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = L[i] + R[i];
  return Object.assign(x, { engine: e });
}
// A made-up star of given modes, accepted by the engine as the key's: [{ f (Hz), l, m, gamma (Hz), p, zeta, wEnv, wCore }]
function custom(key, params, modes, { family = 'track', K = K0 } = {}) {
  const N = modes.length, A = (T) => new T(N), md = { f: A(Float64Array), l: A(Int8Array), m: A(Int8Array), zeta: A(Float64Array), p: A(Float64Array), gamma: A(Float64Array), wEnv: A(Float64Array), wCore: A(Float64Array), asat: A(Float64Array), mult: A(Int32Array) };
  modes.forEach((x, i) => { md.f[i] = x.f; md.l[i] = x.l ?? 0; md.m[i] = x.m ?? 0; md.zeta[i] = x.zeta ?? 0; md.p[i] = x.p ?? 1; md.gamma[i] = x.gamma ?? 1; md.wEnv[i] = x.wEnv ?? 1; md.wCore[i] = x.wCore ?? 0; md.asat[i] = x.asat ?? 0; md.mult[i] = i; });
  return { id: `${starId(params)}|${key}`, key, K, family, N, modes: md };
}
// Averaged periodogram (Hann, 50 % overlap) of x[a, b): { f, S } with S in power per bin.
function psd(x, a, b, seg, fs = FS) {
  const re = new Float64Array(seg), im = new Float64Array(seg), S = new Float64Array(seg / 2);
  let k = 0;
  for (let s = a; s + seg <= b; s += seg / 2, k++) {
    for (let i = 0; i < seg; i++) { re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / seg)); im[i] = 0; }
    fft(re, im, false);
    for (let i = 0; i < seg / 2; i++) S[i] += re[i] * re[i] + im[i] * im[i];
  }
  for (let i = 0; i < seg / 2; i++) S[i] /= k;
  return { S, df: fs / seg, segs: k };
}
// Envelope of x at f: complex demodulation through a Gaussian window of width σ_t (s), every hop samples.
function envelope(x, f, sigT, a, b, hop = 48, fs = FS) {
  const w = (2 * Math.PI * f) / fs, s = sigT * fs, half = Math.ceil(4 * s), g = new Float64Array(2 * half + 1), out = [];
  for (let j = -half; j <= half; j++) g[j + half] = Math.exp(-0.5 * (j / s) ** 2);
  for (let i = a; i < b; i += hop) {
    let p = 0, q = 0;
    for (let j = -half; j <= half; j++) { const k = i + j; if (k < 0 || k >= x.length) continue; p += g[j + half] * x[k] * Math.cos(w * k); q -= g[j + half] * x[k] * Math.sin(w * k); }
    out.push(Math.hypot(p, q));
  }
  return out;
}
const peakAbs = (x) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; };
const msOf = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return s / (b - a); };
// least-squares slope of y against t
const slope = (t, y) => { const n = t.length, mt = t.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (t[i] - mt) * (y[i] - my); sxx += (t[i] - mt) ** 2; } return sxy / sxx; };

console.log('scaling relations and the pattern');
test('the scaling relations give the solar reference values (Huber et al. 2011: Δν = 135.1 μHz, ν_max = 3090 μHz at 5777 K): every key\'s star has Δν = 135.1·√(M/R³) (∝ √(mean density)), ν_max = 3090·(M/R²)/√(T_eff/5777) (∝ g/√T_eff) and an envelope 0.66·ν_max^0.88 wide, to 10⁻¹²', () => {
  for (const o of [{}, { mass: 0.9 }, { mass: 1.8 }]) for (let k = KEY_LO; k <= KEY_HI; k += 5) {
    const { star: st, sz } = keyStar(k, P(o));
    assert.ok(rel(sz.dnu, SUN.dnu * Math.sqrt(st.M / st.R ** 3)) < 1e-12, `Δν on ${k}`);
    assert.ok(rel(sz.numax, (SUN.numax * st.M) / st.R ** 2 / Math.sqrt(st.T / SUN.teff)) < 1e-12, `ν_max on ${k}`);
    assert.ok(rel(sz.fwhm, 0.66 * sz.numax ** 0.88) < 1e-12, `envelope on ${k}`);
  }
});
// The nominal p modes of a star's pattern, every degree, orders within ±span·σ of ν_max: the asymptotic
// relation ν_nl = Δν [n + l/2 + ε − l(l+1)D + (α/2)(n − n_max)²], n_max = ν_max/Δν − ε, D = δν₀₂/6Δν.
function pModes(sz, span) {
  const sig = sz.fwhm / (2 * Math.sqrt(2 * Math.log(2))), nmax = sz.numax / sz.dnu - sz.eps, D = sz.d02 / 6, out = [];
  const n0 = Math.max(1, Math.floor((sz.numax - span * sig) / sz.dnu - sz.eps - 2)), n1 = Math.ceil((sz.numax + span * sig) / sz.dnu - sz.eps + 1);
  for (let n = n0; n <= n1; n++) for (let l = 0; l <= 3; l++) {
    const nu = sz.dnu * (n + l / 2 + sz.eps - l * (l + 1) * D + (sz.alpha / 2) * (n - nmax) ** 2);
    if (Math.abs(nu - sz.numax) <= span * sig) out.push({ n, l, nu });
  }
  return out;
}
test('the asymptotic relation: every p mode of the stars on the keys (dwarfs, a subgiant, a red giant\'s l = 0, 2, 3) is at Δν[n + l/2 + ε − l(l+1)D + (α/2)(n − n_max)²] (to 10⁻⁹ Δν); the curvature taken out, every degree lies on a vertical ridge of the échelle diagram (ν mod Δν constant to 10⁻⁹ Δν), ordered l = 2, 0, 3, 1 with δν₀₂ = 6DΔν, δν₀₁ = 2DΔν, δν₀₃ = 12DΔν (Tassoul\'s l(l+1) law)', () => {
  for (const key of [96, 88, 76, 64, 40]) {
    const { sz, all } = keyStar(key, P()), dnu = sz.dnu, D = sz.d02 / 6, nmax = sz.numax / dnu - sz.eps;
    const pm = all.filter((m) => m.zeta === 0 && (m.l !== 1 || !(sz.q > 0)));
    for (const m of pm) assert.ok(Math.abs(m.nu - dnu * (m.n + m.l / 2 + sz.eps - m.l * (m.l + 1) * D + (sz.alpha / 2) * (m.n - nmax) ** 2)) < 1e-9 * dnu, `key ${key}: n ${m.n}, l ${m.l}`);
    const flat = pm.map((m) => ({ ...m, nu: m.nu - dnu * (sz.alpha / 2) * (m.n - nmax) ** 2 }));
    for (const l of [...new Set(flat.map((m) => m.l))]) {
      const r = flat.filter((m) => m.l === l).map((m) => ((m.nu / dnu) % 1 + 1) % 1);
      assert.ok(r.length >= 3, `key ${key}, l = ${l}: ${r.length} modes`);
      for (const x of r) assert.ok(Math.abs(x - r[0]) < 1e-9, `key ${key}, l = ${l} ridge not vertical: ${x} vs ${r[0]}`);
    }
    const at = (n, l) => flat.find((m) => m.n === n && m.l === l)?.nu;
    const n = Math.round(nmax);
    assert.ok(Math.abs(at(n, 0) - at(n - 1, 2) - 6 * D * dnu) < 1e-9 * dnu, `key ${key}: δν02`);
    if (!(sz.q > 0)) assert.ok(Math.abs((at(n, 0) + at(n + 1, 0)) / 2 - at(n, 1) - 2 * D * dnu) < 1e-9 * dnu, `key ${key}: δν01`);
    assert.ok(Math.abs(at(n, 0) + dnu * 1.5 - at(n, 3) - 12 * D * dnu) < 1e-9 * dnu, `key ${key}: δν03`);
  }
});
test('mixed modes (tan θ_p = q tan θ_g), the dipole modes of the red giant on C2: every root satisfies the condition to 10⁻⁸; midway between p modes the dipole period spacing is ΔΠ₁/(1 + q/N) ≈ ΔΠ₁ (within 0.5 %; within 3 % of ΔΠ₁), near each p mode the modes bunch: the smallest spacing falls below ¾ΔΠ₁, never below ζ_min·ΔΠ₁, ζ_min = [1 + 1/(qN)]⁻¹ ≈ 0.5; everywhere the spacing between neighbours is ΔΠ₁/⟨1/ζ⟩ over the period between them (dP/dJ = ζΔΠ₁; within 0.5 %); and the p mode\'s power is shared, Σ(1 − ζ) = 1 per order (within 3 %)', () => {
  // θ_p = π(ν − ν_p)/Δν: π times the (fractional) number of nominal dipole p modes below ν, piecewise
  // linear between them; θ_g = π/(ν ΔΠ₁)
  // (its modes span 49–211 μHz; looked at over 80–180 μHz, about ν_max = 130 μHz, where N = Δν/(ν²ΔΠ₁) > 5)
  const { sz, all } = keyStar(C2, P()), lo = 80, hi = 180;
  const p1 = pModes(sz, 5).filter((m) => m.l === 1), PN = p1.map((m) => m.nu).sort((a, b) => a - b);
  const seg = (nu) => { let j = 0; if (nu >= PN[PN.length - 1]) j = PN.length - 2; else while (j < PN.length - 2 && nu >= PN[j + 1]) j++; return j; };
  const th = (nu) => { const j = seg(nu); return Math.PI * (j + (nu - PN[j]) / (PN[j + 1] - PN[j])); };
  const mm = all.filter((m) => m.l === 1 && m.nu > lo && m.nu < hi).sort((a, b) => a.nu - b.nu);
  assert.ok(sz.q > 0.1 && Math.abs(sz.numax - 130) < 1&& mm.length > 80, `q ${sz.q}, ν_max ${sz.numax}, ${mm.length} dipole modes`);
  for (const m of mm) { const tg = Math.PI / (m.nu * 1e-6 * sz.dPi), tp = th(m.nu); assert.ok(Math.abs(Math.sin(tp) * Math.cos(tg) - sz.q * Math.cos(tp) * Math.sin(tg)) < 1e-8, `${m.nu}`); }
  // N = Δν/(ν²ΔΠ₁), with the p modes' local spacing (the curvature α spreads them out from ν_max)
  const N = (nu) => { const j = seg(nu); return ((PN[j + 1] - PN[j]) * 1e-6) / ((nu * 1e-6) ** 2 * sz.dPi); };
  const zetaAt = (nu) => { const c = Math.cos(th(nu)), s = Math.sin(th(nu)); return 1 / (1 + (sz.q / N(nu)) / (sz.q * sz.q * c * c + s * s)); };
  let far = 0, near = 0;
  for (let k = 0; k + 1 < mm.length; k++) {
    const a = mm[k], b = mm[k + 1], dP = 1e6 / a.nu - 1e6 / b.nu, numid = 2 / (1 / a.nu + 1 / b.nu);
    // dP/dJ = ζΔΠ₁, so between neighbours ΔP = ΔΠ₁/⟨1/ζ⟩, the mean over the period between them (Simpson, 8 panels)
    let inv = 0;
    for (let j = 0; j <= 8; j++) { const P1 = 1 / a.nu + (j / 8) * (1 / b.nu - 1 / a.nu); inv += (j === 0 || j === 8 ? 1 : j % 2 ? 4 : 2) / zetaAt(1 / P1); }
    const zbar = 24 / inv;
    assert.ok(Math.abs(dP / (sz.dPi * zbar) - 1) < 0.005, `ΔP ${dP.toFixed(2)} s vs ζ̄ΔΠ₁ ${(sz.dPi * zbar).toFixed(2)} s at ${numid.toFixed(1)} μHz`);
    const phase = ((th(numid) / Math.PI) % 1 + 1) % 1;
    if (Math.abs(phase - 0.5) < 0.1) { far++; assert.ok(Math.abs(dP * (1 + sz.q / N(numid)) / sz.dPi - 1) < 0.005 && Math.abs(dP / sz.dPi - 1) < 0.03, `far from p modes: ΔP = ${dP.toFixed(2)} s`); }
  }
  for (const p of p1.filter((m) => m.nu > lo + 15 && m.nu < hi - 15)) {
    const around = mm.filter((m) => Math.abs(m.nu - p.nu) < 0.5 * sz.dnu);
    let dmin = Infinity;
    for (let k = 0; k + 1 < around.length; k++) dmin = Math.min(dmin, 1e6 / around[k].nu - 1e6 / around[k + 1].nu);
    const qN = sz.q * N(p.nu), zmin = qN / (1 + qN);
    assert.ok(dmin >= zmin * sz.dPi * 0.999 && dmin < 0.75 * sz.dPi, `near ${p.nu.toFixed(1)} μHz: ΔP_min ${dmin.toFixed(1)} s, ζ_min ΔΠ₁ ${(zmin * sz.dPi).toFixed(1)} s`);
    const share = mm.filter((m) => Math.abs(th(m.nu) / Math.PI - Math.round(th(p.nu) / Math.PI)) < 0.5).reduce((s, m) => s + 1 - m.zeta, 0);
    assert.ok(Math.abs(share - 1) < 0.03, `Σ(1 − ζ) = ${share.toFixed(3)} around ${p.nu.toFixed(1)} μHz`);
    near++;
  }
  assert.ok(far >= 8 && near >= 4, `${far} spacings far from p modes, ${near} p modes`);
  console.log(`         ${mm.length} dipole modes (Δν ${sz.dnu.toFixed(2)} μHz, ΔΠ₁ ${sz.dPi.toFixed(1)} s, q ${sz.q.toFixed(3)}): ${far} spacings far from p modes, ${near} p modes`);
});
test('inclination (Gizon & Solanki 2003): E_lm(i) sums to 1 over m for l = 0–3 at every i; pole-on only m = 0 is seen; equator-on E₁,±₁ = ½, E₂₀ = ¼, E₂,±₁ = 0, E₂,±₂ = ⅜, and l = 3 shows only odd m', () => {
  for (let l = 0; l <= 3; l++) for (let d = 0; d <= 90; d += 7.5) {
    let s = 0; for (let m = -l; m <= l; m++) s += Elm(l, m, (d * Math.PI) / 180);
    assert.ok(Math.abs(s - 1) < 1e-12, `l = ${l}, i = ${d}°: ${s}`);
  }
  for (let l = 1; l <= 3; l++) { assert.ok(Math.abs(Elm(l, 0, 0) - 1) < 1e-12); for (let m = 1; m <= l; m++) assert.ok(Elm(l, m, 0) < 1e-24); }
  const e = Math.PI / 2;
  assert.ok(Math.abs(Elm(1, 1, e) - 0.5) < 1e-12 && Math.abs(Elm(2, 0, e) - 0.25) < 1e-12 && Elm(2, 1, e) < 1e-24 && Math.abs(Elm(2, 2, e) - 0.375) < 1e-12);
  assert.ok(Elm(3, 0, e) < 1e-24 && Elm(3, 2, e) < 1e-24 && Elm(3, 1, e) > 0.1);
});

console.log('the track and the tuning');
test('the keyboard is an evolutionary track (1 M☉): ZAMS from Tout et al. (1996) (0.70 L☉, 0.89 R☉), through the Sun (R = 1, 5777 K), red giants below; the Sun sits on G6 (its heard pitch × K within 0.1 ¢), ν_max falls monotonically down the keyboard, dwarfs on top, subgiants, giants at the bottom (ν_max 125–135 μHz on C2); mixed modes only once the star leaves the main sequence', () => {
  const z = zams(1);
  assert.ok(Math.abs(z.L - 0.698) < 0.002 && Math.abs(z.R - 0.888) < 0.002, `ZAMS ${z.L}, ${z.R}`);
  const sun = starAt(Math.log(1 / z.R), 1);
  assert.ok(Math.abs(sun.R - 1) < 1e-12 && Math.abs(sun.T - 5777) < 1e-6 && Math.abs(sun.L - 1) < 1e-9, 'the track passes through the Sun');
  // the star tuned to G6 is the Sun: its pitch × K moves by about 0.1 ¢ for 3·10⁻⁵ in R
  const g6 = keyStar(SUN_KEY, P());
  assert.ok(Math.abs(g6.star.R - 1) < 3e-5 && Math.abs(g6.star.T - 5777) < 0.05 && Math.abs(g6.star.s - sun.s) < 3e-5, `G6: R ${g6.star.R}, T ${g6.star.T}`);
  let last = Infinity, rank = 3;
  const order = { giant: 1, subgiant: 2, dwarf: 3 };
  for (let k = KEY_HI; k >= KEY_LO; k -= 3) {
    const d = keyStar(k, P());
    assert.ok(d.sz.numax < last, `ν_max rises up the keyboard (key ${k})`); last = d.sz.numax;
    assert.ok(order[d.star.stage] <= rank, `stage order at ${k}: ${d.star.stage}`); rank = order[d.star.stage];
    assert.equal(d.sz.q > 0, d.star.stage !== 'dwarf' || d.star.s > Math.log(1.52), `mixed modes on ${k}`);
  }
  const c2 = keyStar(C2, P());
  assert.ok(c2.star.stage === 'giant' && c2.sz.numax > 125 && c2.sz.numax < 135, `C2: ${c2.sz.numax}`);
});
test('every key in tune: the star\'s heard pitch (the power-weighted mean log frequency of its modes) × K on the note within 0.02 ¢ on all 88 keys at the defaults, and on every fourth key for tracks of 0.9, 1.3 and 1.8 M☉ and K = 350,000 and 1,000,000; ν_max sits 8–32 ¢ above the note on C2–C7 (up to 36 ¢ on the giants below), the nearest radial mode within ±Δν/2', () => {
  const noff = [], roff = [];
  const check = (p, step) => {
    for (let k = KEY_LO; k <= KEY_HI; k += step) {
      const d = keyStar(k, p), c = cents(d.pitch, keyFreq(k));
      assert.ok(Math.abs(c) < 0.02, `key ${k} (M ${p.mass}, K ${p.speedup}): ${c.toFixed(3)} ¢`);
      const nm = cents(d.sz.numax * d.K * 1e-6, keyFreq(k)); noff.push(nm);
      assert.ok(nm > 8 && nm < (k < C2 ? 36 : 32), `ν_max offset ${nm.toFixed(1)} ¢ on ${k}`);
      const rad = d.all.filter((m) => m.l === 0).reduce((b, m) => (Math.abs(m.nu - d.sz.numax) < Math.abs(b.nu - d.sz.numax) ? m : b));
      roff.push(cents(rad.nu * d.K * 1e-6, keyFreq(k)));
      assert.ok(Math.abs(rad.nu - d.sz.numax) <= 0.5 * d.sz.dnu * 1.05, `radial mode on ${k}`);
    }
  };
  check(P(), 1);
  for (const o of [{ mass: 0.9 }, { mass: 1.3 }, { mass: 1.8 }, { speedup: 350000 }, { speedup: 1e6 }]) check(P(o), 4);
  console.log(`         ν_max ${Math.min(...noff).toFixed(1)} to ${Math.max(...noff).toFixed(1)} ¢ above the note; nearest radial mode ${Math.min(...roff).toFixed(0)} to +${Math.max(...roff).toFixed(0)} ¢`);
});
test('the keyboard\'s tuning: each key\'s star is found for its tuned pitch, its heard pitch × K within 0.02 ¢ of 440·2^((m−69)/12)·415/440 at A = 415 Hz (a giant, a subgiant, a dwarf, a δ Scuti star), and in ¼-comma meantone on C, E4 3.42 ¢ flat of equal temperament, C4 10.26 ¢ sharp, A4 on 440 Hz; the engine plays the page\'s tuned star as its own, and ignores one built for another tuning', () => {
  for (const [k, o] of [[40, {}], [64, {}], [88, {}], [48, { family: 'dscuti' }]]) {
    const c = cents(keyStar(k, P({ ...o, pitch: 415 })).pitch, (keyFreq(k) * 415) / 440);
    assert.ok(Math.abs(c) < 0.02, `key ${k} ${o.family ?? ''} at 415 Hz: ${c.toFixed(3)} ¢`);
  }
  for (const [k, want] of [[64, -3.42], [60, 10.26], [69, 0]]) {
    const c = cents(keyStar(k, P({ temperament: 'meantone' })).pitch, keyFreq(k));
    assert.ok(Math.abs(c - want) < 0.02, `key ${k} in meantone: ${c.toFixed(3)} ¢, not ${want}`);
  }
  const p = P({ temperament: 'meantone', tuningRoot: 2 }), data = keyStar(52, p);
  const own = run(p, [[0, 'on', 52, 0.7]], 0.2), sent = run(p, [[0, 'on', 52, 0.7, data]], 0.2), other = run(p, [[0, 'on', 52, 0.7, keyStar(52, P())]], 0.2);
  for (let i = 0; i < own.length; i++) { assert.equal(own[i], sent[i]); assert.equal(own[i], other[i]); }
});
test('rotation: a p mode splits by mΩ/2π (C_nl ≈ 0), a g-dominated dipole mode by ζ·½·mΩ_core/2π + (1 − ζ)·mΩ_env/2π (C_g = ½), so the splitting ∝ Ω(1 − C_nl); δ Scuti\'s low-order modes by (1 − 0.05)mΩ/2π', () => {
  for (const key of [40, 84]) {
    const d = keyStar(key, P()), md = d.modes;
    for (let i = 0; i < d.N; i++) {
      const l = md.l[i], [we, wc] = l === 0 ? [0, 0] : l === 1 ? [1 - md.zeta[i], 0.5 * md.zeta[i]] : [1, 0];
      assert.ok(Math.abs(md.wEnv[i] - we) < 1e-12 && Math.abs(md.wCore[i] - wc) < 1e-12, `key ${key}, l = ${l}, ζ = ${md.zeta[i]}`);
    }
  }
  const ds = keyStar(48, P({ family: 'dscuti' }));
  for (let i = 0; i < ds.N; i++) assert.ok(Math.abs(ds.modes.wEnv[i] - (ds.modes.l[i] ? 1 - DS_C : 0)) < 1e-12);
});

console.log('the engine');
test('stochastic driving: one mode, rendered 240 s, has a Lorentzian power spectrum of the set width (Γ = 4 Hz, fitted within 6 %) at the set frequency (within 0.1 Hz), and the set mean power (OU kicks every block: σ² = p(1 − e^(−2ηT))), within 8 %', () => {
  const p = P({ spin: 0 }), key = 69, f0 = 1000.3, G = 4;
  const data = custom(key, p, [{ f: f0, gamma: G, p: 1 }]);
  const x = run(p, [[0, 'on', key, 1, data]], 240), a = 3 * FS;
  const { S, df } = psd(x, a, x.length, 1 << 18);
  // fit ln S = ln A − ln((f − f₀)² + (Γ/2)²) over ±5Γ: grid in Γ and f₀, A by the mean
  const i0 = Math.floor((f0 - 5 * G) / df), i1 = Math.ceil((f0 + 5 * G) / df);
  let best = null;
  for (let g = 0.7 * G; g <= 1.3 * G; g += 0.002 * G) for (let c = f0 - 0.4; c <= f0 + 0.4; c += 0.01) {
    let m = 0, k = 0; const r = [];
    for (let i = i0; i <= i1; i++) { const v = Math.log(S[i]) + Math.log((i * df - c) ** 2 + (g / 2) ** 2); r.push(v); m += v; k++; }
    m /= k; let e = 0; for (const v of r) e += (v - m) ** 2;
    if (!best || e < best.e) best = { e, g, c };
  }
  assert.ok(Math.abs(best.g / G - 1) < 0.06, `fitted Γ ${best.g.toFixed(3)} Hz`);
  assert.ok(Math.abs(best.c - f0) < 0.1, `fitted f₀ ${best.c.toFixed(3)} Hz`);
  const want = (OUT * voicing(key)) ** 2 * p.driving ** 2 * 0.5 * Math.SQRT2 ** 0; // L + R: both pans (equal power) add in amplitude
  const [gl, gr] = panOf(key);
  const ms = msOf(x, a), expect = want * (gl + gr) ** 2;
  assert.ok(Math.abs(ms / expect - 1) < 0.08, `mean power ${ms.toExponential(3)} vs ${expect.toExponential(3)}`);
  console.log(`         Γ ${best.g.toFixed(3)} Hz (set 4), f₀ ${best.c.toFixed(3)} Hz, power ${(ms / expect).toFixed(3)} × the set value`);
});
test('key-up: the convection stops and each mode rings down at its own linewidth: one mode decays as e^(−πΓt) (within 1 %); a Sun-like star\'s whole note (all modes Γ₀) loses power as e^(−2πΓ₀t) (within 5 %); the pedal keeps it going; a red giant\'s g-dominated mixed modes outlast its radial modes', () => {
  const p = P({ spin: 0, flare: 0 }), key = 72, G = 1.5;
  const data = custom(key, p, [{ f: 700, gamma: G, p: 1 }]);
  const x = run(p, [[0, 'on', key, 1, data], [2, 'off', key]], 4.2);
  const env = envelope(x, 700, 0.01, 2.1 * FS, 3.1 * FS), t = env.map((_, i) => (i * 48) / FS), y = env.map((v) => Math.log(v));
  const eta = -slope(t, y);
  assert.ok(Math.abs(eta / (Math.PI * G) - 1) < 0.01, `η ${eta.toFixed(4)} vs πΓ ${(Math.PI * G).toFixed(4)}`);
  // a dwarf: every mode has Γ₀
  const d = keyStar(84, p), g0 = d.sz.gamma * d.K * 1e-6, y2 = run(p, [[0, 'on', 84, 1], [3, 'off', 84]], 5.1);
  const win = Math.round(0.26 * FS), pts = [], tt = []; // windows long enough to average the l = 0/l = 2 beats
  for (let s = Math.round(3.05 * FS); s + win < y2.length; s += win) { tt.push(s / FS); pts.push(Math.log(msOf(y2, s, s + win))); }
  const k = -slope(tt, pts);
  assert.ok(Math.abs(k / (2 * Math.PI * g0) - 1) < 0.05, `power decays at ${k.toFixed(3)} s⁻¹, 2πΓ₀ = ${(2 * Math.PI * g0).toFixed(3)}`);
  const held = run(p, [[0, 'on', 84, 1], [0.5, 'sus', true], [1, 'off', 84]], 3);
  assert.ok(msOf(held, 2.5 * FS) > 0.3 * msOf(held, 0.5 * FS, FS), 'sustain holds the driving');
  const rg = keyStar(38, p), md = rg.modes;
  let radial = Infinity, gdom = 0;
  for (let i = 0; i < rg.N; i++) { if (md.l[i] === 0) radial = Math.min(radial, 1 / md.gamma[i]); if (md.zeta[i] > 0.8) gdom = Math.max(gdom, 1 / md.gamma[i]); }
  assert.ok(gdom > 4 * radial, `g-dominated lifetime ${gdom.toFixed(0)} vs radial ${radial.toFixed(0)} (in 1/Γ, s)`);
});
test('the engine plays the model\'s modes: a Sun-like star rendered 24 s (narrow lines) has the model\'s modes as its strongest peaks, each within 0.05 Hz of the model, and its l = 0 ridge on the model\'s radial frequencies', () => {
  const p = P({ spin: 0, damping: 0.25 }), key = 88, d = keyStar(key, p);
  const x = run(p, [[0, 'on', key, 1]], 24), { S, df } = psd(x, 2 * FS, x.length, 1 << 19);
  const f = Array.from(d.modes.f), lo = Math.min(...f) - 20, hi = Math.max(...f) + 20, peaks = [];
  for (let i = Math.floor(lo / df); i < hi / df; i++) if (S[i] > S[i - 1] && S[i] >= S[i + 1]) peaks.push(i);
  peaks.sort((a, b) => S[b] - S[a]);
  for (const i of peaks.slice(0, 12)) {
    const c = i + (0.5 * (S[i - 1] - S[i + 1])) / (S[i - 1] - 2 * S[i] + S[i + 1]), fr = c * df;
    const near = f.reduce((b, v) => (Math.abs(v - fr) < Math.abs(b - fr) ? v : b));
    assert.ok(Math.abs(near - fr) < 0.05 + 2 * df, `peak at ${fr.toFixed(2)} Hz, nearest mode ${near.toFixed(2)} Hz`);
  }
  for (const m of d.multiplets.filter((x) => x.l === 0 && x.power > 0.3)) {
    const i = Math.round((m.nu * d.K * 1e-6) / df), q = Math.round((0.25 * d.sz.dnu * d.K * 1e-6) / df), bg = Math.max(S[i + q], S[i - q]);
    assert.ok(Math.max(S[i - 1], S[i], S[i + 1]) > 10 * bg, `radial mode at ${(m.nu * d.K * 1e-6).toFixed(1)} Hz`);
  }
});
test('every key sounds at its pitch: the log-power centroid of the engine\'s own output (40 s, linewidths × 10 so the modes average out) within 10 ¢ of the note on A0, C2, C3, C4, C5, C6, C7 and C8', () => {
  const p = P({ damping: 10 }), res = [];
  for (const key of [21, 36, 48, 60, 72, 84, 96, 108]) {
    const x = run(p, [[0, 'on', key, 1]], 40), { S, df } = psd(x, FS, x.length, 1 << 16), f = keyFreq(key);
    let w = 0, s = 0;
    for (let i = Math.floor((0.55 * f) / df); i < (1.6 * f) / df; i++) { w += S[i]; s += S[i] * Math.log(i * df); }
    const c = cents(Math.exp(s / w), f); res.push(c.toFixed(1));
    assert.ok(Math.abs(c) < 10, `key ${key}: ${c.toFixed(1)} ¢`);
  }
  console.log(`         centroids ${res.join(', ')} ¢`);
});
test('the flare kick: with the convection off, a struck Sun-like star rings, and the wave packet the flare launches comes back every 1/Δν (the envelope\'s autocorrelation peaks at 1/(Δν·K), within 3 %); driving and flare off: silence', () => {
  const p = P({ driving: 0, flare: 2, spin: 0 }), key = 84, d = keyStar(key, p), T = 1 / (d.sz.dnu * d.K * 1e-6);
  const x = run(p, [[0, 'on', key, 1]], 0.4), e = new Float64Array(x.length), sm = Math.round(0.0015 * FS);
  let acc = 0; for (let i = 0; i < x.length; i++) { acc += x[i] * x[i]; if (i >= sm) acc -= x[i - sm] * x[i - sm]; e[i] = acc; }
  const n = Math.round(8 * T * FS), mean = e.subarray(0, n).reduce((a, b) => a + b) / n;
  let best = 0, lag = 0;
  for (let L = Math.round(0.6 * T * FS); L < 1.4 * T * FS; L++) { let c = 0; for (let i = 0; i < n; i++) c += (e[i] - mean) * (e[i + L] - mean); if (c > best) { best = c; lag = L; } }
  assert.ok(Math.abs(lag / FS / T - 1) < 0.03, `echo every ${(1000 * lag / FS).toFixed(2)} ms; 1/(Δν·K) = ${(1000 * T).toFixed(2)} ms`);
  assert.ok(peakAbs(x) > 0.02, 'it rings');
  const quiet = run(P({ driving: 0, flare: 0 }), [[0, 'on', key, 1]], 0.3);
  assert.ok(peakAbs(quiet) === 0, 'nothing drives it');
});
test('rotation and inclination in the output: a dipole p multiplet splits into lines m·Ω/2π·K apart (within 0.5 %), a g-dominated one by ζ·½·Ω_core + (1 − ζ)Ω_env; pole-on its m = ±1 lines vanish (below −30 dB), equator-on its m = 0 line does', () => {
  const key = 64, spin = 20, ratio = 10, K = K0, om = spin * SUN.rot * K * 1e-6, f0 = 400;
  const line = (S, df, f) => { const i = Math.round(f / df); return Math.max(S[i - 1], S[i], S[i + 1]); };
  for (const [zeta, inc] of [[0, 60], [0.9, 60], [0, 0], [0, 90]]) {
    const p = inc === 60 ? P({ spin, coreRatio: ratio, incl: inc, driving: 0, flare: 2 }) : P({ spin, coreRatio: ratio, incl: inc, flare: 0 });
    const [we, wc] = [1 - zeta, 0.5 * zeta], split = om * (we + wc * ratio);
    const data = custom(key, p, [-1, 0, 1].map((m) => ({ f: f0, l: 1, m, gamma: 0.05, p: 1, zeta, wEnv: we, wCore: wc })));
    const x = run(p, [[0, 'on', key, 1, data]], 24), { S, df } = psd(x, 2 * FS, x.length, 1 << 20);
    if (inc === 60) {
      for (const m of [-1, 1]) {
        let bi = Math.round((f0 + m * split) / df);
        for (let i = bi - 8; i <= bi + 8; i++) if (S[i] > S[bi]) bi = i;
        const c = bi + (0.5 * (S[bi - 1] - S[bi + 1])) / (S[bi - 1] - 2 * S[bi] + S[bi + 1]), meas = Math.abs(c * df - f0);
        assert.ok(Math.abs(meas / split - 1) < 0.005, `ζ = ${zeta}: m = ${m} at ${meas.toFixed(4)} Hz from centre, expected ${split.toFixed(4)}`);
      }
    } else {
      const c = line(S, df, f0), s = Math.max(line(S, df, f0 + split), line(S, df, f0 - split));
      if (inc === 0) assert.ok(s < 1e-3 * c, `pole-on: m = ±1 at ${(10 * Math.log10(s / c)).toFixed(1)} dB`);
      else assert.ok(c < 1e-3 * s, `equator-on: m = 0 at ${(10 * Math.log10(c / s)).toFixed(1)} dB`);
    }
  }
});
test('δ Scuti: each mode obeys dA/dt = (γ − βA²)A: it grows at γ = 1/(growth time) (within 5 %) and saturates at A_sat = √(γ/β) (within 1 %), with no noise; the fundamental is on the note, the overtones at P₁/P₀ = 0.773 and P₂/P₁ = 0.802; every key speaks (half its final level) within 0.5 s at the default touch', () => {
  const p = P({ family: 'dscuti', flare: 0, spin: 0, growth: 0.2 }), key = 57, as = 0.7;
  const data = custom(key, p, [{ f: 300, asat: as, p: as * as }], { family: 'dscuti' });
  const x = run(p, [[0, 'on', key, 1, data]], 4);
  const env = envelope(x, 300, 0.008, 0, 4 * FS, 96), g = OUT * voicing(key) * (panOf(key)[0] + panOf(key)[1]);
  // the envelope's demodulation gain: Σ window = σ√(2π)·fs, half of the amplitude in each sideband
  const k = (0.008 * FS * Math.sqrt(2 * Math.PI)) / 2, A = env.map((v) => v / k / g), t = env.map((_, i) => (i * 96) / FS);
  const early = [], te = [];
  for (let i = 0; i < A.length; i++) if (t[i] > 0.1 && A[i] < 0.05 * as) { early.push(Math.log(A[i])); te.push(t[i]); }
  const gamma = slope(te, early);
  assert.ok(Math.abs(gamma * 0.2 - 1) < 0.05, `growth rate ${gamma.toFixed(2)} s⁻¹, γ = 5`);
  const fin = A.filter((_, i) => t[i] > 3 && t[i] < 3.8), mean = fin.reduce((a, b) => a + b) / fin.length;
  assert.ok(Math.abs(mean / as - 1) < 0.01, `saturates at ${mean.toFixed(4)}, A_sat ${as}`);
  for (const v of fin) assert.ok(Math.abs(v / mean - 1) < 0.002, 'steady: no noise');
  for (const kk of [21, 36, 50, 60, 77, 96, 108]) {
    const d = keyStar(kk, P({ family: 'dscuti' })), f = Array.from(d.modes.f).filter((_, i) => d.modes.l[i] === 0).sort((a, b) => a - b);
    assert.ok(Math.abs(cents(f[0], keyFreq(kk))) < 1e-6 && Math.abs(f[0] / f[1] - 0.773) < 1e-9 && Math.abs(f[1] / f[2] - 0.802) < 1e-9, `${kk}`);
    const y = run(P({ family: 'dscuti' }), [[0, 'on', kk, 0.7]], 1.2), w = Math.round(0.02 * FS), lv = [];
    for (let s = 0; s + w <= y.length; s += w) lv.push(Math.sqrt(msOf(y, s, s + w)));
    const final = lv.slice(-5).reduce((a, b) => a + b) / 5, on = lv.findIndex((v) => v > 0.5 * final) * 0.02;
    assert.ok(on >= 0 && on < 0.5, `key ${kk} speaks after ${on.toFixed(2)} s`);
  }
});
test('voices: pressing a sounding key drives the same star again (one voice); voice stealing fades the quietest older star, never one just pressed, without clicks; a released star is dropped once silent', () => {
  const x = run(P(), [[0, 'on', 60, 0.8], [0.5, 'off', 60], [0.7, 'on', 60, 0.8]], 1);
  assert.equal(x.engine.voiceCount(), 1);
  const ev = [];
  for (let i = 0; i < 20; i++) ev.push([0.04 * i, 'on', C2 + 3 * i, 0.6]);
  const y = run(P(), ev, 1.2), e = y.engine;
  assert.ok(e.voices.filter((v) => !v.fading).length <= 14, `${e.voices.length} voices`);
  assert.ok(e.byKey.has(C2 + 57) && !e.byKey.get(C2 + 57).fading, 'the newest star sounds');
  let worst = 0;
  for (let i = 2; i < y.length; i++) worst = Math.max(worst, Math.abs(y[i] - 2 * y[i - 1] + y[i - 2]));
  assert.ok(worst < 0.5 * peakAbs(y), `second difference ${worst.toExponential(2)} vs peak ${peakAbs(y).toFixed(3)}`);
  const gone = run(P({ damping: 10 }), [[0, 'on', 90, 0.7], [0.3, 'off', 90]], 2);
  assert.equal(gone.engine.voiceCount(), 0, 'a released dwarf with broad modes is gone within 2 s');
});
test('the page builds the stars and sends them with the note: the engine plays the page\'s data exactly as its own; data for another star is ignored', () => {
  const p = P(), data = keyStar(45, p);
  const own = run(p, [[0, 'on', 45, 0.7]], 0.2), sent = run(p, [[0, 'on', 45, 0.7, data]], 0.2);
  for (let i = 0; i < own.length; i++) assert.equal(own[i], sent[i]);
  const stale = keyStar(45, P({ mass: 1.4 })), other = run(p, [[0, 'on', 45, 0.7, stale]], 0.2);
  for (let i = 0; i < own.length; i++) assert.equal(own[i], other[i]);
});

console.log('levels and stability');
test('level: a forte note peaks at 0.1–0.5 across the compass at 44.1 and 48 kHz (flare included); forte chords of 4 and 6 stars stay under 1; every preset within 10 dB of the default', () => {
  const stereoPeak = (p, ev, sec, o) => { const [L, R] = run(p, ev, sec, { ...o, stereo: true }); return Math.max(peakAbs(L), peakAbs(R)); };
  const pk = [];
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += 5) {
    const v = stereoPeak(P(), [[0, 'on', k, 1]], 1.5, { fs });
    pk.push(v);
    assert.ok(v > 0.1 && v < 0.5, `key ${k} at ${fs}: ${v.toFixed(3)}`);
  }
  const c4 = stereoPeak(P(), [36, 43, 48, 52].map((k) => [0, 'on', k, 1]), 2), c6 = stereoPeak(P(), [60, 64, 67, 72, 76, 79].map((k) => [0, 'on', k, 1]), 2);
  console.log(`         forte peaks ${Math.min(...pk).toFixed(2)}–${Math.max(...pk).toFixed(2)}; chords ${c4.toFixed(2)}, ${c6.toFixed(2)}`);
  assert.ok(c4 < 1 && c6 < 1, `chords ${c4.toFixed(3)}, ${c6.toFixed(3)}`);
  const phrase = (p) => { const x = run(p, [48, 55, 60, 64, 67].map((k, i) => [0.15 * i, 'on', k, 0.7]), 2.5); return 10 * Math.log10(msOf(x, FS)); };
  const ref = phrase(P());
  for (const pr of PRESETS) { const d = phrase(P(pr.p)) - ref; assert.ok(Math.abs(d) < 10, `${pr.name}: ${d.toFixed(1)} dB`); }
});
test('stability: seeded random combinations of parameter extremes at 44.1 and 48 kHz, knobs moved mid-note, both families: no NaN, bounded', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((q) => !q.type && !['volume', 'room', 'velocity'].includes(q.id));
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 8; trial++) {
    const fs = trial % 2 ? 44100 : 48000, p = P({ family: trial % 4 === 3 ? 'dscuti' : 'track' });
    for (const q of sliders) { const r = rnd(); p[q.id] = r < 0.4 ? q.min : r < 0.8 ? q.max : q.def; }
    const q = { ...p, spin: 30 - p.spin, incl: 90 - p.incl, damping: p.damping > 1 ? 0.1 : 10, driving: 2 - p.driving, growth: p.growth > 0.3 ? 0.05 : 2 };
    const x = run(p, [[0, 'on', KEY_LO, 1], [0, 'on', 70, 1], [0, 'on', KEY_HI, 1], [0.15, 'params', q], [0.2, 'on', 70, 1], [0.25, 'off', KEY_LO], [0.3, 'on', KEY_LO, 0.05]], 0.5, { fs });
    for (const v of x) assert.ok(Number.isFinite(v), `trial ${trial}: NaN`);
    assert.ok(peakAbs(x) < 10, `trial ${trial}: peak ${peakAbs(x).toFixed(2)}`);
  }
});
test('knobs glide: rotation, inclination and driving moved mid-note do not click; after the damping moves, the sound is as smooth as it is at the new setting from the start', () => {
  const second = (x, a, b) => { let m = 0; for (let i = Math.max(2, a); i < b; i++) m = Math.max(m, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2])); return m; };
  for (const [id, to] of [['spin', 30], ['incl', 0], ['driving', 2], ['damping', 10]]) {
    const p = P({ flare: 0 }), x = run(p, [[0, 'on', 76, 0.7], [0.5, 'params', { ...p, [id]: to }]], 0.75);
    const ref = id === 'damping' ? second(run(P({ flare: 0, damping: 10 }), [[0, 'on', 76, 0.7]], 0.75), 0.5 * FS, 0.75 * FS) : second(x, 0.25 * FS, 0.5 * FS);
    const after = second(x, 0.5 * FS, 0.75 * FS);
    assert.ok(after < 2 * ref + 1e-6, `${id}: second difference ${after.toExponential(2)} after, ${ref.toExponential(2)} for reference`);
  }
});
console.log('MPE');
// A note's slide is its own star's rotation (a star doesn't bend)
const slide = (t, key, value) => [t, 'msg', { type: 'slide', key, value }];
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
test('a star with its own rotation (a slide before the note) sounds as the knob there, sample for sample, both families; a star held beside it keeps the knob\'s', () => {
  for (const family of ['track', 'dscuti']) {
    const p = P({ family });
    const x = run(p, [slide(0, 76, 15), [0, 'on', 76, 0.8]], 1), k = run(P({ family, spin: 15 }), [[0, 'on', 76, 0.8]], 1);
    assert.ok(same(x, k), `${family}: as the knob at 15× the Sun`);
    assert.ok(!same(x, run(p, [[0, 'on', 76, 0.8]], 1)), `${family}: and not as the knob's own`);
  }
  // struck by the flare alone (the convection's draws are shared), 79 first, then 76: the chord less
  // 79 alone is 76, whether 79 spins or not
  const q = P({ driving: 0 });
  const d = (ev) => { const c = run(q, [...ev, [0, 'on', 79, 0.8], [0, 'on', 76, 0.8]], 1), s = run(q, [...ev, [0, 'on', 79, 0.8]], 1); return c.map((v, i) => v - s[i]); };
  const a = d([slide(0, 79, 25)]), b = d([]);
  const err = peakAbs(a.map((v, i) => v - b[i])), pk = peakAbs(b);
  assert.ok(err < 1e-6 * pk && pk > 0.01, `the other star moves by ${err.toExponential(2)} (peak ${pk.toFixed(3)})`);
});
test('a slide while the star sounds glides, as the knob does: no click, and the star spins up', () => {
  const second = (x, a, b) => { let m = 0; for (let i = Math.max(2, a); i < b; i++) m = Math.max(m, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2])); return m; };
  const p = P({ flare: 0 }), x = run(p, [[0, 'on', 76, 0.7], slide(0.5, 76, 30)], 0.75);
  const before = second(x, 0.25 * FS, 0.5 * FS), after = second(x, 0.5 * FS, 0.75 * FS);
  assert.ok(after < 2 * before + 1e-6, `second difference ${after.toExponential(2)} after, ${before.toExponential(2)} before`);
  assert.ok(!same(x, run(p, [[0, 'on', 76, 0.7]], 0.75)), 'it moved');
});
test('slide(NaN) leaves the sound bit for bit as it was, before the note and while it sounds', () => {
  const x = run(P(), [slide(0, 60, NaN), [0, 'on', 60, 0.8], slide(0.2, 60, NaN), [0.3, 'msg', { type: 'noteBend', key: 60, value: 1 }]], 0.8);
  assert.ok(same(x, run(P(), [[0, 'on', 60, 0.8]], 0.8)));
});
test('slide sweeps on chords, sent every block across the whole range, stay finite and bounded at 44.1, 48 and 96 kHz, both families', () => {
  for (const fs of [44100, 48000, 96000]) for (const family of ['track', 'dscuti']) {
    const keys = [KEY_LO, 48, 60, 64, 67, KEY_HI], ev = keys.map((k) => [0, 'on', k, 1]);
    for (let b = 0; b < (0.8 * fs) / 128; b++) keys.forEach((k, i) => ev.push(slide((b * 128) / fs, k, 15 + 15 * Math.sin(b / (3 + i)))));
    const x = run(P({ family }), ev, 0.8, { fs });
    for (const v of x) assert.ok(Number.isFinite(v), `${fs} ${family}: NaN`);
    assert.ok(peakAbs(x) < 3, `${fs} ${family}: peak ${peakAbs(x).toFixed(2)}`);
  }
});
function cpu(keys) {
  const p = P(), data = keys.map((k) => keyStar(k, p)), e = new StarEngine(FS); e.setParams(p);
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (let k = 0; k < keys.length; k++) e.noteOn(keys[k], 0.8, data[k]);
  for (let i = 0; i < 40; i++) e.process(bL, bR, 128);
  const sec = 2, n = Math.round((sec * FS) / 128), t0 = performance.now();
  for (let i = 0; i < n; i++) e.process(bL, bR, 128);
  return { load: (performance.now() - t0) / 1000 / sec, modes: data.reduce((s, d) => s + d.N, 0) };
}
test('CPU: 10 stars across the keyboard (the default track), held and driven, at 48 kHz in under 30 % of one core', () => {
  const { load, modes } = cpu([36, 42, 48, 54, 60, 66, 72, 78, 84, 90]);
  console.log(`         ${(100 * load).toFixed(1)} % of real time (${modes} modes)`);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
});
test('CPU: 10 red giants (the bottom of the keyboard, the most modes), held and driven, at 48 kHz in under 30 % of one core', () => {
  const { load, modes } = cpu([36, 37, 38, 39, 40, 41, 42, 43, 44, 45]);
  console.log(`         ${(100 * load).toFixed(1)} % of real time (${modes} modes)`);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
