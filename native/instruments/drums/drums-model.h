// drums-model.h — the physics: a circular membrane under tension, loaded by the air on both sides,
// over a closed kettle (or shell), and for the tabla weighted at its centre by the syahi.
//
// Each azimuthal order m is solved on its own (Galerkin, in the bare membrane's modes
// J_m(j_mi r/a), i = 1 … NB). The head's mass is the skin's (with the syahi's load as a graded
// density); its stiffness the tension. The air adds to the mass matrix, frequency by frequency:
//   * above the head, the air of a half space (the head in a baffle), through the Hankel transform
//     of the modes: an added mass ρ ∫ φ̃_i φ̃_j k dk / √(k² − k₀²), whose part below k₀ is imaginary:
//     the sound the mode radiates;
//   * below it, the kettle's air, a rigid cylinder of the kettle's volume (radius a, depth d), in its
//     own acoustic modes J_m(β r) cos κ(z + d): each a mass −ρ cot(κd)/κ, which for a mode that
//     changes the air's volume (m = 0, β = 0) is a spring, ρc²/d.
// The eigenfrequencies are found by iterating ω in the frequency-dependent mass (a few passes), and
// each mode's decay from the imaginary part. Every key is a drum of its own: sized from the key
// (as a set of timpani, or tablas, are), its tension found so that its principal mode — (1,1) on
// timpani, (0,1) on tabla — sounds the note in the keyboard's tuning.
#pragma once

#include <array>

namespace forte::drums {

constexpr int NB = 8;          // the bare membrane's modes in each order's basis
constexpr int MORD = 10;       // azimuthal orders m = 0 … 9
constexpr int NPER = 4;        // modes kept per order (n = 1 … 4)
constexpr int MAXMODES = 40;   // modes a drum keeps, lowest first
constexpr int NQ = 16;         // the kettle's radial acoustic modes in each order
constexpr int NRS = 65;        // each mode's radial shape tabulated at ρ = 0, 1/64, … 1
constexpr int NKG = 601;       // the k·a grid of the Hankel transforms: 0 … 60
constexpr double KH = 0.1;
constexpr double RHO_AIR = 1.2, C_AIR = 343; // kg/m³, m/s at sea level and 20 °C

// The drums: the usual radius at a reference key (a set of drums sized along the keyboard, the
// radius halving every two octaves), the kettle's depth as a fraction of the radius (a cylinder of
// the kettle's volume), the syahi (its radius as a fraction of a, its excess density at the centre
// over the skin's, and how that falls to its edge: (1 − (r/K)²)^power), the principal mode, and its
// own head and beater. The dayan is tuned as players tune it, by its harmonics (the rim's Na): its
// (1,1), the second harmonic, an octave above the note.
struct Drum {
  const char *name;
  double radius, key, depth;
  double patchK, patchExcess, patchPower;
  int pm, pn;     // the principal mode (m, n), tuned to the key's note × pmult
  int pmult;
  int head, beater;
};
constexpr int NDRUMS = 3;
extern const std::array<Drum, NDRUMS> DRUMS;

// Heads: areal density (kg/m²), in-plane stiffness E·h/(1 − ν) (N/m), loss factor η.
struct Head { const char *name; double sigma, Eh, eta; };
extern const std::array<Head, 4> HEADS; // 0 is never used (the drum's own); 1 Mylar, 2 calfskin, 3 goatskin

// Beaters: mass (kg), contact law F = K·x^p (N, m), and the radius of the tip (m).
struct Beater { const char *name; double mass, K, p; };
extern const std::array<Beater, 5> BEATERS; // 0: the drum's own

// One mode of a key's drum: its order m and index n, frequency (Hz) and decay rate (1/s, the air's
// and the head's), its coefficients on the basis (mass-normalised: Σ q̇² / 2 is its kinetic energy
// in joules), its ∫|∇Φ|² dA (for the tension the head's stretch adds), and the far-field pressure
// it sends toward the listener per unit modal acceleration.
struct Mode {
  int m = 0, n = 0;
  double f = 0, sigma = 0, sigmaAir = 0;
  std::array<double, NB> c{};
  double grad = 0, far = 0;
  std::array<double, NRS> radial{}; // Φ(ρ) on the table's points
};

struct KeyDrum {
  int key = 0, drum = 0, count = 0, principal = 0;
  double a = 0, depth = 0, T = 0, sigma = 0, Eh = 0, eta = 0, rho = 0;
  double f0 = 0; // the note: the principal mode's frequency over pmult
  bool kettle = true;
  std::array<Mode, MAXMODES> mode{};
};

// The parameters (indexed as in drums-params.h) that shape a key's drum, so a change of any other
// (the stroke, the hands, the output) leaves the drums as they are.
bool shapesDrum(int param);

// The drum for a key and parameters, its principal mode on the key's note.
KeyDrum keyDrum(int key, const double *P);
// The drum with its tension given (no tuning), for the tests: the same solve.
KeyDrum drumAt(int drum, double a, double T, const double *P);
// A composite head (Ramakrishna and Sondhi's): density × ratio inside r < K·a, the skin outside, in
// the parameters' air and goatskin, its tension given: the tests' check against the literature.
KeyDrum compositeHead(double ratio, double K, double a, double T, const double *P);

// Mode n's radial shape Φ(ρ) at ρ = r/a (0 … 1), in the normalisation above (× cos mθ): exactly,
// and from its table (what the engine uses).
double shape(const KeyDrum &k, int n, double rho);
double shapeAt(const Mode &md, double rho);
// Bessel J_0 … J_M at x (Miller's backward recurrence), into out[0 … M].
void besselJ(int M, double x, double *out);
// The i-th zero (1-based) of J_m, and of J_m′ (for m = 0 the first is 0).
double besselZero(int m, int i);
double besselZeroPrime(int m, int i);
// The syahi's density over the skin's at ρ = r/a, for a drum and load factor.
double patchDensity(const Drum &d, double load, double rho);

// The in-vacuo ratios of a uniform membrane (j_mn / j_11), for the tests and the page.
double bareRatio(int m, int n);

} // namespace forte::drums
