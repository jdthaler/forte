// cuore-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// key's crystal (cuore-model.h): its heater fires a pulse of heat at the key's rate in the
// crystal's own time, and the network is stepped at the sped-up time per sample (ROS2, split at
// each pulse so it lands between samples where it falls). The sound is the thermistor's voltage
// off its rest, through the amplifier, as a share of the digitiser's full scale.
#pragma once

#include <array>
#include <vector>

#include "forte/dsp.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "cuore-model.h"
#include "cuore-params.h"

namespace forte::cuore {

class CuoreEngine : public Engine {
 public:
  explicit CuoreEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override { for (Voice &v : voices) v.active = false; }
  void pressure(double value, int key) override;
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;
  // what the tests read: the substeps a sample takes, and the most crystals that sound at once
  int substeps() const { return sub; }
  int maxVoices() const { return pick(kMaxVoices, 24, 12); }

 private:
  static constexpr int kMaxVoices = 48;
  struct Voice {
    bool active = false, held = false;
    int key = 0, quiet = 0;
    uint64_t age = 0;
    bool firing = false;
    double vel = 0, press = 0, phase = 0, bendNow = 1, gl = 0, gr = 0, sinceEnd = 0;
    double inc = 0, E = 0; // this block's: the heater's phase a sample, and its pulse (J)
    Bolometer::State y{};
  };
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  Bolometer bolo;
  Bolometer::State rest{};
  double speedup = 440, dtReal = 0, scale = 1, chanPress = 0, wheel = 1, wheelTarget = 1;
  int sub = 1, frame = 0;
  uint64_t clock = 0;
  NoteExpression expr{48};
  std::vector<Voice> voices; // kMaxVoices of them, active or not: never reallocates
  DCBlock dcL, dcR;
};

} // namespace forte::cuore
