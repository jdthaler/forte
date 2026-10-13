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
  // Catmull–Rom in u on (Re ω, log −Im ω)
  omega(l, m, n, a) {
    const md = this.index.get(`${l},${m},${n}`);
    if (!md) return null;
    const u = Math.min(this.u[this.u.length - 1], Math.max(0, uFromSpin(a)));
    const U = this.u;
    let i = 0;
    while (i < U.length - 2 && U[i + 1] < u) i++;
    const t = (u - U[i]) / (U[i + 1] - U[i]);
    const cr = (y) => {
      const y0 = y[Math.max(0, i - 1)], y1 = y[i], y2 = y[i + 1], y3 = y[Math.min(U.length - 1, i + 2)];
      const h0 = U[i] - U[Math.max(0, i - 1)] || 1, h1 = U[i + 1] - U[i], h2 = U[Math.min(U.length - 1, i + 2)] - U[i + 1] || 1;
      const m1 = ((y2 - y0) / (h0 + h1)) * h1, m2 = ((y3 - y1) / (h1 + h2)) * h1;
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m2;
    };
    return { re: cr(md.re), im: -Math.exp(cr(md.lim)) };
  }
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
    const f220 = f0, fIsco = 1 / (6 ** 1.5 * Math.PI * Mtot);
    const fStart = Math.min(fIsco * 0.9, f220 * 2 ** -P.inspiralOct);
    let pk = 0;
    for (const md of modes) if (md.n === 0) pk += Math.hypot(md.cpr, md.cpi);
    chirp = { Mc, fStart, fIsco, f220, amp: pk, cp: (1 + Math.cos(iota) ** 2) / 2, cx: Math.cos(iota) };
  }
  const info = {
    key, f0, a, M, Msun: M / MSUN_S, nu,
    rPlusKm: (1 + Math.sqrt(1 - a * a)) * (M / MSUN_S) * MSUN_KM,
    OmegaH: a / (2 * (1 + Math.sqrt(1 - a * a))) / M / TAU,          // Hz
    hawkingK: 6.169e-8 / (M / MSUN_S) * (2 * Math.sqrt(1 - a * a)) / (1 + Math.sqrt(1 - a * a)),
  };
  return { key, modes, chirp, info };
}
