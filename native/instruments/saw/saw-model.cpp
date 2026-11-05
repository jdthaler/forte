// saw-model.cpp — the musical saw's physics (saw-model.h).

#include "saw-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"
#include "saw-params.h"
#include "saw-table.h"

namespace forte::saw {

using std::numbers::pi;
constexpr double LN1000 = 6.907755278982137;

double waveSpeed() { return std::sqrt(YOUNG / RHO); }
double plateA(double h) { return (waveSpeed() * h) / std::sqrt(12 * (1 - NU * NU)); }
double widthAt(double s) { return W_HEEL + (W_TOE - W_HEEL) * s; }

static double cosh(double x) { const double e = fdlibm::exp(x); return 0.5 * (e + 1 / e); }
static double sinh(double x) { const double e = fdlibm::exp(x); return 0.5 * (e - 1 / e); }

double crossShape(int m, double u) {
  const double b = BETA[m], s = (cosh(b) - fdlibm::cos(b)) / (sinh(b) - fdlibm::sin(b));
  return cosh(b * u) + fdlibm::cos(b * u) - s * (sinh(b * u) + fdlibm::sin(b * u));
}

double hermite(int n, double xi) {
  const double h0 = 0.7511255444649425 * fdlibm::exp(-0.5 * xi * xi); // π^(−1/4) e^(−ξ²/2)
  if (n == 0) return h0;
  if (n == 1) return std::numbers::sqrt2 * xi * h0;
  return ((2 * xi * xi - 1) / std::numbers::sqrt2) * h0;
}

Trap trapped(double eps, int n) {
  using namespace table;
  const double u = (fdlibm::log10(eps) - EPS_LO) / EPS_STEP;
  if (!(u > 0)) { // a wide, shallow well: the harmonic oscillator
    const double k = std::numbers::sqrt2 * eps;
    return {std::sqrt(1 + (2 * n + 1) * k), std::sqrt(((n + 0.5) * std::numbers::sqrt2) / eps)};
  }
  const double v = std::min(u, NEPS - 1.0);
  const int i = std::min((int)v, NEPS - 2);
  const double t = v - i;
  return {OMEGA[n][i] + t * (OMEGA[n][i + 1] - OMEGA[n][i]), RMS[n][i] + t * (RMS[n][i + 1] - RMS[n][i])};
}

Blade blade(const double *P) {
  // the steel's and the air's losses as one loss factor, from the ring time at A4
  return {P[p::thickness] / 1000, P[p::bend], LN1000 / (pi * 440 * P[p::ring]), (int)P[p::shape] == shape_::S};
}

// ω of shape m, order n, on a blade scaled by λ with the inflection at s.
// The bend's gradient through an inflection at s (1/m²): the parameter's at the blade's middle, tighter toward the tip.
static double gradientAt(const Blade &b, double s, double lambda) { const double r = W_MID / widthAt(s); return (b.bend * r * r) / (lambda * lambda); }

static double omegaAt(const Blade &b, double s, double lambda, int m, int n, double *eps = nullptr) {
  const double a = plateA(b.h * lambda), q = BETA[m] / (widthAt(s) * lambda), e = (waveSpeed() * gradientAt(b, s, lambda)) / (a * q * q * q);
  if (eps) *eps = e;
  return a * q * q * trapped(e, n).Omega;
}

double noteAt(const Blade &b, double s) { return omegaAt(b, s, 1, 0, 0) / (2 * pi); }

double bandEdge(const Plan &pl, int m, double x) {
  const double z = std::clamp(pl.s + x / (LEN * pl.lambda), 0.0, 1.0);
  const double q = BETA[m] / (widthAt(z) * pl.lambda), c = waveSpeed() * pl.b0 * fdlibm::tanh((pl.bend * x) / pl.b0);
  return std::sqrt(pl.a * pl.a * q * q * q * q + c * c) / (2 * pi);
}

double transmission(const Plan &pl, int m, double omega, int side) {
  const double end = side < 0 ? GRIP_HEEL : GRIP_TIP, d = std::fabs(end - pl.s) * LEN * pl.lambda;
  constexpr int N = 48;
  double I = 0;
  for (int i = 0; i < N; i++) {
    const double x = side * (((i + 0.5) / N) * d);
    const double z = pl.s + x / (LEN * pl.lambda), q = BETA[m] / (widthAt(z) * pl.lambda);
    const double c = waveSpeed() * pl.b0 * fdlibm::tanh((pl.bend * x) / pl.b0);
    const double gap = pl.a * pl.a * q * q * q * q + c * c - omega * omega;
    if (gap > 0) I += std::sqrt(gap / (2 * pl.a * pl.a * q * q));
  }
  return fdlibm::exp(-2 * I * (d / N));
}

Plan plan(const Blade &b, double f) {
  Plan pl;
  pl.f = f;
  const double flo = noteAt(b, S_LO), fhi = noteAt(b, S_HI);
  if (f <= flo) { pl.s = S_LO; pl.lambda = flo / f; }
  else if (f >= fhi) { pl.s = S_HI; pl.lambda = fhi / f; }
  else { // the inflection's place for the note: the note rises as the blade narrows
    double lo = S_LO, hi = S_HI;
    for (int i = 0; i < 44; i++) { const double mid = 0.5 * (lo + hi); (noteAt(b, mid) < f ? lo : hi) = mid; }
    pl.s = 0.5 * (lo + hi);
  }
  const double L = pl.lambda;
  pl.W = widthAt(pl.s) * L; pl.h = b.h * L; pl.bend = gradientAt(b, pl.s, L); pl.b0 = pl.bend * X_S * L; pl.a = plateA(pl.h);
  for (int m = 0; m < 2; m++) { pl.q[m] = BETA[m] / pl.W; pl.eps[m] = (waveSpeed() * pl.bend) / (pl.a * pl.q[m] * pl.q[m] * pl.q[m]); }
  // the bisection lands within a part in 10¹³; the note is f, and the rest keep their ratios to it
  const double w0 = omegaAt(b, pl.s, L, 0, 0);
  for (int j = 0; j < NMODE; j++) {
    const auto [m, n] = MODES[j];
    const Trap t = trapped(pl.eps[m], n);
    const double w = pl.a * pl.q[m] * pl.q[m] * t.Omega;
    pl.fm[j] = (f * w) / w0;
    pl.ell[j] = t.rms / (pl.q[m] * std::sqrt(n + 0.5));
    pl.mass[j] = RHO * pl.h * pl.W * pl.ell[j];
    const double mat = pi * pl.fm[j] * b.eta;
    // the bounce rate in the well: the spacing to the next level (the last: to the one below)
    const int up = n < 2 ? n + 1 : n - 1;
    const double dw = std::fabs(pl.a * pl.q[m] * pl.q[m] * trapped(pl.eps[m], up).Omega - w) * (f / w0);
    const double wn = 2 * pi * pl.fm[j];
    pl.leak[j] = 0.5 * (dw / (2 * pi)) * (transmission(pl, m, wn, -1) + transmission(pl, m, wn, 1));
    if (j == 0) { pl.massS = pl.mass[0]; pl.sigmaS = mat + pl.leak[0]; }
    if (!b.S) {
      // a J: nothing turns the curvature over, so nothing is trapped; the waves of this shape run
      // the length of the blade, through the hands, and ring as Shankar et al. measured, Q ≈ 10
      pl.leak[j] = (pi * pl.fm[j]) / Q_J;
      pl.ell[j] *= 4;
      pl.mass[j] *= 4;
    }
    pl.sigma[j] = mat + pl.leak[j];
  }
  if (!b.S) { // and the J's waves spread over a band, not one line
    pl.fm[1] = f * 1.07; pl.fm[3] = f * 0.94;
  }
  return pl;
}

double threshold(const Plan &pl, double speed) {
  const double bb = 2 * hermite(0, 0); // the edge's swing at the inflection
  return (2 * pl.massS * pl.sigmaS) / (Friction{}.slope(speed) * bb * bb);
}

} // namespace forte::saw
