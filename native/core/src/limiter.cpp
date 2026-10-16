// limiter.cpp — Web Audio's compressor curve with an attack/release envelope (limiter.h).

#include "forte/limiter.h"

#include <algorithm>
#include <cmath>

namespace forte {

static double dbToLinear(double db) { return std::pow(10.0, db / 20); }
static double linearToDb(double x) { return 20 * std::log10(x); }

double Limiter::kneeCurve(double x) const {
  if (x < linearThreshold) return x;
  return linearThreshold + (1 - std::exp(-k * (x - linearThreshold))) / k;
}

double Limiter::curve(double x) const {
  if (x < kneeEnd) return kneeCurve(x);
  return dbToLinear(linearToDb(kneeEndOut) + (linearToDb(x) - linearToDb(kneeEnd)) / ratio);
}

void Limiter::set(double thresholdDb, double kneeDb, double r, double attack, double release, double fs) {
  ratio = r;
  linearThreshold = dbToLinear(thresholdDb);
  kneeEnd = dbToLinear(thresholdDb + kneeDb);
  // k: the knee's slope (dB per dB) where it ends is 1/ratio
  auto slopeAt = [&](double kk) {
    const double x = kneeEnd, y = linearThreshold + (1 - std::exp(-kk * (x - linearThreshold))) / kk;
    return x * std::exp(-kk * (x - linearThreshold)) / y;
  };
  double lo = 0.1, hi = 10000;
  for (int i = 0; i < 60; i++) { const double mid = std::sqrt(lo * hi); (slopeAt(mid) > 1 / ratio ? lo : hi) = mid; }
  k = std::sqrt(lo * hi);
  kneeEndOut = kneeCurve(kneeEnd);
  makeup = std::pow(1 / curve(1.0), 0.6);
  attackCoef = 1 - std::exp(-1 / (std::max(attack, 1e-4) * fs));
  releaseCoef = 1 - std::exp(-1 / (std::max(release, 1e-3) * fs));
}

void Limiter::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) {
    const double x = std::max(std::fabs((double)L[i]), std::fabs((double)R[i]));
    const double target = x > linearThreshold ? curve(x) / x : 1;
    gain += (target - gain) * (target < gain ? attackCoef : releaseCoef);
    const double g = gain * makeup;
    L[i] = (float)(L[i] * g);
    R[i] = (float)(R[i] * g);
  }
}

} // namespace forte
