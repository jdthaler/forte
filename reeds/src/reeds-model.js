// reeds-model.js — the physics of a Wurlitzer-style reed piano, kept free of
// audio and DOM so that the page, the engine, the tests and the render tool
// can all use it.
//
//   clamp ▐█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀●═▓  ← reed tip in a slot of the comb
//         ▐█        ▲ felt hammer       solder   pickup (+V through R)
//
// Each key is a flat steel reed, clamped at one end, struck from below by a
// felt hammer and tuned by a solder blob at its tip. The reed is reduced to
// its bending modes by finite elements (rectangular section, tip mass with
// rotary inertia). Its tip swings through a slot in a comb-shaped plate held
// at a high DC voltage: the reed–comb capacitance C(y) is a nonlinear,
// saturating function of tip height y (solved from Laplace's equation, see
// slot-field.js), and with the comb's charge held by a large feed resistor
// the plate voltage follows C(y). That nonlinearity is the bark.

import { genEig } from '../../shared/linalg.js';
import { keyFreq } from '../../shared/dsp.js';
import { EPS0, SLOT_GEOM } from './slot-field.js';
import { SLOT_Y, SLOT_GAPS, SLOT_C } from './slot-table.js';

export { keyFreq, EPS0, SLOT_GEOM };
export const KEY_LO = 33, KEY_HI = 96; // 64 keys, A1–C7
export const STEEL = { E: 2.0e11, rho: 7850, eta: 2e-4 }; // spring steel; eta = internal loss factor
export const SOLDER_RHO = 8400;                         // 60/40 tin–lead, kg/m³
export const REED = { h: SLOT_GEOM.h, b: SLOT_GEOM.b }; // tongue thickness and width (all keys)
// Pickup: the reed reaches ell into its slot; C0 = everything on the comb's
// node (64 slots, the comb's stray capacitance to the frame, the cable).
export const PICKUP = { ell: 3e-3, C0: 200e-12 };
export const PREAMP = { gain: 12 };                     // first-stage voltage gain
const PI = Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const tKey = (m) => clamp((m - KEY_LO) / (KEY_HI - KEY_LO), 0, 1);
const geo = (a, b, t) => a * (b / a) ** t;

// ---------------------------------------------------------------------------
// The reed: Euler–Bernoulli cantilever, rectangular section h × b, with a
// point mass M and rotary inertia J at the tip, by Hermite finite elements.

function hermite(xi, l) {
  return [1 - 3 * xi * xi + 2 * xi ** 3, l * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, l * (-xi * xi + xi ** 3)];
}

