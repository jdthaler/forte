// cristal-engine.h — the real-time cristal Baschet, on the engine contract (forte/engine.h): each
// key a steel stem's modes, its glass rod stroked by a wet finger (stick–slip, solved exactly every
// sample), all the stems bolted to one collector, whose motion drives the radiators (two fibreglass
// cones and a steel flame) and the whiskers.
//
// Per sample and key:
//   1. the finger moves along the rod at its stroke speed (turning or lifting at the stroke's end);
//   2. every mode advances exactly (two-pole), and the rod's velocity is linear in the friction
//      force F (the modes' response to a unit impulse is known);
//   3. the contact sticks if the force that holds the rod to the finger is within μs·N; otherwise it
//      slips, at the speed that solves the friction law, in closed form (a quadratic);
//   4. the stem's foot moves the collector.
// Then, once for every key: the collector's velocity drives the whiskers (base-driven wires whose
// stretching modes add back to it) and the radiators, which give the two channels.
//
// One voice per key, from a fixed pool. A key's stem depends on the rod's height, the losses and the
// tuning: it is built off the audio thread (forte/background.h) and each voice rebuilds its
// coefficients from it, keeping its motion. Nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "forte/background.h"
#include "forte/dsp.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "cristal-model.h"
#include "cristal-params.h"

namespace forte::cristal {

constexpr int TRACE = 1024;     // samples of the focused rod's motion for the view
constexpr int FLAME_MODES = 64; // the flame's modes at High
constexpr int WHISKER_MODES = 6; // stretching modes a wire, at most (below 10 kHz)

// What the engine posts for the page (cristal/src/cristal-wasm.js turns them into its 'state'
// message). Posted every 12 blocks, the state last.
namespace msg {
enum : uint16_t {
  state = 1, // key (the focused rod); pos, uf, N, touch, stick, amp, f0, len, height, weight, phase
  traceV = 2, // the first index, then up to 29 samples of the rod's velocity (oldest first)
  traceU = 3, // the same for the finger's
};
}

class CristalEngine : public Engine {
 public:
  explicit CristalEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: the finger presses harder
  void slide(double value, int key) override;    // MPE: one finger's own stroke speed
  int voiceCount() const override { return count; }
  // the tests: whether the key's stem for the current parameters is built (asks for it if not)
  bool ready(int key) { return bool(stems.get(key, version)); }
  void process(float *L, float *R, int n) override;

  struct Voice {
    int key = 0;
    double Nreg = 0, after = 0, vel = 0;
    bool touch = false, stick = false, dead = false, built = false;
    double Nn = 0, Nlift = 0, nz = 0, peak = 0, uf = 0, v = 0, F = 0;
    double pos = 0, t = 0; // along the stroke (m); time into a turn or a return (s)
    double firm = 0;       // how much harder than it holds the finger still presses, after landing
    int phase = 0, dir = 1; // 0 stroking, 1 turning, 2 lifting off and coming back
    int quiet = 0;
    double pl = 0, pr = 0; // its share of the collector's two halves
    uint64_t version = 0;
    Stem s;
    int N = 0;
    int cap = MODES; // the modes it plays (the Quality when it started: build)
    double Y = 0;    // the rod's velocity per newton of friction, one sample on
    std::array<double, MODES> q{}, q1{}, a1{}, a2{}, b{}, tip{}, col{};
  };

  // read by the tests (through the WebAssembly's hooks): the voices in the order they started,
  // and the focused rod's trace
  std::array<Voice *, NK> voices{};
  int count = 0;
  std::array<float, TRACE> trV{}, trU{};
  int tw = 0;
  // the collector's velocity in the last block's last sample, and the whiskers' pull on it (tests)
  double collector = 0, whiskerOut = 0;

 private:
  void start(Voice &v, int key);
  void build(Voice &v, const Stem &s, uint64_t version);
  double speedOf(const Voice &v) const;
  double force(const Voice &v, double U) const;
  void run(float *L, float *R, int n);
  void radiate(float *L, float *R, int n);
  void report();

  std::array<double, p::count> P{};
  bool hasParams = false;
  const double k;
  Friction fr{};
  double pressureAll = 0;
  NoteExpression expr{0};
  int32_t rng = 31415;
  int focus = -1, tick = 0;
  std::array<Voice, NK> slots{};

  // the stems' pull on the collector this block, on its half at the big cone's end and the small one's,
  // and the two halves' motion
  std::array<double, 128> dA{}, dB{};
  double ca1 = 0, ca2 = 0, cb = 0, cA = 0, cA1 = 0, cB = 0, cB1 = 0;
  // the radiators: each cone a piston (a first-order high-pass where ka = 1) behind its breakup
  // (a resonant low-pass), the collector's own small face, and the flame's modes
  struct Piston { double al = 0, x1 = 0, y1 = 0; Biquad breakup; double run(double x); };
  Piston bigCone, smallCone, bare, plate;
  struct Bank { double a1, a2, b, g, y = 0, y1 = 0; };
  std::array<Bank, FLAME_MODES> flame{};
  // the whiskers: each stretching mode, its base drive Γ and the wire's mass ratio to the collector
  struct Wire { double L = 0, sway = 0, phase = 0; int n = 0; std::array<double, WHISKER_MODES> f{}, gam{}, sigma{}, y{}, y1{}, a1{}, a2{}, b{}; };
  std::array<Wire, WHISKERS> wires{};
  double swayT = 0, lastB = 0, lastD = 0;

  // the stems, built off the audio thread for each version of (height, loss) and the tuning
  struct Snapshot { std::atomic<double> height{0.5}, loss{9e-4}, ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}; };
  forte::Tuning tuning;
  std::array<Snapshot, 8> snapshots;
  uint64_t version = 0;
  KeyData<Stem> stems;
};

} // namespace forte::cristal
