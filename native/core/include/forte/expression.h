// expression.h — what an engine keeps of each note's own expression (engine.h noteBend and slide,
// from MPE: forte/mpe.h): per key, so a note struck after them starts there, and a glide toward
// them for a note that sounds, as the pitch wheel's.
#pragma once

#include <cmath>

#include "forte/fdlibm.h"

namespace forte {

struct NoteExpression {
  double bend[128];  // frequency ratios (1: none)
  double slide[128]; // the mod wheel's parameter (NaN: the parameter's own)
  double lo, hi;     // the ratios the instrument bends between

  explicit NoteExpression(double maxSemitones) : lo(fdlibm::pow(2.0, -maxSemitones / 12)), hi(fdlibm::pow(2.0, maxSemitones / 12)) {
    for (int k = 0; k < 128; k++) { bend[k] = 1; slide[k] = NAN; }
  }
  void setBend(double r, int key) {
    if (key < 0 || key > 127 || !(r > 0)) return;
    bend[key] = r < lo ? lo : r > hi ? hi : r;
  }
  void setSlide(double v, int key) { if (key >= 0 && key < 128) slide[key] = v; }
  double bendOf(int key) const { return key >= 0 && key < 128 ? bend[key] : 1; }
  // the key's slide, or the parameter's own value
  double slideOr(int key, double own) const { return key >= 0 && key < 128 && slide[key] == slide[key] ? slide[key] : own; }
};

// One step of a glide from `now` toward `to`, by 1 − e^(−dt/τ) (dt and τ in seconds), as the
// engines glide the pitch wheel (fdlibm: the same in the WebAssembly and the plugins); it lands
// once within 1e-9.
inline double glideTo(double now, double to, double dt, double tau) {
  if (now == to) return to;
  now += (to - now) * (1 - fdlibm::exp(-dt / tau));
  return std::fabs(now - to) < 1e-9 ? to : now;
}

} // namespace forte
