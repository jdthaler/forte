// windharp-model.js — the physics of the Wind Harp, kept free of audio and DOM so that the
// page, the engine, the tests and the render tool can all use it.
//
// Each key is a stiff string in a wind. Air flowing across a thin cylinder sheds a von Kármán
// vortex street at the Strouhal frequency f_s = St(Re)·U/D, which pushes the string sideways,
// across the wind (Rayleigh 1879). The wake is modelled as van der Pol oscillators distributed
// along the string (Facchinetti, de Langre & Biolley 2004a, b), each driven by the string's
// local acceleration and loading it with the lift it carries:
//
//   string (per unit length):  m Ÿ + (r_s + r_f) Ẏ − T Y'' + EI Y'''' = ¼ ρU²D C_L0 q
//   wake at each station:      q̈ + εΩ (q² − r) q̇ + Ω² q = (A/D) Ÿ
//
// with m = m_s + ρπD²/4 (the air's added mass), r_f = γΩρD² the flow's damping, and the
// published constants ε = 0.3, A = 12, C_L0 = 0.3, γ = 0.8. Ω is set so that the free wake
// (a fixed cylinder) sheds exactly at f_s: the van der Pol limit cycle runs at κ(ε)Ω, κ = 1 −
// ε²/16 + 17ε⁴/3072 (Lindstedt–Poincaré). r is the shedding's onset: 1 well above the critical
// Reynolds number Re_c = 47, falling through 0 at Re_c (a supercritical Hopf bifurcation, whose
// amplitude grows as √(Re − Re_c): Provansal, Mathis & Boyer 1987), negative below it.
//
// When f_s nears a harmonic of the string the wake locks onto it. The linear analysis here
// (de Langre 2006: lock-in is coupled-mode flutter) gives each harmonic's band of wind speeds,
// δ = ω_n/Ω ∈ (1 − √(AM), 1 + √(AM)), and its growth rate; a harmonic balance of the locked
// state gives how far lock-in persists beyond that band (the hysteresis) and its amplitude.

export const TAU = 2 * Math.PI;
export const KEY_LO = 55, KEY_HI = 96;          // G3–C7, 42 keys
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---- air and the wake ----------------------------------------------------------------------------
export const AIR = { rho: 1.204, nu: 1.516e-5, c: 343 };          // 20 °C, sea level
export const WAKE = { eps: 0.3, A: 12, CL0: 0.3, gamma: 0.8 };     // Facchinetti, de Langre & Biolley (2004a)
export const RE_C = 47;                                            // no shedding below this
export const RE_FULL = 60;                                         // the shedding's full strength from here (the model's ramp)
export const U_REF = 4.0;                                          // m/s: the wind every string is cut for
export const U_MAX = 8;                                            // m/s: the wind slider’s top (2 U_REF)
export const CORR = 5;                                             // spanwise correlation length of a fixed cylinder's lift, in diameters (the model's choice)

// Williamson & Brown (1998), two-term fit to two-dimensional laminar shedding: St = 0.2698 − 1.0271/√Re.
export const strouhal = (Re) => 0.2698 - 1.0271 / Math.sqrt(Math.max(Re, RE_C));
// The onset factor r(Re): the wake's linear growth εΩr/2 ∝ Re − Re_c (Landau), amplitude 2√r.
export const onset = (Re) => clamp((Re - RE_C) / (RE_FULL - RE_C), -1, 1);
// Frequency of the van der Pol limit cycle q̈ + ε(q² − 1)q̇ + q = 0, as a fraction of its linear frequency.
export const vdpKappa = (e) => 1 - (e * e) / 16 + (17 * e ** 4) / 3072;

// The shedding of a fixed cylinder of diameter D in wind U.
export function shedding(U, D) {
  const Re = (U * D) / AIR.nu, St = strouhal(Re), r = onset(Re);
  const fs = (St * U) / D;                                         // Strouhal frequency (Hz)
  const Om = (TAU * fs) / vdpKappa(WAKE.eps * Math.max(r, 0));     // the oscillator's own Ω (rad/s)
  return { Re, St, r, fs, Om, sheds: Re > RE_C };
}

