// drums-engine.h — the real-time Timpani and Tabla, on the engine contract (forte/engine.h): every
// key a drum (drums-model.h), alive while it rings.
//
// Per sample and drum:
//   1. every mode advances exactly (a damped oscillator over one sample, its rate the air's and
//      the head's losses), free;
//   2. the beater, while it touches: a mass on a felt (or fingertip) spring, F = K·x^p against the
//      head under it, solved implicitly with the modes' response to F over the sample;
//   3. the hands: a finger resting on the head, the fingers that stay after a closed stroke and the
//      heel pressing in, each a dashpot at its point, solved implicitly (it never overshoots);
//   4. the listener: the far-field pressure each mode sends across the drum, from its acceleration.
// Every 16 samples the tension is worked out again: the pedal (pitch bend, or one note's own bend),
// the heel's push stretching the head (pressure), and the head's own stretch as it swings (a hard
// stroke starts sharp and glides down); the modes follow it as √T.
//
// A drum's modes (a few milliseconds to solve) are built off the audio thread in the plugins
// (forte/background.h); in WebAssembly the page builds them and sends them with the note (offer),
// or else they are built in place.
#pragma once

#include <array>
#include <atomic>
#include <memory>

#include "drums-model.h"
#include "drums-params.h"
#include "forte/background.h"
#include "forte/engine.h"
#include "forte/lift.h"
#include "forte/expression.h"

namespace forte::drums {

constexpr int KEY_MIN = 21, KEY_MAX = 108, NK = KEY_MAX - KEY_MIN + 1;

// What the engine posts for the page (drums/src/drums-wasm.js): the focused drum's state.
namespace msg {
enum : uint16_t {
  state = 1, // key; tension ratio (√(T/T₀)), beater force (N), modes posted, then their amplitudes (m), up to 26
};
}

// A key's drum packed as numbers (the page's noteData, and the model's export): the shaping
// parameters it was built for, then the drum.
int packDrum(const KeyDrum &k, const double *P, double *out);
bool unpackDrum(const double *in, int n, KeyDrum &k, double *shaping);
constexpr int PACKED_MAX = 64 + 32 + MAXMODES * (8 + NB + NRS);

class DrumEngine : public Engine {
 public:
  explicit DrumEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // the heel pressing into the head
  void bend(double value) override;              // the pedal
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); } // one note's strike point
  int voiceCount() const override { return count; }
  void process(float *L, float *R, int n) override;
  // The page's drum for a key (WebAssembly only): used if it is for the parameters now.
  bool offer(const double *packed, int n);

  struct Voice {
    int key = 0, M = 0;
    bool active = false, released = false, hand = false;
    double liftK = 1; // how many times longer than usual the hand takes to still the head (forte/lift.h)
    KeyData<KeyDrum>::Ref ref;
    const KeyDrum *kd = nullptr;
    // the modes: state, base frequency and decay, the one-sample map and the beater's response
    std::array<double, MAXMODES> q{}, v{}, w0{}, sig{}, a11{}, a12{}, a21{}, a22{}, bq{}, bv{};
    std::array<double, MAXMODES> phiS{}, phiR{}, phiH{}, outQ{}, outV{}, grad{};
    double S_s = 0, S_r = 0, S_h = 0; // Σ Φ² at the strike point, the resting finger, the heel
    double Y = 0;                    // the head's compliance under the beater over one sample
    double tension = 1;              // √(T/T₀) the coefficients were made for
    double gl = 0.7, gr = 0.7;
    // the beater
    bool mallet = false, touched = false, stay = false;
    double y = 0, vm = 0, mm = 0, K = 0, pw = 1, F = 0, Fmax = 0, strike = 0;
    int contact = 0;
    double press = 0, bendNow = 1, stretch = 0, peak = 0, energy = 0;
    int quiet = 0;
  };
  std::array<Voice *, NK> voices{};
  int count = 0;

 private:
  void start(Voice &v, int key, KeyData<KeyDrum>::Ref r);
  void strike(Voice &v, double velocity);
  void place(Voice &v);            // the strike point and the fingers, from the parameters
  void coefficients(Voice &v, double tension);
  double tensionOf(const Voice &v) const;
  void kill(Voice &v);
  void run(float *L, float *R, int n);
  void report();
  void retryPending();

  using Data = KeyData<KeyDrum>;
  Data data;
  // the drums' version: a new one when a shaping parameter changes; its snapshot (a ring, read by
  // the builder) holds what that version's drums are built from
  struct Snapshot { std::array<std::atomic<double>, p::count> P{}; };
  std::array<Snapshot, 8> snapshots;
  uint64_t version = 0;
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  double pressAll = 0, bendAll = 1;
  std::array<double, 128> keyPress = [] { std::array<double, 128> a{}; a.fill(-1); return a; }(); // −1: the channel's
  double pressTarget(int key) const { return key >= 0 && key < 128 && keyPress[key] >= 0 ? keyPress[key] : pressAll; }
  NoteExpression expr{12};
  struct Pending { int key; double vel; bool off; };
  std::array<Pending, NK> pending{};
  int npending = 0;
  std::array<Voice, NK> slots{};
  int focus = -1, tick = 0;
#if !FORTE_THREADS
  std::unique_ptr<KeyDrum> offered;
  std::array<double, p::count> offeredFor{};
#endif
};

} // namespace forte::drums
