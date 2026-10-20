// tines-model.h — the mechanics of a Rhodes-style tine piano key, reduced to modes.
//
// Each key is an asymmetric tuning fork: a steel cantilever (the tine, by finite elements, with
// the tuning spring as a point mass) and a brass tone bar (one mode), both clamped to a block on a
// rubber grommet. u = block displacement, q_n = tine modes relative to the block, p = tone-bar mode:
//
//   T = ½ M_tot u̇² + u̇ (Σ Γ_n q̇_n + Γ_b ṗ) + ½ Σ q̇_n² + ½ ṗ²
//   V = ½ K₀ u² + ½ Σ ω_n² q_n² + ½ ω_b² p²
//
// The pickup sees only the tine tip: Φ(Y) = (1 + (Y/w)²)^(-3/2), output ∝ −dΦ/dt.
//
// A key's model (computeKey) allocates and takes a fraction of a millisecond (two small eigen-
// solves): the plugins build it off the audio thread (forte/background.h), the page with its own
// WebAssembly model. Units: SI throughout.
#pragma once

#include <array>
#include <cstdint>
#include <numbers>
#include <string>
#include <vector>

#include "tines-params.h"

namespace forte::tines {

constexpr double PI = std::numbers::pi;
constexpr int KEY_LO = 28, KEY_HI = 100; // the Mark I's 73 keys, E1–E7, which the register grading is drawn on
constexpr int KEY_MIN = 21, KEY_MAX = 108; // what it plays: the 88-key Mark I and II's A0–C8
constexpr int MAX_TINE_MODES = 6;
constexpr int MAX_MODES = MAX_TINE_MODES + 2; // a voice's modes: the tine's, the block and the bar
struct Steel { double E, rho; };
inline constexpr Steel STEEL = {2.0e11, 7850};

double keyFreq(int m);
std::string noteName(int m);

// Clamped–free Euler–Bernoulli beam with a point mass ms at s, by nel Hermite elements: its first
// nModes ω, participation factors Γ = ∫ m φ dx, and mode shapes (tip displacement positive).
struct Cantilever {
  double L = 0, d = 0, mu = 0, EI = 0, mt = 0, ms = 0, s = 0;
  int nel = 0, N = 0, nModes = 0;
  std::vector<double> omega, Gamma;
  std::vector<double> X; // N × nModes: the free degrees of freedom of each mode
  double shape(int n, double x) const;
};
Cantilever cantilever(double L, double d, double ms, double s, int nel = 24, int nModes = 6);

// Pickup for key m: gap (axial, closer in the treble), the flux bump's width w² = g² + r², the
// tine's rest yoff above the pole axis, and the register voicing.
struct Pickup { double gap, wid, yoff, gain; };
Pickup pickupFor(int m, const double *P);

// Hammer tips: neoprene, graded softer in the bass (Hertz-like F = K δ^p).
struct HammerTip { double mass, K, p; };
HammerTip hammerDefaults(int m);

// A coupled mode of the key: its column in the eigenvectors, frequency, decay, weight at the
// hammer, at the tip, at the damper (relative to tine mode 1's), and a rough energy split.
struct Mode { int col; double f, sigma, w, pk, dampW, tineFrac, barFrac, blockFrac; };

struct Info {
  int key;
  double f0, L, d, mt, ms, s, xh;
  std::vector<double> tineRatios;
  double f1tine, Mb, M0, fBar, gap, wid;
};

struct Hammer { double mass, K, p, alpha; };

// The voice data the engine plays (the page's noteData): fixed size, so a key's data never
// allocates. version: the 'model' parameters' values and the sample rate (modelVersion).
struct VoiceData {
  uint64_t version = 0;
  int key = 0, n = 0;
  std::array<double, MAX_MODES> freq{}, sigma{}, dampW{}, w{}, pk{};
  Hammer hammer{};
  Pickup pickup{};
  bool hasDamper = true;
};

struct KeyModel {
  bool ok = false;
  int key = 0;
  Info info{};
  Cantilever tine;
  int nq = 0;
  std::vector<Mode> modes; // the audible ones
  double xh = 0;
  // the coupled modes' shapes (n × n, row-major), for the slow-motion view
  std::vector<double> X;
  int n = 0, iu = 0, ip = 0;
  VoiceData voice;
};
KeyModel computeKey(int m, const double *P, double fs = 48000);

// The 'model' parameters (kind: 'model') and the tuning's: a key's modes depend on them and the
// sample rate only.
bool isModelParam(int i);
// Their values and fs as one number below 2⁵² (it travels as a double), never 0.
uint64_t modelVersion(const double *P, double fs);

// A key's voice data as plain numbers, to hand from a page's model to its engine:
// version, key, n, the hammer's mass, K, p, alpha, the pickup's gap, wid, yoff, gain, hasDamper,
// then freq, sigma, dampW, w, pk (n each).
constexpr int PACK_HEAD = 13;
constexpr int PACK_MAX = PACK_HEAD + 5 * MAX_MODES;
int packVoiceData(const VoiceData &d, double *out);
bool unpackVoiceData(const double *in, int n, VoiceData &d);

// Normalised flux, for plots.
double flux(double Y, double w);

} // namespace forte::tines
