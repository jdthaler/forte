// plectrum.h — the plectrum as a cantilever, and where it lets go of the string
// (harpsichord/src/plectrum.js in C++, operation for operation). Pure functions and small tables.
//
// The plectrum sticks out of the jack's tongue under the string, free length ℓ, and catches the
// string at s₀ = ℓ − o from its root (o, the overlap). Loaded by F at s it bends (Euler–Bernoulli,
// thickness t₀(1 − τz/ℓ)):
//   deflection w = F c(s),  slope tan θ = F g(s),  foreshortening δ = F² Φ(s)
// so it is a spring k(s) = 1/c(s) whose surface slopes down towards the tip. The string slides
// along it, against its lateral stiffness and friction μ, until it slips off the tip: the pluck.
#pragma once

#include <array>

namespace forte::harpsichord {

constexpr double PLECTRUM_LEN = 3.5e-3; // m: free length ℓ
constexpr int PLECTRUM_TABLE = 96;      // points tabulated along it

// Materials: the taper a voicer cuts (τ) and the friction on the wire (μ). In the order of the
// `material` parameter's choices.
struct Material { const char *name; double taper, mu; };
inline constexpr Material MATERIALS[2] = {{"Delrin", 0.15, 0.2}, {"Quill", 0.5, 0.3}};

// Dimensionless tables for a taper τ (EI₀ = 1, ℓ = 1): ĉ, ĝ, Φ̂ at s = j/(n − 1).
struct UnitTables {
  double tau = 0;
  std::array<double, PLECTRUM_TABLE> c{}, g{}, F{};
};
// The tables for τ (memoised as plectrum.js does, by τ to four decimals). The materials' own are
// built once, before any engine plays, so the audio thread only looks them up.
const UnitTables &unitTables(double tau);

struct Plectrum {
  double len = PLECTRUM_LEN, overlap = 0, s0 = 0, kTip = 0, EI0 = 0, tau = 0, mu = 0, fore = 1;
  int material = 0;
  const UnitTables *T = nullptr;
};
// What makePlectrum takes: the tip stiffness k_tip = 1/c(ℓ) (the voicing) and the overlap; mu and
// taper < 0 take the material's.
struct PlectrumSpec {
  double kTip = 2500, overlap = 0.6e-3;
  int material = 0;
  double mu = -1, taper = -1;
  bool foreshortening = true;
  double len = PLECTRUM_LEN;
};
Plectrum makePlectrum(const PlectrumSpec &s);

double beamC(const Plectrum &pl, double s);   // m/N
double beamG(const Plectrum &pl, double s);   // 1/N
double beamPhi(const Plectrum &pl, double s); // m/N²
// Lateral position of the string when it sits at material point s under force F.
inline double lateralZ(const Plectrum &pl, double s, double F) { return s - F * F * beamPhi(pl, s); }
// The friction cone's edges for a slope tan θ = F g: tan(θ − φ) and tan(θ + φ).
double coneLo(const Plectrum &pl, double s, double F);
double coneHi(const Plectrum &pl, double s, double F);

// The quasi-static pluck (plectrum.js, quasiStaticRelease): the jack raised slowly against a string
// of static compliance Cs and lateral stiffness Kz, with stick–slip friction; ok is false if it
// never lets go below yMax.
struct QuasiStatic { bool ok = false; double F = 0, y = 0, u = 0, w = 0, s = 0, theta = 0; };
QuasiStatic quasiStaticRelease(const Plectrum &pl, double Cs, double Kz, double yMax = 0.02, double dy = 2e-7);
// Closed form for a uniform plectrum without foreshortening: root of gF² − μ(1 + K_z o g)F − K_z o = 0.
double releaseForceClosed(double EI, double len, double Kz, double o, double mu = 0);

} // namespace forte::harpsichord
