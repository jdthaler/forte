// harmonium-model.h — the physics of a free-reed organ: the brass tongue with its tip weight, the
// slot it chokes, the voicer's design of each reed, the steady state and the linear analysis (its
// threshold), the wind and the cassotto.
//
//   bellows ─▶ reservoir P ─▶ pallet ─▶ throat (air mass M_a) ─▶ cell (volume, pressure p_c)
//                                                                  │
//                         reed (brass cantilever) over its slot ◀──┘  jet U_g = c_d A(y) x
//                                                                  │
//                                       sound ∝ d/dt (U_g + S ẏ) ◀─┘  (optionally through a cassotto)
#pragma once

#include <array>
#include <optional>

#include "forte/dsp.h"
#include "harmonium-params.h"
#include "tuning-table.h"

namespace forte::harmonium {

constexpr double PI = 3.141592653589793, TAU = 2 * PI;
struct Air { double rho, c; };
constexpr Air AIR{1.2, 343};
struct Brass { double E, rho; };
constexpr Brass BRASS{1.0e11, 8500};      // yellow brass: Young's modulus (Pa), density (kg/m³)
constexpr double CD = 0.61;               // vena contracta of a sharp-edged slot
constexpr double EPS_V = AIR.rho * 0.3;   // Pa per m/s: a whisper of viscous resistance
constexpr int KEY_LO = 36, KEY_HI = 96;   // C2–C7, 61 keys (the 8′ rank): the compass
constexpr int KEY_MIN = 21, KEY_MAX = 108; // what it plays with the full range open: the same reeds, voiced on
inline const double F_REF = keyFreq(60);
constexpr double P_NOM = 800;             // Pa: the wind the reeds are voiced for

// The ranks of reeds a key can sound: 16′, 8′, the musette's 8′ + and 8′ −, 4′.
constexpr int NRANKS = 5;
struct Rank { const char *id, *name; int oct, cents; };
inline constexpr Rank RANKS[NRANKS] = {{"L", "16′", -1, 0}, {"M", "8′", 0, 0}, {"Mp", "8′ +", 0, 1}, {"Mm", "8′ −", 0, -1}, {"H", "4′", 1, 0}};
// Which ranks the stops engage (P indexed as in harmonium-params.h).
void engaged(const double *P, bool on[NRANKS]);

// The knobs a reed's design depends on (and the musette's detune, which sets its frequency).
struct Voicing { double set = 0.9, clearance = 40, q = 500, throat = 1, cell = 1, detune = 12; };
Voicing voicingOf(const double *P);
double rankFreq(int m, int r, const Voicing &v);

// The tongue: a uniform cantilever with a point mass at its tip.
std::array<double, 2> tipMassRoots(double mu);
double modeShape(double lam, double u);
struct Scale { double h, b, mu; std::array<double, 2> lam; double L; };
Scale reedScale(double fNat);

// The slot.
struct Geo { double L, b, h, e, delta; std::array<double, 2> lam; double mu, y0; };
double gapWidth(double w, double e, double h, double delta);
double slotArea(double y, const Geo &geo);
constexpr int AREA_N = 512;
struct AreaTable { double lo, dy; int n; std::array<double, AREA_N> A; };
void areaTable(const Geo &geo, AreaTable &T);
struct Area { double A, dA; };
Area areaAt(const AreaTable &T, double y);

struct Mode { int n; double lam, f, om, m, k, S, I1, I2, I3, zeta; };
// One reed, voiced, with its slot's area tabulated.
struct ReedModel {
  double fNat = 0, fSound = 0, tune = 1;
  Geo geo{};
  std::array<Mode, 2> modes{};
  double perim, Ma, C, V, Ain, K, lj, drag, fCell, m0, M, sag, Anom, Rj, eps, uOpt, throatLA;
  AreaTable table;
};
void reedDesign(double fNat, const Voicing &P, ReedModel &d);
double tuneRatio(double fSound);
void reedModel(double fSound, const Voicing &P, ReedModel &d, bool tuned = true);

// The steady state at wind pressure Pw.
struct Equilibrium { double y, x, U, dp, pc, A, dA; };
Equilibrium equilibrium(const ReedModel &R, double Pw, double pd = 0);

// The linear analysis: the root of F(s) near s0, and the threshold blowing pressure.
struct Cx { double re, im; };
struct Cassotto { double M, C, R, V, f; };
std::optional<Cx> linearRoot(const ReedModel &R, double Pw, const Cx *s0 = nullptr, const Cassotto *cass = nullptr);
struct Threshold { double P, f; };
std::optional<Threshold> threshold(const ReedModel &R, double pMax = 2e4, const Cassotto *cass = nullptr);

// The wind.
struct Wind { double G, tauRes, tauExpr, pumpDepth; };
constexpr Wind WIND{1.0e-4, 0.6, 0.015, 0.2};
inline double windTau(const double *P) { return P[p::expression] ? WIND.tauExpr : WIND.tauRes; }
double pumpShape(double t, double rate);

// The cassotto (accordion tone chamber), a Helmholtz resonator at f.
Cassotto cassotto(double f);

double palletOpen(double vel);
double palletClose(double rel); // rel < 0: no release velocity
double percussionSpeed(double vel);

} // namespace forte::harmonium
