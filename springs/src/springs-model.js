// springs-model.js — the physics of a struck helical spring, free of audio and DOM so that the
// page, the engine, the tests and the render tool can all use it.
//
//   wire (E, G, ρ, radius r) wound into a helix (coil radius R, helix angle α, N turns)
//     → Wittrick's helical rod: 12 first-order equations, 6 displacements and rotations;
//       plane waves along the wire give a 6 × 6 symmetric eigenproblem for ω²(k)
//     → the two acoustic sheets: the spring's rotation (torsional) and axial ("slinky") waves,
//       each dispersive, with a transition frequency F_C where the low branch ends
//     → a finite spring of wire length L: modes at k_n = nπ/L, each weighted by its motion at the
//       driving bead times its motion at the pickup bead, damped per mode
//
// Also: the reduced zero-helix-angle curved-rod ("thin spring") model, the slinky line (the
// spring as a uniform line, from the open-coiled spring formulas), group delay and F_C.
//
// Frenet frame (n, b, t): n the principal normal (toward the axis), b the binormal, t the tangent;
// curvature κ = cos²α/R, torsion τ = sin α cos α/R. The axis directions: e_φ = cos α t − sin α b
// (round the axis, what a bead's rotation moves) and e_z = sin α t + cos α b (along the axis).

export const TAU = 2 * Math.PI;
export const KEY_LO = 36, KEY_HI = 84;                  // C2–C6
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export const cents = (f, g) => 1200 * Math.log2(f / g);

// Spring steel (the model's choice of typical values).
export const STEEL = { E: 200e9, rho: 7850, nu: 0.29 };
export const cE = Math.sqrt(STEEL.E / STEEL.rho);       // √(E/ρ), 5048 m/s
// Timoshenko's shear coefficient for a solid circular section (Cowper 1966).
export const shearK = (nu) => (6 * (1 + nu)) / (7 + 6 * nu);

// ---- the scaled family of springs -------------------------------------------------------------------
// Every key's spring is the C4 spring scaled in every dimension by f(C4)/f₀: coil, wire and length.
// In units of R the dispersion depends only on the shape (r/R, α, ν), ω = (√(E/ρ)/R)·Ω(kR), so a spring
// scaled by s has every mode, F_C and echo time scaled by 1/s: each key is the same spring transposed,
// in tune with the others whatever the ear takes for its pitch. The C4 spring's wire is cut so that
// its slowest round trip lands on the note (tuneSpring).
export const REF = { key: 60, R: 2.7e-3, r: 0.225e-3 };  // C4: 5.4 mm coil, 0.45 mm wire (a reverb spring's)
// The Slinky family: one wide coil of fine wire for every key, the key setting its length. Its F_C
// (about 40 Hz) lies below hearing, so everything heard is on the flexural branch, ω ≈ κk² with
// κ = (r/2)√(E/ρ): a length ∝ f₀^(−1/2) then transposes every mode, and every echo time, exactly
// with the key in that limit. Round wire stands in for the toy's flat ribbon.
export const SLINKY = { key: 60, R: 35e-3, r: 0.35e-3, L: 3.5, fMax: 3000, gain: 0.03 };

export function geometry(key, P = {}) {
  const slinky = P.family === 'slinky', s = slinky ? 1 : 2 ** (-(key - REF.key) / 12), B = slinky ? SLINKY : REF;
  const R = B.R * s * (P.coil ?? 1), r = B.r * s * (P.wire ?? 1);
  const alpha = ((P.helix ?? 3) * Math.PI) / 180;
  return { R, r, alpha, nu: STEEL.nu, E: STEEL.E, rho: STEEL.rho, slinky };
}
// The nondimensional shape that fixes the dispersion: lengths in R, speeds in √(E/ρ).
export const shapeOf = (g) => ({ rr: g.r / g.R, alpha: g.alpha, nu: g.nu });

