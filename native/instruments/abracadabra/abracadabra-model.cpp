// abracadabra-model.cpp — the physics of ABRACADABRA (abracadabra-model.h).

#include "abracadabra-model.h"

#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::abracadabra {

constexpr double PI = std::numbers::pi;

double axionFrequency(double massEv) { return massEv / H_EV; }
double axionMass(double f) { return f * H_EV; }

double couplingPerMeter(double g, double rho) {
  const double hbarcCm = HBARC_GEV_M * 100;          // GeV cm
  const double rhoNat = rho * hbarcCm * hbarcCm * hbarcCm; // GeV⁴
  return g * std::sqrt(rhoNat) / HBARC_GEV_M;        // GeV → 1/m
}

double pickupFlux(double g, double rho, double B, double size) {
  const double s = size / ABRA_H;
  return couplingPerMeter(g, rho) * ABRA_G * ABRA_V * s * s * s * B;
}

double squidFlux(double g, double rho, double B, double size) { return pickupFlux(g, rho, B, size) * (M_IN / L_T) / PHI0 * 1e6; }

double channelNoise(double noise, double f) { return noise * std::sqrt(PI * f / (2 * CHANNEL_Q)); }

// K and E by the arithmetic-geometric mean (Abramowitz & Stegun 17.6).
double ellipK(double k) {
  double a = 1, b = std::sqrt(1 - k * k);
  for (int i = 0; i < 40 && std::fabs(a - b) > 1e-15 * a; i++) { const double m = (a + b) / 2; b = std::sqrt(a * b); a = m; }
  return PI / (2 * a);
}
double ellipE(double k) {
  double a = 1, b = std::sqrt(1 - k * k), c = k, sum = c * c / 2, pow2 = 0.5;
  for (int i = 0; i < 40 && std::fabs(c) > 1e-15; i++) {
    const double m = (a + b) / 2;
    c = (a - b) / 2; b = std::sqrt(a * b); a = m;
    pow2 *= 2; sum += pow2 * c * c;
  }
  return (1 - sum) * PI / (2 * a);
}

// The mutual inductance of two coaxial circles of radii a and r, z apart, over μ₀ (m).
static double mutual(double a, double r, double z) {
  const double k2 = 4 * a * r / ((a + r) * (a + r) + z * z), k = std::sqrt(k2);
  return std::sqrt(a * r) * ((2 / k - k) * ellipK(k) - (2 / k) * ellipE(k));
}

// Gauss–Legendre nodes and weights on [−1, 1] (Newton on Pₙ).
static void legendre(int n, double *x, double *w) {
  for (int i = 0; i < n; i++) {
    double t = std::cos(PI * (i + 0.75) / (n + 0.5)), dp = 1;
    for (int it = 0; it < 100; it++) {
      double p0 = 1, p1 = t;
      for (int k = 2; k <= n; k++) { const double p2 = ((2 * k - 1) * t * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (t * p1 - p0) / (t * t - 1);
      const double dt = p1 / dp;
      t -= dt;
      if (std::fabs(dt) < 1e-15) break;
    }
    x[i] = t; w[i] = 2 / ((1 - t * t) * dp * dp);
  }
}

double geometryFactor(double a, double R, double Ro, double h) {
  constexpr int N = 48;
  double x[N], w[N];
  legendre(N, x, w);
  // z from the mid-plane out (the toroid is symmetric), in pieces so the far ends of a tall toroid
  // are sampled as well as the near
  double sum = 0;
  const double zEnd = h / 2;
  int pieces = 1;
  while (pieces < 64 && zEnd / pieces > 2 * (Ro - R)) pieces *= 2;
  for (int i = 0; i < N; i++) {
    const double r = R + (Ro - R) * (x[i] + 1) / 2, wr = w[i] * (Ro - R) / 2;
    double inner = 0;
    for (int p = 0; p < pieces; p++) {
      const double z0 = zEnd * p / pieces, z1 = zEnd * (p + 1) / pieces;
      for (int j = 0; j < N; j++) inner += w[j] * (z1 - z0) / 2 * mutual(a, r, z0 + (z1 - z0) * (x[j] + 1) / 2);
    }
    sum += wr * 2 * inner * R / r;
  }
  return sum / (PI * (Ro * Ro - R * R) * h);
}

double labSpeedPdf(double v, double v0, double vlab) {
  if (v <= 0) return 0;
  const double a = (v - vlab) / v0, b = (v + vlab) / v0;
  return v * (std::exp(-a * a) - std::exp(-b * b)) / (std::sqrt(PI) * v0 * vlab);
}

double linePdf(double delta, double fa, double v0, double vlab) {
  if (delta <= 0) return 0;
  const double v = C_KMS * std::sqrt(2 * delta / fa);
  return labSpeedPdf(v, v0, vlab) * C_KMS * C_KMS / (fa * v);
}

double lineMean(double fa, double v0, double vlab) { return fa * (vlab * vlab + 1.5 * v0 * v0) / (2 * C_KMS * C_KMS); }

double lineSpread(double fa, double v0, double vlab) { return fa * std::sqrt(2 * vlab * vlab * v0 * v0 + 1.5 * v0 * v0 * v0 * v0) / (2 * C_KMS * C_KMS); }
double coherenceTime(double fa, double v0, double vlab) { return 1 / (std::sqrt(2.0) * PI * lineSpread(fa, v0, vlab)); }

double Rng::uniform() {
  uint32_t t = (s += 0x6d2b79f5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}
double Rng::gauss() {
  const double u = 1 - uniform(), v = uniform();
  return std::sqrt(-2 * fdlibm::log(u)) * fdlibm::cos(2 * PI * v);
}
double Rng::quick() { return (uniform() + uniform() + uniform() + uniform() - 2) * std::sqrt(3.0); }

void Field::init(Rng &rng) {
  for (Wave &x : w) {
    for (float &c : x.n) c = (float)rng.gauss();
    x.cr = rng.gauss() / std::sqrt(2.0);
    x.ci = rng.gauss() / std::sqrt(2.0);
    x.phase = rng.uniform();
  }
}

double Field::speedOf(const Wave &x, bool stream, double v0, double vlab, double vs) {
  const double s = stream ? STREAM_SIGMA : v0 / std::sqrt(2.0), along = stream ? vs : vlab;
  const double a = s * x.n[0], b = along + s * x.n[1], c = s * x.n[2];
  return std::sqrt(a * a + b * b + c * c);
}

void fieldAt(const Field &f, const FieldShape &s, double fa, double t, double &re, double &im) {
  re = im = 0;
  const double gh = std::sqrt((1 - s.share) / s.halo), gs = s.stream > 0 ? std::sqrt(s.share / s.stream) : 0;
  for (int i = 0; i < s.halo + s.stream; i++) {
    const bool stream = i >= s.halo;
    const Field::Wave &x = f.w[stream ? MAX_WAVES + (i - s.halo) : i];
    const double d = offsetOf(fa, Field::speedOf(x, stream, s.v0, s.vlab, s.vs));
    double ph = x.phase + d * t;
    ph -= std::floor(ph);
    const double c = fdlibm::cos(2 * PI * ph), sn = fdlibm::sin(2 * PI * ph), g = stream ? gs : gh;
    re += g * (x.cr * c - x.ci * sn);
    im += g * (x.cr * sn + x.ci * c);
  }
}

} // namespace forte::abracadabra
