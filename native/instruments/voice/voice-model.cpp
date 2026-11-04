// voice-model.cpp — the Singing Voice's physics (voice-model.h).

#include "voice-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::voice {

FoldConstants foldConstants(double Q, double thick, double restArea) {
  // tension stretches the folds: thinner (m/Q) and stiffer (kQ), so every frequency × Q; the
  // damping r = 2ζ√(mk) is unchanged. A thinner vibrating layer (thick < 1) is lighter and
  // thinner along the flow, on the same springs.
  FoldConstants c;
  c.m1 = M1 * thick / Q; c.m2 = M2 * thick / Q;
  c.k1 = K1 * Q; c.k2 = K2 * Q; c.kc = KC * Q;
  c.h1 = H_RATIO * c.k1; c.h2 = H_RATIO * c.k2;
  c.r1 = 2 * ZETA1 * std::sqrt(c.m1 * c.k1); c.r2 = 2 * ZETA2 * std::sqrt(c.m2 * c.k2);
  c.r1c = 2 * ZETA1C * std::sqrt(c.m1 * c.k1); c.r2c = 2 * ZETA2C * std::sqrt(c.m2 * c.k2);
  c.d1 = D1 * thick; c.d2 = D2 * thick;
  c.a0 = restArea;
  return c;
}

double Folds::step(const FoldConstants &c, double dt, double Ps, double pm, double Z1) {
  a1 = c.a0 + 2 * LG * x1;
  a2 = c.a0 + 2 * LG * x2;
  const double amin = std::min(a1, a2);
  // the flow: ρU²/(2a²) + Z₁U = P_s − 2p⁻, the root with U's sign
  double u = 0;
  if (amin > 0) {
    const double a = RHO / (2 * amin * amin), rhs = Ps - 2 * pm;
    // (the root written without the cancellation of √(Z₁² + 4a|r|) − Z₁ when Z₁ is large)
    const double root = 2 * std::fabs(rhs) / (Z1 + std::sqrt(Z1 * Z1 + 4 * a * std::fabs(rhs)));
    u = rhs >= 0 ? root : -root;
  }
  U = u;
  const double p1 = 2 * pm + Z1 * u; // the pressure just above the folds
  // the pressures on the masses: Bernoulli up to the narrowest point, where the jet leaves at p₁
  double P1, P2;
  if (a1 <= 0) { P1 = Ps; P2 = p1; }
  else if (a2 <= 0) { P1 = Ps; P2 = Ps; }
  else { const double q = amin / a1; P1 = Ps - (Ps - p1) * q * q; P2 = p1; }
  // springs (stiffening as they stretch), the coupling, and the contact springs when shut
  double f1 = P1 * LG * c.d1 - c.k1 * x1 * (1 + ETA_K * x1 * x1) - c.kc * (x1 - x2);
  double f2 = P2 * LG * c.d2 - c.k2 * x2 * (1 + ETA_K * x2 * x2) - c.kc * (x2 - x1);
  if (a1 < 0) { const double y = a1 / (2 * LG); f1 -= c.h1 * y * (1 + ETA_H * y * y); f1 -= c.r1c * v1; } else f1 -= c.r1 * v1;
  if (a2 < 0) { const double y = a2 / (2 * LG); f2 -= c.h2 * y * (1 + ETA_H * y * y); f2 -= c.r2c * v2; } else f2 -= c.r2 * v2;
  // semi-implicit (symplectic) Euler
  v1 += dt * f1 / c.m1; x1 += dt * v1;
  v2 += dt * f2 / c.m2; x2 += dt * v2;
  return u;
}

void areaFunction(double v, double larynx, int N, double *out, double J) {
  using namespace vowels;
  // the shape is the same at every length: the sections stretch with it
  v = std::clamp(v, 0.0, (double)(COUNT - 1));
  const int a = std::min((int)v, COUNT - 2);
  const double t = v - a;
  for (int i = 0; i < N; i++) {
    const double s = ((i + 0.5) / N) * SECTIONS - 0.5; // where it falls in the table
    if (s < LARYNX - 0.5) { out[i] = larynx; continue; }
    const double sc = std::clamp(s, (double)LARYNX, (double)(SECTIONS - 1));
    const int j = std::min((int)sc, SECTIONS - 2);
    const double u = sc - j;
    auto la = [&](int k) {
      const double *A = kVowels[k].area;
      return (1 - u) * fdlibm::log(A[j]) + u * fdlibm::log(A[j + 1]);
    };
    double l = (1 - t) * la(a) + t * la(a + 1);
    if (J > 0) { // toward the horn, in log-area
      const double x = (sc - LARYNX) / (SECTIONS - 1 - LARYNX);
      l += J * (fdlibm::log(OPEN_THROAT) + (fdlibm::log(OPEN_LIPS) - fdlibm::log(OPEN_THROAT)) * x - l);
    }
    out[i] = fdlibm::exp(l) * 1e-4;
  }
}

