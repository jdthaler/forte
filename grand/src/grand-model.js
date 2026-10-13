// grand-model.js — the physics of an electric grand after the Yamaha CP-70:
// real piano strings and hammers on a cast frame, no soundboard, and a piezo
// under the bridge that senses the force the strings exert on it. Pure
// functions (no audio, no DOM), shared by the engine, the page, the tests and
// the render tool. SI units throughout.
//
// Each key is 1 or 2 stiff strings (3 on the "acoustic grand" stringing),
// pinned at the agraffe (x = 0) and the bridge (x = L), each with two
// transverse polarisations: V (normal to the frame, along the piezo's axis)
// and H (parallel to it). With mass-normalised shapes φₙ = √(2/μL) sin kₙx,
// kₙ = nπ/L, a stiff string has
//
//   ωₙ² = (T kₙ² + EI kₙ⁴)/μ,   fₙ = n f₀ √(1 + B n²)/√(1 + B),   B = π² EI/(T L²)
//
// and pushes on the bridge with  F = Σ bₙ qₙ,  bₙ = ±√(2/μL)(T kₙ + EI kₙ³)
// (T ∂y/∂x plus the bending shear at the pinned end). That force is what
// the piezo measures. Relative to the string's displacement it weights
// partial n by n(1 + B n²)/(1 + B): the piezo hears the strings bright.
//
// The bridge moves with velocity G·F (G = its admittance, s/kg). In modal
// form that is the rank-one damping matrix c cᵀ, cₙ = √G bₙ/ωₙ, shared by
// every mode of every unison string in one polarisation. Each mode on its own
// loses σ = G (T + EI kₙ²)/L to the bridge; in-phase unison motion loses N
// times that and antiphase motion none, which is Weinreich's double decay.
//
// The acoustic alternative is a soundboard: a simply supported plate whose
// modes give the bridge admittance Y(ω) (so each partial drains at its own
// rate) and radiate to two far-field microphones (Rayleigh integral).

import { keyFreq } from '../../shared/dsp.js';
import { hammerDefaults, scaleLength, scaleDiameter, windingMass } from '../../piano/src/physics.js';

export { keyFreq };
export const KEY_LO = 28, KEY_HI = 100; // 73 keys, E1–E7
export const STEEL = { E: 2.0e11, rho: 7850, strength: 2.2e9 };
const PI = Math.PI, TAU = 2 * PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Per-note piezo sensitivity trim, as a technician voices a scale: up to
// +4.5 dB in the top octave and a half, where short strings take little energy
// from the hammer (its contact outlasts their period).
export const pickupTrim = (m) => 10 ** (Math.min(4.5, 0.3 * Math.max(0, m - 76)) / 20);

// Key velocity 0..1 → hammer speed, 0.25 … 6 m/s (pp ≈ 0.5, ff ≈ 5 m/s: Askenfelt & Jansson 1991).
export const hammerSpeed = (vel) => 0.25 * 24 ** clamp(vel, 0, 1);

// ---------------------------------------------------------------------------
// Scale design

// CP-70 short scale: piano-like L ∝ f^−0.9 in the treble, folded into the
// harp's depth so that the longest (E1) string is 0.68 m (26¾ in, as published).
export function cpLength(m) {
  const Lf = 0.55 * 2 ** ((-0.9 * (m - 60)) / 12);
  return Lf / (1 + (Lf / 0.68) ** 6) ** (1 / 6);
}
// Plain steel wire, thickening into the bass (cores of the wound strings).
export function cpCore(m) { return 1.065e-3 * 2 ** ((-(m < 60 ? 0.18 : 0.12) * (m - 60)) / 12); }
export const CP_WOUND_T = 500; // N, target tension of the copper-wound bass strings

// Strings per note. CP-70: one string on the lowest 15 keys (E1–F♯2), two above.
export function stringCount(m, stringing) {
  if (stringing === 'single') return 1;
  if (stringing === 'grand') return m <= 30 ? 1 : m <= 44 ? 2 : 3;
  return m <= 42 ? 1 : 2;
}

