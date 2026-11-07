// dunes-model.cpp — the Singing Dunes' physics (dunes-model.h).

#include "dunes-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::dunes {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::log;
using fdlibm::sin;

double grainDiameter(double f) { const double r = SHEAR / f; return G * r * r; }
double shearFreq(double d) { return SHEAR * std::sqrt(G / d); }

int wentworth(double d) {
  int i = 0;
  while (i < 6 && d >= WENTWORTH[i]) i++;
  return i;
}

double layerDepth(double f) { return C1 / (2 * f * std::sqrt(1 - (C1 / C2) * (C1 / C2))); }
double layerMode(int n, double H) { return n * C1 / (2 * H * std::sqrt(1 - (C1 / C2) * (C1 / C2))); }

double freqSpread(double sortingPhi) { return sortingPhi * std::numbers::ln2 / 2; }

// ∫ g(ν) D/(D² + ν²) dν with ν = D tan φ (D/(D²+ν²) dν = dφ): ∫ g(D tan φ) dφ over (−π/2, π/2),
// g a Gaussian of width s; Simpson's rule. The tails of tan carry the Gaussian's wide part when D ≪ s,
// so the grid is fine near ±π/2 too.
double criticalCoupling(double s, double D) {
  if (D <= 0) return std::sqrt(8 / std::numbers::pi) * s;
  if (s <= 0) return 2 * D;
  const int N = 4000;
  const double a = -std::numbers::pi / 2, h = std::numbers::pi / N;
  double sum = 0;
  for (int i = 1; i < N; i++) {
    const double phi = a + i * h, nu = D * fdlibm::tan(phi);
    const double g = exp(-0.5 * (nu / s) * (nu / s)) / (s * std::sqrt(2 * std::numbers::pi));
    sum += (i % 2 ? 4 : 2) * g;
  }
  return 2 / (sum * h / 3);
}

double coupling(double U, double water) {
  static const double kRef = criticalCoupling(freqSpread(SORTING_REF), NOISE);
  return kRef * (U / U_ONSET) * exp(-std::max(0.0, water) / WATER_E);
}

double onsetSpeed(double sortingPhi, double water) {
  const double kc = criticalCoupling(freqSpread(sortingPhi), NOISE);
  return U_ONSET * kc / coupling(U_ONSET, water);
}

double pulseHarmonic(int n, double contact) {
  const double w = TAU * contact / (2 * std::sqrt(2 * std::numbers::ln2));
  double e = 0;
  for (int k = 1; k <= H_MAX; k++) { const double a = exp(-0.5 * k * k * w * w); e += a * a / 2; }
  return n < 1 ? 0 : exp(-0.5 * n * n * w * w) / std::sqrt(e);
}

// Acklam's rational approximation (relative error under 1.2e-9).
double invNormal(double p) {
  static const double a[] = {-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00};
  static const double b[] = {-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01};
  static const double c[] = {-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00};
  static const double d[] = {7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00};
  const double lo = 0.02425;
  if (p < lo) { const double q = std::sqrt(-2 * log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) return -invNormal(1 - p);
  const double q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

static float COS[TABLE + 1], SIN[TABLE + 1];
static bool trig = false;
static void buildTrig() {
  if (trig) return;
  for (int i = 0; i <= TABLE; i++) { COS[i] = (float)cos(TAU * i / TABLE); SIN[i] = (float)sin(TAU * i / TABLE); }
  trig = true;
}
const float *cosTable() { buildTrig(); return COS; }
const float *sinTable() { buildTrig(); return SIN; }

static inline uint32_t xorshift(uint32_t &s) { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }

void Population::init(int count, double f0, double spread, double fs, uint32_t sd) {
  buildTrig();
  n = count;
  if ((int)phase.size() < n) { phase.resize(n); w.resize(n); cs.resize(n); sn.resize(n); }
  seed = sd ? sd : 1;
  for (int j = 0; j < n; j++) {
    w[j] = f0 * (1 + spread * invNormal((j + 0.5) / n)) / fs;
    phase[j] = (xorshift(seed) >> 8) / 16777216.0; // incoherent: the avalanche starts at random
  }
  tune(f0, fs);
  zr = zi = 0;
  double sr = 0, si = 0;
  for (int j = 0; j < n; j++) { sr += cos(TAU * phase[j]); si += sin(TAU * phase[j]); }
  mr = sr / n; mi = si / n;
}

void Population::tune(double f0, double fs) {
  const double tau = 2 * CAVITY_Q / (TAU * f0), r = exp(-1 / (tau * fs));
  rr = r * cos(TAU * f0 / fs); ri = r * sin(TAU * f0 / fs);
}

void Population::step(double kdt, double ndt, const float *pulse, double &a, double &b) {
  double sr = 0, si = 0, pa = 0, pb = 0;
  for (int j = 0; j < n; j++) {
    const double x = phase[j] * TABLE;
    int i0 = (int)x;
    if (i0 >= TABLE) i0 = TABLE - 1;
    const double fr = x - i0;
    const double c = COS[i0] + fr * (COS[i0 + 1] - COS[i0]), s = SIN[i0] + fr * (SIN[i0 + 1] - SIN[i0]);
    cs[j] = c; sn[j] = s;
    sr += c; si += s;
    if (pulse) { const double p = pulse[i0] + fr * (pulse[i0 + 1] - pulse[i0]); if (j & 1) pb += p; else pa += p; }
  }
  mr = sr / n; mi = si / n;
  // the layer's vibration: the patches' mean field through the resonator at the note
  const double r = std::sqrt(rr * rr + ri * ri);
  const double nr = rr * zr - ri * zi + (1 - r) * mr, ni = rr * zi + ri * zr + (1 - r) * mi;
  zr = nr; zi = ni;
  const double kr = kdt * zr, ki = kdt * zi;
  for (int j = 0; j < n; j++) {
    // a kick of unit variance: uniform on (−√3, √3)
    const double u = ((int32_t)xorshift(seed)) * (1.7320508075688772 / 2147483648.0);
    double ph = phase[j] + w[j] + ki * cs[j] - kr * sn[j] + ndt * u;
    ph -= std::floor(ph);
    phase[j] = ph;
  }
  a = pa; b = pb;
}

double Population::R() const { return std::sqrt(mr * mr + mi * mi); }
double Population::psi() const { const double p = fdlibm::atan2(mi, mr) / TAU; return p < 0 ? p + 1 : p; }

double simulateR(int n, double s, double K, double D, double f0, double seconds, double fs, uint32_t seed) {
  Population pop;
  pop.init(n, f0, s, fs, seed);
  const double kdt = K * f0 / fs, ndt = std::sqrt(2 * D * TAU * f0 / fs) / TAU;
  double a, b;
  const int settle = (int)(fs * std::max(1.0, 60 / f0)), N = (int)(fs * seconds);
  for (int i = 0; i < settle; i++) pop.step(kdt, ndt, nullptr, a, b);
  double sum = 0;
  for (int i = 0; i < N; i++) { pop.step(kdt, ndt, nullptr, a, b); sum += pop.R(); }
  return sum / N;
}

} // namespace forte::dunes
