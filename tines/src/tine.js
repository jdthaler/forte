// tine.js — mechanics of a Rhodes-style tine piano key, reduced to modes.
//
// Each key is an asymmetric tuning fork:
//
//          tone bar (brass, one mode)
//   block ═════════════
//     ║   ─────────────────●──────  tine (steel cantilever) ── pickup
//     ║        ▲ hammer    spring
//   mount (rubber grommet: spring + loss)
//
// Coordinates: u = block displacement, q_n = tine modes relative to the
// block (finite-element cantilever with the tuning spring as a point mass),
// p = tone-bar mode. The Lagrangian couples them through the block's
// inertia,
//
//   T = ½ M_tot u̇² + u̇ (Σ Γ_n q̇_n + Γ_b ṗ) + ½ Σ q̇_n² + ½ ṗ²
//   V = ½ K₀ u² + ½ Σ ω_n² q_n² + ½ ω_b² p²
//
// where Γ = ∫ m φ dx are participation factors. When tine and bar share a
// frequency, the antisymmetric mode leaves the block still: its energy cannot
// leak into the lossy mount, so it sustains. The symmetric mode moves the
// block and dies fast. That is the Rhodes envelope: a quick drop, then a long tail.
//
// The pickup sees only the tine tip. Its flux is a nonlinear function of the
// tip's vertical position Y (axial field of a pole at distance w):
//   Φ(Y) = (1 + (Y/w)²)^(-3/2),   output ∝ −dΦ/dt.

import { genEig } from '../../shared/linalg.js';

export const KEY_LO = 28, KEY_HI = 100; // 73 keys, E1–E7
export const STEEL = { E: 2.0e11, rho: 7850 };
const PI = Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// Hermite cubic shape functions on an element of length l at ξ ∈ [0,1].
function hermite(xi, l) {
  return [1 - 3 * xi * xi + 2 * xi ** 3, l * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, l * (-xi * xi + xi ** 3)];
}

// Clamped–free Euler–Bernoulli beam with a point mass, by finite elements.
export function cantilever({ L, d, ms, s, nel = 24, nModes = 6 }) {
  const { E, rho } = STEEL;
  const A = (PI * d * d) / 4, I = (PI * d ** 4) / 64, EI = E * I, mu = rho * A;
  const l = L / nel, NF = 2 * (nel + 1);
  const Kf = new Float64Array(NF * NF), Mf = new Float64Array(NF * NF);
  const ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
  const me = [[156, 22 * l, 54, -13 * l], [22 * l, 4 * l * l, 13 * l, -3 * l * l], [54, 13 * l, 156, -22 * l], [-13 * l, -3 * l * l, -22 * l, 4 * l * l]];
  const kc = EI / l ** 3, mc = (mu * l) / 420;
  for (let e = 0; e < nel; e++) {
    const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      Kf[dof[a] * NF + dof[b]] += kc * ke[a][b];
      Mf[dof[a] * NF + dof[b]] += mc * me[a][b];
    }
  }
  if (ms > 0) {
    const e = Math.min(nel - 1, Math.floor(s / l)), xi = s / l - e;
    const Nv = hermite(xi, l), dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) Mf[dof[a] * NF + dof[b]] += ms * Nv[a] * Nv[b];
  }
  // rigid translation of the whole tine (incl. the clamped node)
  const g = new Float64Array(NF);
  for (let i = 0; i < NF; i++) for (let j = 0; j < NF; j += 2) g[i] += Mf[i * NF + j];
  let mt = 0;
  for (let i = 0; i < NF; i += 2) mt += g[i];
  // clamp node 0
  const N = NF - 2, K = new Float64Array(N * N), M = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { K[i * N + j] = Kf[(i + 2) * NF + j + 2]; M[i * N + j] = Mf[(i + 2) * NF + j + 2]; }
  const nv = Math.min(nModes, N);
  const { lambda, X } = genEig(K, M, N, nv);
  const omega = [], Gamma = [];
  for (let n = 0; n < nv; n++) {
    omega.push(Math.sqrt(lambda[n]));
    let G = 0;
    for (let i = 0; i < N; i++) G += X[i * nv + n] * g[i + 2];
    // sign: tip displacement positive
    const tip = X[(N - 2) * nv + n];
    if (tip < 0) { for (let i = 0; i < N; i++) X[i * nv + n] *= -1; G = -G; }
    Gamma.push(G);
  }
  const shape = (n, x) => {
    const xx = clamp(x, 0, L);
    const e = Math.min(nel - 1, Math.floor(xx / l)), xi = xx / l - e;
    const Nv = hermite(xi, l);
    const dofVal = (gd) => (gd < 2 ? 0 : X[(gd - 2) * nv + n]);
    return Nv[0] * dofVal(2 * e) + Nv[1] * dofVal(2 * e + 1) + Nv[2] * dofVal(2 * e + 2) + Nv[3] * dofVal(2 * e + 3);
  };
  return { L, d, mu, EI, mt, ms, s, omega, Gamma, shape, nModes: nv };
}

