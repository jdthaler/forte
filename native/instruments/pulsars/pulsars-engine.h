// pulsars-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// pulsar: a turn of its two sub-bands' total power in a table (pulsars-model.h), read at its spin,
// each pulse brighter or fainter than the last. A key going down switches the pulsar on: its first
// pulse comes in down the band (when nothing takes the delays out) and its scattering tail fills
// in. A key let go switches it off the same way. When a parameter that shapes the pulses changes
// (the mod wheel's DM), each sounding pulsar's table is rebuilt in turn and crossfaded.
#pragma once

#include <array>
#include <memory>
#include <optional>
#include <vector>

#include "forte/engine.h"
#include "forte/lift.h"
#include "forte/expression.h"
#include "pulsars-model.h"
#include "pulsars-params.h"

namespace forte::pulsars {

// Messages to the page: a pulsar switching on (its geometry and its way here).
enum MessageType : uint16_t { kPulsar = 0 };
constexpr int REBUILD = 512;   // samples: one sounding pulsar's table may be rebuilt this often
constexpr double FLOOR_T = 0.0015; // s: the shortest switch on or off (no click)

class PulsarsEngine : public Engine {
 public:
  explicit PulsarsEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void slide(double value, int key) override;
  void allNotesOff() override;
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;
  // for the tests: how many harmonics the newest voice's table holds, and its size
  int harmonicsOf(int key) const;
  int tableSizeOf(int key) const;

 private:
  static constexpr int kMaxVoices = 32;
  static constexpr int kSlots = 2 * kMaxVoices + 2; // stolen voices fading out keep theirs
  struct Voice {
    int key = 0, slot = -1;
    Setup setup;
    double vel = 0, inc = 0, phase = 0;
    double aPrev = 1, aNext = 1;            // the pulses' brightness (jitter), from one to the next
    double t = 0, tOff = -1;                // s since it switched on, and when it switched off
    double envL = 0, envR = 0, kL = 0, kR = 0; // each sub-band's level, and its step toward the target
    int xf = 0, cur = 0;                    // crossfade samples left; the table playing (0 or 1)
    Tables tab[2];
    bool held = true, stolen = false;
    double lg = 1, lgStep = 0;              // a lift's fade (forte/lift.h): the gain, and its step a sample
  };
  void fill(Voice &v, int which);            // (re)build one of the voice's tables from its setup
  void startXf(Voice &v);
  double desiredDm(const Voice &v) const;
  void run(Voice &v, float *L, float *R, int n);
  int freeSlot();
  std::array<double, p::count> P{};
  bool hasParams = false;
  NoteExpression expr{0};
  Rng rng;
  std::array<std::optional<Builder>, 3> builders; // High, Medium and Low's table sizes (made when first needed)
  std::array<std::unique_ptr<float[]>, kSlots> pool; // each slot's 2 tables × 2 sub-bands × (NTAB + 1), made when first used
  std::array<bool, kSlots> used{};
  std::vector<Voice> voices;                // reserved: never reallocates
  long long clock = 0;                      // samples played
  int nextCheck = 0;                        // the voice to look at next for a stale table
  double topHz = 20000;
};

} // namespace forte::pulsars
