// pyrophone-model.h — the physics of one singing tube, free of audio: the engine, the plugins'
// worker thread and the page's views (through the WebAssembly) share it.
//
// Each key is a glass tube, open at both ends, with a flame at x_f. The Galerkin model of a Rijke
// tube (Heckl 1990; Balasubramanian & Sujith 2008; Juniper 2011), in units of L and L/c:
//   η̈_j + ζ_j η̇_j + (jπ)² η_j = −2 jπ sin(jπ x_f) q̇,   u_f = Σ cos(jπ x_f) η_j,
//   q̇ = β [ √|1/3 + u_f(t − τ)| − √(1/3) ]          (Heckl's modified King's law, capped)
// with ζ_j = c₁ j² + c₂ √j from the bore (Matveev 2003). Linear stability by Newton continuation,
// limit cycles by harmonic balance, and the tuning table the engine cuts its tubes from.
//
// sin, cos, exp, log and pow are V8's (forte/fdlibm.h) and hypot is computed as V8 computes it, so
// the tables are the same to the last bit everywhere.
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace forte::pyrophone {

constexpr int N_MODES = 10;
constexpr double B_MAX = 1.6;     // top of the heater-gain range the model covers
constexpr double T_HOT = 400;     // K, mean gas temperature of a singing tube
extern const double C_HOT;        // m/s, 331.3 √(T_HOT / 273.15) ≈ 401
extern const double GAIN;         // √3/2: d heat / du at u = 0
constexpr double U_SAT = 3;       // the fuel limit: |1/3 + u| ≤ 3
constexpr double SCREAM = 0.8;    // the keys stay below 0.8 × the lowest Hopf point of a screaming mode
constexpr int HB_H = 12, HB_M = 64, HB_X = 2 * HB_H + 1; // harmonic balance: harmonics, points, unknowns
constexpr int TUNE_N = 41;        // the tuning table's β grid

// The flame's heat release per unit β for a flame velocity u.
double heat(double u);
// Math.hypot as V8 computes it (scaled, with Kahan summation), for two arguments.
double hypot2(double a, double b);

struct Cx { double re = 0, im = 0; };

// The tube's parameters that the physics depends on.
struct TubeParams {
  double bore = 1.0 / 30, damp = 1, xf = 1.0 / 3, lag = 0.25;
  bool operator==(const TubeParams &) const = default;
};

// The nondimensional tube: mode frequencies w_j = jπ, damping, and the flame's coupling to each
// mode (cf = cos(jπx_f) reads u_f; g = −2jπ sin(jπx_f) drives it).
struct Tube {
  int N = N_MODES;
  std::array<double, N_MODES> w{}, zeta{}, cf{}, g{};
  double tau = 0, xf = 0, c1 = 0, c2 = 0;
};
struct Damping { double c1, c2; };
Damping damping(double bore, double damp);
Tube tube(const TubeParams &P);
Tube tubeC(double c1, double c2, double xf, double lag); // the damping given directly, as the papers do

// Flame-to-flame transfer function G(s): u_f = G(s) q̇.
Cx transfer(const Tube &sys, Cx s);
// Eigenvalue of mode m (0-based) at heater gain beta: { growth rate, angular frequency }.
// taylor: e^{−sτ} → 1 − sτ (Magri & Juniper's linearisation).
Cx root(const Tube &sys, int m, double beta, bool taylor = false);
struct Hopf { bool found = false; int mode = 0; double beta = 0, W = 0; };
// The smallest β (up to bMax) at which mode m's growth rate crosses zero.
Hopf hopf(const Tube &sys, int m, double bMax = B_MAX);

// Harmonic balance: x = [W, β, U₀, a₂, b₂, …, a_H, b_H] with u_f = U₀ + A cos θ + Σ (a_h cos hθ + b_h sin hθ).
using HbX = std::array<double, HB_X>;
using HbQ = std::array<Cx, HB_H + 1>;
class HbSolver {
 public:
  explicit HbSolver(const Tube &sys);
  // Ĥ_h, h = 0…H, of heat(u_f) for the orbit x
  const HbQ &harmonics(const HbX &x, double A);
  void residual(const HbX &x, double A, HbX &r);
  bool solve(const HbX &x0, double A, HbX &out);

 private:
  const Tube &sys;
  std::array<std::array<double, HB_M>, HB_H + 1> cosT{}, sinT{};
  std::array<double, HB_M> q{};
  HbQ Hq{};
};

// Complex amplitude of mode j at harmonic h of an orbit: η_{j,h} = g_j β e^{−ihWτ} Ĥ_h / P_j(ihW).
Cx modeAmp(const Tube &sys, int j, int h, double W, double beta, Cx Hh);

struct OrbitPt {
  double A = 0, beta = 0, W = 0, U0 = 0, y = 0;
  HbX x{};
  HbQ Hq{};
  bool stable = false;
};
struct Fold { bool found = false; double beta = 0, A = 0, y = 0; };
// The branch of periodic orbits born at mode m's Hopf point, continued in the flame-velocity
// amplitude A until β leaves (0, bMax].
struct Family {
  bool found = false;
  int mode = 0;
  Hopf hopf;
  std::vector<OrbitPt> pts;
  Fold fold;
};
Family branch(const Tube &sys, int m, double aMax = 1.6, double bMax = B_MAX, int steps = 40);
// The stable orbit of a family at exactly gain beta (found: false where there is none).
struct Orbit { bool found = false; OrbitPt pt; };
Orbit orbitAt(const Tube &sys, const Family &fam, double beta);
// The radiated spectrum of a periodic orbit, h = 1…H, with the engine's listening weights.
double listenWeight(int j, double listen);
std::array<double, HB_H> orbitSpectrum(const Tube &sys, const OrbitPt &pt, double listen);
// Steady mode-1 amplitude at the flame on a family's stable branch (0 below the fold).
double steadyY(const Family &fam, double beta);

// The bifurcation analysis the views draw: the families of modes 1 and 2.
struct Bifurcation {
  TubeParams P;
  Tube sys;
  std::array<Family, 2> fam;
};
Bifurcation bifurcation(const TubeParams &P);

struct Limit { double beta; int mode; };
// The heater gain at which silence first goes unstable, and in which mode (0: none below B_MAX).
Limit silenceLimit(const Tube &sys);
// The keys' ceiling below the scream.
double screamLimit(const Tube &sys, int mode);

// The tuning table, on a grid of β: the angular frequency (units of c/L) per harmonic number at
// which a tube speaks in steady state, the threshold, the ceiling and the fold.
struct Tuning {
  TubeParams P;
  double b0 = 0, db = B_MAX / (TUNE_N - 1);
  std::array<double, TUNE_N> Ws{};
  double betaH = B_MAX, betaMax = B_MAX, fold = NAN; // fold: NaN for none
  int mode = 0;
  // W(β), interpolated (the engine's unpack())
  double W(double beta) const;
};
// From a bifurcation (fam: the families of modes 1 and 2, or null to compute the one needed).
Tuning tuning(const TubeParams &P, const Bifurcation *bif = nullptr);

// Heater gain for a key at velocity v: β = K β_H (0.4 + 0.6 v), below the scream.
inline double betaOn(double flame, double v, double betaH, double betaMax = B_MAX) { return std::min(betaMax, flame * betaH * (0.4 + 0.6 * v)); }

} // namespace forte::pyrophone
