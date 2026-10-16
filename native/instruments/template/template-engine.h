// template-engine.h — the real-time part (docs/template/src/template-engine.js in C++), on the
// engine contract (forte/engine.h). Struck bars: each key's modes, impulse-invariant resonators.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "template-model.h"
#include "template-params.h"

namespace forte::template_ {

class TemplateEngine : public Engine {
 public:
  explicit TemplateEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override { voices.clear(); }
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override;

 private:
  static constexpr int kMaxVoices = 48;
  struct Resonator { double a1, a2, b, amp, w, y1 = 0, y2 = 0; };
  struct Voice {
    int key = 0;
    std::array<Resonator, BETA_L.size()> modes;
    int count = 0;
    double gl = 0, gr = 0, level = 1;
    bool released = false, damped = false;
    void strike(double velocity, double fs);
    double run();
  };
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  std::vector<Voice> voices; // reserved: never reallocates
};

} // namespace forte::template_
