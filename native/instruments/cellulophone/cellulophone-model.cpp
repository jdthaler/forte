// cellulophone-model.cpp — the Cellulophone's physics (cellulophone-model.h).

#include "cellulophone-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::cellulophone {

using fdlibm::cos;
using fdlibm::log;
using fdlibm::log2;
using fdlibm::pow;
using fdlibm::sin;

// The screens' recipes: the amplitude of each harmonic (sine phases), the patent's "harmonic
// screens", each drawn on its window at full contrast (opaque at the wave's lowest, clear at its highest).
const double RECIPES[SCREENS][SCREEN_HARMONICS] = {
  {1},                                                                            // sine: a pure tone
  {1, 0.3, 0.12, 0.06, 0.03},                                                     // flûte
  {1, 0, 0.55, 0, 0.35, 0, 0.22, 0, 0.14, 0, 0.09, 0, 0.05},                      // clarinette: odd harmonics
  {0.45, 0.8, 1, 0.7, 0.55, 0.45, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05, 0.03},        // hautbois
  {1, 0.85, 0.7, 0.6, 0.5, 0.42, 0.34, 0.27, 0.2, 0.15, 0.11, 0.08, 0.06, 0.04},  // trompe de chasse
  {1, 1. / 2, 1. / 3, 1. / 4, 1. / 5, 1. / 6, 1. / 7, 1. / 8, 1. / 9, 1. / 10, 1. / 11, 1. / 12, 1. / 13, 1. / 14, 1. / 15, 1. / 16}, // violon: every harmonic, 1/n
  {0.5, 0.45, 0.55, 0.9, 1, 0.55, 0.3, 0.25, 0.35, 0.4, 0.2, 0.1, 0.06},         // voix humaine: two formants
};
const int OCTAVE_SCREEN[OCTAVES] = {violin, violin, horn, voix, oboe, clarinet, flute, sine, sine};

int ringSlots(int pc, int c0, const double *ratio) { return std::max(1, (int)std::lround(c0 * ratio[pc])); }

Note keyNote(int key, int c0, const double *keyTarget) {
  double ratio[RINGS];
  for (int pc = 0; pc < RINGS; pc++) ratio[pc] = keyTarget[60 + pc] / keyTarget[60];
  Note n;
  n.pc = ((key % 12) + 12) % 12;
  n.octave = octaveOf(key);
  n.slots = ringSlots(n.pc, c0, ratio);
  const double turns4 = keyTarget[69] / ringSlots(9, c0, ratio); // the motor's speed: A4 on its target
  n.turns = turns4 * pow(2.0, n.octave - 4);
  n.f = n.slots * n.turns;
  n.ideal = keyTarget[key];
  n.cents = 1200 * log2(n.f / n.ideal);
  return n;
}

// Schroeder's phases (1970) for the recipe's harmonics: φ_n = −2π Σ_{l<n} (n − l) p_l, p_l each
// harmonic's share of the power. They spread the harmonics' peaks apart, so the drawing reaches
// full contrast with the most of every harmonic in it.
static void phases(const double *a, double *phi) {
  double total = 0;
  for (int n = 0; n < SCREEN_HARMONICS; n++) total += a[n] * a[n];
  for (int n = 1; n <= SCREEN_HARMONICS; n++) {
    double s = 0;
    for (int l = 1; l < n; l++) s += (n - l) * a[l - 1] * a[l - 1] / total;
    phi[n - 1] = -TAU * s;
  }
}

// The drawing, T = (w − lo)/(hi − lo) for w = Σ a_n sin(2πnx + φ_n), on a grid; returns hi − lo and
// the place of T's clearest point.
static constexpr int GRID = 4096;
static double drawing(int screen, double *w, int &top) {
  const double *a = RECIPES[std::clamp(screen, 0, SCREENS - 1)];
  double phi[SCREEN_HARMONICS];
  phases(a, phi);
  double lo = 1e9, hi = -1e9;
  top = 0;
  for (int i = 0; i < GRID; i++) {
    double v = 0;
    for (int n = 1; n <= SCREEN_HARMONICS; n++) if (a[n - 1] != 0) v += a[n - 1] * sin(TAU * n * i / GRID + phi[n - 1]);
    w[i] = v;
    if (v < lo) lo = v;
    if (v > hi) { hi = v; top = i; }
  }
  for (int i = 0; i < GRID; i++) w[i] = (w[i] - lo) / (hi - lo);
  return hi - lo;
}

