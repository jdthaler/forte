// tess-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// key's planet: its light curve over one year as a band-limited table (the Fourier series of
// tess-model.h, cut at the top of hearing), read at the note's frequency, with the star's photon
// noise. A change to the parameters rebuilds the tables, a voice a block, each crossfaded.
#pragma once

#include <array>
#include <vector>

#include "forte/dsp.h"
#include "forte/engine.h"
#include "forte/fft.h"
#include "tess-model.h"
#include "tess-params.h"

namespace forte::tess {

constexpr int TABLE = 4096; // samples in a voice's table: one year
constexpr int MAX_H = TABLE / 2 - 1;

class TessEngine : public Engine {
 public:
  explicit TessEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override { for (Voice &v : voices) v.active = false; }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;
  // what the tests read
  int harmonicsOf(int key) const;

 private:
  static constexpr int kMaxVoices = 48;
  struct Voice {
    bool active = false, held = false, ending = false;
    int key = 0, H = 1, cur = 0, built = -1;
    uint64_t age = 0;
    double vel = 0, gl = 0, gr = 0, phase = 0, inc = 0;
    double gain = 0, sigma = 0, quietFrom = 0.5, quietTo = 0.5; // the out-of-transit stretch of the year
    double env = 1, envStep = 0;                                 // a fade, where the year has no quiet stretch
    float *table[2] = {nullptr, nullptr};
  };
  void build(Voice &v, float *into);
  void end(Voice &v);
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  int version = 0, next = 0;
  uint64_t clock = 0;
  Occultation occ;
  FFT fft{TABLE};
  std::vector<std::complex<double>> spectrum;
  std::vector<double> coef;
  std::vector<float> store;   // every voice's two tables
  std::vector<Voice> voices;  // kMaxVoices of them, active or not: never reallocates
  DCBlock dcL, dcR;
  Rng rng;
};

} // namespace forte::tess