// ---- Wittrick's helical rod -----------------------------------------------------------------------------
// For a wave e^{−iks} the strains are γ = (−ik + D×)u + t × θ (shear, shear, extension) and
// χ = (−ik + D×)θ (bending, bending, twist), with D = (0, κ, τ) the Darboux vector. Writing
// u = (y₁, i y₂, i y₃), θ = (y₄, i y₅, i y₆) makes every strain a real combination b·y (times 1 or i),
// so K = Σ Cᵢ bᵢ bᵢᵀ is real and symmetric. Nondimensional: R = 1, E = 1, ρ = 1.
export function rodConstants(shape) {
  const { rr, alpha, nu } = shape;
  const A = Math.PI * rr * rr, I = (Math.PI * rr ** 4) / 4, J = 2 * I, G = 1 / (2 * (1 + nu));
  return {
    kap: Math.cos(alpha) ** 2, tau: Math.sin(alpha) * Math.cos(alpha),
    C: [shearK(nu) * G * A, shearK(nu) * G * A, A, I, I, G * J], // ksGA, ksGA, EA, EI, EI, GJ
    M: [A, A, A, I, I, J],                                        // ρA ×3, ρI, ρI, ρJ
    A, I, J, G,
  };
}
// The strain rows bᵢ(k) = b0ᵢ + k·b1ᵢ (6 strains × 6 unknowns), into B0 and B1.
function strainRows(rc, B0, B1) {
  const { kap, tau } = rc;
  B0.fill(0); B1.fill(0);
  // γ_n = −k y₁ − τ y₂ + κ y₃ − y₅
  B1[0] = -1; B0[1] = -tau; B0[2] = kap; B0[4] = -1;
  // γ_b = τ y₁ + k y₂ + y₄
  B0[6] = tau; B1[7] = 1; B0[9] = 1;
  // γ_t = −κ y₁ + k y₃
  B0[12] = -kap; B1[14] = 1;
  // χ_n = −k y₄ − τ y₅ + κ y₆
  B1[21] = -1; B0[22] = -tau; B0[23] = kap;
  // χ_b = τ y₄ + k y₅
  B0[27] = tau; B1[28] = 1;
  // χ_t = −κ y₄ + k y₆
  B0[33] = -kap; B1[35] = 1;
}

// A reusable solver for one shape: solve(k) fills w (6 ascending ω), Y (6 × 6, column j = the
// M-orthonormal eigenvector of ω_j, row-major) and dw (dω/dk for each, by Hellmann–Feynman).
export function rodSolver(shape) {
  const rc = rodConstants(shape);
  const B0 = new Float64Array(36), B1 = new Float64Array(36), bk = new Float64Array(36);
  strainRows(rc, B0, B1);
  const sM = rc.M.map((m) => 1 / Math.sqrt(m));
  const Am = new Float64Array(36), V = new Float64Array(36), lam = new Float64Array(6), ord = [0, 1, 2, 3, 4, 5];
  // (solve reuses these arrays: copy what you keep)
  const w = new Float64Array(6), Y = new Float64Array(36), dw = new Float64Array(6);
  function solve(k) {
    for (let i = 0; i < 36; i++) bk[i] = B0[i] + k * B1[i];
    // A = M^(−½) K M^(−½), K = Σ Cᵢ bᵢ bᵢᵀ
    for (let a = 0; a < 6; a++) for (let b = a; b < 6; b++) {
      let s = 0;
      for (let i = 0; i < 6; i++) s += rc.C[i] * bk[i * 6 + a] * bk[i * 6 + b];
      Am[a * 6 + b] = Am[b * 6 + a] = s * sM[a] * sM[b];
    }
    jacobi6(Am, V, lam);
    for (let i = 0; i < 6; i++) ord[i] = i;
    ord.sort((a, b) => lam[a] - lam[b]);
    for (let j = 0; j < 6; j++) {
      const c = ord[j], l = Math.max(0, lam[c]);
      w[j] = Math.sqrt(l);
      for (let i = 0; i < 6; i++) Y[i * 6 + j] = V[i * 6 + c] * sM[i];
      // dω²/dk = yᵀ (dK/dk) y = 2 Σ Cᵢ (b1ᵢ·y)(bᵢ·y)
      let d = 0;
      for (let i = 0; i < 6; i++) {
        let p = 0, q = 0;
        for (let m = 0; m < 6; m++) { const y = Y[m * 6 + j]; p += B1[i * 6 + m] * y; q += bk[i * 6 + m] * y; }
        d += 2 * rc.C[i] * p * q;
      }
      dw[j] = w[j] > 0 ? d / (2 * w[j]) : 0;
    }
    return { w, Y, dw };
  }
  return { solve, rc, shape };
}

