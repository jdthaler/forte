// pipes-model.h — the physics of a Baroque organ's flue pipes and their wind.
//
//   reservoir ─▶ trunk ─▶ wind chest P_c ─▶ key's pallet ─▶ groove ─▶ slider ─▶ pipe foot p
//                                                                                 │
//      flue: a jet U_j = √(2p/ρ) crosses the mouth (cut-up W) to the labium ◀─────┘
//        │  deflected by the mouth's acoustic flow, τ = W/c_p earlier (c_p = 0.4 U_j)
//        ▼
//      the jet splits on the labium: Q_in = bHU_j (1 + tanh((η − y₀)/b))
//        │  Δp = (ρδ_d/S_m) dQ_in/dt − ½ρ(v/α_vc)²sgn v   (jet drive, vortex shedding)
//        ▼
//      the pipe: modes of an open or stopped tube, with end corrections and losses ─▶ sound
//
// The jet-drive model is the one of Verge et al. (1994, 1997), Fabre & Hirschberg (2000) and
// Auvray, Fabre & Lagrée (2012), with Fletcher's (1976) and Coltman's (1968, 1976) picture of the
// jet as a delayed, amplified response to the flow through the mouth. Units: SI. Nothing here
// allocates.
#pragma once

#include <array>
#include <cmath>
#include <numbers>
#include <optional>
#include <vector>

#include "forte/dsp.h"