export function reedFEM({ L, h = REED.h, b = REED.b, M = 0, J = 0, nel = 20, nModes = 6 }) {
  const { E, rho } = STEEL;
  const A = b * h, I = (b * h ** 3) / 12, EI = E * I, mu = rho * A;
  const l = L / nel, NF = 2 * (nel + 1);
  const Kf = new Float64Array(NF * NF), Mf = new Float64Array(NF * NF);
  const ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
  const me = [[156, 22 * l, 54, -13 * l], [22 * l, 4 * l * l, 13 * l, -3 * l * l], [54, 13 * l, 156, -22 * l], [-13 * l, -3 * l * l, -22 * l, 4 * l * l]];
  const kc = EI / l ** 3, mc = (mu * l) / 420;
  for (let e = 0; e < nel; e++) {
    for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) {
      Kf[(2 * e + a) * NF + 2 * e + c] += kc * ke[a][c];
      Mf[(2 * e + a) * NF + 2 * e + c] += mc * me[a][c];
    }
  }
  Mf[(NF - 2) * NF + NF - 2] += M; // tip translation
  Mf[(NF - 1) * NF + NF - 1] += J; // tip rotation
  // Inertial loads of a rigid translation r and a rigid rotation about the
  // clamp s (w = x, θ = 1): mode n pushes on the clamp with shear ω² Γₙ and
  // bending moment ω² Θₙ, where Γₙ = rᵀ M φₙ and Θₙ = sᵀ M φₙ.
  const g = new Float64Array(NF), gs = new Float64Array(NF);
  for (let i = 0; i < NF; i++) for (let j = 0; j < NF; j += 2) { g[i] += Mf[i * NF + j]; gs[i] += Mf[i * NF + j] * (j / 2) * l + Mf[i * NF + j + 1]; }
  const N = NF - 2, K = new Float64Array(N * N), Mm = new Float64Array(N * N); // clamp node 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { K[i * N + j] = Kf[(i + 2) * NF + j + 2]; Mm[i * N + j] = Mf[(i + 2) * NF + j + 2]; }
  const nv = Math.min(nModes, N);
  const { lambda, X } = genEig(K, Mm, N, nv);
  const omega = [], Gamma = [], Theta = [];
  for (let n = 0; n < nv; n++) {
    omega.push(Math.sqrt(lambda[n]));
    if (X[(N - 2) * nv + n] < 0) for (let i = 0; i < N; i++) X[i * nv + n] *= -1; // tip moves +
    let G = 0, Th = 0;
    for (let i = 0; i < N; i++) { G += X[i * nv + n] * g[i + 2]; Th += X[i * nv + n] * gs[i + 2]; }
    Gamma.push(G); Theta.push(Th);
  }
  // mode shape (unit modal mass) at x ∈ [0, L]
  const shape = (n, x) => {
    const xx = clamp(x, 0, L), e = Math.min(nel - 1, Math.floor(xx / l)), Nv = hermite(xx / l - e, l);
    const v = (d) => (d < 2 ? 0 : X[(d - 2) * nv + n]);
    return Nv[0] * v(2 * e) + Nv[1] * v(2 * e + 1) + Nv[2] * v(2 * e + 2) + Nv[3] * v(2 * e + 3);
  };
  return { L, h, b, EI, mu, m: mu * L, M, J, omega, Gamma, Theta, shape, nModes: nv };
}

// Exact frequency equation of a uniform cantilever with a tip point mass,
// mass ratio μ = M/(ρAL):  1 + cos λ cosh λ + μλ (cos λ sinh λ − sin λ cosh λ) = 0,
// ω = λ² √(EI/ρA) / L². Returns the first n roots λ (by bisection on a scan).
export function tipMassRoots(muRatio, n = 4) {
  const f = (x) => 1 + Math.cos(x) * Math.cosh(x) + muRatio * x * (Math.cos(x) * Math.sinh(x) - Math.sin(x) * Math.cosh(x));
  // divide by cosh to keep the scan well scaled
  const F = (x) => f(x) / Math.cosh(x);
  const roots = [];
  for (let x = 0.05; roots.length < n && x < 60; x += 0.01) {
    if (F(x) * F(x + 0.01) <= 0) {
      let a = x, c = x + 0.01;
      for (let i = 0; i < 60; i++) { const m = 0.5 * (a + c); if (F(a) * F(m) <= 0) c = m; else a = m; }
      roots.push(0.5 * (a + c));
    }
  }
  return roots;
}

// Bare cantilever: λ = 1.8751, 4.6941, 7.8548, 10.9955 → ratios 1, 6.267, 17.55, 34.39.
export const BARE_RATIOS = [1, 6.2669, 17.5475, 34.3861, 56.8426, 84.9126];

// ---------------------------------------------------------------------------
// Per-key design. Every tongue is 0.5 × 2.4 mm steel; the solder blob is
// heavy in the bass and a speck in the treble, and the free length is solved
// so that the lowest mode is the key's pitch.

export function solderRatio(m, scale = 1) { return geo(1.6, 0.04, tKey(m)) * scale; } // M / (tongue mass)

function blob(M, h) { // a lump of solder sitting on the tip: side a, rotary inertia about the tongue's axis
  const a = Math.cbrt(M / SOLDER_RHO);
  return { a, J: M * (a * a / 6 + ((a + h) / 2) ** 2) };
}