// Cyclic Jacobi for a symmetric 6 × 6 (row-major A, destroyed): eigenvalues in d, vectors in V's columns.
export function jacobi6(A, V, d) {
  const n = 6;
  V.fill(0);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0, diag = 0;
    for (let p = 0; p < n; p++) { diag += A[p * n + p] * A[p * n + p]; for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q]; }
    if (off <= 1e-30 * diag) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (apq === 0) continue;
      const app = A[p * n + p], aqq = A[q * n + q];
      if (Math.abs(apq) < 1e-18 * Math.sqrt(Math.abs(app * aqq)) ) { A[p * n + q] = A[q * n + p] = 0; continue; }
      const th = (aqq - app) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { // columns p, q
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) { // rows p, q
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k * n + p], vkq = V[k * n + q];
        V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
      }
    }
  }
  for (let i = 0; i < n; i++) d[i] = A[i * n + i];
}

// What a bead at the end moves. The bead sits on the spring's axis, clamped to the end of the wire
// by a short radial tail (length R, taken as rigid), so it moves as the wire's end section does,
// carried round to the axis: it turns with the section's rotation about the axis, θ_z, and slides
// along the axis by u_z + Rθ_φ (the tail's lever). A sideways sway of the coil moves the end of
// the wire without turning it, so the sway modes neither drive nor reach the bead (the bead's
// mount takes the sideways push). From an eigenvector: u_b = i y₂, u_t = i y₃, θ_b = i y₅, θ_t = i y₆,
// all of one phase, so all ∝ cos ks in a standing wave; R = 1.
export function beadShare(Y, j, alpha, drive) {
  const sa = Math.sin(alpha), ca = Math.cos(alpha);
  if (drive === 'axial') {
    const uz = Y[12 + j] * sa + Y[6 + j] * ca, thphi = Y[30 + j] * ca - Y[24 + j] * sa;
    return uz + thphi;
  }
  return Y[30 + j] * sa + Y[24 + j] * ca; // θ_z (× R = 1: the tangential travel of the tail's end)
}

// ---- the reduced (thin spring) model ---------------------------------------------------------------------
// The zero-helix-angle curved rod, in-plane: transverse u (toward the axis) and longitudinal v,
//   ρA u_tt = −EI (∂ₓ² + ε²)² u + EA ε (∂ₓv − εu),   ρA v_tt = EA ∂ₓ(∂ₓv − εu),   ε = 1/R.
// Plane waves give (ω² − κ²(k² − ε²)² − γ²ε²)(ω² − γ²k²) = γ⁴ε²k², κ² = EI/ρA, γ² = E/ρ:
// two roots ω² for each k; the lower is the flexural sheet that carries the chirps.
// Nondimensional (R = 1, E = ρ = 1): κ = r/2R.
export function reducedOmega(k, rr) {
  const kap = rr / 2, a = kap * kap * (k * k - 1) ** 2 + 1, d = k * k;
  const S = a + d, P = a * d - d;
  const q = Math.sqrt(Math.max(0, S * S - 4 * P));
  return [Math.sqrt(Math.max(0, (2 * P) / (S + q))), Math.sqrt((S + q) / 2)];
}
// Its low branch peaks (dω/dk = 0) at the transition: ω_C ≈ 0.3367 κε² at k ≈ 0.53ε (exact here).
export function reducedFc(rr) {
  let lo = 0.3, hi = 0.8;
  const f = (k) => reducedOmega(k, rr)[0];
  for (let i = 0; i < 80; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) lo = m1; else hi = m2; }
  const k = 0.5 * (lo + hi);
  return { k, w: f(k) };
}
// Parker & Bilbao's (2009) estimate, F_C ≈ 3r√(E/ρ) / (16√5 π R²): the low branch at k = ε/2.
export const fcParkerBilbao = (g) => (3 * g.r * Math.sqrt(g.E / g.rho)) / (16 * Math.sqrt(5) * Math.PI * g.R * g.R);

