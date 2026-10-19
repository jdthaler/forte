// steelpan-model.h — the physics of a steelpan: each key is a note area, a shallow dome of thin
// steel set into the pan's bowl, struck by a rubber-tipped stick. Its modes are a plate's (a
// length × width area, simply supported), the lowest three hammered by the tuner to the
// fundamental, the octave and the twelfth (or double octave); the dome's curvature couples
// them (quadratic terms: a 1 : 2 : 3 internal resonance), and the steel between notes couples a
// note's modes to its neighbours' (the fourths-and-fifths layout puts shared partials side by
// side). The skirt decides how much of each partial radiates.
#pragma once

#include <array>

namespace forte::steelpan {

constexpr int KEY_MIN = 21, KEY_MAX = 108, NKEYS = KEY_MAX - KEY_MIN + 1;
constexpr int KEY_LO = 33, KEY_HI = 90; // the steel band's compass, six bass to high tenor: A1–F♯6

constexpr int kTuned = 3;    // fundamental (1,1), octave (2,1), third partial (1,2)
constexpr int kModes = 12;   // the tuned three and up to nine more
constexpr double kAmp = 0.5; // the fundamental's displacement at velocity 1 for a unit mode shape, in thicknesses
constexpr double kRise = 0.05; // the quadratic coupling per thickness of dome rise: g = kRise·rise·ω₁²
constexpr double kHarden = 0.03; // the stretching (quartic) term, γ: a few cents sharper at fortissimo
constexpr double kWindow = 0.03; // modes of neighbouring notes closer than this (relative) are coupled
constexpr double kSound = 343;   // m/s
constexpr double kRim = 0.28;    // the drum's radius (m): a 55-gallon drum is 57 cm across

// Plate mode (i, j) — i half-waves along the note, j across — at (x, y) in [−1, 1]², peak 1.
double shape(int i, int j, double x, double y);
// Its frequency over mode (1, 1)'s for a simply supported area of length/width r.
double plateRatio(int i, int j, double r);
// Force spectrum magnitude of a half-sine pulse of length tau, relative to DC.
double pulseSpectrum(double f, double tau);
// The stick's contact time (s): tau0 at C4 and velocity 1, ∝ v^(−1/5) (Hertz) and ∝ f₁^(−1/2).
double contactTime(double tau0Ms, double f1, double velocity);
// The skirt of the band's pan for a key (m), times the parameter's scale.
double skirtLength(int key, double scale);
// The fraction of a partial at f that radiates past a skirt L long: the back of the note, in
// antiphase, reaches the listener by a path L + kRim longer and cancels the front until that path
// is comparable to the wavelength (|1 − e^(−ikd)|/2 to first order: kd/2, smoothed to 1).
double radiation(double f, double L);
// The tuner's miss for a key's tuned mode (1 or 2), in cents, within ±cents: fixed per key.
double tuningError(int key, int mode, double cents);
// The fundamental's T60 at a key, from the parameter (C4's): ∝ 1/√f.
double ringTime(int key, double t60C4);

struct Mode {
  double f, sigma; // Hz, 1/s
  double shape;    // the mode's shape where the stick lands
  double rad;      // radiation gain (the skirt)
  int i, j;        // its half-waves along and across
};
struct NoteModes { std::array<Mode, kModes> m; int count = 0; };
// A key's modes (the tuned three first, then the rest by frequency) for the parameters P (as
// in steelpan-params.h), up to fmax.
NoteModes noteModes(int key, const double *P, double fmax = 18000);
// Its modes' strike gains: displacement (in thicknesses) per unit velocity... times velocity.
double strikeGain(const Mode &m, double f1, double tau);

// The quadratic coupling g (per unit ω₁²) and the potential's forces on the tuned modes:
//   V = g (x₁²x₂ + x₁x₂x₃ + x₂²x₃) + (γω₁²/4)(Σ rₚ² xₚ²)²,   rₚ = ωₚ/ω₁
// (x in thicknesses). Writes −∂V/∂xₚ into F.
void tunedForces(const double *x, const double *w, double g, double *F);
double tunedPotential(const double *x, const double *w, double g);

struct Neighbour { int key; double weight; };
// The notes beside a key on the pan: in its own ring (an octave, laid out in fourths and fifths
// or chromatically), the same note in the rings inside and outside it, and their neighbours.
int neighbours(int key, int layout, Neighbour *out); // up to 8

} // namespace forte::steelpan
