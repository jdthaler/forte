// pyrophone-model.js — the physics of one singing tube, kept free of audio and
// DOM so that the page, the engine, the tests and the render tool share it.
//
// Each key is a glass tube, open at both ends, with a flame at x_f (a fraction
// of the length, measured from the bottom). The model is the Galerkin model of
// a Rijke tube (Heckl 1990; Balasubramanian & Sujith 2008; Juniper 2011),
// nondimensionalised with the tube length L and the sound speed c, so that
// time is in units of L/c and every tube obeys the same equations:
//
//   ∂u/∂t + ∂p/∂x = 0
//   ∂p/∂t + ∂u/∂x + ζ p = q̇ δ(x − x_f)
//   q̇ = β [ √|1/3 + u_f(t − τ)| − √(1/3) ]          modified King's law (Heckl 1990)
//
// u is the acoustic velocity in units of the mean (draught) velocity, so the
// heat transfer reverses where u_f = −1/3. β is the heater gain in the
// normalisation of Magri & Juniper (2013); the linear gain is (√3/2)β. With
// open–open modes
//   u = Σ η_j cos(jπx),   p = −Σ (η̇_j / jπ) sin(jπx)
// projecting onto sin(jπx) gives one oscillator per mode,
//   η̈_j + ζ_j η̇_j + (jπ)² η_j = −2 jπ sin(jπ x_f) q̇,
// coupled only through the flame: u_f = Σ cos(jπ x_f) η_j.
//
// Damping (Matveev 2003, in the form of Juniper 2011): ζ_j = c₁ j² + c₂ √j,
// radiation from the open ends (∝ ω²) plus the viscous–thermal boundary layer
// on the wall (∝ √ω). Here c₁ and c₂ come from the tube's bore (see damping()).

export const N_MODES = 10;
export const B_MAX = 1.6;                                // top of the heater-gain range the model covers
export const T_HOT = 400;                                // K, mean gas temperature of a singing tube
export const C_HOT = 331.3 * Math.sqrt(T_HOT / 273.15);  // m/s, ≈ 401
const NU = 2.6e-5;                                       // m²/s, kinematic viscosity of air at 400 K
const KAPPA = 1 + 0.4 / Math.sqrt(0.7);                  // 1 + (γ−1)/√Pr = 1.48: viscous + thermal wall loss (Pr = 0.70)
const L_REF = 0.6;                                       // m, tube length at which c₂ is evaluated

const S3 = Math.sqrt(1 / 3);
export const GAIN = Math.sqrt(3) / 2; // d heat / du at u = 0
// The flame's heat release per unit β for a flame velocity u.
export const heat = (u) => Math.sqrt(Math.abs(1 / 3 + u)) - S3;

// Wall and end losses from the bore (radius/length a/L):
//   radiation: |R| ≈ 1 − (ka)²/2 per open end (Levine & Schwinger) → ζ_rad = (ka)² = (πa/L)² j²
//   boundary layer (Kirchhoff): σ = (κ/a)√(ων/2) → ζ_wall = κ (L/a) √(2πν / (c L)) √j
export function damping(P) {
  const ar = P.bore, s = P.damp ?? 1;
  return { c1: s * (Math.PI * ar) ** 2, c2: (s * KAPPA * Math.sqrt((2 * Math.PI * NU) / (C_HOT * L_REF))) / ar };
}

// The nondimensional tube: mode frequencies w_j = jπ, damping, and the flame's
// coupling to each mode (cf = cos(jπx_f) reads u_f; g = −2jπ sin(jπx_f) drives it).
// Pass { c1, c2 } in P to set the damping directly (as the papers do).
export function tube(P, N = N_MODES) {
  const { c1, c2 } = P.c1 !== undefined ? P : damping(P);
  const w = [], zeta = [], cf = [], g = [];
  for (let j = 1; j <= N; j++) {
    const wj = j * Math.PI;
    w.push(wj); zeta.push(c1 * j * j + c2 * Math.sqrt(j));
    cf.push(Math.cos(wj * P.xf)); g.push(-2 * wj * Math.sin(wj * P.xf));
  }
  return { N, w, zeta, cf, g, tau: P.lag, xf: P.xf, c1, c2 };
}

