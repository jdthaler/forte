// trautonium-engine.h — the Trautonium on the engine contract (forte/engine.h).
//
//   each voice: a manual's master lamp, tuned by the wire, and four dividers ganged to it, each
//   fired by the master's sync pulse (as the Huygens Keyboard's lamps fire one another: exact
//   firing times within each sample, a kick that fires a lamp or leaves no trace); their
//   sawtooths band-limited with polyBLEP and mixed
//   every discharge rings four resonant circuits from the instant it happens (exact damped
//   sinusoids), fixed in frequency; the mixture's sawtooth goes round them, through a 15 Hz
//   coupling capacitor
//   the finger's pressure on the rail sets the loudness: velocity and aftertouch press it, and a
//   released key lifts it; then the wire leaves the rail and the voice ends
//   Keys: a voice for every key; One wire: one voice whose wire resistance slides, at a steady
//   rate, to each key pressed while another is held
//
// With V8's fdlibm for exp, log, sin and cos, so the WebAssembly and the plugins fire alike. A
// fixed pool of voices; nothing is allocated after construction.
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "trautonium-model.h"
#include "trautonium-params.h"

namespace forte::trautonium {

// What the engine posts (trautonium/src/trautonium-wasm.js): the newest voice's state.
namespace msg {
enum : uint16_t { state = 1 };
}

struct Lamp {
  double V = V_EXT, tau = 1, a = 0; // capacitor voltage; time constant R C and e^(−1/(fs τ))
  double prevOut = 0;               // one sample late, for the polyBLEP
  double fireAt = -1;               // where in this sample it fires (−1: not)
  bool caught = false;              // fired by the master's pulse
  int64_t nf = 0;                   // firings
  int pulses = 0, count = 0;        // master pulses since it fired; the pulse it fired on last (0: on its own)
  double lastT = -1, interval = 0;  // when it last fired, and the time since the one before (samples)
};

struct Voice {
  bool alive = false, held = false;
  int key = 0;
  int64_t born = 0;
  double vel = 0, after = 0, p = 0, aPress = 0, aLift = 0;
  bool stolen = false;
  double u = 0, uTo = 0, uRate = 0; // the wire: 1/f of the finger's place (f ∝ 1/R), sliding to uTo at uRate per second
  double bend = 1;                  // its own bend (MPE), gliding
  double f = 0;                     // the master's frequency now
  double f1 = 0;                    // its first circuit's tuning (the mod wheel's, or its own slide)
  std::array<Lamp, 1 + DIVIDERS> lamp;
  // the circuits: z = Σ amplitude e^{(−σ + iω)(t − tⱼ)} over the discharges; out = A Im z
  double zr[FORMANTS] = {}, zi[FORMANTS] = {}, pr[FORMANTS] = {}, pi[FORMANTS] = {}, sg[FORMANTS] = {}, wd[FORMANTS] = {}, A[FORMANTS] = {};
  double ff[FORMANTS] = {}, fq[FORMANTS] = {}; // what the coefficients were made for
  double hx = 0, hy = 0;   // the coupling capacitor
  double fPrev = 0;        // the circuits' output, one sample late as the sawtooths
};

class TrautoniumEngine : public Engine {
 public:
  static constexpr int kPool = 40, kMaxVoices = 32;
  explicit TrautoniumEngine(double fs);
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

  // read by the tests (trautonium-web.cpp)
  std::array<Voice, kPool> voices;
  int64_t t = 0, now = 0; // samples: the chunk's start, and the sample a voice is playing
  Voice *newest = nullptr;

 private:
  void run(float *L, float *R, int n);
  void update(Voice &v, double dt);
  void tune(Voice &v);
  void circuits(Voice &v);
  void start(Voice &v, int key, double velocity);
  void lift(Voice &v) { v.held = false; }
  void steal(const Voice *keep);
  double baseFreq(int key) const { return keyTarget[key & 127]; }
  void sample(Voice &v, double &out);

  std::array<double, p::count> P{};
  bool hasP = false;
  bool wire = false;
  double S = 150, g = 0, K = 0, slack = 0, swing = V_STRIKE - V_EXT, mid = 0.5 * (V_STRIKE + V_EXT);
  int div[DIVIDERS] = {2, 3, 4, 5};
  double level[1 + DIVIDERS] = {1, 0, 0, 0, 0};
  double fq[FORMANTS] = {}, fg[FORMANTS] = {};
  double dry = 0, swell = 1, swellNow = 1, dcRho = 0;
  double bendNow = 1, bendTo = 1;
  double keyTarget[128] = {};
  forte::Tuning keyboard;
  forte::NoteExpression expr{48};
  int stack[128] = {}, held = 0; // One wire: the keys down, oldest first
  int stateEvery = 0, sinceState = 0;
};

} // namespace forte::trautonium
