// arc-model.js — the physics of Duddell's singing arc: pure functions, no DOM, no audio.
//
// The arc. Its static characteristic is Ayrton's falling curve for solid carbons,
//   V(I) = A + B/I,   A = a + b·l,   B = c + d·l   (l = gap in mm, I in A),
// and its dynamics are Mayr's: the column's conductance g follows the power put into it
// with a thermal time constant τ,
//   (1/g) dg/dt = (1/τ) (u·i / P(g) − 1),
// with the heat loss P(g) chosen so that the static limit is Ayrton's curve. Written in
// terms of the "thermal current" X (the steady current at which the column would have
// this conductance: g = X²/(A·X + B), P = A·X + B), Mayr's law becomes
//   dX/dt = (w(X)/τ) (i² − X²)/X,   w(X) = (A·X + B)/(A·X + 2B),
// so X relaxes towards |i|. The white-hot carbons keep the gap conducting when the column
// collapses: the conductance never falls below that of a floor current X_m, set by the
// re-strike voltage U_r = A + B/X_m (the peak of the static curve, where the arc re-strikes).
//
// The circuit (Duddell's): a DC supply E through a rheostat R_b and a choke L_b feeds the
// arc; across the arc, a fixed coil L (resistance R) in series with the capacitors the keys
// switch in. The arc's small-signal impedance is
//   Z(s) = R₀ − K·2w/(sτ + 2w),   K = I₀R₀ (ln g)'(I₀)   (K = R₀/w for Ayrton's curve),
// negative at low frequency (R_d = −B/I₀²), inductive (it pulls the note flat), and
// positive above ωτ = 2w√(K/R₀ − 1): the arc's upper limit.
//
// The sound: the column expands with the heat put into it, so it radiates as a small
// thermophone, p(r, t) = (γ − 1)/(4π c² r) · dP/dt, with P = u·i.

export const TAU = 2 * Math.PI;
export const KEY_LO = 48, KEY_HI = 84; // C3–C6
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Ayrton's constants for solid carbons (positive 11 mm, negative 9 mm), V = a + b·l + (c + d·l)/I.
export const AYRTON = { a: 38.88, b: 2.074, c: 11.66, d: 10.54 }; // V, V/mm, W (V·A), W/mm
// The supply: 220 V DC mains through a rheostat (set for the arc current) and a large choke.
export const SUPPLY = { E: 220, Lb: 0.5 };
// Air at 20 °C, for the thermophone.
export const AIR = { gamma: 1.4, c: 343, T: 293.15, cp: 1005, rho: 1.204 };
// Talking arc (Simon): the microphone transformer's secondary and its blocking condenser.
export const TALK = { L: 0.5e-3, R: 6, C: 100e-6 };
// Hissing current (the model's choice): grows with the gap, as Ayrton found.
export const HISS = { I0: 2.5, perMm: 1.5, width: 0.25 };
export const FLOOR_SHARP = 0.05; // smooth-max corner of the floor, × X_m

export const ayrtonAB = (l) => ({ A: AYRTON.a + AYRTON.b * l, B: AYRTON.c + AYRTON.d * l });
export const ayrtonV = (I, l) => { const { A, B } = ayrtonAB(l); return A + B / I; };

// ---- the arc --------------------------------------------------------------------------

