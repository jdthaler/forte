// pipes-model.js — the physics of a Baroque organ's flue pipes and their wind,
// kept free of audio and DOM so that the page, the engine, the tests and the
// tools can all use it.
//
//   reservoir ─▶ trunk ─▶ wind chest P_c ─▶ key's pallet ─▶ groove ─▶ slider ─▶ pipe foot p
//                                                                                 │
//      flue: a jet U_j = √(2p/ρ) crosses the mouth (cut-up W) to the labium ◀─────┘
//        │  deflected by the mouth's acoustic flow, τ = W/c_p earlier (c_p = 0.4 U_j)
//        ▼
//      the jet splits on the labium: Q_in = bHU_j (1 + tanh((η − y₀)/b))
//        │  Δp = (ρδ_d/S_m) dQ_in/dt − ½ρ(v/α_vc)²sgn v   (jet drive, vortex shedding)
//        ▼
//      the pipe: modes of an open or stopped tube, with end corrections and losses ─▶ sound
//
// The jet-drive model is the one of Verge et al. (1994, 1997), Fabre & Hirschberg (2000) and
// Auvray, Fabre & Lagrée (2012), with Fletcher's (1976) and Coltman's (1968, 1976) picture of the
// jet as a delayed, amplified response to the flow through the mouth.

import { keyFreq } from '../../shared/dsp.js';

export { keyFreq };
export const AIR = { rho: 1.2, c: 343, nu: 1.51e-5, gamma: 1.4, Pr: 0.71 };
export const KEY_LO = 36, KEY_HI = 89;      // C–f³, 54 keys
export const P_NOM = 700;                   // Pa (71 mm of water): the wind the pipes are voiced for
export const U_NOM = Math.sqrt((2 * P_NOM) / AIR.rho);
export const CP = 0.4;                      // jet phase velocity over jet velocity (measured ≈ 0.4; models use 0.4–0.5)
export const PHI_C = 3;                     // the jet's response rolls off once it carries ωτ > 3 rad of a wave across the mouth
export const ALPHA_VC = 0.6;                // vena contracta of the flow separating at the labium (vortex-shedding loss)
export const THETA_OPEN = 14;               // voicing: U_j/(fW) at the default wind, open pipes
export const THETA_STOPPED = 10;            // and stopped
export const GAIN = 6;                      // voicing: the jet's small-signal loop gain on the fundamental's resonance (c¹ up)
export const GAIN_BASS = 0.4;               // below c¹ the voicer gives it more, ∝ f^−0.4, so the big pipes speak sooner
export const F_MAX = 15000;                 // Hz: modes above this are left out
export const MODES_OPEN = 10, MODES_STOPPED = 6; // and at most this many (harmonics 1–10; 1, 3 … 11)
const PI = Math.PI, TAU = 2 * PI;
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
// Organ-pitch names: C (36) … B (47), c (48) … b, c¹ (60), c² (72), c³ (84)
const SUP = ['', '¹', '²', '³', '⁴'];
export function organName(m) {
  const pc = NAMES[((m % 12) + 12) % 12], o = Math.floor(m / 12) - 4;
  return o < 0 ? pc : pc.toLowerCase() + SUP[o];
}

