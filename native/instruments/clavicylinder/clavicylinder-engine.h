// clavicylinder-engine.h — the real-time clavicylinder, on the engine contract (forte/engine.h):
// iron bars lifted by their keys against a turning wet glass cylinder, each kept ringing by the
// stick–slip of a cloth pad on the glass, solved implicitly every sample.
//
// Per sample and bar:
//   1. every mode advances exactly (two-pole), free;
//   2. the cloth pad rides between the glass and the bar's rubbed point: its velocity is linear in
//      the friction F (through its spring and damper to the bar, whose own response to a force
//      there is known), so the contact sticks if the force that holds it is below μs·N, and
//      otherwise slips at the speed that solves the friction law (safeguarded Newton);
//   3. the pad's spring and damper push the bar's modes;
//   4. output: what each mode passes through the cords to the key and the soundboard.
// The cylinder: a flywheel kept going by the foot, slowed by every bar that drags on it.
//
// One voice per key, from a fixed pool; a key's bar is built at its note-on (closed forms, no
// solve). Nothing is allocated in process().
#pragma once

#include <array>
#include <cstdint>

#include "clavicylinder-model.h"
#include "clavicylinder-params.h"
#include "forte/engine.h"

namespace forte::clavicylinder {

constexpr int NK = 108 - 21 + 1;
constexpr int TRACE = 1024; // samples of contact history for the view

// What the engine posts for the page (clavicylinder/src/clavicylinder-wasm.js turns them into its
// 'state' message). Posted every 12 blocks, the state last.
namespace msg {
enum : uint16_t {
  state = 1,  // key (the focused bar); theta, rev/s, N, V, touch, nm, stick fraction
  q = 2,      // the focused bar's modal amplitudes, then their velocities (2·nm values)
  traceS = 3, // the first index, then up to 29 samples of the slip speed (oldest first)
  traceF = 4, // the same for the friction force
};
}

class ClavicylinderEngine : public Engine {
 public:
  explicit ClavicylinderEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override { count = 0; }
  void pressure(double value, int key) override; // aftertouch: the key presses harder
  int voiceCount() const override { return count; }
  void process(float *L, float *R, int n) override;

  struct Voice {
    int key = 0;
    bool touch = false, dead = false, stick = false;
    double vel = 0, after = 0;
    double Nn = 0;           // the cloth's normal force on the glass (N)
    double x = 0, u = 0;     // the pad: displacement and velocity along the rub
    double slip = 0, F = 0;  // slip speed and friction force (on the pad, along the rub)
    double knock = 0, knockDecay = 0; // a key's knock on the glass: the pulse of normal force (N), and its decay a sample
    double peak = 0, sticks = 0;
    int quiet = 0;
    double pl = 0, pr = 0;
    Bar b;
    Pad pad{};
    Friction fr{};
    int N = 0;
    double Yb = 0; // the bar's response at the rubbed point: velocity per newton, this sample
    std::array<double, MODES> q{}, q1{}, a1{}, a2{}, bf{}, c{}, cn{}, e{};
  };

  // read by the tests (through the WebAssembly's hooks): the voices in the order they started,
  // the cylinder, and the focused bar's contact trace
  std::array<Voice *, NK> voices{};
  int count = 0;
  double W = 0, theta = 0, load = 0, foot = 0; // speed (rad/s), angle, the bars' drag (N), the foot's learnt torque
  std::array<float, TRACE> trS{}, trF{};
  int tw = 0;

 private:
  void start(Voice &v, int key);
  double force(const Voice &v) const;
  void run(float *L, float *R, int n);
  void report();

  std::array<double, p::count> P{};
  bool hasParams = false;
  const double k;
  double pressureAll = 0, inertia = 0;
  std::array<double, 128> V{}; // the glass's speed at the cloth, this block
  int32_t rng = 1799;
  int focus = -1, tick = 0;
  std::array<Voice, NK> slots{};
};

} // namespace forte::clavicylinder
