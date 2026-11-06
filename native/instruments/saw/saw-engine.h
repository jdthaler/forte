// saw-engine.h — the musical saw, real time, on the engine contract (forte/engine.h).
//
// Each voice is one blade, bent for its note (saw-model.h): its trapped modes, each a complex
// amplitude z (displacement Im z) stepped exactly each sample, e^((−σ + iω)/fs), with the force
// on it held over the sample. The bow on the edge: the edge's velocity is linear in the friction
// force, so the hair sticks if the force that holds it is within μs·N and otherwise slips at the
// speed that solves the friction law (safeguarded Newton), as on the Chladni plate. The mallet:
// a felt spring that pushes only while it touches. Pitch moves (the knee's vibrato, the wheel,
// One saw's slide) turn the modes' frequencies and keep their action, E/ω, as a slowly bent
// oscillator does. A key let go lifts the bow and lays a hand on the blade, unless the pedal
// holds the hand off. What we hear: the blade's velocity under a microphone close by.
//
// With V8's fdlibm, so the WebAssembly and the plugins play alike. A fixed pool of voices; nothing
// is allocated after construction.
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "saw-model.h"
#include "saw-params.h"

namespace forte::saw {

// What the engine posts (saw/src/saw-wasm.js): the newest voice's state.
namespace msg {
enum : uint16_t {
  state = 1, // f, s, λ, W, ε, ℓ (note's mode), bow force N, threshold, stick fraction, mallet touching,
             // leak σ, total σ, voices, held, then each mode's |z| (m) and frequency (Hz)
};
}

struct Voice {
  bool alive = false, held = false, hand = false, stolen = false;
  int key = 0;
  int64_t born = 0;
  double vel = 0, after = 0, bite = 0, age = 0;
  double u = 0, uTo = 0, uRate = 0;   // log₂ of the note (Hz): One saw slides it to uTo at uRate per second
  double bend = 1, vib = 0;           // its own bend (MPE) and vibrato depth (¢), gliding
  double f = 0;                       // the note now (Hz)
  Plan pl;                            // the blade bent for pl.f
  int M = 0;                          // modes played
  double zr[NMODE] = {}, zi[NMODE] = {};
  double w[NMODE] = {}, sg[NMODE] = {}; // ω and σ now
  double pr[NMODE] = {}, pim[NMODE] = {}, gr[NMODE] = {}, gi[NMODE] = {}; // step e^((−σ+iω)T), and force → z
  double cv[NMODE] = {};              // the velocity's coupling: v = Im((−σ + iω) z)
  double b[NMODE] = {}, r[NMODE] = {}; // the swing at the bow or mallet, and at the microphone
  double Y = 0, Yd = 0;               // the edge's velocity, and its displacement, per newton held a sample
  double N = 0, V = 0, slip = 0, F = 0, sticks = 0, Nth = 0; // the bow
  bool stick = false;
  bool mallet = false;                // the mallet is on its way or touching
  double xm = 0, vm = 0;              // the mallet's place (m, toward the blade) and speed
  double peak = 0;
  int quiet = 0;
};

class SawEngine : public Engine {
 public:
  static constexpr int kPool = 24, kMaxVoices = 16;
  explicit SawEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: the bow presses harder
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); } // MPE: one note's vibrato
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // read by the tests (saw-web.cpp)
  std::array<Voice, kPool> voices;
  Voice *newest = nullptr;
  int64_t t = 0;

 private:
  void start(Voice &v, int key, double velocity);
  void excite(Voice &v, double velocity);
  void bendFor(Voice &v, double f, bool fresh); // the blade bent for the note f
  void retune(Voice &v, double f);              // the modes' frequencies for the note f, on the same bend
  void place(Voice &v);                         // where the bow or mallet and the microphone meet the modes
  void steal(const Voice *keep);
  void run(float *L, float *R, int n);
  void report();

  std::array<double, p::count> P{};
  bool hasP = false, mono = false, sustain = false;
  Blade bl{};
  double keyTarget[128] = {};
  forte::Tuning keyboard;
  forte::NoteExpression expr{48};
  double bendNow = 1, bendTo = 1, vibPhase = 0, pressureAll = 0;
  int stack[128] = {}, held = 0; // One saw: the keys down, oldest first
  int32_t rng = 1787;
  uint64_t version = 0;
  uint64_t built[kPool] = {};
  int tick = 0;
};

} // namespace forte::saw
