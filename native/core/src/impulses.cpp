// impulses.cpp — shared/impulses.js in C++, operation for operation.

#include "forte/impulses.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte {

void soundboardIR(double fs, double seconds, std::vector<float> (&out)[2]) {
  const int n = (int)std::floor(seconds * fs);
  for (int ch = 0; ch < 2; ch++) {
    Mulberry32 r(11 + 7 * ch);
    std::vector<float> &o = out[ch];
    o.assign(n, 0.0f);
    const int nModes = 700;
    const double fLo = 40, fHi = std::min(12000.0, 0.45 * fs);
    for (int i = 0; i < nModes; i++) {
      const double f = fLo + ((fHi - fLo) * (i + r())) / nModes;
      const double sig = 9 + 0.011 * f;
      const double q = f / 150, hp = (q * q) / (1 + q * q);
      const double u = f / 7000, lp = 1 / std::sqrt(1 + u * u);
      const double amp = std::sqrt(sig) * hp * lp * std::sqrt(-2 * std::log(1 - r() * 0.999));
      const double w = (2 * std::numbers::pi * f) / fs, rr = std::exp(-sig / fs);
      const double c = 2 * rr * std::cos(w), r2 = rr * rr;
      const double ph = 2 * std::numbers::pi * r();
      double y1 = amp * std::sin(ph), y2 = amp * std::sin(ph - w) / rr;
      const int len = std::min(n, (int)std::ceil((9 / sig) * fs));
      for (int t = 0; t < len; t++) {
        const double y = c * y1 - r2 * y2;
        o[t] = (float)((double)o[t] + y1); // a Float32Array's +=
        y2 = y1; y1 = y;
      }
    }
  }
}

void roomIR(double fs, double seconds, std::vector<float> (&out)[2]) {
  const int n = (int)std::floor(seconds * fs);
  const int pre = (int)std::floor(0.014 * fs);
  for (int ch = 0; ch < 2; ch++) {
    Mulberry32 r(101 + ch);
    std::vector<float> &o = out[ch];
    o.assign(n, 0.0f);
    double lp = 0, lp2 = 0;
    for (int t = pre; t < n; t++) {
      const double tt = (t - pre) / fs;
      const double x = r() * 2 - 1;
      lp += 0.12 * (x - lp);
      lp2 += 0.03 * (x - lp2);
      const double fade = std::min(1.0, tt / 0.006);
      o[t] = (float)(fade * (0.55 * x * std::exp((-6.9 * tt) / 0.9) + 1.6 * lp * std::exp((-6.9 * tt) / 1.6) + 2.5 * lp2 * std::exp((-6.9 * tt) / 2.0)));
    }
  }
}

double webAudioScale(const std::vector<float> (&ir)[2], double fs) {
  double p = 0;
  for (const auto &ch : ir) for (float v : ch) p += (double)v * v;
  double rms = std::sqrt(p / (2.0 * ir[0].size()));
  if (!(rms >= 0.000125)) rms = 0.000125;
  return (0.00125 / rms) * (44100 / fs);
}

} // namespace forte