// Deterministic "tuner's error" in [0, 1) per key, so neighbouring unisons
// do not all beat at the same rate.
export function jitter(m, s = 0) { const x = Math.sin(m * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); }

// Geometry, tension and inharmonicity of key m. The tension is solved so the
// stiff string's fundamental lands on 12-TET: T = 4L²f₀²μ − EI k₁².
export function stringScale(m, P) {
  const f0 = keyFreq(m);
  let L, d, mu, muCore, wound;
  if (P.scale === 'concert') {
    L = scaleLength(m); d = scaleDiameter(m);
    muCore = (STEEL.rho * PI * d * d) / 4;
    const dMu = windingMass(m);
    mu = muCore + dMu; wound = dMu > 0;
  } else {
    L = cpLength(m); d = cpCore(m);
    muCore = (STEEL.rho * PI * d * d) / 4;
    const Tplain = 4 * L * L * f0 * f0 * muCore;
    wound = Tplain < 0.85 * CP_WOUND_T;
    mu = wound ? CP_WOUND_T / (4 * L * L * f0 * f0) : muCore;
  }
  const EI = (STEEL.E * PI * d ** 4 * (P.stiffness ?? 1)) / 64;
  const k1 = PI / L, Tflex = 4 * L * L * f0 * f0 * mu;
  const T = Math.max(0.05 * Tflex, Tflex - EI * k1 * k1);
  const B = (PI * PI * EI) / (T * L * L);
  // outer diameter of a copper winding at 75 % packing (for the info panel)
  const dOut = wound ? Math.sqrt(d * d + (4 * (mu - muCore)) / (0.75 * 8900 * PI)) : d;
  return { key: m, f0, L, d, dOut, mu, muCore, wound, T, EI, B, stress: T / ((PI * d * d) / 4), cT: Math.sqrt(T / mu) };
}

// Frequency of partial n of a pinned stiff string.
export function partialFreq(S, n) { const k = (n * PI) / S.L; return Math.sqrt((S.T * k * k + S.EI * k ** 4) / S.mu) / TAU; }

// Fourier transform of a Hann window of total width w (the felt's contact patch).
function hannFT(k, w) {
  const a = (k * w) / 2;
  if (a < 1e-6) return 1;
  const den = 1 - (a / PI) ** 2;
  return Math.abs(den) < 1e-6 ? 0.5 : Math.sin(a) / a / den;
}

// ---------------------------------------------------------------------------
// The acoustic alternative: a soundboard
//
// An equivalent isotropic, simply supported plate (spruce with ribs and
// bridge smeared in): 1.3 × 0.77 m, ρh = 6.7 kg/m², D = 1040 N·m at 9 mm, loss
// factor 3 %. That gives a first mode at 45 Hz, ~1 mode per 25 Hz and a mean
// bridge conductance 1/(8√(Dρh)) = 1.5e-3 s/kg, in the range measured on
// piano soundboards. The bridge's own mass (50 g at the drive point) makes
// the board mass-like above ~2 kHz.

export const BOARD = { a: 1.3, b: 0.77, D: 1040, rhoh: 6.7, eta: 0.03, mb: 0.05, fmax: 6000, maxModes: 360, c: 343, theta: 35, ell: 0.5 };
export const MIC_TRIM = 0.75; // the mics sit ~4 dB below the piezo, so the board's hottest note (E4) stays under 0.6
export const SEGMENTS = 3; // the bridge drives the board at three points (bass, middle, treble)
export const keySegment = (m) => (m < 52 ? 0 : m < 76 ? 1 : 2);
export function bridgePoint(s) { const t = (s + 0.5) / SEGMENTS; return [BOARD.a * (0.15 + 0.7 * t), BOARD.b * (0.72 - 0.44 * t)]; }

