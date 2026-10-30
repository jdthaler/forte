// steelpan-engine.h — the real-time part, on the engine contract (forte/engine.h). Every key is
// a note area of one pan, alive while it sounds: its modes are exact two-pole resonators, driven
// each sample by the dome's quadratic forces among them (steelpan-model.h, noteTriples) and by the steel's
// coupling to the neighbouring notes, which come alive with it (the pan's note layout), and to
// the skirt, a ring of steel whose modes every sounding note pushes on. A note's
// own slide (MPE) is its own roll: how hard its sticks strike again while its key is down.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "forte/expression.h"
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
  void slide(double value, int key) override { expr.setSlide(value, key); } // the key's own roll
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
    std::array<Triple, kTriples> tri{}; // the dome's couplings among its modes
    std::array<int, kModes + 1> triBelow{}; // how many of them lie among its first n modes
    bool active = false, struck = false, held = false, released = false, damped = false, hand = false;
    double vel = 0, press = 0, gl = 1, gr = 1, rollIn = 0;
    int age = 0;                   // samples since it came alive
    int version = -1;              // the parameters its coefficients were made from
  };
  const Note &note(int key) const { return notes[key - KEY_MIN]; }
  // The amplitude of a note's mode p (in thicknesses), from its last two samples.
  double amplitude(const Note &v, int p) const;
  // The skirt's energy, Σ ½(ẏ² + ω²y²) over its modes (per unit mass, in thicknesses²/s²).
  double wallEnergy() const;

 private:
  void retune(Note &v);
  void activate(Note &v);
  void strike(Note &v, double velocity);
  void damp(Note &v, bool on);
  void mute(Note &v);
  void rebuildCouplings();
  void postViews();
  double rollOf(const Note &v) const; // how hard a held note is rolled (0: not)
  void buildWall();

  struct Coupling { int a, p, b, q; double k; };
  struct WallCoupling { int a, p, s; double k; }; // note a's mode p and the skirt's mode s
  // The skirt's ring modes: n = 2 … kRingOrders + 1, each as cos nθ (2i) and sin nθ (2i + 1).
  struct Wall {
    static constexpr int N = 2 * kRingOrders;
    std::array<double, N> a1{}, a2{}, b{}, w{}, y1{}, y2{}, F{};
    std::array<bool, N> driven{};
    std::array<int, N> on{}; // the modes integrated: those a note drives, or still ringing
    int count = 0, nOn = 0;  // modes below the engine's top frequency; integrated
  } wall;
  void wakeWall(); // the skirt's modes to integrate, after a change of couplings or once a block
  std::vector<WallCoupling> wallCouplings;
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  int version = 0, focus = -1, sincePost = 0;
  double channelPress = 0, g = 0;
  NoteExpression expr{0}; // each key's own roll (no bend: a note area is hammered to its pitch)
  std::vector<Note> notes;      // one per key, A0–C8
  std::vector<int> live;        // indices of the active notes (reserved: never reallocates)
  std::vector<Coupling> couplings;
  bool couplingsDirty = false;
  uint32_t rng = 1;
};

} // namespace forte::steelpan