// ---- complex helpers ([re, im] pairs) ---------------------------------------
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cexp = (a) => { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; };
const poly = (sys, j, s) => [s[0] * s[0] - s[1] * s[1] + sys.zeta[j] * s[0] + sys.w[j] * sys.w[j], 2 * s[0] * s[1] + sys.zeta[j] * s[1]];

// Flame-to-flame transfer function: u_f = G(s) q̇ (q̇ released at the flame).
export function transfer(sys, s) {
  let re = 0, im = 0;
  for (let j = 0; j < sys.N; j++) { const r = cdiv([sys.cf[j] * sys.g[j], 0], poly(sys, j, s)); re += r[0]; im += r[1]; }
  return [re, im];
}

// ---- linear stability ------------------------------------------------------
// Small perturbations ∝ e^{st} obey 1 = (√3/2) β e^{−sτ} G(s). Multiplying by
// mode m's own denominator P_m(s) gives a function that is regular near it,
//   F_m(s) = P_m(s) − (√3/2) β e^{−sτ} [cf_m g_m + P_m(s) Σ_{j≠m} cf_j g_j / P_j(s)],
// whose root we follow by Newton continuation from β = 0, where s = −ζ_m/2 + iω_d.
// lagMode 'taylor' replaces e^{−sτ} by 1 − sτ (the linearisation Magri & Juniper use).
function charF(sys, m, beta, s, lagMode) {
  const Pm = poly(sys, m, s), sum = [sys.cf[m] * sys.g[m], 0];
  for (let j = 0; j < sys.N; j++) if (j !== m) { const r = cmul(Pm, cdiv([sys.cf[j] * sys.g[j], 0], poly(sys, j, s))); sum[0] += r[0]; sum[1] += r[1]; }
  const lag = lagMode === 'taylor' ? [1 - s[0] * sys.tau, -s[1] * sys.tau] : cexp([-s[0] * sys.tau, -s[1] * sys.tau]);
  const t = cmul(lag, sum);
  return [Pm[0] - GAIN * beta * t[0], Pm[1] - GAIN * beta * t[1]];
}
function newton(f, s0) {
  let s = s0;
  for (let it = 0; it < 40; it++) {
    const F = f(s), h = 1e-7, Fh = f([s[0] + h, s[1]]);
    const d = cdiv(F, [(Fh[0] - F[0]) / h, (Fh[1] - F[1]) / h]);
    s = [s[0] - d[0], s[1] - d[1]];
    if (Math.hypot(d[0], d[1]) < 1e-12) break;
  }
  return s;
}
// Eigenvalue of mode m (0-based) at heater gain beta: [growth rate, angular frequency].
export function root(sys, m, beta, lagMode) {
  const z = sys.zeta[m], w = sys.w[m];
  let s = [-z / 2, Math.sqrt(Math.max(w * w - z * z / 4, 1e-9))];
  const steps = Math.max(1, Math.ceil(Math.abs(beta) / 0.02));
  for (let k = 1; k <= steps; k++) s = newton((x) => charF(sys, m, (beta * k) / steps, x, lagMode), s);
  return s;
}

