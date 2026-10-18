// Spring Keyboard checks. Run: node test/springs-tests.mjs
//
// The C++ (native/instruments/springs), built as WebAssembly: the model's functions through
// springs-wasm.js, the engine through loadEngine. Wittrick's helical rod against the ring's
// textbook modes, rigid-body motion and the slinky line; the thin-spring model against
// Wittrick's; F_C against Parker & Bilbao's formula; the direction of the chirps; then the engine
// against the model: tuning, arrival times and echo spacing measured from its impulse response,
// springs in parallel, damping, the damper, voices, levels, stability and cost.

import assert from 'node:assert/strict';
import { fft } from '../tools/audio-util.mjs';
import { INSTRUMENT, KEY_LO, KEY_HI, DEFAULTS, GROUPS, PRESETS } from '../springs/src/springs-instrument.js';
import { wasmModel } from '../springs/src/springs-wasm.js';
import { loadEngine } from '../tools/engine.mjs';
import { keyFreq } from '../shared/dsp.js';

const SpringEngine = await loadEngine(INSTRUMENT);
const { tuneSpring, keySprings, dispersionCurve, modeSigma, pulseLength, pulseSpectrum, rodSolve } = await wasmModel();

const FS = 48000;
let failures = 0;
function test(name, fn) {
  // CPU budgets are set on a desktop machine; shared CI runners are slower and noisy
  if (process.env.CI && /^CPU|real time|costlier/.test(name)) { console.log('  skip', name, '(timing; skipped on CI)'); return; }
  try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); }
}
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const DRY = { endLoss: 0.005, eta: 1e-5, oil: 0 };        // as little loss as the knobs allow

// Run the engine through events ([t, 'on', key, vel] | [t, 'off', key, vel?] | [t, 'sus', on] | [t, 'params', P])
// in 128-sample blocks like the AudioWorklet. Returns L + R (or [L, R, engine]).
function run(params, events, sec, { fs = FS, stereo = false, tap } = {}) {
  const e = new SpringEngine(fs);
  e.setParams(params);
  const n = Math.round(sec * fs), L = new Float64Array(n), R = new Float64Array(n), bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  const ev = events.map(([t, ...r]) => [Math.round(t * fs), ...r]).sort((a, b) => a[0] - b[0]);
  let j = 0;
  for (let s = 0; s < n; s += bl) {
    while (j < ev.length && ev[j][0] <= s) {
      const [, type, a, b, c] = ev[j++];
      if (type === 'on') e.noteOn(a, b, c); else if (type === 'off') e.noteOff(a, b); else if (type === 'sus') e.setSustain(a); else if (type === 'params') e.setParams(a);
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
// |DTFT| of x[a, b) at f, Hann-windowed (amplitude of a sinusoid).
function tone(x, f, a, b, fs = FS) {
  const w = (2 * Math.PI * f) / fs; let re = 0, im = 0;
  for (let i = a; i < b; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += h * x[i] * Math.cos(w * i); im += h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im) / ((b - a) / 4);
}
// The strongest peak in [f0, f1]: a scan, then golden-section refinement.
function peak(x, f0, f1, a, b, step, fs = FS) {
  let best = f0, bv = -1;
  for (let f = f0; f <= f1; f += step) { const v = tone(x, f, a, b, fs); if (v > bv) { bv = v; best = f; } }
  let lo = best - step, hi = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 40; it++) { const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo); if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
// Envelope of x at f: complex demodulation through a Gaussian window of width σ_t (seconds).
function envelope(x, f, sigT, fs = FS, hop = 4) {
  const n = x.length, w = (2 * Math.PI * f) / fs, s = sigT * fs, half = Math.ceil(4 * s), g = [];
  for (let j = -half; j <= half; j++) g.push(Math.exp(-0.5 * (j / s) ** 2));
  const out = [];
  for (let i = 0; i < n; i += hop) {
    let a = 0, b = 0;
    for (let j = -half; j <= half; j++) { const k = i + j; if (k < 0 || k >= n) continue; a += g[j + half] * x[k] * Math.cos(w * k); b -= g[j + half] * x[k] * Math.sin(w * k); }
    out.push(Math.hypot(a, b));
  }
  return { env: out, dt: hop / fs };
}
// Times of the envelope's local maxima above a fraction of its largest.
function arrivals({ env, dt }, frac = 0.3) {
  const mx = Math.max(...env), t = [];
  for (let i = 1; i < env.length - 1; i++) if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > frac * mx) t.push(i * dt);
  return t;
}
const peakAbs = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rmsDb = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return 10 * Math.log10(s / (b - a) + 1e-30); };
const deg = (d) => (d * Math.PI) / 180;
const TAU = 2 * Math.PI, NU = 0.29, cE = Math.sqrt(200e9 / 7850); // spring steel's ν and √(E/ρ), as the model takes them
const cents = (f, g) => 1200 * Math.log2(f / g);
const HEAR = 0.4, MF = 0.7; // what the tuning listens to: the first 0.4 s after an mf strike

// ---- references independent of the C++ ------------------------------------------------------------------
// Closed forms the model does not use: the slinky line (the spring as a uniform line, from the
// open-coiled spring formulas), the reduced zero-helix-angle curved-rod ("thin spring") model and
// Parker & Bilbao's F_C. Nondimensional: R = 1, E = ρ = 1; shape = { rr: r/R, alpha, nu }.
const shearK = (nu) => (6 * (1 + nu)) / (7 + 6 * nu); // Timoshenko's coefficient, solid circle (Cowper 1966)
function sectionOf({ rr, nu }) {
  const A = Math.PI * rr * rr, I = (Math.PI * rr ** 4) / 4;
  return { A, I, J: 2 * I, G: 1 / (2 * (1 + nu)) };
}
// At low frequency an axial force P and a torque M about the axis load each section of wire with a
// twisting moment M sin α + PR cos α, a bending moment M cos α − PR sin α, tension P sin α and shear
// P cos α; the strain energy gives the 2 × 2 compliance per unit wire length, the kinetic energy the
// mass and moment of inertia, and the two wave speeds along the wire are √ of the eigenvalues of
// (C M)⁻¹. Classical close-coiled limits (α = 0): c_axial = √(GJ/ρA)/R, c_rotation = √(EI/ρA)/R.
function slinkyLine(shape) {
  const { alpha } = shape, rc = sectionOf(shape), ks = shearK(shape.nu);
  const s = Math.sin(alpha), c = Math.cos(alpha), GJ = rc.G * rc.J, EI = rc.I, EA = rc.A, kGA = ks * rc.G * rc.A;
  const Cpp = (c * c) / GJ + (s * s) / EI + (s * s) / EA + (c * c) / kGA, Cmm = (s * s) / GJ + (c * c) / EI, Cpm = s * c * (1 / GJ - 1 / EI);
  const m = rc.A, Irot = rc.A + rc.J * s * s + rc.I * c * c;
  const det = Cpp * Cmm - Cpm * Cpm;
  const a = Cmm / det / m, b = -Cpm / det / m, cc = -Cpm / det / Irot, d = Cpp / det / Irot;
  const tr = a + d, dd = a * d - b * cc, disc = Math.sqrt(Math.max(0, tr * tr / 4 - dd));
  const v1 = Math.sqrt(tr / 2 - disc), v2 = Math.sqrt(tr / 2 + disc);
  const rotShare = (v2sq) => { const x = b, y = v2sq - a; return Math.abs(y / (Math.hypot(x, y) || 1)); }; // the wind-up share
  return rotShare(v2 * v2) >= rotShare(v1 * v1) ? { axial: v1, rotation: v2 } : { axial: v2, rotation: v1 };
}
// The zero-helix-angle curved rod, in-plane: (ω² − κ²(k² − ε²)² − γ²ε²)(ω² − γ²k²) = γ⁴ε²k², κ² = EI/ρA,
// γ² = E/ρ, ε = 1/R; the lower root is the flexural sheet that carries the chirps.
function reducedOmega(k, rr) {
  const kap = rr / 2, a = kap * kap * (k * k - 1) ** 2 + 1, d = k * k;
  const S = a + d, P = a * d - d, q = Math.sqrt(Math.max(0, S * S - 4 * P));
  return [Math.sqrt(Math.max(0, (2 * P) / (S + q))), Math.sqrt((S + q) / 2)];
}
// Its low branch peaks (dω/dk = 0) at the transition.
function reducedFc(rr) {
  let lo = 0.3, hi = 0.8;
  const f = (k) => reducedOmega(k, rr)[0];
  for (let i = 0; i < 80; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) lo = m1; else hi = m2; }
  const k = 0.5 * (lo + hi);
  return { k, w: f(k) };
}
// Parker & Bilbao (2009): F_C ≈ 3r√(E/ρ) / (16√5 π R²), the low branch at k = ε/2.
const fcParkerBilbao = (g) => (3 * g.r * Math.sqrt(g.E / g.rho)) / (16 * Math.sqrt(5) * Math.PI * g.R * g.R);

