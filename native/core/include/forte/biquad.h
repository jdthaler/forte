// biquad.h — Web Audio's low-pass BiquadFilterNode (its Q in dB: α = sin ω₀ / (2·10^(Q/20))),
// the chain's tone control.
#pragma once

#include <cmath>
#include <numbers>

namespace forte {

class WebAudioLowpass {
 public:
  void set(double f, double fs, double qDb = 0.6) {
    const double w0 = (2 * std::numbers::pi * f) / fs, Q = std::pow(10.0, qDb / 20), al = std::sin(w0) / (2 * Q), c = std::cos(w0), a0 = 1 + al;
    b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
  }
  double run(double x) {
    const double y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  }
  void reset() { x1 = x2 = y1 = y2 = 0; }

 private:
  double b0 = 1, b1 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
};

} // namespace forte