// Hopf point of mode m: the smallest β (up to bMax) at which its growth rate
// crosses zero, found by marching the root in β and refining by regula falsi.
export function hopf(sys, m, bMax = B_MAX) {
  const z = sys.zeta[m], w = sys.w[m], db = 0.02;
  let s = [-z / 2, Math.sqrt(w * w - z * z / 4)], b = 0;
  while (b < bMax) {
    const s1 = newton((x) => charF(sys, m, b + db, x), s);
    if (s1[0] >= 0) {
      let lo = b, hi = b + db, slo = s, shi = s1;
      for (let it = 0; it < 60 && hi - lo > 1e-12; it++) {
        const mid = lo + ((hi - lo) * -slo[0]) / (shi[0] - slo[0]);
        const sm = newton((x) => charF(sys, m, mid, x), slo);
        if (Math.abs(sm[0]) < 1e-13) { lo = mid; slo = sm; break; }
        if (sm[0] < 0) { lo = mid; slo = sm; } else { hi = mid; shi = sm; }
      }
      return { mode: m + 1, beta: lo, W: slo[1] };
    }
    s = s1; b += db;
  }
  return null;
}

// Weak-coupling (single-mode, first-order) growth rate and frequency:
//   s ≈ −ζ_j/2 + (√3/4) β sin(2jπx_f) [sin(jπτ) + i cos(jπτ)] + i jπ
// Rayleigh's criterion in one line: mode j is driven where sin(2jπx_f)·sin(jπτ) > 0.
export function weakRoot(P, j, beta) {
  const sys = tube(P), z = sys.zeta[j - 1], w = j * Math.PI, r = (GAIN / 2) * beta * Math.sin(2 * w * P.xf);
  return [-z / 2 + r * Math.sin(w * P.lag), w + r * Math.cos(w * P.lag)];
}

// ---- describing function (single mode, first harmonic) -----------------------
// For u_f = U cos θ, the first harmonic of the heat release relative to the
// linear one: D(U) = (1/πU) ∫ heat(U cos θ) cos θ dθ / (√3/2). D = 1 + (27/32)U² + …
// for small U: it RISES, which is what makes the Hopf bifurcation subcritical.
// It peaks (1.198) at U = 1/3, where the heat transfer first reverses, then falls.
export function describing(U, M = 2048) {
  if (U < 1e-9) return 1;
  let s = 0;
  for (let i = 0; i < M; i++) { const th = ((i + 0.5) * 2 * Math.PI) / M; s += heat(U * Math.cos(th)) * Math.cos(th); }
  return (2 * s) / (M * U * GAIN);
}

// ---- limit cycles by harmonic balance ----------------------------------------
// A periodic orbit u_f(t) = U₀ + Σ_h 2 Re(U_h e^{ihWt}) must reproduce itself
// through the flame and the tube: U_h = β e^{−ihWτ} G(ihW) Ĥ_h, where Ĥ_h are the
// harmonics of heat(u_f(t)). We fix the first-harmonic amplitude A = 2|U₁| (real
// phase) and solve for W, β, U₀ and U₂…U_H by Newton, then continue in A. This
// is the multi-mode, multi-harmonic version of the describing function above.
function solveDense(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]];
    const piv = A[k][k] || 1e-300;
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / piv;
      if (f) { for (let j = k; j < n; j++) A[i][j] -= f * A[k][j]; b[i] -= f * b[k]; }
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / (A[i][i] || 1e-300); }
  return x;
}

