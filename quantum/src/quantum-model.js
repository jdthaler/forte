// quantum-model.js — the physics, free of audio and DOM: energy spectra and
// exact dipole matrix elements of five potential wells, the wavepacket each
// key launches, its revival times, and the observable the engine sums.
//
// The state is exact, a finite sum over eigenstates:
//   |ψ(t)⟩ = Σₙ cₙ e^(−iEₙt/ħ) |n⟩,   cₙ ∝ exp(−(n − n̄)²/4σ²)  (|cₙ|² has std σ)
// and what you hear is a detector reading of the dipole,
//   ⟨x⟩(t) − x̄ = Σ_{m<n} 2 c_m cₙ x_mn cos(ω_mn t),   ω_mn = (Eₙ − E_m)/ħ,
// or its first or second time derivative (current, radiated field).
//
// Natural units, ħ = 1, per well:
//   box       Eₙ = n²            (units of E₁ = π²ħ²/2mL²), x in units of L
//   morse     E_v = (v+½) − (v+½)²/κ   (units of ħω; κ = 4D/ħω = 2λ), x in units of 1/a
//   hydrogen  Eₙ = −1/2n²        (hartree), r in bohr, radial packet with l = 1
//   bouncer   Eₙ = |aₙ|          (units of mgℓ, ℓ = (ħ²/2m²g)^⅓), z in units of ℓ
//   harmonic  Eₙ = n + ½         (units of ħω), x in units of √(ħ/mω)
//
// Sign convention for every well: eigenfunctions are positive in their first
// lobe on the inner side (small x). Then every x_mn with m ≠ n is ≤ 0, and real,
// positive cₙ put the packet at the inner turning point at t = 0.

import { keyFreq } from '../../shared/dsp.js';

const PI = Math.PI;
export const DC_FADE = 0.06; // s: the electrode's AC coupling, a raised-cosine fade of the Franck–Condon reference (sub-audio)

// |aₙ|, zeros of Ai: Abramowitz & Stegun Table 10.13 for n ≤ 10, asymptotic
// series 10.4.94/10.4.105 above (error < 1e-10 there).
const AIRY = [2.338107410459767, 4.087949444130970, 5.520559828095551, 6.786708090071759, 7.944133587120853,
  9.022650853340980, 10.04017434155809, 11.00852430373326, 11.93601556323626, 12.82877675286576];
export function airyZeroC(nu) { // continuous in nu, for derivatives
  const t = (3 * PI * (4 * nu - 1)) / 8, t2 = 1 / (t * t);
  return t ** (2 / 3) * (1 + t2 * (5 / 48 + t2 * (-5 / 36 + t2 * (77125 / 82944 + t2 * (-108056875 / 6967296 + t2 * (162375596875 / 334430208))))));
}
export const airyZero = (n) => (n <= 10 ? AIRY[n - 1] : airyZeroC(n));

// Bessel J'_k(x) for integer k ≥ 1: (1/π)∫₀^π sin τ sin(kτ − x sin τ) dτ. The integrand
// is smooth and periodic, so the midpoint rule converges exponentially.
export function besselJp(k, x) {
  const M = 2 * Math.ceil(k + x) + 64;
  let s = 0;
  for (let i = 0; i < M; i++) { const t = ((i + 0.5) * PI) / M, st = Math.sin(t); s += st * Math.sin(k * t - x * st); }
  return s / M;
}

// Morse: κ from the packet's height in the well, η = E(n̄)/D = 1 − (1 − (n̄+½)/λ)².
export const morseKappa = (nbar, eta) => (2 * (nbar + 0.5)) / (1 - Math.sqrt(1 - eta));
// ⟨m|x|n⟩, m ≠ n (Vasan & Cross 1983; equivalently Gallas 1980), units of 1/a:
//   |x_mn| = √[(κ−2n−1)(κ−2m−1) Γ(κ−n) n! / (Γ(κ−m) m!)] / [(n−m)(κ−n−m−1)],  n > m.
export function morseX(m, n, kap) {
  if (n < m) [m, n] = [n, m];
  let ratio = 1;
  for (let j = m + 1; j <= n; j++) ratio *= j / (kap - j);
  return -Math.sqrt((kap - 2 * n - 1) * (kap - 2 * m - 1) * ratio) / ((n - m) * (kap - n - m - 1));
}