// Operating point and constants for a parameter set (current A, gap mm, tau µs, restrike × U₀).
export function arcOp(P) {
  const I0 = P.current, l = P.gap, { A, B } = ayrtonAB(l), tau = P.tau * 1e-6;
  const V0 = A + B / I0, Ur = P.restrike * V0, Xm = B / (Ur - A);
  const op = { I0, l, A, B, tau, V0, Ur, Xm, delta: FLOOR_SHARP * Xm };
  const G0 = cond(I0, op);
  op.G0 = G0; op.u0 = I0 / G0; op.R0 = 1 / G0;
  op.w = wOf(I0, op);
  op.K = I0 * op.R0 * dlnG(I0, op);
  op.Rd = op.R0 - op.K;                  // static differential resistance (−B/I₀² above the floor)
  op.kappa = 2 * op.w - 1;               // = A·I₀/(A·I₀ + 2B)
  op.Larc = (op.K * tau) / (2 * op.w);   // the arc's low-frequency series inductance
  op.Rb = (SUPPLY.E - op.u0) / I0;       // rheostat for this current
  return op;
}
// The floor: the conductance uses Xe = smooth max(X, X_m).
export function xEff(X, op) { const d = X - op.Xm; return 0.5 * (X + op.Xm + Math.sqrt(d * d + op.delta * op.delta)); }
export function cond(X, op) { const Xe = xEff(X, op); return (Xe * Xe) / (op.A * Xe + op.B); }
export function dlnG(X, op) {
  const d = X - op.Xm, r = Math.sqrt(d * d + op.delta * op.delta), Xe = 0.5 * (X + op.Xm + r), dXe = 0.5 * (1 + d / r);
  return (dXe * (op.A * Xe + 2 * op.B)) / (Xe * (op.A * Xe + op.B));
}
export const wOf = (X, op) => (op.A * X + op.B) / (op.A * X + 2 * op.B);
// Mayr's law in the thermal current: dX/dt = F(X, i), and its partial derivatives.
export function flow(X, i, op) { return (wOf(X, op) / op.tau) * ((i * i - X * X) / X); }
export function flowDX(X, i, op) {
  const { A, B } = op, w = wOf(X, op), dw = (A * B) / ((A * X + 2 * B) ** 2);
  return (dw * ((i * i - X * X) / X) - w * ((i * i) / (X * X) + 1)) / op.tau;
}
export const flowDi = (X, i, op) => (wOf(X, op) / op.tau) * ((2 * i) / X);
// Static characteristic (X = |i|): the voltage of a steady arc.
export const staticV = (I, op) => I / cond(Math.abs(I), op);

// Small-signal impedance Z(jω) (complex [re, im]), analytic.
export function zArc(omega, op) {
  const a = 2 * op.w, b = omega * op.tau, den = a * a + b * b;
  return [op.R0 - (op.K * a * a) / den, (op.K * a * b) / den];
}
// The same by a numerical linearisation of the arc's equations (finite differences).
export function zArcNumeric(omega, op) {
  const I = op.I0, X = op.I0, e = 1e-6 * I;
  const u = (x, i) => i / cond(x, op);
  const ux = (u(X + e, I) - u(X - e, I)) / (2 * e), ui = (u(X, I + e) - u(X, I - e)) / (2 * e);
  const Fx = (flow(X + e, I, op) - flow(X - e, I, op)) / (2 * e), Fi = (flow(X, I + e, op) - flow(X, I - e, op)) / (2 * e);
  // δX = Fi δi / (jω − Fx);  Z = ui + ux · Fi / (jω − Fx)
  const dr = -Fx, di = omega, den = dr * dr + di * di;
  return [ui + (ux * Fi * dr) / den, (-ux * Fi * di) / den];
}
// Where the arc stops looking negative: Re Z(jω) = 0.
export const negLimit = (op) => (op.K > op.R0 ? (2 * op.w * Math.sqrt(op.K / op.R0 - 1)) / op.tau : 0);

// ---- complex helpers ------------------------------------------------------------------
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const pmul = (p, q) => { const r = new Array(p.length + q.length - 1).fill(0); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] += a * b; })); return r; };
const padd = (p, q) => { const n = Math.max(p.length, q.length), r = new Array(n).fill(0); for (let i = 0; i < n; i++) r[i] = (p[i] || 0) + (q[i] || 0); return r; };

// Complex roots of a real polynomial (coefficients low → high), Durand–Kerner.
export function polyRoots(c) {
  const n = c.length - 1, lead = c[n], a = c.map((x) => x / lead);
  const ev = (z) => { let r = [1, 0]; for (let k = n - 1; k >= 0; k--) r = cadd(cmul(r, z), [a[k], 0]); return r; };
  let z = Array.from({ length: n }, (_, k) => { const ph = 0.4 + (TAU * k) / n, m = 1 + Math.max(...a.slice(0, n).map(Math.abs)) ** (1 / n); return [m * Math.cos(ph), m * Math.sin(ph)]; });
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let d = [1, 0];
      z.forEach((zj, j) => { if (j !== i) d = cmul(d, [zi[0] - zj[0], zi[1] - zj[1]]); });
      const step = cdiv(ev(zi), d);
      moved = Math.max(moved, Math.hypot(step[0], step[1]) / (1 + Math.hypot(zi[0], zi[1])));
      return [zi[0] - step[0], zi[1] - step[1]];
    });
    if (moved < 1e-14) break;
  }
  return z;
}