export function hbSolver(sys, H = 12, M = 64) {
  const cosT = [], sinT = [];
  for (let h = 0; h <= H; h++) {
    cosT.push(new Float64Array(M)); sinT.push(new Float64Array(M));
    for (let m = 0; m < M; m++) { cosT[h][m] = Math.cos((2 * Math.PI * h * m) / M); sinT[h][m] = Math.sin((2 * Math.PI * h * m) / M); }
  }
  const q = new Float64Array(M), Hq = [];
  for (let h = 0; h <= H; h++) Hq.push([0, 0]);
  function harmonics(x, A) { // Ĥ_h, h = 0…H, of heat(u_f) for the orbit x
    for (let m = 0; m < M; m++) {
      let v = x[2] + A * cosT[1][m];
      for (let h = 2; h <= H; h++) v += x[2 * h - 1] * cosT[h][m] + x[2 * h] * sinT[h][m];
      q[m] = heat(v);
    }
    for (let h = 0; h <= H; h++) {
      let re = 0, im = 0;
      for (let m = 0; m < M; m++) { re += q[m] * cosT[h][m]; im -= q[m] * sinT[h][m]; }
      Hq[h][0] = re / M; Hq[h][1] = im / M;
    }
    return Hq;
  }
  // x = [W, β, U₀, a₂, b₂, …, a_H, b_H] with u_f = U₀ + A cos θ + Σ (a_h cos hθ + b_h sin hθ)
  function residual(x, A) {
    const W = x[0], beta = x[1], r = new Array(x.length);
    harmonics(x, A);
    for (let h = 0; h <= H; h++) {
      const G = transfer(sys, [0, h * W]), lag = [Math.cos(h * W * sys.tau), -Math.sin(h * W * sys.tau)];
      const P = cmul(cmul(G, lag), [beta * Hq[h][0], beta * Hq[h][1]]); // predicted U_h
      if (h === 0) r[2] = x[2] - P[0];
      else if (h === 1) { const rel = cdiv(P, [A / 2, 0]); r[0] = 1 - rel[0]; r[1] = -rel[1]; }
      else { r[2 * h - 1] = x[2 * h - 1] - 2 * P[0]; r[2 * h] = x[2 * h] + 2 * P[1]; } // U_h = (a − ib)/2
    }
    return r;
  }
  function jacobian(x, A, r) {
    const n = x.length, J = [];
    for (let i = 0; i < n; i++) J.push(new Array(n));
    for (let k = 0; k < n; k++) {
      const e = 1e-7 * Math.max(1, Math.abs(x[k])), xk = x.slice(); xk[k] += e;
      const rk = residual(xk, A);
      for (let i = 0; i < n; i++) J[i][k] = (rk[i] - r[i]) / e;
    }
    return J;
  }
  function solve(x0, A) {
    const x = x0.slice();
    for (let it = 0; it < 25; it++) {
      const r = residual(x, A), d = solveDense(jacobian(x, A, r), r.map((v) => -v));
      let nd = 0;
      for (let k = 0; k < x.length; k++) { x[k] += d[k]; nd = Math.max(nd, Math.abs(d[k])); }
      if (!x.every(Number.isFinite)) return null;
      if (nd < 1e-10) return x;
    }
    return Math.max(...residual(x, A).map(Math.abs)) < 1e-7 ? x : null;
  }
  return { residual, solve, harmonics: (x, A) => harmonics(x, A).map((c) => c.slice()), H, M };
}

// Complex amplitude of mode j (0-based) at harmonic h of an orbit with frequency
// W, gain beta and heat-release harmonic Hh: η_{j,h} = g_j β e^{−ihWτ} Ĥ_h / P_j(ihW).
export function modeAmp(sys, j, h, W, beta, Hh) {
  const w = h * W, lag = [Math.cos(w * sys.tau), -Math.sin(w * sys.tau)];
  return cdiv(cmul(lag, [sys.g[j] * beta * Hh[0], sys.g[j] * beta * Hh[1]]), [sys.w[j] * sys.w[j] - w * w, w * sys.zeta[j]]);
}