// ∫₀ᵃ sin(qx) e^{iκx} dx, as [re, im].
export function sinFT(q, kap, a) {
  const E = (beta) => { // (e^{iβa} − 1)/(iβ)
    if (Math.abs(beta) < 1e-9) return [a, 0];
    const c = Math.cos(beta * a) - 1, s = Math.sin(beta * a);
    return [s / beta, -c / beta];
  };
  const [ar, ai] = E(q + kap), [br, bi] = E(kap - q);
  // (A − B)/(2i) = −i(A − B)/2
  return [(ai - bi) / 2, -(ar - br) / 2];
}

export function boardModel(P) {
  const s = (P.boardH ?? 9) / 9;
  const D = BOARD.D * s ** 3, rhoh = BOARD.rhoh * s, { a, b } = BOARD;
  const cB = PI * PI * Math.sqrt(D / rhoh), wMax = TAU * BOARD.fmax;
  const list = [];
  for (let m = 1; cB * (m / a) ** 2 < wMax; m++) {
    for (let n = 1; ; n++) {
      const w = cB * ((m / a) ** 2 + (n / b) ** 2);
      if (w >= wMax) break;
      list.push({ m, n, w });
    }
  }
  list.sort((x, y) => x.w - y.w);
  if (list.length > BOARD.maxModes) list.length = BOARD.maxModes;
  const K = list.length, N = 2 / Math.sqrt(rhoh * a * b);
  const omega = new Float64Array(K), sigma = new Float64Array(K), phi = new Float64Array(K * SEGMENTS);
  const RL = new Float64Array(K), RR = new Float64Array(K), mm = new Uint16Array(K), nn = new Uint16Array(K);
  const pts = Array.from({ length: SEGMENTS }, (_, i) => bridgePoint(i));
  const th = (BOARD.theta * PI) / 180;
  const mics = [(200 * PI) / 180, (-20 * PI) / 180]; // left mic leans toward the bass end, right toward the treble
  for (let k = 0; k < K; k++) {
    const { m, n, w } = list[k];
    omega[k] = w; sigma[k] = (BOARD.eta * w) / 2; mm[k] = m; nn[k] = n;
    for (let i = 0; i < SEGMENTS; i++) phi[k * SEGMENTS + i] = N * Math.sin((m * PI * pts[i][0]) / a) * Math.sin((n * PI * pts[i][1]) / b);
    // Far-field pressure of a baffled plate mode (Rayleigh integral) toward
    // direction (θ, ψ): ∝ ∫∫ φ e^{iκ·r} dA at κ = (ω/c) sinθ (cos ψ, sin ψ).
    const kap = (w / BOARD.c) * Math.sin(th);
    // The board is not baffled: below c/(2πℓ) its two faces cancel (the acoustic
    // short circuit). First-order high-pass on each mode's radiation.
    const kl = (w / BOARD.c) * BOARD.ell, shortCircuit = kl / Math.hypot(1, kl);
    for (let j = 0; j < 2; j++) {
      const [xr, xi] = sinFT((m * PI) / a, kap * Math.cos(mics[j]), a);
      const [yr, yi] = sinFT((n * PI) / b, kap * Math.sin(mics[j]), b);
      const pr = xr * yr - xi * yi, pi = xr * yi + xi * yr;
      const g = N * Math.hypot(pr, pi) * Math.sign(pr + pi || 1); // phase kept as a sign only
      (j ? RR : RL)[k] = g * shortCircuit;
    }
  }
  const Ginf = 1 / (8 * Math.sqrt(D * rhoh));
  const B = { D, rhoh, K, omega, sigma, phi, RL, RR, m: mm, n: nn, Ginf, mb: BOARD.mb, fBridge: 1 / (TAU * BOARD.mb * Ginf),
    f11: list.length ? list[0].w / TAU : 0, density: ((a * b) / 2) * Math.sqrt(rhoh / D), fc: ((BOARD.c ** 2) / TAU) * Math.sqrt(rhoh / D) };
  // Microphone gain, a recording engineer's trim set once on the 9 mm board:
  // there, a typical note is about as loud through the mics as through the
  // piezo. Other boards are then louder or quieter, as physics has it.
  if (!micRef) micRef = s === 1 ? B : boardModel({ boardH: 9 });
  B.micGain = MIC_TRIM / meanResponse(micRef);
  return B;
}
let micRef = null;

