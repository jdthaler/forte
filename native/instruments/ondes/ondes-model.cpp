// ondes-model.cpp — the physics of the ondes Martenot (ondes-model.h).

#include "ondes-model.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::ondes {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::log10;
using fdlibm::pow;
using fdlibm::sin;

// ---- the heterodyne ----------------------------------------------------------------------------

// exp(hM) = cos(ωh) I + (sin(ωh)/ω) M, with ω² = (Δ² − K²)/4 (M² = −ω² I); cosh and sinh when the
// oscillators are locked (K > Δ), and I + hM between.
Mobius adlerStep(double delta, double K, double h) {
  const double w2 = 0.25 * (delta * delta - K * K);
  double c, s;
  if (w2 > 0) {
    const double w = std::sqrt(w2), x = w * h;
    c = cos(x); s = x < 1e-8 ? h : sin(x) / w;
  } else if (w2 < 0) {
    const double w = std::sqrt(-w2), x = w * h, e = exp(x);
    c = 0.5 * (e + 1 / e); s = x < 1e-8 ? h : 0.5 * (e - 1 / e) / w;
  } else {
    c = 1; s = h;
  }
  return {c, 0.5 * s * delta, 0.5 * s * K, 0.5 * s * K, c, -0.5 * s * delta};
}

double beat(double delta, double K) { return delta > K ? std::sqrt(delta * delta - K * K) : 0; }
double trimFor(double f, double K) { return std::sqrt(f * f + K * K); }
double harmonicRatio(double delta, double K) {
  if (K <= 0) return 0;
  if (delta <= K) return 1;
  return (delta - beat(delta, K)) / K;
}

// ---- the intensity key --------------------------------------------------------------------------

double levelDb(double F) {
  const double x = log10(std::max(F, 1e-6));
  int i = 0;
  while (i < NUANCES - 2 && x > log10(NUANCE_F[i + 1])) i++;
  const double x0 = log10(NUANCE_F[i]), x1 = log10(NUANCE_F[i + 1]);
  return NUANCE_DB[i] + (NUANCE_DB[i + 1] - NUANCE_DB[i]) * (x - x0) / (x1 - x0);
}

double keyGain(double F) {
  if (F < F_OPEN) return 0;
  return pow(10.0, (levelDb(F) - NUANCE_DB[NUANCES - 1]) / 20);
}

double keyForce(double velocity, double after) {
  const double v = std::clamp(velocity, 0.0, 1.0), a = std::clamp(after, 0.0, 1.0);
  const double Fv = F_SOFT * pow(F_HARD / F_SOFT, v);
  return Fv * pow(F_MAX / Fv, a);
}

// ---- the tam-tam --------------------------------------------------------------------------------

// Miller's algorithm: recur downward from far above the orders wanted, then normalise by
// 1 = J₀ + 2ΣJ₂ₖ (first kind) or eˣ = I₀ + 2ΣIₖ (modified).
template <bool MODIFIED>
static void bessel(int M, double x, double *out) {
  if (x <= 0) { for (int k = 0; k <= M; k++) out[k] = k == 0; return; }
  const double big = std::max((double)M, x);
  int N = (int)(big + 30 + std::sqrt(40 * big));
  N += N & 1;
  double jp = 0, j = 1e-30, sum = 0;
  for (int k = N; k > 0; k--) {
    const double jm = 2 * k / x * j + (MODIFIED ? jp : -jp); // order k − 1
    if (k <= M) out[k] = j;
    if (MODIFIED) sum += j; else if (k % 2 == 0) sum += j;
    jp = j; j = jm;
    if (std::fabs(j) > 1e200) { // rescale what is kept
      j *= 1e-200; jp *= 1e-200; sum *= 1e-200;
      for (int q = k; q <= M; q++) out[q] *= 1e-200;
    }
  }
  out[0] = j;
  const double norm = MODIFIED ? exp(x) / (j + 2 * sum) : 1 / (j + 2 * sum);
  for (int k = 0; k <= M; k++) out[k] *= norm;
}
void besselJ(int M, double x, double *J) { bessel<false>(M, x, J); }
void besselI(int M, double x, double *I) { bessel<true>(M, x, I); }

