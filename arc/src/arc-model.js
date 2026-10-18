// arc-model.js — Duddell's singing arc in JavaScript: its constants, the closed-form formulas the
// page draws, and the first-principles numerics the tests check the C++ against. The model itself
// (the operating point, the circuit's linear analysis, the thresholds, the steady cycle and the
// capacitors) is the C++'s (native/instruments/arc/arc-model.cpp), which the page and the tests
// call through arc-wasm.js. No DOM, no audio.
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
export const KEY_LO = 21, KEY_HI = 108; // A0–C8
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

export const ayrtonAB = (l) => ({ A: AYRTON.a + AYRTON.b * l, B: AYRTON.c + AYRTON.d * l });
export const ayrtonV = (I, l) => { const { A, B } = ayrtonAB(l); return A + B / I; };

// Kelvin's formula, the LC frequency.
export const kelvinC = (f, L) => 1 / ((TAU * f) ** 2 * L);
// The parameters the capacitor bank depends on (the C++ cuts it, arc-model.cpp keyCaps): the page
// and the tests key a bank on these.
export const tuneKey = (P) => [P.current, P.gap, P.tau, P.restrike, P.coil, P.coilR, P.tune].join('|');

// ---- the checks: Mayr's law worked independently of the C++ ----------------------------------
// The tests hold the C++'s operating point (arc_op), its analytic impedance and its quartic to
// these: the column's law linearised by finite differences, integrated over a cycle, and written
// as the circuit's state matrix. Each takes the C++'s op ({ I0, A, B, tau, Xm, delta, R0, K, w, Rb }).

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

// The circuit's state matrix, whose eigenvalues the C++'s quartic must give (arc_linear): state
// [i_s, i_c, v_C, X], linearised about the DC operating point, with capacitance C on the coil.
export function stateMatrix(P, C, op) {
  const talk = P.mode === 'talk', L = talk ? TALK.L : P.coil * 1e-3, R = talk ? TALK.R : P.coilR, Lb = SUPPLY.Lb, Rb = op.Rb;
  // u = (i_s − i_c)/g(X):  ∂u/∂i_s = R₀, ∂u/∂i_c = −R₀, ∂u/∂X = −I₀ R₀ (ln g)'
  const ux = -op.I0 * op.R0 * dlnG(op.I0, op), Fi = flowDi(op.I0, op.I0, op), Fx = flowDX(op.I0, op.I0, op);
  return [
    [(-Rb - op.R0) / Lb, op.R0 / Lb, 0, -ux / Lb],
    [op.R0 / L, (-R - op.R0) / L, -1 / L, ux / L],
    [0, 1 / C, 0, 0],
    [Fi, -Fi, 0, Fx],
  ];
}

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

// ---- the thermophone ----------------------------------------------------------------

// Thermophone: pressure at distance r per unit rate of change of heat input (Pa per W/s).
export const pressureGain = (r) => (AIR.gamma - 1) / (4 * Math.PI * AIR.c * AIR.c * r);
// The same from first principles: heat Q at constant pressure expands air by Q/(ρ c_p T);
// a small source of volume velocity q radiates p = ρ q̇ /(4π r).
export const pressureGainFirstPrinciples = (r) => 1 / (4 * Math.PI * r * AIR.cp * AIR.T);