// ---------------------------------------------------------------------------
// Stops and ranks. Each key has six pipes: Principal 8′, Octave 4′, Gedackt 8′ and the Mixture's
// three ranks. `harm` is the pipe's pitch as a multiple of the key's 8′ pitch.
export const STOPS = [
  { id: 'principal', name: 'Principal 8′' },
  { id: 'octave', name: 'Octave 4′' },
  { id: 'gedackt', name: 'Gedackt 8′' },
  { id: 'mixture', name: 'Mixture III' },
];
export const RANKS = [
  { id: 'P8', stop: 0, stopped: false, scale: 1 },
  { id: 'O4', stop: 1, stopped: false, scale: 1 },
  { id: 'G8', stop: 2, stopped: true, scale: 0.85 },
  { id: 'M1', stop: 3, stopped: false, scale: 1 },
  { id: 'M2', stop: 3, stopped: false, scale: 1 },
  { id: 'M3', stop: 3, stopped: false, scale: 1 },
];
// The Mixture: three ranks of octaves and fifths that break back an octave at c, c¹ and c², so
// that its pipes stay between 392 Hz and 5.6 kHz (harmonics of the key's 8′ pitch).
export const MIXTURE = [
  { from: 36, h: [6, 8, 12] },   // C–B:   1⅓′ 1′ ⅔′  (19th, 22nd, 26th)
  { from: 48, h: [4, 6, 8] },    // c–b:   2′ 1⅓′ 1′
  { from: 60, h: [3, 4, 6] },    // c¹–b¹: 2⅔′ 2′ 1⅓′
  { from: 72, h: [2, 3, 4] },    // c²–f³: 4′ 2⅔′ 2′
];
export function mixtureRanks(key) {
  let m = MIXTURE[0];
  for (const x of MIXTURE) if (key >= x.from) m = x;
  return m.h;
}
export function rankHarm(key, r) {
  if (r === 0 || r === 2) return 1;
  if (r === 1) return 2;
  return mixtureRanks(key)[r - 3];
}
// footage of a pipe sounding harmonic n of the 8′: 8/n feet, written as organists write it
export function footage(n) {
  const F = { 1: '8′', 2: '4′', 3: '2⅔′', 4: '2′', 6: '1⅓′', 8: '1′', 12: '⅔′' };
  return F[n] || `${(8 / n).toFixed(2)}′`;
}
// Which ranks the drawn stops engage.
export function engaged(P, on = new Array(RANKS.length)) {
  const s = [!!P.principal, !!P.octave, !!P.gedackt, !!P.mixture];
  for (let r = 0; r < RANKS.length; r++) on[r] = s[RANKS[r].stop];
  return on;
}
// Pipe frequency: keys in equal temperament at A = 440 Hz; the Mixture's fifths are pure (×3, ×6, ×12).
export const pipeFreq = (key, r) => keyFreq(key) * rankHarm(key, r);

// ---------------------------------------------------------------------------
// Scale (Mensur). Töpfer's normal scale: an open pipe sounding 8′ C (65.4 Hz) is 155.5 mm across,
// and the diameter halves on the 17th note (16 semitones), so D ∝ f^(−3/4) (a cross-section ratio
// of 1 : √8 per octave). The Gedackt is 0.85 × as wide at the same pitch. Every pipe's mouth is a
// quarter of its circumference wide; the flue (windway) is 1.2 mm high at 8′ C, ∝ D^(3/4).
export const SCALE = { D0: 0.1555, f0: keyFreq(36), exp: 0.75, mouth: 0.25, h0: 1.2e-3, hExp: 0.75 };
export const toepferD = (f) => SCALE.D0 * (f / SCALE.f0) ** -SCALE.exp;

// Rayleigh's conductivity of an elliptic hole (semi-axes a ≥ b) in a thin wall: K = 2a·AGM(1, b/a)
// (= πa/K(e), K the complete elliptic integral; 2r for a circle).
export function agm(x, y) { for (let i = 0; i < 30 && Math.abs(x - y) > 1e-15 * x; i++) [x, y] = [(x + y) / 2, Math.sqrt(x * y)]; return x; }
export function ellipseConductivity(a, b) { if (b > a) [a, b] = [b, a]; return 2 * a * agm(1, b / a); }
// The mouth's end correction: the pipe's area over the conductivity of the mouth, taken as an
// ellipse of the mouth's area and aspect (H × W). For the usual diapason mouth (W = H/4, H = πD/4)
// this is 1.58 D, close to the "nearly 1.5 D" Ingerslev & Frobenius measured (Fletcher 1998).
export function mouthCorrection(Sp, H, W) {
  const k = 2 / Math.sqrt(PI);
  return Sp / ellipseConductivity((k * H) / 2, (k * W) / 2);
}
export const LS_END = 0.6133; // Levine & Schwinger (1948): unflanged open end, low-frequency limit, × radius

