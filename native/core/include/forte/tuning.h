// tuning.h — the keyboard's tuning, shared by every instrument: shared/tuning.js in C++. A pitch
// standard (A4 in Hz), a temperament built on a root key, and a custom temperament that a Scala
// file (.scl) can fill. Every instrument has these parameters (its params.h's tuningOf gives the
// Tuning they make); its model multiplies each key's equal-tempered frequency by ratio(key), which
// is exactly 1 at the defaults, so an instrument sounds as it did until its tuning changes.
#pragma once

#include <cmath>
#include <string>

namespace forte {

// The pitch standards, in the order of the Pitch choice (shared/tuning.js PITCHES).
inline constexpr double kPitches[] = {440, 415, 392, 422.5, 430, 435, 442, 443, 466};
inline constexpr int kPitchCount = (int)(sizeof kPitches / sizeof kPitches[0]);

// The temperaments, in the order of the Temperament choice (shared/tuning.js TEMPERAMENTS).
namespace temperament {
enum : int { equal, meantone, werckmeister, sixth, kirnberger, vallotti, young, pythagorean, just, custom, count };
}
inline constexpr int kCustomCents = 11;   // the custom temperament's notes above the root
inline constexpr double kCentsRange = 100; // each within this of equal temperament

// Each note's place above the root (cents, 0 … 1200) in a temperament other than custom.
void temperamentCents(int id, double (&cents)[12]);

struct Tuning {
  double cents[12] = {}; // each pitch class's departure from equal temperament at A = 440 Hz, C first
  double r[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}; // the same as frequency ratios
  bool equal = true;     // every ratio exactly 1: equal temperament at A = 440 Hz

  // A key's frequency over equal temperament's at A = 440 Hz.
  double ratio(int key) const { return r[((key % 12) + 12) % 12]; }
  // Between keys (a glide), the cents in between.
  double ratio(double m) const {
    const double k = std::floor(m), t = m - k;
    if (t == 0) return ratio((int)k);
    return std::pow(ratio((int)k), 1 - t) * std::pow(ratio((int)k + 1), t);
  }
  double offset(int key) const { return cents[((key % 12) + 12) % 12]; } // cents
  bool operator==(const Tuning &o) const;
};

// The tuning of the parameters' values: the Pitch choice's index, the Temperament choice's index,
// the root (0 = C … 11 = B) and the custom temperament's eleven cents (used only by custom).
Tuning makeTuning(double pitch, double temperament, double root, const double (&custom)[kCustomCents]);

// A Scala file's text, read as shared/tuning.js readScala reads it: true and the custom cents and
// its description, or false and why not.
bool readScala(const std::string &text, double (&cents)[kCustomCents], std::string &name, std::string &error);

} // namespace forte
