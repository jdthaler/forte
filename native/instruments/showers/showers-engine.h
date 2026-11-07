// showers-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// key's crystal: each of its modes a complex amplitude turning at the mode's frequency and decaying
// at the crystal's Q, kicked by each shower that heats it, and heard through the sensor.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/lift.h"
#include "showers-model.h"
#include "showers-params.h"

namespace forte::showers {

// Messages to the page: a shower's deposit in a crystal; the crystals' modes as they ring; a
// pile-up particle landing.
enum MessageType : uint16_t { kShower = 0, kModes = 1, kHit = 2 };
constexpr int PROFILE_BINS = 24;
constexpr int VIEW_LONG = 14; // the modes the page draws
// Pile-up: soft photons whose energy is a share u of the particle energy, dN/du ∝ 1/u² between these
constexpr double PILEUP_LO = 0.003, PILEUP_HI = 0.1;
constexpr double PRESSURE_RATE = 300; // a second: what full key pressure adds to the pile-up

class ColliderShowersEngine : public Engine {
 public:
  explicit ColliderShowersEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void pressure(double value, int key) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); } // the crystal's temperature: its speed of sound
  void slide(double value, int key) override { expr.setSlide(value, key); }    // where its particle lands, off the axis
  void allNotesOff() override { voices.clear(); }
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override;

 private:
  static constexpr int kMaxVoices = 32;
  struct Voice {
    int key = 0;
    Crystal c;
    std::array<double, MAX_MODES> ar{}, ai{}, rr{}, ri{}, w{}; // amplitude, a sample's turn, ω per sample
    std::array<bool, MAX_MODES> on{};                            // modes still ringing
    double gl = 1, gr = 1;      // its place across the row (the keys' pan)
    double press = 0, pressTarget = 0;
    double bent = 1;            // its modes' frequencies over their own: the crystal warmer or cooler (a note's own bend)
    double toNext = 0;          // samples to the next pile-up particle
    double level = 0;           // the sensor's reading's energy, for stealing and ending
    double stat = 0;            // the piezo's static strain, after its preamp's high-pass
    bool held = false, damped = false, stolen = false, done = false;
  };
  Voice *voiceFor(int key);
  void build(Voice &v);
  void kick(Voice &v, const Kicks &k, double scale, double xbar, double frac);
  double impact(int key) const;
  void deposit(int key, const Deposit &d, double energy, double velocity, Particle kind, double offset);
  void report(const Voice &v);
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  forte::NoteExpression expr{0.5}; // each key's own bend (its crystal's speed of sound, a few per cent) and slide (its impact point)
  double struck[128] = {}; // each key's last velocity, for a fast lift's pile-up (forte/lift.h)
  int focus = -1, sinceReport = 0, sinceHit = 0;
  Rng rng;
  std::vector<Voice> voices; // reserved (twice kMaxVoices, for the stolen ones fading out): never reallocates
};

} // namespace forte::showers
