// carillon-model.js — the physics of a carillon, kept free of audio and DOM so
// that the page, the engine, the tests and the tools can all use it.
//
//        headstock
//      ┌───┬───┐
//     ╱    │clapper (a pendulum)        Each key is a bronze bell: a rib from
//    │     │      │                     bell-table.js (tuned by the FEM in
//    │     │      │                     bell-fem.js / bell-profile.js), scaled
//   ╱      ●──▶    ╲  ← soundbow        to its note. The clapper's ball hits the
//  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  lip              soundbow from inside (Hertz contact).
//
// What lives here: which rib each key gets and how big its bell is; each mode's
// frequency, damping (bronze's internal loss + radiation), excitation at the strike
// point and radiation towards the listener; the doublets (split by an asymmetry ε
// in harmonic 2m, orientations by degenerate perturbation theory); the historic,
// untuned bell; the clapper's Hertz contact; air absorption over the listening
// distance; and the virtual-pitch estimator that finds the strike note.

import { BELL_TABLE, STRIKE_GRID, SENS_GROUPS } from './bell-table.js';
import { BRONZE, cBronze, AIR } from './bronze.js';

export { BELL_TABLE, STRIKE_GRID, BRONZE, AIR };
export const TAU = 2 * Math.PI;
export const KEY_LO = 48, KEY_HI = 96; // C3–C7 at sounding pitch: a four-octave concert carillon
export const keyFreq = (k) => 440 * 2 ** ((k - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const cents = (a, b) => 1200 * Math.log2(a / b);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---- the bells ------------------------------------------------------------------------------------------
export const PARTIAL_NAMES = {
  hum: 'hum', prime: 'prime', tierce: 'tierce', quint: 'quint', nominal: 'nominal',
  deciem: 'deciem', superquint: 'superquint', octnom: 'octave nominal',
};
export const IDEAL = { hum: 0.5, prime: 1, tierce: 1.2, quint: 1.5, nominal: 2, deciem: 2.5, superquint: 3, octnom: 4 };
export const DESIGNATION = { hum: '(2,0)', prime: '(2,1#)', tierce: '(3,1)', quint: '(3,1#)', nominal: '(4,1)', deciem: '(4,1#)', superquint: '(5,1)', octnom: '(6,1)' };
export const idealRatio = (id, profile) => (id === 'tierce' && profile === 'major' ? 1.25 : IDEAL[id]);

export function ribFor(profile, key) {
  const k = clamp(Math.round(key), KEY_LO, KEY_HI);
  return BELL_TABLE.ribs.find((r) => r.profile === profile && k >= r.lo && k <= r.hi) || BELL_TABLE.ribs.find((r) => r.profile === profile);
}

// Interpolate a mode's tabulated inner-surface motion at height h (fraction of H above the lip).
export function winAt(mode, h) {
  const g = STRIKE_GRID, n = g.length, x = clamp(h, g[0], g[n - 1]);
  let i = 0;
  while (i < n - 2 && g[i + 1] < x) i++;
  const f = (x - g[i]) / (g[i + 1] - g[i]);
  return mode.w[i] * (1 - f) + mode.w[i + 1] * f;
}

// Deterministic pseudo-random numbers per key (bells are individuals): xorshift seeded by key and salt.
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r());

// The historic bell: cast without the tuning, its wall a few per cent off in each region (crown,
// shoulder, waist, lower waist, soundbow; rms σ × amount), seeded by the key. Each mode moves by
// d ln f = Σ s_g δ_g (the FEM's sensitivities, bell-table.js). Founders still matched old bells by
// their nominal, so the shifts are taken relative to the nominal's. Also an uneven casting: a random
// asymmetry in every harmonic 2m (rms 0.4 % × amount) at a random orientation.
export const HISTORIC = { sigma: 0.08, asym: 0.004 };
export function historic(key, rib, amount) {
  const r = rng(1009 * key + (rib.profile === 'major' ? 7 : 3)), d = SENS_GROUPS.map(() => HISTORIC.sigma * amount * gauss(r));
  const nom = rib.modes.find((m) => m.n === 'nominal');
  const shift = (m) => m.s.reduce((a, s, g) => a + s * d[g], 0);
  const s0 = shift(nom);
  const lnf = rib.modes.map((m) => shift(m) - s0);
  const asym = [];
  for (let m = 0; m <= 32; m++) asym.push({ e: HISTORIC.asym * amount * Math.abs(gauss(r)), psi: (TAU * r()) / (2 * Math.max(1, m)) });
  return { lnf, asym, d };
}

// One bell: which rib, how big, how heavy; every mode's frequency (Hz). Tuned by its nominal, which
// sits an octave above the key: the strike note, an octave below the nominal, is the key's note.
export function bellOf(key, profile = 'minor', historicAmount = 0) {
  const rib = ribFor(profile, key), nom = rib.modes.find((m) => m.n === 'nominal');
  const fNom = 2 * keyFreq(key), lamNom = rib.lamPrime * nom.r * nom.r;
  const D = (Math.sqrt(lamNom) / TAU) * cBronze / fNom;  // m: the bell's diameter at the lip
  const fPrime = fNom / nom.r;
  const hist = historicAmount > 0 ? historic(key, rib, historicAmount) : null;
  const f = rib.modes.map((m, j) => fPrime * m.r * (hist ? Math.exp(hist.lnf[j]) : 1));
  return {
    key, profile, rib, D, H: rib.H * D, mass: BRONZE.rho * rib.volume * D ** 3, fNom, fPrime, f, hist,
    strikeHeight: soundbowHeight(rib),
  };
}
// The soundbow: where the wall is thickest, as a fraction of the height above the lip.
export function soundbowHeight(rib) {
  let best = 0, h = 0;
  for (const [, z, t] of rib.stations) if (t > best) { best = t; h = z / rib.H; }
  return h;
}

// ---- losses ---------------------------------------------------------------------------------------------
// Spherical Hankel function h_ℓ(x) and its derivative, by upward recurrence: [|h_ℓ′(x)|², …].
function hankelPrime2(l, x) {
  let j0 = Math.sin(x) / x, y0 = -Math.cos(x) / x;
  if (l === 0) { const dj = -(Math.sin(x) / x - Math.cos(x)) / x, dy = (Math.cos(x) / x + Math.sin(x)) / x; return dj * dj + dy * dy; }
  let j1 = j0 / x - Math.cos(x) / x, y1 = y0 / x - Math.sin(x) / x;
  let jm = j0, ym = y0, jn = j1, yn = y1;
  for (let k = 1; k < l; k++) { const jp = ((2 * k + 1) / x) * jn - jm, yp = ((2 * k + 1) / x) * yn - ym; jm = jn; ym = yn; jn = jp; yn = yp; }
  const dj = jm - ((l + 1) / x) * jn, dy = ym - ((l + 1) / x) * yn;
  return dj * dj + dy * dy;
}
// Radiation efficiency of a sphere of radius a vibrating in its ℓ-th harmonic: the real part of the
// specific impedance over ρc, 1/((ka)²|h_ℓ′(ka)|²); → (ka)^(2ℓ+2)/((ℓ+1)²((2ℓ−1)!!)²) for small ka, → 1 for large.
export function radiationEfficiency(l, ka) { return 1 / (ka * ka * hankelPrime2(l, ka)); }

// Average of sin^(2m)Θ over the sphere: (2^m m!)²/(2m+1)!; a 2^m-pole's pattern sin^(2m)Θ cos²mφ
// beams to the horizon by 2/that.
export function horizonGain(m) {
  let a = 1;
  for (let k = 1; k <= m; k++) a *= (2 * k) / (2 * k + 1);
  return m === 0 ? 1 : 2 / a;
}

// Air absorption (ISO 9613-1): α in dB/m at frequency f, temperature T (°C), relative humidity hr (%)
// and pressure pa (kPa).
export function airAbsorption(f, T = 15, hr = 70, pa = 101.325) {
  const TK = T + 273.15, T0 = 293.15, T01 = 273.16, pr = 101.325;
  const C = -6.8346 * (T01 / TK) ** 1.261 + 4.6151, h = (hr * 10 ** C) / (pa / pr);
  const frO = (pa / pr) * (24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h));
  const frN = (pa / pr) * (TK / T0) ** -0.5 * (9 + 280 * h * Math.exp(-4.17 * ((TK / T0) ** (-1 / 3) - 1)));
  return 8.686 * f * f * (1.84e-11 * (pr / pa) * Math.sqrt(TK / T0)
    + (TK / T0) ** -2.5 * ((0.01275 * Math.exp(-2239.1 / TK)) / (frO + (f * f) / frO) + (0.1068 * Math.exp(-3352 / TK)) / (frN + (f * f) / frN)));
}
export const WEATHER = { T: 15, hr: 70 }; // a mild day
export const REF_DISTANCE = 30;           // m: the output level is set for a listener this far away