// ---- the ear: subharmonic summation (Hermes 1988), to hear the pitch of the engine's own sound -----------------
// Partials laid as power on a log-frequency axis (96 points an octave, each a triangle ±50 ¢ wide),
// weighted by W(f) = [1 + (f/2500)²]^(−½)·[1 + (300/f)²]^(−½), compressed (amplitude^0.6, from 50 dB
// below the loudest); a candidate's strength is the sum at f, 2f, … 15f, the k-th weighted 0.75^(k−1);
// the strongest candidate within halfCents of center, refined by a parabola.
const SHS = { ppo: 96, harmonics: 15, compression: 0.75, fLo: 25, fHi: 5000, floorDb: -50, width: 4 };
const pitchWeight = (f) => 1 / Math.sqrt((1 + (f / 2500) ** 2) * (1 + (300 / f) ** 2));
function virtualPitch(partials, center, halfCents = 600) {
  const o = SHS, lo = Math.log2(o.fLo), n = Math.round((Math.log2(o.fHi * o.harmonics * 2) - lo) * o.ppo);
  const Pw = new Float64Array(n), E = new Float64Array(n);
  for (const p of partials) {
    if (!(p.f > o.fLo) || !(p.a > 0)) continue;
    const x = (Math.log2(p.f) - lo) * o.ppo, i0 = Math.floor(x);
    for (let i = i0 - o.width; i <= i0 + o.width + 1; i++) {
      if (i < 0 || i >= n) continue;
      const w = 1 - Math.abs(i - x) / (o.width + 1);
      if (w > 0) Pw[i] += p.a * p.a * w;
    }
  }
  let pm = 0;
  for (let i = 0; i < n; i++) if (Pw[i] > pm) pm = Pw[i];
  if (!(pm > 0)) return { f: NaN, strength: 0 };
  const floor = pm * 10 ** (o.floorDb / 10);
  for (let i = 0; i < n; i++) if (Pw[i] > floor) E[i] = pitchWeight(2 ** (lo + i / o.ppo)) * (Pw[i] / pm) ** 0.3;
  const m = Math.round((Math.log2(o.fHi) - lo) * o.ppo), curve = new Float64Array(m + 1);
  for (let i = 0; i <= m; i++) {
    let sum = 0, w = 1;
    for (let k = 1; k <= o.harmonics; k++) {
      const x = i + Math.log2(k) * o.ppo, j = Math.floor(x), fr = x - j;
      if (j + 1 < n) sum += w * (E[j] * (1 - fr) + E[j + 1] * fr);
      w *= o.compression;
    }
    curve[i] = sum;
  }
  const c = Math.round((Math.log2(center) - lo) * o.ppo), hw = Math.round((halfCents / 1200) * o.ppo);
  const a = Math.max(0, c - hw), b = Math.min(m, c + hw);
  let bi = a;
  for (let i = a; i <= b; i++) if (curve[i] > curve[bi]) bi = i;
  let x = bi;
  if (bi > 0 && bi < m) { const A = curve[bi - 1], B = curve[bi], C = curve[bi + 1], d = A - 2 * B + C; if (d < 0) x = bi + (0.5 * (A - C)) / d; }
  return { f: 2 ** (lo + x / o.ppo), strength: curve[bi] };
}

// ---- the model's springs, as the tests read them -----------------------------------------------------------------
// A spring scaled in every dimension by 1/ρ (every mode, F_C and echo × ρ), as the tuning plays it.
const scaleSpring = (sp, rho) => ({ ...sp, R: sp.R / rho, r: sp.r / rho, L: sp.L / rho, TD: sp.TD / rho, Fc: sp.Fc * rho, kc: sp.kc * rho });
// A key's first spring as the instrument plays it: tuned, scaled by its virtual-pitch ρ; s0 its modes.
function playedSpring(key, p, fs = FS) {
  const d = keySprings(key, p, fs);
  return Object.assign(scaleSpring(tuneSpring(key, p), d.rho), { data: d, s0: d.springs[0] });
}
// A spring's modes (from keySprings) as a list: n, k = nπ/L, f, c_g and the coupling rel (against a
// pure wave's) of each.
const modesOf = (s) => Array.from(s.f, (f, i) => ({ n: s.n[i], k: (s.n[i] * Math.PI) / s.L, f, cg: s.cg[i], rel: Math.abs(s.rel[i]) }));
// The drive's sheet: for each n, the mode the beads couple to most.
function sheetModes(ms) {
  const best = new Map();
  for (const m of ms) if (!best.has(m.n) || m.rel > best.get(m.n).rel) best.set(m.n, m);
  return [...best.values()].sort((a, b) => a.n - b.n);
}
// The group delay of the low branch (below F_C) at f over one length of wire, L/c_g, from the drive
// sheet's dispersion curve (dense, interpolated in k).
const curves = new WeakMap();
function lowBranchDelay(sp, f) {
  let c = curves.get(sp);
  if (!c) { c = dispersionCurve(sp, { fTop: sp.Fc, n: 1000 })[sp.sheet].filter((p) => p.k < sp.kc); curves.set(sp, c); }
  const i = c.findIndex((p) => p.f >= f), a = c[i - 1], b = c[i], t = (f - a.f) / (b.f - a.f), cg = a.cg + t * (b.cg - a.cg);
  return { k: a.k + t * (b.k - a.k), cg, tau: sp.L / cg };
}

