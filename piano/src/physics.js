// physics.js — mechanics of a struck string / bar / ribbon, reduced to modes.
//
// A slender elastic member of length L under tension T, pinned at both ends,
// has three independent families of small-amplitude motion (for any cross-
// section whose centroid and shear centre coincide):
//
//   bending along principal axis i (i = 1, 2):
//       m(x) u_tt = T u_xx - (E I_i(x) u_xx)_xx
//   torsion:
//       Θ(x) θ_tt = ((G J(x) + T I_p(x)/A(x)) θ_x)_x
//
// m = ρA (+ winding mass), Θ = ρ I_p (+ winding inertia). The T·I_p/A term is
// the "tension stiffening" of torsion: twisted fibres are tilted, so the
// tension produces a restoring torque. Hence the torsional wave speed obeys
//       c_θ² = G J / (ρ I_p) + c_T²,
// which for a thin ribbon of width w, thickness t is 4 (t/w)² G/ρ + c_T² —
// it slides down towards the transverse wave speed as the ribbon gets thinner.
//
// Uniform members are solved in closed form. Tapered members ("triangular"
// planform) are solved by Rayleigh–Ritz in a sine basis, which is exact in the
// limit and keeps the pinned boundary conditions.
//
// Units: SI throughout.

export const MATERIALS = {
  steel:    { name: 'Steel music wire',          E: 2.00e11, G: 7.9e10, rho: 7850, strength: 2.2e9 },
  brass:    { name: 'Brass',                     E: 1.00e11, G: 3.7e10, rho: 8500, strength: 0.6e9 },
  bronze:   { name: 'Phosphor bronze',           E: 1.10e11, G: 4.2e10, rho: 8860, strength: 0.9e9 },
  titanium: { name: 'Titanium alloy',            E: 1.14e11, G: 4.4e10, rho: 4430, strength: 1.0e9 },
  nylon:    { name: 'Nylon monofilament',        E: 4.0e9,   G: 1.4e9,  rho: 1140, strength: 0.6e9 },
  carbon:   { name: 'Carbon fibre (unidirect.)', E: 1.35e11, G: 5.0e9,  rho: 1600, strength: 1.5e9 },
};

export const SHAPES = {
  round:    'Round wire',
  square:   'Square bar',
  triangle: 'Triangular bar (equilateral)',
  ribbon:   'Flat ribbon (rectangle)',
};

const SQ3 = Math.sqrt(3);
const PI = Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------------------
// Cross-sections

function rect(w, t) {
  const a = Math.max(w, t), b = Math.min(w, t), r = b / a;
  // Saint-Venant torsion constant of a rectangle (Roark; <0.5 % error).
  const J = a * b ** 3 * (1 / 3 - 0.21 * r * (1 - r ** 4 / 12));
  return {
    A: w * t,
    I1: (w * t ** 3) / 12, // bending across the thickness (easy axis)
    I2: (t * w ** 3) / 12, // bending across the width (hard axis)
    J,
    Ip: (w * t ** 3 + t * w ** 3) / 12,
    half: w / 2,
    lever: w / 2,
    w, t,
  };
}

// Section properties for core area A. `s` is the local planform scale (1 for a
// uniform member). A ribbon tapers in width only (thickness fixed); the other
// shapes scale self-similarly so they keep their shape.
export function sectionProps(shape, A, aspect = 1, s = 1) {
  if (shape === 'ribbon') {
    const t = Math.sqrt(A / aspect);
    return rect(aspect * t * s, t);
  }
  const As = A * s;
  if (shape === 'square') {
    const a = Math.sqrt(As), I = a ** 4 / 12;
    return { A: As, I1: I, I2: I, J: 0.1406 * a ** 4, Ip: 2 * I, half: a / 2, lever: a / 2, w: a, t: a };
  }
  if (shape === 'triangle') {
    // Any section with ≥3-fold symmetry has an isotropic second-moment tensor,
    // so I1 = I2 here just as for the square and the circle.
    const sd = Math.sqrt((4 * As) / SQ3), I = (SQ3 * sd ** 4) / 96;
    return { A: As, I1: I, I2: I, J: (SQ3 * sd ** 4) / 80, Ip: 2 * I, half: sd / 2, lever: sd / 2, w: sd, t: (SQ3 * sd) / 2 };
  }
  const r = Math.sqrt(As / PI), I = (PI * r ** 4) / 4;
  // A frictionless hammer pushes along a radius of a round wire: no torque.
  return { A: As, I1: I, I2: I, J: 2 * I, Ip: 2 * I, half: r, lever: 0, w: 2 * r, t: 2 * r };
}

