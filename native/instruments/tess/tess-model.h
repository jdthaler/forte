// tess-model.h — the physics: a planet crossing its star, as NASA's Transiting Exoplanet Survey
// Satellite (TESS) records it. Every key is a planet on a circular orbit whose year, sped up by
// one factor for the whole keyboard, is the key's note. Once an orbit it passes in front of its
// limb-darkened star and blocks some of its light; the star's light, the light curve, is the sound.
// TESS counts the photons, so the light carries their shot noise, the cameras' read noise and the
// zodiacal light's, over a floor for everything else.
#pragma once

#include <cstdint>
#include <vector>

namespace forte::tess {

// IAU 2015 nominal values (Resolution B3)
constexpr double GM_SUN = 1.3271244e20;     // m³/s²
constexpr double R_SUN = 6.957e8;           // m
constexpr double R_EARTH = 6.3781e6;        // m, equatorial
constexpr double DAY = 86400;               // s
// TESS's photometry (Sullivan et al. 2015, ApJ 809, 77)
constexpr double ZERO_POINT = 1.514e6;      // photons s⁻¹ cm⁻² from a T = 0 star, in TESS's band
constexpr double AREA = 69;                 // cm²: one camera's effective collecting area
constexpr double EXPOSURE = 2;              // s: each frame
constexpr double READ_NOISE = 10;           // e⁻ rms per pixel per frame
constexpr double ZODIACAL = 180;            // e⁻ per pixel per frame (95 to 270, by ecliptic latitude)
constexpr double APERTURE = 9;              // pixels summed for a star (3 × 3; a simplification)
constexpr double NOISE_FLOOR = 60e-6;       // the systematic floor, 60 ppm in an hour
constexpr double SPEEDUP_REF = 440;         // the speed-up is the A4 planet's year × 440 Hz

// Quadratic limb darkening, I(μ) / I(1) = 1 − u1 (1 − μ) − u2 (1 − μ)², μ = cos of the angle from
// the disc's centre: Claret (2017)'s coefficients for TESS's band (PHOENIX models, r method), as
// Patel & Espinoza (2022) tabulate them for four hosts, interpolated in temperature.
struct LimbDarkening { double u1 = 0, u2 = 0; };
LimbDarkening limbDarkening(double teff);
// The intensity at r (in stellar radii) from the disc's centre, relative to the centre's.
double intensity(double r, LimbDarkening ld);
// The whole disc's flux in the same units: π (1 − u1/3 − u2/6).
double discFlux(LimbDarkening ld);
// The share of the star's light a dark disc of radius k blocks, its centre z from the star's
// (both in stellar radii): the intensity over the overlap, integrated in rings.
double blocked(double z, double k, LimbDarkening ld);

// blocked(z) for one planet and star, tabulated over 0 ≤ z ≤ 1 + k for the voices.
class Occultation {
 public:
  Occultation() { table.reserve(kPoints + 1); }
  void build(double k, LimbDarkening ld);
  double at(double z) const;
  double k = -1;
  LimbDarkening ld{-1, -1};
  static constexpr int kPoints = 512;
 private:
  std::vector<double> table;
  double dz = 1;
};

// A key's planet: its year, orbit and transit.
struct Orbit {
  double freq = 440;    // Hz: the note (the key's, in the keyboard's tuning)
  double period = DAY;  // s: the planet's year
  double speedup = 1;   // the light curve's seconds per second of sound
  double aR = 10;       // the orbit's radius, in stellar radii (Kepler's third law)
  double k = 0.1;       // the planet's radius over the star's
  double b = 0;         // the impact parameter, in stellar radii
  double cosi = 0;      // cos of the inclination: b / aR
  double phiT = 0;      // half the transit (first to last contact), as a share of the year
  double depth = 0;     // the share of light blocked at mid-transit
  LimbDarkening ld;
};
// The planet on `key` for the parameters P (indexed as in tess-params.h).
Orbit orbitOf(int key, const double *P);
// The planet's centre from the star's, in stellar radii, at phase φ (0 at mid-transit); a large
// number when the planet is behind the star.
double separation(const Orbit &o, double phase);

// The light curve's Fourier series: one year's dimming δ(φ) = Σ c_n e^{2πinφ}, symmetric about
// mid-transit, so c_n is real and the dimming is c_0 + 2 Σ c_n cos 2πnφ. Fills c[0..H].
void harmonics(const Orbit &o, const Occultation &occ, int H, double *c);

// TESS's photon rate from a star of magnitude T (e⁻/s: its response includes the CCDs').
double photons(double T);
// The light curve's relative noise, rms, averaged over dt seconds of the star's light.
double noise(double T, double dt);

// A small fast random generator (Mulberry32), so the hiss is the same every time.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed) {}
  double uniform(); // [0, 1)
  double gauss();   // roughly normal (four uniforms), unit variance
};

} // namespace forte::tess