// RMS force → pressure response over a typical string spectrum (flat to 300 Hz, then amplitude ∝ 1/f).
function meanResponse(B) {
  let e = 0, nf = 0;
  for (let i = 0; i < 96; i++) { const f = 80 * 60 ** (i / 95), w = 1 / (1 + (f / 300) ** 2); e += w * boardResponse(B, 1, f, 0) ** 2; nf += w; }
  return Math.sqrt(e / nf);
}

// Driving-point admittance of the board at bridge point `seg` (modal sum,
// infinite-plate value above the last mode), then the bridge mass in series:
// Y_tot = Y / (1 + iω m_b Y). Returns [Re, Im] in s/kg.
export function boardMobility(B, seg, f) {
  const w = TAU * f;
  let re = 0, im = 0;
  if (f > BOARD.fmax) re = B.Ginf;
  else {
    for (let k = 0; k < B.K; k++) {
      const p2 = B.phi[k * SEGMENTS + seg] ** 2, d = B.omega[k] ** 2 - w * w, s2 = 2 * B.sigma[k] * w;
      const den = d * d + s2 * s2; // iω/(d + i s2) = (ω s2 + iω d)/den
      re += (p2 * w * s2) / den; im += (p2 * w * d) / den;
    }
  }
  // 1/(1/Y + iω m_b)
  const yy = re * re + im * im, zr = re / yy, zi = -im / yy + w * B.mb, zz = zr * zr + zi * zi;
  return [zr / zz, -zi / zz];
}

// Pressure at microphone `mic` per newton of bridge force at segment `seg`
// (magnitude, before micGain): bridge-mass low-pass, then Σ R φ (−ω²)/(ωₖ² − ω² + 2iσω).
export function boardResponse(B, seg, f, mic) {
  const w = TAU * f, R = mic ? B.RR : B.RL;
  let re = 0, im = 0;
  for (let k = 0; k < B.K; k++) {
    const g = R[k] * B.phi[k * SEGMENTS + seg] * -w * w, d = B.omega[k] ** 2 - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
    re += (g * d) / den; im -= (g * s2) / den;
  }
  return Math.hypot(re, im) / Math.hypot(1, w * B.mb * B.Ginf);
}

// ---------------------------------------------------------------------------
// One key: strings × polarisations × partials, flattened for the engine

export const LOSS = { b1: 0.35, b3: 2.0e-9 }; // σ = b1 + b3 ω² (air + internal friction, cf. Chaigne & Askenfelt 1994)

