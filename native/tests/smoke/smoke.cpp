// smoke.cpp — a test instrument for the shared plugin (tests/plugin-tests.cpp): struck sines,
// a pedal, a mod wheel, two parameters, a compass, a preset, and one voice at Low quality. It
// proved the plugin pipeline in CI until the template was ported; it is not built as a plugin.

#include <cmath>
#include <numbers>
#include <vector>

#include "forte/instrument.h"

namespace {

using namespace forte;

enum { kDecay, kVolume, kFullRange, kCount };
const FormatSegment kSeconds[] = {{INFINITY, "", " s", 1, 0, 2, false, false, false, false}};
const FormatSegment kDb[] = {{0.0005, "", " dB", 0, -60, 1, false, false, false, false}, {INFINITY, "", " dB", 20, 0, 1, true, false, false, false}};
const ParamInfo kParams[kCount] = {
  {"decay", "Ring time", "Tone", ParamKind::continuous, 0.1, 10, 1, 0, true, true, nullptr, 0, kSeconds, 1},
  {"volume", "Volume", "Output", ParamKind::continuous, 0, 2, 0.8, 0.01, false, true, nullptr, 0, kDb, 2},
  {"fullRange", "Full range", "Keys", ParamKind::toggle, 0, 1, 0, 1, false, false, nullptr, 0, nullptr, 0},
};
const PresetValue kLong[] = {{kDecay, 6}};
const Preset kPresets[] = {{"Long ring", kLong, 1}};
const uint16_t kKeep[] = {kVolume};

class SmokeEngine : public Engine {
 public:
  explicit SmokeEngine(double fs) : Engine(fs) { voices.reserve(32); }
  void setParams(const double *P) override { decay = P[kDecay]; } // the volume is the chain's
  void noteOn(int key, double velocity) override {
    double f = 440 * std::pow(2.0, (key - 69) / 12.0), w = 2 * std::numbers::pi * f / fs;
    if ((int)voices.size() < pick(32, 8, 1)) voices.push_back({w, 0, 0.2 * velocity, std::exp(-6.9 / (decay * fs)), key}); // Quality: fewer voices
  }
  void noteOff(int key, double) override { for (auto &v : voices) if (v.key == key) { v.off = true; if (!sustain) damp(v); } }
  void setSustain(bool on) override { sustain = on; if (!on) for (auto &v : voices) if (v.off) damp(v); }
  void allNotesOff() override { voices.clear(); }
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override {
    for (int i = 0; i < n; i++) {
      double s = 0;
      for (auto &v : voices) { s += v.a * std::sin(v.ph); v.ph += v.w; v.a *= v.r; }
      L[i] = R[i] = (float)s;
    }
    std::erase_if(voices, [](const Voice &v) { return v.a < 1e-5; });
  }

 private:
  struct Voice { double w, ph, a, r; int key; bool off = false; };
  void damp(Voice &v) { v.r = std::exp(-6.9 / (0.1 * fs)); }
  std::vector<Voice> voices;
  bool sustain = false;
  double decay = 1;
};

const InstrumentInfo kInfo = {
  .slug = "smoke", .name = "Forte Smoke Test", .version = "0.0.1", .description = "CI-only: proves the plugin pipeline.", .auSubtype = "Smok",
  .vst3Id = {0x46, 0x6f, 0x72, 0x74, 0x65, 0x53, 0x6d, 0x6f, 0x6b, 0x65, 0x54, 0x65, 0x73, 0x74, 0x00, 0x01},
  .params = kParams, .paramCount = kCount, .presets = kPresets, .presetCount = 1, .keep = kKeep, .keepCount = 1,
  .keyLo = 21, .keyHi = 108, .compassLo = 36, .compassHi = 96, .compass = kFullRange, .space = Space::sustain, .modWheel = kDecay, .modWheelMax = 10,
  .chain = {.volume = kVolume},
  .create = [](double fs) -> Engine * { return new SmokeEngine(fs); },
};

} // namespace

const forte::InstrumentInfo &forte_instrument() { return kInfo; }