// ---- every mode of one bell, ready to play ----------------------------------------------------------------
// For bell b and parameters P: for each mode, its frequency and decay σ (s⁻¹), the strike's reach
// (unit-modal-mass motion of the inner surface at the strike point, m/√kg), and its radiation (far-field
// pressure per unit modal velocity at 1 m, Pa·s·√kg/m, before the doublet's orientation).
//   σ = π f η   (bronze's loss factor η)
//     + ρ₀ c η_ℓ(k a) I / (2 ρ_b D)   (radiation: the mode's ∫w² over the outer surface, I/(ρ_b D) per
//                                       unit modal mass, through a sphere's ℓ = max(m, 1) efficiency at the
//                                       w²-weighted radius a)
// The lowest m = 0 and m = 1 modes are the bell bouncing and rocking on its clamped crown: motions of
// the mounting, set by the headstock and the frame (which damp them), so they are left out.
export const isMounting = (m) => m.m <= 1 && m.k === 0;
export function bellModes(b, P) {
  const { rib, D } = b, rhoB = BRONZE.rho, sw = 1 / Math.sqrt(rhoB * D ** 3);
  const h = P.strikeHeight ?? b.strikeHeight;
  const out = [];
  rib.modes.forEach((m, j) => {
    if (isMounting(m)) return;
    const f = b.f[j], k = (TAU * f) / AIR.c, l = Math.max(1, m.m), ka = k * m.a * D;
    const eff = radiationEfficiency(l, ka), Iphys = m.I / (rhoB * D);
    const sigRad = (AIR.rho * AIR.c * eff * Iphys) / 2;
    const sigInt = Math.PI * f * P.eta;
    out.push({
      j, m: m.m, k: m.k, name: m.n, f, sigma: sigInt + sigRad, sigRad, sigInt, eff,
      reach: winAt(m, h) * sw,
      rad: AIR.rho * AIR.c * Math.sqrt((eff * Iphys * horizonGain(m.m)) / (4 * Math.PI)),
      kappa: m.kap,
    });
  });
  return out;
}

