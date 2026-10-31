// ondes-model.h — the physics of the ondes Martenot, apart from the real-time engine:
//
//   the heterodyne: two radio-frequency oscillators whose difference is the note, pulling on each
//   other (Adler's equation, dφ/dt = Δ − K sin φ), its exact step over one sample (a Möbius map of
//   z = e^{iφ}), the beat it gives (Ω = √(Δ² − K²)) and how its harmonics fall (rⁿ)
//   the intensity key: the finger's force on the bag of graphite and mica powder, and the level it
//   gives, from Quartier et al.'s measurements (2015)
//   the diffuseurs: the free circular plate of the Métallique's tam-tam (Kirchhoff's plate, its
//   free-edge frequency equation solved with Bessel functions), the brass helical springs of the
//   Résonance (the curved-rod dispersion relation of the spring-reverb literature) and the
//   chromatic strings of the Palme
//
// sin, cos, exp, log and pow are V8's (forte/fdlibm.h), so the WebAssembly and the plugins agree to
// the last bit.
#pragma once

#include <vector>

namespace forte::ondes {

inline constexpr double PI = 3.14159265358979323846;

// ---- the heterodyne ----------------------------------------------------------------------------
// One sample's step of Adler's equation dφ/dt = Δ − K sin φ (Δ, K in rad/s, h in s), exact for
// constant Δ and K: z = e^{iφ} obeys a Riccati equation, dz/dt = iΔz − (K/2)(z² − 1), whose flow
// is the Möbius map z → (a z + b)/(c z + d) of exp(hM), M = [[iΔ/2, K/2], [K/2, −iΔ/2]].
struct Mobius { double ar, ai, b, c, dr, di; }; // a = ar + i ai, b = c real, d = dr + i di = ā
Mobius adlerStep(double delta, double K, double h);
// The beat a free-running difference Δ gives against the pull K (Hz or rad/s): √(Δ² − K²), 0 when locked.
double beat(double delta, double K);
// The difference Δ that beats at f against the pull K: what each key is trimmed to, √(f² + K²).
double trimFor(double f, double K);
// How the beat's harmonics fall: the n-th of cos φ is rⁿ times the fundamental, r = (Δ − Ω)/K.
double harmonicRatio(double delta, double K);

// ---- the intensity key --------------------------------------------------------------------------
// Quartier, Meurisse, Colmars, Frelat & Vaiedelich (2015), Table II: the mean force on the key (N)
// at the boundaries of the seven nuances, and the sound level (dB SPL) there.
inline constexpr int NUANCES = 7;
inline constexpr double NUANCE_F[NUANCES] = {0.39, 0.47, 0.52, 0.62, 0.82, 1.34, 9.60};
inline constexpr double NUANCE_DB[NUANCES] = {45.0, 53.3, 61.6, 70.0, 78.3, 86.6, 95.0};
inline constexpr double F_SOFT = 0.3, F_HARD = 3.0, F_MAX = 9.6; // N: velocity 0 to 1, then aftertouch to F_MAX
inline constexpr double F_OPEN = 0.05; // N: below this the key's contact is open: silence
// The level (dB SPL) a force gives: Table II, straight between its points in log force, and past
// its ends along its end segments.
double levelDb(double F);
// The gain for a force: the level relative to the loudest (95 dB at 9.6 N); 0 once the contact opens.
double keyGain(double F);
// The force a key's velocity (0–1) and aftertouch (0–1) press with.
double keyForce(double velocity, double after);

// ---- the Métallique's tam-tam -------------------------------------------------------------------
inline constexpr double BRONZE_E = 110e9, BRONZE_RHO = 8600, BRONZE_NU = 0.33;
inline constexpr double GONG_H = 1.5e-3;   // m: the plate's thickness
inline constexpr double GONG_COIL = 0.3;   // where the voice coil meets it, as a fraction of the radius
inline constexpr double GONG_LAMBDA = 60;  // the modes are solved up to this λ (√(ω a² √(ρh/D)))
// Bessel functions of the first kind and modified, orders 0..M at x (Miller's backward recurrence).
void besselJ(int M, double x, double *J);
void besselI(int M, double x, double *I);
// The free-edge frequency equation of a Kirchhoff plate with m nodal diameters and Poisson's
// ratio ν, scaled: zero at λ.
double plateEquation(int m, double lam, double nu);
struct PlateMode { int m; double lam, w; }; // w: the mode shape at the coil, normalised (∫W² dA = 1, radius 1)
// Every mode with λ < GONG_LAMBDA (the rigid ones left out), by λ: solved once, size-independent.
const std::vector<PlateMode> &plateModes();
// Hz per λ² for a plate of this diameter (m): √(D/ρh)/(2π a²).
double plateHzPerLam2(double diameter);

// ---- the Résonance's springs ---------------------------------------------------------------------
inline constexpr double BRASS_E = 100e9, BRASS_RHO = 8500;
inline constexpr double SPRING_R = 0.01, SPRING_r = 0.4e-3; // m: coil radius (2 cm across), wire radius
inline constexpr int SPRINGS = 7;
inline constexpr double SPRING_L[SPRINGS] = {0.38, 0.41, 0.44, 0.47, 0.50, 0.53, 0.56}; // m
// The curved-rod dispersion relation (Fletcher, Tarnopolskaya & de Hoog 2001; Bilbao & Parker):
// ω² = κ²k²(ε² − k²)²/(ε² + k²), κ = (r/2)√(E/ρ), ε = 1/R.
double springOmega(double k);
// The transition frequency F_C (Hz): the lower branch's peak, at k = 0.530ε.
double springFc();

// ---- the Palme's strings ------------------------------------------------------------------------
inline constexpr int PALME = 24;
// The key each string is tuned to: twelve semitones on the front from A3 (220 Hz, the French La2),
// and the back an octave higher.
inline int palmeKey(int i) { return 57 + i; }

} // namespace forte::ondes
