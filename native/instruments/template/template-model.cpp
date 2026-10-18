// template-model.cpp — the template's physics (template-model.h).

#include "template-model.h"

#include <cmath>

#include "forte/dsp.h"
#include "template-params.h"

namespace forte::template_ {

double modeShape(int n, double x) {
  const double b = BETA_L[n], s = (std::cosh(b) - std::cos(b)) / (std::sinh(b) - std::sin(b));
  return std::cosh(b * x) + std::cos(b * x) - s * (std::sinh(b * x) + std::sin(b * x));
}

double pulseSpectrum(double f, double tau) {
  const double u = 2 * f * tau;
  return std::fabs(u - 1) < 1e-6 ? std::numbers::pi / 4 : std::fabs(std::cos((std::numbers::pi * u) / 2) / (1 - u * u));
}

KeyModes keyModes(int key, const double *P) {
  KeyModes out;
  const double f1 = keyFreq(key);
  for (int n = 0; n < (int)BETA_L.size(); n++) {
    const double q = BETA_L[n] / BETA_L[0];
    const double ratio = q * q * (1 + P[p::stretch] * n);
    const double f = f1 * ratio;
    if (f > 18000) break;
    const double sigma = sigmaFromT60(P[p::t60]) * std::pow(f / f1, P[p::damping]);
    const double amp = modeShape(n, P[p::strike]) * pulseSpectrum(f, P[p::mallet] / 1000);
    out.m[out.count++] = {f, sigma, amp};
  }
  return out;
}

} // namespace forte::template_