namespace forte::pipes {

struct Air { double rho, c, nu, gamma, Pr; };
constexpr Air AIR = {1.2, 343, 1.51e-5, 1.4, 0.71};
constexpr int KEY_LO = 36, KEY_HI = 89;  // C–f³, 54 keys: the Baroque manual's compass, which the chest is laid out on
constexpr int KEY_MIN = 21, KEY_MAX = 108; // A0–C8, with the full range open: the same scales, carried on
constexpr double P_NOM = 700;            // Pa (71 mm of water): the wind the pipes are voiced for
inline const double U_NOM = std::sqrt((2 * P_NOM) / AIR.rho);
constexpr double CP = 0.4;               // jet phase velocity over jet velocity
constexpr double PHI_C = 3;              // the jet's response rolls off once it carries ωτ > 3 rad of a wave across the mouth
constexpr double ALPHA_VC = 0.6;         // vena contracta of the flow separating at the labium
constexpr double THETA_OPEN = 14;        // voicing: U_j/(fW) at the default wind, open pipes
constexpr double THETA_STOPPED = 10;     // and stopped
constexpr double GAIN = 6;               // voicing: the jet's small-signal loop gain on the fundamental's resonance (c¹ up)
constexpr double GAIN_BASS = 0.4;        // below c¹ the voicer gives it more, ∝ f^−0.4, down to C (65 Hz) and no more
constexpr double F_MAX = 15000;          // Hz: modes above this are left out
constexpr int MODES_OPEN = 10, MODES_STOPPED = 6; // and at most this many
constexpr double LS_END = 0.6133;        // Levine & Schwinger (1948): unflanged open end, × radius

// Stops and ranks: each key has six pipes, Principal 8′, Octave 4′, Gedackt 8′ and the Mixture's
// three ranks.
constexpr int RANKS = 6, STOPS = 4;
struct Rank { int stop; bool stopped; double scale; };
constexpr Rank RANK[RANKS] = {{0, false, 1}, {1, false, 1}, {2, true, 0.85}, {3, false, 1}, {3, false, 1}, {3, false, 1}};
// The Mixture: three ranks of octaves and fifths, each break dropping its highest rank and taking
// in the next below, at c, c¹ and c² (an octave over two breaks); past the compass at f♯³ and c⁴
// (5⅓′, 4′, 2⅔′, then 8′, 5⅓′, 4′), so that its ranks stay where a Mixture's pipes are (below
// about 6 kHz, and 8.4 kHz at C8, with the Octave 4′). Harmonics of the 8′; the fifths pure.
struct MixtureRow { int from; double h[3]; };
constexpr MixtureRow MIXTURE[6] = {{36, {6, 8, 12}}, {48, {4, 6, 8}}, {60, {3, 4, 6}}, {72, {2, 3, 4}}, {90, {1.5, 2, 3}}, {96, {1, 1.5, 2}}};
const double *mixtureRanks(int key);
double rankHarm(int key, int r);
// Which ranks the drawn stops engage (principal, octave, gedackt, mixture).
inline void engaged(const bool stops[STOPS], bool on[RANKS]) { for (int r = 0; r < RANKS; r++) on[r] = stops[RANK[r].stop]; }
// The key's pitch in the keyboard's tuning (equal temperament at A = 440 Hz times `ratio`, its
// tuning's for the key: forte/tuning.h), and the rank's harmonic of it: the Mixture's fifths pure.
inline double pipeFreq(int key, int r, double ratio = 1) { return keyFreq(key) * ratio * rankHarm(key, r); }

// Töpfer's normal scale.
struct Scale { double D0, f0, exp, mouth, h0, hExp; };
inline const Scale SCALE = {0.1555, keyFreq(36), 0.75, 0.25, 1.2e-3, 0.75};
inline double toepferD(double f) { return SCALE.D0 * std::pow(f / SCALE.f0, -SCALE.exp); }

// Math.hypot as V8 computes it (Kahan-compensated, scaled by the larger), so the voicing is the
// same to the last bit everywhere.
double jsHypot(double x, double y);
double agm(double x, double y);
double ellipseConductivity(double a, double b);
double mouthCorrection(double Sp, double H, double W);
double wallAlpha(double f, double a);
double modeSigma(double f, double a, double Le, int openings);
inline double modeFreq(int n, double Le, bool stopped) { return stopped ? ((2 * n - 1) * AIR.c) / (4 * Le) : (n * AIR.c) / (2 * Le); }
inline double voicedGain(double f) { return GAIN * std::max(1.0, std::pow(std::max(f, keyFreq(36)) / keyFreq(60), -GAIN_BASS)); }

struct Mode { int n; double f, om, sigma, Q; int harm; };
struct Geometry {
  double D = 0, a = 0, Sp = 0, H = 0, h = 0, dLt = 0;
  double W = 0, b = 0, y0 = 0, dd = 0, Sm = 0, Kj = 0, dLm = 0;
  bool stopped = false;
};
// One pipe, voiced.
struct PipeModel {
  double f = 0;
  bool stopped = false;
  double theta = 0;
  Geometry geo;
  double A = 0, Kj = 0, M = 0, Le = 0, L = 0, fRes = 0, Q1 = 0, gain = 0;
  int nModes = 0;
  std::array<Mode, MODES_OPEN> modes{};
};
// The knobs a pipe depends on (P.cutup, P.gain, P.offset).
struct Voicing {
  double cutup = 1, gain = 1, offset = 0.4;
  bool operator==(const Voicing &) const = default;
};
struct ModelOptions {
  double scale = -1;     // the diameter's scale (default: 0.85 stopped, 1 open)
  double W = -1;         // the cut-up as cut (default: θ at the default wind)
  bool retune = true;    // place the resonance where the pipe will sound f
  double tune = 0;       // the engine's measured correction (0 or 1: none)
};
PipeModel pipeModel(double f, bool stopped, const Voicing &P, const ModelOptions &opts = {});

// The linear analysis: complex numbers as pairs, with their operations.
struct Cx { double re, im; };
Cx admittance(const PipeModel &pipe, Cx s);
double jetDelay(const PipeModel &pipe, double p);
Cx loopGain(const PipeModel &pipe, Cx s, double p);
// The root that belongs to mode n, by Newton with continuation in the jet's strength. None if lost.
std::optional<Cx> linearRoot(PipeModel &pipe, double p, int n = 0, int steps = 8);
// The speaking window of mode n: the edges in θ = U_j/(f₁W) where its root crosses Re s = 0, and
// the scanned grid (θ, Re s; −∞ where the root is lost).
struct Window { std::vector<double> edges; std::vector<std::array<double, 2>> grid; };
Window speakingWindow(PipeModel &pipe, int n = 0, double thetaLo = 2, double thetaHi = 80);
inline double thetaAt(const PipeModel &pipe, double p) { return std::sqrt((2 * p) / AIR.rho) / (pipe.f * pipe.geo.W); }
inline double pressureAt(const PipeModel &pipe, double theta) { const double x = theta * pipe.f * pipe.geo.W; return 0.5 * AIR.rho * std::pow(x, 2); }

// The tuning table (tuning-table.h, measured by tools/pipes-tuning.mjs): the pipe's correction.
double tuning(double f, bool stopped);

// The key's pallet and groove.
struct Pallet { double cd, area; };
constexpr Pallet PALLET = {0.61, 6};
double palletTime(double velocity, double rise); // s; `rise` (ms) at velocity 0.7, ×2 per −0.3
double closeTime(double velocity);               // s; velocity < 0: none given

// The wind: reservoir, trunk, chest, the Schwimmer and the tremulant's leak.
struct WindConst { double Vc, Gr, tauR, Rt, Mt0, Mt1, Gs, tremArea; };
constexpr WindConst WIND = {0.8, 2e-3, 0.25, 1000, 5, 150, 2.5e-3, 1.2e-2};
struct WindSystem { double Cc, Mt, Gs, Gr, Cr, Rt, fw; };
WindSystem windSystem(double stiff); // 0 = steady (Schwimmer), 1 = flexible (long trunk)

// Stereo from the chest: C side left, C♯ side right, the biggest pipes outermost (−1 … 1).
double chestPan(int key);

} // namespace forte::pipes