// ---- the strings ---------------------------------------------------------------------------------
export const NYLON = { rho: 1140, E: 4e9 };                        // nylon 6.6 monofilament (typical values)
export const L_REF = 0.8;                                          // m: the scale, L = L_REF (f₀/100 Hz)^−½
export const N_MAX = 16;                                           // modes (and wake stations) per string at most

// The diameter whose Strouhal frequency in wind U is f: D = St(UD/ν)·U/f (fixed point).
export function diameterFor(f, U = U_REF) {
  let D = (0.2 * U) / f;
  for (let i = 0; i < 60; i++) D = (strouhal((U * D) / AIR.nu) * U) / f;
  return D;
}

// One key's string. P: { n0, tuning: 'keys' | 'unison', unison (MIDI key), mass (winding ×), q (Q) }.
// Each key's string is cut so that at U_REF its Strouhal frequency is the key's note and (tuning
// 'keys') its harmonic n0 sounds that note: f_n0 = n0 f₀ √(1 + B n0²) = f_note. In the Kircher
// tuning every string has the same fundamental and only the gauge differs.
export function stringDesign(key, P, { cents = 0, gauge = 1, idx = 0, course = 1 } = {}) {
  const fNote = keyFreq(key), D = diameterFor(fNote, U_REF) * gauge;
  const area = (Math.PI * D * D) / 4, ms = NYLON.rho * (P.mass ?? 1) * area, mf = AIR.rho * area, m = ms + mf;
  const unison = P.tuning === 'unison', n0 = unison ? 1 : P.n0;
  const target = (unison ? keyFreq(P.unison) : fNote) * 2 ** (cents / 1200);
  let f0 = target / n0, L = 0, T = 0, B = 0;
  for (let i = 0; i < 40; i++) {
    L = L_REF * (f0 / 100) ** -0.5;
    T = m * (2 * L * f0) ** 2;
    B = (Math.PI ** 3 * NYLON.E * D ** 4) / (64 * T * L * L);
    f0 = target / (n0 * Math.sqrt(1 + B * n0 * n0));
  }
  T = m * (2 * L * f0) ** 2;
  const mu = m / (AIR.rho * D * D), Re0 = (U_REF * D) / AIR.nu;
  // modes: enough to reach the Strouhal frequency at the top wind, and one more
  const top = shedding(U_MAX, D).fs;
  const N = clamp(Math.ceil(top / f0) + 1, (unison ? 1 : n0) + 2, N_MAX);
  const f = new Float64Array(N);
  for (let n = 1; n <= N; n++) f[n - 1] = n * f0 * Math.sqrt(1 + B * n * n);
  const zeta = 1 / (2 * (P.q ?? 500));
  return {
    key, D, L, T, m, ms, mf, mu, B, f0, f, N, n0, zeta, Re0, stress: T / area, unison,
    St0: strouhal(Re0), fNote, target, lc: CORR * D, cents, gauge, idx, course,
  };
}

// Unison courses: the treble's fine strings carry little force, so, as on many instruments, the
// upper registers have more strings to a key: one from G3 to B4, two from C5 to C7. The strings of a
// course are tuned a little apart and differ a little in gauge (seeded), so each locks on its own and
// they beat slowly: the shimmer of a course. (COURSE.three = 97 is beyond the compass: no course of
// three; lower it to add a third string to the top keys, at half as much again of their cost.)
export const COURSE = { two: 72, three: 97, cents: 1.2, gauge: 0.005, jitter: 0.25 };
export const courseSize = (key) => (key >= COURSE.three ? 3 : key >= COURSE.two ? 2 : 1);
const hash = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; }; // seeded, in [−0.5, 0.5)
export function courseOffsets(key) {
  const n = courseSize(key), out = [];
  for (let i = 0; i < n; i++) {
    const c = i - (n - 1) / 2;   // −½, ½ for two; −1, 0, 1 for three
    out.push({ idx: i, course: n, cents: n === 1 ? 0 : COURSE.cents * c + COURSE.jitter * hash(key, i), gauge: n === 1 ? 1 : 1 + COURSE.gauge * (c + 0.5 * hash(key, i + 7)) });
  }
  return out;
}
export const courseDesign = (key, P) => courseOffsets(key).map((o) => stringDesign(key, P, o));