// ---- the circuit: linear analysis -----------------------------------------------------

// Circuit constants for a parameter set (and a capacitance C in the musical branch).
export function circuit(P, C, op = arcOp(P)) {
  const talk = P.mode === 'talk';
  return { op, C, L: talk ? TALK.L : P.coil * 1e-3, R: talk ? TALK.R : P.coilR, Lb: SUPPLY.Lb, Rb: op.Rb };
}
// Characteristic equation of the whole circuit, 1 + Z_arc(s)·(Y_supply + Y_LC) = 0, as a
// quartic in σ = s/ω₀ (ω₀ = 1/√(LC)): the musical mode, the arc's thermal mode, and the
// choke's slow mode. Returns all roots (in rad/s) and the musical one.
export function linearAnalysis(ckt) {
  const { op, C, L, R, Lb, Rb } = ckt, w0 = 1 / Math.sqrt(L * C), tw = op.tau * w0, a = 2 * op.w;
  const Da = [a, tw], Na = [a * op.R0 - a * op.K, op.R0 * tw];
  const Zb = [Rb, Lb * w0], Nlc = [1, R * C * w0, 1], sC = [0, C * w0];
  const poly = padd(pmul(pmul(Da, Zb), Nlc), pmul(Na, padd(Nlc, pmul(sC, Zb))));
  const roots = polyRoots(poly).map(([re, im]) => [re * w0, im * w0]);
  let s = roots[0];
  for (const r of roots) if (r[1] > s[1]) s = r;
  return { s, sigma: s[0], f: s[1] / TAU, fLC: w0 / TAU, roots, poly, w0 };
}
// The same eigenvalues from the circuit's state matrix (an independent check):
// state [i_s, i_c, v_C, X], linearised about the DC operating point.
export function stateMatrix(ckt) {
  const { op, C, L, R, Lb, Rb } = ckt;
  // u = (i_s − i_c)/g(X):  ∂u/∂i_s = R₀, ∂u/∂i_c = −R₀, ∂u/∂X = −I₀ R₀ (ln g)'
  const ux = -op.I0 * op.R0 * dlnG(op.I0, op), Fi = flowDi(op.I0, op.I0, op), Fx = flowDX(op.I0, op.I0, op);
  return [
    [(-Rb - op.R0) / Lb, op.R0 / Lb, 0, -ux / Lb],
    [op.R0 / L, (-R - op.R0) / L, -1 / L, ux / L],
    [0, 1 / C, 0, 0],
    [Fi, -Fi, 0, Fx],
  ];
}

// Growth rate (1/s) and frequency (Hz) of the note a capacitance C starts.
export const startOf = (P, C) => linearAnalysis(circuit(P, C));
// Kelvin's formula, the LC frequency.
export const kelvinC = (f, L) => 1 / ((TAU * f) ** 2 * L);
// Coil resistance at which the musical mode is on the edge of growing (Re s = 0).
export function thresholdR(P, C) {
  const g = (R) => linearAnalysis(circuit({ ...P, coilR: R }, C)).sigma;
  let lo = 0, hi = 50;
  if (g(lo) <= 0) return 0;
  if (g(hi) > 0) return hi;
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}
// The arc current above which a note on capacitance C no longer starts (|R_d| = B/I² falls
// with current): the highest current at which the musical mode still grows.
export function thresholdCurrent(P, C) {
  const g = (I) => linearAnalysis(circuit({ ...P, current: I }, C)).sigma;
  let lo = 0, hi = 0, prev = g(1);
  for (let k = 1; k <= 48; k++) { const I = 1 * 60 ** (k / 48), v = g(I); if (prev > 0 && v <= 0) { lo = 60 ** ((k - 1) / 48); hi = I; } prev = v; }
  if (!hi) return prev > 0 ? Infinity : 0;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (g(m) > 0) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}
