// smoke.cpp — a CI-only instrument that proves the plugin pipeline before any real one is
// ported: struck sine partials, two parameters, a preset. Never shipped.

#include <cmath>
#include <numbers>
#include <vector>

#include "forte/instrument.h"

namespace {

using namespace forte;

enum { kDecay, kVolume, kCount };
const ParamInfo kParams[kCount] = {
  {"decay", "Ring time", "Tone", ParamKind::continuous, 0.1, 10, 1, 0, true, true, nullptr, 0, {"", " s", 1, 0, 2}},
  {"volume", "Volume", "Output", ParamKind::continuous, 0, 2, 0.8, 0.01, false, true, nullptr, 0, {"", " dB", 20, 0, 1, true, 1e-3}},
};
const PresetValue kLong[] = {{kDecay, 6}};
const Preset kPresets[] = {{"Long ring", kLong, 1}};
const uint16_t kKeep[] = {kVolume};

class SmokeEngine : public Engine {
 public:
  explicit SmokeEngine(double fs) : Engine(fs) { voices.reserve(32); }
  void setParams(const double *P) override { decay = P[kDecay]; volume = P[kVolume]; }
  void noteOn(int key, double velocity) override {
    double f = 440 * std::pow(2.0, (key - 69) / 12.0), w = 2 * std::numbers::pi * f / fs;
    if (voices.size() < voices.capacity()) voices.push_back({w, 0, 0.2 * velocity, std::exp(-6.9 / (decay * fs)), key});
  }
  void noteOff(int key, double) override { for (auto &v : voices) if (v.key == key) v.r = std::exp(-6.9 / (0.1 * fs)); }
  void allNotesOff() override { voices.clear(); }
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override {
    for (int i = 0; i < n; i++) {
      double s = 0;
      for (auto &v : voices) { s += v.a * std::sin(v.ph); v.ph += v.w; v.a *= v.r; }
      L[i] = R[i] = (float)(volume * s);
    }
    std::erase_if(voices, [](const Voice &v) { return v.a < 1e-5; });
  }

 private:
  struct Voice { double w, ph, a, r; int key; };
  std::vector<Voice> voices;
  double decay = 1, volume = 0.8;
};

const InstrumentInfo kInfo = {
  "smoke", "Forte Smoke Test", "0.0.1", "CI-only: proves the plugin pipeline.", "Smok",
  {0x46, 0x6f, 0x72, 0x74, 0x65, 0x53, 0x6d, 0x6f, 0x6b, 0x65, 0x54, 0x65, 0x73, 0x74, 0x00, 0x01},
  kParams, kCount, kPresets, 1, kKeep, 1,
  21, 108, Space::sustain, kDecay, 10, {kVolume}, nullptr,
  [](double fs) -> Engine * { return new SmokeEngine(fs); },
};

} // namespace

const forte::InstrumentInfo &forte_instrument() { return kInfo; }