console.log("Wittrick's helical rod");
test('a closed ring (α = 0, kR = n waves round it): the in-plane sheet gives Hoppe\'s ω² = (EI/ρAR⁴)·n²(n²−1)²/(n²+1) and the out-of-plane sheet Michell\'s n²(n²−1)²/(n² + EI/GJ), n = 2–6, within 0.2 % for a thin wire (r/R = 0.01)', () => {
  const shape = { rr: 0.01, alpha: 0, nu: NU }, rc = sectionOf(shape), EIr = rc.I / rc.A, EIGJ = rc.I / (rc.G * rc.J);
  for (let n = 2; n <= 6; n++) {
    const { w, share } = rodSolve(shape, n), base = EIr * n * n * (n * n - 1) ** 2;
    const inPlane = Math.sqrt(base / (n * n + 1)), outPlane = Math.sqrt(base / (n * n + EIGJ));
    // which sheet is which: the in-plane one turns the section about the axis (θ_z), the out-of-plane one moves along it
    const j = Math.abs(share.rotation[0]) > Math.abs(share.rotation[1]) ? 0 : 1;
    assert.ok(Math.abs(w[j] / inPlane - 1) < 2e-3, `n = ${n}: in-plane ${w[j]} vs ${inPlane}`);
    assert.ok(Math.abs(w[1 - j] / outPlane - 1) < 2e-3, `n = ${n}: out-of-plane ${w[1 - j]} vs ${outPlane}`);
  }
});
test('rigid-body motion costs nothing: both acoustic sheets go to ω = 0 as k → 0 (rotation about and translation along the axis) and at k = cos α/R (sideways translations and tilts), for α = 0°, 3° and 15°', () => {
  for (const a of [0, 3, 15]) {
    const shape = { rr: 0.0833, alpha: deg(a), nu: NU }, ref = rodSolve(shape, 0.5).w[1];
    const at0 = rodSolve(shape, 1e-6).w, atK0 = rodSolve(shape, Math.cos(deg(a))).w;
    assert.ok(at0[0] < 1e-5 * ref && at0[1] < 1e-5 * ref, `α = ${a}°, k → 0: ${at0[0]}, ${at0[1]}`);
    assert.ok(atK0[0] < 1e-6 * ref, `α = ${a}°, k = cos α/R: ${atK0[0]}`);
  }
});
test('the low-frequency limit is the slinky line: the spring as a uniform line, with the open-coiled spring\'s compliance (twisting, bending, stretch and shear of the wire under an axial load and a torque); the low-frequency speed of the sheet the beads drive, in rotation or along the axis, within 10⁻⁵ of the line\'s for α = 1–20°; at α = 0 the line is within 0.3 % of the classical close-coiled c_axial = √(GJ/ρA)/R and c_rotation = √(EI/ρA)/R (which leave out the wire\'s shear and rotary inertia, O(r²/R²))', () => {
  for (const a of [1, 3, 10, 20]) for (const drive of ['rotation', 'axial']) {
    const sp = tuneSpring(60, P({ helix: a, drive })), sl = slinkyLine({ rr: sp.r / sp.R, alpha: sp.alpha, nu: NU }), c0 = sp.c0 / cE;
    assert.ok(Math.abs(c0 / sl[drive] - 1) < 1e-5, `α = ${a}°, ${drive}: ${c0} vs ${sl[drive]}`);
  }
  const shape = { rr: 0.0833, alpha: 0, nu: NU }, rc = sectionOf(shape), sl = slinkyLine(shape);
  assert.ok(Math.abs(sl.axial / Math.sqrt((rc.G * rc.J) / rc.A) - 1) < 3e-3 && Math.abs(sl.rotation / Math.sqrt(rc.I / rc.A) - 1) < 3e-3, `${sl.axial / Math.sqrt((rc.G * rc.J) / rc.A)}, ${sl.rotation / Math.sqrt(rc.I / rc.A)}`);
  console.log(`         c_rotation / c_axial = ${(sl.rotation / sl.axial).toFixed(4)} (√(1+ν) = ${Math.sqrt(1 + NU).toFixed(4)}); c_rotation = ${(sl.rotation * cE).toFixed(1)} m/s along the wire at r/R = 1/12`);
});

