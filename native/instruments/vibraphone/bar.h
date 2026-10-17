// bar.h — a vibraphone bar by finite elements (vibraphone/src/bar.js in C++): Timoshenko bending
// and Saint-Venant torsion of a bar whose thickness varies along its length (the undercut), and
// the optimiser that shapes the undercut so that the first three bending modes sit at 1 : 4 : 10.
//
// Only half the bar is meshed (it is symmetric). The banded stiffness and mass matrices
// (half-bandwidth 3) give each eigenvalue by Sturm-sequence bisection and each eigenvector by
// inverse iteration, as the JavaScript does, so the two agree to rounding. These allocate: they
// run off the audio thread (forte/background.h) or in the views.
#pragma once

#include <array>
#include <vector>

namespace forte::vibraphone {

struct Material { double E, rho, nu; };
inline constexpr Material AL = {69e9, 2700, 0.33}; // aluminium alloy (6061-like)
inline constexpr double G_AL = AL.E / (2 * (1 + AL.nu));
inline constexpr double KAPPA = (10 * (1 + AL.nu)) / (12 + 11 * AL.nu); // Cowper's shear coefficient, rectangle

// Free–free Euler–Bernoulli beam: cos βL cosh βL = 1 (the ratios 1 : 2.756 : 5.404 : 8.933 : 13.34).
inline constexpr double BETA_L[5] = {4.730040745, 7.853204624, 10.99560784, 14.13716549, 17.27875966};
double ebRatio(int n); // (βₙL/β₁L)², n from 0

// The undercut: full thickness h0, a thin flat centre ±c at h0 − d, cosine sides out to ±a.
struct Cut { double h0, a, c, d; };
double thickness(const Cut &cut, double X);
double torsionJ(double b, double h);
std::vector<double> halfMesh(const Cut &cut, double L, int fine = 3);

// Banded matrices: row i holds A[i][i..i+3].
struct ElementBending { std::array<double, 16> kb; double phi, l, h; };
struct Bending { std::vector<double> K, M; int n; std::vector<ElementBending> Kb; };
Bending assembleBending(const std::vector<double> &nodes, const Cut &cut, double b, bool shear = true);
struct Torsion { std::vector<double> K, M; int n; };
Torsion assembleTorsion(const std::vector<double> &nodes, const Cut &cut, double b);

// The idx-th (1-based) eigenvalue of K x = λ M x, and (with x) its M-normalised eigenvector.
double bandEig(const std::vector<double> &k, const std::vector<double> &m, int N, int idx, std::vector<double> *x = nullptr,
               double tol = 1e-13, double guess = 1e4);

// Frequencies (Hz) of bending modes 1, 2, 3 only: what the optimiser needs.
std::array<double, 3> bendingFreqs3(const Cut &cut, double L, double b, int fine = 3);

// Everything about one bar: bending modes 1–5 and torsion modes 1–2, shapes at nx points along
// the whole bar (x from 0 at one end to L), unit modal mass, and the share of each bending
// mode's strain energy stored in each element (for thermoelastic loss).
struct BendMode {
  double f, omega, bendShare;
  bool sym;
  std::vector<double> w;
  struct Elem { double h, share; };
  std::vector<Elem> elems;
};
struct TorsMode { double f, omega; bool sym; std::vector<double> psi; };
struct BarModes {
  double L, b;
  Cut cut;
  int nx;
  std::vector<double> xs;
  std::vector<BendMode> bend;
  std::vector<TorsMode> tors;
  double mass;
};
BarModes barModes(const Cut &cut, double L, double b, int nx = 97, int fine = 3, int nBend = 5, int nTors = 2);

// Shape the undercut of a bar of thickness h0 and width b so that bending modes 1, 2, 3 sit at
// f1 : r2·f1 : r3·f1 (Newton's method with a finite-difference Jacobian, as tools/vibraphone-bars.mjs
// runs it). start: {A = a/(L/2), D = d/h0, L}.
struct Tuned { double L, A, D, cf; Cut cut; std::array<double, 3> residualCents; int iterations; };
Tuned tuneUndercut(double f1, double b, double h0, double cf, std::array<double, 3> start = {0.6, 0.6, 0.3},
                   double r2 = 4, double r3 = 10, int fine = 3, int maxIter = 40);

} // namespace forte::vibraphone