Spectrum screenSpectrum(int screen, bool withSlit) {
  static double w[GRID];
  const double *a = RECIPES[std::clamp(screen, 0, SCREENS - 1)];
  double phi[SCREEN_HARMONICS];
  phases(a, phi);
  int top = 0;
  const double R = drawing(screen, w, top);
  // the window's height: each screen's window is as much taller as its wave is weaker than the
  // sine's (the voicer's job), so the stops sound alike; the drawing's harmonics are a_n/R
  double power = 0;
  for (int n = 0; n < SCREEN_HARMONICS; n++) power += a[n] * a[n] / (R * R);
  const double height = 0.5 / std::sqrt(power); // the sine's drawing: one harmonic of amplitude 1/2
  Spectrum s;
  if (!withSlit) { // the drawing's own coefficients: sin(θ + φ) = Re((sin φ − i cos φ) e^{iθ})
    double lo = 0;
    for (int i = 0; i < GRID; i++) lo += w[i];
    s.re[0] = height * lo / GRID;
    for (int n = 1; n <= SCREEN_HARMONICS; n++) { s.re[n] = height * a[n - 1] * sin(phi[n - 1]) / R; s.im[n] = -height * a[n - 1] * cos(phi[n - 1]) / R; }
    return s;
  }
  // stacked with the slit centred on the screen's clearest point: the product, by its exact DFT
  // (no harmonic past the recipe's 16 plus the slit's 8, so nothing aliases)
  for (int i = 0; i < GRID; i++) {
    const double x = (double)(i - top) / GRID;
    w[i] *= pow((1 + cos(TAU * x)) / 2, SLIT_POWER);
  }
  for (int n = 0; n <= H_MAX; n++) {
    double re = 0, im = 0;
    for (int i = 0; i < GRID; i++) { const double th = TAU * n * i / GRID; re += w[i] * cos(th); im -= w[i] * sin(th); }
    const double k = height * (n ? 2.0 : 1.0) / GRID;
    s.re[n] = re * k; s.im[n] = im * k;
  }
  return s;
}

double slotGain(int n, double a) {
  if (n == 0) return a;
  const double u = std::numbers::pi * n * a;
  return a * sin(u) / u;
}

double light(int screen, double p, double a, double x) {
  const Spectrum A = screenSpectrum(screen, false), B = screenSpectrum(screen, true);
  double v = 0;
  for (int n = 0; n <= H_MAX; n++) {
    const double re = (1 - p) * A.re[n] + p * B.re[n], im = (1 - p) * A.im[n] + p * B.im[n];
    v += slotGain(n, a) * (re * cos(TAU * n * x) - im * sin(TAU * n * x));
  }
  return v;
}

double flicker(int mainsHz) { return mainsHz <= 0 ? 0 : 0.05 * 50.0 / mainsHz; }

static uint64_t mix(uint64_t z) {
  z += 0x9e3779b97f4a7c15ull;
  z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ull;
  z = (z ^ (z >> 27)) * 0x94d049bb133111ebull;
  return z ^ (z >> 31);
}
static double uniform(uint64_t z) { return ((double)(mix(z) >> 11) + 0.5) / 9007199254740992.0; }

double slotNoise(int octave, int ring, int slot, int which) {
  const uint64_t k = ((uint64_t)octave << 48) ^ ((uint64_t)ring << 40) ^ ((uint64_t)slot << 8) ^ (uint64_t)(which & 1);
  const double u1 = uniform(2 * k), u2 = uniform(2 * k + 1);
  return std::sqrt(-2 * log(u1)) * cos(TAU * u2); // Box–Muller
}

double ringPhase(int octave, int ring) { return uniform(((uint64_t)octave << 32) ^ ((uint64_t)ring << 4) ^ 0xd15cull); }

} // namespace forte::cellulophone
