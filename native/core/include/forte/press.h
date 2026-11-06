// press.h — Press (aftertouch, MPE pressure: engine.h pressure, a Seaboard's Press) as the engines
// that had no use for it take it: a hand, a palm, a mallet or a felt held against what rings,
// damping it as hard as the key is pressed (the table in docs/ROADMAP.md's "Strike, Glide, Slide,
// Press and Lift" row says which on each instrument).
//
// Only a firm press damps: pressure below PRESS_FROM does nothing (a Seaboard sends some from any
// finger at rest on a held key, which would choke every note), and the hand goes in over the rest,
// as the drums' heel does. Presses keeps each key's pressure and the channel's (key −1), so
// rescaled; a voice's Press glides toward the larger once a block, over 10 ms, so a press never
// clicks. With nothing pressed a voice's p stays exactly 0, and an engine that adds sigma·p to its
// losses plays bit for bit as before.
#pragma once

#include <array>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte {

constexpr double PRESS_FROM = 0.5;

struct Presses {
  std::array<double, 128> key{};
  double channel = 0;
  void set(double value, int k) {
    const double u = (value - PRESS_FROM) / (1 - PRESS_FROM);
    const double v = u > 0 ? (u < 1 ? u : 1) : 0; // (NaN: none)
    if (k < 0) channel = v;
    else if (k < 128) key[k] = v;
  }
  // how hard key k is pressed: its own pressure or the channel's, whichever is the more
  double of(int k) const { const double v = k >= 0 && k < 128 ? key[k] : 0; return v > channel ? v : channel; }
  void clear() { key.fill(0); channel = 0; }
};

constexpr double PRESS_GLIDE = 0.01; // s: a voice's press follows its key's this fast

struct Press {
  double p = 0; // 0 … 1
  bool on() const { return p > 0; }
  // Follow `target` for a block of n samples at fs; true when p moved (the engine recomputes what
  // depends on it).
  bool follow(double target, int n, double fs) {
    if (p == target) return false;
    p += (target - p) * (1 - fdlibm::exp(-n / (PRESS_GLIDE * fs)));
    if (std::fabs(p - target) < 1e-4) p = target;
    return true;
  }
  // The loss (1/s) a hand or felt pressed this hard adds to a mode at f Hz: sigma at most, all of
  // it well above fc and `low` of it well below (the upper partials go first: the note darkens as it
  // shortens).
  double loss(double f, double sigma, double fc, double low) const {
    const double x2 = (f / fc) * (f / fc);
    return sigma * p * (low + x2) / (1 + x2);
  }
  // The factor each sample scales a vibration's state by (both of a two-pole mode's, so it keeps
  // its pitch) for a loss of sigma·p per second.
  double factor(double sigma, double fs) const { return p > 0 ? fdlibm::exp(-(sigma * p) / fs) : 1; }
};

} // namespace forte
