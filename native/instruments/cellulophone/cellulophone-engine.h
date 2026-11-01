// cellulophone-engine.h — the Cellulophone on the engine contract (forte/engine.h).
//
//   the motor: one speed for every disc (octave o's turns 2^(o−4) as fast as octave 4's), hunting
//   slowly about its mean and following pitch bend through the discs' inertia.
//   a key: its ring of slots on its octave's disc, read through its window's screen. The light is a
//   band-limited table of a · (T ⊛ box_a) for the screen and slot width, and another for the screen
//   with the push screen's slit stacked on it; a key's push mixes the two. Each slot passing carries
//   its own cutting error (width and place). The key's mirror sweeps across a round beam spot as it
//   tilts in or out; the depth screen sets how much of the beam it gets; a damping arc narrows it away.
//   the light: the tremolo screen and the lamps' flicker on it all; each octave's light on its own
//   cell (a potassium cell's current is the light; selenium's is slow and goes as L^0.6).
//   the output: the coupling capacitor (no DC: the notes' steady light leaves only its steps), the
//   valve amplifier's soft limit and the loudspeaker. One loudspeaker: the output is mono.
//
// With V8's fdlibm for exp, pow, sin and cos, so the WebAssembly and the plugins play alike. Every
// table is built in setParams; nothing is allocated after construction.
#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "forte/dsp.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "cellulophone-model.h"
#include "cellulophone-params.h"

namespace forte::cellulophone {

struct Voice {
  bool on = false, held = false, dying = false; // dying: let go by Quality's cap
  int key = 0, octave = 0, pc = 0, slots = 1, mip = 0, screen = 0;
  int64_t born = 0;
  double vel = 0, after = 0, depth = 0, depthNow = 0, push = 0, pushNow = 0;
  double mirror = 0, rise = 0, fall = 0; // the mirror's place across the spot (0 out, 1 in) and its steps a sample
  double arc = 1, arcStep = 0;           // the damping arc: the slot's length left
  int slot = -1;                         // the slot now in the window, and its cutting errors
  double eps = 0, shift = 0, offset = 0; // width (light × 1 + eps), place (fraction of the pitch), the ring's first slot
};

class CellulophoneEngine : public Engine {
 public:
  static constexpr int kKeys = 88;
  explicit CellulophoneEngine(double fs);
  void setParams(const double *P) override;
  void setQuality(Quality q) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override;
  void bend(double value) override;
  void slide(double value, int key) override;
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // read by the tests (cellulophone-web.cpp)
  int tap = 0;          // 0: the output; 1: the cells' current (before the coupling capacitor)
  double cents = 0;     // the motor's speed now, in cents from its set speed
  Note noteOf(int key) const { return keyNote(key, c0, keyTarget); }

 private:
  void buildTables();
  void start(Voice &v);
  double mirrorLight(double m) const;
  int maxVoices() const { return pick(kKeys, 24, 12); }

  std::array<double, p::count> P{};
  bool hasP = false;
  double keyTarget[128] = {};
  forte::Tuning keyboard;
  int c0 = 54;
  double turns4 = 1;                     // the octave-4 disc's turns a second at the set speed
  double theta[OCTAVES] = {};            // each disc's angle (turns)
  // the tables: [screen][plain, slit][mip][TABLE + 1]
  std::vector<float> tables;
  double tableSlot = -1;
  double slotW = 0.06, wear = 0, hunt = 0, touch = 0.7, mirrorT = 0.008, damping = 0, push = 0;
  double tremolo = 0, tremRate = 9, tremPhase = 0, flick = 0, mainsHz = 0, mainsPhase = 0, huntPhase = 0;
  int screen = 1, cell = 0, speaker = 0;
  double drive = 0.15;
  double bendCents = 0, bendNow = 0;
  NoteExpression expr{0};
  std::array<Voice, kKeys> voices;
  int64_t t = 0;
  // the selenium cells: each octave's fast and slow parts
  double selFast[OCTAVES] = {}, selSlow[OCTAVES] = {}, kFast = 0, kSlow = 0;
  DCBlock coupling;
  Biquad spk[3];
  int spkCount = 0;
};

} // namespace forte::cellulophone