console.log('the thin spring and F_C');
// k on the low branch (below F_C) for a given ω, by bisection, for any monotone ω(k) on [0, kc]
const lowK = (wf, w, kc) => { let lo = 0, hi = kc; for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (wf(m) < w) lo = m; else hi = m; } return 0.5 * (lo + hi); };
test('the reduced (zero-helix-angle, thin) model agrees with Wittrick\'s at α = 1° where the chirps live: the low branch\'s wavenumber within 0.5 % and its group delay within 3 % up to 0.95 F_C; the upper branch within 2 % from 1.45/R to 2.2/R (3–10 F_C; nearer 1/R the helix mixes in the axial family); F_C within 0.3 %', () => {
  // the model's C4 spring at α = 1° (r/R = 0.0833) and its dispersion, nondimensional (R = 1, E = ρ = 1)
  const sp = tuneSpring(60, P({ helix: 1 })), rr = sp.r / sp.R, red = reducedFc(rr), nd = (f) => (TAU * f * sp.R) / cE;
  assert.ok(Math.abs(rr - 0.0833) < 1e-3, `r/R ${rr}`);
  assert.ok(Math.abs(nd(sp.Fc) / red.w - 1) < 3e-3, `F_C: Wittrick ${nd(sp.Fc)}, reduced ${red.w}`);
  const curve = dispersionCurve(sp, { fTop: (reducedOmega(2.4, rr)[0] * cE) / (TAU * sp.R), n: 1000 });
  const pts = (j) => curve[j].map((p) => ({ k: p.k * sp.R, w: nd(p.f), cg: p.cg / cE }));
  const low = pts(sp.sheet).filter((p) => p.k < sp.kc * sp.R);
  let worstK = 0, worstG = 0, worstU = 0;
  for (let fr = 0.05; fr <= 0.951; fr += 0.05) {
    // Wittrick's: k at ω on the curve, and c_g there (interpolated in k)
    const w = fr * red.w, i = low.findIndex((p) => p.w >= w), a = low[i - 1], b = low[i], t = (w - a.w) / (b.w - a.w);
    const kW = a.k + t * (b.k - a.k), kR = lowK((k) => reducedOmega(k, rr)[0], w, red.k);
    worstK = Math.max(worstK, Math.abs(kW / kR - 1));
    const gW = 1 / (a.cg + t * (b.cg - a.cg)), h = 1e-6, gR = (2 * h) / (reducedOmega(kR + h, rr)[0] - reducedOmega(kR - h, rr)[0]);
    worstG = Math.max(worstG, Math.abs(gW / gR - 1));
  }
  const up = pts(1).filter((p) => p.k >= 1.45 && p.k <= 2.2);
  assert.ok(up.length > 100, `${up.length} points on the upper branch`);
  for (const p of up) worstU = Math.max(worstU, Math.abs(p.w / reducedOmega(p.k, rr)[0] - 1));
  console.log(`         worst: low-branch k ${(100 * worstK).toFixed(2)} %, group delay ${(100 * worstG).toFixed(2)} %, upper branch ω ${(100 * worstU).toFixed(2)} %`);
  assert.ok(worstK < 5e-3 && worstG < 0.03 && worstU < 0.02);
});
test('F_C: the reduced model\'s low branch peaks at 0.3367 κε² (κ = r√(E/ρ)/2, ε = 1/R), 0.4 % above Parker & Bilbao\'s 3r√(E/ρ)/(16√5πR²) (their branch taken at k = ε/2); F_C ∝ r/R² in Wittrick\'s model (α = 3°): double the wire, double F_C; double the coil, a quarter', () => {
  const rr = 0.0833, red = reducedFc(rr), g = { r: rr, R: 1, E: 1, rho: 1 };
  assert.ok(Math.abs(red.w / (0.33675 * (rr / 2)) - 1) < 1e-3, `${red.w / (rr / 2)}`);
  const pb = TAU * fcParkerBilbao(g);
  assert.ok(red.w / pb > 1.003 && red.w / pb < 1.005, `${red.w / pb}`);
  assert.ok(Math.abs(red.k - 0.53) < 2e-3, `peak at kR = ${red.k}`);
  const fc = (o) => tuneSpring(60, P(o)).Fc, base = fc({});
  assert.ok(Math.abs(fc({ wire: 2 }) / base - 2) < 0.02 && Math.abs(fc({ coil: 2 }) / base - 0.25) < 0.005, `${fc({ wire: 2 }) / base}, ${fc({ coil: 2 }) / base}`);
  const sp = tuneSpring(60, P());
  console.log(`         C4 spring: F_C ${sp.Fc.toFixed(0)} Hz (Wittrick, α = 3°); Parker & Bilbao's formula ${fcParkerBilbao(sp).toFixed(0)} Hz`);
});
test('the chirps\' direction: below F_C the group delay climbs from L/c₀ to infinity at F_C (each echo a rising chirp: the main series, whose group delay peaks at F_C, as Parker (2011) describes); above F_C it falls with frequency (falling chirps, high frequencies first, as on the Slinky)', () => {
  const sp = tuneSpring(48, P()), rr = sp.r / sp.R, curve = dispersionCurve(sp, { fTop: (reducedOmega(2, rr)[0] * cE) / (TAU * sp.R), n: 800 }), j = sp.sheet, kc = sp.kc;
  const low = curve[j].filter((p) => p.k < kc && p.f > 0.02 * sp.Fc), up = curve[j].filter((p) => p.k > 1.25 / sp.R);
  for (let i = 1; i < low.length; i++) assert.ok(low[i].f > low[i - 1].f && 1 / low[i].cg > 1 / low[i - 1].cg, `low branch at ${low[i].f.toFixed(0)} Hz`);
  assert.ok(Math.abs((sp.L / low[0].cg) / (sp.TD / 2) - 1) < 0.01, 'starts at T_D/2 one way');
  assert.ok(sp.L / low[low.length - 1].cg > 10 * sp.TD, 'diverges at F_C');
  for (let i = 1; i < up.length; i++) assert.ok(up[i].f > up[i - 1].f && up[i].cg > up[i - 1].cg, `upper branch at ${up[i].f.toFixed(0)} Hz`);
});