// ---- the slinky line ------------------------------------------------------------------------------------------
// At low frequency the spring is a uniform line: an axial force P and a torque M about the axis load
// each section of wire with a twisting moment M_t = M sin α + PR cos α, a bending moment
// M_b = M cos α − PR sin α, tension P sin α and shear P cos α. The strain energy gives the 2 × 2
// compliance per unit wire length (axial stretch and wind-up), the kinetic energy the mass and the
// moment of inertia; the two wave speeds along the wire are √ of the eigenvalues of (C M)⁻¹.
// Classical close-coiled limits (α = 0): c_axial = √(GJ/ρA)/R, c_rotation = √(EI/ρA)/R.
export function slinkyLine(shape) {
  const { alpha } = shape, rc = rodConstants(shape), ks = shearK(shape.nu);
  const s = Math.sin(alpha), c = Math.cos(alpha), GJ = rc.G * rc.J, EI = rc.I, EA = rc.A, kGA = ks * rc.G * rc.A;
  const Cpp = (c * c) / GJ + (s * s) / EI + (s * s) / EA + (c * c) / kGA; // R = 1
  const Cmm = (s * s) / GJ + (c * c) / EI;
  const Cpm = s * c * (1 / GJ - 1 / EI);
  const m = rc.A, Irot = rc.A + rc.J * s * s + rc.I * c * c;        // per unit length: ρA, ρAR² + ρ(J sin²α + I cos²α)
  // ω² = k² eig(M⁻¹ C⁻¹): with C⁻¹ = adj(C)/det
  const det = Cpp * Cmm - Cpm * Cpm;
  const a = Cmm / det / m, b = -Cpm / det / m, cc = -Cpm / det / Irot, d = Cpp / det / Irot;
  const tr = a + d, dd = a * d - b * cc, disc = Math.sqrt(Math.max(0, tr * tr / 4 - dd));
  const v1 = Math.sqrt(tr / 2 - disc), v2 = Math.sqrt(tr / 2 + disc);
  // which is the rotation wave: its eigenvector's wind-up share
  const rotShare = (v2sq) => { const x = b, y = v2sq - a; const nrm = Math.hypot(x, y) || 1; return Math.abs(y / nrm); };
  const r1 = rotShare(v1 * v1), r2 = rotShare(v2 * v2);
  return r2 >= r1 ? { axial: v1, rotation: v2 } : { axial: v2, rotation: v1 };
}

// ---- the drive's sheet: which of the two acoustic sheets a bead drives, and its low branch ----------------
// The two lowest sheets at each k. The one the transducers drive at low k (its bead share largest)
// carries the note; its peak below the rigid-body point k ≈ cos α/R is the transition, F_C.
export function driveSheet(solver, drive) {
  const { Y } = solver.solve(1e-3);
  const a = Math.abs(beadShare(Y, 0, solver.shape.alpha, drive)), b = Math.abs(beadShare(Y, 1, solver.shape.alpha, drive));
  return a > b ? 0 : 1;
}
export function transition(solver, drive) {
  const j = driveSheet(solver, drive), k0 = Math.cos(solver.shape.alpha);
  let best = 0, kb = 0;
  for (let i = 1; i <= 200; i++) { const k = (i / 200) * 0.95 * k0, w = solver.solve(k).w[j]; if (w > best) { best = w; kb = k; } }
  let lo = Math.max(1e-4, kb - 0.95 * k0 / 200), hi = kb + 0.95 * k0 / 200;
  for (let i = 0; i < 60; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (solver.solve(m1).w[j] < solver.solve(m2).w[j]) lo = m1; else hi = m2; }
  const k = 0.5 * (lo + hi);
  return { j, k, w: solver.solve(k).w[j] };
}

// Solvers are cached per shape (a handful of shapes are ever live at once).
const SOLVERS = new Map();
export function solverFor(shape) {
  const id = `${shape.rr.toFixed(9)}|${shape.alpha.toFixed(9)}|${shape.nu}`;
  let s = SOLVERS.get(id);
  if (!s) {
    if (SOLVERS.size > 16) SOLVERS.delete(SOLVERS.keys().next().value);
    s = rodSolver(shape); s.id = id; s.cache = new Map(); SOLVERS.set(id, s);
  }
  return s;
}

