// bowed.js — one bowed string per key, reduced to modes.
//
// A stiff string of length L, tension T, mass per length μ, pinned at the nut
// (x = 0) and at a shared bridge (x = L), bowed at a fraction β of its length
// from the bridge. Modes are mass-normalised, φ_n = √(2/μL) sin(nπx/L).
//
// The bridge couples every mode of every sounding string. A resistive bridge
// of conductance G is the rank-one damping matrix c cᵀ with
//   c_n = (−1)ⁿ √(2G(T + EI k_n²)/L),
// so each mode alone loses σ = c_n²/2 (= GT/L for an ideal string). Modes of
// *different* strings that nearly coincide are coupled dissipatively. Below
// a detuning of about the coupling rate their frequencies coalesce (an
// exceptional point): that is mode locking. A springy bridge adds the
// conservative rank-one stiffness d dᵀ with d_n = c_n √ω_n.
//
// Schelleng's bounds on bow force for Helmholtz motion (one stick and one
// slip per period):
//   F_min = μ L σ₁ v_B / (2β²)        (below: multiple slips, "surface sound")
//   F_max = 2 Z₀ v_B / (β (μs − μd))  (above: raucous, aperiodic)

export const KEY_LO = 36, KEY_HI = 96;
const PI = Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const PC = NAMES;

// 5-limit just scale above a tonic
export const JUST = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];

// deterministic per-key pseudo-random number in [−1, 1]
function keyNoise(m) {
  let t = (m * 2654435761) >>> 0;
  t ^= t >>> 15; t = Math.imul(t, 2246822519) >>> 0; t ^= t >>> 13;
  return ((t >>> 0) / 4294967296) * 2 - 1;
}

export function tunedFreq(m, P) {
  let f;
  if (P.tuning === 'just') {
    const deg = (((m - P.tonic) % 12) + 12) % 12;
    f = keyFreq(m - deg) * JUST[deg];
  } else f = keyFreq(m);
  if (P.mistune > 0) f *= 2 ** ((P.mistune * keyNoise(m)) / 1200);
  return f;
}

// bridge conductance from the 0–1 "coupling" knob
export const bridgeG = (x) => 0.6 * x * x;

export function stringModel(m, P, fs, fOverride) {
  const f0 = fOverride ?? tunedFreq(m, P);
  const L = clamp(0.62 * 2 ** ((-0.75 * (m - 48)) / 12), 0.1, 1.3);
  const T = 90;
  const B = P.inharm;
  const f1 = f0 / Math.sqrt(1 + B);           // so that mode 1 sounds at f0
  const mu = T / (4 * L * L * f1 * f1);
  const EI = (B * T * L * L) / (PI * PI);
  const Z0 = Math.sqrt(T * mu);
  const G = bridgeG(P.coupling);
  const fmax = Math.min(P.maxFreq, 0.45 * fs);
  const beta = clamp(P.bowPos, 0.02, 0.45);
  const xb = L * (1 - beta);
  const nrm = Math.sqrt(2 / (mu * L));
  const b1 = 0.5 * P.loss, b3 = 3e-9 * P.loss;
  const freq = [], sigma = [], phiB = [], c = [], d = [], o = [];
  for (let n = 1; n <= 80; n++) {
    const kk = (n * PI) / L;
    const om = kk * Math.sqrt((T + EI * kk * kk) / mu);
    if (om / (2 * PI) > fmax && n > 1) break;
    const sgn = n % 2 ? -1 : 1;
    const unit = Math.sqrt((2 * (T + EI * kk * kk)) / L); // bridge force per √(admittance)
    freq.push(om / (2 * PI));
    sigma.push(b1 + b3 * om * om);
    phiB.push(nrm * Math.sin(kk * xb));
    c.push(sgn * Math.sqrt(G) * unit);
    d.push(sgn * Math.sqrt(G) * unit * Math.sqrt(om));
    o.push(sgn * unit);
  }
  const sigma1 = sigma[0] + (G * T) / L;
  return {
    key: m, f0, L, T, mu, Z0, beta, n: freq.length,
    freq: Float64Array.from(freq), sigma: Float64Array.from(sigma), phiB: Float64Array.from(phiB),
    c: Float64Array.from(c), d: Float64Array.from(d), o: Float64Array.from(o),
    // bow-force bounds per unit bow speed
    fminPerV: (mu * L * sigma1) / (2 * beta * beta),
    fmaxPerV: (2 * Z0) / (beta * Math.max(0.05, P.mus - P.mud)),
    sigmaBridge: (G * T) / L,
  };
}