// The branch of periodic orbits born at mode m's Hopf point, continued in the
// flame-velocity amplitude A until β leaves (0, bMax]. Each point: { A, beta,
// W, U0, y, x, Hq } with y = the family's own mode's amplitude at the flame,
// |cos mπx_f|·|η_m|, the quantity the engine reports. Stability within the family: stable where β
// rises with A, unstable where it falls; the turning point between is the fold.
export function branch(sys, m, { aMax = 1.6, bMax = B_MAX, H = 12, M = 64, steps = 40 } = {}) {
  const hp = hopf(sys, m, bMax);
  if (!hp) return null;
  const hb = hbSolver(sys, H, M), pts = [];
  let x = new Array(2 * H + 1).fill(0);
  x[0] = hp.W; x[1] = hp.beta;
  const A0 = 0.01;
  for (let k = 0; k <= steps; k++) {
    const A = A0 * (aMax / A0) ** (k / steps);
    let guess = x;
    if (pts.length > 1) { // secant predictor in log A
      const a = pts[pts.length - 2], b = pts[pts.length - 1], t = Math.log(A / b.A) / Math.log(b.A / a.A);
      guess = b.x.map((v, i) => v + t * (v - a.x[i]));
    }
    const sol = hb.solve(guess, A) || hb.solve(x, A);
    if (!sol || sol[1] <= 0 || sol[1] > bMax) break;
    x = sol;
    const Hq = hb.harmonics(x, A), e = modeAmp(sys, m, 1, x[0], x[1], Hq[1]);
    pts.push({ A, beta: x[1], W: x[0], U0: x[2], y: 2 * Math.abs(sys.cf[m]) * Math.hypot(e[0], e[1]), x: x.slice(), Hq });
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    pts[i].stable = b.beta > a.beta;
  }
  let lo = null;
  for (const p of pts) if (!lo || p.beta < lo.beta) lo = p;
  const fold = lo && lo !== pts[0] && lo !== pts[pts.length - 1] ? { beta: lo.beta, A: lo.A, y: lo.y } : null;
  return { mode: m + 1, hopf: hp, pts, H, fold };
}

// The stable orbit of a family at exactly gain beta: bracket it between two
// branch points, then adjust A by secant until the harmonic balance gives beta.
export function orbitAt(sys, fam, beta, H = fam.H, M = 64) {
  const st = stablePts(fam);
  if (st.length < 2 || beta < st[0].beta) return null;
  let i = st.findIndex((p) => p.beta >= beta);
  if (i < 0) return null;
  if (i === 0) i = 1;
  const hb = hbSolver(sys, H, M);
  let a = { ...st[i - 1], f: st[i - 1].beta - beta }, b = { ...st[i], f: st[i].beta - beta }, x = a.x, A = a.A, side = 0;
  // Illinois regula falsi in log A, to 0.1 % in β: the collocated |·| in King's law
  // makes β(A) very slightly stepped at the 1e-3 level.
  for (let it = 0; it < 16 && Math.abs(b.A - a.A) > 1e-10; it++) {
    A = Math.exp((Math.log(a.A) * b.f - Math.log(b.A) * a.f) / (b.f - a.f));
    const near = Math.abs(Math.log(A / a.A)) < Math.abs(Math.log(A / b.A)) ? a : b;
    const sol = hb.solve(near.x, A) || hb.solve((near === a ? b : a).x, A);
    if (!sol) break;
    x = sol;
    const f = x[1] - beta;
    if (Math.abs(f) < 1e-3 * beta) break;
    if (f < 0) { a = { A, f, x }; if (side === -1) b.f /= 2; side = -1; } else { b = { A, f, x }; if (side === 1) a.f /= 2; side = 1; }
  }
  const Hq = hb.harmonics(x, A), m = fam.mode - 1, e = modeAmp(sys, m, 1, x[0], x[1], Hq[1]);
  return { A, beta: x[1], W: x[0], U0: x[2], y: 2 * Math.abs(sys.cf[m]) * Math.hypot(e[0], e[1]), x, Hq, stable: true };
}

// The radiated spectrum of a periodic orbit, harmonic by harmonic:
// |Σ_j wo_j · ihW η_{j,h}| for h = 1…H, with the engine's listening weights wo_j.
export const listenWeight = (j, listen) => ((j % 2 ? 1 : -1) - listen) / (1 + listen); // j 0-based
export function orbitSpectrum(sys, pt, listen) {
  const out = [];
  for (let h = 1; h < pt.Hq.length; h++) {
    let re = 0, im = 0;
    for (let j = 0; j < sys.N; j++) {
      const e = modeAmp(sys, j, h, pt.W, pt.beta, pt.Hq[h]), wo = listenWeight(j, listen) * h * pt.W;
      re -= wo * e[1]; im += wo * e[0];
    }
    out.push(2 * Math.hypot(re, im));
  }
  return out;
}