export function tuneReed(m, solderScale = 1, nModes = 6) {
  const f0 = keyFreq(m), om0 = 2 * PI * f0, { h, b } = REED, mu = STEEL.rho * h * b;
  const ratio = solderRatio(m, solderScale);
  // start from the exact tip-mass root, then let the FEM (which adds the
  // blob's rotary inertia) correct the length: f₁ ∝ 1/L² at fixed ratio
  const lam = tipMassRoots(ratio, 1)[0];
  let L = Math.sqrt((lam * lam * Math.sqrt((STEEL.E * h * h) / (12 * STEEL.rho))) / om0), r;
  for (let it = 0; it < 4; it++) {
    const M = ratio * mu * L, { J } = blob(M, h);
    r = reedFEM({ L, h, b, M, J, nModes });
    const err = r.omega[0] / om0;
    if (Math.abs(err - 1) < 1e-9) break;
    L *= Math.sqrt(err);
  }
  return { ...r, f0, ratio, blob: blob(r.M, h) };
}

// Felt hammers, graded lighter and harder toward the treble (power-law felt,
// F = K δ^p, after the piano hammers of Chaigne & Askenfelt 1994, scaled down).
export function hammerDefaults(m) {
  const t = tKey(m);
  return { mass: geo(0.7e-3, 0.25e-3, t), K: geo(6e8, 6e10, t), p: 2.5 };
}
// Key velocity 0..1 → hammer speed (m/s): roughly what a finger can give a
// small hammer through the action's lever ratio.
export const HAMMER_VMAX = 2;
export const hammerSpeed = (vel) => HAMMER_VMAX * Math.max(0.02, Math.min(1, vel));

// Losses (s⁻¹ per mode, unit modal mass):
//   steel:  σ = ½ η ω                       internal friction, loss factor η
//   clamp:  σ = ½ ω² (Y_w Γ² + Y_θ Θ²)      the mode's root shear ω²Γ and moment
//           ω²Θ drive the clamp (screw, washer, reed bar), whose resistive
//           translational and rotational mobilities Y_w, Y_θ take power ½|F|²Y.
//           The moment term is nearly the same for every mode; the shear
//           term grows ~14× from mode 1 to mode 2, so overtones die first.
//   damper: σ = σ_d (φ(x_d)/φ₁(x_d))²        felt on the tongue, key released
// Y_w and Y_θ are not measured: they are set so that middle C rings ≈ 5 s,
// 30 : 70 shear : moment. Air damping of a 2.4 mm strip at these Reynolds
// numbers gives Q ≈ 10⁴ (Sader 1998) and is left out.
export const LOSS = { Yw: 1.0e-3, Ytheta: 3.2, damper: 30 };

// Everything one key needs: geometry, modes, losses, strike and pickup weights.
export function keyModel(m, P, fs = 48000) {
  const reed = tuneReed(m, P.solder);
  const { L } = reed, f0 = reed.f0;
  const fmax = Math.min(18000, 0.45 * 2 * fs);
  const xh = clamp(P.strike, 0.05, 0.95) * L, xd = 0.7 * L, xp = L - PICKUP.ell / 2;
  const modes = [];
  for (let n = 0; n < reed.nModes; n++) {
    const om = reed.omega[n], f = om / (2 * PI);
    if (f > fmax) break;
    const sigSteel = 0.5 * STEEL.eta * om, sigClamp = 0.5 * om * om * (LOSS.Yw * reed.Gamma[n] ** 2 + LOSS.Ytheta * reed.Theta[n] ** 2);
    modes.push({
      n, f, ratio: f / f0, bare: BARE_RATIOS[n], sigma: sigSteel + sigClamp, sigSteel, sigClamp,
      w: reed.shape(n, xh), pk: reed.shape(n, xp), dampW: (reed.shape(n, xd) / reed.shape(0, xd)) ** 2, Gamma: reed.Gamma[n], Theta: reed.Theta[n],
    });
  }
  const hd = hammerDefaults(m);
  const hammer = { mass: hd.mass, K: hd.K * P.hardness, p: hd.p, alpha: 2e-5 };
  const info = {
    key: m, name: noteName(m), f0, L, h: reed.h, b: reed.b, mReed: reed.m, M: reed.M, J: reed.J, blobSide: reed.blob.a,
    ratio: reed.ratio, xh, xd, xp, hammer,
    kPick: (reed.omega[0] / reed.shape(0, xp)) ** 2, // mode-1 stiffness referred to the slot
  };
  return {
    key: m, info, reed, modes,
    voice: {
      key: m, n: modes.length,
      freq: Float64Array.from(modes, (x) => x.f), sigma: Float64Array.from(modes, (x) => x.sigma),
      w: Float64Array.from(modes, (x) => x.w), pk: Float64Array.from(modes, (x) => x.pk),
      dampW: Float64Array.from(modes, (x) => x.dampW), hammer,
    },
  };
}