console.log('tuning');
const SETTINGS = [{ springs: 1 }, { springs: 3, spread: 3 }, { coil: 1.6, wire: 1.3 }, { helix: 12, endLoss: 0.3, bead: 5 }, { mallet: 2 }];
const REG = [[36, 'C2'], [48, 'C3'], [60, 'C4'], [72, 'C5'], [84, 'C6']];
test('tuned by ear: the virtual pitch the tuning reads (subharmonic summation, Hermes 1988, on what the pickup hears in the first 0.4 s after an mf strike; for springs in parallel the whole set\'s peak within 40 ¢ of the mean of each one\'s) is on the note within 1 ¢ on all 49 keys at the defaults, and within 10 ¢ on every key with one spring, three springs 3 % apart, wide coils of thick wire, a steep helix on lossy heavy mounts, and a soft mallet; before the correction it was flat, most in the bass', () => {
  const rows = [];
  for (const [i, o] of [{}, ...SETTINGS].entries()) {
    let worst = 0;
    for (let key = KEY_LO; key <= KEY_HI; key++) {
      const p = P(o), d = keySprings(key, p, FS), f0 = keyFreq(key), c = cents(d.pitch, f0);
      worst = Math.max(worst, Math.abs(c));
      assert.ok(Math.abs(c) < (i ? 10 : 1), `key ${key} ${JSON.stringify(o)}: ${c.toFixed(2)} ¢`);
      if (!i && REG.some(([k]) => k === key)) rows.push(`${REG.find(([k]) => k === key)[1]} ${cents(d.pitchBefore, f0).toFixed(1)} → ${c.toFixed(1)} ¢ (lowest mode ${cents(d.rho, 1) >= 0 ? '+' : ''}${cents(d.rho, 1).toFixed(1)} ¢)`);
    }
    if (!i) console.log(`         defaults: ${rows.join(', ')}`);
    else console.log(`         ${JSON.stringify(o)}: worst ${worst.toFixed(2)} ¢`);
  }
});
test('the lowest mode and the echo time follow the model: before the correction mode 1 is on the note (within 0.05 ¢) and 1/T_D within 3 ¢ of it; after, every spring is that spring scaled by 1/ρ, so mode 1 sits at ρ·f₀/(1 + spread·o) (within 0.3 ¢) and 1/T_D still within 3 ¢ of it; the shape (turns, r/R, F_C over mode 1) is the same on every key, for one spring, a steep helix and axial drive', () => {
  for (const o of [{}, { helix: 15 }, { drive: 'axial' }, { coil: 0.6, wire: 1.7 }, { springs: 3, spread: 3 }]) {
    const ref = tuneSpring(60, P(o));
    for (let key = KEY_LO; key <= KEY_HI; key += o.springs ? 6 : 1) {
      // mode 1 before the correction: a lone spring's (cut to the tuned length), unscaled by its ρ
      const raw = tuneSpring(key, P(o)), d = keySprings(key, P(o), FS), f0 = keyFreq(key), offs = [[0], [0.5, -0.5], [0, 1, -1]][d.springs.length - 1];
      const one = keySprings(key, P({ ...o, springs: 1 }), FS), m1 = { f: sheetModes(modesOf(one.springs[0]))[0].f / one.rho };
      assert.ok(Math.abs(cents(m1.f, f0)) < 0.05, `key ${key} ${JSON.stringify(o)}: mode 1 before ${cents(m1.f, f0).toFixed(3)} ¢`);
      assert.ok(Math.abs(cents(1 / raw.TD, m1.f)) < 3, `key ${key}: 1/T_D ${cents(1 / raw.TD, m1.f).toFixed(2)} ¢ from mode 1`);
      assert.ok(Math.abs(raw.turns / ref.turns - 1) < 1e-9 && Math.abs(raw.Fc / m1.f / (ref.Fc / keyFreq(60)) - 1) < 1e-6, `key ${key}: not a scaled copy`);
      d.springs.forEach((sp, i) => {
        let j = -1;
        for (let q = 0; q < sp.n.length; q++) if (sp.n[q] === 1 && (j < 0 || Math.abs(sp.rel[q]) > Math.abs(sp.rel[j]))) j = q;
        const f1 = (d.rho * f0) / (1 + (offs[i] * (P(o).spread ?? 0)) / 100);
        // (a longer or shorter spring's mode 1 is off the pure length ratio by its own dispersion, a tenth of a cent)
        assert.ok(Math.abs(cents(sp.f[j], f1)) < (offs[i] ? 0.3 : 0.05), `key ${key} spring ${i}: mode 1 ${sp.f[j]} vs ${f1}`);
        assert.ok(Math.abs(cents(1 / sp.TD, sp.f[j])) < 3, `key ${key} spring ${i}: 1/T_D ${cents(1 / sp.TD, sp.f[j]).toFixed(2)} ¢ from mode 1`);
      });
    }
  }
  const rows = REG.map(([k, n]) => { const sp = playedSpring(k, P(), FS); return `${n}: F_C ${sp.Fc.toFixed(0)} Hz, T_D ${(1000 * sp.TD).toFixed(sp.TD < 0.002 ? 3 : 2)} ms, ${(100 * sp.L).toFixed(1)} cm`; });
  console.log(`         as played: ${rows.join('; ')}`);
});
// Subharmonic summation on the engine's own sound: the spectrum of its first 0.4 s (rectangular, its
// last tenth tapered), every FFT bin a partial.
function heardPitch(x, f0, fs = FS) {
  const n = Math.round(HEAR * fs), N = 1 << Math.ceil(Math.log2(n)), re = new Float64Array(N), im = new Float64Array(N), tap = Math.round(0.1 * n);
  for (let i = 0; i < n; i++) re[i] = x[i] * (i < n - tap ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - (n - tap))) / tap));
  fft(re, im, false);
  const parts = [];
  for (let k = 1; k < N / 2; k++) { const f = (k * fs) / N; if (f > 20000) break; parts.push({ f, a: Math.hypot(re[k], im[k]) }); }
  return virtualPitch(parts, f0).f;
}
test('the engine sounds every key on its note by ear: subharmonic summation on its own output (the first 0.4 s after an mf strike, every FFT bin a partial, the strongest pitch within half an octave of the note) lands within 10 ¢ of the note on all 49 keys at 48 kHz, and on a sample at 44.1 kHz, with one spring, three springs, wide coils of thick wire, a steep helix on lossy heavy mounts and a soft mallet; its lowest modes where the model puts them (within 0.5 ¢), each a little flat of a harmonic', () => {
  let worst = 0;
  const cases = [];
  for (let key = KEY_LO; key <= KEY_HI; key++) cases.push([key, {}, 48000]);
  for (let key = KEY_LO; key <= KEY_HI; key += 6) {
    cases.push([key, {}, 44100]);
    for (const o of [{ springs: 1 }, { springs: 3 }, { coil: 1.6, wire: 1.3 }, { helix: 12, endLoss: 0.3, bead: 5 }, { mallet: 2 }]) cases.push([key, o, 48000]);
  }
  for (const [key, o, fs] of cases) {
    const x = run(P(o), [[0, 'on', key, MF]], HEAR + 0.01, { fs }), c = cents(heardPitch(x, keyFreq(key), fs), keyFreq(key));
    worst = Math.max(worst, Math.abs(c));
    assert.ok(Math.abs(c) < 10, `key ${key} ${JSON.stringify(o)} at ${fs}: ${c.toFixed(1)} ¢`);
  }
  const key = 48, sp = playedSpring(key, P({ springs: 1 }), FS), modes = sheetModes(modesOf(sp.s0)).filter((m) => m.rel > 0.5 && m.n <= 4);
  assert.equal(modes.length, 4);
  const x = run(P({ springs: 1 }), [[0, 'on', key, 0.8]], 0.6), ratios = [];
  for (const m of modes) {
    const fm = peak(x, m.f * 0.995, m.f * 1.005, 960, x.length, m.f * 3e-4);
    assert.ok(Math.abs(cents(fm, m.f)) < 0.5, `mode ${m.n}: ${fm} vs ${m.f}`);
    ratios.push((m.f / modes[0].f).toFixed(4));
    if (m.n > 1) assert.ok(m.f < m.n * modes[0].f, `mode ${m.n} flat of the harmonic`);
  }
  console.log(`         worst ${worst.toFixed(1)} ¢ (by ear, from the engine); C3's modes 1–4 at ${ratios.join(', ')} × mode 1`);
});

