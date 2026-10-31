// steelpan-model.h — the physics of a steelpan: each key is a note area, a shallow dome of thin
// steel set into the pan's bowl, struck by a rubber-tipped stick. Its modes are a plate's (a
// length × width area, simply supported), the lowest three hammered by the tuner to the
// fundamental, the octave and the twelfth (or double octave); the dome's curvature couples
// every mode to the pairs whose sum tone it is (quadratic terms: a ladder of internal resonances,
// 1 + 1 → 2, 1 + 2 → 3, 2 + 2 → 4, ..., up which a hard stroke climbs), and the steel between notes couples a
// note's modes to its neighbours' (the fourths-and-fifths layout puts shared partials side by
// side). The skirt decides how much of each partial radiates.
#pragma once

#include <array>

namespace forte::steelpan {

constexpr int KEY_MIN = 21, KEY_MAX = 108, NKEYS = KEY_MAX - KEY_MIN + 1;
constexpr int KEY_LO = 33, KEY_HI = 90; // the steel band's compass, six bass to high tenor: A1–F♯6

constexpr int kTuned = 3;    // fundamental (1,1), octave (2,1), third partial (1,2)
constexpr int kModes = 12;   // the tuned three and up to nine more
constexpr double kAmp = 1.2; // the fundamental's displacement at velocity 1 for a unit mode shape, in thicknesses (forte: 1.3)
constexpr double kRise = 0.05; // the quadratic coupling per thickness of dome rise: g = kRise·rise·ω₁²
constexpr double kHarden = 0.015; // the stretching (quartic) term, γ: a full stroke starts ~15 cents sharp
constexpr double kWindow = 0.03; // modes (of neighbours, or a note's own combination tones) closer than this (relative) are coupled
constexpr double kSound = 343;   // m/s
constexpr double kRim = 0.28;    // the drum's radius (m): a 55-gallon drum is 57 cm across
constexpr double kWall = 1.2e-3; // the drum's wall (m): 18-gauge steel, the pan makers' choice
constexpr double kSteelE = 200e9, kSteelRho = 7850, kSteelNu = 0.3; // Pa, kg/m³, Poisson's ratio
constexpr int kRingOrders = 40;  // the skirt's ring modes n = 2 … 41 (to about 6 kHz), each a cos/sin pair
constexpr double kRingLoss = 0.002; // their damping ratio ζ (steel, the bowl's joint)

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

// The dome's quadratic couplings among a note's modes: one term c·xᵢxⱼxₖ of the potential for
// every pair of modes (i ≤ j) whose combination tone fᵢ + fⱼ falls within kWindow of a mode k,
// which it then drives at resonance. On a tuned note that is a ladder: 1 + 1 → 2, 1 + 2 → 3,
// 2 + 2 → 4 (the plate's pair there), 2 + 4 and 3 + 3 → 6, ..., so a hard stroke's energy climbs
// it. c (per unit g·ω₁²) is the stretching the pair does: it grows with the modes' slopes, as
// √(rᵢrⱼ) + √(rⱼrₖ) + √(rᵢrₖ) on a plate (rₚ = fₚ/f₁), normalised to 1 for 1 + 1 → 2.
struct Triple { int i, j, k; double c; };
constexpr int kTriples = 48; // the most a note has is about 31
// A note's triples among its first n modes, sorted by their highest mode (so the ones a note
// ringing only its tuned three needs come first): their number.
int noteTriples(const NoteModes &nm, Triple *out);
// The forces of the dome's potential on the modes below n,
//   V = g Σ c xᵢxⱼxₖ + (γω₁²/4)(Σ rₚ² xₚ²)²,   rₚ = ωₚ/ω₁
// (x in thicknesses, g in s⁻²): adds −∂V/∂xₚ into F. Only the triples whose modes are all below n
// may be given.
void domeForces(const Triple *t, int nt, int n, const double *x, const double *w, double g, double *F);
double domePotential(const Triple *t, int nt, int n, const double *x, const double *w, double g);

// The skirt's n-th ring mode (Hz): the inextensional bending of a thin steel ring of the drum's
// radius and wall, n waves round it (Rayleigh; Soedel, Vibrations of Shells and Plates, 2004):
//   f_n = (h / 2πR²) √(E / 12ρ(1 − ν²)) · n(n² − 1) / √(n² + 1).
double ringFreq(int n);
// Where a key's note sits round the drum (rad): its place in its ring, by fifths or by semitones.
double noteAzimuth(int key, int layout);

struct Neighbour { int key; double weight; };
// The notes beside a key on the pan: in its own ring (an octave, laid out in fourths and fifths
// or chromatically), the same note in the rings inside and outside it, and their neighbours.
int neighbours(int key, int layout, Neighbour *out); // up to 8

} // namespace forte::steelpan
