// bowed-model.h — the physics of the viola organista (bowed/src/bowed-model.js in C++, operation
// for operation).
//
// A steel string per key, pressed by its key onto a rosined wheel that turns at surface speed v_B,
// at a fraction β of the string's length from the bridge. The string is a lossy waveguide of wave
// impedance Z₀ = √(Tμ); the wheel grips it through the hyperbolic friction curve
//   μ(Δv) = μd + (μs − μd) v₀ / (v₀ + |Δv|)
// (with a short thermal lag), and the bridge sits on a spruce soundboard whose average point
// admittance, for a plate, is real:
//   Y∞ = 1 / (8 √(ρh) (Dx Dy)^¼)   (Cremer & Heckl).
// Units: SI throughout. Nothing here allocates but boardModes.
#pragma once

#include <array>
#include <cmath>
#include <numbers>
#include <vector>

#include "forte/fdlibm.h"
#include "forte/dsp.h"

namespace forte::bowed {

// shared/dsp.js's keyFreq, modeCoeffs and filters with V8's sin, cos, exp and pow (fdlibm.h): the
// friction grows a last-bit difference in a key's tuning or a filter into another attack. (They
// hide forte::keyFreq and forte::modeCoeffs here.)
inline double keyFreq(double m) { return 440 * fdlibm::pow(2.0, (m - 69) / 12); }
inline ModeCoeffs modeCoeffs(double f, double sigma, double fs) {
  const double k = 1 / fs, wd = TAU * f, r = fdlibm::exp(-sigma * k);
  return {2 * r * fdlibm::cos(wd * k), r * r, (k * r * fdlibm::sin(wd * k)) / wd};
}
inline void setFilter(Biquad &b, Biquad::Type type, double f, double Q, double fs) { // Biquad.set, low- or high-pass
  const double w = (TAU * std::min(f, 0.45 * fs)) / fs, c = fdlibm::cos(w), al = fdlibm::sin(w) / (2 * Q);
  const double b0 = type == Biquad::lp ? (1 - c) / 2 : (1 + c) / 2, b1 = type == Biquad::lp ? 1 - c : -(1 + c), b2 = b0;
  const double a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  b.b0 = b0 / a0; b.b1 = b1 / a0; b.b2 = b2 / a0; b.a1 = a1 / a0; b.a2 = a2 / a0;
}
inline void setFilter(OnePole &o, double f, double fs) { o.g = 1 - fdlibm::exp((-TAU * f) / fs); }

constexpr int KEY_LO = 36, KEY_HI = 84, NK = KEY_HI - KEY_LO + 1; // C2–C6
struct Steel { double rho, E, G, uts; };
constexpr Steel STEEL = {7850, 2.0e11, 7.93e10, 2.4e9};
double cTorsion(); // √(G/ρ): 3180 m/s, independent of tension

// The parameters the model depends on (the descriptor's, by id).
struct Params {
  double speed = 0.25, beta = 0.12, treadle = 0.02, treadleRate = 1.1, force = 1, attack = 8;
  double mus = 0.8, mud = 0.3, v0 = 0.1, memory = 0.02, grain = 0.005, torsionQ = 40, losses = 1;
  double mobility = 1, boardEta = 0.03, damper = 0.25;
  bool lifted = false;
};
const Params &defaults(); // the descriptor's DEFAULTS

// ---- scale design -----------------------------------------------------------------------------
// Harpsichord-like scale: C5 = 36 cm, lengths double every 1/0.8 octaves going down; tension from
// 95 N in the treble to 130 N in the bass; μ from Mersenne's law. f0 is the free string's
// frequency, tuned a few cents sharp (TUNE, bowed-tuning.h) so that the bowed note is in tune.
inline double wound(int key) { return std::min(1.0, std::max(0.0, (60 - key) / 24.0)); } // 1 at C2 … 0 from C4
struct StringDesign { int key; double fKey, f0, L, T, c, mu, Z0, d, B, stress; bool wound; };
StringDesign stringDesign(int key);

// The string's own losses as a decay rate (s⁻¹) rising with frequency.
inline double stringSigma(double f, const Params &P, int key = 60) {
  return P.losses * (0.35 + 1.4 * (1 + 6 * wound(key)) * fdlibm::pow(f / 1000, 2));
}

// ---- soundboard ---------------------------------------------------------------------------------
struct Board { double a, b, rhoH, Dx, Dy; };
constexpr Board BOARD = {1.3, 0.65, 420 * 0.003, 300, 100};
double plateYinf(const Board &B = BOARD);
double plateDensity(const Board &B = BOARD);
double plateFreq(int m, int n, const Board &B = BOARD);
inline double plateShape(int m, int n, double x, double y, const Board &B = BOARD) {
  return fdlibm::sin((m * std::numbers::pi * x) / B.a) * fdlibm::sin((n * std::numbers::pi * y) / B.b);
}
// Where key k presses on the diagonal bridge (any real key, for the bridge's drive points).
void bridgePoint(double key, double out[2], const Board &B = BOARD);
// Far-field pressure of plate mode (m, n) in an infinite baffle, per unit modal velocity, towards
// (θ, φ) (Wallace 1972): [re, im], the common factor ρ₀ c₀ / (2π R) dropped.
void wallace(int m, int n, double f, double theta, double phi, double out[2], const Board &B = BOARD);
// Loss of plate mode (m, n) to the 49 strings on the bridge, Σ Z₀,k φ(x_k)² / 2M.
double stringLoad(int m, int n, const Board &B = BOARD);

struct BoardMode { int m, n; double f, sigma, M, load; double w[2][2]; };
// Modes of the board up to fMax, ascending, with loss factor eta (plus the strings' load).
std::vector<BoardMode> boardModes(double fMax, double eta, const Board &B = BOARD);

// ---- friction -----------------------------------------------------------------------------------
struct Friction { double mus, mud, v0, tau, grain; };
Friction friction(const Params &P);
inline double mu(double u, const Friction &F) { return F.mud + ((F.mus - F.mud) * F.v0) / (F.v0 + std::fabs(u)); }
// The bow (wheel) junction's state: s = 0 sticking, ±1 slipping that way; u the lagged slip speed.
struct FrictionState { int s = -1; double u = 0; };
// The friction force given the string's velocity at the bow without it (vh), the bow speed, the
// normal force and the admittance the bow point sees (bowed-model.js, frictionForce).
double frictionForce(double vh, double vB, double FN, double Y, const Friction &F, FrictionState &state);
// With rosin's thermal lag: a = 1 − e^(−Δt/τ) (frictionForceMem).
double frictionForceMem(double vh, double vB, double FN, double Y, const Friction &F, FrictionState &state, double a);

// ---- bridge and loop ------------------------------------------------------------------------------
inline double bridgeG(const Params &P) { return P.mobility * plateYinf(); }
double zAll(); // Σ Z₀ over the 49 strings

// One-pole loss filter H(z) = g(1 − p)/(1 − p z⁻¹) for a wave travelling for `dur` seconds,
// matching the string's decay rates s0 at f₀ and sh at fh; tau its phase delay at f₀ (samples).
struct LossFilter { double g, p, tau; };
LossFilter lossFilter(double f0, double s0, double fh, double sh, double fs, double dur);

// Each string's waveguide runs at os × the output rate (1, 2 or 4 at 48 kHz).
int oversample(int key, double fs);

// ---- the four wheels ------------------------------------------------------------------------------
constexpr int WHEEL_KEYS[4] = {36, 48, 60, 75};
constexpr double WHEEL_SPEED[4] = {1, 1, 1.1, 1.6}, WHEEL_BETA[4] = {1, 1, 1, 0.75};
inline int wheelOf(int key) { return key >= WHEEL_KEYS[3] ? 3 : key >= WHEEL_KEYS[2] ? 2 : key >= WHEEL_KEYS[1] ? 1 : 0; }
inline double wheelSpeed(int key) { return WHEEL_SPEED[wheelOf(key)]; }
inline double wheelBeta(int key) { return WHEEL_BETA[wheelOf(key)]; }
double torsionEcho(int key);

// Everything a key's waveguide needs (loopDesign): the string, its round-trip delays, the loss
// filters, the free decay and the torsional waves.
struct Loop : StringDesign {
  double G, Zall, N0, beta, wheel, vB, Db, Dn, gb, pb, gn, pn, rB, sigma1;
  double Zt, ft, Dtb, Dtn, rtb, rtn;
};
Loop loopDesign(int key, const Params &P, double fs);

// ---- Schelleng's bounds -----------------------------------------------------------------------------
struct Schelleng { double R, Fmax, Fmin; };
Schelleng schelleng(const Loop &L, const Params &P, double beta, double vB);
inline Schelleng schelleng(const Loop &L, const Params &P) { return schelleng(L, P, L.beta, L.vB); }

// Ideal Helmholtz motion: stuck for 1 − β of the period, slipping back at −v_B(1 − β)/β.
struct Helmholtz { double stick, vSlip, Fpp; };
inline Helmholtz helmholtz(double beta, double vB) { return {1 - beta, (-vB * (1 - beta)) / beta, (2 * vB) / beta}; }
inline double helmholtzEnvelope(double x, double L, double beta, double vB, double f0) { return (vB * x * (L - x)) / (f0 * beta * L * L); }

// ---- what the string is doing ---------------------------------------------------------------------------
enum class Kind : int { none = 0, helmholtz = 1, multiple = 2, raucous = 3 };
struct Motion { double spp = 0; Kind kind = Kind::none; };
Motion classifyMotion(const double *iv, int n);

// ---- the key action -------------------------------------------------------------------------------
// The voiced touch: half of Schelleng's maximum on the default wheels (computed once).
double voiced(int key);
inline double touch(double vel) { return 0.75 + 0.36 * vel; } // 1 at vel 0.7
inline double keyForce(int key, double vel, double force, double after = 0) { return voiced(key) * force * touch(vel) * (1 + 1.5 * after); }
inline double riseTime(double vel, double attackMs) { return attackMs / 1000 / (0.15 + 0.85 * vel); }

} // namespace forte::bowed