// Doublets. An asymmetry in the wall's mass, δρ/ρ = ε cos 2m(θ − ψ), splits family m's degenerate
// pair. First-order degenerate perturbation theory (the 2 × 2 problem in the pair is already
// diagonal in the basis aligned with ψ): δ(ω²)/ω² = ∓ (ε/2) κ, κ = (T_rz − T_θ)/T (the mode's kinetic
// energy in u_r, u_z minus that in u_θ), so the pair sits Δf/f = ε κ/2 apart, the lower one with its
// radial antinodes on the heavy side (θ = ψ), the upper one turned π/2m from it.
// The asymmetry of harmonic 2m: the knob's (ε at ψ = 0, the same for every m) plus a historic bell's own.
export function asymmetryOf(m, eps, hist) {
  let re = eps, im = 0;
  if (hist) { const a = hist.asym[m] || hist.asym[hist.asym.length - 1]; re += a.e * Math.cos(2 * m * a.psi); im += a.e * Math.sin(2 * m * a.psi); }
  const e = Math.hypot(re, im);
  return { e, psi: e > 0 ? Math.atan2(im, re) / (2 * Math.max(1, m)) : 0 };
}
export function doubletSplit(kappa, e) { return [1 - (e * kappa) / 4, 1 + (e * kappa) / 4]; } // frequency factors (cos, sin members)

// ---- the clapper ------------------------------------------------------------------------------------------
// A ball on a pendulum: its effective mass at the ball is P.clapMass (% of the bell's mass), its radius
// 5 % of the bell's diameter. Hertz contact with the soundbow's inner surface, F = K δ^(3/2),
//   K = (4/3) E* √R,   1/E* = (1 − ν_c²)/E_c + (1 − ν_b²)/E_b,
// E_c the clapper face's modulus (iron 200 GPa; a softer insert less). For a rigid wall the contact
// lasts τ = 3.2145 (m/K)^(2/5) v^(−1/5) (Hertz); the wall's own give lengthens it.
export const CLAPPER = { nu: 0.28, ballRadius: 0.05 };
export function clapperOf(b, P) {
  const Ec = P.hardness * 1e9, Es = 1 / ((1 - CLAPPER.nu ** 2) / Ec + (1 - BRONZE.nu ** 2) / BRONZE.E);
  const R = CLAPPER.ballRadius * b.D, m = (P.clapMass / 100) * b.mass;
  return { m, R, K: (4 / 3) * Es * Math.sqrt(R), Es };
}
export const hertzTime = (m, K, v) => 3.2145 * (m / K) ** 0.4 * v ** -0.2;

// The console is regulated for an even touch: a baton stroke of a given velocity gives every
// clapper the same kinetic energy, ½ m v², as it gives C4's at P.speedMax × velocity, so lighter
// clappers fly faster, up to SPEED_CAP (only the smallest bells reach it).
export const SPEED_CAP = 8; // m/s
const refMass = new Map();
export function clapperSpeed(b, P, velocity) {
  const id = `${b.profile}|${P.clapMass}|${P.hardness}`;
  if (!refMass.has(id)) { if (refMass.size > 64) refMass.clear(); refMass.set(id, clapperOf(bellOf(60, b.profile), P).m); }
  const v = P.speedMax * Math.max(0, Math.min(1, velocity)) * Math.sqrt(refMass.get(id) / clapperOf(b, P).m);
  return Math.min(SPEED_CAP, v);
}