// ---- tuning: cut the wire so the key's note is the slowest round trip ----------------------------------------
// The lowest mode of the drive's sheet, k₁ = π/L, is set to the note: ω(π/L) = 2πf₀. Its echoes
// then repeat at the note (to within the dispersion of the lowest mode, a cent or two); the
// round trip at the low-frequency limit is T_D = 2L/c₀. Should the note lie above F_C there would
// be no low branch to tune, and the wire is cut by T_D = 1/f₀ instead (the knobs' ranges keep
// F_C above 2 f₀). The Slinky has its own rule: L ∝ f₀^(−1/2) from SLINKY.L at C4.
export function tuneSpring(key, P = {}, f0 = keyFreq(key)) {
  const g = geometry(key, P), shape = shapeOf(g), solver = solverFor(shape), drive = P.drive ?? 'rotation';
  const tid = `tune|${drive}`;
  let tr = solver.cache.get(tid);
  if (!tr) { tr = transition(solver, drive); tr.c0 = solver.solve(1e-4).w[tr.j] / 1e-4; solver.cache.set(tid, tr); }
  const scale = cE / g.R;                              // ω = ω̂·√(E/ρ)/R
  const wHat = (TAU * f0) / scale;
  let k1, onBranch = !g.slinky && wHat < 0.98 * tr.w;
  if (g.slinky) k1 = (Math.PI * g.R) / (SLINKY.L * 2 ** (-(key - SLINKY.key) / 24));
  else if (onBranch) {
    let lo = 0, hi = tr.k;
    for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (solver.solve(m).w[tr.j] < wHat) lo = m; else hi = m; }
    k1 = 0.5 * (lo + hi);
  } else k1 = wHat / tr.c0;
  const L = (Math.PI * g.R) / k1;                      // wire length
  const c0 = tr.c0 * cE;                               // low-frequency speed along the wire, m/s
  const turns = (L * Math.cos(g.alpha)) / (TAU * g.R);
  return {
    ...g, key, f0, L, turns, height: turns * TAU * g.R * Math.tan(g.alpha), mass: g.rho * Math.PI * g.r * g.r * L,
    c0, TD: (2 * L) / c0, Fc: (tr.w * scale) / TAU, kc: tr.k / g.R, sheet: tr.j, onBranch, solver, drive,
    fMax: g.slinky ? SLINKY.fMax : 18000,
  };
}

// ---- the modes of one spring ---------------------------------------------------------------------------------------
// k_n = nπ/L, n = 1, 2, …: the standing waves whose radial displacement vanishes at the ends
// (u_n ∝ sin ks) while the tangential and axial displacements (∝ cos ks) are free to move the beads.
// For each n both acoustic sheets give a mode. Driven at s = 0 and heard at s = L, mode n has weight
//   w_n = (2/L) d_n d'_n (−1)ⁿ
// (d the eigenvector's share along the bead's motion, M-normalised, so 2/L is the modal mass's
// reciprocal). Modes above fMax, or coupled less than wMin × a pure rotation wave, are left out.
export function springModes(sp, { fMax = 18000, fMin = 20, wMin = 1e-3 } = {}) {
  const { solver, R, L, alpha, drive } = sp, scale = cE / R, out = [], A = solver.rc.A;
  const wMaxHat = (TAU * fMax) / scale, wMinHat = (TAU * fMin) / scale;
  const k0 = Math.cos(alpha);
  for (let n = 1; n < 4000; n++) {
    const kh = (n * Math.PI * R) / L;
    const { w, Y, dw } = solver.solve(kh);
    if (w[0] > wMaxHat && kh > k0) break;
    for (let j = 0; j < 2; j++) {
      if (w[j] > wMaxHat || w[j] < wMinHat) continue;
      const d = beadShare(Y, j, alpha, drive);
      const wt = d * d; // drive and pickup alike; the sign (−1)ⁿ is applied below
      // rel: the coupling against a pure rotation (or axial) wave's, whose share is 1/A
      out.push({ n, j, k: kh / R, f: (w[j] * scale) / TAU, cg: dw[j] * cE, share: wt, rel: wt * A, w: (2 / L) * wt * (n % 2 ? -1 : 1) });
    }
  }
  return out.filter((m) => m.rel > wMin);
}

// ---- losses ----------------------------------------------------------------------------------------------------------------
// σ (1/s) of a mode at f with group speed c_g on a wire of length L:
//   viscous drag (oil or air):     σ = σ_oil (any frequency)
//   internal friction of the steel: σ = π f η
//   the beads at the ends:          a fraction lost at every reflection, so σ = (loss in nepers)·|c_g|/L,
//                                   slow where the group speed is slow: near F_C the chirps linger
export function modeSigma(f, cg, L, D) {
  const np = (D.endLoss * Math.LN10) / 20; // dB per reflection → nepers
  return D.oil + Math.PI * f * D.eta + (np * Math.abs(cg)) / L + (D.extra || 0);
}