// ---------------------------------------------------------------------------
// Scale design (a smoothed concert-grand layout, steel reference)

export function keyFreq(m) { return 440 * 2 ** ((m - 69) / 12); }

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteName(m) { return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

export function scaleLength(m) {
  const Lf = 0.62 * 2 ** ((-0.88 * (m - 60)) / 12); // ~ f^-0.88 in the treble
  return Lf / (1 + (Lf / 2.0) ** 6) ** (1 / 6);     // foreshortened bass, ≤ 2 m
}

export function scaleDiameter(m) { return 1.065e-3 * 2 ** ((-0.12 * (m - 60)) / 12); }

// Copper winding of the reference steel design, as added mass per length. It
// is a property of the instrument, so it stays put when you change the core.
export function windingMass(m) {
  const L = scaleLength(m), f = keyFreq(m), d = scaleDiameter(m);
  const mu = 7850 * PI * d * d / 4;
  const Tplain = 4 * L * L * f * f * mu;
  const Ttarget = 735 * (1 + 1.2 * clamp((48 - m) / 27, 0, 1));
  if (Tplain >= 0.85 * Ttarget) return 0;
  return mu * (Ttarget / Tplain - 1);
}

function interp(m, pts) {
  if (m <= pts[0][0]) {
    const [x0, y0] = pts[0], [x1, y1] = pts[1];
    return y0 + ((y1 - y0) * (m - x0)) / (x1 - x0);
  }
  for (let i = 1; i < pts.length; i++) {
    if (m <= pts[i][0] || i === pts.length - 1) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (m - x0)) / (x1 - x0);
    }
  }
}

// Felt hammers after Chaigne & Askenfelt (1994): F = K δ^p.
export function hammerDefaults(m) {
  const mass = clamp(interp(m, [[36, 4.9e-3], [60, 2.97e-3], [96, 2.2e-3]]), 1.8e-3, 7e-3);
  const K = Math.exp(interp(m, [[36, Math.log(4e8)], [60, Math.log(4.5e9)], [96, Math.log(1e11)]]));
  const p = clamp(interp(m, [[36, 2.3], [60, 2.5], [96, 3.0]]), 2.1, 3.3);
  const width = clamp(0.010 + (60 - m) * 0.00025, 0.003, 0.022);
  return { mass, K, p, width };
}

// Dense eigen-solvers live in shared/linalg.js (re-exported for older imports).
import { genEig, symEig } from '../../shared/linalg.js';
export { genEig, symEig };

// ---------------------------------------------------------------------------
// Rayleigh–Ritz in the basis sin(jπx/L), j = 1..nb

// C[m] = ∫₀ᴸ f(x) cos(mπx/L) dx for m = 0..mMax (midpoint rule).
function cosMoments(f, L, mMax, Q) {
  const C = new Float64Array(mMax + 1);
  const h = L / Q;
  for (let q = 0; q < Q; q++) {
    const x = (q + 0.5) * h, w = f(x) * h;
    const c1 = Math.cos((PI * x) / L);
    let cm1 = 1, cm = c1;
    C[0] += w;
    if (mMax >= 1) C[1] += w * c1;
    for (let m = 2; m <= mMax; m++) {
      const cn = 2 * c1 * cm - cm1;
      C[m] += w * cn;
      cm1 = cm; cm = cn;
    }
  }
  return C;
}

// Gram matrices: ∫ f sin_i sin_j = ½[C(i-j) - C(i+j)], ∫ f cos_i cos_j = ½[C(i-j) + C(i+j)]
function gram(C, nb, sign, wi, out, accumulate = false) {
  for (let i = 0; i < nb; i++) {
    for (let j = 0; j < nb; j++) {
      const v = 0.5 * (C[Math.abs(i - j)] + sign * C[i + j + 2]) * (wi ? wi[i] * wi[j] : 1);
      if (accumulate) out[i * nb + j] += v; else out[i * nb + j] = v;
    }
  }
  return out;
}

