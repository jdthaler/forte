// gongs-model.h — the gong as a nonlinear modal system: the plate tables (gong-modes.h, converted
// from gongs/data/gong-modes.js), the shell modes and the pruned von Kármán coupling tensor for a
// dome rise, and each key's gong: its size, rate, losses and mallet. Pure functions, shared by the
// engine, the views (gongs-web.cpp) and the tests.
//
// In units of the radius a, the thickness h and the time τ = √12 a²/(h c_p), every key is the
// same plate (or shallow spherical cap); its modes x_k obey
//   ẍ_k + ω_k² x_k = −∂V_nl/∂x_k + f_k,   V_nl = ½ Σ_n C_n (Q_n² + 4 Q_n ℓ_n),
//   Q_n = xᵀ H̃^n x,   ℓ_n = Ẽ^n · x,
// with the shell's membrane stiffness (the part of V_nl quadratic in x) moved into the linear
// modes, the "shell modes" (gongs/README.md, "Curvature: the shallow dome"). Every asymmetric mode
// (m > 0) comes as a twin pair, cos mθ and sin mθ about the axis of a small mass asymmetry ε that
// splits them (gongs/README.md, "Twins: a gong that is not quite round").
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>

#include "gong-modes.h"
#include "gongs-params.h"

namespace forte::gongs {

using table::NR;
using table::NU;
constexpr int NMAX = 80;   // transverse modes at most (the tables' 41 free, 35 clamped, with their twins: 77, 65)
constexpr int NSMAX = 136; // in-plane modes at most (68, with their twins: 129)
constexpr int LITE = 200; // the lite coupling set: the strongest terms, for weakly nonlinear motion

struct Air { double rho, c; };
inline constexpr Air AIR = {1.2, 343};
// E (Pa), ρ (kg/m³), thermal expansion α (1/K), heat capacity c (J/kg K), thermal diffusivity D (m²/s)
struct Material { const char *name; double E, rho, alpha, cv, D; };
inline constexpr Material MATERIALS[] = {
  {"Bell bronze", 105e9, 8700, 18e-6, 380, 1.2e-5},
  {"Steel", 200e9, 7850, 12e-6, 470, 1.35e-5},
  {"Aluminium", 70e9, 2700, 23e-6, 900, 8.4e-5},
};
const Material &materialOf(const double *P);
double plateSpeed(const Material &mat); // c_p (m/s)

// Radial shape at r ∈ [0, 1] from its samples (Catmull–Rom).
double interpR(const double *R, double r);

// ---- shell modes and the pruned coupling tensor ----------------------------------------------
// What a set of tables is for: Rim (the parameter's index), Dome rise (thicknesses), Coupling terms
// (of the cos family: each brings its twins' terms), Asymmetry ε (a fraction of the mass).
struct Spec {
  int bc = 0;
  double rise = 0;
  int terms = 600;
  double asym = 0;
  bool operator==(const Spec &) const = default;
};
Spec specOf(const double *P);

struct Term { int n, i, j; double v, w; }; // H̃^n_ij (i ≤ j) and its equipartition weight
struct ETerm { int n, i; double v; };     // Ẽ^n_i
// Coupling rows for the engine, over the cos family (the round gong's modes; the engine pairs each
// with its twin as one complex amplitude): by in-plane mode, sorted by the larger mode index, each
// term's two modes and their imaginary parts' places (which say what it conjugates: pack, in
// gongs-model.cpp) packed in four bytes; the curvature terms likewise, by mode.
struct Pack {
  std::vector<int> p1off, p1j, p1ij; std::vector<double> p1h;
  std::vector<int> e1off, e1i; std::vector<double> e1v;
};
struct Shell {
  Spec spec;
  double kappa = 0;
  int N = 0, NS = 0, tuned = 0;
  int N0 = 0, NS0 = 0;                    // the cos family's modes and in-plane modes (the packs')
  std::vector<int> cosOf, sinOf;          // where each of the cos family's modes and its twin are (−1: none)
  std::vector<char> sinIp;                // whether each in-plane mode of the cos family has a twin
  std::vector<double> C0;                 // and its C
  std::vector<int> m, plate;              // each shell mode's angular index, and its dominant plate mode
  std::vector<int> fam;                   // 0: cos m(θ − ψ), 1: its twin sin m(θ − ψ) (ψ: the heavy axis)
  std::vector<int> base;                  // the mode of the round gong (the cos family) it belongs to
  std::vector<double> Om, plateOm, C;
  std::vector<std::array<double, NR>> R;  // radial shapes
  std::vector<Term> H;                    // the kept couplings, twins and all (the views' and tests')
  std::vector<ETerm> E;                   // the curvature terms, likewise
  Pack full, lite;                        // the engine's (the cos family's)
};
// The tables for a spec: a few milliseconds, so never on the audio thread in the plugins.
std::unique_ptr<Shell> buildShell(const Spec &spec);

// End of each packed row when only modes < Nv are present (rows sorted by that index).
void rowEnds(const std::vector<int> &off, const std::vector<int> &idx, int Nv, int *out);

// Backbone of mode p to leading order: d(ω/Ω)/d(a²).
double backbone(const Shell &S, int p, int Nv);

// ---- one key ---------------------------------------------------------------------------------
constexpr double OS_MAX_HZ = 26000, CAP = 0.33;
constexpr int C6 = 84, FEW = 8; // the top keys' floor of modes (keyGong)
struct Loss { double f, th, rad, srad, eta, sigma; };
struct Gong {
  const Shell *S = nullptr;
  int key = 0;
  double f0 = 0, w0 = 0, a = 0, h = 0, mass = 0, cp = 0;
  const Material *mat = &MATERIALS[0];
  int R = 1;
  double fsi = 0, k = 0;
  int Nv = 0;
  double fc = 0;
  std::array<Loss, NMAX> loss{};
  std::array<double, NMAX> sigma{};
};
// The key's gong, tuned so that its first axisymmetric mode is the key's pitch.
// The key's pitch (Hz): equal temperament's times the keyboard's tuning (forte/tuning.h). The gong
// is cut for it: its radius is solved from this pitch.
double gongPitch(int key, const double *P);
void keyGong(Gong &g, int key, const double *P, double fs, const Shell &S);
// Damping of each mode (internal friction, thermoelastic, radiation): g.loss and g.sigma.
void modeLoss(Gong &g, const double *P);
double radiationEfficiency(double x, double pc, double ka);

// Mallet: a Hertzian sphere (head modulus E_m, radius HEAD·a, mass μ × the gong's).
constexpr double HEAD = 0.08, HEAD_NU = 0.45;
struct Mallet { double K, mu, v, vbar; };
Mallet mallet(const Gong &g, const double *P, double vel);
double contactTime(const Gong &g, const double *P, double vel);

// The two close microphones (r/a, θ from the strike line): left, right.
inline constexpr double MICS[2][2] = {{0.9, 0.35}, {0.75, 2.8}};
// A mode's angular shape at θ from the heavy axis.
inline double angular(const Shell &S, int i, double th) { return S.fam[i] ? std::sin(S.m[i] * th) : std::cos(S.m[i] * th); }

} // namespace forte::gongs
