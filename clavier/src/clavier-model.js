// clavier-model.js — the physics of a tangent-struck, magnetically sensed
// string (after the Hohner Clavinet D6), kept free of audio and DOM so the
// page, the engine, the tests and the render tool can all use it.
//
// Each key has one steel string running from the tailpiece (x = 0) to its
// tuning pin. The key's rubber tangent pins the string onto a metal anvil at
// x = L: the speaking length [0, L] rings between anvil and tailpiece, and the
// nonspeaking length [L, L + Ln] is wound with yarn. Two magnetic pickups sit
// under and over the speaking length near the tailpiece.
//
// The string is reduced to modes by component-mode synthesis, with the height
// s of the string at the anvil as the shared coordinate:
//   speaking part  u(x) = s·x/L + Σ q_n sin(nπx/L)        (Craig–Bampton: pinned
//                  modes on top of the static shape, coupled to s through mass)
//   yarn part      quarter-wave modes free at the anvil and pinned at the
//                  tuning pin, s = Σ r_m; the yarn is a uniform viscous drag
// The tangent (a mass on a Hertzian rubber tip) and the anvil (a stiff
// Hertzian stud) act on s; the engine solves both contacts implicitly.
//
// Units: SI unless a name says otherwise (mm, cm, g in the parameters).

import { keyFreq } from '../../shared/dsp.js';
import { genEig } from '../../shared/linalg.js';

export const LO = 29, HI = 88;                 // F1 … E6, 60 keys
export const STEEL = { E: 2.0e11, rho: 7850, strength: 2.6e9 };
export const WIND_RHO = 8900;                  // copper-alloy winding
export const NONSPEAK = 2 ** (3 / 12) - 1;     // Ln / L: the pitch falls 3 semitones on release (Gabrielli et al. 2013)
export const TUNE_FORCE = 4;                   // N: the keyboard is tuned with the keys held at this force
export const RETURN_FORCE = 1.5;               // N: key return spring, lifting the tangent on release
export const PRESS_MAX = 12;                   // N: extra key force at full aftertouch (or pitch wheel)
export const MUTE_K = 400, MUTE_R = 1.2;       // N/m, N·s/m: the mute felt at full pressure
export const REST_GAP = 1.5e-3;                // m: tangent tip above the string at rest
export const ANVIL_K = 2e9;                    // N/m^1.5: steel string on a steel stud (Hertz)
export const ANVIL_LOSS = 0.3;                 // s/m: Hunt–Crossley damping of the stud contact
export const KEY_DAMPING = 15;                 // N·s/m: the finger on a held key, resisting its rebound
export const PICKUP_R = 1e4;                   // Ω: source resistance of the pickup coils (assumed)
export const POLE_WIDTH = 8e-3;                // m: magnetic aperture of a pickup along the string
export const F_MAX = 9000;                     // Hz: highest mode kept
export const N_MAX = 96, M_MAX = 8;            // speaking modes, yarn modes

// Measured inharmonicity of a D6 (Gabrielli et al. 2013, Table 1).
export const MEASURED_B = [[29, 5e-4], [34, 2e-4], [50, 9e-5], [51, 1e-4], [78, 9e-5], [88, 8e-5]];

// ---------------------------------------------------------------------------
// The scale. The strings run almost parallel to the keyboard and all end at
// one tailpiece, so the speaking length falls by about one key width per
// semitone: 86 cm for F1, 17 cm for E6. The first 23 strings (F1–D♯3) are
// wound; above them plain music wire, 0.011″ to G3 and 0.009″ above.

export const speakingLength = (key) => 0.17 + (88 - key) * 0.0117;
export const isWound = (key) => key <= 51;

function interpLog(key, pts) {
  for (let i = 1; i < pts.length; i++) if (key <= pts[i][0] || i === pts.length - 1) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], t = Math.min(1, Math.max(0, (key - x0) / (x1 - x0)));
    return Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0)));
  }
}

// Linear density of a string with a round-wire winding of diameter w on a core d.
function windMu(d, D) { const w = (D - d) / 2; return (STEEL.rho * Math.PI * d * d) / 4 + (WIND_RHO * Math.PI * Math.PI * w * (d + w)) / 4; }

