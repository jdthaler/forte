// steelpan-engine.h — the real-time part, on the engine contract (forte/engine.h). Every key is
// a note area of one pan, alive while it sounds: its modes are exact two-pole resonators, driven
// each sample by the dome's quadratic forces among the three tuned modes and by the steel's
// coupling to the neighbouring notes, which come alive with it (the pan's note layout).
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "steelpan-model.h"
#include "steelpan-params.h"

namespace forte::steelpan {

class SteelPanEngine : public Engine {
 public:
  explicit SteelPanEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void pressure(double value, int key) override;
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // What the page's views are sent (Engine::post): type 1, the last struck note's tuned modes'
  // amplitudes (in thicknesses) and its age (s); type 2, the sounding notes' (key, amplitude)
  // pairs, loudest first, with their number as the key.
  enum Msg : uint16_t { msgNote = 1, msgPan = 2 };

  struct Note {
    int key = 0;
    NoteModes nm;
    int run = 0;                   // modes integrated: kTuned while it only rings along, all once struck
    std::array<double, kModes> a1{}, a2{}, b{}, w{}, out{}, y1{}, y2{}, F{};
    bool active = false, struck = false, held = false, released = false, damped = false, hand = false;
    double vel = 0, press = 0, gl = 1, gr = 1, rollIn = 0;
    int age = 0;                   // samples since it came alive
    int version = -1;              // the parameters its coefficients were made from
  };
  const Note &note(int key) const { return notes[key - KEY_MIN]; }
  // The amplitude of a note's mode p (in thicknesses), from its last two samples.
  double amplitude(const Note &v, int p) const;

 private:
  void retune(Note &v);
  void activate(Note &v);
  void strike(Note &v, double velocity);
  void damp(Note &v, bool on);
  void mute(Note &v);
  void rebuildCouplings();
  void postViews();

  struct Coupling { int a, p, b, q; double k; };
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  int version = 0, focus = -1, sincePost = 0;
  double channelPress = 0, g = 0;
  std::vector<Note> notes;      // one per key, A0–C8
  std::vector<int> live;        // indices of the active notes (reserved: never reallocates)
  std::vector<Coupling> couplings;
  bool couplingsDirty = false;
  uint32_t rng = 1;
};

} // namespace forte::steelpan
