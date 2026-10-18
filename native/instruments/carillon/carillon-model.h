// carillon-model.h — the physics of a carillon: which rib each key gets and how big its bell is;
// each mode's frequency, damping (bronze's internal loss + radiation), excitation at the strike
// point and radiation towards the listener; the doublets; the historic, untuned bell; the clapper's
// Hertz contact; air absorption over the listening distance; and the virtual-pitch estimator that
// finds the strike note.
//
// The ribs and their modes come from the axisymmetric FEM (carillon/src/bell-fem.js, run once by
// tools/carillon-profile.mjs), as a generated table (bell-table.h): nothing here solves an
// eigenproblem. Nothing here allocates: the engine calls it when a bell is struck.
#pragma once

#include <cmath>
#include <cstdint>
#include <numbers>

#include "bell-table.h"

namespace forte::carillon {

constexpr double TAU = 2 * std::numbers::pi;
constexpr int KEY_LO = 48, KEY_HI = 96; // C3–C7 at sounding pitch: a four-octave concert carillon
inline double keyFreq(double k) { return 440 * std::pow(2.0, (k - 69) / 12); }

// Bell bronze, about 78 % copper and 22 % tin; the air at 20 °C at sea level
struct Bronze { double E, rho, nu; };
inline constexpr Bronze BRONZE = {105e9, 8700, 0.33};
extern const double cBronze; // m/s: f = √λ/(2π) · cBronze / D for the FEM's λ
struct Air { double rho, c; };
inline constexpr Air AIR = {1.2, 343};

const Rib &ribFor(int profile, int key);
// a mode's tabulated inner-surface motion at height h (fraction of H above the lip)
double winAt(const TableMode &mode, double h);
// The soundbow: where the wall is thickest, as a fraction of the height above the lip.
double soundbowHeight(const Rib &rib);

// Deterministic pseudo-random numbers per key (bells are individuals): xorshift seeded by key and salt.
struct Rng {
  explicit Rng(double seed);
  double operator()();
  uint32_t s;
};

// The historic bell: its wall a few per cent off in each region, seeded by the key (HISTORIC.sigma ×
// amount, rms); each mode moves by d ln f = Σ s_g δ_g, relative to the nominal; and a random
// asymmetry in every harmonic 2m (HISTORIC.asym × amount, rms) at a random orientation.
constexpr double HISTORIC_SIGMA = 0.08, HISTORIC_ASYM = 0.004;
constexpr int HIST_M = 33; // harmonics m = 0 … 32
struct Historic {
  double lnf[MODES_MAX], d[SENS_N];
  struct { double e, psi; } asym[HIST_M];
};
void historic(int key, const Rib &rib, double amount, Historic &out);

// One bell: which rib, how big, how heavy; every mode's frequency (Hz). Tuned by its nominal, an
// octave above the key.
struct Bell {
  int key, profile;
  const Rib *rib;
  double D, H, mass, fNom, fPrime, strikeHeight;
  double f[MODES_MAX];
  bool hasHist;
  Historic hist;
};
void bellOf(int key, int profile, double historicAmount, Bell &out);
// the diameter and mass alone (bellOf without its modes), as bellOf computes them
void bellSize(int key, int profile, double &D, double &mass);

// losses and radiation
double radiationEfficiency(int l, double ka);
double horizonGain(int m);
double airAbsorption(double f, double T = 15, double hr = 70, double pa = 101.325);
constexpr double WEATHER_T = 15, WEATHER_HR = 70; // a mild day
constexpr double REF_DISTANCE = 30;              // m: the output level is set for a listener this far away
double distanceGain(double f, double r);

// Every mode of one bell, ready to play (the m ≤ 1, k = 0 mounting modes left out): its frequency
// and decay σ, the strike's reach and its radiation. P is indexed as in carillon-params.h.
struct BellMode {
  int j, m, k;
  Partial name;
  double f, sigma, sigRad, sigInt, eff, reach, rad, kappa;
};
inline bool isMounting(const TableMode &m) { return m.m <= 1 && m.k == 0; }
int bellModes(const Bell &b, const double *P, BellMode *out); // returns how many

// Doublets: the asymmetry of harmonic 2m (the knob's ε at ψ = 0 plus a historic bell's own), and
// the pair's frequency factors (cos, sin members).
struct Asymmetry { double e, psi; };
Asymmetry asymmetryOf(int m, double eps, const Historic *hist);
inline void doubletSplit(double kappa, double e, double out[2]) { out[0] = 1 - (e * kappa) / 4; out[1] = 1 + (e * kappa) / 4; }

// The clapper: a ball of P.clapMass % of the bell's mass, radius 5 % of D, Hertz contact.
constexpr double CLAPPER_NU = 0.28, CLAPPER_BALL = 0.05;
struct Clapper { double m, R, K, Es; };
Clapper clapperOf(const Bell &b, const double *P);
inline double hertzTime(double m, double K, double v) { return 3.2145 * std::pow(m / K, 0.4) * std::pow(v, -0.2); }
constexpr double SPEED_CAP = 8; // m/s
double clapperSpeed(const Bell &b, const double *P, double velocity);

// The strike note: subharmonic summation (Hermes 1988) on partials { f, a }.
struct Heard { double f, a; };
struct StrikeNote {
  double f, strength;
  int curveN; // points of the pitch-strength curve, from SHS_F_LO at SHS_PPO per octave
};
constexpr int SHS_PPO = 48, SHS_HARMONICS = 15, SHS_WIDTH = 2;
constexpr double SHS_COMPRESSION = 0.75, SHS_F_LO = 40, SHS_F_HI = 5000, SHS_FLOOR_DB = -50;
inline double pitchWeight(double f) { return 1 / std::sqrt((1 + std::pow(f / 2500, 2)) * (1 + std::pow(300 / f, 2))); }
// curve, if not null, gets curveN values (at most SHS_CURVE_MAX)
constexpr int SHS_AXIS_MAX = 640, SHS_CURVE_MAX = 400;
StrikeNote strikeNote(const Heard *partials, int n, double *curve = nullptr);
// The partials a listener hears right after a strike at `velocity`: one per mode of bellModes.
int struckPartials(const Bell &b, const double *P, double velocity, Heard *out);

} // namespace forte::carillon
