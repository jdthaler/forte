// ringdown-model.js — from a key press to the gravitational waves of a ringing
// black hole.
//
// Each key is a Kerr black hole whose dominant (l, m, n) = (2, 2, 0)
// quasinormal mode sounds the key's pitch: M = Re(Mω₂₂₀)/(2π f_key). Mass
// sets the pitch and spin the timbre; the other modes fall where general
// relativity puts them.
//
// The perturbation is the remnant of a binary merger (mass ratio q). The
// strain an observer at inclination ι sees is
//
//   h₊ − i h× = Σ_lmn [ A_lmn e^{−iω t} ₋₂Y_lm(ι) + (−1)^l A*_lmn e^{+iω* t} ₋₂Y_l,−m(ι) ]
//
// (the second term is the mirror mode of a non-precessing binary). Mode
// amplitudes follow numerical-relativity fits (Kamaretsos, Hannam, Husa &
// Sathyaprakash 2012) in the symmetric mass ratio ν = q/(1+q)²:
//   A₂₂ = 0.864ν,  A₂₁ = 0.52(1−4ν)^0.71 A₂₂,  A₃₃ = 0.44(1−4ν)^0.45 A₂₂,
//   A₄₄ = [5.4(ν−0.22)² + 0.04] A₂₂.
// Equal masses (ν = ¼) switch the odd-m modes off entirely.

export const MSUN_S = 4.925490947e-6;      // G M☉ / c³ in seconds
export const MSUN_KM = 1.476625;           // G M☉ / c² in km
export const TC_MAX = 2;                   // longest inspiral (s)
const TAU = 2 * Math.PI;

export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const KEY_LO = 36, KEY_HI = 96;

// spin slider: u = −log10(1 − a), from 0 (Schwarzschild) to 6 (a = 1 − 10⁻⁶)
export const spinFromU = (u) => 1 - 10 ** -u;
export const uFromSpin = (a) => -Math.log10(1 - a);

// ---- QNM bank: interpolate the precomputed Leaver table --------------------
export class QNMBank {
  constructor(table) {
    this.u = table.u;
    this.modes = table.modes.map((md) => ({
      l: md.l, m: md.m, n: md.n,
      re: Float64Array.from(md.re),
      lim: Float64Array.from(md.im, (v) => Math.log(-v)),   // log damping: ~linear in u near extremal
    }));
    this.index = new Map(this.modes.map((md) => [`${md.l},${md.m},${md.n}`, md]));
  }
  // Cubic Hermite in u on (Re ω, log −Im ω). The slope at each node is the
  // derivative of the parabola through it and its two neighbours (one-sided at
  // the ends of the table), which is second-order accurate on the uneven grid.
  omega(l, m, n, a) {
    const md = this.index.get(`${l},${m},${n}`);
    if (!md) return null;
    const U = this.u, last = U.length - 1;
    const u = Math.min(U[last], Math.max(0, uFromSpin(a)));
    let i = 0;
    while (i < last - 1 && U[i + 1] < u) i++;
    const h1 = U[i + 1] - U[i], t = (u - U[i]) / h1;
    const cr = (y) => {
      const m1 = slope(U, y, i) * h1, m2 = slope(U, y, i + 1) * h1;
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * m2;
    };
    return { re: cr(md.re), im: -Math.exp(cr(md.lim)) };
  }
}

// dy/du at node j from the parabola through three neighbouring nodes
function slope(U, y, j) {
  const c = Math.min(U.length - 2, Math.max(1, j));        // centre of the three nodes
  const x0 = U[c - 1], x1 = U[c], x2 = U[c + 1], x = U[j];
  // derivative of the Lagrange parabola at x
  return y[c - 1] * ((2 * x - x1 - x2) / ((x0 - x1) * (x0 - x2)))
    + y[c] * ((2 * x - x0 - x2) / ((x1 - x0) * (x1 - x2)))
    + y[c + 1] * ((2 * x - x0 - x1) / ((x2 - x0) * (x2 - x1)));
}

// ---- spin-weighted spherical harmonics ₛY_lm(θ, φ = 0), real -----------
const fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const binom = (n, k) => (k < 0 || k > n ? 0 : fact(n) / (fact(k) * fact(n - k)));
export function swsh(s, l, m, theta) {
  if (Math.abs(m) > l || Math.abs(s) > l) return 0;
  const pre = (-1) ** m * Math.sqrt((fact(l + m) * fact(l - m) * (2 * l + 1)) / (4 * Math.PI * fact(l + s) * fact(l - s)));
  const sh = Math.sin(theta / 2), ch = Math.cos(theta / 2);
  let sum = 0;
  for (let r = 0; r <= l - s; r++) {
    const c = binom(l - s, r) * binom(l + s, r + s - m);
    if (!c) continue;
    const pc = 2 * r + s - m, ps = 2 * l - pc;            // cot^pc · sin^2l
    sum += c * (-1) ** (l - r - s) * (pc ? ch ** pc : 1) * (ps ? sh ** ps : 1);
  }
  return pre * sum;
}