double radiationR(double A) { return (128 * RHO * C) / (9 * std::numbers::pi * std::numbers::pi * A); }
double radiationL(double A) { return (8 * RHO) / (3 * std::numbers::pi * std::numbers::pi * std::sqrt(A / std::numbers::pi)); }

namespace {
// The chain matrix's entries K₂₁ (as j·c) and K₂₂ at f, for the tube from the glottis to the lips.
void chain(const double *area, int N, double length, double f, double &c21, double &d22, double &a11, double &b12) {
  const double l = length / N, k = (2 * std::numbers::pi * f) / C;
  const double cs = fdlibm::cos(k * l), sn = fdlibm::sin(k * l);
  double a = 1, b = 0, cc = 0, d = 1;
  for (int i = 0; i < N; i++) {
    const double Z = (RHO * C) / area[i];
    const double na = a * cs - b * (sn / Z), nb = a * Z * sn + b * cs;
    const double nc = cc * cs + d * (sn / Z), nd = -cc * Z * sn + d * cs;
    a = na; b = nb; cc = nc; d = nd;
  }
  a11 = a; b12 = b; c21 = cc; d22 = d;
}
} // namespace

double inputPhase(const double *area, int N, double length, double f) {
  // Z_in = (K₁₁ Z_r + K₁₂)/(K₂₁ Z_r + K₂₂), K = [[a, j b], [j c, d]], Z_r = zr + j zi
  double c, d, a, b;
  chain(area, N, length, f, c, d, a, b);
  const double A = area[N - 1], R = radiationR(A), L = radiationL(A), w = 2 * std::numbers::pi * f;
  const double den = R * R + w * w * L * L, zr = (w * w * L * L * R) / den, zi = (w * L * R * R) / den;
  const double nr = a * zr, ni = a * zi + b;        // a Z_r + j b
  const double dr = d - c * zi, di = c * zr;        // j c Z_r + d
  return fdlibm::atan2(ni * dr - nr * di, nr * dr + ni * di);
}

double inputReactance(const double *area, int N, double length, double f) {
  double c, d, a, b;
  chain(area, N, length, f, c, d, a, b);
  const double A = area[N - 1], R = radiationR(A), L = radiationL(A), w = 2 * std::numbers::pi * f;
  const double den = R * R + w * w * L * L, zr = (w * w * L * L * R) / den, zi = (w * L * R * R) / den;
  const double nr = a * zr, ni = a * zi + b, dr = d - c * zi, di = c * zr;
  return ((ni * dr - nr * di) / (dr * dr + di * di)) / ((RHO * C) / area[0]);
}

double jawFor(double v, double larynx, double f, double length) {
  // well under F1 the tract is inertive already: nothing to do. Above, the least opening that leaves
  // it inertive enough at the note; if none does, the most.
  double A[vowels::SECTIONS], best = 0, top = -1e9, F1;
  areaFunction(v, larynx, vowels::SECTIONS, A, 0);
  if (formants(A, vowels::SECTIONS, length, &F1, 1, 3000) && f < UNDER_F1 * F1) return 0;
  for (int k = 0; k <= 20; k++) {
    const double J = k * JAW_MAX / 20;
    areaFunction(v, larynx, vowels::SECTIONS, A, J);
    const double x = inputReactance(A, vowels::SECTIONS, length, f);
    if (x >= INERTIVE) return J;
    if (x > top) { top = x; best = J; }
  }
  return best;
}

int formants(const double *area, int N, double length, double *out, int count, double fMax) {
  const double Lr = radiationL(area[N - 1]);
  auto D = [&](double f) { double c, d, a, b; chain(area, N, length, f, c, d, a, b); return d - 2 * std::numbers::pi * f * Lr * c; };
  int n = 0;
  double f0 = 20, d0 = D(f0);
  for (double f = 25; f < fMax && n < count; f += 5) {
    const double d1 = D(f);
    if ((d1 > 0) != (d0 > 0)) {
      double lo = f - 5, hi = f, dl = d0;
      for (int i = 0; i < 50; i++) { const double m = (lo + hi) / 2, dm = D(m); if ((dm > 0) == (dl > 0)) { lo = m; dl = dm; } else hi = m; }
      out[n++] = (lo + hi) / 2;
    }
    f0 = f; d0 = d1;
  }
  return n;
}

double transfer(const double *area, int N, double length, double f) {
  // U_g = (K₂₁ Z_rad + K₂₂) U_lips, Z_rad = jωL R/(R + jωL)
  double c, d, a, b;
  chain(area, N, length, f, c, d, a, b);
  const double A = area[N - 1], R = radiationR(A), L = radiationL(A), w = 2 * std::numbers::pi * f;
  // Z = jwLR/(R + jwL) = (w²L²R + j wLR²)/(R² + w²L²)
  const double den = R * R + w * w * L * L, zr = (w * w * L * L * R) / den, zi = (w * L * R * R) / den;
  // K₂₁ = j c: (j c)(zr + j zi) = −c zi + j c zr
  const double re = d - c * zi, im = c * zr;
  return 1 / std::sqrt(re * re + im * im);
}

} // namespace forte::voice
