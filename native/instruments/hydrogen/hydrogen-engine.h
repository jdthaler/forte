// hydrogen-engine.h — the real-time part, on the engine contract (forte/engine.h). A key lights a
// tube of hydrogen while it is down. Its lines are the glow's step response (hydrogen-model.h
// Glow, shared by every key: the cascade is linear), switched on at the key and off at its
// release, each played at its exact ratio to Hα with Hα on the key's note. A line is the light of
// many atoms with random phases: a tone whose amplitude and phase wander as a complex Gaussian
// process as wide as the line (Ornstein–Uhlenbeck, so the line's shape is a Lorentzian of that
// width), the width being its levels' decay rates in slow motion, the atoms' thermal Doppler shifts
// and the Stark effect of the ions around them. A released lamp's light also goes through a
// shutter that closes over the Shutter time (real time, not the atoms'): not physics, an ending.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "forte/expression.h"
#include "hydrogen-model.h"
#include "hydrogen-params.h"

namespace forte::hydrogen {

class HydrogenEngine : public Engine {
 public:
  explicit HydrogenEngine(double fs);
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
  // what the tests read
  int oscillatorsOf(int key) const;
  double gainOf(int key) const;
  const Glow &glow() const { return glows[live]; }

  static constexpr int SUB = 64;        // samples between the lines' updates
  static constexpr int MAX_OSC = 96;    // lines (or fine-structure components) a voice plays, at High

 private:
  static constexpr int kMaxVoices = 32;
  struct Osc {
    int kept = 0;               // its line among the glow's kept ones
    int line = 0;
    double weight = 1;          // its share of the line's power (a fine-structure component's)
    double ratio = 1;           // its frequency over the key's note (Hα's)
    double lambda = 0;          // its rest wavelength, nm
    double win = 1;             // the window's gain at its (bent) wavelength
    double nat = 0;             // natural FWHM, Hz in the atom's time
    double stark = 0;           // Stark FWHM over frequency at unit density^(2/3)
    double zr = 1, zi = 0, cr = 1, ci = 0; // phasor, and its turn a sample
    double ar = 1, ai = 0;      // the atoms' complex amplitude (mean |a|² = 1)
    double br = 0, bi = 0, dr = 0, di = 0; // its gain now, and its step a sample
    double rho = 1;             // the amplitude's correlation over SUB samples
  };
  struct Voice {
    bool active = false, held = false, lit = false;
    int key = 0, count = 0, glow = 0;
    uint64_t age = 0;
    double gain = 0, gl = 0, gr = 0;
    double t = 0, tOff = -1;    // the atom's time since the key (s), and at its release
    double bendNow = 1, density = 0, fKey = 0;
    double peak = 0;            // the steady power its lines sum to (for when it has faded)
    double peakNorm = 0;        // the steady power its gain is normalised to
    double shut = 1;            // the shutter's gain: 1 while lit, closing after the release
    std::array<Osc, MAX_OSC> osc;
  };
  void light(Voice &v, double velocity);
  void retune(Voice &v, double b);
  void widths(Voice &v);
  void update(Voice &v);
  void report();
  int lampChanged();
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  double wheel = 1;
  int live = 0;
  uint64_t clock = 0;
  int sub = 0;                  // samples until the next update
  int reportIn = 0;
  std::array<Glow, 3> glows;
  std::vector<Voice> voices;    // kMaxVoices of them: never reallocates
  NoteExpression expr{48};
  Rng rng;
  std::vector<double> lineSum;  // for the page's report
};

} // namespace forte::hydrogen
