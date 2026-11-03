// pulsars-model.h — the physics: a spinning neutron star's radio beam, swept past the Earth once a
// turn, and what the interstellar plasma does to its pulses on the way. Every key is a pulsar that
// spins at the note: the radio telescope's total power, pulse after pulse, played as sound (as
// radio astronomers have listened to pulsars since 1967).
//
// The beam (the rotating vector model, Radhakrishnan & Cooke 1969): the magnetic axis is tilted by
// α from the spin axis and the line of sight by ζ = α + β, so a turn's phase φ puts the sightline
// at an angle Θ from the magnetic axis, cos Θ = cos α cos ζ + sin α sin ζ cos φ. The radio comes
// from the open field lines, at a height r above the star, in a cone as wide as the last open line
// there (a dipole: sin²θ = r / R_LC, the light cylinder R_LC = c / 2πf, and the field's direction
// ρ = θ + atan(½ tan θ)), with a core along the axis and a hollow cone near its edge (Rankin 1983).
// The other pole's beam is the same, half a turn on: an interpulse when α is near 90°.
//
// The way here (cold plasma, as the Whistlers' but far above the plasma frequency): a pulse at
// f MHz arrives K_DM · DM / f² later than at infinite frequency, DM the electrons along the path
// (pc cm⁻³); multipath scattering in the turbulent plasma gives each pulse a one-sided exponential
// tail, τ_s from Bhat et al. (2004)'s fit to 371 measurements. The telescope sums a band of
// frequencies: undedispersed, each pulse is smeared over the band's spread of delays; a
// filterbank takes each channel's delay out, leaving the spread inside a channel; coherent
// dedispersion undoes the plasma's phase exactly. Scattering stays either way.
#pragma once

#include <complex>
#include <cstdint>
#include <vector>

#include "forte/fft.h"