// The highest note the arc can start on this coil (capacitors cut by Kelvin's formula).
export function upperLimit(P) {
  const L = P.coil * 1e-3, g = (f) => linearAnalysis(circuit(P, kelvinC(f, L))).sigma;
  let lo = 20, hi = 2e5;
  if (g(lo) <= 0) return 0;
  if (g(hi) > 0) return hi;
  for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (g(m) > 0) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}

// ---- large signal: the describing function ------------------------------------------------

// Periodic cycle of the arc driven by i(θ) = I₀ + I₁ cos θ at angular frequency ω: the
// thermal current integrated (implicit θ-method) to its periodic state. Returns the cycle
// (i, u, X at M points) and the fundamental Z₁ = U₁/I₁ (the describing function).
export function arcCycle(op, I1, omega, { M = 512, cycles = 4 } = {}) {
  const h = TAU / (omega * M), z = (h * 2 * op.w) / op.tau, th = Math.max(0.5, 1 - 1 / z);
  const i = new Float64Array(M), u = new Float64Array(M), Xs = new Float64Array(M);
  let X = op.I0, re = 0, im = 0, dc = 0;
  const cur = (k) => op.I0 + I1 * Math.cos((TAU * k) / M);
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < M; k++) {
      const i0 = cur(k), i1 = cur(k + 1), F0 = flow(X, i0, op);
      let Y = Math.max(1e-4, X + h * F0);
      for (let it = 0; it < 30; it++) {
        const r = Y - X - h * ((1 - th) * F0 + th * flow(Y, i1, op)), dr = 1 - h * th * flowDX(Y, i1, op);
        const Yn = Math.min(Math.max(Y - r / dr, 0.25 * Y), 4 * Y + 1e-3);
        if (Math.abs(Yn - Y) < 1e-12 * (1 + Y)) { Y = Yn; break; }
        Y = Yn;
      }
      X = Y;
      if (c === cycles - 1) {
        const k1 = (k + 1) % M, ik = i1, uk = ik / cond(X, op), t = (TAU * (k + 1)) / M;
        i[k1] = ik; u[k1] = uk; Xs[k1] = X; re += uk * Math.cos(t); im += uk * Math.sin(t); dc += uk;
      }
    }
  }
  return { i, u, X: Xs, Z1: [(2 * re) / (M * I1), (-2 * im) / (M * I1)], U0: dc / M };
}
export const describing = (op, I1, omega, o) => arcCycle(op, I1, omega, o).Z1;
// Area of the loop the operating point traces in the (i, u) plane, ∮ u di (> 0: clockwise,
// the voltage higher while the current rises than while it falls).
export function loopArea(cyc) {
  const { i, u } = cyc, M = i.length;
  let a = 0;
  for (let k = 0; k < M; k++) { const k1 = (k + 1) % M; a += 0.5 * (u[k] + u[k1]) * (i[k1] - i[k]); }
  return a;
}

