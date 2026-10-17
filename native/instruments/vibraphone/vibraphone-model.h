// vibraphone-model.h — the physics of a vibraphone (vibraphone/src/vibraphone-model.js in C++):
// the undercut bars (bar.h) with their losses, the stopped tube under each bar coupled to its
// mode 1 through the air in the gap, the motor's butterfly discs, and the mallet.
//
//      mallet ●
//   ┌──────────╲_______________________╱──────────┐  aluminium bar (undercut, bar.h)
//   ○ cord at a node     air gap g         cord ○
//                 ┌────────═╪═────────┐  ← butterfly disc on the motor's shaft
//                 │  stopped tube,    │  quarter-wave resonator tuned to the bar
//                 └───────────────────┘  closed end
//
// The per-bar data (barModel, voiceData) allocates and takes a millisecond or two: it is built
// off the audio thread (forte/background.h). The rest is plain arithmetic.
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <numbers>
#include <vector>

#include "bar.h"
#include "forte/dsp.h"

namespace forte::vibraphone {

constexpr int KEY_LO = 53, KEY_HI = 89; // F3–F6, the standard three-octave vibraphone
constexpr double T_TUNE = 20;           // °C: bars and tubes are tuned at this temperature

// Air: ideal gas at sea level.
struct Air { double c, rho; };
inline Air air(double T) {
  const double K = T + 273.15;
  return {331.3 * std::sqrt(K / 273.15), 101325 / (287.05 * K)};
}

// What every bar starts as: aluminium 12.7 mm thick, its width graded from 57 mm (F3) to 38 mm
// (F6); cf = c/a, the flat share of the cut.
struct Blank { double b, h0, cf; };
Blank barBlank(int k);
// Natural or accidental, its place on its shaft, and its centre along the frame.
struct Layout { bool accidental; int index; double x; };
Layout barLayout(int k);
double frameLength();
// Stereo: equal-power pan by where the bar sits along the frame (bass left): {left, right}.
std::array<double, 2> barPan(int k, double width = 0.55);

// The bar for key k with its undercut at `depth` × the tuned depth, cut to the length that keeps
// mode 1 on pitch.
struct Geometry { int key; double L, b, h0, cf, A, D, depth; Cut cut; };
Geometry barGeometry(int k, double depth = 1);

// Thermoelastic damping (Zener).
struct Thermo { double alpha, cp, k, T; };
inline constexpr Thermo THERMO = {23e-6, 900, 167, 293.15};
inline constexpr double ZENER_DELTA = (AL.E * (THERMO.alpha * THERMO.alpha) * THERMO.T) / (AL.rho * THERMO.cp);
double zener(double h, double f);

// The cords: a dashpot r (N·s/m) at each, of half-width halfWidth (m).
struct Support { double r, halfWidth; };
inline constexpr Support SUPPORT = {0.25, 0.002};
inline constexpr double DAMPER_X = 0.05; // the felt damper bar presses on each bar this far (× L) from its inner end

// Everything about one bar (key k, undercut depth) that does not change while it rings.
struct Mode {
  bool tors;
  int n;
  double f, ratio;
  bool sym;
  std::vector<double> w;
  double sigTE, sigSup, sigRad, out;
};
struct BarModel {
  int key;
  Geometry geom;
  std::vector<double> xs;
  std::vector<Mode> modes;
  std::vector<double> nodes;
  double mass, hmin;
};
BarModel barModel(int k, double depth = 1);
double interp(const std::vector<double> &xs, const std::vector<double> &ys, double x);

// Tube radius, graded from 38 mm (F3) to 21 mm (F6).
double tubeRadius(int k);
// Geometry of bar and tube where they meet: the mouth's radius a and area S, the volume S_b that
// bar mode 1 pushes toward it, the sideways escape distance R_b, the open-end correction and ℓ_v.
struct TubeGeometry { double a, S, Sb, Rb, delta0, lv; };
TubeGeometry tubeGeometry(int k, const BarModel &bar);
// The escaping air's inertance (kg/m⁴).
inline double gapInertance(double rho, double g, double Rb) { return (rho * std::log(1 + Rb / g)) / (TAU * g); }
// The disc's open share of the mouth at angle θ.
inline double openFraction(double theta, double cd) { return 1 - cd * std::fabs(std::sin(theta)); }

// The two-oscillator model of bar mode 1 and the tube's first mode, for the knobs.
struct TubeState {
  double length, le, ma, Ka, mg, Sb, Rrad, Rwall, R, lvS, cd, M11, M12, M22;
};
TubeState tubeState(const TubeGeometry &tg, double f1, double gap, double detune, double temp, double cd);
inline double discMass(const TubeState &ts, double theta) { return ts.lvS * (1 / openFraction(theta, ts.cd) - 1); }
// Coupling coefficient κ and the tube's own frequency (bar held still) at disc angle θ.
struct Coupling { double kappa, ft, fb, m22; };
Coupling coupling(const TubeState &ts, double theta, double fb);
// Two oscillators coupled through their masses: the pair's frequencies.
std::array<double, 2> twoOscillator(double fb, double ft, double kappa);
// The damped pair exactly: the roots of det(s²M + sC + K) = 0 (Durand–Kerner), {f, σ} by f.
struct Damped { double f, sigma; };
std::vector<Damped> coupledModes(double M11, double M12, double M22, double C11, double C22, double K11, double K22);

// The mallet: F = K δ^p with a little hysteresis α.
struct MalletLaw { double p, alpha; };
inline constexpr MalletLaw MALLET = {2.3, 3e-5};
struct Mallet { double m, K, p, alpha; };
inline Mallet malletOf(double hardness, double mass) { return {mass / 1000, hardness / std::pow(1e-3, MALLET.p), MALLET.p, MALLET.alpha}; }

// Bar frequencies drift with temperature: about −0.4 ¢ per kelvin.
inline constexpr double BAR_TEMPCO = 0.5 * (THERMO.alpha - 4.8e-4);
inline double barTempScale(double temp) { return 1 + BAR_TEMPCO * (temp - T_TUNE); }

// The voice data the engine plays (the page's noteData): modes, their shapes, losses, outputs.
struct VoiceData {
  int key;
  double depth, L, b;
  int nx, N, nb;
  std::vector<double> w; // N × nx
  std::vector<double> f, sigFixed, out, dampW;
  std::vector<uint8_t> tors;
  TubeGeometry tube;
  bool accidental;
  int shaftIndex;
  std::array<double, 2> pan;
};
VoiceData voiceData(int k, double depth = 1);
// A bar's voice data as plain numbers, to hand from a page's model to its engine (as the
// JavaScript's noteData): packVoiceData writes it (returning how many) and unpackVoiceData reads it
// back (false if it doesn't fit). PACK_MAX bounds it.
constexpr int PACK_MAX = 17 + 5 * 8 + 8 * 128;
int packVoiceData(const VoiceData &d, double *out);
bool unpackVoiceData(const double *in, int n, VoiceData &d);

} // namespace forte::vibraphone