// ---------------------------------------------------------------------------
// Pickup. slot-table.js holds C′(y)/ε₀ from the Laplace solution for a set of
// gaps; between gaps we interpolate log C′ linearly in log g (C′ is close to
// a power law in g at fixed y). Returns C(y) in farads on the table's y grid.

export function capCurve(gapMM) {
  const g = clamp(gapMM, SLOT_GAPS[0], SLOT_GAPS[SLOT_GAPS.length - 1]);
  let i = 0;
  while (i < SLOT_GAPS.length - 2 && g > SLOT_GAPS[i + 1]) i++;
  const u = Math.log(g / SLOT_GAPS[i]) / Math.log(SLOT_GAPS[i + 1] / SLOT_GAPS[i]);
  const A = SLOT_C[i], B = SLOT_C[i + 1], s = EPS0 * PICKUP.ell;
  const c = new Float64Array(SLOT_Y.n);
  for (let k = 0; k < SLOT_Y.n; k++) c[k] = s * Math.exp((1 - u) * Math.log(A[k]) + u * Math.log(B[k]));
  return { c, y0: SLOT_Y.min, dy: SLOT_Y.step, n: SLOT_Y.n };
}

// C, dC/dy and d²C/dy² at height y (m) by Catmull–Rom interpolation of the table.
export function capAt(T, y) {
  const x = clamp((y - T.y0) / T.dy, 1, T.n - 3 - 1e-9), i = Math.floor(x), f = x - i, c = T.c;
  const p0 = c[i - 1], p1 = c[i], p2 = c[i + 1], p3 = c[i + 2];
  const a1 = 0.5 * (p2 - p0), a2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, a3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
  return { C: ((a3 * f + a2) * f + a1) * f + p1, dC: ((3 * a3 * f + 2 * a2) * f + a1) / T.dy, d2C: (6 * a3 * f + 2 * a2) / (T.dy * T.dy) };
}

// The comb's node: C0 v′ + V_b C′_reed(t) = −v/R (linearised in δC/C0 ≈ 10⁻³).
// A first-order high-pass of the capacitance swing with τ = R C0:
//   ωτ ≫ 1  constant charge:   v = −V_b δC / C0          (follows C itself)
//   ωτ ≪ 1  constant voltage:  v = −V_b R dC/dt           (follows its rate)
export function pickupNode(P) {
  const R = P.rbias * 1e6, tau = R * PICKUP.C0;
  return { R, tau, fc: 1 / (2 * PI * tau), gain: P.bias / PICKUP.C0 };
}

// The field pulls the grounded reed toward higher capacitance, F = ½ V² dC/dy;
// linearised about the rest height this is a spring k_E = −½ V² C″(y₀) at the
// slot, so the pitch moves by Δf/f ≈ ½ k_E / k, k = mode-1 stiffness there.
export function electrostaticShift(model, P) {
  const T = capCurve(P.gap), { d2C } = capAt(T, P.offset * 1e-3);
  const kE = -0.5 * P.bias * P.bias * d2C;
  return { kE, cents: 1200 * Math.log2(Math.sqrt(1 + kE / model.info.kPick)) };
}