namespace forte::pulsars {

constexpr double K_DM = 4.148808e3;     // s MHz² cm³ pc⁻¹: the dispersion delay is K_DM DM / f² (Lorimer & Kramer 2005, eq. 4.7)
constexpr double C_KM = 299792.458;     // km/s
constexpr double LC_SHARE = 0.3;        // the emission is at most this far out to the light cylinder
// The beam across its radius x = Θ / ρ: a Gaussian core on the axis and a ring near the edge.
// Rankin's core is 2.45° P^−½ wide (half power; 1990) where her outer cone is 5.75° P^−½ in
// radius, so the core's σ is 0.18 of the cone's radius.
constexpr double CORE_W = 0.18, CONE_AT = 0.9, CONE_W = 0.1;
// Bhat et al. 2004 (ApJ 605, 759, eq. 11): log τ_s(ms) = −6.46 + 0.154 log DM + 1.07 (log DM)² − 3.86 log f(GHz)
constexpr double BHAT_A = -6.46, BHAT_B = 0.154, BHAT_C = 1.07, BHAT_X = -3.86;
constexpr double RIM_KM = 12;           // the star's radius (km): where the light cylinder would be at the surface
constexpr double M_SUN = 1.4;           // its mass, for the break-up spin (Lattimer & Prakash 2004)
constexpr double FASTEST = 716.36;      // Hz: PSR J1748−2446ad, the fastest known (Hessels et al. 2006)
constexpr int NTAB = 4096;              // a turn's table, at High Quality
constexpr int SUBBANDS = 2;             // the band's upper half (left) and lower half (right)

double lightCylinder(double f);         // km, for spin f Hz
double breakUp();                       // Hz: the fastest a 1.4 M☉, 12 km star can spin, 1045 (M/M☉)^½ (R/10 km)^−3/2
// The beam's radius ρ (rad) for emission r km up, light cylinder rlc km (r capped at LC_SHARE of it).
double beamRadius(double r, double rlc);
double beam(double x, double core);     // the beam's brightness at x = Θ/ρ (core share `core`)
double dmDelay(double dm, double fMHz); // s, relative to infinite frequency
double scatterTime(double dm, double fMHz, double scale); // s: the scattering tail's e-folding time
// The delay across f1 → f2 MHz, (8.3 µs DM Δf f⁻³ for a narrow channel).
double smearAcross(double dm, double f1, double f2);

enum Dedisp : int { kNone = 0, kFilterbank = 1, kCoherent = 2 };

// What sets a pulsar's tables: its spin, geometry, its way here and the telescope.
struct Setup {
  double f = 0;          // Hz: the spin (the note)
  double alpha = 0;      // rad: the magnetic axis's tilt from the spin axis
  double q = 0;          // the sightline's closest approach to the magnetic axis, β/ρ
  double height = 0;     // km: where the radio comes from
  double core = 0;       // the core's share of the beam
  double dm = 0, scatter = 1;
  double fc = 1400, bw = 0.2; // MHz, and the band as a share of fc
  int dedisp = kFilterbank, channels = 256;
  bool operator==(const Setup &) const = default;
};
// The setup from the parameters (indexed as in pulsars-params.h) for a key, the DM given (a note's
// own, under MPE).
Setup setupOf(int key, const double *P, double dm);

struct Geometry {
  double f, alpha, zeta, beta, rho, rlc, rem;
};
Geometry geometryOf(const Setup &s);
// The beam's brightness along the sightline at phase φ (rad, 0 the main pulse), both poles.
double intensity(const Geometry &g, double core, double phi);

struct Band { double lo, hi; };         // MHz
Band bandOf(const Setup &s);            // the whole band
Band subBand(const Setup &s, int b);    // 0 its upper half, 1 its lower
// The harmonic response at ω (rad/s) of sub-band b, as the telescope's dedispersion leaves it:
// the band's spread of delays, its scattering, its channels. `pieces` sets the undedispersed
// band's sum (more for a wider spread of delays).
std::complex<double> transfer(const Setup &s, int b, double w, int pieces);
// The delay spread that is left in sub-band b (s): the whole spread undedispersed, a channel's
// with a filterbank, none coherently.
double smearLeft(const Setup &s, int b);
// The share of sub-band b whose first pulse has arrived t s after the pulsar switches on (the top
// of the band first, when nothing takes the delays out; all at once otherwise).
double arrived(const Setup &s, int b, double t);

// A pulsar's tables, one turn: each sub-band's total power, its mean taken off (dc is the mean),
// scaled so that a cut through the beam's middle has an rms of 1.
struct Tables {
  int n = 0;
  float *L = nullptr, *R = nullptr; // n + 1 samples each (the last the first again)
  double dcL = 0, dcR = 0;
  int harmonics = 0;                // how many it holds
  double smear = 0;                 // s: the smear and tail a pulse leaves (for the jitter's averaging)
  double peak = 0;                  // the beam's own peak along the sightline, on the same scale
};

// The working space for building tables (allocated once).
class Builder {
 public:
  explicit Builder(int n);
  int size() const { return n; }
  // Into t (whose L and R hold n + 1 floats): harmonics up to topHz.
  void build(const Setup &s, Tables &t, double topHz, int pieces);
  // The intrinsic profile (no medium), its peak 1, at m phases from −½ to ½ turn.
  void profile(const Setup &s, double *out, int m);
  // One narrow channel at fMHz, w MHz wide, as the dedispersion leaves it (its delay mod the turn),
  // at m phases from −½ to ½ turn, on the intrinsic profile's scale.
  void channel(const Setup &s, double fMHz, double w, double *out, int m);

 private:
  void intrinsic(const Setup &s, const Geometry &g);
  int n;
  FFT fft;
  std::vector<std::complex<double>> c, z;
  double norm = 1, peakI = 0;
};

// A small fast random generator (Mulberry32), so a sequence of notes is the same every time.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed) {}
  double uniform(); // [0, 1)
  double gauss();
};

} // namespace forte::pulsars