// The string's harmonic n0 (or, Kircher, the harmonic nearest the key's shedding frequency at U_REF).
export function homeHarmonic(S) {
  if (!S.unison) return S.n0;
  let best = 1;
  for (let n = 1; n <= S.N; n++) if (Math.abs(Math.log(S.f[n - 1] / S.fNote)) < Math.abs(Math.log(S.f[best - 1] / S.fNote))) best = n;
  return best;
}

// ---- the linear analysis (de Langre 2006) --------------------------------------------------------
// In time units of 1/Ω and lengths of D, one string mode n coupled to the wake (the wake shaped as
// the mode: with the stations spaced evenly the modes do not mix) is Facchinetti's pair
//   ÿ + λẏ + δ²y = M q,   q̈ − εq̇ + q = A ÿ   (linearised about rest)
//   δ = ω_n/Ω,   λ = 2ζδ + γ/μ,   M = C_L0/(16π² St_Ω² μ),   St_Ω = ΩD/2πU
// and its characteristic equation is (s² + λs + δ²)(s² − εs + 1) = AM s².
export function harmonicParams(S, n, U) {
  const sh = shedding(U, S.D), Om = sh.Om, wn = TAU * S.f[n - 1];
  const StO = (Om * S.D) / (TAU * U), M = WAKE.CL0 / (16 * Math.PI ** 2 * StO ** 2 * S.mu);
  return { ...sh, delta: wn / Om, lam: (2 * S.zeta * wn) / Om + WAKE.gamma / S.mu, M, AM: WAKE.A * M, wn };
}

// Roots of the quartic s⁴ + c3 s³ + c2 s² + c1 s + c0 (Durand–Kerner), as [re, im] pairs.
function quarticRoots(c3, c2, c1, c0) {
  const p = (zr, zi) => { // evaluate the monic polynomial at z
    let r = 1, i = 0;
    for (const c of [c3, c2, c1, c0]) { const nr = r * zr - i * zi + c, ni = r * zi + i * zr; r = nr; i = ni; }
    return [r, i];
  };
  const z = [[0.4, 0.9], [-0.4, 0.9], [0.4, -0.9], [-0.4, -0.9]].map(([a, b]) => [a * 1.3, b * 1.3]);
  for (let it = 0; it < 400; it++) {
    let moved = 0;
    for (let k = 0; k < 4; k++) {
      const [nr, ni] = p(z[k][0], z[k][1]);
      let dr = 1, di = 0;
      for (let j = 0; j < 4; j++) if (j !== k) { const ar = z[k][0] - z[j][0], ai = z[k][1] - z[j][1], tr = dr * ar - di * ai; di = dr * ai + di * ar; dr = tr; }
      const den = dr * dr + di * di || 1e-300, qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      z[k][0] -= qr; z[k][1] -= qi; moved = Math.max(moved, Math.abs(qr) + Math.abs(qi));
    }
    if (moved < 1e-15) break;
  }
  return z;
}

// The coupled roots (dimensionless): s with Re s the growth rate, Im s the frequency.
export function coupledRoots(delta, lam, AM, eps) {
  return quarticRoots(lam - eps, 1 + delta * delta - lam * eps - AM, lam - eps * delta * delta, delta * delta);
}
// de Langre's coupled-mode flutter: with the wake's net damping zero (its amplitude saturated, ε → 0)
// the most unstable root; and the undamped band δ ∈ (1 − √AM, 1 + √AM) where the two roots merge.
export function flutterGrowth(delta, lam, AM, eps = 0) {
  let best = -Infinity, w = 0;
  for (const [re, im] of coupledRoots(delta, lam, AM, eps)) if (re > best) { best = re; w = Math.abs(im); }
  return { re: best, im: w };
}