// Gauge: plain wire, or a wound string whose overall diameter follows a
// replacement set and whose core is chosen to give the measured inharmonicity.
export function gauge(key) {
  if (!isWound(key)) { const d = key >= 56 ? 0.2286e-3 : 0.2794e-3; return { wound: false, d, D: d, mu: (STEEL.rho * Math.PI * d * d) / 4 }; }
  const D = key <= 38 ? 0.813e-3 : key <= 43 ? 0.711e-3 : 0.559e-3;
  const L = speakingLength(key), f = keyFreq(key), Bt = interpLog(key, [[29, 5e-4], [34, 2e-4], [51, 9.5e-5]]);
  const B = (d) => (Math.PI ** 3 * STEEL.E * d ** 4) / (64 * windMu(d, D) * (2 * L * f) ** 2 * L * L);
  let lo = 0.1 * D, hi = 0.98 * D;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (B(m) < Bt) lo = m; else hi = m; }
  const d = (lo + hi) / 2;
  return { wound: true, d, D, mu: windMu(d, D) };
}

// Quasi-static depth of the rubber tip under force F (Hertz, F = K δ^1.5).
export const tipK = (P) => TUNE_FORCE / (P.tip * 1e-3) ** 1.5;
export const tipDepth = (F, P) => (Math.max(0, F) / tipK(P)) ** (2 / 3);

// Extra string length from the wrap: the squeezed rubber bends the string
// over the stud's edge by its own compression δ within the tip's half-width a,
// ΔL = δ²/2a. (The anvil's static depression g adds g²/2L more.)
export const wrapLength = (F, P) => tipDepth(F, P) ** 2 / (2 * P.wrap * 1e-3);

// Everything about one key's string that does not depend on the sample rate.
export function stringDesign(key, P) {
  const f0 = keyFreq(key), L = speakingLength(key), Ln = NONSPEAK * L, g = gauge(key);
  const A = (Math.PI * g.d * g.d) / 4, EA = STEEL.E * A, EI = P.stiff * STEEL.E * (Math.PI * g.d ** 4) / 64;
  // Tuned held down at TUNE_FORCE: f1 = (1/2L)·√(T/μ)·√(1 + π²EI/TL²) exactly for a pinned stiff string.
  const T = g.mu * (2 * L * f0) ** 2 - (Math.PI ** 2 * EI) / (L * L);
  const gap = P.gap * 1e-3;
  const dLnom = (gap * gap) / (2 * L) + wrapLength(TUNE_FORCE, P);
  const dTnom = (EA * dLnom) / L, T0 = T - dTnom;   // T0: the straight string at rest
  const B = (Math.PI ** 2 * EI) / (T * L * L);
  return {
    key, f0, L, Ln, ...g, A, EA, EI, T, T0, dTnom, dLnom, gap, B,
    stress: T / A, c: Math.sqrt(T / g.mu),
    mag: (g.d / 0.2286e-3) ** 2,                    // steel cross-section under the pickup, re a 0.009″ wire
    pull: T * gap * (1 / L + 1 / Ln),               // force the string exerts to lift off the anvil
    fRelease: f0 * L / (L + Ln),                    // ideal full-length pitch after release
  };
}

// Partial n of the held string, f_n = n f0 √((1 + B n²)/(1 + B)), and its decay rate.
export function speakingFreq(n, S) { return n * S.f0 * Math.sqrt((1 + S.B * n * n) / (1 + S.B)); }
export function sigma1(f0, P) { return (Math.log(1000) / P.t60) * (f0 / 110) ** 0.6; }
export function modeSigma(f, f0, P) { return sigma1(f0, P) + P.hf * Math.max(0, (f / 1000) ** 2 - (f0 / 1000) ** 2); }

// Pitch change (cents) of the held string for a tension change dT, and for a
// key force F through ΔT = EA·ΔL/L.
export function tensionCents(S, dT) {
  const r = (S.T + dT + (Math.PI ** 2 * S.EI) / (S.L * S.L)) / (S.T + (Math.PI ** 2 * S.EI) / (S.L * S.L));
  return 600 * Math.log2(r);
}
export function pressureTension(S, F, P) { return (S.EA * (wrapLength(F, P) - wrapLength(TUNE_FORCE, P))) / S.L; }
export function pressureCents(key, F, P) { const S = stringDesign(key, P); return tensionCents(S, pressureTension(S, F, P)); }

// Kirchhoff–Carrier for one mode of amplitude A: a Duffing oscillator with
// Δω/ω = 3 EA k² A² / 32 T (k = nπ/L, flexible string).
export function duffingShift(S, n, A) { const k = (n * Math.PI) / S.L; return (3 * S.EA * k * k * A * A) / (32 * S.T); }

// ---------------------------------------------------------------------------
// Pickups. Two long bars across all strings: the upper ("bridge") pickup over
// the strings close to the tailpiece, tilted, and the lower ("centre") one
// under the strings, further in (Gabrielli et al. 2013, §2.1). Both bars are
// slanted, so each key sees them at its own distance x from the tailpiece.

