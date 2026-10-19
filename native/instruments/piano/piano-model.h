// piano-model.h — the mechanics of a struck string, bar or ribbon, reduced to modes: the
// cross-sections, the scale design, the felt hammers, the per-key model (closed form for a
// uniform member, Rayleigh–Ritz in a sine basis for a tapered one) and the voice data the engine
// runs.
//
//   bending along principal axis i:  m(x) u_tt = T u_xx − (E I_i(x) u_xx)_xx
//   torsion:                         Θ(x) θ_tt = ((G J(x) + T I_p(x)/A(x)) θ_x)_x
//
// A key's model and voice data (keyModel, voiceData) allocate and take from microseconds (uniform)
// to tens of milliseconds (tapered: an eigen-solve per family): the plugins build them off the audio
// thread (forte/background.h), the page with its own WebAssembly model. Units: SI throughout.
#pragma once

#include <cstdint>
#include <numbers>
#include <vector>

#include "piano-params.h"

namespace forte::piano {

constexpr double PI = std::numbers::pi;
constexpr int KEY_LO = 21, KEY_HI = 108; // A0–C8
constexpr int NMAX_MODES = 140;          // at most this many partials per family (CPU)
constexpr double BRIDGE_G = 6e-4;        // s/kg, ~ piano soundboard mobility at the bridge
constexpr int MAX_N = 3 * (NMAX_MODES + 4) * 3; // the most modes a voice can have: 3 families × 3 unisons

struct Material { const char *name; double E, G, rho, strength; };
extern const Material MATERIALS[6]; // in the descriptor's order (material_::steel …)

// A section of core area A: its second moments, torsion constant, polar moment, half-width (where
// the bridge meets it), the hammer's lever for an off-centre strike, width and thickness.
struct Section { double A, I1, I2, J, Ip, half, lever, w, t; };
// `s`: the local planform scale (1 for a uniform member). A ribbon tapers in width only.
Section sectionProps(int shape, double A, double aspect = 1, double s = 1);

double keyFreq(double m);
double scaleLength(double m);
double scaleDiameter(double m);
double windingMass(double m);

struct Hammer { double mass, K, p, width; };
// The Ribbon Piano's felt hammers: Chaigne & Askenfelt's at C2 and C4, refitted in the treble.
Hammer pianoHammer(double m);

// One family of modes: ω, the hammer's weight φ(x_h)·window and the bridge force per unit
// amplitude; its shapes as mass-normalised sines (norm) or Ritz coefficients (nb × n, coef).
struct Family {
  int type = 0; // 0 bend1, 1 bend2, 2 torsion
  int n = 0;
  std::vector<double> omega, phiH, bridge;
  bool ritz = false;
  std::vector<double> norm; // sine shapes
  int nb = 0;
  std::vector<double> coef; // Ritz shapes: coef[n·nb + j]
  double B = 0;             // inharmonicity (bending)
};

struct Info {
  double f0, L, T;
  bool tuned;
  double stress, strengthRatio, mu, dMu, A;
  double B1, B2, f1, f1hard, f1torsion;
  int tuneAxis; // 1: I1, 2: I2
  double torsionRatio, cT, cTheta, xh, wH, beta;
  bool uniform;
  double taper;
  Hammer hammer;
};

struct KeyModel {
  int key = 0;
  double L = 0, T = 0, xh = 0, wH = 0;
  Section sec{};
  // what secAt(x) needs
  int shape = 0;
  double A0 = 0, aspect = 1, tau = 0;
  bool uniform = true;
  Family families[3];
  Info info{};
  int material = 0;
  bool ok = true; // false where an eigen-solve failed
  double prof(double x) const { return uniform ? 1 : 1 + tau * (1 - (2 * x) / L); }
  Section secAt(double x) const { return sectionProps(shape, A0, aspect, prof(x)); }
};

// The model of key m for the parameters P (indexed as p::) at sample rate fs.
KeyModel computeKeyModel(int m, const double *P, double fs = 48000);

// The arrays the engine runs: per mode its frequency, decay, hammer weight, bridge couplings
// (vertical, horizontal, torsion → sound), stretch weight g = ∫φ′² dx (a bending mode's share of
// the string's stretch, ∫u_x² = Σ g q², and its ω²'s rise per newton of tension; 0 for torsion),
// family, unison string and index in its family. And the string's tension T and stretch
// stiffness kc: tension modulation, ΔT = kc·∫u_x² (kc = EA/2L for a uniform core).
struct VoiceData {
  uint64_t version = 0;
  int key = 0, n = 0, unisons = 1;
  std::vector<double> freq, sigma, w, cv, ch, ct, g;
  std::vector<uint8_t> famId, uni;
  std::vector<uint16_t> idx;
  struct { double mass, K, p, alpha; } hammer{};
  double outV = 0, outH = 0;
  bool hasDamper = true;
  double T = 0, kc = 0;
};
VoiceData buildVoiceData(const KeyModel &model, const double *P, uint64_t version = 0);

// A key's voice data as numbers (what the page sends with a note to the WebAssembly engine):
// version, key, n, unisons, hammer mass, K, p, alpha, outV, outH, hasDamper, T, kc, then freq,
// sigma, w, cv, ch, ct, g, famId, uni, idx (n each).
constexpr int PACK_HEAD = 13, PACK_ARRAYS = 10;
int packVoiceData(const VoiceData &d, double *out);  // returns PACK_HEAD + PACK_ARRAYS n
bool unpackVoiceData(const double *in, int count, VoiceData &d);

// The voice data's version: the sample rate and the 'model' parameters (piano-instrument.js,
// modelVersion), as a whole number below 2⁵² (it travels as a double).
uint64_t modelVersion(const double *P, double fs);
bool isModelParam(int i);

} // namespace forte::piano
