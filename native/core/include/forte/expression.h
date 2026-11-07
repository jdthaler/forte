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

  explicit NoteExpression(double maxSemitones) : NoteExpression(maxSemitones, maxSemitones) {}
  // a reach of its own each way (semitones; 0: none that way), for a note that bends only up or down
  NoteExpression(double down, double up) : lo(fdlibm::pow(2.0, -down / 12)), hi(fdlibm::pow(2.0, up / 12)) {
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

// The keys held, newest last, for an instrument whose one motor, shaft or arc follows a single
// key's own expression: its newest held key's, or once every key is up, the last one let go (so a
// release's tail stays where it was).
struct NewestKey {
  int held[128];
  int n = 0, last = -1;
  void down(int key) {
    if (key < 0 || key > 127) return;
    up(key);
    held[n++] = key; last = key;
  }
  void up(int key) {
    for (int i = 0; i < n; i++) if (held[i] == key) { for (int j = i + 1; j < n; j++) held[j - 1] = held[j]; n--; break; }
    if (n) last = held[n - 1];
  }
  int key() const { return n ? held[n - 1] : last; }
  void clear() { n = 0; } // every key up at once (the last one keeps its place)
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
