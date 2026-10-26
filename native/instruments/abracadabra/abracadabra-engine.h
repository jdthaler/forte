// abracadabra-engine.h — the real-time part, on the engine contract (forte/engine.h). Every key has
// its own axion field (abracadabra-model.h Field), alive whether the key is down or not; a key
// charges its toroid, and the voice is what the SQUID then reads: the field's flux through the
// pickup, mixed down to the key's note, and the SQUID's noise in a channel around it.
#pragma once

#include <array>

#include "forte/engine.h"
#include "forte/expression.h"
#include "abracadabra-model.h"
#include "abracadabra-params.h"

namespace forte::abracadabra {

// Messages to the page: every voice's state, a few times a second (kFrame); the last key struck,
// mixed down to its axion's frequency, as complex samples (kBase).
enum MessageType : uint16_t { kFrame = 0, kBase = 1 };
constexpr int FRAME_VOICES = 6; // voices a frame carries (five numbers each)
constexpr int BASE_SAMPLES = 14; // complex samples a kBase message carries
constexpr double BASE_RATE = 64; // their rate, about (Hz)

class AbracadabraEngine : public Engine {
 public:
  explicit AbracadabraEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void slide(double value, int key) override { expr.setSlide(value, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

 private:
  static constexpr int kMaxVoices = 24;
  static constexpr int FIRST = 21, KEYS = 88;
  static constexpr int WAVES = MAX_WAVES + STREAM_WAVES;
  // A key's field as the engine plays it: its waves' phases as phasors, valid at time t, and their
  // rotation over one control step (b samples) for the speeds and frequency they were built for.
  struct KeyField {
    Field f;
    std::array<double, WAVES> pr{}, pi{}, rr{}, ri{};
    double t = 0;
    bool built = false;
    double fa = 0, v0 = 0, vs = 0;
    int b = 0, halo = 0, stream = 0, steps = 0;
  };
  struct Voice {
    bool active = false, held = false, closing = false;
    int key = 0, halo = MAX_WAVES, stream = STREAM_WAVES;
    uint32_t order = 0;
    double vel = 0, frac = 0, rel = 0, relT = 0.005, gain = 0;
    double gl = 0, gr = 0;
    double z0r = 0, z0i = 0, z1r = 0, z1i = 0; int pos = 0, b = 32; // the field at the step's ends
    double cr = 1, ci = 0;            // the carrier, e^{iωt}
    double nx1 = 0, nx2 = 0, ny1 = 0, ny2 = 0; // the channel's band-pass
  };
  double faOf(int key) const;   // the key's axion frequency (Hz): SCALE × its tuned note
  void advance(KeyField &k, double t, const FieldShape &s, double fa); // carry the phases on to t
  void build(KeyField &k, const FieldShape &s, double fa); // the rotations for a control step
  void step(Voice &v, KeyField &k, const FieldShape &s, double fa); // z at the next control point
  FieldShape shapeOf(const Voice &v) const;
  void play(Voice &v, float *L, float *R, int n);
  void frame();
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  double now = 0, toFrame = 0;
  uint32_t order = 0;
  Rng rng;
  NoteExpression expr{0};
  std::array<KeyField, KEYS> fields;
  std::array<Voice, KEYS> voices;
  // the baseband of the last key struck, for the page's search view
  int focus = -1, baseN = 0, baseD = 750, baseK = 0;
  double baseR = 0, baseI = 0;
  float base[2 * BASE_SAMPLES] = {};
};

} // namespace forte::abracadabra
