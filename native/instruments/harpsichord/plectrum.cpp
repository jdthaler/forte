// plectrum.cpp — the cantilever's tables and the friction cone (plectrum.h).

#include "plectrum.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <memory>
#include <mutex>

namespace forte::harpsichord {

namespace {
UnitTables compute(double tau) {
  constexpr int n = PLECTRUM_TABLE, Q = 400;
  UnitTables t;
  t.tau = tau;
  const auto flex = [tau](double z) { return 1 / std::pow(1 - tau * z, 3); }; // 1/EI(z), EI₀ = 1
  for (int j = 1; j < n; j++) {
    const double s = (double)j / (n - 1), h = s / Q;
    double cc = 0, gg = 0, G = 0, ff = 0;
    for (int q = 0; q < Q; q++) {
      const double z = (q + 0.5) * h, r = flex(z), d = s - z;
      cc += d * d * r * h; gg += d * r * h;
      const double dG = d * r * h;
      G += 0.5 * dG; ff += 0.5 * G * G * h; G += 0.5 * dG;
    }
    t.c[j] = cc; t.g[j] = gg; t.F[j] = ff;
  }
  return t;
}
long long memoId(double tau) { return std::llround(tau * 1e4); } // tau.toFixed(4)
} // namespace

const UnitTables &unitTables(double tau) {
  // the materials' tapers: built once (thread-safe static), then only read
  static const std::array<UnitTables, 2> mats = {compute(MATERIALS[0].taper), compute(MATERIALS[1].taper)};
  for (const UnitTables &t : mats) if (memoId(t.tau) == memoId(tau)) return t;
  // any other taper (tests, views): off the audio thread
  static std::mutex m;
  static std::map<long long, std::unique_ptr<UnitTables>> memo;
  std::lock_guard<std::mutex> l(m);
  auto &slot = memo[memoId(tau)];
  if (!slot) slot = std::make_unique<UnitTables>(compute(tau));
  return *slot;
}

Plectrum makePlectrum(const PlectrumSpec &sp) {
  const int mi = sp.material == 1 ? 1 : 0;
  const Material &mat = MATERIALS[mi];
  Plectrum pl;
  pl.tau = sp.taper >= 0 ? sp.taper : mat.taper;
  pl.T = &unitTables(pl.tau);
  pl.len = sp.len;
  pl.EI0 = sp.kTip * pl.T->c[PLECTRUM_TABLE - 1] * std::pow(sp.len, 3);
  pl.overlap = std::min(std::max(sp.overlap, 0.05e-3), 0.9 * sp.len);
  pl.s0 = sp.len - pl.overlap;
  pl.kTip = sp.kTip;
  pl.material = mi;
  pl.mu = sp.mu >= 0 ? sp.mu : mat.mu;
  pl.fore = sp.foreshortening ? 1 : 0;
  return pl;
}

// Linear interpolation in the tables (dimensionless).
static double interp(const std::array<double, PLECTRUM_TABLE> &arr, const Plectrum &pl, double s) {
  constexpr int n = PLECTRUM_TABLE;
  const double u = std::min(std::max(s / pl.len, 0.0), 1.0) * (n - 1);
  const int j = std::min(n - 2, (int)std::floor(u));
  const double f = u - j;
  return arr[j] * (1 - f) + arr[j + 1] * f;
}
double beamC(const Plectrum &pl, double s) { return (interp(pl.T->c, pl, s) * std::pow(pl.len, 3)) / pl.EI0; }
double beamG(const Plectrum &pl, double s) { return (interp(pl.T->g, pl, s) * pl.len * pl.len) / pl.EI0; }
double beamPhi(const Plectrum &pl, double s) { return (pl.fore * interp(pl.T->F, pl, s) * std::pow(pl.len, 5)) / (pl.EI0 * pl.EI0); }

double coneLo(const Plectrum &pl, double s, double F) { const double tt = F * beamG(pl, s), mu = pl.mu; return (tt - mu) / (1 + mu * tt); }
double coneHi(const Plectrum &pl, double s, double F) { const double tt = F * beamG(pl, s), mu = pl.mu; return (tt + mu) / std::max(1e-9, 1 - mu * tt); }

QuasiStatic quasiStaticRelease(const Plectrum &pl, double Cs, double Kz, double yMax, double dy) {
  double s = pl.s0;
  const auto forceAt = [&](double y, double ss) { return y / (beamC(pl, ss) + Cs); };
  for (double y = dy; y < yMax; y += dy) {
    double F = forceAt(y, s);
    const double zs = lateralZ(pl, s, F), need = Kz * (zs - pl.s0), lo = coneLo(pl, s, F);
    if (need < F * lo) {
      // slides towards the tip: K_z(z(s) − z₀) = F(s) tan(θ(s) − φ)
      const auto gfun = [&](double ss) { const double Fs = forceAt(y, ss); return Kz * (lateralZ(pl, ss, Fs) - pl.s0) - Fs * coneLo(pl, ss, Fs); };
      if (gfun(pl.len) < 0) return {true, F, y, Cs * F, F * beamC(pl, s), s, std::atan(F * beamG(pl, s))};
      double a = s, b = pl.len;
      for (int it = 0; it < 60; it++) { const double m = 0.5 * (a + b); if (gfun(m) < 0) a = m; else b = m; }
      s = 0.5 * (a + b);
    }
  }
  return {};
}

double releaseForceClosed(double EI, double len, double Kz, double o, double mu) {
  const double g = (len * len) / (2 * EI), bq = mu * (1 + Kz * o * g);
  return (bq + std::sqrt(bq * bq + 4 * g * Kz * o)) / (2 * g);
}

} // namespace forte::harpsichord