export const HYDROGEN_L = 1; // one-photon excitation from s states makes p-wave packets
// ⟨n l|r|n' l⟩ from the Fourier series of a Kepler orbit (Heisenberg's correspondence
// principle; Naccache 1972): r(t)/a = 1 + e²/2 − Σ (2e/k) J'_k(ke) cos kM, a = n_c², with
// n_c = (n+n')/2 and the Langer eccentricity e = √(1 − (l+½)²/n_c²). The error grows like
// (k/n)²: 0.14 % for k = 1 and 2.5 % for k = 5 at n = 20 (tests check exact integrals).
// J'_k(ke) depends only weakly on n_c (through e), so it is evaluated once per k at n̄.
export const kepler = (nc, l = HYDROGEN_L) => Math.sqrt(1 - ((l + 0.5) / nc) ** 2);
export function hydrogenR(m, n, l = HYDROGEN_L, jp = null) {
  const k = Math.abs(n - m), nc = (m + n) / 2, e = kepler(nc, l);
  return -((nc * nc * e) / k) * (jp ? jp(k) : besselJp(k, k * e));
}

export const WELLS = {
  box: { name: 'Infinite square well', launch: 'inner' },
  morse: { name: 'Morse (anharmonic molecule)', launch: 'inner' },
  hydrogen: { name: 'Hydrogen (Rydberg atom)', launch: 'inner' },
  bouncer: { name: 'Quantum bouncer (gravity on a mirror)', launch: 'outer' },
  harmonic: { name: 'Harmonic oscillator', launch: 'inner' },
};

// One well at a given packet centre: discrete energies, a smooth E(ν) for the
// derivatives that define the time scales, the range of n, and x_mn.
export function well(id, P, nbar) {
  switch (id) {
    case 'box': return {
      id, nMin: 1, nMax: Infinity, E: (n) => n * n, Ec: (n) => n * n, D: (n) => ({ d1: 2 * n, d2: 2, d3: 0 }),
      x: (m, n) => ((m + n) % 2 ? (-8 * m * n) / (PI * PI * (m * m - n * n) ** 2) : 0),
    };
    case 'morse': {
      const kap = morseKappa(nbar, P.eta ?? 0.5), E = (v) => (v + 0.5) - (v + 0.5) ** 2 / kap;
      return {
        id, kap, nMin: 0, nMax: Math.ceil((kap - 1) / 2) - 1, E, Ec: E,
        D: (v) => ({ d1: 1 - (2 * v + 1) / kap, d2: -2 / kap, d3: 0 }), x: (m, n) => morseX(m, n, kap),
      };
    }
    case 'hydrogen': {
      const E = (n) => -0.5 / (n * n), e = kepler(Math.max(nbar, HYDROGEN_L + 1)), jps = [];
      const jp = (k) => jps[k] ?? (jps[k] = besselJp(k, k * e));
      return {
        id, nMin: HYDROGEN_L + 1, nMax: Infinity, E, Ec: E,
        D: (n) => ({ d1: n ** -3, d2: -3 * n ** -4, d3: 12 * n ** -5 }), x: (m, n) => hydrogenR(m, n, HYDROGEN_L, jp),
      };
    }
    case 'bouncer': return {
      id, nMin: 1, nMax: Infinity, E: airyZero, Ec: airyZeroC,
      x: (m, n) => -2 / (airyZero(m) - airyZero(n)) ** 2,
    };
    case 'harmonic': return {
      id, nMin: 0, nMax: Infinity, E: (n) => n + 0.5, Ec: (n) => n + 0.5, D: () => ({ d1: 1, d2: 0, d3: 0 }),
      x: (m, n) => (Math.abs(m - n) === 1 ? -Math.sqrt(Math.max(m, n) / 2) : 0),
    };
    default: throw new Error(`unknown well ${id}`);
  }
}