// The wind speeds bounding harmonic n's lock-in band (where δ = 1 ± √AM), found by bisection;
// δ falls as the wind rises, so the lower wind is the upper edge in δ.
function windAt(S, n, target, lo = 0.2, hi = 40) {
  const g = (U) => { const h = harmonicParams(S, n, U); return h.delta - target(h); };
  let a = lo, b = hi, ga = g(a), gb = g(b);
  if (ga * gb > 0) return null;
  for (let i = 0; i < 70; i++) { const c = Math.sqrt(a * b), gc = g(c); if (ga * gc <= 0) { b = c; gb = gc; } else { a = c; ga = gc; } }
  return Math.sqrt(a * b);
}
export function lockBand(S, n) {
  const lo = windAt(S, n, (h) => 1 + Math.sqrt(h.AM)), hi = windAt(S, n, (h) => 1 - Math.sqrt(h.AM)), mid = windAt(S, n, () => 1);
  if (lo === null || hi === null || mid === null) return null;
  const h = harmonicParams(S, n, mid), g = flutterGrowth(h.delta, h.lam, h.AM, 0);
  return { n, lo, hi, mid, growth: g.re * h.Om, AM: h.AM, sheds: shedding(lo, S.D).sheds };
}

// ---- the locked state: harmonic balance ----------------------------------------------------------
// Seek y = Re(Ŷ e^{iωt}), q = Re(Q̂ e^{iωt}). Averaging the van der Pol term, (q² − r)q̇ → (|Q̂|²/4 − r)q̇,
//   (δ² − ω² + iλω) Ŷ = M Q̂,   (1 − ω² + iεωP) Q̂ = −Aω² Ŷ,   P = |Q̂|²/4 − r,
// so (1 − ω² + iεωP)(δ² − ω² + iλω) = −AMω². The imaginary part gives P = −λ(1 − ω²)/ε(δ² − ω²);
// the real part is then a cubic in ω²:  (1 − ω²)[(δ² − ω²)² + λ²ω²] + AMω²(δ² − ω²) = 0.
// Solutions with |Q̂|² = 4(r + P) ≥ 0 are periodic states. The locked one has ω ≈ δ (the string's
// frequency) and a large Ŷ; it exists over a wider range of δ than the linear band: the hysteresis.
export function balance(delta, lam, AM, M, eps = WAKE.eps, r = 1) {
  const f = (w2) => (1 - w2) * ((delta * delta - w2) ** 2 + lam * lam * w2) + AM * w2 * (delta * delta - w2);
  const out = [], lo = 0.25, hi = 2.5, K = 6000;
  let a = lo, fa = f(a);
  for (let i = 1; i <= K; i++) {
    const b = lo + ((hi - lo) * i) / K, fb = f(b);
    if (fa * fb <= 0 && fa !== fb) {
      let x0 = a, x1 = b, f0 = fa;
      for (let k = 0; k < 60; k++) { const xm = 0.5 * (x0 + x1), fm = f(xm); if (f0 * fm <= 0) x1 = xm; else { x0 = xm; f0 = fm; } }
      // P from the imaginary part, or (where ω = δ makes that 0/0) from the real part
      const w2 = 0.5 * (x0 + x1), w = Math.sqrt(w2), dd = delta * delta - w2;
      const P = Math.abs(dd) > 1e-7 ? (-lam * (1 - w2)) / (eps * dd) : ((1 - w2) * dd + AM * w2) / (eps * lam * w2);
      if (r + P >= 0) {
        const Q = 2 * Math.sqrt(r + P), Y = (M * Q) / Math.hypot(delta * delta - w2, lam * w);
        out.push({ w, Q, Y, P });
      }
    }
    a = b; fa = fb;
  }
  return out;
}
// The single-mode locked branch: the state with the string at its own frequency (|ω/δ − 1| small).
export function lockedState(delta, lam, AM, M, eps = WAKE.eps, r = 1) {
  let best = null;
  for (const s of balance(delta, lam, AM, M, eps, r)) if (Math.abs(s.w / delta - 1) < 0.02 && (!best || s.Y > best.Y)) best = s;
  return best;
}

