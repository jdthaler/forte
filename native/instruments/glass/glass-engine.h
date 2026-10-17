// glass-engine.h — the real-time armonica (glass/src/glass-engine.js in C++), on the engine
// contract (forte/engine.h): rotating glass bowls (shell modes in the bowl's frame, with their
// Coriolis coupling), rubbed by wet fingers (a skin pad with stick–slip friction, solved
// implicitly every sample), heard by two microphones fixed in the room.
//
// Per sample and bowl:
//   1. the spindle has turned by θ; the finger (fixed in the room at φ = 0) sits at φ_b = −θ on
//      the bowl, so each mode's coupling to it turns;
//   2. every doublet advances exactly (two-pole), with the Coriolis term taken implicitly by a 2×2
//      solve, and the pressed pulp's radial damping applied from the last sample's rim velocity;
//   3. the tangential friction between skin pad and rim: the contact sticks if the force that
//      holds it is below μs·N, and otherwise slips at the speed that solves the Stribeck law
//      (safeguarded Newton);
//   4. output: the rim's radial velocity at two microphone azimuths, each family weighted by its
//      radiation efficiency.
//
// One voice per key, from a fixed pool. A bowl's modes depend on the split, the loss and the
// water: they are built off the audio thread (forte/background.h) and each voice rebuilds its
// coefficients from them, keeping its motion. Nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "forte/background.h"
#include "forte/engine.h"
#include "glass-model.h"
#include "glass-params.h"

namespace forte::glass {

constexpr int TRACE = 1024; // samples of contact history for the view

// What the engine posts for the page (glass/src/glass-wasm.js turns them back into the
// JavaScript engine's 'state' message). Posted every 12 blocks, the state last.
namespace msg {
enum : uint16_t {
  state = 1,  // key (the focused bowl); theta, rot, N, V, touch, nm
  q = 2,      // the focused bowl's modes: qc, qs, qc1, qs1 for each family (4·nm values)
  traceS = 3, // the first index, then up to 29 samples of the slip speed (oldest first)
  traceF = 4, // the same for the friction force
};
}

class ArmonicaEngine : public Engine {
 public:
  explicit ArmonicaEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: the finger presses harder
  int voiceCount() const override { return count; }
  // the tests: whether the key's bowl for the current parameters is built (asks for it if not)
  bool ready(int key) { return bool(bowls.get(key, version)); }
  void process(float *L, float *R, int n) override;

  struct Voice {
    int key = 0;
    double Nreg = 0, after = 0;
    bool touch = false, stick = false, dead = false, built = false;
    double vel = 0, Nn = 0, x = 0, u = 0, F = 0, slip = 0, s = 0, wdot = 0, peak = 0, nz = 0, Nlift = 0;
    int quiet = 0;
    double pl = 0, pr = 0;
    uint64_t version = 0; // of the bowl it was built from
    Bowl b;
    int N = 0;
    std::array<double, MODES> qc{}, qc1{}, qs{}, qs1{};
    std::array<double, MODES> a1c{}, a2c{}, bc{}, a1s{}, a2s{}, bs{}, buc{}, bus{};
    std::array<double, MODES> nd{}, cpsi{}, spsi{}, g{}, gain{}, cmL{}, smL{}, cmR{}, smR{};
    std::array<double, MODES> cx{}, sx{}, dc{}, ds{}, bet{}, bes{};
    std::array<int, MODES> n{};
  };

  // read by the tests (through the WebAssembly's hooks): the voices in the JavaScript engine's
  // order, and the focused bowl's contact trace
  std::array<Voice *, NK> voices{};
  int count = 0;
  std::array<float, TRACE> trS{}, trF{};
  int tw = 0;

 private:
  void start(Voice &v, int key);
  void build(Voice &v, const Bowl &b, uint64_t version);
  double force(const Voice &v) const;
  void run(float *L, float *R, int n);
  void report();

  std::array<double, p::count> P{};
  bool hasParams = false;
  const double k;
  Friction fr{};
  double theta = 0, Wbar = 0, pressureAll = 0;
  double C[N_MAX + 1][128] = {}, S[N_MAX + 1][128] = {};
  int32_t rng = 22222;
  int focus = -1, tick = 0;
  double lastV = 0;
  std::array<Voice, NK> slots{};

  // the bowls, built off the audio thread for each version of (split, loss, water)
  struct Snapshot { std::atomic<double> split{0}, loss{0}, water{0}; };
  std::array<Snapshot, 8> snapshots;
  uint64_t version = 0;
  KeyData<Bowl> bowls;
};

} // namespace forte::glass