// ---- the mallet ------------------------------------------------------------------------------------------------------------------
// A half-sine force pulse on the driving bead. Harder strikes are shorter (Hertz: τ ∝ v^(−1/5)).
export const pulseLength = (P, velocity) => (P.mallet / 1000) * (0.7 / Math.max(0.05, velocity)) ** 0.2;
export function pulseSpectrum(f, tau) {
  const u = 2 * f * tau;
  return Math.abs(u - 1) < 1e-6 ? Math.PI / 4 : Math.abs(Math.cos((Math.PI * u) / 2) / (1 - u * u));
}

// ---- springs in parallel -------------------------------------------------------------------------------------------------------
// 1–3 springs per key, neighbours cut the spread apart (in per cent of length): spring i is
// (1 + spread·o_i) long, o = ±½ for two springs and 0, +1, −1 for three, so their echoes drift
// apart and blur, centred on the note.
export const SPRING_OFFSETS = [[0], [0.5, -0.5], [0, 1, -1]];

// ---- group delay and the dispersion on a frequency axis -------------------------------------------------------------------------
// For the views and tests: every real wavenumber of the two acoustic sheets at each frequency, with
// its group delay L/c_g and its coupling to the beads. Scans k and keeps the sheet points.
export function dispersionCurve(sp, { kMax = null, fTop = null, n = 600 } = {}) {
  const { solver, R, alpha, drive } = sp, scale = cE / R;
  const kTop = kMax ?? (fTop ? kAbove(sp, fTop) : Math.max(1.6, sp.kc * R * 3.2));
  const pts = [[], []];
  for (let i = 1; i <= n; i++) {
    const kh = (i / n) * kTop, { w, Y, dw } = solver.solve(kh);
    for (let j = 0; j < 2; j++) {
      const d = beadShare(Y, j, alpha, drive);
      pts[j].push({ k: kh / R, f: (w[j] * scale) / TAU, cg: dw[j] * cE, share: d * d });
    }
  }
  return pts;
}

// The (nondimensional) wavenumber above the rigid-body point where both acoustic sheets pass f.
export function kAbove(sp, f) {
  const { solver, R, alpha } = sp, wHat = (TAU * f * R) / cE;
  let lo = Math.cos(alpha), hi = lo + 0.5;
  while (solver.solve(hi).w[0] < wHat && hi < 1e4) hi *= 1.5;
  for (let i = 0; i < 50; i++) { const m = 0.5 * (lo + hi); if (solver.solve(m).w[0] < wHat) lo = m; else hi = m; }
  return hi;
}

// The group delay of the low branch (below F_C) at frequency f, over one length of wire: L/c_g.
export function lowBranchDelay(sp, f) {
  const { solver, R } = sp, scale = cE / R, wHat = (TAU * f) / scale, j = sp.sheet, kc = sp.kc * R;
  let lo = 0, hi = kc;
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (solver.solve(m).w[j] < wHat) lo = m; else hi = m; }
  const kh = 0.5 * (lo + hi), cg = solver.solve(kh).dw[j] * cE;
  return { k: kh / R, cg, tau: sp.L / cg };
}

// ---- the pitch you hear: a virtual pitch ---------------------------------------------------------------------------------
// The dispersion packs a spring's overtones together on the way up to F_C (mode n sits at
// n·f₁(1 − 1.5(n/n_ε)²), n_ε = εL/π ≈ 48), so a struck spring sounds flatter than its lowest mode.
// Subharmonic summation (Hermes 1988), adapted from the Carillon's strike-note estimator: the partials
// a listener hears are laid as power on a log-frequency axis (96 points an octave, each a triangle
// ±50 ¢ wide, so a cluster of unresolved modes adds in power), weighted by the region where virtual
// pitch forms, W(f) = [1 + (f/2500)²]^(−½)·[1 + (300/f)²]^(−½), and compressed (amplitude^0.6, from
// 50 dB below the loudest); a candidate's pitch strength is the sum of the axis at f, 2f, … 15f,
// the k-th weighted 0.75^(k−1). The estimate is the strongest candidate within half an octave of
// the note: for the lowest keys the strongest of all lies an octave up (the weighting W(f) favours
// the second harmonic of a 65 Hz note), the usual octave ambiguity of the method.
export const SHS = { ppo: 96, harmonics: 15, compression: 0.75, fLo: 25, fHi: 5000, floorDb: -50, width: 4 };
export const pitchWeight = (f) => 1 / Math.sqrt((1 + (f / 2500) ** 2) * (1 + (300 / f) ** 2));
export function virtualPitch(partials, center, halfCents = 600) {
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
  if (!(pm > 0)) return { f: NaN, global: NaN, strength: 0 };
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
  // the strongest candidate in [a, b], refined by a parabola; edge: whether it sits on the range's edge
  const pick = (a, b) => {
    let bi = a;
    for (let i = a; i <= b; i++) if (curve[i] > curve[bi]) bi = i;
    let x = bi;
    if (bi > 0 && bi < m) { const A = curve[bi - 1], B = curve[bi], C = curve[bi + 1], d = A - 2 * B + C; if (d < 0) x = bi + (0.5 * (A - C)) / d; }
    return { f: 2 ** (lo + x / o.ppo), s: curve[bi], edge: bi === a || bi === b };
  };
  const all = pick(0, m), c = Math.round((Math.log2(center) - lo) * o.ppo), hw = Math.round((halfCents / 1200) * o.ppo);
  const near = pick(Math.max(0, c - hw), Math.min(m, c + hw));
  return { f: near.f, strength: near.s, edge: near.edge, global: all.f, curve, fLo: o.fLo, ppo: o.ppo };
}