// One family by Rayleigh–Ritz. fam: { mass(x), P(x) or Pconst, R(x) or null }.
function ritzSolve(fam, L, nb, nKeep) {
  const Q = Math.max(8 * nb, 256);
  const k = new Float64Array(nb), k2 = new Float64Array(nb);
  for (let j = 0; j < nb; j++) { k[j] = ((j + 1) * PI) / L; k2[j] = k[j] * k[j]; }
  const M = gram(cosMoments(fam.mass, L, 2 * nb + 2, Q), nb, -1, null, new Float64Array(nb * nb));
  const K = new Float64Array(nb * nb);
  if (fam.Pconst !== undefined) {
    for (let j = 0; j < nb; j++) K[j * nb + j] = fam.Pconst * k2[j] * L / 2;
  } else {
    gram(cosMoments(fam.P, L, 2 * nb + 2, Q), nb, +1, k, K);
  }
  if (fam.R) gram(cosMoments(fam.R, L, 2 * nb + 2, Q), nb, -1, k2, K, true);
  return genEig(K, M, nb, Math.min(nKeep, nb));
}

// Tension that puts the fundamental of a (tapered) bending family at ω0.
// λ₁(T) is concave and increasing, so Newton with dλ/dT = x₁ᵀ D x₁ (Hellmann–
// Feynman) converges monotonically from below.
function tuneRitz(fam, L, omega0, Tguess) {
  const nb = 24, Q = 512;
  const k2 = new Float64Array(nb);
  for (let j = 0; j < nb; j++) k2[j] = (((j + 1) * PI) / L) ** 2;
  const M = gram(cosMoments(fam.mass, L, 2 * nb + 2, Q), nb, -1, null, new Float64Array(nb * nb));
  const KR = gram(cosMoments(fam.R, L, 2 * nb + 2, Q), nb, -1, k2, new Float64Array(nb * nb));
  let T = Tguess;
  for (let it = 0; it < 12; it++) {
    const K = Float64Array.from(KR);
    for (let j = 0; j < nb; j++) K[j * nb + j] += T * k2[j] * L / 2;
    const { lambda, X } = genEig(K, M, nb, 1);
    let dl = 0;
    for (let j = 0; j < nb; j++) dl += X[j] * X[j] * k2[j] * L / 2;
    const Tn = T + (omega0 * omega0 - lambda[0]) / dl;
    if (!(Tn > 0)) return { T: 0, ok: false };
    const done = Math.abs(Tn - T) < 1e-10 * T;
    T = Tn;
    if (done) break;
  }
  return { T, ok: true };
}

// Fourier transform of a Hann window of total width w (the felt contact patch).
function hannFT(kk, w) {
  const a = (kk * w) / 2;
  if (a < 1e-6) return 1;
  const den = 1 - (a / PI) ** 2;
  if (Math.abs(den) < 1e-6) return 0.5;
  return Math.sin(a) / a / den;
}

// ---------------------------------------------------------------------------
// Per-key model

export const NMAX_MODES = 140;

