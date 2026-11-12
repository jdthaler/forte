// breitwigner-model.cpp — the Breit-Wigner Keyboard's physics (breitwigner-model.h).

#include "breitwigner-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"
#include "breitwigner-params.h"

namespace forte::breitwigner {

namespace fd = forte::fdlibm;

double keyMass(int key, const double *P) {
  // the note: equal temperament × the keyboard's tuning (forte/tuning.h; exactly 1 at its defaults)
  return keyFreq(key) * tuningOf(P).ratio(key);
}

double keyShare(int key, double width, double power) {
  // Γ ∝ M^n is Γ/M ∝ M^(n − 1); a semitone is 2^(1/12) in mass
  const double s = power == 1 ? width : width * fd::pow(2.0, (key - REF_KEY) * (power - 1) / 12);
  return std::min(SHARE_MAX, s);
}

double totalWidth(double mass, double share, double channels) {
  return std::min(SHARE_MAX * mass, share * mass + std::max(0.0, channels));
}

double lifetime(double fwhm) { return 1 / (TAU * fwhm); }

Lab boosted(double mass, double fwhm, double gamma) {
  const double g = std::max(1.0, gamma);
  return {g * mass, fwhm / g};
}

double speed(double gamma) { return gamma > 1 ? std::sqrt(1 - 1 / (gamma * gamma)) : 0; }

double line(double f, double f0, double fwhm) {
  const double h = fwhm / 2, d = f - f0;
  return h * h / (d * d + h * h);
}

// ∫₀^∞ e^(−at) sin(wt + φ) e^(−iωt) dt = ((a + iω) sin φ + w cos φ) / ((a + iω)² + w²), with
// a = π·fwhm and w = 2π·f0; times 2a, its size is 1 at a narrow line's peak.
double heard(double f, double f0, double fwhm, double phase) {
  const double a = TAU / 2 * fwhm, w = TAU * f0, o = TAU * f;
  const double sn = fd::sin(phase), cs = fd::cos(phase);
  const double nr = a * sn + w * cs, ni = o * sn;
  const double dr = a * a - o * o + w * w, di = 2 * a * o;
  return 4 * a * a * (nr * nr + ni * ni) / (dr * dr + di * di);
}

} // namespace forte::breitwigner
