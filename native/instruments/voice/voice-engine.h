// voice-engine.h — the Singing Voice on the engine contract (forte/engine.h).
//
//   each voice: a singer. Lungs whose pressure rises when the key goes down and falls when it comes
//   up; the two-mass folds (voice-model.h) stepped with the flow through them and the tract's
//   pressure above them; the Kelly–Lochbaum tract, one section a sample, its shape the vowel
//   (the mod wheel, or the note's own slide), the lips radiating through their impedance
//   the singer's ear: each cycle of the folds is timed, and the tension Q nudged toward the key's
//   note (with the vibrato's and the flutter's wavering on it), as a singer listening to
//   themselves tunes the stretch of their folds; each key remembers the tension it ended on
//   turbulence: noise at the glottis once the flow's Reynolds number passes its critical value
//   all of it at twice the sample rate (at least 80 kHz), the sum of the voices brought down by a
//   half-band filter
//
// With V8's fdlibm, so the WebAssembly and the plugins play alike. A fixed pool of voices; nothing
// is allocated after construction.
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "voice-model.h"
#include "voice-params.h"

namespace forte::voice {

// What the engine posts (voice/src/voice-wasm.js).
namespace msg {
enum : uint16_t {
  state = 1, // the newest voice: f measured, f target, Q, Ps (cm H₂O), a1, a2 (mm²), U (cm³/s), vowel, voices, jaw
  cycle = 2, // its last whole cycle: 10 samples each of x1, x2 (mm) and U (cm³/s)
};
}

constexpr int MAXN = 160;   // tract sections at most (24 cm at 2 × 96 kHz… and 192 kHz once)
constexpr int REC = 4096;   // samples of the newest voice's cycle kept

struct Voice {
  bool alive = false, held = false, stolen = false;
  int key = 0;
  int64_t born = 0;
  double vel = 0, after = 0;
  // the folds and their tension
  Folds folds;
  FoldConstants fc{};
  double Q = 1, fT = 100;
  // the singer's ear: x₁'s mean, its last value about the mean, the last upward crossing (samples)
  double mean = 0, sPrev = 0, lastCross = -1, fMeas = 0, lo = 0, hi = 0, amp = 0;
  bool armed = false;
  int64_t n = 0;
  // the lungs
  double env = 0, Ps = 0;
  // the tract: waves going up (F) and coming back (B) at each section, the junctions' r, the walls' loss one way
  int N = 0;
  double F[2][MAXN] = {}, B[2][MAXN] = {}, r[MAXN] = {}, area[MAXN] = {}, mu = 1;
  int cur = 0;        // which of F's and B's buffers is now
  double vowel = -1, larynx = 0, jaw = 0;  // the shape the tract has now
  double jawVowel = -1, jawF = 1, jawLarynx = 0, jawTo = 0; // the jaw opening wanted, and what for
  double jawTry = 0;    // the jaw the singer is trying instead, when the folds will not sing (0: none)
  int64_t lastValid = 0; // when the ear last timed a cycle
  double lb0 = 0, lb1 = 0, la1 = 0, lx1 = 0, ly1 = 0, ZN = 1, uL = 0; // the lips' reflection, flow
  // wavering: the vibrato's phase and how far in it is, the flutter's filtered noise
  double vibPhase = 0, age = 0, j1 = 0, j2 = 0, bend = 1;
  uint32_t seed = 1;
  double noise = 0;    // turbulence, low-passed
  double level = 0;    // its output's power, for when it has finished
  double gain = 1;     // 1 m over the distance it is heard from
};

class VoiceEngine : public Engine {
 public:
  static constexpr int kPool = 24, kMaxVoices = 16;
  explicit VoiceEngine(double fs);
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

  // read by the tests (voice-web.cpp)
  std::array<Voice, kPool> voices;
  Voice *newest = nullptr;
  double learned[128];   // each key's last tension over its nominal one
  const int os;          // oversampling
  const double fo;       // the rate the physics runs at

 private:
  void start(Voice &v, int key, double velocity);
  void shape(Voice &v, double vowel, double jaw); // the tract for a vowel and jaw opening, at the parameters' larynx
  double jawTarget(Voice &v, double vowel) const;
  void run(Voice &v, double *out, int m);
  void steal(const Voice *keep);
  void cycleDone();
  double nominalQ(double f) const;

  std::array<double, p::count> P{};
  bool hasP = false;
  double bendNow = 1, bendTo = 1, qMax = 50;
  forte::Tuning keyboard;
  forte::NoteExpression expr{48};
  int64_t t = 0;
  // the half-band filter
  static constexpr int TAPS = 47;
  double h[TAPS] = {}, hist[2 * TAPS] = {};
  int hw = 0;
  double mix[2 * 128] = {};
  // the newest voice's cycle
  double rec_[3][REC] = {};
  int recN = 0, sinceCycle = 0, sinceState = 0;
};

} // namespace forte::voice