// Losses of mode n (amplitude decay rate σ, 1/s):
//  - the wall's viscous and thermal boundary layers (Kirchhoff): α = (1/ac)√(ων/2)(1 + (γ−1)/√Pr) per metre;
//  - radiation: each open end (and the mouth) radiates the mode's volume flow as a monopole,
//    W = ρω²Q²/8πc, against its energy ρL_eQ²/4S_p: σ = (ka)²c/4L_e per opening (|R| ≈ 1 − (ka)²/2).
export function wallAlpha(f, a) {
  const { c, nu, gamma, Pr } = AIR;
  return (Math.sqrt((TAU * f * nu) / 2) * (1 + (gamma - 1) / Math.sqrt(Pr))) / (a * c);
}
export function modeSigma(f, a, Le, openings) {
  const k = (TAU * f) / AIR.c;
  return AIR.c * wallAlpha(f, a) + (openings * (k * a) ** 2 * AIR.c) / (4 * Le);
}
// Mode frequencies of a tube of effective length L_e: open 1 : 2 : 3, stopped 1 : 3 : 5.
export const modeFreq = (n, Le, stopped) => (stopped ? ((2 * n - 1) * AIR.c) / (4 * Le) : (n * AIR.c) / (2 * Le));

// ---------------------------------------------------------------------------
// One pipe, voiced, for a sounding frequency f and the knobs P (cutup, gain, offset; defaults 1, 1, 0.4).
//  - Scale: Töpfer's diameter D (× 0.85 for the Gedackt), mouth width H = πD/4, flue h.
//  - Cut-up: W puts U_j/(fW) at θ (14 open, 10 stopped) at the default wind, W = U_nom/(θf).
//  - The jet: thickness b = 2h/5 (Bickley profile), dipole distance δ_d = (4/π)√(2hW) (Verge et
//    al. 1997), labium offset y₀ = offset × b.
//  - The jet's amplification A is what the voicer sets with the flue, languid and nicks: enough for
//    a small-signal loop gain of GAIN × gain on the fundamental's resonance.
//  - The length is cut so that the pipe sounds f at the default wind and cut-up: the phase the jet
//    adds pulls the pitch off the resonance, so the resonance is placed where the linear analysis
//    says the pipe will sound f (and opts.tune, measured in the engine, corrects the rest).
// The Cut-up knob then moves W on the pipe as cut: its length stays, so its mouth correction and
// its pitch change with it, and the voicer keeps the jet's gain.
export const voicedGain = (f) => GAIN * Math.max(1, (f / keyFreq(60)) ** -GAIN_BASS);
function modesFor(Le, a, stopped) {
  const openings = stopped ? 1 : 2, modes = [];
  for (let n = 1; n <= (stopped ? MODES_STOPPED : MODES_OPEN); n++) {
    const fn = modeFreq(n, Le, stopped);
    if (fn > F_MAX) break;
    const sig = modeSigma(fn, a, Le, openings);
    modes.push({ n, f: fn, om: TAU * fn, sigma: sig, Q: (TAU * fn) / (2 * sig), harm: stopped ? 2 * n - 1 : n });
  }
  return modes;
}
function jetGeometry(geo, W, off) {
  const { h, H } = geo, b = 0.4 * h, y0 = off * b, dd = (4 / PI) * Math.sqrt(2 * h * W), Sm = H * W;
  const sech2 = 1 / Math.cosh(y0 / b) ** 2;
  // the jet's gain per unit amplification: Δp = s·Kj·A·H_lp(s)·e^(−sτ)·Q_ac
  return { W, b, y0, dd, Sm, Kj: (AIR.rho * dd * H * h * sech2) / (Sm * Sm), dLm: mouthCorrection(geo.Sp, H, W) };
}
function setLength(pipe, Le) {
  pipe.Le = Le; pipe.M = (AIR.rho * Le) / (2 * pipe.geo.Sp); pipe.modes = modesFor(Le, pipe.geo.a, pipe.stopped);
}
function setGain(pipe, g) { // A for a loop gain g on the fundamental's resonance at the default wind
  const m1 = pipe.modes[0], tau = pipe.geo.W / (CP * U_NOM), lp = 1 / Math.hypot(1, (m1.om * tau) / PHI_C);
  pipe.A = (2 * m1.sigma * pipe.M * g) / (m1.om * pipe.Kj * lp);
}
export function pipeModel(f, stopped, P = {}, opts = {}) {
  const scale = opts.scale ?? (stopped ? 0.85 : 1);
  const cut = P.cutup ?? 1, gainK = P.gain ?? 1, off = P.offset ?? 0.4, g = voicedGain(f) * gainK;
  const D = toepferD(f) * scale, a = D / 2, Sp = PI * a * a, H = SCALE.mouth * PI * D;
  const h = SCALE.h0 * (D / SCALE.D0) ** SCALE.hExp;
  const theta = stopped ? THETA_STOPPED : THETA_OPEN;
  const W0 = opts.W ?? U_NOM / (theta * f);
  const geo = { D, a, Sp, H, h, stopped, dLt: stopped ? 0 : LS_END * a };
  const pipe = { f, stopped, theta, geo, A: 0, Kj: 0, M: 0, Le: 0, modes: null };
  // voice and cut at the default cut-up
  Object.assign(geo, jetGeometry(geo, W0, off)); pipe.Kj = geo.Kj;
  setLength(pipe, stopped ? AIR.c / (4 * f) : AIR.c / (2 * f));
  setGain(pipe, g);
  if (opts.retune !== false) {
    for (let it = 0; it < 8; it++) {
      const s = linearRoot(pipe, P_NOM, 0);
      if (!s) break;
      const k = f / (s.im / TAU);
      setLength(pipe, pipe.Le / k); setGain(pipe, g);
      if (Math.abs(k - 1) < 1e-8) break;
    }
  }
  if (opts.tune && opts.tune !== 1) { setLength(pipe, pipe.Le / opts.tune); setGain(pipe, g); }
  pipe.L = pipe.Le - geo.dLm - geo.dLt; // the speaking length, as cut
  // the Cut-up knob: the same pipe, its mouth cut higher or lower, re-voiced to the same gain
  if (cut !== 1) {
    Object.assign(geo, jetGeometry(geo, W0 * cut, off)); pipe.Kj = geo.Kj;
    setLength(pipe, pipe.L + geo.dLm + geo.dLt); setGain(pipe, g);
  }
  pipe.fRes = pipe.modes[0].f;
  pipe.Q1 = pipe.modes[0].Q;
  pipe.gain = g;
  return pipe;
}