console.log('echoes from the engine');
// The C3 spring alone, nearly lossless, struck with a very short mallet.
const ECHO = P({ springs: 1, ...DRY, mallet: 0.03 });
const echoIR = run(ECHO, [[0, 'on', 48, 1]], 0.12), echoSp = playedSpring(48, ECHO, FS), echoHalf = pulseLength(ECHO, 1) / 2;
test('group delay from the impulse response: at 0.1–0.6 F_C the first arrival at the far bead comes at the model\'s L/c_g(f) (within 3 %), later for higher frequencies (a rising chirp); band-passed by complex demodulation', () => {
  const rows = [];
  let prev = 0;
  for (const fr of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
    const f = fr * echoSp.Fc, model = lowBranchDelay(echoSp, f).tau + echoHalf, t1 = arrivals(envelope(echoIR, f, 0.0006))[0];
    assert.ok(Math.abs(t1 / model - 1) < 0.03, `${f.toFixed(0)} Hz: measured ${(1000 * t1).toFixed(3)} ms, model ${(1000 * model).toFixed(3)} ms`);
    assert.ok(t1 > prev, `${f.toFixed(0)} Hz arrives after the lower frequencies`);
    prev = t1; rows.push(`${f.toFixed(0)} Hz ${(1000 * t1).toFixed(2)}/${(1000 * model).toFixed(2)}`);
  }
  console.log(`         first arrival, measured/model (ms): ${rows.join(', ')}`);
});
test('echo spacing equals the round-trip group delay 2L/c_g(f): the second and third arrivals follow the first by 2L/c_g and 4L/c_g (within 4 %), from T_D at low frequency to 1.12 T_D at 0.45 F_C', () => {
  const rows = [];
  for (const fr of [0.1, 0.25, 0.35, 0.45]) {
    const f = fr * echoSp.Fc, rt = 2 * lowBranchDelay(echoSp, f).tau, t = arrivals(envelope(echoIR, f, 0.0006));
    if (process.env.DEBUG) console.log(f, t.slice(0, 3), rt);
    assert.ok(t.length >= 3, `${f.toFixed(0)} Hz: ${t.length} arrivals`);
    assert.ok(Math.abs((t[1] - t[0]) / rt - 1) < 0.04 && Math.abs((t[2] - t[0]) / (2 * rt) - 1) < 0.04, `${f.toFixed(0)} Hz: spacing ${(1000 * (t[1] - t[0])).toFixed(3)} ms vs ${(1000 * rt).toFixed(3)} ms`);
    rows.push(`${(rt / echoSp.TD).toFixed(3)} T_D`);
  }
  console.log(`         round trips: ${rows.join(', ')}`);
});
test('the Slinky\'s whistles fall: on its upper branch the high frequencies arrive first, at the model\'s L/c_g (within 5 %) from 2.5 kHz down to 300 Hz', () => {
  const S = P({ family: 'slinky', springs: 1, ...DRY, mallet: 0.1, helix: 6 }), sp = playedSpring(60, S, FS), x = run(S, [[0, 'on', 60, 1]], 0.12);
  const curve = dispersionCurve(sp, { fTop: 3000, n: 1000 })[1 - sp.sheet].concat(dispersionCurve(sp, { fTop: 3000, n: 1000 })[sp.sheet]).filter((p) => p.k > 1.4 / sp.R);
  let prev = Infinity;
  const rows = [];
  for (const f of [2500, 1500, 800, 500, 300]) {
    const p = curve.reduce((a, b) => (Math.abs(b.f - f) < Math.abs(a.f - f) ? b : a)), model = sp.L / p.cg + pulseLength(S, 1) / 2;
    const t1 = arrivals(envelope(x, f, 0.003), 0.25)[0];
    assert.ok(Math.abs(t1 / model - 1) < 0.05, `${f} Hz: ${(1000 * t1).toFixed(2)} vs ${(1000 * model).toFixed(2)} ms`);
    assert.ok(t1 > (prev === Infinity ? 0 : prev), `${f} Hz arrives after the higher frequencies`);
    prev = t1; rows.push(`${f} Hz ${(1000 * t1).toFixed(1)} ms`);
  }
  console.log(`         first whistle: ${rows.join(', ')} (F_C ${sp.Fc.toFixed(0)} Hz)`);
});

