// chladni-engine.h — the real-time Chladni Plate, on the engine contract (forte/engine.h): every
// key a square plate, clamped at its centre or free, drawn on at its edge by a rosined bow while
// the key is held, with a fingertip resting on one of the figure's nodal lines.
//
// Per sample and plate:
//   1. every mode advances exactly (two-pole), free;
//   2. the bow: the edge's velocity there is linear in the friction force F (its modes' response to
//      a force at the bow is known), so the hair sticks if the force that holds it is within μs·N,
//      and otherwise slips at the speed that solves the friction law (safeguarded Newton);
//   3. the friction pushes the modes;
//   4. output: two microphones close over the plate hear its velocity under them.
// The finger and the hand that stops a plate are losses on each mode (the finger's from its
// shape under the fingertip).
//
// The plate's modes (a Ritz solve, ~0.1 s) are built off the audio thread in the plugins
// (forte/background.h), one for each material and hold; in WebAssembly, in place.
#pragma once

#include <array>
#include <cstdint>

#include "chladni-model.h"
#include "chladni-params.h"
#include "forte/background.h"
#include "forte/engine.h"
#include "forte/expression.h"

namespace forte::chladni {

constexpr int NK = 108 - 21 + 1;

// What the engine posts for the page (chladni/src/chladni-wasm.js turns them into its 'state'
// message). Posted every few blocks, the state last.
namespace msg {
enum : uint16_t {
  state = 1, // key; plate id, figure's mode, bow (path), finger 1 x, y, fingers on, side (m), f0, modes, stick fraction, bow force,
             // bowed, plates sounding, finger 2 x, y, the threshold force
  amps = 2,  // the first mode, then up to 29 of the focused plate's modal amplitudes (m)
};
}

class ChladniPlateEngine : public Engine {
 public:
  explicit ChladniPlateEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: the bow presses harder
  void slide(double value, int key) override { expr.setSlide(value, key); } // MPE: one note's bow along its edge
  int voiceCount() const override { return count; }
  void process(float *L, float *R, int n) override;

  struct Voice {
    int key = 0;
    bool touch = false, dead = false, hand = false, stick = false;
    double vel = 0, after = 0, bite = 0;
    double N = 0, V = 0;       // the bow's force on the edge (N) and its speed (m/s)
    double shift = 0, s = 0;   // the bow's shift along the edge, glided, and its place on the path
    double slip = 0, F = 0, sticks = 0, peak = 0;
    int quiet = 0, damp = -1, M = 0, figure = -1;
    KeyPlate kp;
    KeyData<Plate>::Ref plate;
    double Yb = 0, Nth = 0; // the bow's response, and the figure's speaking threshold (N)
    std::array<double, MAXMODES> q{}, q1{}, a1{}, a2{}, bf{}, b{}, l{}, r{}, fin{};
  };

  // read by the tests (through the WebAssembly's hooks)
  std::array<Voice *, NK> voices{};
  int count = 0;

 private:
  void start(Voice &v, int key, KeyData<Plate>::Ref ref);
  void coefficients(Voice &v);
  void place(Voice &v);
  void run(float *L, float *R, int n);
  void report();
  void kill(Voice &v);

  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  double pressureAll = 0;
  uint64_t version = 1;
  KeyData<Plate> plates;
  NoteExpression expr{0};
  struct Pending { int key; double vel; };
  std::array<Pending, NK> pending{};
  int npending = 0;
  int32_t rng = 1787;
  int focus = -1, tick = 0;
  std::array<Voice, NK> slots{};
};

} // namespace forte::chladni