// ---- excitation -------------------------------------------------------------
// Overtone amplitudes at the strain peak, relative to the fundamental. NR fits
// put them large and phase-alternating near the peak; these are illustrative.
const OVERTONE = [[1, 0], [2.0, Math.PI], [2.5, 0]];

export function excitation(P) {
  const q = Math.max(1, P.massRatio), nu = q / (1 + q) ** 2;
  const d = Math.max(0, 1 - 4 * nu);
  const A22 = 0.864 * nu;
  const base = {
    '2,2': A22,
    '2,1': 0.52 * d ** 0.71 * A22,
    '3,3': 0.44 * d ** 0.45 * A22,
    '4,4': (5.4 * (nu - 0.22) ** 2 + 0.04) * A22,
  };
  return { nu, base };
}

// Everything the audio engine needs for one key at the current settings.
export function keyVoice(key, P, bank, fs) {
  const a = spinFromU(P.spinU);
  const w220 = bank.omega(2, 2, 0, a);
  const f0 = keyFreq(key);
  const M = w220.re / (TAU * f0);                         // seconds (G M / c³)
  const iota = (P.inclination * Math.PI) / 180;
  const { nu, base } = excitation(P);
  const modes = [];
  const add = (l, m, n, amp, phase) => {
    const w = bank.omega(l, m, n, a);
    if (!w) return;
    const f = w.re / (TAU * M), gamma = -w.im / M;
    if (f <= 20 || f >= 0.45 * fs || amp === 0) return;
    // amplitude at the ringdown start time t0 (in units of M) after the peak
    const A = { re: amp * Math.cos(phase), im: amp * Math.sin(phase) };
    const Y = swsh(-2, l, m, iota), Ym = swsh(-2, l, -m, iota), sgn = l % 2 ? -1 : 1;
    // P = A·Y_lm, Q = (−1)^l A*·Y_l,−m ; h₊ = Re((P + Q*)ζ), h× = −Im((P − Q*)ζ)
    const Pr = A.re * Y, Pi = A.im * Y, Qr = sgn * A.re * Ym, Qi = -sgn * A.im * Ym;
    modes.push({ l, m, n, f, gamma, tau: 1 / gamma, Q: (w.re / (2 * -w.im)), amp,
      cpr: Pr + Qr, cpi: Pi - Qi, cxr: Pr - Qr, cxi: Pi + Qi });
  };
  const t0 = P.t0;
  for (const [lm, amp] of Object.entries(base)) {
    const [l, m] = lm.split(',').map(Number);
    const wl = -bank.omega(l, m, 0, a).im;
    const nMax = l === 2 && m === 2 ? 2 : 0;
    for (let n = 0; n <= nMax; n++) {
      const [ratio, ph] = OVERTONE[n];
      const wn = -bank.omega(l, m, n, a).im;
      const ov = n === 0 ? 1 : P.overtones * ratio * Math.exp(-(wn - wl) * t0);
      add(l, m, n, amp * ov, ph);
      if (P.retrograde > 0) add(l, -m, n, amp * ov * P.retrograde, ph);
    }
  }
  // overall level: normalise to an equal-mass, face-on (2,2,0) of unit size
  const norm = 1 / (0.864 * 0.25 * swsh(-2, 2, 2, 0));
  for (const md of modes) { md.cpr *= norm; md.cpi *= norm; md.cxr *= norm; md.cxi *= norm; }

  // optional inspiral: leading-order (quadrupole) chirp into the merger
  let chirp = null;
  if (P.inspiral) {
    const Erad = 0.048 * (4 * nu) ** 2;                    // radiated fraction
    const Mtot = M / (1 - Erad), Mc = Mtot * nu ** 0.6;
    const fIsco = 1 / (6 ** 1.5 * Math.PI * Mtot);
    // start inspiralOct octaves below the ISCO frequency, but last at most TC_MAX
    const k5 = (5 / 256) * Mc ** (-5 / 3);
    const tcOf = (f) => k5 * (Math.PI * f) ** (-8 / 3);
    let fStart = fIsco * 2 ** -P.inspiralOct;
    if (tcOf(fStart) > TC_MAX) fStart = (k5 / TC_MAX) ** (3 / 8) / Math.PI;
    // The strain is continuous through the handover: the chirp ends with the
    // amplitude and phase of the ringdown it hands over to, S = Σ C₊.
    let sr = 0, si = 0;
    for (const md of modes) { sr += md.cpr; si += md.cpi; }
    const cp = (1 + Math.cos(iota) ** 2) / 2, cx = Math.cos(iota);
    chirp = {
      Mc, fStart, fIsco, f220: f0, tc: tcOf(fStart), cp, cx,
      amp: Math.hypot(sr, si) / cp, psi: Math.atan2(si, sr),
      fPk: 1.233 * fIsco,                                    // amplitude grows as f^(2/3) up to here
      tauB: 1.5 / f0,                                        // merger bridge: f → f₂₂₀ with this time constant
      fadeT: Math.min(0.03, 0.3 * tcOf(fStart)),             // fade-in (the inspiral was already under way)
    };
  }
  const info = {
    key, f0, a, M, Msun: M / MSUN_S, nu,
    rPlusKm: (1 + Math.sqrt(1 - a * a)) * (M / MSUN_S) * MSUN_KM,
    OmegaH: a / (2 * (1 + Math.sqrt(1 - a * a))) / M / TAU,          // Hz
    hawkingK: 6.169e-8 / (M / MSUN_S) * (2 * Math.sqrt(1 - a * a)) / (1 + Math.sqrt(1 - a * a)),
  };
  return { key, modes, chirp, info };
}