console.log('the instrument');
test('springs in parallel: three springs cut a spread apart ring at ρf₀/(1 + spread·o), o = 0, ±1 (within 1 ¢); their echoes part: by the seventh arrival the three springs\' echoes no longer add up, and the strongest is under 60 % as strong against the first arrival as one spring\'s (a third, were they fully apart)', () => {
  const key = 55;
  for (const spread of [1.5, 4]) {
    const p = P({ springs: 3, spread, ...DRY }), x = run(p, [[0, 'on', key, 0.8]], 0.8), f0 = keyFreq(key) * keySprings(key, p, FS).rho;
    for (const o of [0, 1, -1]) {
      const f = f0 / (1 + (o * spread) / 100), fm = peak(x, f * 0.996, f * 1.004, 960, x.length, f * 2e-4);
      assert.ok(Math.abs(cents(fm, f)) < 1, `spread ${spread} %, spring ${o}: ${cents(fm, f).toFixed(2)} ¢`);
    }
  }
  // the envelope at 0.2 F_C: the first arrival and the 7th (6 round trips later), one spring against three 4 % apart
  const sp = playedSpring(key, P({ springs: 1, ...DRY, mallet: 0.05 }), FS), f = 0.2 * sp.Fc, rt = 2 * lowBranchDelay(sp, f).tau;
  const echoRatio = (n) => {
    const x = run(P({ springs: n, spread: 4, ...DRY, mallet: 0.05 }), [[0, 'on', key, 0.8]], 7 * rt + 0.01), { env, dt } = envelope(x, f, 0.0004);
    const top = (c) => { let m = 0; for (let i = Math.round((c - 0.3 * rt) / dt); i < Math.round((c + 0.3 * rt) / dt) && i < env.length; i++) m = Math.max(m, env[i]); return m; };
    return top(6.5 * rt) / top(0.5 * rt);
  };
  const one = echoRatio(1), three = echoRatio(3);
  console.log(`         7th arrival against the first, at ${f.toFixed(0)} Hz: one spring ${one.toFixed(3)}, three springs ${three.toFixed(3)} (${(three / one).toFixed(2)} ×)`);
  assert.ok(three / one < 0.6, `${one}, ${three}`);
});
test('damping: each mode decays at the model\'s σ = σ_oil + πfη + (loss per reflection)·|c_g|/L (within 4 %); per reflection the low modes lose more than those near F_C, where the waves crawl: the band below F_C rings longest', () => {
  const key = 48, o = { springs: 1, endLoss: 0.2, eta: 3e-4, oil: 2 }, sp = playedSpring(key, P(o), FS), x = run(P(o), [[0, 'on', key, 0.9]], 1.2);
  // three modes of the low branch with no other mode within 25 Hz (a neighbour would beat with them)
  const all = modesOf(sp.s0).filter((m) => m.rel > 0.004), lonely = (m) => all.every((q) => q === m || Math.abs(q.f - m.f) > 25);
  const modes = sheetModes(all).filter((m) => m.k < sp.kc && m.rel > 0.2 && lonely(m));
  const pick = [modes[0], modes[Math.floor(modes.length * 0.5)], modes[modes.length - 1]], W = 9600;
  const rows = [];
  for (const m of pick) {
    const model = modeSigma(m.f, m.cg, sp.L, P(o)), t1 = 0.2, t2 = 0.8;
    const a1 = tone(x, m.f, Math.round(t1 * FS), Math.round(t1 * FS) + W), a2 = tone(x, m.f, Math.round(t2 * FS), Math.round(t2 * FS) + W), sig = Math.log(a1 / a2) / (t2 - t1);
    assert.ok(Math.abs(sig / model - 1) < 0.04, `mode ${m.n} (${m.f.toFixed(0)} Hz): σ ${sig.toFixed(3)} vs ${model.toFixed(3)}`);
    rows.push(`mode ${m.n} ${m.f.toFixed(0)} Hz T₆₀ ${(6.91 / model).toFixed(2)} s`);
  }
  // per reflection: endLoss alone, low mode vs near F_C
  const D = { endLoss: 0.2, eta: 0, oil: 0 }, low = sheetModes(all).filter((m) => m.k < sp.kc), top = low[low.length - 1];
  assert.ok(modeSigma(top.f, top.cg, sp.L, D) < 0.2 * modeSigma(low[0].f, low[0].cg, sp.L, D), `${top.f.toFixed(0)} Hz against ${low[0].f.toFixed(0)} Hz`);
  console.log(`         ${rows.join('; ')}`);
});
test('the damper falls when the key comes up (T₆₀ as set, within 10 %, sooner for a faster release); the pedal holds it off; the hand on the spring damps every mode', () => {
  const key = 55, o = { springs: 1, ...DRY, damper: 0.4 }, f = keyFreq(key) * keySprings(key, P(o), FS).rho;
  const held = run(P(o), [[0, 'on', key, 0.8]], 1.2), rel = run(P(o), [[0, 'on', key, 0.8], [0.3, 'off', key]], 1.2), ped = run(P(o), [[0, 'sus', true], [0, 'on', key, 0.8], [0.3, 'off', key]], 1.2);
  const W = 4800, at = (x, t) => tone(x, f, Math.round(t * FS), Math.round(t * FS) + W);
  const sig = Math.log(at(rel, 0.4) / at(rel, 0.6)) / 0.2 - Math.log(at(held, 0.4) / at(held, 0.6)) / 0.2;
  assert.ok(Math.abs(sig / (6.91 / 0.4) - 1) < 0.1, `damper σ ${sig.toFixed(2)} vs ${(6.91 / 0.4).toFixed(2)}`);
  for (let i = 0; i < held.length; i++) assert.ok(Math.abs(ped[i] - held[i]) < 1e-12, 'the pedal holds the damper off');
  const slow = run(P(o), [[0, 'on', key, 0.8], [0.3, 'off', key, 0.05]], 0.45), fast = run(P(o), [[0, 'on', key, 0.8], [0.3, 'off', key, 1]], 0.45);
  assert.ok(at(fast, 0.33) < at(slow, 0.33), 'a fast release bites sooner');
  const hand = run(P({ ...o, hand: 0.5 }), [[0, 'on', key, 0.8]], 1.2), sh = Math.log(at(hand, 0.2) / at(hand, 0.5)) / 0.3 - Math.log(at(held, 0.2) / at(held, 0.5)) / 0.3;
  assert.ok(Math.abs(sh / 15 - 1) < 0.1, `hand σ ${sh.toFixed(2)} vs 15`);
});
test('the beads: a heavier bead passes less of the high modes, ∝ 1/(1 + (f/f_b)²) with f_b = f₀/πμ (within 3 %); a steeper helix couples the axial family to the rotating beads (more than 5 % of the low modes\' coupling at 15°, under 1 % at 1°); axially driven springs are cut √(1+ν)-ish shorter for the same note', () => {
  // (the bead also moves the tuning a little: each run's mode 9 is found on its own spring)
  const key = 48, mode9 = (bead) => { const sp = playedSpring(key, P({ springs: 1, ...DRY, bead }), FS); return { sp, m: sheetModes(modesOf(sp.s0)).filter((q) => q.rel > 0.3 && q.k < sp.kc)[8] }; };
  const amp = (bead) => { const { m } = mode9(bead), x = run(P({ springs: 1, ...DRY, bead }), [[0, 'on', key, 0.8]], 0.3); return tone(x, m.f, 2400, x.length); };
  const H = (bead) => { const { sp, m } = mode9(bead); return 1 / (1 + (m.f / (sp.f0 / (Math.PI * bead / 100))) ** 2); };
  const light = amp(0.3), heavy = amp(10);
  assert.ok(Math.abs(heavy / light / (H(10) / H(0.3)) - 1) < 0.03, `${heavy / light} vs ${H(10) / H(0.3)}`);
  // (the modes the model keeps for the engine: coupled more than 3·10⁻³ of a pure wave's)
  const axialShare = (helix) => {
    const s = playedSpring(60, P({ helix, springs: 1 })), ms = modesOf(s.s0), sheet = new Set(sheetModes(ms));
    let a = 0, t = 0;
    for (const q of ms) { t += q.rel; if (!sheet.has(q) && q.k < 0.9 / s.R) a += q.rel; }
    return a / t;
  };
  assert.ok(axialShare(15) > 0.05 && axialShare(1) < 0.01, `${axialShare(1)}, ${axialShare(15)}`);
  const rot = tuneSpring(60, P()), ax = tuneSpring(60, P({ drive: 'axial' }));
  assert.ok(Math.abs(rot.L / ax.L - Math.sqrt(1 + NU)) < 0.01, `${rot.L / ax.L}`);
});
test('the mallet: a shorter contact reaches higher, bringing up the chirps near F_C against the low echoes; a strike adds to a ringing spring as it moves (the springs are linear: two strikes sound as the sum of each alone, to −70 dB, what skipping the modes below −90 dB leaves); re-striking a sounding key reuses its voice', () => {
  const key = 55, band = (x, sp, lo, hi) => { let s = 0; for (const m of modesOf(sp.s0)) if (m.rel > 0.2 && m.f > lo && m.f < hi) s += tone(x, m.f, 240, 9840) ** 2; return s; };
  const ratio = (mallet) => { const sp = playedSpring(key, P({ springs: 1, mallet }), FS), x = run(P({ springs: 1, mallet }), [[0, 'on', key, 0.8]], 0.25); return band(x, sp, 0.6 * sp.Fc, sp.Fc) / band(x, sp, 0, 0.25 * sp.Fc); };
  assert.ok(ratio(0.1) > 4 * ratio(1.5), `${ratio(0.1)}, ${ratio(1.5)}`);
  const o = P({ springs: 2 }), both = run(o, [[0, 'on', key, 0.6], [0.2, 'on', key, 0.9]], 0.5), a = run(o, [[0, 'on', key, 0.6]], 0.5);
  const b = run(o, [[0.2, 'on', key, 0.9]], 0.5);
  let err = 0, pk = 0;
  for (let i = 0; i < both.length; i++) { err = Math.max(err, Math.abs(both[i] - a[i] - b[i])); pk = Math.max(pk, Math.abs(both[i])); }
  assert.ok(err < 3e-4 * pk, `superposition error ${err.toExponential(2)} against a peak of ${pk.toFixed(3)}`);
  assert.equal(both.engine.voiceCount(), 1);
});
test('voice stealing fades the quietest older voice, never one just struck; no clicks; a voice is dropped once every mode has died', () => {
  const ev = [];
  for (let i = 0; i < 26; i++) ev.push([0.03 * i, 'on', KEY_LO + 2 * (i % 25), 0.6]);
  const x = run(P(), ev, 1.2), e = x.engine;
  assert.ok(e.voices.filter((v) => !v.fading).length <= 16, `${e.voices.length} voices`);
  assert.ok(e.byKey.has(KEY_LO) && !e.byKey.get(KEY_LO).fading, 'the newest voice sounds');
  let worst = 0;
  for (let i = 2; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]));
  assert.ok(worst < 0.5 * peakAbs(x), `second difference ${worst.toExponential(2)} vs peak ${peakAbs(x).toFixed(3)}`);
  const short = run(P({ damper: 0.05 }), [[0, 'on', 84, 0.5], [0.05, 'off', 84]], 1.5);
  assert.equal(short.engine.voiceCount(), 0, 'a damped treble note is gone within 1.5 s');
});
test('the page builds the springs and sends them with the note: the engine plays the page\'s data exactly as its own', () => {
  const p = P({ springs: 3 }), data = keySprings(43, p, FS).packed;
  const own = run(p, [[0, 'on', 43, 0.7]], 0.2), sent = run(p, [[0, 'on', 43, 0.7, data]], 0.2);
  for (let i = 0; i < own.length; i++) assert.equal(own[i], sent[i]);
  const stale = keySprings(43, P({ springs: 1 }), FS).packed, other = run(p, [[0, 'on', 43, 0.7, stale]], 0.2);
  for (let i = 0; i < own.length; i++) assert.equal(own[i], other[i], 'data for another geometry is ignored');
});