// ---------------------------------------------------------------------------
// The linear analysis. With the jet small-signal and no oscillation, a disturbance ∝ e^(st) obeys
//   1 = Y(s) · s Kj A H(s) e^(−sτ),   Y(s) = Σ (1/M) s / (s² + 2σₙs + ωₙ²),   H(s) = 1/(1 + sτ/φ_c),
// τ = W/(c_p U_j), U_j = √(2p/ρ). A root with Re s > 0 means the pipe speaks there.
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
export function admittance(pipe, s) { // Y(s): mouth volume flow per pascal of source
  let y = [0, 0];
  for (const m of pipe.modes) {
    const den = [s[0] * s[0] - s[1] * s[1] + 2 * m.sigma * s[0] + m.om * m.om, 2 * s[0] * s[1] + 2 * m.sigma * s[1]];
    const q = cdiv(s, den);
    y = [y[0] + q[0] / pipe.M, y[1] + q[1] / pipe.M];
  }
  return y;
}
export function jetDelay(pipe, p) { const Uj = Math.sqrt((2 * Math.max(p, 1e-9)) / AIR.rho); return pipe.geo.W / (CP * Uj); }
export function loopGain(pipe, s, p) {
  const tau = jetDelay(pipe, p);
  const e = Math.exp(-s[0] * tau), del = [e * Math.cos(-s[1] * tau), e * Math.sin(-s[1] * tau)];
  const H = cdiv([1, 0], [1 + (s[0] * tau) / PHI_C, (s[1] * tau) / PHI_C]);
  let L = cmul(admittance(pipe, s), [s[0] * pipe.Kj * pipe.A, s[1] * pipe.Kj * pipe.A]);
  L = cmul(cmul(L, H), del);
  return L;
}
// The root that belongs to mode n, by Newton with continuation in the jet's strength from no jet
// (the bare mode). Mode n's own pole is multiplied out, F(s) = Dₙ(s)(1 − Σ_{m≠n} YₘG) − (s/M)G,
// G = s Kj A H(s) e^(−sτ), Dₙ = s² + 2σₙs + ωₙ², so F is smooth there. null if lost.
function rootF(pipe, s, p, n) {
  const m = pipe.modes[n], tau = jetDelay(pipe, p);
  const e = Math.exp(-s[0] * tau), del = [e * Math.cos(-s[1] * tau), e * Math.sin(-s[1] * tau)];
  const H = cdiv([1, 0], [1 + (s[0] * tau) / PHI_C, (s[1] * tau) / PHI_C]);
  const G = cmul(cmul([s[0] * pipe.Kj * pipe.A, s[1] * pipe.Kj * pipe.A], H), del);
  let yo = [0, 0];
  for (let k = 0; k < pipe.modes.length; k++) {
    if (k === n) continue;
    const q = pipe.modes[k], den = [s[0] * s[0] - s[1] * s[1] + 2 * q.sigma * s[0] + q.om * q.om, 2 * s[0] * s[1] + 2 * q.sigma * s[1]];
    const y = cdiv(s, den); yo = [yo[0] + y[0] / pipe.M, yo[1] + y[1] / pipe.M];
  }
  const D = [s[0] * s[0] - s[1] * s[1] + 2 * m.sigma * s[0] + m.om * m.om, 2 * s[0] * s[1] + 2 * m.sigma * s[1]];
  const LG = cmul(yo, G), a = cmul(D, [1 - LG[0], -LG[1]]), b = cmul([s[0] / pipe.M, s[1] / pipe.M], G);
  return [(a[0] - b[0]) / (m.om * m.om), (a[1] - b[1]) / (m.om * m.om)];
}
export function linearRoot(pipe, p, n = 0, steps = 8) {
  const m = pipe.modes[n];
  if (!m) return null;
  let s = [-m.sigma, m.om * Math.sqrt(Math.max(0, 1 - (m.sigma / m.om) ** 2))];
  const A = pipe.A;
  let ok = true;
  for (let k = 1; k <= steps && ok; k++) {
    pipe.A = (A * k) / steps;
    ok = false;
    for (let it = 0; it < 50; it++) {
      const f0 = rootF(pipe, s, p, n), hh = 1e-7 * m.om;
      const f1 = rootF(pipe, [s[0] + hh, s[1]], p, n);
      const step = cdiv(f0, [(f1[0] - f0[0]) / hh, (f1[1] - f0[1]) / hh]);
      const ms = Math.hypot(step[0], step[1]), lim = 0.05 * m.om, sc = ms > lim ? lim / ms : 1;
      s = [s[0] - sc * step[0], s[1] - sc * step[1]];
      if (ms < 1e-10 * m.om) { ok = true; break; }
    }
  }
  pipe.A = A;
  if (!ok || !(s[1] > 0)) return null;
  return { re: s[0], im: s[1] };
}
// The speaking window of mode n: the range of θ = U_j/(f₁W) over which its root has Re s > 0
// (scanning the foot pressure; f₁ the pipe's design frequency).
export function speakingWindow(pipe, n = 0, thetaLo = 2, thetaHi = 80) {
  const th2p = (th) => 0.5 * AIR.rho * (th * pipe.f * pipe.geo.W) ** 2;
  const N = 160, grid = [];
  for (let i = 0; i <= N; i++) { const th = thetaLo * (thetaHi / thetaLo) ** (i / N), s = linearRoot(pipe, th2p(th), n); grid.push([th, s ? s.re : -Infinity]); }
  const edges = [];
  for (let i = 1; i <= N; i++) {
    const [ta, ra] = grid[i - 1], [tb, rb] = grid[i];
    if ((ra > 0) !== (rb > 0) && Number.isFinite(ra) && Number.isFinite(rb)) {
      let lo = ta, hi = tb, rlo = ra; // bisect
      for (let k = 0; k < 40; k++) { const mid = Math.sqrt(lo * hi), s = linearRoot(pipe, th2p(mid), n), r = s ? s.re : -Infinity; if ((r > 0) === (rlo > 0)) { lo = mid; rlo = r; } else hi = mid; }
      edges.push(Math.sqrt(lo * hi));
    }
  }
  return { edges, grid };
}
export const thetaAt = (pipe, p) => Math.sqrt((2 * p) / AIR.rho) / (pipe.f * pipe.geo.W);
export const pressureAt = (pipe, theta) => 0.5 * AIR.rho * (theta * pipe.f * pipe.geo.W) ** 2;

