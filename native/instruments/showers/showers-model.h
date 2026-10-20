// showers-model.h — the physics: particle showers in the crystals of a collider's calorimeter,
// heard through the sound they make. Every key is a lead tungstate crystal (as in CMS's
// electromagnetic calorimeter) cut so that its first longitudinal mode is the note. A particle
// showers along it; the energy the shower leaves heats the crystal at once, and the heat's thermal
// expansion (the thermo-acoustic effect) rings the crystal's modes: its stretching modes, a
// harmonic series, by how the heat lies along it, and its bending modes by how far off the axis
// it lies. The shower spreads sideways too, into the neighbouring crystals (the keys a semitone
// either side).
#pragma once

#include <array>
#include <cstdint>

namespace forte::showers {

// Lead tungstate, PbWO4 (PDG, Atomic and Nuclear Properties: "lead tungstate").
constexpr double EC_MEV = 9.64;         // critical energy for electrons
constexpr double LAMBDA_PI = 26.97;     // the pion interaction length in X0 (199.3 / 7.39 g cm⁻²)
constexpr double LAMBDA_I = 22.77;      // the nuclear interaction length in X0 (168.3 / 7.39 g cm⁻²)
constexpr double MIP_MEV = 8.99;        // a minimum-ionising particle's loss per X0 (10.1 MeV/cm × 0.89 cm)
constexpr double POISSON = 0.3;         // Poisson's ratio (assumed: PbWO4's is not well measured)
// The longitudinal profile of an electromagnetic shower (PDG, Passage of particles, eq. 34.35–36)
constexpr double B_EM = 0.5;            // b
constexpr double C_E = -0.5, C_G = 0.5; // t_max = ln(E/Ec) + C, electrons and photons
constexpr double BH = 9.0 / 7.0;        // a photon's mean free path for pair production, in X0
// The transverse profile: f(r) = 2 r R² / (r² + R²)², with R = R_M/3, which keeps 90 % of the
// energy within one Molière radius and 99 % within 3.5 (PDG)
constexpr double R_LAT = 1.0 / 3.0;
// Hadron showers: the electromagnetic fraction ⟨f_em⟩ = 1 − (E/E0)^(m−1) (Groom 2007), the
// hadronic part's profile in interaction lengths from the first interaction (Bock et al. 1981,
// with Hughes's parameters: a = 0.786 + 0.427 ln E, d = 0.978), and its invisible share
// (nuclear binding, 20–40 %: PDG)
constexpr double FEM_E0 = 1.0, FEM_M = 0.83;
constexpr double HAD_A0 = 0.786, HAD_A1 = 0.427, HAD_D = 0.978;
constexpr double INVISIBLE = 0.3;
constexpr double FEM_SPREAD = 0.12;     // the spread of f_em from shower to shower (our choice)
constexpr double TRIGGER = 0.2;         // the share a pion must leave in the crystal for the trigger to keep it

constexpr int NZ = 256;                 // the deposit, at the midpoints of NZ slices along the crystal
constexpr int MAX_LONG = 32, MAX_FLEX = 8, MAX_MODES = MAX_LONG + MAX_FLEX;
// The free–free beam's roots, cos βL cosh βL = 1
constexpr std::array<double, MAX_FLEX> BETA_L = {4.730040744862704, 7.853204624095838, 10.995607838001671, 14.137165491257464,
                                                 17.278759657399480, 20.420352245626059, 23.561944902040455, 26.703537555508188};

enum Particle : int { electron, photon, pion };

// The particle's energy left along the crystal: q[i] in the slice around ζ = (i + ½)/NZ of the
// crystal's length, per unit ζ, as a share of the particle's energy (so Σ q / NZ is the share the
// crystal holds; the rest leaked out of the back, went sideways, or was invisible).
struct Deposit {
  std::array<double, NZ> q{};
  double start = 0;    // X0: where the shower began (a photon's conversion, a pion's first interaction)
  double total() const;
};

// A small fast random generator (Mulberry32), so a sequence of notes is the same every time.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed) {}
  double uniform(); // [0, 1)
  double exponential(double mean) ;
  double gamma(double shape); // Marsaglia–Tsang
  double beta(double mean, double sd);
};