console.log('levels and stability');
test('level: a forte note peaks at 0.1–0.5 across the compass at 44.1 and 48 kHz; forte chords of 4 and 6 notes stay under 1; every preset within 10 dB of the default', () => {
  const stereoPeak = (p, ev, sec, o) => { const [L, R] = run(p, ev, sec, { ...o, stereo: true }); return Math.max(peakAbs(L), peakAbs(R)); };
  const pk = [];
  for (const fs of [44100, 48000]) for (let k = KEY_LO; k <= KEY_HI; k += 4) {
    const v = stereoPeak(P(), [[0, 'on', k, 1]], 0.25, { fs });
    pk.push(v);
    assert.ok(v > 0.1 && v < 0.5, `key ${k} at ${fs}: ${v.toFixed(3)}`);
  }
  const c4 = stereoPeak(P(), [36, 43, 48, 52].map((k) => [0, 'on', k, 1]), 0.6), c6 = stereoPeak(P(), [60, 64, 67, 72, 76, 79].map((k) => [0, 'on', k, 1]), 0.6);
  console.log(`         forte peaks ${Math.min(...pk).toFixed(2)}–${Math.max(...pk).toFixed(2)}; chords ${c4.toFixed(2)}, ${c6.toFixed(2)}`);
  assert.ok(c4 < 1 && c6 < 1, `chords ${c4.toFixed(3)}, ${c6.toFixed(3)}`);
  const phrase = (p) => { const x = run(p, [48, 55, 60, 64, 67].map((k, i) => [0.12 * i, 'on', k, 0.7]), 1); return rmsDb(x, 0, x.length); };
  const ref = phrase(P());
  for (const pr of PRESETS) { const d = phrase(P(pr.p)) - ref; assert.ok(Math.abs(d) < 10, `${pr.name}: ${d.toFixed(1)} dB`); }
});
test('stability: seeded random combinations of parameter extremes at 44.1 and 48 kHz, knobs moved mid-note: no NaN, bounded', () => {
  const sliders = GROUPS.flatMap((g) => g.params).filter((p) => !p.type);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 10; trial++) {
    const fs = trial % 2 ? 44100 : 48000, p = P();
    for (const q of sliders) if (!['volume', 'room', 'venue'].includes(q.id)) { const r = rnd(); p[q.id] = r < 0.4 ? q.min : r < 0.8 ? q.max : q.def; }
    p.family = trial % 4 === 3 ? 'slinky' : 'tuned'; p.drive = trial % 3 ? 'rotation' : 'axial';
    const q = { ...p, endLoss: p.endLoss > 0.1 ? 0.005 : 1, eta: p.eta > 1e-3 ? 1e-5 : 3e-3, oil: 30 - p.oil, hand: 1 - p.hand, bead: p.bead > 1 ? 0.3 : 30 };
    const x = run(p, [[0, 'on', KEY_LO, 1], [0, 'on', 61, 1], [0, 'on', KEY_HI, 1], [0.1, 'params', q], [0.12, 'on', 61, 1], [0.15, 'off', KEY_LO, 1], [0.16, 'on', KEY_LO, 0.05]], 0.3, { fs });
    for (const v of x) assert.ok(Number.isFinite(v), `trial ${trial}: NaN`);
    assert.ok(peakAbs(x) < 10, `trial ${trial}: peak ${peakAbs(x).toFixed(2)}`);
  }
});
test('knobs glide: mount loss, steel friction, oil, the hand and the bead moved mid-note do not click', () => {
  for (const [id, to] of [['endLoss', 1], ['eta', 3e-3], ['oil', 30], ['hand', 1], ['bead', 30]]) {
    const p = P(), x = run(p, [[0, 'on', 57, 0.7], [0.3, 'params', { ...p, [id]: to }]], 0.45);
    let before = 0, after = 0;
    for (let i = Math.round(0.15 * FS); i < x.length; i++) { const d = Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]); if (i < 0.3 * FS) before = Math.max(before, d); else after = Math.max(after, d); }
    assert.ok(after < 1.5 * before + 1e-6, `${id}: second difference ${after.toExponential(2)} after, ${before.toExponential(2)} before`);
  }
});
test('CPU: 10 keys across the compass, two springs each, struck in turn and ringing, at 48 kHz in under 30 % of one core (the modes sent with the notes, as the page does)', () => {
  const keys = [36, 41, 46, 51, 56, 61, 66, 71, 76, 81], p = P(), data = keys.map((k) => keySprings(k, p, FS).packed);
  const e = new SpringEngine(FS); e.setParams(p);
  const bL = new Float32Array(128), bR = new Float32Array(128);
  for (let i = 0; i < 200; i++) { if (i === 0) e.noteOn(60, 0.7); e.process(bL, bR, 128); } // warm up
  e.allNotesOff(); for (let i = 0; i < 20; i++) e.process(bL, bR, 128);
  const sec = 2, n = Math.round((sec * FS) / 128), t0 = performance.now();
  let k = 0;
  for (let i = 0; i < n; i++) { if (k < keys.length && i % 8 === 0) { e.noteOn(keys[k], 0.8, data[k]); k++; } e.process(bL, bR, 128); }
  const load = (performance.now() - t0) / 1000 / sec;
  console.log(`         ${(100 * load).toFixed(1)} % of real time; ${e.voiceCount()} voices still sounding after 2 s`);
  assert.ok(load < 0.3, `${(100 * load).toFixed(1)} %`);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