export function computeKeyModel(m, P, fs = 48000) {
  const mat = MATERIALS[P.material] || MATERIALS.steel;
  const { E, G, rho } = mat;
  const f0 = keyFreq(m), omega0 = 2 * PI * f0;
  const L = scaleLength(m) * P.lengthScale;
  const d = scaleDiameter(m) * P.gauge;
  const A0 = (PI * d * d) / 4;
  const dMu = P.winding ? windingMass(m) : 0;
  const shape = P.shape;
  const aspect = shape === 'ribbon' ? Math.max(1, P.aspect) : 1;
  const tau = clamp(P.taper || 0, -0.97, 0.97);
  const uniform = Math.abs(tau) < 1e-4;

  const sec0 = sectionProps(shape, A0, aspect, 1);
  const prof = (x) => (uniform ? 1 : 1 + tau * (1 - (2 * x) / L));
  const secAt = (x) => sectionProps(shape, A0, aspect, prof(x));
  const dTheta = dMu * 2 * (sec0.Ip / sec0.A); // winding sits outside the core

  const hd = hammerDefaults(m);
  const beta = clamp(P.strikePos, 0.01, 0.5);
  const xh = beta * L;
  const wH = Math.min(hd.width * P.hammerWidth, 2 * xh, 0.5 * L);
  const fmax = Math.min(P.maxFreq, 0.45 * fs);

  const mass = (x) => rho * secAt(x).A + dMu;
  const thetaMass = (x) => rho * secAt(x).Ip + dTheta;

  // --- tension: tune the fundamental of whichever bending axis faces the
  // hammer (as a piano tuner would, by ear) to the key's pitch
  const mu0 = rho * A0 + dMu;
  const k1 = PI / L;
  const Tstring = (omega0 * omega0 * mu0) / (k1 * k1); // flexible-string value
  const tuneAxis = Math.abs(Math.cos((P.roll * PI) / 180)) >= Math.SQRT1_2 ? 'I1' : 'I2';
  let T, tuned = true;
  if (uniform) {
    T = Tstring - E * sec0[tuneAxis] * k1 * k1;
  } else {
    const r = tuneRitz({ mass, R: (x) => E * secAt(x)[tuneAxis] }, L, omega0, Math.max(Tstring * 0.5, 1));
    T = r.T; tuned = r.ok;
  }
  if (!(T > 0.02 * Tstring)) { T = 0.02 * Tstring; tuned = false; }

  const families = [];
  const window = (kk) => hannFT(kk, wH);

  // --- bending families
  const bendDefs = [
    { type: 'bend1', I: sec0.I1, Ifn: (x) => secAt(x).I1, IL: secAt(L).I1 },
    { type: 'bend2', I: sec0.I2, Ifn: (x) => secAt(x).I2, IL: secAt(L).I2 },
  ];
  const isotropic = Math.abs(sec0.I1 - sec0.I2) < 1e-9 * sec0.I1;
  for (const bd of bendDefs) {
    if (bd.type === 'bend2' && isotropic) {
      families.push({ ...families[0], type: 'bend2' });
      continue;
    }
    const B = (PI * PI * E * bd.I) / (T * L * L);
    let nEst = 0;
    while (nEst < NMAX_MODES && (nEst + 1) * (0.5 / L) * Math.sqrt(T / mu0) * Math.sqrt(1 + B * (nEst + 1) ** 2) < fmax) nEst++;
    nEst = Math.max(nEst, 1);
    if (uniform) {
      const omega = new Float64Array(nEst), phiH = new Float64Array(nEst), bridge = new Float64Array(nEst), norm = new Float64Array(nEst);
      const nrm = Math.sqrt(2 / (mu0 * L));
      const EI = E * bd.I;
      for (let n = 1; n <= nEst; n++) {
        const kk = (n * PI) / L;
        omega[n - 1] = Math.sqrt((T * kk * kk + EI * kk ** 4) / mu0);
        phiH[n - 1] = nrm * Math.sin(kk * xh) * window(kk);
        bridge[n - 1] = nrm * (n % 2 ? -1 : 1) * (T * kk + EI * kk ** 3);
        norm[n - 1] = nrm;
      }
      families.push({ type: bd.type, n: nEst, omega, phiH, bridge, shape: { kind: 'sine', norm }, B });
    } else {
      const nb = Math.min(220, Math.ceil(nEst / 0.8) + 6);
      const nKeep = Math.min(nEst + 4, Math.floor(0.8 * nb));
      const { lambda, X } = ritzSolve({ mass, Pconst: T, R: (x) => E * bd.Ifn(x) }, L, nb, nKeep);
      families.push(ritzFamily(bd.type, lambda, X, nb, nKeep, L, xh, window, T, E * bd.IL, fmax, B));
    }
  }

  // --- torsion family
  const Pt0 = G * sec0.J + (T * sec0.Ip) / sec0.A;
  const Th0 = rho * sec0.Ip + dTheta;
  const cTheta = Math.sqrt(Pt0 / Th0);
  {
    const fT1 = cTheta / (2 * L);
    let nEst = Math.max(1, Math.min(NMAX_MODES, Math.floor(fmax / fT1)));
    if (uniform) {
      const omega = new Float64Array(nEst), phiH = new Float64Array(nEst), bridge = new Float64Array(nEst), norm = new Float64Array(nEst);
      const nrm = Math.sqrt(2 / (Th0 * L));
      for (let n = 1; n <= nEst; n++) {
        const kk = (n * PI) / L;
        omega[n - 1] = cTheta * kk;
        phiH[n - 1] = nrm * Math.sin(kk * xh) * window(kk);
        bridge[n - 1] = nrm * (n % 2 ? -1 : 1) * Pt0 * kk;
        norm[n - 1] = nrm;
      }
      families.push({ type: 'torsion', n: nEst, omega, phiH, bridge, shape: { kind: 'sine', norm } });
    } else {
      const Pfn = (x) => { const s = secAt(x); return G * s.J + (T * s.Ip) / s.A; };
      const nb = Math.min(220, Math.ceil(nEst / 0.8) + 6);
      const nKeep = Math.min(nEst + 4, Math.floor(0.8 * nb));
      const { lambda, X } = ritzSolve({ mass: thetaMass, P: Pfn, R: null }, L, nb, nKeep);
      families.push(ritzFamily('torsion', lambda, X, nb, nKeep, L, xh, window, Pfn(L), 0, fmax));
    }
  }

  const fam1 = families[0], fam2 = families[1], famT = families[2];
  const f1 = fam1.omega[0] / (2 * PI);
  const info = {
    key: m, name: noteName(m), f0, L, T, tuned,
    stress: T / sec0.A, strengthRatio: T / sec0.A / mat.strength,
    mu: mu0, dMu, A: A0, sec: sec0,
    B1: fam1.B, B2: fam2.B,
    f1, f1hard: fam2.omega[0] / (2 * PI), f1torsion: famT.omega[0] / (2 * PI), tuneAxis,
    torsionRatio: famT.omega[0] / fam1.omega[0],
    cT: Math.sqrt(T / mu0), cTheta,
    xh, wH, beta, uniform, taper: tau,
    hammer: hd,
  };
  return { key: m, L, T, xh, wH, sec: sec0, secAt, families, info, material: mat };
}