// The mean electromagnetic profile, dE/dt per X0 at depth t from the shower's start (PDG eq. 34.35).
double emProfile(double t, double tmax);
// Its t_max for a shower of E GeV (C = C_E or C_G), never below the face.
double emTmax(double E, double C);
// The share of a gamma profile (shape a, rate b) between 0 and t: the regularised incomplete gamma.
double gammaShare(double a, double b, double t);
// ⟨f_em⟩ for a pion of E GeV.
double meanFem(double E);
// Add a profile to the deposit: `share` of the particle's energy, as a gamma (shape a, rate b per
// X0) from depth t0 X0, in a crystal T X0 deep. A minimum-ionising track from t0 to t1 too.
void addGamma(Deposit &d, double share, double a, double b, double t0, double T);
void addTrack(Deposit &d, double share, double t0, double t1, double T);
// One particle of E GeV in a crystal T X0 deep: the mean profile for electrons, a random one
// otherwise.
void shower(Deposit &d, Particle kind, double E, double T, Rng &rng);
// One pion, whatever it leaves (shower() asks the trigger).
void pionShower(Deposit &d, double E, double T, Rng &rng);

// The transverse profile's share in a crystal: the shower centred x0 crystal widths from the struck
// crystal's axis, toward the next key up; crystals `width` Molière radii square in a row. Crystal j
// (0 the struck one, ±1, ±2 its neighbours): its share of the energy, and how far the heat's
// centroid lies from its own axis, in crystal widths.
struct Share { double e, xbar; };
Share crystalShare(double x0, double width, int j);
// The radial containment, the share within r Molière radii.
inline double radialContainment(double r) { return (r * r) / (r * r + R_LAT * R_LAT); }

// The free–free beam's mode m (0-based) at ζ in [0, 1], ∫φ² = 1, and its curvature φ'' (in ζ).
double flexShape(int m, double z);
double flexCurvature(int m, double z);

// A key's crystal: its modes' frequencies and how the sensor hears each.
struct Mode {
  bool flex;      // a bending mode (else stretching)
  int n;          // the stretching mode's half-waves (1…), or the bending mode's number (1…)
  double f;       // Hz
  double sigma;   // amplitude decay rate, 1/s, at the crystal's Q (the damper adds π f/Q_damper)
  double hear;    // the sensor's reading per unit of the mode's amplitude
};
struct Crystal {
  int count = 0, nl = 0, nf = 0;
  double f1 = 0, slender = 0; // the note (Hz), and length over width
  std::array<Mode, MAX_MODES> modes;
};
// The key's crystal under the parameters P (indexed as in showers-params.h): its first stretching
// mode at the key's equal-tempered pitch times the keyboard's tuning; modes up to fmax.
Crystal crystalOf(int key, const double *P, double fmax);
// Length over width: the depth in X0 over the width in R_M, through lead tungstate's X0/R_M.
double slenderness(double depth, double width);
// The stretching mode n's frequency over the first's (Love's rod: lateral inertia lowers it).
double longRatio(int n, double slender);
// How many stretching modes Love's theory holds for: those whose wavenumber times the section's
// polar radius of gyration (w/√6) is at most 1, the wavelength longer than the crystal is wide.
int loveModes(double slender);
// The bending mode m's (0-based) over the first stretching mode's (Euler–Bernoulli).
double flexRatio(int m, double slender);

// What a deposit gives each mode: the stretching modes' amplitudes a_n (the displacement over the
// length), from the heat's thermal strain along the crystal; the bending modes' b_m (over the
// length) per unit of centroid offset (crystal widths), from its thermal curvature.
struct Kicks { std::array<double, MAX_LONG> a{}; std::array<double, MAX_FLEX> b{}; };
Kicks kicksOf(const Deposit &d, double slender);

} // namespace forte::showers
