// project8-model.cpp — the physics of a CRES cell (project8-model.h).

#include "project8-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::project8 {

constexpr double PI = std::numbers::pi;

double gyro() { return QE / (2 * PI * ME_KG); }
double cyclotron(double B, double K) { return gyro() * B / (1 + K / ME_EV); }
double coolingTime(double B) { return 3 * PI * EPS0 * std::pow(ME_KG * C, 3) / (std::pow(QE, 4) * B * B); }
double power(double B, double K, double cosTheta) {
  const double g = 1 + K / ME_EV;
  return ME_EV / (2 * coolingTime(B)) * (g * g - 1) * (1 - cosTheta * cosTheta);
}

Electron Electron::of(double K, double cosTheta) {
  Electron e;
  const double g = 1 + K / ME_EV, b = std::sqrt(std::max(0.0, 1 - 1 / (g * g)));
  e.bpar = b * std::min(1.0, std::fabs(cosTheta));
  e.gpar = 1 / std::sqrt(1 - e.bpar * e.bpar);
  e.w = std::max(0.0, g / e.gpar - 1);
  return e;
}

// γ′ = coth x, so (γ′ + 1) / (γ′ − 1) = e^2x, and x grows by dt′ / 2τ: in w = γ′ − 1, which keeps
// its precision as the electron comes to rest in that frame.
void Electron::cool(double dt, double tau) {
  if (w <= 0) return;
  const double E = (w + 2) / w * std::exp(dt / (gpar * tau));
  w = std::isfinite(E) ? 2 / (E - 1) : 0;
}

double Electron::uPerp() const { return std::sqrt(w * (w + 2)); }
double Electron::cosTheta() const {
  const double a = uPar(), b = uPerp();
  return a > 0 ? a / std::hypot(a, b) : 0;
}
double Electron::cot2() const {
  const double b = uPerp(), a = uPar();
  return b > 0 ? (a * a) / (b * b) : INFINITY;
}
double Electron::beta() const {
  const double g = gamma();
  return std::sqrt(std::max(0.0, 1 - 1 / (g * g)));
}

double axialFrequency(const Trap &t, const Electron &e) { return e.betaPerp() * C / (2 * PI * t.L); }

double guideCutoff() { return TE11 * C / (2 * PI * GUIDE_A); }
double guideIndex(double f, double L, double cot) {
  const double fc = guideCutoff();
  if (f <= fc) return 0; // below cutoff the guide carries nothing along
  return 2 * PI * f / C * std::sqrt(1 - (fc / f) * (fc / f)) * L * cot;
}

double besselJ(int n, double x) {
  n = std::abs(n);
  const double h = x / 2;
  double term = std::pow(h, n);
  for (int k = 1; k <= n; k++) term /= k;
  double s = term;
  for (int k = 1; k < 200; k++) {
    term *= -(h * h) / (k * (double)(n + k));
    s += term;
    if (std::fabs(term) < 1e-17 * std::fabs(s) && k > h) break;
  }
  return s;
}
double besselJd(int n, double x) {
  const double lo = n == 0 ? -besselJ(1, x) : besselJ(n - 1, x);
  return (lo - besselJ(n + 1, x)) / 2;
}

double sideOn(int n, double beta) { return n * beta * besselJd(n, n * beta); }

double harmonicPower(int n, double beta) {
  // Simpson's rule over ϑ in (0, π), symmetric about π/2
  const int N = 400;
  double s = 0;
  for (int i = 0; i <= N; i++) {
    const double th = (PI / 2) * i / N, sn = std::sin(th), cs = std::cos(th);
    const double x = n * beta * sn, Jn = besselJ(n, x), Jd = besselJd(n, x);
    const double cot2Jn2 = sn > 0 ? (cs * cs) / (sn * sn) * Jn * Jn : (n == 1 ? beta * beta / 4 : 0);
    const double f = (cot2Jn2 + beta * beta * Jd * Jd) * sn;
    s += (i == 0 || i == N ? 1 : i % 2 ? 4 : 2) * f;
  }
  const double integral = 2 * s * (PI / 2) / N / 3; // both halves
  return n * (double)n * integral / 2;               // ∫ dΩ / 4π = ½ ∫ sin ϑ dϑ
}