// Derivatives of the smooth spectrum: E′ sets the classical period, E″ the revival
// time, E‴ the super-revival time (Robinett 2004):
//   T_cl = 2πħ/|E′|,  T_rev = 2πħ/(|E″|/2),  T_sr = 2πħ/(|E‴|/6).
// Analytic where the spectrum is; 5-point stencils for the bouncer's Airy zeros.
export function derivs(W, nu) {
  if (W.D) return W.D(nu);
  const h = 0.05, f = W.Ec;
  const a = f(nu - 2 * h), b = f(nu - h), c = f(nu), d = f(nu + h), e = f(nu + 2 * h);
  const H = 0.25, A = f(nu - 2 * H), B = f(nu - H), D = f(nu + H), E = f(nu + 2 * H);
  return {
    d1: (a - 8 * b + 8 * d - e) / (12 * h),
    d2: (-a + 16 * b - 30 * c + 16 * d - e) / (12 * h * h),
    d3: (E - 2 * D + 2 * B - A) / (2 * H ** 3),
  };
}

export const DETECTORS = { x: 0, v: 1, a: 2 }; // electrode ⟨x⟩, coil ⟨ẋ⟩, antenna ⟨ẍ⟩

// The states of a packet centred on nbar: n, cₙ (normalised, signed for the launch side), Eₙ.
export function packetStates(W, launch, nbar, sigma) {
  const lo = Math.max(W.nMin, Math.ceil(nbar - 6 * sigma)), hi = Math.min(W.nMax, Math.floor(nbar + 6 * sigma));
  const ns = [], c = [], E = [];
  let norm = 0;
  for (let n = lo; n <= hi; n++) {
    const a = Math.exp(-((n - nbar) ** 2) / (4 * sigma * sigma));
    ns.push(n); c.push(launch === 'outer' && n % 2 ? -a : a); E.push(W.E(n)); norm += a * a;
  }
  norm = Math.sqrt(norm) || 1;
  return { ns, c: c.map((v) => v / norm), E };
}

// The pitch: the amplitude-weighted mean of the Δn = 1 Bohr frequencies, as the
// detector sees them. This is the instantaneous frequency of the sound at t = 0.
function meanBohr(W, S, d) {
  let num = 0, den = 0;
  for (let i = 0; i + 1 < S.ns.length; i++) {
    const w = S.E[i + 1] - S.E[i], a = Math.abs(S.c[i] * S.c[i + 1] * W.x(S.ns[i], S.ns[i + 1])) * w ** d;
    num += a * w; den += a;
  }
  return den > 0 ? num / den : W.Ec(S.ns[0] + 1) - W.Ec(S.ns[0]);
}

const nbarLimits = (id, sigma) => ({ lo: id === 'hydrogen' ? 12 : id === 'morse' ? 1 : Math.max(1, 0.5 * sigma), hi: 6000 });

// Initial guess for n̄ from R = T_rev/T_cl: 2n̄ (box), κ − 2n̄ − 1 (Morse), 2n̄/3 (hydrogen), 6n̄ (bouncer).
function nbarGuess(id, R, P) {
  if (id === 'box') return R / 2;
  if (id === 'hydrogen') return 1.5 * R;
  if (id === 'bouncer') return R / 6;
  if (id === 'morse') { const u = 1 / (1 - Math.sqrt(1 - (P.eta ?? 0.5))); return R / (2 * (u - 1)) - 0.5; }
  return P.nbar;
}

