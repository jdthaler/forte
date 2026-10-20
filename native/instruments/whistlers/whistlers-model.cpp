// whistlers-model.cpp — the Whistlers' physics (whistlers-model.h).

#include "whistlers-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::whistlers {

constexpr double PI = std::numbers::pi;
constexpr double R_TOP = 1 + TOP_KM / RE_KM; // Earth radii
constexpr double AIRY_PEAK = 0.5357;         // the Airy function's largest value, Ai(−1.0188)

namespace {
// Gauss–Legendre nodes and weights on [−1, 1], found once by Newton's method on P_N.
struct GaussLegendre {
  std::array<double, NGL> x{}, w{};
  GaussLegendre() {
    for (int i = 0; i < NGL; i++) {
      double z = std::cos(PI * (i + 0.75) / (NGL + 0.5)), dp = 1;
      for (int it = 0; it < 100; it++) {
        double p0 = 1, p1 = z;
        for (int k = 2; k <= NGL; k++) { const double p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
        dp = NGL * (z * p1 - p0) / (z * z - 1);
        const double dz = p1 / dp;
        z -= dz;
        if (std::fabs(dz) < 1e-16) break;
      }
      x[i] = z; w[i] = 2 / ((1 - z * z) * dp * dp);
    }
  }
};
const GaussLegendre &gl() { static const GaussLegendre g; return g; }

// n_g ds / c at latitude lam, per radian.
double integrand(const Line &ln, double f, double lam) {
  const double s = std::sin(lam), c = std::cos(lam), q = std::sqrt(1 + 3 * s * s), c2 = c * c;
  const double fce = ln.fce * q / (c2 * c2 * c2);
  const double n = ln.neq * std::pow(c2, -ln.alpha);
  return groupIndex(FPE_K * std::sqrt(n), fce, f) * ln.L * RE_KM * c * q / C_KM;
}
// ∫ from a to b, Gauss–Legendre.
double integrate(const Line &ln, double f, double a, double b) {
  const GaussLegendre &g = gl();
  const double h = (b - a) / 2, m = (a + b) / 2;
  double s = 0;
  for (int i = 0; i < NGL; i++) s += g.w[i] * integrand(ln, f, m + h * g.x[i]);
  return s * h;
}
} // namespace

double fceAt(double L) { return F_CE1 / (L * L * L); }

double eqDensity(double L, double lpp, double scale) {
  const double ps = std::pow(10.0, CA_A * L + CA_B);
  if (L <= lpp) return scale * ps;
  const double pause = std::pow(10.0, CA_A * lpp + CA_B - (L - lpp) / CA_DL);
  const double trough = CA_TROUGH * std::pow(L, -4.5) + (1 - std::exp(-(L - 2) / 10));
  return scale * std::max(pause, trough);
}

double alphaOf(double L, double lpp) {
  if (L <= lpp) return ALPHA_PS;
  const double ps = std::pow(10.0, CA_A * L + CA_B), n = eqDensity(L, lpp);
  const double trough = CA_TROUGH * std::pow(L, -4.5) + (1 - std::exp(-(L - 2) / 10));
  // how far the density has fallen from the plasmasphere's toward the trough's, in decades
  const double u = ps > trough ? std::clamp(std::log(ps / n) / std::log(ps / trough), 0.0, 1.0) : 1.0;
  return ALPHA_PS + (ALPHA_TROUGH - ALPHA_PS) * u;
}

Line lineAt(double L, double lpp, double scale) {
  Line ln;
  ln.L = L;
  ln.fce = fceAt(L);
  ln.neq = eqDensity(L, lpp, scale);
  ln.alpha = alphaOf(L, lpp);
  ln.lam0 = L > R_TOP ? std::acos(std::sqrt(R_TOP / L)) : 0;
  const GaussLegendre &g = gl();
  const double h = ln.lam0 / 2;
  for (int i = 0; i < NGL; i++) {
    const double lam = h * (1 + g.x[i]), s = std::sin(lam), c = std::cos(lam), q = std::sqrt(1 + 3 * s * s), c2 = c * c;
    ln.gyro[i] = ln.fce * q / (c2 * c2 * c2);
    ln.fpe2[i] = FPE_K * FPE_K * ln.neq * std::pow(c2, -ln.alpha);
    ln.ds[i] = g.w[i] * h * ln.L * RE_KM * c * q / C_KM;
  }
  return ln;
}

// Parallel propagation in a cold electron plasma: n² = 1 + X, X = f_pe² / f (f_ce − f), and the
// group index n_g = d(n f)/df = n − f_pe² (f_ce − 2f) / 2 n f (f_ce − f)².
double groupIndex(double fpe, double fce, double f) { return groupIndex2(fpe * fpe, fce, f); }
double groupIndex2(double fpe2, double fce, double f) {
  if (f <= 0 || f >= fce) return INFINITY;
  const double d = fce - f, X = fpe2 / (f * d), n = std::sqrt(1 + X);
  return n - (fpe2 * (fce - 2 * f)) / (2 * n * f * d * d);
}

double delay(const Line &ln, double f) {
  if (ln.lam0 <= 0) return 0;
  double s = 0;
  for (int i = 0; i < NGL; i++) s += groupIndex2(ln.fpe2[i], ln.gyro[i], f) * ln.ds[i];
  return 2 * s; // the line is symmetric about the equator
}

double delayTo(const Line &ln, double f, double lam) {
  if (ln.lam0 <= 0) return 0;
  return integrate(ln, f, -ln.lam0, std::clamp(lam, -ln.lam0, ln.lam0));
}

Nose noseOf(const Line &ln) {
  // the delay is least at one frequency between 0 and f_ce (it grows without bound at both): golden section
  double a = 0.02 * ln.fce, b = 0.98 * ln.fce;
  const double g = (std::sqrt(5.0) - 1) / 2;
  double x1 = b - g * (b - a), x2 = a + g * (b - a), t1 = delay(ln, x1), t2 = delay(ln, x2);
  for (int i = 0; i < 80 && b - a > 1e-11 * ln.fce; i++) {
    if (t1 < t2) { b = x2; x2 = x1; t2 = t1; x1 = b - g * (b - a); t1 = delay(ln, x1); }
    else { a = x1; x1 = x2; t1 = t2; x2 = a + g * (b - a); t2 = delay(ln, x2); }
  }
  Nose n;
  n.f = (a + b) / 2;
  n.tau = delay(ln, n.f);
  const double h = 2e-3 * n.f;
  n.tau2 = (delay(ln, n.f + h) - 2 * n.tau + delay(ln, n.f - h)) / (h * h);
  return n;
}

double lineFor(double f, double lpp, double scale) {
  // f_n = x f_ce(L) = x F_CE1 / L³, with x the nose's share of the gyrofrequency, which changes
  // slowly with L: a fixed point
  double L = std::cbrt(0.4 * F_CE1 / f);
  for (int i = 0; i < 40; i++) {
    const Line ln = lineAt(L, lpp, scale);
    const double x = noseOf(ln).f / ln.fce, next = std::cbrt(x * F_CE1 / f);
    const bool done = std::fabs(next - L) < 1e-13 * L;
    L = next;
    if (done) break;
  }
  return L;
}

double stroke(double f) {
  const double w = 2 * PI * f;
  const double s = (w * (STROKE_T1 - STROKE_T2)) / std::sqrt((1 + w * w * STROKE_T1 * STROKE_T1) * (1 + w * w * STROKE_T2 * STROKE_T2));
  return s * (STROKE_T1 + STROKE_T2) / (STROKE_T1 - STROKE_T2); // its peak, at ω = 1/√(τ₁τ₂), is 1
}

// The duct's cutoff: 1 below half the gyrofrequency, falling to 0 at it.
static double ductTaper(double x) {
  if (x <= DUCT_CUTOFF - DUCT_EDGE) return 1;
  if (x >= DUCT_CUTOFF) return 0;
  const double c = std::cos((PI / 2) * (x - (DUCT_CUTOFF - DUCT_EDGE)) / DUCT_EDGE);
  return c * c;
}

void trackOf(Track &t, double L, double lpp, double scale) {
  t.line = lineAt(L, lpp, scale);
  t.nose = noseOf(t.line);
  const Line &ln = t.line;
  const double fn = t.nose.f, ftop = DUCT_CUTOFF * ln.fce, s0 = stroke(fn);
  for (int i = 0; i < NLO; i++) t.f[i] = fn * std::pow(LOW_SPAN, -(double)(NLO - 1 - i) / (NLO - 1));
  for (int j = 0; j < NUP; j++) t.f[NLO + j] = ftop > fn ? fn + (ftop - fn) * std::pow((j + 1.0) / NUP, 1.5) : fn;
  for (int i = 0; i < NT; i++) {
    const double f = t.f[i];
    t.tau[i] = i == NLO - 1 ? t.nose.tau : delay(ln, f);
    // the lowest octave kept fades out, so a falling tone ends without a click (some 50 dB down by then)
    const double low = std::clamp(std::log2(f * LOW_SPAN / fn), 0.0, 1.0), fade = std::sin((PI / 2) * low);
    const double gain = (stroke(f) / s0) * ductTaper(f / ln.fce) * fade * fade;
    if (i == NLO - 1 || (i >= NLO && ftop <= fn)) { t.amp[i] = i == NLO - 1 ? 1e30 * gain : 0; continue; }
    const double h = 1e-4 * f, dtdf = (delay(ln, f + h) - delay(ln, f - h)) / (2 * h);
    t.amp[i] = gain / std::sqrt(std::fabs(dtdf));
  }
  // At the nose the two branches are one: the Airy function, (2/τ_ω'')^⅓ Ai, whose peak each
  // branch's stationary-phase amplitude is capped at half of. τ_ω'' = τ_f'' / (2π)².
  const double t2w = std::max(1e-30, t.nose.tau2) / (4 * PI * PI);
  t.cap = 0.5 * AIRY_PEAK * std::cbrt(2 / t2w) * ductTaper(fn / ln.fce);
  t.ta = std::cbrt(t2w / 2);
}

double tweekCutoff(int m, double h) { return (m * C_KM) / (2 * h); }
double tweekFreq(int m, double h, double d, double t) {
  const double t0 = d / C_KM;
  if (t <= t0) return INFINITY;
  return tweekCutoff(m, h) / std::sqrt(1 - (t0 / t) * (t0 / t));
}
double tweekStart(int m, double h, double d, double ftop) {
  const double r = tweekCutoff(m, h) / ftop;
  return (d / C_KM) / std::sqrt(1 - r * r);
}
double tweekAmp(int m, double h, double d, double f) {
  (void)d; // the shape relative to 1.5 f_m does not depend on the distance (the level does)
  const double fm = tweekCutoff(m, h);
  if (f <= fm) return 0;
  const double r = std::pow(f / (1.5 * fm), 1.5) * std::pow((1 - (fm / f) * (fm / f)) / (1 - 1 / 2.25), 0.75);
  return std::min(1.0, r) * stroke(f);
}

double Rng::uniform() {
  uint32_t t = (s += 0x6d2b79f5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}
double Rng::exponential(double mean) { return -mean * std::log(1 - uniform()); }

} // namespace forte::whistlers
