// ring-model.js — the Storage Ring's constants. The model itself (each key's ring, the
// decoherence factors, the form factor) is the C++'s (native/instruments/ring/ring-model.cpp),
// which the page and the tests call through ring-wasm.js; the tests check it against particles
// tracked turn by turn. No DOM, no audio.
//
// Each key is a ring holding one bunch of particles. The bunch passes a pickup once a turn, so
// the revolution frequency f_rev is the note. A pickup electrode sees the bunch's charge, and a
// little more when the bunch passes nearer to it: its signal is the pulse train times
// (1 ± x̄/b), x̄ the bunch's centroid that turn and b the pickup's half-aperture.
//
// Injection leaves the bunch off orbit by Z beam sizes; every particle then oscillates at Q
// oscillations per turn (betatron motion), and the centroid puts sidebands at (n ± q)·f_rev
// beside the harmonics. The particles' tunes differ, and the centroid dephases (Meller, Chao,
// Peterson, Peggs & Furman, SSC-N-360, 1987):
// - chromaticity Q′, recohering every synchrotron period:
//     |x̄|/x̄₀ = exp(−2 (Q′σδ/Qs)² sin²(π Qs N))
// - amplitude detuning μ (octupoles), for good, with θ = 4πμN:
//     x̄/x̄₀ = 1/(1 + θ²) · exp(−Z²θ²/(2(1 + θ²))), phase + 2 atan θ + (Z²/2) θ/(1 + θ²)
// Radiation damps the centroid in τx and the synchrotron oscillation in τx/2. A Gaussian bunch of
// rms length σ (a share of the ring) weighs harmonic n by exp(−(2πnσ)²/2). The RF voltage V sets
// the synchrotron frequency as √V; the bunch shortens as V^(−¼) and its momentum spread grows as
// V^(¼) (the longitudinal emittance is an adiabatic invariant).

export const PRESS_GAIN = 3;        // full key pressure: the RF voltage × (1 + 3)
export const PICKUP_SIGMA = 20e-6;  // s: the pickup's cable and amplifier, a Gaussian response of this rms width
export const OCTUPOLE_UNIT = 1e-4;  // the amplitude-detuning parameter is in units of 10⁻⁴
export const REF_KEY = 60;          // the lattice parameters are given for the C4 ring
