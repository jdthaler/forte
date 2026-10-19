// ring-engine.h — the real-time part, on the engine contract
// (forte/engine.h). A voice is one ring with one bunch: once a turn it queues that turn's
// Gaussian pulse, with its charge, arrival time and dipole; every sample the electrodes sum them.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "ring-model.h"
#include "ring-params.h"

namespace forte::ring {

class StorageRingEngine : public Engine {
 public:
  explicit StorageRingEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void pressure(double value, int key) override;
  void allNotesOff() override { voices.clear(); }
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override;

 private:
  static constexpr int kMaxVoices = 32;
  static constexpr int SLOTS = 8;
  struct Voice {
    int key = 0;
    std::array<double, SLOTS> pt{}, pw{}, pd{}, pk{}, pr{}; // queued pulses: arrival, height, dipole, 1/(2σ²), reach
    int head = 0, count = 0;
    double t = 0, next = 0, T = 0;   // samples: now, the next turn's nominal arrival, a turn
    double press = 0, pressTarget = 0;
    double charge = 0, Z = 0, theta = 0, phiS = 0, phiB = 0, logX = 0, logS = 0;
    bool released = false, scraped = false;
    double hl0 = 0, hl1 = 0, hr0 = 0, hr1 = 0; // the buttons' high-pass states
    void inject(double velocity, const double *P);
    void schedule(const double *P, const forte::Tuning &tuning, double fs);
  };
  std::array<double, p::count> P{};
  forte::Tuning tuning; // the keyboard's (tuningOf(P)): each ring's f_rev, followed live
  bool hasParams = false, sustain = false;
  std::vector<Voice> voices; // reserved: never reallocates
};

} // namespace forte::ring