export function keyModel(m, P, board = null, fs = 48000) {
  const S = stringScale(m, P), ns = stringCount(m, P.stringing);
  const hd = hammerDefaults(m);
  const beta = clamp(P.strike, 0.02, 0.5), xh = beta * S.L;
  const wH = Math.min(hd.width, 2 * xh, 0.5 * S.L);
  const fmax = Math.min(P.maxFreq ?? 10000, 0.45 * fs);
  const alpha = ((P.tilt ?? 0) * PI) / 180, ca = Math.cos(alpha), sa = Math.sin(alpha);
  const dk = (P.detune ?? 0) * (0.6 + 0.8 * jitter(m));
  const det = ns === 1 ? [0] : ns === 2 ? [-dk / 2, dk / 2] : [-dk / 2, 0, dk / 2];
  // A spring-like end support of stiffness K lengthens the string by T/K, so
  // the H polarisation (sideways bridge stiffness K_H) sits flat by T/(K_H L).
  const hShift = -S.T / ((P.kH ?? 1e7) * S.L);
  const wound = S.wound ? 1.5 : 1;
  const b1 = LOSS.b1 * (P.loss ?? 1) * wound, b3 = LOSS.b3 * (P.loss ?? 1) * wound * wound;
  const seg = keySegment(m), useBoard = P.mount === 'board' && board;
  const GH = (P.hRatio ?? 0.2) * (useBoard ? board.Ginf : P.gFrame);
  const xd = 0.16 * S.L, wd = Math.min(0.025, 0.3 * S.L);
  const nrm = Math.sqrt(2 / (S.mu * S.L));

  const partials = [];
  for (let n = 1; ; n++) {
    const k = (n * PI) / S.L, w = Math.sqrt((S.T * k * k + S.EI * k ** 4) / S.mu), f = w / TAU;
    if (f >= fmax && n > 1) break;
    const b = nrm * (n % 2 ? -1 : 1) * (S.T * k + S.EI * k ** 3);
    const sigInt = b1 + b3 * w * w;
    let GV = P.gFrame;
    let bridgeV;
    if (useBoard) {
      GV = boardMobility(board, seg, f)[0];
      // strong coupling: a partial cannot drain faster than the board can lose it (Gough 1981)
      bridgeV = Math.min((GV * (S.T + S.EI * k * k)) / S.L, (BOARD.eta * w) / 4);
      GV = (bridgeV * S.L) / (S.T + S.EI * k * k);
    } else bridgeV = (GV * (S.T + S.EI * k * k)) / S.L;
    const bridgeH = (GH * (S.T + S.EI * k * k)) / S.L;
    partials.push({
      n, k, f, w, b, sigInt, GV, GH, bridgeV, bridgeH,
      fH: f * (1 + hShift),
      phiH: nrm * Math.sin(k * xh) * hannFT(k, wH),
      damp: 1 - (Math.sin(k * wd) * Math.cos(2 * k * xd)) / (k * wd), // 2⟨sin²kx⟩ over the damper felt
      stretch: 1200 * Math.log2(f / (n * S.f0)),
    });
  }

  // Flatten: all V modes (string by string), then all H modes.
  const np = partials.length, N = 2 * ns * np;
  const freq = new Float64Array(N), sigma = new Float64Array(N), wv = new Float64Array(N), c = new Float64Array(N);
  const bf = new Float64Array(N), damp = new Float64Array(N), str = new Uint8Array(N), idx = new Uint16Array(N);
  let i = 0;
  for (let pol = 0; pol < 2; pol++) {
    for (let s = 0; s < ns; s++) {
      const dS = 2 ** (det[s] / 1200);
      for (const p of partials) {
        const f = (pol ? p.fH : p.f) * dS, w = TAU * f;
        freq[i] = f; sigma[i] = p.sigInt;
        wv[i] = ((pol ? sa : ca) * p.phiH) / ns;
        c[i] = (Math.sqrt(pol ? p.GH : p.GV) * p.b) / w;
        bf[i] = p.b; damp[i] = p.damp; str[i] = s; idx[i] = p.n;
        i++;
      }
    }
  }
  return {
    key: m, S, ns, det, partials, seg, beta, xh, wH, xd,
    hammer: { mass: hd.mass * (P.hammerMass ?? 1) * ns, K: hd.K * (P.hardness ?? 1) * ns, p: hd.p, alpha: 5e-5 },
    hasDamper: m <= 88,
    n: N, nV: ns * np, freq, sigma, w: wv, c, bf, damp, str, idx,
  };
}

// Decay rates of partial p (for the table): the prompt sound is the in-phase
// V motion the hammer starts, draining ns × the single-string bridge rate; the
// aftersound is the slowest component: antiphase V (no bridge drain, for a
// perfect unison) or H, whichever is slower.
export function decayRates(p, ns) {
  const prompt = p.sigInt + ns * p.bridgeV;
  const after = Math.min(prompt, ns > 1 ? p.sigInt : p.sigInt + p.bridgeH);
  return { prompt, after };
}
