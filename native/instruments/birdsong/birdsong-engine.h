// birdsong-engine.h — the Birdsong keyboard on the engine contract (forte/engine.h).
//
//   each voice: one side of a syrinx, its labia the normal form of birdsong-model.h integrated
//   with Runge–Kutta steps of at most H_MAX in τ (several a sample for the high notes), at twice
//   the sample rate; the key sets their natural rate γ so that the limit cycle at the note's
//   breath is the note, in the keyboard's tuning
//   the breath: the air sac pressure rises and falls with the key (α from rest past the onset by
//   the velocity's drive), and the syllable's gesture repeats while it is held: a mini-breath
//   (trill), a tension sweep, a rocking tension
//   the sound: the airflow A x into the trachea (a delay line round trip with reflection −r at the
//   glottis), then the OEC, a band-pass resonance that follows the frequency the labia sing (or
//   stays fixed), voiced so that every key leaves the beak equally loud for the same swing
//   the voices summed, then filtered and decimated to the sample rate by a half-band FIR
//
// With V8's fdlibm, so the WebAssembly and the plugins sing alike. A fixed pool of voices; nothing
// is allocated after construction.
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "birdsong-model.h"
#include "birdsong-params.h"

namespace forte::birdsong {

// What the engine posts (birdsong/src/birdsong-wasm.js): the newest voice's state.
namespace msg {
enum : uint16_t { state = 1 };
}
constexpr int TRAIL = 10; // points (x, v) over the last period, posted with the state

constexpr int LINE = 1024; // the trachea's delay line: room for 12 cm at 2 × 192 kHz

struct Voice {
  bool alive = false, held = false, stolen = false, stale = false;
  int key = 0;
  int64_t born = 0;
  double vel = 0, after = 0;
  double env = 0, aIn = 0, aOut = 0; // the breath, 0..1, and its rise and fall a step
  double phase = 0, rate = 8;        // the syllable: where in it, and how many a second
  double d = 0, flow = 1;            // its drive at full breath (the velocity's), and √(d/drive)
  double omega = 0, gamma = 0;       // the limit cycle's Ω at its breath, and γ = 2πf/Ω (rad/s)
  double fNote = 0, voicing = 1;
  double bend = 1;                   // its own bend (MPE), gliding
  double hmax = H_MAX;               // the Quality's longest step
  int sub = 1; double h = 0;         // RK4 steps an internal sample, and their length in τ
  State s;
  double alpha = ALPHA_REST, beta = -0.5, e = 0; // α, β and breath × gate now
  // the trachea, the OEC's biquad (transposed direct form II), the output's DC block
  double line[LINE] = {};
  int w = 0;
  double b0 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0, fo = 0, foTo = 0;
  double dcx = 0, dcy = 0;
  double sx = 0, sy = 0, sR = 0; // the flow's DC block (below an eighth of the note)
  double gainNow = 1;            // the voicing × the flow, gliding
  // the frequency the labia sing, from the time between v's upward zeros (internal samples)
  double prevV = 0, sinceCross = -1, fSung = 0;
  double peak = 0; // the loudest output in the chunk
};

class BirdsongEngine : public Engine {
 public:
  static constexpr int kPool = 32, kMaxVoices = 24;
  explicit BirdsongEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override;
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // read by the tests (birdsong-web.cpp)
  std::array<Voice, kPool> voices;
  Voice *newest = nullptr;
  const double fi; // the internal rate, 2 fs
  int64_t t = 0;   // output samples

 private:
  struct Cached { double a = 0, b = 0; Cycle c; bool used = false; };
  const Cycle &cycleAt(double alpha, double beta);
  void tune(Voice &v);
  void start(Voice &v, int key, double velocity);
  void steal(const Voice *keep);
  void oec(Voice &v);
  double tensionAt(const Voice &v, double &gate) const;
  void run(Voice &v, double *mix, int n);
  double noise();

  std::array<double, p::count> P{};
  bool hasP = false;
  int syllable = 0;
  double tension = 0.5, drive = 0.1, duty = 0.6, sweep = 0.5, turb = 0;
  double L = 0.035, r = 0.7, foFixed = 4000, Q = 2;
  bool track = true;
  double bendNow = 1, bendTo = 1;
  double keyTarget[128] = {};
  forte::Tuning keyboard;
  forte::NoteExpression expr{24};
  std::array<Cached, 24> cache;
  int cacheNext = 0;
  uint64_t rng = 0x9E3779B97F4A7C15ull;
  double dcR = 0;
  // the half-band decimator: its taps and the internal-rate history of the mix
  static constexpr int TAPS = 55;
  double fir[TAPS] = {};
  double hist[2 * TAPS] = {};
  int hw = 0;
  // the trail the page draws: (x, v) of the newest voice at every internal sample
  static constexpr int RING = 8192;
  float ringX[RING] = {}, ringV[RING] = {};
  int ringW = 0;
  int stateEvery = 0, sinceState = 0;
};

} // namespace forte::birdsong
