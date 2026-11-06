// marimba-model.h — the physics of a marimba and a xylophone: wooden bars with an arch cut under
// them (the vibraphone's finite elements, bar.h, with the wood's moduli), their losses, the stopped
// tube under each bar coupled to the bar through the air in the gap (its first resonance to the
// bar's mode 1, its second, three times higher, to the bar's mode 2), and the mallet.
//
//      mallet ●
//   ┌──────────╲_______________________╱──────────┐  rosewood bar (undercut: 1 : 4 : 10 or 1 : 3)
//   ○ cord at a node     air gap g         cord ○
//                 ┌───────────────────┐  ← the tube's mouth (it can sit off the bar's centre)
//                 │  stopped tube:    │  a quarter wave at f₁, three quarters at 3f₁
//                 └───────────────────┘  closed end
//
// The per-bar data (barModel, voiceData) allocates and takes a millisecond or two: it is built
// off the audio thread (forte/background.h) or by the page. The rest is plain arithmetic.
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

#include "bar.h"
#include "forte/dsp.h"

namespace forte::marimba {

using vibraphone::Cut;
using vibraphone::Elastic;

constexpr int KEY_MIN = 21, KEY_MAX = 108; // A0–C8: every key has a bar
enum Kind { MARIMBA = 0, XYLOPHONE = 1 };
// The real instruments' compasses, which their bars are graded on: the five-octave concert
// marimba, C2–C7, and the xylophone's three and a half octaves, F4–C8 (written an octave lower).
struct Compass { int lo, hi; };
inline constexpr Compass COMPASS[2] = {{36, 96}, {65, 108}};
// What the undercut tunes: the marimba's first three bending modes to 1 : 4 : 10, the xylophone's
// first two to 1 : 3 (its third falls where the cut leaves it, near 6).
inline constexpr double R2[2] = {4, 3}, R3[2] = {10, 0};

// Honduras rosewood along the grain (The Wood Database: 1025 kg/m³, E = 22 GPa); its shear modulus
// across the grain E/13, an estimate inside the hardwoods' range (E/7 to E/18: the Wood Handbook,
// table 5-1, which has no rosewood); and the shear coefficient of a rectangle, 5/6.
inline constexpr Elastic ROSEWOOD = {22.0e9, 22.0e9 / 13, 1025, 5.0 / 6};

// Air at 20 °C, sea level.
inline constexpr double C_AIR = 343.2, RHO_AIR = 1.204;

// What a bar starts as: its width b, its thickness h0, c/a (the flat share of the cut), and for the
// xylophone, whose cut tunes only two modes, the cut's length a/(L/2), held per key.
struct Blank { double b, h0, cf, A; };
Blank barBlank(int kind, int k);
// Natural or accidental, and its centre along the frame (bass left).
struct Layout { bool accidental; double x; };
Layout barLayout(int kind, int k);
double frameLength(int kind);
// Stereo: equal-power pan by where the bar sits along the frame (bass left): {left, right}.
std::array<double, 2> barPan(int kind, int k, double width = 0.55);

// The bar for key k with its undercut at `depth` × the tuned depth, cut to the length that keeps
// mode 1 on pitch: the key's equal-tempered pitch × ratio (the keyboard's tuning, forte/tuning.h).
struct Geometry { int kind, key; double L, b, h0, cf, A, D, depth; Cut cut; };
Geometry barGeometry(int kind, int k, double depth = 1, double ratio = 1);
// The tuning itself (tools/marimba-bars.mjs runs it for the table, marimba-bars.h): the cut's
// length, depth and the bar's length that put the modes at the kind's ratios. start: {A, D, L}.
struct Tuned { double L, A, D; std::array<double, 3> cents; int iterations; };
Tuned tuneBar(int kind, int k, std::array<double, 3> start);

// The cords: a dashpot r (N·s/m) at each, of half-width halfWidth (m), at mode 1's nodes.
struct Support { double r, halfWidth; };
inline constexpr Support SUPPORT = {0.25, 0.002};

// Everything about one bar that does not change while it rings. sigFixed: the cords' loss and the
// bar's own radiation; the wood's internal friction (the knob) adds πfη.
struct Mode {
  bool tors;
  int n;
  double f, ratio;
  bool sym;
  std::vector<double> w;
  double sigSup, sigRad, out;
};
struct BarModel {
  int kind, key;
  Geometry geom;
  std::vector<double> xs;
  std::vector<Mode> modes;
  std::vector<double> nodes;
  double mass, hmin;
};
BarModel barModel(int kind, int k, double depth = 1, double ratio = 1);
double interp(const std::vector<double> &xs, const std::vector<double> &ys, double x);
double interp(const double *ys, int nx, double L, double x);

// The tube's bore, graded along each compass: the marimba's from 90 mm (C2) to 40 mm (C7), the
// xylophone's from 52 mm (F4) to 30 mm (C8).
double tubeRadius(int kind, int k);
// The volume a bar mode (shape w at nx points along 0…L) pushes into a mouth of radius a whose
// centre sits `offset` × L from the bar's centre: S_b = ∫ w dA over the part of the bar above it.
double mouthVolume(const double *w, int nx, double L, double b, double a, double offset);

// The two-oscillator model of a bar mode and a tube mode, coupled through the air in the gap, for
// the tube's first two resonances (quarter and three-quarter wave). m = 0 or 1.
struct TubeState {
  double length, le, ma, mg, Rb;
  double Ka[2], R[2], ft[2]; // the tube's modes: stiffness, loss, frequency with the bar held still
};
// a: the bore; f1: the bar's mode 1, which the tube's first resonance is cut to (× 2^(detune/1200))
// with the bar in place at the gap g (m).
TubeState tubeState(double a, double b, double f1, double gap, double detune);
inline double gapInertance(double g, double Rb) { return (RHO_AIR * std::log(1 + Rb / g)) / (TAU * g); }
// The pair's mass matrix for a bar mode pushing Sb into the mouth: M11 = 1 + m_g S_b²,
// M12 = −m_g S_b, M22 = m_a + m_g; and its coupling coefficient κ = −M12/√(M11 M22).
struct TubePair { double M11, M12, M22, kappa; };
inline TubePair pairOf(const TubeState &ts, double Sb) {
  const double M11 = 1 + ts.mg * Sb * Sb, M12 = -ts.mg * Sb, M22 = ts.ma + ts.mg;
  return {M11, M12, M22, -M12 / std::sqrt(M11 * M22)};
}

// The mallet: F = K δ^p with a little hysteresis α, as the vibraphone's.
struct MalletLaw { double p, alpha; };
inline constexpr MalletLaw MALLET = {2.3, 3e-5};
struct Mallet { double m, K, p, alpha; };
inline Mallet malletOf(double hardness, double mass) { return {mass / 1000, hardness / std::pow(1e-3, MALLET.p), MALLET.p, MALLET.alpha}; }

// The voice data the engine plays (the page's noteData): modes, their shapes, losses, outputs.
struct VoiceData {
  int key, kind;
  double depth, ratio, L, b, a; // a: the tube's bore
  int nx, N, nb;
  std::vector<double> w; // N × nx
  std::vector<double> f, sigFixed, out;
  std::vector<uint8_t> tors;
  std::array<double, 2> pan;
};
VoiceData voiceData(int kind, int k, double depth = 1, double ratio = 1);
// A bar's voice data as plain numbers, to hand from a page's model to its engine (the page's
// noteData): packVoiceData writes it (returning how many) and unpackVoiceData reads it back
// (false if it doesn't fit). PACK_MAX bounds it.
constexpr int PACK_HEAD = 12;
constexpr int PACK_MAX = PACK_HEAD + 4 * 8 + 8 * 128;
int packVoiceData(const VoiceData &d, double *out);
bool unpackVoiceData(const double *in, int n, VoiceData &d);

} // namespace forte::marimba