// What a listener hears of a key's springs after an mf strike: every mode's amplitude at the pickup,
// with the mallet's spectrum, each bead's inertia and the springs' share of the force, averaged (in
// power) over the first HEAR seconds of its decay. Scaled by ρ (every frequency × ρ, length ÷ ρ).
export const HEAR = 0.4;      // s
export const MF = 0.7;        // the velocity the instrument is tuned at
export function heardPartials(springs, P, rho = 1) {
  const tau = pulseLength(P, MF), out = [];
  for (const sp of springs) {
    const fb = sp.f0 / (Math.PI * Math.max(1e-4, (P.bead ?? 1) / 100)), share = 1 / springs.length;
    for (let i = 0; i < sp.f.length; i++) {
      const f = sp.f[i] * rho, x = f / fb, sig = modeSigma(f, sp.cg[i], sp.L / rho, P), st = 2 * sig * HEAR;
      const a = (Math.abs(sp.rel[i]) * share * pulseSpectrum(f, tau)) / (1 + x * x);
      out.push({ f, a: a * Math.sqrt(st > 1e-9 ? (1 - Math.exp(-st)) / st : 1) });
    }
  }
  return out;
}

// ---- what the engine needs for a key ---------------------------------------------------------------------------------------
// What fixes a key's springs (their shape, and what the tuning listens to); anything else can change
// while they ring. A change applies from the next strike.
export const geometryId = (P) => `${P.family}|${P.coil}|${P.wire}|${P.helix}|${P.drive}|${P.springs}|${P.spread}|${P.mallet}|${P.bead}|${P.endLoss}|${P.eta}|${P.oil}`;

// A spring scaled in every dimension by 1/ρ: every mode, F_C and echo × ρ (the shape is unchanged).
// (sp.rho is the steel's density; the tuning's factor is kept as sp.scale.)
export const scaleSpring = (sp, rho) => ({
  ...sp, R: sp.R / rho, r: sp.r / rho, L: sp.L / rho, TD: sp.TD / rho, Fc: sp.Fc * rho, kc: sp.kc * rho,
  height: sp.height / rho, mass: sp.mass / rho ** 3, scale: rho,
});

