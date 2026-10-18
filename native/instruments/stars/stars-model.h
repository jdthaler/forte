// stars-model.h — the Star Keyboard's physics (with V8's math, forte/fdlibm.h, so that every key's
// star is the same to the last bit everywhere): the scaling relations, the evolutionary track, the
// asymptotic p modes, the mixed modes, the tuning of each key and the δ Scuti stars.
//
// Units: frequencies of the star in μHz, of the sound in Hz (= μHz × 10⁻⁶ × K); masses, radii and
// luminosities in solar units; temperatures in K; period spacings in s.
#pragma once

#include <cstdint>
#include <vector>

namespace forte::stars {

constexpr int KEY_LO = 36, KEY_HI = 96; // C2–C7
constexpr double K0 = 510800;           // the speed-up that puts the Sun on G6
constexpr int MAX_MODES = 340;          // m components per star, at most
constexpr double VIS[4] = {1, 1.5, 0.6, 0.05};

struct Sun { double numax, dnu, teff, rot; };
extern const Sun SUN;

// JavaScript's Math.round (halves up), Math.min and Math.max (NaN wins)
double jsRound(double x);
inline double jsMin(double a, double b) { return a != a || b != b ? a + b : a < b ? a : b; }
inline double jsMax(double a, double b) { return a != a || b != b ? a + b : a > b ? a : b; }

double keyFreq(double m);
double cents(double a, double b);

// A star: mass, radius, temperature, luminosity, its place s on the track, its stage and its track's mass.
enum class Stage : int { dwarf, subgiant, giant, dscuti };
struct StarState { double M = 0, R = 0, T = 0, L = 0, s = 0; Stage stage = Stage::dwarf; double track = 0; };
// Seismic parameters (μHz, s).
struct Seismic { double dnu = 0, numax = 0, eps = 0, d02 = 0, alpha = 0, fwhm = 0, gamma = 0, dPi = 0, q = 0; };
// A multiplet (one n, l): its frequency, ζ, observed power and linewidth.
struct Multiplet { int l = 0; double n = 0, nu = 0, zeta = 0, power = 0, gamma = 0; };

StarState zams(double M);
StarState starAt(double s, double M);
Seismic seismic(const StarState &st);
std::vector<Multiplet> multiplets(const Seismic &sz, double span = 4);
double heardPitch(const std::vector<Multiplet> &ms);
StarState starForPitch(double nuTarget, double M);
double legendre(int l, int m, double x);
double Elm(int l, int m, double incl);

// Deterministic random numbers: a seeded xorshift32.
struct Rng {
  uint32_t s;
  explicit Rng(double seed);
  double operator()() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s / 4294967296.0; }
};

// What builds a star: the kind, the track's mass and the speed-up.
struct StarParams { int family = 0; double mass = 1, speedup = K0; };

// A key's star: what the engine needs, per m component (keyStar's modes), and what the views draw.
struct Star {
  int key = 0;
  double K = K0;
  bool dscuti = false;
  int N = 0;
  std::vector<double> f, zeta, p, gamma, wEnv, wCore, asat;
  std::vector<int8_t> l, m;
  std::vector<int> mult;
  // the views'
  StarState star;
  Seismic sz;
  std::vector<Multiplet> kept, all; // the played multiplets, and every one the model has
  std::vector<int> keptAt;          // where each played one is in all
  double norm = 0, pitch = 0, target = 0;
  void resize(int n);
};
Star keyStar(int key, const StarParams &P);

} // namespace forte::stars