// n̄ for a key: either the knob, or (tempo lock) the n̄ whose revival time is
// `beats` beats at `bpm`. With the lock, T_rev is exact and the pitch is solved for.
// The lock can ask for an n̄ outside the well's range (very long revivals on high keys,
// very short ones on low keys); then n̄ stays at the limit, `locked` is false, and
// makePacket keeps the pitch exact and lets the revival fall off the beat.
export function solveNbar(key, P, info = {}) {
  const id = P.potential, w = WELLS[id], d = DETECTORS[P.detector] ?? 2, lim = nbarLimits(id, P.sigma);
  info.locked = false;
  if (!P.lock || id === 'harmonic') return Math.min(lim.hi, Math.max(lim.lo, P.nbar));
  const f0 = keyFreq(key), T = (P.beats * 60) / P.bpm, R = f0 * T;
  // g(n̄) = pitch(n̄) − f0 with the time scale fixed by T_rev = T.
  const g = (nb) => {
    const W = well(id, P, nb), S = packetStates(W, w.launch, nb, P.sigma);
    return (2 * meanBohr(W, S, d)) / (Math.abs(derivs(W, nb).d2) * T) - f0;
  };
  let x0 = Math.min(lim.hi, Math.max(lim.lo, nbarGuess(id, R, P))), g0 = g(x0);
  let x1 = Math.min(lim.hi, Math.max(lim.lo, x0 * (1 + 1e-3) + 1e-3)), g1 = g(x1);
  for (let it = 0; it < 30 && Math.abs(g1) > 1e-10 * f0 && g1 !== g0; it++) {
    const x2 = Math.min(lim.hi, Math.max(lim.lo, x1 - (g1 * (x1 - x0)) / (g1 - g0)));
    x0 = x1; g0 = g1; x1 = x2; g1 = g(x1);
  }
  info.locked = Math.abs(g1) < 1e-6 * f0;
  return x1;
}

// Everything the engine and the views need for one key. Frequencies in Hz, times in s.
//   pairs: [{ i, j, k, f, w }]  state indices i < j, k = n_j − n_i, w = signal weight
//   (on cos for the electrode and antenna, on −sin for the coil), normalised so the
//   launch peak is at most 1. Pairs weaker than `rel` of the strongest, or beyond the
//   `maxPairs` strongest, or above fMax, are dropped.
export function makePacket(key, P, { fMax = 20000, maxPairs = 300, rel = 1e-3 } = {}) {
  const id = P.potential, info = WELLS[id], d = DETECTORS[P.detector] ?? 2, sigma = P.sigma;
  const lock = {}, f0 = keyFreq(key), nbar = solveNbar(key, P, lock), W = well(id, P, nbar);
  const S = packetStates(W, info.launch, nbar, sigma), N = S.ns.length;
  const dv = derivs(W, nbar), wbar = meanBohr(W, S, d);
  // Time scale s: Hz per natural frequency unit (f = s·ΔE). With the tempo lock T_rev is
  // exact (s = 2/|E″|T) and n̄ was solved so the pitch lands on the key; otherwise, and
  // whenever the lock could not reach the beat, the pitch is exact (s = f0/ω̄).
  const locked = lock.locked;
  const s = locked ? 2 / (Math.abs(dv.d2) * ((P.beats * 60) / P.bpm)) : f0 / wbar;
  let cmax = 0;
  for (const v of S.c) cmax = Math.max(cmax, Math.abs(v));
  const all = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const cc = 2 * S.c[i] * S.c[j];
    if (Math.abs(cc) < 1e-7 * cmax * cmax) continue;
    const f = s * (S.E[j] - S.E[i]);
    if (f > fMax || f <= 0) continue;
    const x = W.x(S.ns[i], S.ns[j]);
    if (!x) continue;
    const amp = cc * x, r = f / f0;
    all.push({ i, j, k: S.ns[j] - S.ns[i], f, w: d === 0 ? amp : d === 1 ? amp * r : -amp * r * r });
  }
  all.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const wmax = all.length ? Math.abs(all[0].w) : 1;
  let pairs = all.filter((p) => Math.abs(p.w) >= rel * wmax).slice(0, maxPairs);
  // Detector gain: over the first period after launch, the peak is ≤ 1 and the rms ≤ 0.4,
  // so impulsive (high crest factor) and smooth signals sit at similar loudness. For the
  // electrode the peak is of what it actually reads, the dipole less its Franck–Condon
  // reference while that fades (DC_FADE; see signalAt): the packet swings to one side of
  // where it started, so in the first period the reading reaches about twice the swing.
  const fp = s * wbar, M = 128, dc0 = d === 0 ? pairs.reduce((a, p) => a + p.w, 0) : 0;
  let peak = 1e-30, ss = 0;
  for (let q = 0; q < 1.5 * M; q++) {
    const t = q / (M * fp);
    let y = 0;
    for (const p of pairs) y += p.w * (d === 1 ? -Math.sin(2 * PI * p.f * t) : Math.cos(2 * PI * p.f * t));
    if (q < M) ss += y * y;
    peak = Math.max(peak, Math.abs(y - (t < DC_FADE ? 0.5 * dc0 * (1 + Math.cos((PI * t) / DC_FADE)) : 0)));
  }
  const pk = Math.max(peak, 2.5 * Math.sqrt(ss / M));
  pairs = pairs.map((p) => ({ ...p, w: p.w / pk })).sort((a, b) => a.k - b.k || a.i - b.i);
  const harm = id === 'harmonic', Trev = harm ? Infinity : 2 / (s * Math.abs(dv.d2));
  const Tsr = harm || Math.abs(dv.d3) <= 1e-9 * Math.abs(dv.d1 * dv.d2) ? Infinity : 6 / (s * Math.abs(dv.d3));
  return {
    key, id, d, f0, pitch: fp, nbar, sigma, ns: S.ns, c: S.c, E: S.E, scale: s, pairs,
    // the tempo lock asked for an n̄ beyond the well's range: the pitch is kept, the revival is off the beat
    offBeat: !!P.lock && id !== 'harmonic' && !locked,
    Tcl: 1 / fp, Trev, Tsr, tColl: Trev / (2 * Math.SQRT2 * PI * sigma), kap: W.kap,
    // The electrode reads the dipole relative to where the pump found the atom: the
    // packet is born at the Franck–Condon point x(0), so the signal starts at zero.
    // dc = ⟨x⟩(0) − x̄; it lives on the populations, so only T₁ touches it. The
    // electrode's AC coupling then removes it (the engine fades it out over 60 ms).
    dc: d === 0 ? pairs.reduce((a, p) => a + p.w, 0) : 0,
  };
}