// ---------------------------------------------------------------------------
// The key's pallet and groove. The pallet opens over a time set by the velocity (a fast key, a
// quick rise of pressure: Nolle & Finch 1992). The groove under the key's pipes fills through the
// pallet's opening as fast as the air can flow (its volume fills in well under a millisecond), so its
// pressure follows the opening quasi-statically: the pallet's flow c_d A_pal a √(2(P − p)/ρ) equals
// the flues' Σ hH √(2p/ρ), so p = P a²/(a² + k²), k = Σ hH / c_d A_pal.
export const PALLET = { cd: 0.61, area: 6 }; // the pallet opens 6× the sum of its key's flue areas
export function palletTime(velocity, rise) { // s: the pallet's travel; `rise` (ms) at velocity 0.7, ×2 per −0.3
  return (rise / 1000) * 2 ** ((0.7 - Math.max(0, Math.min(1, velocity))) / 0.3);
}
export function closeTime(velocity) { return velocity === undefined ? 0.008 : 0.02 - 0.017 * Math.max(0, Math.min(1, velocity)); }

// ---------------------------------------------------------------------------
// The wind. A weighted reservoir (bellows) holds P_set; a trunk (air mass M_t, resistance R_t)
// carries the wind to the chest (volume V_c, compliance C_c = V_c/ρc²), which every sounding pipe
// drains. A Schwimmer (a small spring-loaded regulator in the chest) can hold the chest's pressure
// directly: with it the wind is steady; without it (the Baroque way) the chest is fed through the
// trunk alone and "breathes": a big chord drains it before the trunk's air can follow, and the
// pressure dips and rings at f_w = 1/2π√(M_t C_c).
//   C_r dP_r/dt = G_r (P_set − P_r) − Q_t
//   M_t dQ_t/dt = P_r − P_c − R_t Q_t
//   C_c dP_c/dt = Q_t + G_s (P_set − P_c) − Σ Q_pipes − Q_trem
// The tremulant is a valve that opens and shuts a leak from the chest f_t times a second.
export const WIND = { Vc: 0.8, Gr: 2e-3, tauR: 0.25, Rt: 1000, Mt: [5, 150], Gs: 2.5e-3, tremArea: 1.2e-2 };
export function windSystem(stiff) { // stiff: 0 = steady (Schwimmer), 1 = flexible (long trunk, no Schwimmer)
  const s = Math.max(0, Math.min(1, stiff)), Cc = WIND.Vc / (AIR.rho * AIR.c * AIR.c);
  const Mt = WIND.Mt[0] * (WIND.Mt[1] / WIND.Mt[0]) ** s, Gs = WIND.Gs * (1 - s) ** 2;
  return { Cc, Mt, Gs, Gr: WIND.Gr, Cr: WIND.Gr * WIND.tauR, Rt: WIND.Rt, fw: 1 / (TAU * Math.sqrt(Mt * Cc)) };
}

// ---------------------------------------------------------------------------
// Stereo from the chest. On many organs the pipes stand on two sides of the chest: the C side
// (C, D, E, F♯, G♯, B♭) and the C♯ side, each with its biggest pipes outermost. Pan (−1 … 1).
export function chestPan(key) {
  const side = (key - KEY_LO) % 2 === 0 ? -1 : 1;
  const u = (key - KEY_LO) / (KEY_HI - KEY_LO);
  return side * (0.2 + 0.75 * (1 - u));
}