function ritzFamily(type, lambda, X, nb, nKeep, L, xh, window, PL, RL, fmax, B) {
  const omegaAll = [];
  for (let n = 0; n < nKeep; n++) {
    const om = Math.sqrt(Math.max(lambda[n], 0));
    if (om / (2 * PI) >= fmax && n > 0) break;
    omegaAll.push(om);
  }
  const nm = omegaAll.length;
  const omega = Float64Array.from(omegaAll), phiH = new Float64Array(nm), bridge = new Float64Array(nm);
  const sinH = new Float64Array(nb), sgnK = new Float64Array(nb);
  for (let j = 0; j < nb; j++) {
    const kk = ((j + 1) * PI) / L;
    sinH[j] = Math.sin(kk * xh) * window(kk);
    sgnK[j] = (j % 2 ? 1 : -1) * (PL * kk + RL * kk ** 3); // (-1)^(j+1) with j 1-based
  }
  const coef = new Float64Array(nb * nm);
  for (let n = 0; n < nm; n++) {
    let ph = 0, br = 0;
    for (let j = 0; j < nb; j++) {
      const x = X[j * nKeep + n];
      coef[n * nb + j] = x;
      ph += x * sinH[j];
      br += x * sgnK[j];
    }
    // fix the arbitrary eigenvector sign so the shape is positive near x=0
    const s = coef[n * nb] >= 0 ? 1 : -1;
    if (s < 0) for (let j = 0; j < nb; j++) coef[n * nb + j] *= -1;
    phiH[n] = s * ph;
    bridge[n] = s * br;
  }
  return { type, n: nm, omega, phiH, bridge, shape: { kind: 'ritz', nb, coef }, B };
}