// The same balance with the wake distributed: each station j feels the mode's own acceleration,
// A ω² Ŷ φ_j, and its response is a forced van der Pol oscillator's, |Q̂_j|² = z_j the largest root of
//   z [(1 − ω²)² + ε²ω²(z/4 − r)²] = (Aω²Ŷφ_j)²,   Q̂_j = −Aω²Ŷφ_j / (1 − ω² + iεωP_j),   P_j = z_j/4 − r,
// so stations at the antinodes swing harder than those near the nodes. The mode then needs
//   δ² − ω² + iλω + AMω² (2/J) Σ_j φ_j² / (1 − ω² + iεωP_j) = 0,
// two real equations for ω and Ŷ, solved by Newton. With every φ_j = 1 it is the single-mode balance.
function cubicMax(c3, c2, c1, c0) { // largest real root of c3 z³ + c2 z² + c1 z + c0, c3 > 0
  const a = c2 / c3, b = c1 / c3, c = c0 / c3, Q = (a * a - 3 * b) / 9, R = (2 * a ** 3 - 9 * a * b + 27 * c) / 54;
  if (R * R < Q ** 3) { const th = Math.acos(R / Math.sqrt(Q ** 3)); return -2 * Math.sqrt(Q) * Math.cos((th + 2 * Math.PI) / 3) - a / 3; }
  const A = -Math.sign(R) * Math.cbrt(Math.abs(R) + Math.sqrt(R * R - Q ** 3)), B = A === 0 ? 0 : Q / A;
  return A + B - a / 3;
}
export function stationResponse(F, w, r, eps = WAKE.eps) { // |Q̂|² of a station forced at amplitude F, frequency w
  const a = 1 - w * w, b = eps * w;
  return Math.max(0, cubicMax((b * b) / 16, (-b * b * r) / 2, a * a + b * b * r * r, -F * F));
}
function distResidual(w, y, h, shape, eps, out) {
  let sr = 0, si = 0;
  const J = shape.length;
  for (let j = 0; j < J; j++) {
    const ph = shape[j], z = stationResponse(WAKE.A * w * w * y * ph, w, h.r, eps), P = z / 4 - h.r;
    const dr = 1 - w * w, di = eps * w * P, den = dr * dr + di * di;
    sr += (ph * ph * dr) / den; si -= (ph * ph * di) / den;
  }
  sr *= 2 / J; si *= 2 / J;
  out[0] = h.delta * h.delta - w * w + h.AM * w * w * sr; out[1] = h.lam * w + h.AM * w * w * si;
}
export function modeShapeAt(n, J) { const s = new Float64Array(J); for (let j = 0; j < J; j++) s[j] = Math.sin((n * Math.PI * (j + 0.5)) / J); return s; }
export function lockedDist(h, shape, guess, eps = WAKE.eps) {
  if (!(h.r > 0)) return null;
  let w = guess.w, y = guess.y;
  const f = [0, 0], fa = [0, 0], fb = [0, 0];
  for (let it = 0; it < 60; it++) {
    distResidual(w, y, h, shape, eps, f);
    const dw = 1e-8, dy = 1e-7 * y;
    distResidual(w + dw, y, h, shape, eps, fa); distResidual(w, y + dy, h, shape, eps, fb);
    const j11 = (fa[0] - f[0]) / dw, j21 = (fa[1] - f[1]) / dw, j12 = (fb[0] - f[0]) / dy, j22 = (fb[1] - f[1]) / dy, det = j11 * j22 - j12 * j21;
    let sw = (f[0] * j22 - f[1] * j12) / det, sy = (j11 * f[1] - j21 * f[0]) / det;
    if (!Number.isFinite(sw) || !Number.isFinite(sy)) return null;
    const lim = 0.2 * y;
    if (Math.abs(sy) > lim) { sw *= lim / Math.abs(sy); sy *= lim / Math.abs(sy); }
    if (Math.abs(sw) > 1e-3) { sy *= 1e-3 / Math.abs(sw); sw = 1e-3 * Math.sign(sw); }
    w -= sw; y -= sy;
    if (!(y > 1e-6)) return null;
    if (Math.abs(sw) < 1e-13 && Math.abs(sy) < 1e-11 * y) return { w, Y: y };
  }
  distResidual(w, y, h, shape, eps, f);
  return Math.hypot(f[0], f[1]) < 1e-10 ? { w, Y: y } : null;
}