// A key's springs, tuned, with their modes as plain arrays (the page builds these and sends them with
// the note, so the audio thread never solves an eigenproblem; the engine builds them itself in Node).
// Tuning: the lowest mode is first put on the note (tuneSpring), then the whole set of springs is
// scaled by ρ until the virtual pitch of what is heard lands on the note (a fixed point, a few
// rounds; the shape and its modes are only rescaled, never solved again). The Slinky, whose
// whistles have no steady pitch for the estimator to find, keeps ρ = 1 (its length rule).
export function keySprings(key, P, fs, wMin = 3e-3) {
  const nS = Math.max(1, Math.min(3, Math.round(P.springs ?? 1))), base = tuneSpring(key, P), raw = [];
  for (let s = 0; s < nS; s++) {
    const off = SPRING_OFFSETS[nS - 1][s] * ((P.spread ?? 0) / 100), sp = off ? { ...base, L: base.L * (1 + off), TD: base.TD * (1 + off) } : base;
    const modes = springModes(sp, { fMax: Math.min(sp.fMax, 0.45 * fs), wMin });
    raw.push({
      L: sp.L, f0: sp.f0, key, TD: sp.TD, Fc: sp.Fc, gain: sp.slinky ? SLINKY.gain : 1,
      f: Float64Array.from(modes, (m) => m.f), cg: Float64Array.from(modes, (m) => m.cg),
      rel: Float64Array.from(modes, (m) => m.rel * (m.n % 2 ? -1 : 1)), n: Int32Array.from(modes, (m) => m.n),
    });
  }
  // With springs in parallel each spring's series makes its own peak, ±spread apart: close together
  // they merge, far apart they are a chorus with no single pitch. So: the mean (in cents) of each
  // spring's own virtual pitch, then the peak of the whole set's that lies within 40 ¢ of it; if
  // the set has none there (springs far apart), the mean.
  const f0 = base.f0, est = (r) => {
    let c = 0, edge = false;
    for (const sp of raw) { const v = virtualPitch(heardPartials([sp], P, r), f0); c += Math.log2(v.f / f0) / raw.length; edge ||= !(v.f > 0) || v.edge; }
    const mean = f0 * 2 ** c;
    if (raw.length === 1 || edge) return { f: mean, edge, global: mean };
    const all = virtualPitch(heardPartials(raw, P, r), mean, 40);
    return all.edge || !(all.f > 0) ? { f: mean, edge, global: all.global } : { f: all.f, edge, global: all.global };
  };
  const before = est(1);
  let rho = 1, after = before;
  if (!base.slinky && before.f > 0 && !before.edge) {
    // a fixed point, ρ ← ρ·f₀/estimate; where the estimate jumps between neighbouring peaks (springs
    // far apart), a bisection between the closest settings either side of the note
    const tried = [{ rho: 1, e: cents(before.f, f0), v: before }];
    let best = tried[0];
    for (let it = 0, v = before; it < 6 && Math.abs(best.e) > 0.3; it++) {
      const next = rho * (f0 / v.f);
      if (!(next > 0.8 && next < 1.25)) break;
      rho = next; v = est(rho);
      if (!(v.f > 0) || v.edge) break;
      tried.push({ rho, e: cents(v.f, f0), v });
      if (Math.abs(tried[tried.length - 1].e) < Math.abs(best.e)) best = tried[tried.length - 1];
    }
    const below = tried.filter((t) => t.e < 0).sort((a, b) => b.e - a.e)[0], above = tried.filter((t) => t.e > 0).sort((a, b) => a.e - b.e)[0];
    if (Math.abs(best.e) > 0.5 && below && above) {
      let a = below, b = above;
      for (let it = 0; it < 10 && Math.abs(best.e) > 0.3; it++) {
        const r = Math.sqrt(a.rho * b.rho), v = est(r);
        if (!(v.f > 0) || v.edge) break;
        const t = { rho: r, e: cents(v.f, f0), v };
        if (Math.abs(t.e) < Math.abs(best.e)) best = t;
        if ((t.e < 0) === (a.e < 0)) a = t; else b = t;
      }
    }
    rho = best.rho; after = best.v;
  }
  const fMax = Math.min(base.fMax, 0.45 * fs);
  const springs = raw.map((sp) => {
    const keep = [];
    for (let i = 0; i < sp.f.length; i++) if (sp.f[i] * rho <= fMax) keep.push(i);
    return {
      ...sp, L: sp.L / rho, TD: sp.TD / rho, Fc: sp.Fc * rho,
      f: Float64Array.from(keep, (i) => sp.f[i] * rho), cg: Float64Array.from(keep, (i) => sp.cg[i]),
      rel: Float64Array.from(keep, (i) => sp.rel[i]), n: Int32Array.from(keep, (i) => sp.n[i]),
    };
  });
  return { id: geometryId(P), fs, rho, pitchBefore: before.f, pitch: after.f, global: after.global, springs };
}

// The first spring of a key as the instrument plays it: tuned, then scaled by its virtual-pitch ρ.
export function playedSpring(key, P, fs = 48000) {
  const d = keySprings(key, P, fs);
  return Object.assign(scaleSpring(tuneSpring(key, P), d.rho), { pitch: d.pitch, pitchBefore: d.pitchBefore, data: d });
}
