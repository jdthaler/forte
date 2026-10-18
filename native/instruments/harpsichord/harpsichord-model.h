// harpsichord-model.h — the physics of a Flemish double-manual harpsichord. SI units throughout.
//
//   key ─▶ jacks rise ─▶ each engaged plectrum catches its string, bends, slides and slips off
//          (plectrum.h, string.h)
//   strings: three choirs, front 8′, back 8′ and 4′, iron from B♭ up and brass below, stiff strings
//          in modal form, each partial draining into the bridge at the soundboard's conductance there
//   soundboard: an equivalent orthotropic plate, driven along the 8′ and 4′ bridges and heard by
//          two microphones over it
//
// Registration follows the French double: the upper manual plays the front 8′; the lower the back
// 8′ and the 4′; the coupler lets the lower manual take the upper's jacks too. The lute row plucks
// the back 8′ strings by the nut from the upper manual; the buff presses leather on them.
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

#include "harpsichord-params.h"
#include "plectrum.h"
#include "plucked-string.h"

namespace forte::harpsichord {

constexpr int KEY_LO = 29, KEY_HI = 89; // FF – f³, 61 keys: the compass, which the scale is drawn on
constexpr int KEY_MIN = 21, KEY_MAX = 108; // what it plays with the full range open: the same scale, continued
constexpr int C2 = 72;                  // c² (Helmholtz) = C5, the scaling reference
constexpr double TAU = 6.283185307179586;

// The model's parameters, in the page's units (its P). The last few are not knobs: the tests and
// the views' simulations may set them (NaN or −1: the default).
struct Params {
  bool upper = false, coupler = true, front8 = true, back8 = true, four = false, lute = false, buff = false;
  int material = 0;
  double stiff = 2500, overlap = 0.6, stagger = 0.5;
  double xFront = 40, xBack = 62, xFour = 45, xLute = 12;
  double pitch = 440;
  int temperament = 0;
  double detune = 1.5, loss = 1, damper = 1, fmax = 10;
  bool soundboard = true;
  double mu = -1, taper = -1, lossScale = 1, bridgeScale = 1;
  bool foreshortening = true;
};
// From the native parameters (indexed as in harpsichord-params.h).
Params paramsOf(const double *P);

// Choirs and rows
enum Choir : int { FRONT = 0, BACK = 1, FOUR = 2 };
enum Row : int { ROW_FRONT = 0, ROW_BACK = 1, ROW_FOUR = 2, ROW_LUTE = 3 };
constexpr Choir ROW_STRING[4] = {FRONT, BACK, FOUR, BACK}; // which strings a row plucks
constexpr bool ROW_UPPER[4] = {true, false, false, true};  // its manual
constexpr double ROW_ORDER[4] = {1, 0, 2, 1.5};            // its place in the stagger

// ---- tuning
double temperamentCents(int id, int pc);   // cents of pitch class pc above C
double temperamentOffset(int id, int pc);  // departure from equal temperament, A unchanged
double keyPitch(int m, const Params &P);   // the key's 8′ pitch (Hz)
double jitter(double m, double s = 0);     // a tuner's small errors, in [0, 1)
double detuneCents(int m, int choir, const Params &P);
double stringPitch(int m, int choir, const Params &P);

// ---- the scale
inline const Wire IRON = {"iron", 2.0e11, 7850, 2.5e-4};
inline const Wire BRASS = {"brass", 1.0e11, 8500, 6e-4};
double stringLength(int m, int choir);
bool isBrass(int m, int choir);
double wireDiameter(int m, int choir);
StringDesign stringDesign(int m, int choir, const Params &P, double f1 = -1);
double partialFreq(const StringDesign &S, int n);
double sigmaString(const StringDesign &S, double f, double lossScale = 1);

// ---- registers
struct Registration {
  std::array<bool, 4> rows{};  // which rows pluck (by Row)
  std::array<bool, 3> lift{};  // which choirs' jacks rise (by Choir)
};
Registration registration(const Params &P);
double pluckPoint(int m, int row, const Params &P);
constexpr double DAMPER_OFFSET = 0.004; // m: the damper cloth beside the plectrum on the jack
constexpr double BUFF_X = 0.010;        // m: the buff's pads this far from the nut
constexpr double BUFF_R = 0.6;          // × √(Tμ): the buff's damping

// ---- the action
namespace ACTION {
constexpr double gap = 1.0e-3, top = 7.5e-3, felt = 0, feltK = 300, feltR = 3.0, tongueK = 60, thick = 0.45e-3;
constexpr double keyMass = 0.025, jackMass = 0.006, knock = 2e-3;
} // namespace ACTION
double jackSpeed(double vel);  // velocity 0..1 → m/s
double fallSpeed(double r);    // release velocity 0..1 → m/s
constexpr double DEFAULT_RELEASE = 0.6;

// ---- the soundboard
namespace BOARD {
constexpr double a = 1.75, b = 0.85, rhoh = 1.6, aniso = 10, G0 = 3.5e-3, eta = 0.04, mb = 0.01;
constexpr int maxModes = 96;
} // namespace BOARD
constexpr int NSEG = 5;
struct Seg { bool four; double t; };
inline constexpr Seg SEGS[NSEG] = {{false, 0}, {false, 0.5}, {false, 1}, {true, 0}, {true, 1}};
inline constexpr double MICS[2][2] = {{0.85, 0.35}, {0.15, 0.65}}; // (x/a, y/b): tail (bass) end, front (treble) end
inline double keyT(double m) { return std::min(1.0, std::max(0.0, (m - KEY_LO) / (KEY_HI - KEY_LO))); } // past the compass: its ends
std::array<double, 2> bridgePoint(double m, int choir);
std::array<double, NSEG> segmentWeights(int m, int choir);

struct BoardModel {
  int K = 0;
  struct Mode { int m, n; double w; };
  std::vector<Mode> list;
  std::vector<double> f, sigma, phi, mic; // phi[k·NSEG + s], mic[2k + j]
  double Dx = 0, Dy = 0, Ginf = 0, fTop = 0, f11 = 0, N0 = 0;
  double shape(int k, double x, double y) const;
};
const BoardModel &boardModel(); // built once (the first engine builds it)
// Driving-point admittance (s/kg) of the board at (x, y); the modes' shapes there may be given.
std::array<double, 2> boardAdmittance(double x, double y, double f, const double *shapes = nullptr);

// ---- one string
constexpr double F_MAX = 10000;
void stringPartials(const StringDesign &S, const Params &P, double fs, Partials &out);
inline double t60(double sigma) { return std::log(1000.0) / sigma; }
inline double lateralStiffness(const StringDesign &S, double x) { return (S.T * S.L) / (x * (S.L - x)); }
constexpr double VOICING_KREF = 1000, VOICING_EXP = 0.6;
Plectrum plectrumFor(int m, int row, const Params &P);
double rowGap(int row, const Params &P);
// A string ready to play from its design and partials: damper felt, buff, tongue.
void buildString(PluckedString &st, int m, int choir, const Params &P, const StringDesign &S, const Partials &parts, double fs);

// An offline pluck (the slow-motion view, tests): one row's string at key m, the key pressed at jack
// speed V; records every `every` samples until `sec` (or `until` s after the release).
struct PluckTrace {
  std::vector<double> t, y, u, F, s, z, w, fb;
  double released = -1; // s, or −1
  PluckedString::Release rel{};
  Plectrum pl{};
  StringDesign S{};
  double x = 0, gap = 0, energy = 0, work = 0, staticCompliance = 0, Kz = 0;
};
struct Simulated { PluckTrace trace; Partials parts; PluckedString st; };
void simulatePluck(Simulated &out, int m, int row, const Params &P, double V, double fs = 48000, double sec = 0.06, int every = 1, double until = -1);

} // namespace forte::harpsichord
