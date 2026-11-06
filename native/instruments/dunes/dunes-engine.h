// dunes-engine.h — the Singing Dunes on the engine contract (forte/engine.h).
//
//   a key: an avalanche down the slip face, its speed U set by the velocity (squared) and pushed
//   up by the mod wheel, aftertouch or MPE slide; it runs up in a tenth of a second and, once the
//   key is up, slows at a constant rate (friction) to rest in the stopping time.
//   the grains: a Population of patches (dunes-model.h) at the key's shear rate, coupled by K(U):
//   each push is a pulse from a band-limited table (the collision's length sets its harmonics);
//   the patches lie across the face, even ones heard more on the left, odd ones on the right, so
//   a rumble is wide and a song, in step, is centred. Their level grows with U.
//   the layer: a white rattle, as loud as U, through the waveguide's modes at n × the note, each
//   with the layer's Q, mode n excited as 1/n.
//   the hiss: one noise for the whole face, each side its own, as loud as the sum of U^1.5,
//   band-passed to the rustle of sliding grains.
//
// With V8's fdlibm for exp, sin and cos, so the WebAssembly and the plugins play alike. Every table
// is built in setParams; nothing is allocated after construction.
#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "forte/dsp.h"
#include "forte/engine.h"
#include "forte/lift.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "dunes-model.h"
#include "dunes-params.h"

namespace forte::dunes {

namespace msg {
enum : uint16_t {
  state = 1, // the focused key: R, ψ, K/K_c, U, onset U, theory, patches, then up to 23 phases
};
}

struct Voice {
  bool on = false, held = false, dying = false;
  int key = 0, mip = 0, modes = 0, layer = 0; // layer: the theory it was struck in
  int64_t born = 0;
  double f0 = 0, vel = 0, after = 0, push = 0;
  double U = 0, target = 0, brake = 0; // m/s, and its fall a second once let go
  double drive = 0;                    // K / K_c, for the views
  double surge = 0, surge0 = 0;                  // the speed's wander, a fraction
  Population pop;
  struct Mode { double a1 = 0, a2 = 0, g = 0, y1 = 0, y2 = 0; };
  std::array<Mode, LAYER_MODES> mode;
  uint32_t seed = 1;
};

class DunesEngine : public Engine {
 public:
  static constexpr int kKeys = 88;
  explicit DunesEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override;
  void slide(double value, int key) override;
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // read by the tests (dunes-web.cpp)
  const Voice *voiceOf(int key) const { return key >= 21 && key <= 108 && voices[key - 21].on ? &voices[key - 21] : nullptr; }
  int patches() const { return pick(MAX_GRAINS, 14, 8); }
  int layerModes() const { return pick(LAYER_MODES, 4, 2); }

 private:
  void buildTables();
  void start(Voice &v);
  void retune(Voice &v);
  void setTarget(Voice &v);
  void report();
  int maxVoices() const { return pick(24, 12, 6); }

  std::array<double, p::count> P{};
  bool hasP = false;
  forte::Tuning keyboard;
  int theory = 0;
  double spread = 0, water = 0, contact = 0.25, speed = 1, push = 0, stopT = 0.5, hiss = 0.3, layerQ = 30;
  double kc = 1;                 // K_c over ω₀ for this sand
  double onset = U_ONSET;        // m/s: the speed it starts to sing at
  double tableContact = -1;
  std::vector<float> tables;     // [mip][TABLE + 1]: the collision pulse, 32 … 1 harmonics
  NoteExpression expr{0};
  std::array<Voice, kKeys> voices;
  int64_t t = 0;
  int focus = -1, tick = 0;
  uint32_t hissSeed = 0x9e3779b9u;
  Biquad hissL[2], hissR[2];
};

} // namespace forte::dunes
