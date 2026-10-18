// bubbles-model.h — the physics: a gas bubble ringing in a liquid. Linearised (Rayleigh–Plesset,
// with heat flow in the gas and sound radiated into the liquid), the wall displacement
// x = R(t) − R₀ obeys ẍ + 2bẋ + ω₀²x = 0, with
//   ω₀² = [p_b Re Φ − 2σ/R] / (ρ R² m),     p_b = p₀ + 2σ/R
//   b   = [2μ/(ρR²) + p_b Im Φ / (2ρωR²) + (ω²R/2c)(1 − sin ks/ks)] / m
// Φ the complex polytropic index of the gas, m = 1 − (R/s) cos ks the free surface's image
// (s = 2d). Nothing here allocates: the engine calls it while it plays.
#pragma once

#include <array>
#include <cmath>
#include <numbers>

namespace forte::bubbles {

constexpr double G = 9.81;            // m/s²
constexpr double P_ATM = 101325;      // Pa
constexpr double T_K = 293.15;        // the tank is at 20 °C
constexpr double R_GAS = 8.314462618; // J/(mol·K)

// Gases at 20 °C: heat capacity ratio γ, molar mass M (kg/mol), thermal conductivity K (W/m·K),
// specific heat c_p (J/kg·K). In the order of the Gas parameter's choices.
struct Gas { const char *name; double gamma, M, K, cp; };
inline constexpr std::array<Gas, 4> GASES = {{
  {"air", 1.4, 0.02897, 0.0257, 1005},
  {"helium", 5.0 / 3, 0.0040026, 0.151, 5193},
  {"argon", 5.0 / 3, 0.039948, 0.0177, 520.3},
  {"SF₆", 1.10, 0.14606, 0.0130, 665},
}};
// Liquids at 20 °C: density ρ (kg/m³), dynamic viscosity μ (Pa·s), surface tension σ (N/m),
// sound speed c (m/s). In the order of the Liquid parameter's choices.
struct Liquid { const char *name; double rho, mu, sigma, c; };
inline constexpr std::array<Liquid, 3> LIQUIDS = {{
  {"water", 998.2, 1.002e-3, 0.0728, 1482},
  {"90 % glycerol", 1234.7, 0.219, 0.0643, 1876},
  {"glycerol", 1261, 1.41, 0.0634, 1920},
}};

// The keyboard: A3–C8.
constexpr int KEY_LO = 57, KEY_HI = 108, NK = KEY_HI - KEY_LO + 1;

// The tank: nozzles in a row 2 cm apart, low notes on the left; two hydrophones at nozzle depth,
// set back from the row, near either end.
constexpr double NOZZLE_PITCH = 0.02;
constexpr double ROW = NOZZLE_PITCH * (KEY_HI - KEY_LO);
constexpr double HYDRO_X[2] = {0.2 * ROW, 0.8 * ROW}, HYDRO_BACK = 0.35;
double nozzleX(int key);
extern const double R_REF; // a centre nozzle's distance to either hydrophone
// Gains of the two hydrophones (1/r spreading), relative to a centre nozzle's.
void hydrophoneGains(int key, double out[2]);

// The complex polytropic index Φ of the gas, χ = D/(ωR²).
struct Complex { double re, im; };
Complex phi(double chi, double gamma);
// Thermal diffusivity of the gas at pressure p.
inline double diffusivity(const Gas &gas, double p) { return gas.K / (((p * gas.M) / (R_GAS * T_K)) * gas.cp); }
// Rise speed (Hadamard–Rybczynski blended with Mendelson) and the distance risen after t seconds.
double riseSpeed(double R, const Liquid &liq);
double riseDistance(double t, double U);

// Where a bubble is: the liquid pressure at it (Pa), its depth below the free surface (m), the
// liquid and gas, and optionally Φ kept as it was at release (for the glide).
struct Env {
  double p0 = 0, d = 0;
  const Liquid *liq = &LIQUIDS[0];
  const Gas *gas = &GASES[0];
  bool phiFixed = false;
  Complex phiKept{0, 0};
};
// One bubble's acoustics.
struct Acoustics {
  double omega0, b, omegaD, f0, fd, delta, dvis, dth, drad, kappa, phiRe, phiIm, chi, D, pb, m, radFactor, R;
};
constexpr double IMAGE_MAX = 0.25;
Acoustics acoustics(double R, const Env &env);

// The conditions at the nozzles for parameters P (indexed as in bubbles-params.h).
Env nozzleEnv(const double *P);
// The radius that rings at f (Hz, the damped ring) under env.
double tuneRadius(double f, const Env &env);
// The conditions the nozzles were cut for: 30 cm of water, air, 1 atm.
Env defaultEnv();
// A key's radius: the nozzle's own (cut for the default conditions), or with "keep in tune"
// the radius that sounds its note under env.
double keyRadius(int key, const double *P, const Env &env);

// The kick at pinch-off: a pressure step, a fraction KICK × velocity of the Laplace pressure.
constexpr double KICK = 0.5;
inline double kickPressure(double R, const Liquid &liq, double velocity) { return (KICK * velocity * 2 * liq.sigma) / R; }
double peakPressure(const Liquid &liq, double velocity);
// A raised-cosine ramp's excitation of a ring at f, relative to an instant step.
double snapGain(double f, double tau);

// The glide while it rises: the swelling's polytropic exponent at the slow rate OMEGA_SLOW.
constexpr double OMEGA_SLOW = 2 * std::numbers::pi * 3;
double slowExponent(double R, const Gas &gas, double pb);
// A bubble released with radius R0, inner pressure pb0, Φ then (phiKept) and that exponent nSlow,
// now at depth d under the air pressure pT above the liquid: it has swollen as p_b^(−1/3n) (its
// radius into R) and rings with Φ kept as it was at release.
Acoustics glideRing(double R0, double pb0, double nSlow, Complex phiKept, const Liquid &liq, const Gas &gas, double d, double pT, double &R);

} // namespace forte::bubbles