// ---- the strike note: a virtual pitch -------------------------------------------------------------------
// Subharmonic summation (Hermes 1988), on the bell's partials as the listener hears them. Each
// partial [f, a] puts a peak of height E = W(f)·(a/a_max)^0.6 (a compressive, loudness-like weight)
// on a log-frequency axis of 48 points per octave (a triangle ±50 ¢ wide); the pitch strength of a
// candidate f₀ is the sum of the axis read at f₀, 2f₀, 3f₀, … (15 harmonics), each weighted h^(n−1);
// the strike note is its maximum. Praat's SHS uses h = 0.84; here h = 0.75, because with 0.84 the
// lower octave, where the hum adds its own peak, wins from about C5 up (subharmonic summation's
// octave bias, worse for the many inharmonic partials of a bell). W(f) favours the region where
// virtual pitch is formed, roughly 0.3–2.5 kHz:
//   W(f) = [1 + (f/2500)²]^(−½) · [1 + (300/f)²]^(−½)   (the model's choice)
// Partials more than 50 dB below the loudest are ignored. Returns { f, strength, curve, axis }.
export const SHS = { ppo: 48, harmonics: 15, compression: 0.75, fLo: 40, fHi: 5000, floorDb: -50, width: 2 };
export const pitchWeight = (f) => 1 / Math.sqrt((1 + (f / 2500) ** 2) * (1 + (300 / f) ** 2));
export function strikeNote(partials, opt = {}) {
  const o = { ...SHS, ...opt }, lo = Math.log2(o.fLo), n = Math.round((Math.log2(o.fHi * o.harmonics * 2) - lo) * o.ppo);
  let amax = 0;
  for (const p of partials) if (p.a > amax) amax = p.a;
  const axis = new Float64Array(n);
  if (!(amax > 0)) return { f: NaN, strength: 0, curve: null };
  for (const p of partials) {
    if (!(p.f > 0) || p.a < amax * 10 ** (o.floorDb / 20)) continue;
    const E = pitchWeight(p.f) * (p.a / amax) ** 0.6, x = (Math.log2(p.f) - lo) * o.ppo, i0 = Math.floor(x);
    for (let i = i0 - o.width; i <= i0 + o.width + 1; i++) { // a triangle of half-width `width` points
      if (i < 0 || i >= n) continue;
      const w = 1 - Math.abs(i - x) / (o.width + 1);
      if (w > 0) axis[i] += E * w;
    }
  }
  const m = Math.round((Math.log2(o.fHi) - lo) * o.ppo), curve = new Float64Array(m + 1);
  const read = (x) => { const i = Math.floor(x), f = x - i; return i >= 0 && i + 1 < n ? axis[i] * (1 - f) + axis[i + 1] * f : 0; };
  let best = 0, bi = 0;
  for (let i = 0; i <= m; i++) {
    let s = 0, w = 1;
    for (let k = 1; k <= o.harmonics; k++) { s += w * read(i + Math.log2(k) * o.ppo); w *= o.compression; }
    curve[i] = s;
    if (s > best) { best = s; bi = i; }
  }
  // parabolic refinement of the peak
  let x = bi;
  if (bi > 0 && bi < m) { const a = curve[bi - 1], b = curve[bi], c = curve[bi + 1], d = a - 2 * b + c; if (d < 0) x = bi + (0.5 * (a - c)) / d; }
  return { f: 2 ** (lo + x / o.ppo), strength: best, curve, fLo: o.fLo, ppo: o.ppo };
}

// The partials a listener hears right after a strike, as the model predicts them: each mode's reach
// at the strike point × its radiation × the clapper's force spectrum (a half-sine pulse as long as a
// Hertz impact on a rigid wall) × the distance; both doublet members together. [{ f, a }]
export function struckPartials(b, P) {
  const c = clapperOf(b, P), v = Math.max(0.05, clapperSpeed(b, P, P.velocity ?? 0.7)), tau = hertzTime(c.m, c.K, v);
  const pulse = (f) => { const u = 2 * f * tau; return Math.abs(u - 1) < 1e-6 ? Math.PI / 4 : Math.abs(Math.cos((Math.PI * u) / 2) / (1 - u * u)); };
  return bellModes(b, P).map((md) => ({ f: md.f, a: Math.abs(md.reach * md.rad) * pulse(md.f) * distanceGain(md.f, P.distance ?? REF_DISTANCE) }));
}

// Spreading and air absorption from the reference distance to r (pressure ratio).
export function distanceGain(f, r) {
  return (REF_DISTANCE / Math.max(10, r)) * 10 ** ((-airAbsorption(f, WEATHER.T, WEATHER.hr) * r) / 20);
}