export function pickupX(key, P) {
  const L = speakingLength(key), lim = (x) => Math.min(0.95 * L, Math.max(0.003, x));
  return { lower: lim((P.xLower + (60 - key) * 0.1525) * 1e-2), upper: lim((P.xUpper + (60 - key) * 0.0254) * 1e-2) };
}
// Signs of the two pickups in the mix: the D6 switches give one pickup, or both
// with the polarity of one reversed or not.
export function pickupMix(sel) {
  return { lower: [1, 0], upper: [0, 1], sum: [1, 1], diff: [1, -1] }[sel] || [1, 1];
}
// The pickup's flux, relative to rest, for a string that has moved x field
// depths towards its pole: e^x − 1. The exponential is a fit near the rest
// position (Gabrielli et al., Remaggi et al.); within about a field depth of
// rest the string reaches the pole's near field, where the flux can grow no
// faster than it does at the face, so beyond x = 1 it continues along its
// tangent. (Unbounded, a 2 mm gap and a 0.5 mm field gave e⁴: 55× the gain.)
export const fieldFlux = (x) => (x <= 1 ? Math.expm1(x) : Math.E - 1 + Math.E * (x - 1));
// Output level at the default gap whatever the gap: the string's swing, and so
// the signal, is proportional to g, and this matches the levels (as a player
// would reset the amplifier) so the gap changes the touch, not the volume.
export const GAP_REF = 0.5e-3;

// A pickup hears mode n through its shape at x, averaged over the pole's width.
export function pickupWeight(n, x, L) {
  const u = (n * Math.PI * POLE_WIDTH) / (2 * L);
  return Math.sin((n * Math.PI * x) / L) * (u > 1e-9 ? Math.sin(u) / u : 1);
}
// Comb response of the current pickup selection over the first nMax partials.
export function pickupComb(key, P, nMax = 40) {
  const L = speakingLength(key), X = pickupX(key, P), [gl, gu] = pickupMix(P.pickup);
  return Array.from({ length: nMax }, (_, i) => gl * pickupWeight(i + 1, X.lower, L) + gu * pickupWeight(i + 1, X.upper, L));
}

// ---------------------------------------------------------------------------
// Tone switches. Each tab adds a network across the amplifier input (Gabrielli
// et al. 2013, Table 3): soft R‖C 30 kΩ‖0.1 µF, medium 10 kΩ‖15 nF, treble
// 2 H‖4.7 nF, brilliant 0.6 H. Fed from the pickups' source resistance R_p,
//   H(s) = 1 / (1 + R_p Y(s)),  Y = Σ (selected admittances),
// and since every Y here is a mix of s·C, 1/R and 1/(sL),
//   H(s) = s / (R_p C s² + (1 + R_p G) s + R_p Γ),  C = ΣC, G = Σ1/R, Γ = Σ1/L,
// a single second-order section for any combination. No tab: silence.

