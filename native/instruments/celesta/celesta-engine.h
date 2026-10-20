// celesta-engine.h — the real-time celesta, on the engine contract (forte/engine.h).
//
//   felt hammer (Hertz contact, implicit) ─▶ bar modes 2–5 and torsion 1–2 (exact two-pole recursions)
//                                         └▶ bar mode 1 ⇄ box mode 1 (implicit midpoint, coupled through the gap's air)
//   damper felt ─▶ extra loss on every mode of a bar whose key is up, unless the pedal is down
//   output = the box's volume acceleration (a monopole) + each bar mode's own radiation, panned
//   by the key's place across the case
//
// One voice per bar: striking a ringing bar hits it where it is. Each key's bar (celesta-model.h)
// is built where it is first played, and again when the bar thickness or the keyboard's tuning
// changes (the bar is cut to its tuned pitch); a voice keeps
// its own copy. A note's own slide (MPE) is its hammer's felt, taken as the hammer is thrown.
// Voices come from a fixed pool: nothing is allocated in process().
#pragma once

#include <array>
#include <cstdint>
#include <memory>

#include "celesta-model.h"
#include "celesta-params.h"
#include "forte/engine.h"
#include "forte/expression.h"

namespace forte::celesta {

// What the engine posts for the page (celesta/src/celesta-wasm.js turns them into its 'cel'
// and 'error' messages).
namespace msg {
enum : uint16_t {
  cel = 1,   // the focus key (0: none); amp[7], Eb, Et, X, contactMs, Fmax, kappa, ft, damper
  error = 2, // key: a bar's numerical failure
};
}

class CelestaEngine : public Engine {
 public:
  static constexpr int POOL = 48;      // voices, sounding or fading (at most 24 sound at once)
  static constexpr int BLOCK_MAX = 1024;
  explicit CelestaEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; }
  void slide(double value, int key) override { expr.setSlide(value, key); } // the key's hammer felt, at its next strike
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;

  struct Voice {
    int key = 0, N = 0;
    Bar bar;
    double thick = 0, ratio = 1; // the bar's thickness and tuning (its key's ratio)
    bool inUse = false;
    std::array<double, N_MODES> q{}, q1{}, a1{}, a2{}, bc{}, ws{}, bws{}, accOut{}, sig{};
    std::array<bool, N_MODES> cut{}; // modes at or above 0.45 fs: left out, so they cannot alias
    double qb = 0, vb = 0, X = 0, vx = 0;
    // block parameters at the start (…) and end (…n) of the audio block
    double M11 = 1, M12 = 0, M22 = 1, Ka = 1, R = 0, boxGain = 0;
    double M11n = 1, M12n = 0, M22n = 1, Kan = 1, Rn = 0, boxGainn = 0;
    bool fresh = true;
    double K11 = 1, sig1 = 0, ws0 = 0, out0 = 0, compModes = 0;
    bool hammerOn = false, contact = false;
    double eta = 0, etaPrev = 0, dPrev = -1, dPrev2 = -1;
    int inFlight = 0, contactSamples = 0;
    double Fmax = 0, lastContactMs = 0;
    bool released = false;
    double damp = 0, dampSet = -1;
    double fade = 1;
    bool fading = false, dead = false;
    double age = 0;
    double E = 0, Emax = 0, Eb = 0, Et = 0;
    double top = 0, floor = 0; // Quality's, when the bar was struck: its highest mode (Hz), and where it is let go (× its most energy)
    Hammer ham{};
    double kOverM = 0, halfAlpha = 0;
    double fd0 = 0, fV0 = 0, fP0 = 0; // the contact's step: compression, potential and δ^p two steps back

    void start(CelestaEngine &eng, const Bar &b, double thickness, double tuned);
    void coefs(const CelestaEngine &eng);
    void box(const CelestaEngine &eng);
    void strike(const CelestaEngine &eng, double velocity);
    double felt(double D) const;
    double contactForce(double dFree, double C);
    void render(float *L, float *R, int n, CelestaEngine &eng);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  Voice *focus = nullptr;

 private:
  const Bar &barFor(int key);
  bool stale(int key) const; // the key's bar is not cut for the thickness and tuning as they stand
  void processBlock(float *L, float *R, int n);
  void postFocus();

  std::array<double, p::count> P{};
  bool hasParams = false;
  // the knobs that glide: gap (m), detune, boxes
  enum { gGap, gDetune, gBoxes, gCount };
  std::array<double, gCount> S{}, T{};
  bool sustain = false;
  NoteExpression expr{0}; // each key's own felt (no bend: a bar is cut to its pitch)
  forte::Tuning tuning; // the keyboard's (forte/tuning.h)
  // each key's bar, built for the thickness in built[] (0: not yet) and the ratio in builtRatio[]
  std::unique_ptr<std::array<Bar, KEY_MAX - KEY_MIN + 1>> bars;
  std::array<double, KEY_MAX - KEY_MIN + 1> built{}, builtRatio{};
  int warm = 0; // the next bar to build ahead, a few per block
  std::array<Voice, POOL> pool{};
  int blocks = 0;
  int hammerMax;
  Message cel; // kept between posts
};

} // namespace forte::celesta
