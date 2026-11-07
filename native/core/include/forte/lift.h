// lift.h — how fast a key comes up (engine.h noteOff's release velocity, a Seaboard's Lift), as
// the engines that had no use for it take it: a release that lasts longer for a slow lift and is
// over sooner for a fast one, and what a fast lift alone sets off (a mallet's touch, a grace stroke).
//
// A key let go with no release velocity (−1: the computer keys, the pedal, a keyboard that sends
// none) is let go as it always was; so is a middling one (0.5, the 64 most keyboards send).
#pragma once

#include <cmath>

#include "forte/fdlibm.h"

namespace forte {

// The release velocity, 0…1, with none given as the middling 0.5.
inline double liftSpeed(double velocity) { return velocity >= 0 ? (velocity < 1 ? velocity : 1) : 0.5; }

// How many times longer than usual a release takes: 2 for the slowest lift, 1 for a middling one
// or none, ½ for the fastest (a factor of 4 between the two ends).
inline double liftScale(double velocity) { return fdlibm::pow(2.0, 1 - 2 * liftSpeed(velocity)); }

// How far past `from` (0…1) a lift is: 0 up to it, 1 for the fastest; for what only a fast lift
// does, with none given never past it.
inline double liftPast(double velocity, double from = 0.6) {
  const double v = liftSpeed(velocity);
  return v > from ? (v - from) / (1 - from) : 0;
}

// A hand or mallet touching what rings for a moment after a fast lift: while it touches, every
// sample scales the vibration's state (both of a two-pole mode's, so it keeps its pitch) by r, a
// loss of `sigma` per second at the fastest lift and none below `from`.
struct LiftTouch {
  double r = 1;
  int left = 0; // samples it still touches
  void start(double velocity, double sigma, double seconds, double fs, double from = 0.6) {
    const double past = liftPast(velocity, from);
    if (past <= 0) return;
    r = fdlibm::exp(-sigma * past / fs);
    left = (int)(seconds * fs);
  }
  void stop() { left = 0; r = 1; }
  bool on() const { return left > 0; }
  // the next sample's factor
  double step() { if (left <= 0) return 1; if (--left == 0) { const double x = r; r = 1; return x; } return r; }
};

} // namespace forte