// The stable cycle of the musical branch by harmonic balance (one harmonic): the arc
// current's swing I₁ at which the arc (in parallel with the supply branch) just pays for
// the coil's loss, and the capacitance that puts that cycle on frequency f.
// Returns { C, I1, Z } (I1 = 0 if the arc cannot sing there: then C is the linear one).
export function balance(P, f, op = arcOp(P)) {
  const w = TAU * f, talk = P.mode === 'talk', L = talk ? TALK.L : P.coil * 1e-3, R = talk ? TALK.R : P.coilR;
  const Zb = [op.Rb, w * SUPPLY.Lb];
  const Zp = (Z1) => cdiv(cmul(Z1, Zb), cadd(Z1, Zb));
  const res = (I1) => { const Z = Zp(describing(op, I1, w, { M: 256, cycles: 3 })); return { g: R + Z[0], Z }; };
  const small = Zp(zArc(w, op));
  const capOf = (Z) => 1 / (w * (w * L + Z[1]));
  if (R + small[0] >= 0) return { C: capOf(small), I1: 0, Z: small };
  // scan the swing for the last crossing from growing (g < 0) to decaying (g > 0)
  const N = 24, lo = 0.02 * op.I0, hi = 2 * op.I0;
  let prev = { x: lo, ...res(lo) }, best = null;
  for (let k = 1; k <= N; k++) {
    const x = lo + ((hi - lo) * k) / N, r = { x, ...res(x) };
    if (prev.g < 0 && r.g >= 0) best = [prev, r];
    prev = r;
  }
  if (!best) { const r = res(hi); return { C: capOf(r.Z), I1: hi, Z: r.Z }; }
  let [a, b] = best;
  for (let it = 0; it < 14; it++) { const x = 0.5 * (a.x + b.x), r = { x, ...res(x) }; if (r.g < 0) a = r; else b = r; }
  const x = 0.5 * (a.x + b.x), r = res(x);
  return { C: capOf(r.Z), I1: x, Z: r.Z };
}

// The steady note of one arc with capacitance C, by direct integration: the circuit started
// near its cycle (the coil kicked to `kick` amperes) and stepped, M steps a cycle, with the
// engine's scheme (trapezoidal circuit, θ-method column, Newton), until it settles; the
// frequency is measured from the coil current's zero crossings. Returns { f, iaMin, iaMax,
// uMax, Iac } (f = NaN if the oscillation dies away: the arc cannot sing there).
export function steadyNote(P, C, { M = 256, kick = 0.7 * P.current, settle = 0.06, measure = 16, op = arcOp(P) } = {}) {
  const talk = P.mode === 'talk', L = talk ? TALK.L : P.coil * 1e-3, R = talk ? TALK.R : P.coilR;
  const { A, B, Xm, tau } = op, del2 = op.delta * op.delta, E = SUPPLY.E, Lb = SUPPLY.Lb, Rb = op.Rb;
  const f0 = 1 / (TAU * Math.sqrt(L * C)), h = 1 / (f0 * M), h2 = h / 2;
  const z = (h * 2 * op.w) / tau, th = Math.max(0.5, 1 - 1 / z);
  const as = Lb / h + Rb / 2, bs = 1 / (2 * as), ac = L / h + R / 2, bc = 1 / (2 * ac), D = C + h2 * bc, q = (h2 * bc) / D;
  let is = op.I0, ic = kick, vC = op.u0, X = op.I0, ia = is - ic, u = ia / cond(X, op);
  const nSettle = Math.max(12, Math.ceil(settle * f0)) * M, nTot = nSettle + measure * M;
  let prev = ic, first = -1, last = -1, count = 0, iaMin = Infinity, iaMax = -Infinity, uMax = -Infinity, i2 = 0, n2 = 0, peak0 = 0, peak1 = 0;
  for (let n = 0; n < nTot; n++) {
    const a_s = (is * Lb / h + E - 0.5 * Rb * is - 0.5 * u) / as;
    const a_c = (ic * L / h + 0.5 * (u - R * ic - vC)) / ac;
    const p = (C * vC + h2 * (ic + a_c)) / D;
    const J = a_s - (a_c - bc * p), GN = bs + bc * (1 - q);
    const Fold = flow(X, ia, op);
    let Y = Math.min(Math.max(X + h * Fold, 0.5 * X), 2 * X + Xm);
    for (let it = 0; it < 30; it++) {
      const d = Y - Xm, rr = Math.sqrt(d * d + del2), Xe = 0.5 * (Y + Xm + rr), dXe = 0.5 * (1 + d / rr), den = A * Xe + B;
      const G = (Xe * Xe) / den, dG = (G * dXe * (A * Xe + 2 * B)) / (Xe * den), S = GN + G, iN = (G * J) / S;
      const res = Y - X - h * ((1 - th) * Fold + th * flow(Y, iN, op));
      const dres = 1 - h * th * (flowDX(Y, iN, op) + flowDi(Y, iN, op) * ((J * GN * dG) / (S * S)));
      let Yn = Y - res / dres;
      Yn = Math.min(Math.max(Yn, 0.5 * Y), 2 * Y + Xm);
      const done = Math.abs(Yn - Y) < 1e-11 * (Y + Xm);
      Y = Yn;
      if (done) break;
    }
    X = Math.max(Y, 1e-3 * Xm);
    const G = cond(X, op);
    u = J / (GN + G); ia = G * u; is = a_s - bs * u;
    const vn = p + q * u, icn = a_c + bc * (u - vn);
    vC = vn;
    if (n >= nSettle) {
      if (prev < 0 && icn >= 0) { const t = n - icn / (icn - prev); if (first < 0) first = t; last = t; count++; }
      iaMin = Math.min(iaMin, ia); iaMax = Math.max(iaMax, ia); uMax = Math.max(uMax, u); i2 += icn * icn; n2++;
      if (n < nSettle + 4 * M) peak0 = Math.max(peak0, Math.abs(icn)); else if (n >= nTot - 4 * M) peak1 = Math.max(peak1, Math.abs(icn));
    }
    prev = icn; ic = icn;
    if (!Number.isFinite(ic)) break;
  }
  const dying = !(peak1 > 1e-3 * op.I0) || peak1 < 0.97 * peak0;
  const f = count > 2 && !dying ? (count - 1) / ((last - first) * h) : NaN;
  return { f, iaMin, iaMax, uMax, Iac: Math.sqrt(i2 / Math.max(1, n2)) };
}