// Uniform cantilever, mode 1, normalised to 2 at the tip (for drawing the bar).
export function barShape(xi) {
  const b = 1.8751040687;
  const sig = (Math.cosh(b) + Math.cos(b)) / (Math.sinh(b) + Math.sin(b));
  const f = (x) => Math.cosh(b * x) - Math.cos(b * x) - sig * (Math.sinh(b * x) - Math.sin(b * x));
  return (2 * f(xi)) / f(1);
}

// Hammer tips: neoprene, graded softer in the bass (Hertz-like F = K δ^p).
export function hammerDefaults(m) {
  const t = clamp((m - KEY_LO) / (KEY_HI - KEY_LO), 0, 1);
  return { mass: 10e-3 * (1 - t) + 4e-3 * t, K: Math.exp(Math.log(8e6) * (1 - t) + Math.log(1.2e8) * t), p: 2.0 };
}

export function computeKey(m, P, fs = 48000) {
  const f0 = keyFreq(m), om0 = 2 * PI * f0;
  const d = P.tineDiameter * 1e-3;
  const mu = STEEL.rho * PI * d * d / 4;
  // geometry is self-similar in L (spring mass ∝ tine mass, position ∝ L), so
  // f₁ ∝ 1/L²: solve once at 10 cm, then scale the length to tune the key
  const Lr = 0.1;
  const ref = cantilever({ L: Lr, d, ms: P.springMass * mu * Lr, s: P.springPos * Lr, nModes: 1, nel: 16 });
  const L = Lr * Math.sqrt(ref.omega[0] / om0);
  const fmax = Math.min(18000, 0.45 * 2 * fs);
  const tine = cantilever({ L, d, ms: P.springMass * mu * L, s: P.springPos * L, nModes: 6 });
  let nq = 0;
  while (nq < tine.nModes && tine.omega[nq] / (2 * PI) < fmax) nq++;
  nq = Math.max(1, nq);

  // tone bar, block, mount
  const Mb = Math.max(1e-6, P.barMass * tine.mt);
  const omB = om0 * 2 ** (P.barTune / 1200);
  const Gb = Math.sqrt(0.613 * Mb);              // uniform cantilever, mode 1
  // mounting block + effective harp mass on a rubber grommet; the grommet's
  // resonance is set per register, as a fraction of the note frequency
  const M0 = P.blockMass * tine.mt;
  const K0 = M0 * (P.mountRatio * om0) ** 2;
  const c0 = 2 * P.mountDamp * Math.sqrt(K0 * M0);

  const n = nq + 2, iu = 0, ip = nq + 1;
  const Mm = new Float64Array(n * n), Km = new Float64Array(n * n);
  Mm[0] = tine.mt + Mb + M0;
  for (let j = 0; j < nq; j++) {
    Mm[iu * n + 1 + j] = Mm[(1 + j) * n + iu] = tine.Gamma[j];
    Mm[(1 + j) * n + 1 + j] = 1;
    Km[(1 + j) * n + 1 + j] = tine.omega[j] ** 2;
  }
  Mm[iu * n + ip] = Mm[ip * n + iu] = Gb;
  Mm[ip * n + ip] = 1;
  Km[0] = K0;
  Km[ip * n + ip] = omB * omB;
  const { lambda, X } = genEig(Km, Mm, n, n);

  // damping (diagonal in the uncoupled coordinates) projected onto coupled modes
  const b1 = 0.25 * P.tineLoss, b3 = 4e-8 * P.hfLoss;
  const cDiag = new Float64Array(n);
  cDiag[0] = c0;
  for (let j = 0; j < nq; j++) cDiag[1 + j] = 2 * (b1 + b3 * tine.omega[j] ** 2);
  cDiag[ip] = 2 * 0.12 * P.barLoss;

  const xh = clamp(P.strike * 1e-3, 0.02 * L, 0.6 * L);
  const xd = 0.6 * L; // damper felt
  const phiH = [], phiTip = [], phiD = [];
  for (let j = 0; j < nq; j++) { phiH.push(tine.shape(j, xh)); phiTip.push(tine.shape(j, L)); phiD.push(tine.shape(j, xd)); }

  const modes = [];
  for (let k = 0; k < n; k++) {
    const om = Math.sqrt(Math.max(lambda[k], 0));
    const col = (i) => X[i * n + k];
    let sig = 0, w = col(iu), pk = col(iu), wd = col(iu), tineE = 0;
    for (let i = 0; i < n; i++) sig += 0.5 * cDiag[i] * col(i) ** 2;
    for (let j = 0; j < nq; j++) {
      w += phiH[j] * col(1 + j);
      pk += phiTip[j] * col(1 + j);
      wd += phiD[j] * col(1 + j);
      tineE += col(1 + j) ** 2;
    }
    // rough energy split (ignores the inertial cross terms)
    const barE = col(ip) ** 2, blockE = Mm[0] * col(iu) ** 2, tot = tineE + barE + blockE;
    modes.push({ col: k, f: om / (2 * PI), sigma: sig, w, pk, dampW: (wd / phiD[0]) ** 2, tineFrac: tineE / tot, barFrac: barE / tot, blockFrac: blockE / tot });
  }
  // keep audible modes, but always keep the low ones that carry the note
  const kept = modes.filter((md) => md.f < 0.45 * 2 * fs && md.f > 5);

  const hd = hammerDefaults(m);
  // pickup: gap g (axial) and pole radius set the width of the flux bump
  const gap = P.gap * 1e-3 * (1 - 0.35 * clamp((m - KEY_LO) / (KEY_HI - KEY_LO), 0, 1)); // closer in the treble
  const wid = Math.sqrt(gap * gap + (P.poleRadius * 1e-3) ** 2);
  const voicingGain = 10 ** ((P.voicing * Math.log2(f0 / 261.63)) / 20);
  const info = {
    key: m, name: noteName(m), f0, L, d, mt: tine.mt, ms: tine.ms, s: tine.s, xh,
    tineRatios: tine.omega.slice(0, nq).map((o) => o / tine.omega[0]),
    f1tine: tine.omega[0] / (2 * PI), Mb, M0, fBar: omB / (2 * PI), gap, wid,
  };
  return {
    key: m, info, tine, nq, modes: kept, xh,
    voice: {
      key: m, n: kept.length,
      freq: Float64Array.from(kept, (md) => md.f),
      sigma: Float64Array.from(kept, (md) => md.sigma),
      dampW: Float64Array.from(kept, (md) => md.dampW),
      w: Float64Array.from(kept, (md) => md.w),
      pk: Float64Array.from(kept, (md) => md.pk),
      hammer: { mass: hd.mass * P.hammerMass, K: hd.K * P.hardness, p: hd.p + P.tipExp, alpha: P.hysteresis },
      pickup: { wid, yoff: P.offset * wid, gain: voicingGain },
      hasDamper: m <= 94,
    },
    // coupled-mode shapes for the slow-motion view
    shapes: { X, n, nq, iu, ip },
  };
}

// Normalised flux and its derivative, for plots.
export const flux = (Y, w) => (1 + (Y / w) ** 2) ** -1.5;