// The four boundary terms for W = J_m(λr) + C I_m(λr) at the free rim r = 1 (Kirchhoff): no
// radial moment, a·1 − C b = 0, and no effective shear, c·1 − C d = 0.
struct Rim { double a, b, c, d, J, I, Jp, Ip; };
static Rim rim(int m, double lam, const double *J, const double *I, double nu = BRONZE_NU) {
  const double Jm = J[m], Im = I[m];
  const double Jlo = m > 0 ? J[m - 1] : -J[1], Ilo = m > 0 ? I[m - 1] : I[1];
  const double Jp = 0.5 * (Jlo - J[m + 1]), Ip = 0.5 * (Ilo + I[m + 1]), mm = (double)m * m, l2 = lam * lam;
  return {l2 * Jm + (1 - nu) * (lam * Jp - mm * Jm), l2 * Im - (1 - nu) * (lam * Ip - mm * Im),
          l2 * lam * Jp + (1 - nu) * mm * (lam * Jp - Jm), l2 * lam * Ip - (1 - nu) * mm * (lam * Ip - Im), Jm, Im, Jp, Ip};
}

double plateEquation(int m, double lam, double nu) {
  double J[80], I[80];
  besselJ(m + 1, lam, J); besselI(m + 1, lam, I);
  const Rim q = rim(m, lam, J, I, nu);
  return (q.a * q.d - q.b * q.c) / (q.I * lam * lam * lam);
}

static constexpr int MMAX = 72;

const std::vector<PlateMode> &plateModes() {
  static const std::vector<PlateMode> modes = [] {
    std::vector<PlateMode> out;
    double J[MMAX + 2], I[MMAX + 2], prev[MMAX + 1];
    const double step = 0.04;
    bool first = true;
    for (double lam = 0.3; lam < GONG_LAMBDA; lam += step) {
      besselJ(MMAX + 1, lam, J); besselI(MMAX + 1, lam, I);
      for (int m = 0; m <= MMAX; m++) {
        const Rim q = rim(m, lam, J, I);
        const double v = (q.a * q.d - q.b * q.c) / (q.I * lam * lam * lam);
        if (!first && (v > 0) != (prev[m] > 0)) {
          double lo = lam - step, hi = lam, flo = prev[m];
          for (int it = 0; it < 60; it++) {
            const double mid = 0.5 * (lo + hi), fm = plateEquation(m, mid, BRONZE_NU);
            if ((fm > 0) == (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
          }
          const double L = 0.5 * (lo + hi);
          // the shape, W = J_m(λr) + C I_m(λr), C = a/b, normalised by ∫W² dA (Lommel's integrals)
          double Jl[MMAX + 2], Il[MMAX + 2], Jr[MMAX + 2], Ir[MMAX + 2];
          besselJ(m + 1, L, Jl); besselI(m + 1, L, Il);
          const Rim s = rim(m, L, Jl, Il);
          const double C = s.a / s.b, mm = (double)m * m, l2 = L * L;
          const double jj = 0.5 * (s.Jp * s.Jp + (1 - mm / l2) * s.J * s.J);
          const double ji = (s.J * s.Ip - s.Jp * s.I) / (2 * L);
          const double ii = 0.5 * ((1 + mm / l2) * s.I * s.I - s.Ip * s.Ip);
          const double area = (jj + 2 * C * ji + C * C * ii) * (m == 0 ? 2 * PI : PI);
          besselJ(m, L * GONG_COIL, Jr); besselI(m, L * GONG_COIL, Ir);
          out.push_back({m, L, (Jr[m] + C * Ir[m]) / std::sqrt(area)});
        }
        prev[m] = v;
      }
      first = false;
    }
    std::sort(out.begin(), out.end(), [](const PlateMode &x, const PlateMode &y) { return x.lam < y.lam; });
    return out;
  }();
  return modes;
}

double plateHzPerLam2(double diameter) {
  const double a = 0.5 * diameter;
  const double D = BRONZE_E * GONG_H * GONG_H * GONG_H / (12 * (1 - BRONZE_NU * BRONZE_NU));
  return std::sqrt(D / (BRONZE_RHO * GONG_H)) / (2 * PI * a * a);
}

// ---- the springs --------------------------------------------------------------------------------

double springOmega(double k) {
  const double kappa = 0.5 * SPRING_r * std::sqrt(BRASS_E / BRASS_RHO), eps = 1 / SPRING_R;
  const double k2 = k * k, e2 = eps * eps, d = e2 - k2;
  return kappa * k * std::fabs(d) / std::sqrt(e2 + k2);
}

double springFc() {
  // the peak of the lower branch, found by golden section
  double lo = 0.3 / SPRING_R, hi = 0.8 / SPRING_R;
  for (int i = 0; i < 100; i++) {
    const double a = lo + 0.381966 * (hi - lo), b = hi - 0.381966 * (hi - lo);
    if (springOmega(a) < springOmega(b)) lo = a; else hi = b;
  }
  return springOmega(0.5 * (lo + hi)) / (2 * PI);
}

} // namespace forte::ondes
