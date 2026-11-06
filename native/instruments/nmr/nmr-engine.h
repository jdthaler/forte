// nmr-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one key's
// sample after its pulse: the order −1 coherences of its spins (nmr-model.h), heard as lines that
// precess at their own frequencies, under one envelope for what the spins share: T₂, the field's
// spread (dephasing, which π pulses undo), diffusion through it, and the field's offset (the
// pitch wheel). The pedal fires π pulses at every sounding sample; each key's magnetisation along
// the field (T₁) is kept between its notes.
#pragma once

#include <array>
#include <complex>
#include <memory>
#include <vector>

#include "forte/engine.h"
#include "forte/lift.h"
#include "forte/expression.h"
#include "nmr-model.h"
#include "nmr-params.h"

namespace forte::nmr {

// Messages to the page: a key struck (its pulse); every voice's state, 30 times a second; a π
// pulse and what it did to each sample's magnetisation; a voice's end.
enum MessageType : uint16_t { kStrike = 0, kFrame = 1, kPulse = 2, kEnd = 3 };
constexpr int FRAME_VOICES = 5; // voices a frame carries (six numbers each)

class NmrEngine : public Engine {
 public:
  explicit NmrEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // the tests: π pulses fired, a key's magnetisation along the field now (in units of its
  // equilibrium), and the lines its sounding voice plays
  int pulses = 0;
  double mzOf(int key) const;
  int linesOf(int key) const;

 private:
  static constexpr int kPool = 32;
  struct Voice {
    bool on = false, held = true, fading = false, receiving = true;
    double closeT = 0; // how fast the receiver closes after this lift, s (0: as usual; forte/lift.h)
    int key = 0, nl = 0;
    double amp = 0, age = 0, t0 = 0, S = 0, D = 0, phi = 0, gate = 0, rel = 1, bendNow = 1, peak = 0;
    double nyL = 0, nyR = 0; // the noise's low-pass
    std::array<std::complex<double>, MAX_ELEMS> x{};
    std::array<int16_t, MAX_LINES> slot{};               // the key's line → the voice's, or −1
    std::array<double, MAX_LINES> w{};                   // rad/s
    std::array<std::complex<double>, MAX_LINES> a{}, r{}; // amplitude at t0; a sample's turn
  };
  const KeySystem &system(int key);
  void lines(Voice &v);
  void pulse();
  void play(Voice &v, float *L, float *R, int n);
  void frame();
  double recovered(int key) const;
  std::array<double, p::count> P{};
  bool hasParams = false, pedal = false, pending = false;
  double wheel = 1, wheelTarget = 1, toPulse = 0, toFrame = 0, clock = 0;
  uint32_t seed = 0x2545f491u;
  std::array<std::unique_ptr<KeySystem>, 128> sys{};
  std::array<int, 128> sysSample{};
  std::array<double, 128> sysF0{}, mz{}, mzT{};
  std::array<std::complex<double>, MAX_ELEMS> scratch{};
  NoteExpression expr{48};
  std::vector<Voice> voices; // kPool of them, on or not: never reallocates
};

} // namespace forte::nmr
