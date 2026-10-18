// dsp.h — the building blocks the engines share: shared/dsp.js in C++, operation for operation
// (in double precision).
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <numbers>
#include <utility>
#include <vector>

namespace forte {

constexpr double TAU = 2 * std::numbers::pi;
inline double keyFreq(double m) { return 440 * std::pow(2.0, (m - 69) / 12); }
inline double sigmaFromT60(double t60) { return std::log(1000.0) / t60; }

// A damped mode  q'' + 2σ q' + ω² q = f(t), discretised impulse-invariantly:
//   q[n+1] = a1·q[n] − a2·q[n−1] + b·f[n]
// so a unit impulse of force gives exactly e^(−σt)·sin(ω_d t)/ω_d at the sample times.
struct ModeCoeffs { double a1, a2, b; };
inline ModeCoeffs modeCoeffs(double f, double sigma, double fs) {
  const double k = 1 / fs, wd = TAU * f, r = std::exp(-sigma * k);
  return {2 * r * std::cos(wd * k), r * r, (k * r * std::sin(wd * k)) / wd};
}

// RBJ biquad (shared/dsp.js): low-pass, high-pass, band-pass (0 dB peak), peak (gain dB), notch.
class Biquad {
 public:
  enum Type { lp, hp, bp, peak, notch };
  Biquad &set(Type type, double f, double Q, double fs, double gainDb = 0) {
    const double w = (TAU * std::min(f, 0.45 * fs)) / fs, c = std::cos(w), al = std::sin(w) / (2 * Q);
    double b0, b1, b2, a0, a1, a2;
    if (type == lp) { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type == hp) { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type == bp) { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type == notch) { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { const double A = std::pow(10.0, gainDb / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    this->b0 = b0 / a0; this->b1 = b1 / a0; this->b2 = b2 / a0; this->a1 = a1 / a0; this->a2 = a2 / a0;
    return *this;
  }
  double run(double x) {
    const double y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
  void reset() { z1 = z2 = 0; }
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
};

// One-pole low-pass, y += g (x − y), with g set from a cutoff in Hz.
class OnePole {
 public:
  OnePole(double f = 1000, double fs = 48000) { set(f, fs); }
  OnePole &set(double f, double fs) { g = 1 - std::exp((-TAU * f) / fs); return *this; }
  double run(double x) { y += g * (x - y); return y; }
  double g = 0, y = 0;
};

// DC blocker, y[n] = x[n] − x[n−1] + R·y[n−1], corner ≈ f Hz.
class DCBlock {
 public:
  DCBlock(double f = 10, double fs = 48000) : R(std::exp((-TAU * f) / fs)) {}
  double run(double x) { const double y = x - x1 + R * y1; x1 = x; y1 = y; return y; }
  double R, x1 = 0, y1 = 0;
};

// Fractional delay line, Catmull–Rom cubic interpolation; read(d) needs d ≥ 1.
class Delay {
 public:
  explicit Delay(double maxSamples) : n(size_t(1) << (int)std::ceil(std::log2(maxSamples + 4))), buf(n, 0.0) {}
  void write(double x) { buf[w] = x; w = (w + 1) & (n - 1); }
  double read(double d) const {
    const size_t m = n - 1;
    const double i = std::floor(d), f = d - i;
    const int64_t p = (int64_t)w - 1 - (int64_t)i;
    const double x0 = buf[(p + 1) & m], x1 = buf[p & m], x2 = buf[(p - 1) & m], x3 = buf[(p - 2) & m];
    const double c0 = x1, c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
    return ((c3 * f + c2) * f + c1) * f + c0;
  }
  size_t n;
  std::vector<double> buf;
  size_t w = 0;
};

// Equal-power pan of a MIDI key across the keyboard (low left, high right): {left, right}.
inline std::pair<double, double> keyPan(double key, double width = 0.6, double lo = 36, double hi = 96) {
  const double p = std::max(-1.0, std::min(1.0, (2 * (key - lo)) / (hi - lo) - 1)) * width;
  const double a = ((p + 1) * std::numbers::pi) / 4;
  return {std::cos(a), std::sin(a)};
}

} // namespace forte