// Autocorrelation |⟨ψ(0)|ψ(t)⟩|² = |Σ|cₙ|² e^(−iEₙt)|², and with pure dephasing
// (ρ_mn decays at (m−n)²/T_φ) the overlap Tr ρ(0)ρ(t). t in seconds.
export function autocorr(pk, t, Tphi = Infinity) {
  const w = 2 * PI * pk.scale, N = pk.ns.length;
  if (!(Tphi < 1e6)) {
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const p = pk.c[i] * pk.c[i], ph = w * (pk.E[i] - pk.E[0]) * t; re += p * Math.cos(ph); im -= p * Math.sin(ph); }
    return re * re + im * im;
  }
  let s = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const k = pk.ns[j] - pk.ns[i];
    s += pk.c[i] ** 2 * pk.c[j] ** 2 * Math.cos(w * (pk.E[j] - pk.E[i]) * t) * Math.exp((-k * k * t) / Tphi);
  }
  return s;
}

// The detector signal straight from the model (for tests and views):
// Σ_pairs w·cos(2πft) (or −sin for the coil), times the decoherence of each Δn,
// minus the electrode's Franck–Condon reference (faded over `dcFade` seconds).
export function signalAt(pk, t, { T1 = Infinity, Tphi = Infinity, dcFade = DC_FADE } = {}) {
  let y = t <= 0 ? -pk.dc : t < dcFade ? -0.5 * pk.dc * (1 + Math.cos((PI * t) / dcFade)) * Math.exp(-t / T1) : 0;
  for (const p of pk.pairs) {
    const ph = 2 * PI * p.f * t, dec = Math.exp(-t / T1 - (p.k * p.k * t) / Tphi);
    y += p.w * dec * (pk.d === 1 ? -Math.sin(ph) : Math.cos(ph));
  }
  return y;
}