// The locked amplitude Ŷ/D of harmonic n at wind U (distributed balance), or 0 if it has none.
export function lockedAmplitude(S, n, U) {
  const h = harmonicParams(S, n, U), s1 = h.r > 0 ? lockedState(h.delta, h.lam, h.AM, h.M, WAKE.eps, h.r) : null;
  const s = lockedDist(h, modeShapeAt(n, S.N), { w: h.delta, y: s1 ? 1.25 * s1.Y : 0.04 });
  return s ? s.Y : 0;
}

// How far the locked branch reaches in wind on each side of the band (the hysteresis), for harmonic
// n: follow it from the band's middle in steps of 0.5 % of the wind, then halve the last step 12 times.
const rangeMemo = new Map();
export function lockedRange(S, n) {
  const id = `${S.key}|${S.D}|${S.L}|${S.f0}|${S.zeta}|${S.mu}|${n}`;
  if (rangeMemo.has(id)) return rangeMemo.get(id);
  const band = lockBand(S, n);
  let out = null;
  if (band && shedding(band.mid, S.D).r > 0) {
    const shape = modeShapeAt(n, S.N);
    const at = (U, g) => lockedDist(harmonicParams(S, n, U), shape, g);
    const h0 = harmonicParams(S, n, band.mid), s1 = lockedState(h0.delta, h0.lam, h0.AM, h0.M, WAKE.eps, h0.r);
    const s0 = at(band.mid, { w: h0.delta, y: s1 ? 1.25 * s1.Y : 0.04 });
    if (s0) {
      const edge = (dir) => {
        let U = band.mid, g = { w: s0.w, y: s0.Y }, step = 0.005 * band.mid;
        for (let k = 0; k < 400; k++) {
          const s = at(U + dir * step, g);
          if (s) { U += dir * step; g = { w: s.w, y: s.Y }; } else if (step > 2e-5 * band.mid) step /= 2; else break;
        }
        return { U, Y: g.y };
      };
      const up = edge(1), dn = edge(-1);
      out = { ...band, upTo: up.U, downTo: dn.U, Ymid: s0.Y, Yup: up.Y, Ydown: dn.Y };
    }
  }
  if (rangeMemo.size > 2000) rangeMemo.clear();
  rangeMemo.set(id, out);
  return out;
}

// The map the page draws: for each harmonic, its band and locked range in wind.
export function lockMap(S) {
  const out = [];
  for (let n = 1; n <= S.N; n++) { const r = lockedRange(S, n); if (r) out.push(r); else { const b = lockBand(S, n); if (b) out.push({ ...b, upTo: b.hi, downTo: b.lo, Ymid: 0, none: true }); } }
  return out;
}

// Mass–damping: m*ζ (with m* = m/ρD²) and the Scruton number Sc = 2m*ζ = πm*'ζ/2 (m*' = 4m/πρD²).
export const massDamping = (S) => S.mu * S.zeta;

// ---- shutters ------------------------------------------------------------------------------------
// A shutter slides along the string and uncovers it; velocity sets how fast (pp 300 ms, ff 10 ms).
export const shutterOpen = (v) => 0.3 * (1 / 30) ** clamp(v ?? 0.7, 0, 1);
export const shutterClose = (v) => (v === undefined || v === null ? 0.04 : 0.1 * 0.15 ** clamp(v, 0, 1));