namespace {
double betaRaw(double K) {
  if (K <= 0 || K >= T2_ENDPOINT) return 0;
  const double E = K + ME_EV, p = std::sqrt(E * E - ME_EV * ME_EV), b = p / E, eta = 2 * PI * ALPHA * T_Z / b;
  const double F = eta / (1 - std::exp(-eta));
  const double q = T2_ENDPOINT - K;
  return F * p * E * q * q;
}
struct BetaTable { double norm = 0, mean = 0, peak = 0; };
const BetaTable &betaTable() {
  static const BetaTable t = [] {
    BetaTable b;
    const int N = 20000;
    double s = 0, sk = 0;
    for (int i = 0; i <= N; i++) {
      const double K = T2_ENDPOINT * i / N, f = betaRaw(std::max(K, 1e-9)) /* p F is finite at rest */, w = (i == 0 || i == N ? 1 : i % 2 ? 4 : 2);
      s += w * f; sk += w * f * K;
      b.peak = std::max(b.peak, f);
    }
    const double h = T2_ENDPOINT / N / 3;
    b.norm = s * h; b.mean = sk / s;
    return b;
  }();
  return t;
}
} // namespace

double betaSpectrum(double K) { return betaRaw(K) / betaTable().norm; }
double betaMean() { return betaTable().mean; }

double collisionRate(double pMbar, double K) {
  const double n = pMbar * 100 / (KB * GAS_T);
  const double gr = 1 + SIGMA_REF_EV / ME_EV, br2 = 1 - 1 / (gr * gr);
  const double g = 1 + K / ME_EV, b2 = std::max(1e-12, 1 - 1 / (g * g));
  const double sigma = SIGMA_INEL * (br2 / b2) * (1 + ELASTIC_SHARE); // Bethe's leading 1/β²
  return n * sigma * std::sqrt(b2) * C;
}

double screeningAngle(double K) {
  const double pc = std::sqrt(K * K + 2 * K * ME_EV);
  return HBARC_EV_NM / (pc * TF_SCREEN * A0_NM);
}

double Rng::uniform() {
  uint32_t t = (s += 0x6d2b79f5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}
double Rng::exponential(double mean) { return -mean * std::log(1 - uniform()); }
double Rng::gauss() { return (uniform() + uniform() + uniform() + uniform() - 2) * std::sqrt(3.0); }

double drawTritium(Rng &rng) {
  const double top = 1.02 * betaTable().peak;
  for (int i = 0; i < 10000; i++) {
    const double K = T2_ENDPOINT * rng.uniform();
    if (rng.uniform() * top < betaRaw(K)) return K;
  }
  return betaMean();
}

Collision collide(Rng &rng, double K, double &cosTheta) {
  Collision c;
  c.elastic = rng.uniform() < ELASTIC_SHARE / (1 + ELASTIC_SHARE);
  if (c.elastic) {
    // screened Rutherford: dσ/dΩ ∝ 1 / (θ² + χ₀²)², so θ² = χ₀² u / (1 − u)
    const double u = rng.uniform(), chi = screeningAngle(K);
    c.angle = std::min(PI, chi * std::sqrt(u / (1 - u)));
  } else {
    c.angle = std::min(PI, rng.exponential(INEL_ANGLE));
    // half excite the molecule, half ionise it and give the freed electron w, drawn as 1 / (w + I)²
    if (rng.uniform() < 0.5) c.loss = LOSS_EXC;
    else {
      const double u = rng.uniform();
      c.loss = LOSS_ION + std::min(LOSS_ION * u / (1 - u), std::max(0.0, (K - LOSS_ION) / 2));
    }
  }
  const double phi = 2 * PI * rng.uniform(), ct = std::clamp(cosTheta, -1.0, 1.0), st = std::sqrt(1 - ct * ct);
  cosTheta = std::clamp(ct * std::cos(c.angle) + st * std::sin(c.angle) * std::cos(phi), -1.0, 1.0);
  return c;
}

} // namespace forte::project8