// Everything the views and the tuning need for the current parameters: the
// Hopf points and limit-cycle branches of modes 1 and 2 (each with its fold).
export function bifurcation(P, opts = {}) {
  const sys = tube(P);
  return { sys, key: tubeKey(P), fam: [0, 1].map((m) => branch(sys, m, opts)) };
}
export const tubeKey = (P) => `${P.bore}|${P.damp ?? 1}|${P.xf}|${P.lag}`;

const interp = (pts, beta, k) => {
  if (beta <= pts[0].beta) return pts[0][k];
  for (let i = 1; i < pts.length; i++) if (pts[i].beta >= beta) { const a = pts[i - 1], c = pts[i]; return a[k] + ((beta - a.beta) / (c.beta - a.beta)) * (c[k] - a[k]); }
  return pts[pts.length - 1][k];
};
// A family's stable points: from the fold (subcritical) or the Hopf point (supercritical) up.
const stablePts = (f) => (f ? f.pts.filter((p) => p.stable && p.beta >= (f.fold ? f.fold.beta : f.hopf.beta)) : []);

// The tuning table, on a grid of β: the angular frequency (units of c/L) per
// harmonic number at which a tube speaks in steady state. A tube sings in the
// mode j that breaks silence first (mode 1 unless the flame sits where Rayleigh
// favours another); the auto-tuner cuts it so that mode j's limit cycle (or, where
// it has none, its linear frequency) sounds exactly j × the key's frequency.
export function tuning(P, bif = bifurcation(P)) {
  const n = 41, db = B_MAX / (n - 1), sys = bif.sys, first = silenceLimit(sys), j = first.mode || 1;
  const fam = bif.fam[j - 1], st = stablePts(fam), Ws = [];
  let s = root(sys, j - 1, 0);
  for (let i = 0; i < n; i++) {
    const beta = i * db;
    s = newton((x) => charF(sys, j - 1, beta, x), s);
    Ws.push((st.length && beta >= st[0].beta ? interp(st, beta, 'W') : s[1]) / j);
  }
  return { key: bif.key, b0: 0, db, Ws, betaH: first.beta, mode: first.mode, fold: fam && fam.fold && first.mode ? fam.fold.beta : null };
}

// The heater gain at which silence first goes unstable, and in which mode (the
// lowest Hopf point over all modes; usually mode 1). Modes that the weak-coupling
// formula shows to be far from driven anywhere below B_MAX are skipped.
export function silenceLimit(sys) {
  let best = { beta: B_MAX, mode: 0 };
  for (let m = 0; m < sys.N; m++) {
    const j = m + 1, drive = (GAIN / 2) * B_MAX * Math.sin(2 * j * Math.PI * sys.xf) * Math.sin(j * Math.PI * sys.tau);
    if (drive < 0.7 * (sys.zeta[m] / 2)) continue;
    const h = hopf(sys, m, best.beta);
    if (h && h.beta < best.beta) best = { beta: h.beta, mode: j };
  }
  return best;
}

// Steady mode-1 amplitude at the flame on mode 1's stable branch (0 below the fold).
export function steadyY(bif, beta) {
  const st = stablePts(bif.fam[0]);
  return st.length && beta >= st[0].beta ? interp(st, beta, 'y') : 0;
}

// Heater gain for a key pressed at velocity v: the key parts the flames,
// β = K (0.4 + 0.6 v). Key up: β = (key-up fraction) × the Hopf threshold.
export const betaOn = (P, v) => P.power * (0.4 + 0.6 * v);