// Mode shapes φ_n(x) at the given points: Float64Array (n × xs.length).
export function shapeMatrix(fam, L, xs) {
  const nx = xs.length, out = new Float64Array(fam.n * nx);
  if (fam.shape.kind === 'sine') {
    for (let n = 0; n < fam.n; n++) {
      const kk = ((n + 1) * PI) / L, nrm = fam.shape.norm[n];
      for (let i = 0; i < nx; i++) out[n * nx + i] = nrm * Math.sin(kk * xs[i]);
    }
  } else {
    const { nb, coef } = fam.shape;
    const S = new Float64Array(nb * nx);
    for (let j = 0; j < nb; j++) for (let i = 0; i < nx; i++) S[j * nx + i] = Math.sin(((j + 1) * PI * xs[i]) / L);
    for (let n = 0; n < fam.n; n++) {
      for (let j = 0; j < nb; j++) {
        const c = coef[n * nb + j];
        for (let i = 0; i < nx; i++) out[n * nx + i] += c * S[j * nx + i];
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flatten a key model into the arrays the audio engine runs.
//
// Each mode is a damped oscillator q̈ + 2σq̇ + ω²q = Σ forces, with mass-
// normalised shapes. Couplings:
//   w   — hammer contact weight  (contact displacement = Σ w q)
//   cv  — vertical bridge channel, ch — horizontal bridge channel. A resistive
//         bridge of conductance G gives the rank-one damping matrix c cᵀ with
//         c_n = √G · F_bridge,n / ω_n, so σ_bridge,n = c_n²/2 (= G T / L for an
//         ideal string) and unison / polarization partners exchange energy
//         (Weinreich's double decay).
//   ct  — torsion → sound (output only).

export const BRIDGE_G = 6e-4; // s/kg, ~ piano soundboard mobility at the bridge

export function buildVoiceData(model, P, version = 0) {
  const nu = Math.round(clamp(P.unisons, 1, 3));
  const det = nu === 1 ? [0] : nu === 2 ? [-0.5, 0.5] : [-1, 0, 1];
  const psi = (P.roll * PI) / 180;
  const cps = Math.cos(psi), sps = Math.sin(psi);
  const lever = (P.offset || 0) * model.sec.lever;
  const Gv = BRIDGE_G * P.bridge, Gh = Gv * P.bridgeH;
  const sGv = Math.sqrt(Gv), sGh = Math.sqrt(Gh);
  const b1 = 0.25 * P.lossLow, b3 = 2.5e-9 * P.lossHigh;
  const polDet = 2 ** ((P.polDetune || 0) / 1200);
  const [fam1, fam2, famT] = model.families;

  const use = [
    { fam: fam1, id: 0, hw: cps, v: cps, h: sps, t: 0, det: 1, loss: 1 },
  ];
  if (Math.abs(sps) > 1e-6) {
    use.push({ fam: fam2, id: 1, hw: -sps, v: -sps, h: cps, t: 0, det: polDet, loss: 1 });
  }
  if (Math.abs(lever) > 1e-12) {
    use.push({ fam: famT, id: 2, hw: lever, v: 0, h: 0, t: 1 / model.sec.half, det: 1, loss: P.torsionLoss });
  }

  let N = 0;
  for (const u of use) N += u.fam.n;
  N *= nu;
  const freq = new Float64Array(N), sigma = new Float64Array(N), w = new Float64Array(N);
  const cv = new Float64Array(N), ch = new Float64Array(N), ct = new Float64Array(N);
  const famId = new Uint8Array(N), uni = new Uint8Array(N), idx = new Uint16Array(N);
  let i = 0;
  for (let s = 0; s < nu; s++) {
    const dS = 2 ** ((det[s] * P.unisonDetune) / 1200);
    for (const u of use) {
      const f = u.fam;
      for (let n = 0; n < f.n; n++, i++) {
        const om = f.omega[n] * dS * u.det;
        freq[i] = om / (2 * PI);
        sigma[i] = (b1 + b3 * om * om) * u.loss;
        w[i] = (u.hw * f.phiH[n]) / nu;
        const br = f.bridge[n] / f.omega[n];
        cv[i] = u.v * sGv * br;
        ch[i] = u.h * sGh * br;
        ct[i] = u.t * sGv * br;
        famId[i] = u.id; uni[i] = s; idx[i] = n;
      }
    }
  }

  const voice = 10 ** (((P.voicing ?? 0) * Math.log2(model.info.f0 / 261.63)) / 20);
  const hd = model.info.hammer;
  const dp = P.feltExp || 0;
  const p = hd.p + dp;
  const K = hd.K * P.hardness * 1e-3 ** (hd.p - p) * nu; // keep F(1 mm) fixed when p changes
  return {
    version, key: model.key, n: N,
    freq, sigma, w, cv, ch, ct, famId, uni, idx,
    hammer: { mass: hd.mass * P.hammerMass * nu, K, p, alpha: P.hysteresis },
    // "voicing": the per-key loudness balance a technician sets by needling
    // the felt; here a simple tilt in dB per octave about middle C.
    outV: sGv * voice, outH: sGh * voice,
    hasDamper: model.key <= 88,
  };
}