// The keyboard's capacitors (F) for the parameter set: 'arc' sizes each so that the sounding
// note (the steady cycle, with the arc's reactance and its swing) lands on the key; where the
// arc cannot sing, so that the note it would start is on the key. 'kelvin' uses 1/(ω²L).
export const tuneKey = (P) => [P.current, P.gap, P.tau, P.restrike, P.coil, P.coilR, P.tune].join('|');
// The capacitance whose note *starts* on the key (the linear analysis): quick, and the first
// guess for the sounding note.
export function startCap(key, P, op = arcOp(P)) {
  const f = keyFreq(key), L = P.coil * 1e-3;
  let C = kelvinC(f, L);
  for (let it = 0; it < 4; it++) { const fs = linearAnalysis(circuit(P, C, op)).f; if (!(fs > 0)) break; C *= (fs / f) ** 2; }
  return C;
}
export function capFor(key, P, op = arcOp(P)) {
  const f = keyFreq(key), L = P.coil * 1e-3;
  if (P.tune === 'kelvin') return kelvinC(f, L);
  let C = startCap(key, P, op);
  const lin = C;
  for (let it = 0; it < 5; it++) {
    const r = steadyNote(P, C, { op });
    if (!(r.f > 0)) return lin;
    const c = 1200 * Math.log2(r.f / f);
    C *= (r.f / f) ** 2;
    if (Math.abs(c) < 0.1) break;
  }
  return C;
}
export function keyCaps(P) {
  const op = arcOp(P), caps = new Float64Array(KEY_HI - KEY_LO + 1);
  for (let k = KEY_LO; k <= KEY_HI; k++) caps[k - KEY_LO] = capFor(k, P, op);
  return { key: tuneKey(P), lo: KEY_LO, caps };
}

// ---- hiss and sound ---------------------------------------------------------------------

// Ayrton's hissing current grows with the arc's length; the law's numbers are the model's.
export const hissCurrent = (l) => HISS.I0 + HISS.perMm * l;
export function hissFactor(I, l) {
  const Ih = hissCurrent(l), x = Math.min(1, Math.max(0, (I - Ih) / (HISS.width * Ih)));
  return x * x * (3 - 2 * x);
}
// Thermophone: pressure at distance r per unit rate of change of heat input (Pa per W/s).
export const pressureGain = (r) => (AIR.gamma - 1) / (4 * Math.PI * AIR.c * AIR.c * r);
// The same from first principles: heat Q at constant pressure expands air by Q/(ρ c_p T);
// a small source of volume velocity q radiates p = ρ q̇ /(4π r).
export const pressureGainFirstPrinciples = (r) => 1 / (4 * Math.PI * r * AIR.cp * AIR.T);
