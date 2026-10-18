// glass-model.h — the physics: Franklin's armonica, thin hemispherical glass bowls on a turning
// spindle, rubbed by wet fingers.
//
// Each bowl's sound is the inextensional modes of the shell, n = 2, 3, 4, … nodal meridians, with
// Rayleigh's energy ratio
//   ω_n² = E h² n²(n²−1)² I₁ / (3ρ(1+ν) a⁴ I₂),
// Bryan's factor B = 2I₃/I₂ for the rotation, French's liquid loading, radiation as the order-n
// harmonic of a sphere, a Stribeck curve for wet skin on glass, and the speaking threshold from
// the linear stability of steady sliding. Units: SI throughout. Nothing here allocates.
#pragma once

#include <array>
#include <cmath>
#include <numbers>

namespace forte::glass {

constexpr int KEY_LO = 53, KEY_HI = 93, NK = KEY_HI - KEY_LO + 1; // F3–A6 (Franklin: 37 bowls, G3–G6)
struct Glass { double E, rho, nu; };
constexpr Glass GLASS = {70e9, 2500, 0.22}; // soda-lime/potash glass
constexpr double RHO_WATER = 1000, C_AIR = 343;
constexpr int N_MAX = 6;          // highest family kept (if below 16 kHz)
constexpr int MODES = N_MAX - 1;  // families n = 2 … N_MAX at most

// Rayleigh's integrals for family n, its frequency constant (ω = λ (h/a²) √(E/ρ)) and Bryan's
// factor (the pattern's precession in the bowl's frame, as a fraction of its rotation).
struct Rayleigh { double I1, I2, I3, lambda, bryan; };
const Rayleigh &rayleigh(int n); // n = 2 … N_MAX (computed once)
Rayleigh rayleighOf(int n);      // any n ≥ 2 (computes)
// Rayleigh's inextensional field itself (unit sphere): u, v, w.
void rayleighField(int n, double th, double ph, double out[3]);
double liquidJ(int n, double thetaD);
// A thin ring (Rayleigh, Hoppe): the same modes in the limit of a short cylinder.
inline double ringRatio(int n) { return (n * (n * n - 1.0)) / std::sqrt(n * n + 1.0) / (6 / std::sqrt(5.0)); }
inline double ringBryan(int n) { return 2 / (n * n + 1.0); }

double bowlRadius(double key);
double bowlThickness(double key);
double radiationEff(int n, double ka);
double keyNoise(int m, int salt = 0);
double waterLoad(int n, double a, double h, double fill);

// The parameters a bowl depends on (P.split, P.loss, P.water).
struct BowlParams { double split = 0, loss = 4e-4, water = 0; };
// One family of a bowl (bowl: modes[]).
struct Mode {
  int n;
  double f, fEmpty, load, f1, f2, sigma, M, bryan, rad, psi;
};
// Everything the engine and the views need for one bowl.
struct Bowl {
  int key = 0;
  double a = 0, h = 0, f0 = 0, mass = 0;
  int count = 0;
  std::array<Mode, MODES> modes{};
};
Bowl bowl(int key, const BowlParams &P);

// The lab-frame lines of a free (untouched) rotating bowl, family m: four { f, w }.
struct Line { double f, w; };
void freeLines(const Mode &m, double rot, Line out[4]);

// Friction of wet skin on clean glass: a Stribeck curve plus a weak viscous term,
//   μ(u) = μd + Δμ/(1 + (u/v0)²) + β u.
struct Friction { double mud, dmu, v0, beta, noise; };
Friction friction(double wet, double v0, double rough);
inline double mu(double u, const Friction &fr) { const double x = u / fr.v0; return fr.mud + fr.dmu / (1 + x * x) + fr.beta * u; }
inline double frictionSlope(double u, const Friction &fr) { // −dμ/du: positive where friction weakens with speed
  const double x = u / fr.v0;
  return (2 * fr.dmu * x) / (fr.v0 * (1 + x * x) * (1 + x * x)) - fr.beta;
}

// The fingertip: skin pad (mass, shear spring, damper), the pressed pulp's radial damping, and
// the times the normal force takes to land and to lift.
struct Skin { double m, k, c, cr, nHalf, land, lift; };
constexpr Skin SKIN = {2e-5, 2000, 8, 6, 0.1, 0.012, 0.01};
inline double pulpDamping(double N) { return (SKIN.cr * N) / (N + SKIN.nHalf); }

inline double rimSpeed(int key, double speed) { return 2 * std::numbers::pi * speed * bowlRadius(key); }
// Lab-frame coupling of the cos/sin patterns of family m for a bowl turning at rot rev/s.
inline double transport(const Mode &m, double rot) { return m.n * (1 - m.bryan) * 2 * std::numbers::pi * rot; }

// The parameters the threshold depends on besides the bowl's.
struct TouchParams { double wet = 0.85, v0 = 0.5, rough = 0, speed = 0.5; };
// Speaking threshold: the normal force (newtons) at which steady sliding goes unstable for the
// n = 2 family; infinity if it never does.
double speakingThreshold(int key, const TouchParams &T, const Bowl &b);
// Key regulation: each bowl's threshold for a wet finger at the reference treadle speed.
double regulation(int key);

} // namespace forte::glass
