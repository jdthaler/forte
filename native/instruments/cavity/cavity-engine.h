// cavity-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// key's cavity: each of its modes a complex amplitude turning at the mode's frequency and decaying
// at its loaded Q, kicked by each bunch that passes, and heard through the end cells' probes.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "cavity-model.h"
#include "cavity-params.h"

namespace forte::cavity {

// Messages to the page: the accelerating passband's field in each cell, and every mode's level.
enum MessageType : uint16_t { kCells = 0, kModes = 1 };

class CavityBellsEngine : public Engine {
 public:
  explicit CavityBellsEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void pressure(double value, int key) override;
  void bend(double value) override;
  void allNotesOff() override { voices.clear(); }
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override;

 private:
  static constexpr int kMaxVoices = 24;
  struct Voice {
    int key = 0;
    Cavity cav;
    std::array<double, MAX_MODES> ar{}, ai{}, rr{}, ri{}, w{}; // amplitude, a sample's turn, ω per sample
    std::array<bool, MAX_MODES> on{};                            // modes still ringing
    double charge = 0;          // the key's bunch charge (its velocity)
    double press = 0, pressTarget = 0;
    double toNext = 0;          // samples to the train's next bunch
    double det = 0, det1 = 0;   // the walls' detuning (cents) and its last value: the mechanical mode
    double quenchLeft = 0;      // s still normal-conducting after a quench
    double peak = 0;            // the highest cell field, in a full-velocity bunch's
    bool held = true, released = false, damped = false, quenched = false, stolen = false;
    void kick(double q, double frac);
  };
  void retune(Voice &v, int count);
  void report(const Voice &v);
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  int version = 0, focus = -1;
  double bendTo = 1, bendNow = 1;
  int sinceReport = 0;
  std::vector<Voice> voices; // reserved (twice kMaxVoices, for the stolen ones fading out): never reallocates
};

} // namespace forte::cavity
