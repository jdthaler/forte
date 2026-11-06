// planets-engine.h — the real-time part, on the engine contract (forte/engine.h). Each note is the
// planet ringing after one quake, sped up: one oscillator per multiplet, its complex envelope the
// sum of its singlets, turned by the spin at block rate (planets-model.h).
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "forte/lift.h"
#include "forte/expression.h"
#include "forte/press.h"
#include "planets-model.h"
#include "planets-params.h"

namespace forte::planets {

class PlanetEngine : public Engine {
 public:
  static constexpr int MAX_VOICES = 24;
  static constexpr int MAX_MULT = 128;    // multiplets a voice plays (High)
  static constexpr int MAX_COEF = 6144;   // their singlets, per channel
  explicit PlanetEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void bend(double value) override { wheel = value; }
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); }
  void pressure(double value, int key) override { press.set(value, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  struct Osc {
    double w, decay, spinRate; // physical: rad/s, 1/s, rad/s at spin 1
    int l, off;
    double bound;              // Σ|c_m|: the most it can add
    double zr, zi;             // the oscillator (its level and phase)
    double rr, ri;             // its turn per sample, decay included (for the voice's Kc)
    double pr, pi, dr, di;     // the spin's turn e^{iψ}, and its step per block (for Kc, spinC, nC)
    double eL[2], eR[2];       // the envelope at the block's start (re, im)
  };
  struct Voice {
    int key = -1;
    bool on = false, released = false, damped = false, stereo = false;
    double after = 0; // until its next aftershock while its key is pressed, s
    double fall = 0; // its fade a sample after this lift (0: as usual; forte/lift.h)
    double K = 1, spin = 1, level = 1;
    double Kc = 0, spinC = -1; int nC = 0; // what the oscillators' turns were made for
    int count = 0;
    std::array<Osc, MAX_MULT> osc{};
    std::vector<double> cL, cR; // the singlets' coefficients, 2(2l+1) per oscillator
    double peak = 0;            // the strongest oscillator's bound at the start
  };
  // read by the tests (through the WebAssembly's hooks)
  std::array<Voice, MAX_VOICES> voices;

 private:
  void start(Voice &v, int key, double velocity);
  static void envelope(const Voice &v, const Osc &o, double *eL, double *eR);
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false, dirty = true;
  double wheel = 0;
  NoteExpression expr{48};
  Presses press;
  void aftershock(Voice &v, double x);
  Response resp;
  std::vector<int> order;
  long long age = 0;
  std::array<long long, MAX_VOICES> started{};
  std::array<double, 128> bufL{}, bufR{}; // a voice's block, before its level
};

} // namespace forte::planets
