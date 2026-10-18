// pyrophone-model.js — the singing tube's constants, the keys' heater gain, and the one-mode
// Rayleigh formula the tests check the C++ against. The model itself (the tube, its linear
// stability, the limit cycles by harmonic balance, the tuning) is the C++'s
// (native/instruments/pyrophone/pyrophone-model.cpp), which the page and the tests call through
// pyrophone-wasm.js. No DOM, no audio.
//
// Each key is a glass tube, open at both ends, with a flame at x_f (a fraction
// of the length, measured from the bottom). The model is the Galerkin model of
// a Rijke tube (Heckl 1990; Balasubramanian & Sujith 2008; Juniper 2011),
// nondimensionalised with the tube length L and the sound speed c, so that
// time is in units of L/c and every tube obeys the same equations:
//
//   ∂u/∂t + ∂p/∂x = 0
//   ∂p/∂t + ∂u/∂x + ζ p = q̇ δ(x − x_f)
//   q̇ = β [ √|1/3 + u_f(t − τ)| − √(1/3) ]          modified King's law (Heckl 1990)
//
// u is the acoustic velocity in units of the mean (draught) velocity, so the
// heat transfer reverses where u_f = −1/3. β is the heater gain in the
// normalisation of Magri & Juniper (2013); the linear gain is (√3/2)β. With
// open–open modes
//   u = Σ η_j cos(jπx),   p = −Σ (η̇_j / jπ) sin(jπx)
// projecting onto sin(jπx) gives one oscillator per mode,
//   η̈_j + ζ_j η̇_j + (jπ)² η_j = −2 jπ sin(jπ x_f) q̇,
// coupled only through the flame: u_f = Σ cos(jπ x_f) η_j.
//
// Damping (Matveev 2003, in the form of Juniper 2011): ζ_j = c₁ j² + c₂ √j,
// radiation from the open ends (∝ ω²) plus the viscous–thermal boundary layer
// on the wall (∝ √ω). Here c₁ and c₂ come from the tube's bore (pyrophone-model.cpp, damping).

export const N_MODES = 10;
export const B_MAX = 1.6;                                // top of the heater-gain range the model covers
export const T_HOT = 400;                                // K, mean gas temperature of a singing tube
export const C_HOT = 331.3 * Math.sqrt(T_HOT / 273.15);  // m/s, ≈ 401
export const GAIN = Math.sqrt(3) / 2; // d heat / du at u = 0

// Weak-coupling (single-mode, first-order) growth rate and frequency of mode j in the tube sys
// (the C++'s, pyrophone-wasm.js tube), the check on its exact root:
//   s ≈ −ζ_j/2 + (√3/4) β sin(2jπx_f) [sin(jπτ) + i cos(jπτ)] + i jπ
// Rayleigh's criterion in one line: mode j is driven where sin(2jπx_f)·sin(jπτ) > 0.
export function weakRoot(sys, j, beta) {
  const z = sys.zeta[j - 1], w = j * Math.PI, r = (GAIN / 2) * beta * Math.sin(2 * w * sys.xf);
  return [-z / 2 + r * Math.sin(w * sys.tau), w + r * Math.cos(w * sys.tau)];
}

// Heater gain for a key pressed at velocity v: the key parts the flames,
// β = K β_H (0.4 + 0.6 v), with the flame power K in units of the threshold β_H
// (the Hopf point of silence, the tuning's betaH), so that it means the same for every
// bore, damping and flame; below the scream (the tuning's betaMax).
// Key up: β = (key-up fraction) × β_H.
export const betaOn = (P, v, betaH, betaMax = B_MAX) => Math.min(betaMax, P.flame * betaH * (0.4 + 0.6 * v));