// ---- the chirp's schedule in closed form ------------------------------------
// Stage 1, t < t₁: f = f_s(1 − t/τ_c)^(−3/8) up to f_ISCO.
// Stage 2, the merger bridge: f relaxes to f₂₂₀ with time constant τ_B; at
// 0.97 f₂₂₀ (time t₂) the ringdown takes over, crossfaded over half a cycle.
// The engine steps the same equations sample by sample.
export function chirpSchedule(ch) {
  const f1 = Math.max(ch.fStart, Math.min(ch.fIsco, ch.f220));
  const t1 = ch.fStart < f1 ? ch.tc * (1 - (ch.fStart / f1) ** (8 / 3)) : 0;
  const t2 = t1 + (f1 < 0.97 * ch.f220 ? ch.tauB * Math.log((ch.f220 - f1) / (0.03 * ch.f220)) : 0);
  return { f1, t1, t2 };
}
// frequency (Hz) and phase (rad) of the chirp at time t ≤ t₂
export function chirpAt(ch, s, t) {
  if (t < s.t1) {
    const x = 1 - t / ch.tc;
    return { f: ch.fStart * x ** (-3 / 8), phi: TAU * ch.fStart * ch.tc * 1.6 * (1 - x ** (5 / 8)) };
  }
  const x1 = 1 - s.t1 / ch.tc, phi1 = s.t1 > 0 ? TAU * ch.fStart * ch.tc * 1.6 * (1 - x1 ** (5 / 8)) : 0;
  const d = t - s.t1, e = Math.exp(-d / ch.tauB);
  return { f: ch.f220 - (ch.f220 - s.f1) * e, phi: phi1 + TAU * (ch.f220 * d - (ch.f220 - s.f1) * ch.tauB * (1 - e)) };
}
export const chirpAmp = (ch, f, t) => ch.amp * Math.min(1, (f / ch.fPk) ** (2 / 3)) * (t < ch.fadeT ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ch.fadeT) : 1);

// The note's strain, h₊ and h×, at n evenly spaced times: the closed-form sum
// over modes (and the chirp), for the page's plot. Same units as the engine
// output at velocity 1 before its output gain.
export function strainCurve(v, n) {
  const ch = v.chirp, s = ch ? chirpSchedule(ch) : null, tH = s ? s.t2 : 0;
  const f0 = v.info.f0, half = 1 / (2 * f0);
  let tau = 0;
  for (const md of v.modes) if (md.n === 0) tau = Math.max(tau, md.tau);
  if (!tau) tau = 0.01;
  const dur = Math.min(2.5, tH + 6 * tau);
  const hp = new Float32Array(n), hx = new Float32Array(n);
  const end = ch ? chirpAt(ch, s, tH) : null, aEnd = ch ? chirpAmp(ch, end.f, tH) : 0;
  const psi0 = ch ? end.phi + ch.psi : 0;
  for (let i = 0; i < n; i++) {
    const t = (dur * i) / (n - 1);
    let p = 0, x = 0;
    if (ch && t < tH + half) {                             // inspiral, then fading out
      let phi, A, w = 1;
      if (t < tH) { const c = chirpAt(ch, s, t); phi = c.phi; A = chirpAmp(ch, c.f, t); }
      else { phi = end.phi + TAU * ch.f220 * (t - tH); A = aEnd; w = 0.5 + 0.5 * Math.cos(Math.PI * (t - tH) / half); }
      p = w * A * ch.cp * Math.cos(phi); x = w * A * ch.cx * Math.sin(phi);
    }
    if (t >= tH) {                                         // ringdown, rising over half a cycle
      const d = t - tH, env = d < half ? 0.5 - 0.5 * Math.cos(Math.PI * d / half) : 1;
      let rp = 0, rx = 0;
      for (const md of v.modes) {
        const e = Math.exp(-md.gamma * d), th = TAU * md.f * d + psi0;
        const zr = e * Math.cos(th), zi = -e * Math.sin(th);
        rp += md.cpr * zr - md.cpi * zi;
        rx -= md.cxr * zi + md.cxi * zr;
      }
      p += env * rp; x += env * rx;
    }
    hp[i] = p; hx[i] = x;
  }
  return { hp, hx, dur };
}