// ---- gusts ---------------------------------------------------------------------------------------
// The wind's turbulence: U(t) = U (1 + I_u g(t)), g of unit variance with a von Kármán-like spectrum,
// flat below f_c = 1/(2π T_u) and falling as f^(−5/3) above it, made as the sum of two Ornstein–
// Uhlenbeck processes (corners f_c and 6 f_c) whose powers fit that slope between them.
export const GUST = { ratio: 6, w2: 0.38 };
export function gustSpectrum(f, Tu) { // the target, normalised to 1 at f → 0
  const fc = 1 / (TAU * Tu);
  return (1 + (f / fc) ** 2) ** (-5 / 6);
}
export function gustModel(f, Tu) { // the two-OU spectrum the engine makes, same normalisation
  const fc = 1 / (TAU * Tu), f2 = GUST.ratio * fc, w2 = GUST.w2, w1 = 1 - w2;
  // OU power density ∝ σ²/(f_c(1 + (f/f_c)²)); at f → 0: w1/fc + w2/f2
  const s = (w1 / fc) / (1 + (f / fc) ** 2) + (w2 / f2) / (1 + (f / f2) ** 2);
  return s / (w1 / fc + w2 / f2);
}

// ---- the soundbox --------------------------------------------------------------------------------
// The strings run over a bridge on the box's top and are fastened at their far end to a rigid block;
// the bridge feels the string's force F_b = T ∂Y/∂x = T Σ (nπ/L) a_n. Above its lowest modes a
// thin top behaves on average as a mass-like plate, and the model takes the sound it radiates at
// r = 1 m as p = ρ F_b / (2π m'' r), flat in frequency, with m'' the top's mass per area under the
// bridge. As on a harp's soundboard the top tapers, thick under the bass strings (4 kg/m², with its bars) and
// thin under the treble (0.5 kg/m²), which evens the registers by 18 dB. Its lowest resonances, the
// air in the box (a Helmholtz mode through its rose holes) and four plate modes, add broad peaks;
// each is a band-pass of the summed force with gain G at its peak, heard in phase by both
// microphones or, for the modes antisymmetric along the box, with opposite signs.
export const BOX = {
  r: 1, mBass: 4, mTreble: 0.5, shelf: { f1: 500, f2: 4000 },
  modes: [
    { f: 140, Q: 6, G: 1.8, sign: [1, 1] },     // the air in the box
    { f: 235, Q: 8, G: 1.7, sign: [1, -1] },
    { f: 370, Q: 9, G: 1.6, sign: [1, 1] },
    { f: 580, Q: 10, G: 1.5, sign: [1, -1] },
    { f: 900, Q: 10, G: 1.4, sign: [1, 1] },
  ],
};
// the top's mass per area under key m's string (geometric taper across the compass)
export const topMass = (key) => BOX.mBass * (BOX.mTreble / BOX.mBass) ** Math.max(0, Math.min(1, (key - KEY_LO) / (KEY_HI - KEY_LO)));
// pressure at 1 m per newton of bridge force, flat path
export const boxGain = (key) => AIR.rho / (TAU * topMass(key) * BOX.r);
// Radiation efficiency: below its coincidence frequency a finite top radiates better the higher the
// frequency, from its edges and corners. The model takes this as one first-order shelf, rising
// 6 dB an octave from f1 and levelling off by f2, near the top's coincidence frequency (the model's
// choice of curve): |H| = √(1 + (f/f1)²) / √(1 + (f/f2)²).
export const shelfGain = (f) => Math.sqrt(1 + (f / BOX.shelf.f1) ** 2) / Math.sqrt(1 + (f / BOX.shelf.f2) ** 2);
// The box's response |p/F_b| at frequency f for key m (flat path, resonances and shelf, one microphone).
export function boxResponse(key, f, mic = 0) {
  let re = 1, im = 0;
  for (const md of BOX.modes) { // RBJ band-pass with unit peak: H = (jf/(Q f0)) / (1 − (f/f0)² + jf/(Q f0))
    const x = f / md.f, dr = 1 - x * x, di = x / md.Q, den = dr * dr + di * di, hr = (di * di) / den, hi = (di * dr) / den;
    re += md.sign[mic] * (md.G - 1) * hr; im += md.sign[mic] * (md.G - 1) * hi;
  }
  return boxGain(key) * Math.hypot(re, im) * shelfGain(f);
}