export const TONE_NET = {
  soft: { C: 0.1e-6, G: 1 / 30e3, Gam: 0 },
  medium: { C: 15e-9, G: 1 / 10e3, Gam: 0 },
  treble: { C: 4.7e-9, G: 0, Gam: 1 / 2 },
  brilliant: { C: 0, G: 0, Gam: 1 / 0.6 },
};
export function toneAnalog(P) {
  let C = 0, G = 0, Gam = 0, any = false;
  for (const k of Object.keys(TONE_NET)) if (P[k]) { C += TONE_NET[k].C; G += TONE_NET[k].G; Gam += TONE_NET[k].Gam; any = true; }
  return { any, a2: PICKUP_R * C, a1: 1 + PICKUP_R * G, a0: PICKUP_R * Gam }; // H = s / (a2 s² + a1 s + a0)
}
export function toneResponse(f, P) {
  const t = toneAnalog(P);
  if (!t.any) return 0;
  const w = 2 * Math.PI * f, re = t.a0 - t.a2 * w * w, im = t.a1 * w;
  return w / Math.hypot(re, im);
}
// Bilinear transform (prewarped at 1 kHz) → { b0, b1, b2, a1, a2 } for y = (b0 + b1 z⁻¹ + b2 z⁻²)/(1 + a1 z⁻¹ + a2 z⁻²).
export function toneBiquad(P, fs) {
  const t = toneAnalog(P);
  if (!t.any) return { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
  const w0 = 2 * Math.PI * 1000, K = w0 / Math.tan(w0 / (2 * fs));
  const A0 = t.a2 * K * K + t.a1 * K + t.a0, A1 = 2 * t.a0 - 2 * t.a2 * K * K, A2 = t.a2 * K * K - t.a1 * K + t.a0;
  return { b0: K / A0, b1: 0, b2: -K / A0, a1: A1 / A0, a2: A2 / A0 };
}

// ---------------------------------------------------------------------------
// One damped mode q'' + 2σq' + ω0²q = f, discretised impulse-invariantly:
//   q[n+1] = a1 q[n] − a2 q[n−1] + b f[n]
// (also for overdamped modes, which the yarn makes of the short nonspeaking length).
export function osc(f, sigma, fs) {
  const k = 1 / fs, w0 = 2 * Math.PI * f;
  if (sigma < w0) {
    const wd = Math.sqrt(w0 * w0 - sigma * sigma), r = Math.exp(-sigma * k);
    return { a1: 2 * r * Math.cos(wd * k), a2: r * r, b: (k * r * Math.sin(wd * k)) / wd };
  }
  const sq = Math.sqrt(sigma * sigma - w0 * w0), l1 = -sigma + sq, l2 = -sigma - sq, e1 = Math.exp(l1 * k), e2 = Math.exp(l2 * k);
  return { a1: e1 + e2, a2: Math.exp(-2 * sigma * k), b: sq > 1e-9 ? (k * (e1 - e2)) / (l1 - l2) : k * k * Math.exp(-sigma * k) };
}

// The modal model of one key for the engine (and the views).
export function keyModel(key, P, fs) {
  const S = stringDesign(key, P), { L, Ln, mu } = S;
  // speaking modes: pinned at the tailpiece and at the anvil, tension T
  const modes = [];
  for (let n = 1; n <= N_MAX; n++) {
    const f = speakingFreq(n, S);
    if (f > F_MAX && n > 1) break;
    const kn = (n * Math.PI) / L, sig = modeSigma(f, S.f0, P), o = osc(f, sig, fs);
    modes.push({ n, f, sigma: sig, ...o, kn });
  }
  // yarn modes: quarter-wave, free at the anvil, pinned at the tuning pin, tension T0.
  // Truncation stiffens the yarn's static spring (Σ1/(m−½)² < π²/2); softening all
  // its modes by that ratio restores the exact static stiffness T0/Ln.
  const yarn = [];
  for (let m = 1; m <= M_MAX; m++) {
    const km = ((m - 0.5) * Math.PI) / Ln, f = Math.sqrt((S.T0 * km * km + S.EI * km ** 4) / mu) / (2 * Math.PI);
    if (f > F_MAX && m > 1) break;
    yarn.push({ m, km, f });
  }
  let sum = 0; for (const y of yarn) sum += 1 / (y.m - 0.5) ** 2;
  const soften = Math.sqrt(sum / (Math.PI * Math.PI / 2));
  for (const y of yarn) {
    y.f *= soften;
    y.sigma = P.yarn + modeSigma(y.f, S.f0, P);
    Object.assign(y, osc(y.f, y.sigma, fs));
  }
  return { S, modes, yarn, X: pickupX(key, P) };
}

// Frequencies of the released string, from the same component modes: the
// undamped eigenproblem of the coupled system with the anvil open. Used by the
// views and the tests (the engine finds them by itself).
export function releasedFreqs(key, P, count = 6) {
  const fs = 48000, { S, modes, yarn } = keyModel(key, P, fs), { L, Ln, mu, T0 } = S;
  // DOFs: s, q_1..q_N, r_1..r_M with s = Σ r: eliminate s → DOFs (q, r).
  const N = modes.length, M = yarn.length, n = N + M;
  const Mm = new Float64Array(n * n), K = new Float64Array(n * n);
  const ms = (mu * L) / 3, nu = (mu * Ln) / 2;
  for (let i = 0; i < N; i++) {
    const c = (mu * L * (i % 2 ? -1 : 1)) / ((i + 1) * Math.PI);
    const kn = modes[i].kn;
    Mm[i * n + i] = (mu * L) / 2; K[i * n + i] = (L / 2) * (T0 * kn * kn + S.EI * kn ** 4);
    for (let j = 0; j < M; j++) { Mm[i * n + N + j] += c; Mm[(N + j) * n + i] += c; }
  }
  for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) {
    Mm[(N + a) * n + N + b] += ms + (a === b ? nu : 0);
    K[(N + a) * n + N + b] += T0 / L + (a === b ? nu * (2 * Math.PI * yarn[a].f) ** 2 : 0);
  }
  const { lambda } = genEig(K, Mm, n, 0);
  return Array.from(lambda.slice(0, count), (l) => Math.sqrt(l) / (2 * Math.PI));
}
