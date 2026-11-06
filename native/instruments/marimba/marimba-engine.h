// marimba-engine.h — the real-time marimba and xylophone, on the engine contract (forte/engine.h).
//
//   mallet (power-law contact, implicit) ─▶ bar modes 3–5 and torsion 1–2 (exact two-pole recursions)
//                                       └▶ bar mode 1 ⇄ the tube's first resonance  } implicit midpoint, each
//                                       └▶ bar mode 2 ⇄ the tube's second (3 × f₁)  } pair through the gap's air
//   output = the tubes' volume acceleration (a monopole) + each bar mode's own radiation, panned by
//   the bar's place along the frame
//
// One voice per bar: striking a ringing bar hits it where it is, and a held key rolls (the two
// mallets in turn) as long as the roll is up. Each bar's modes (a finite-element solve, the page's
// noteData) are built off the audio thread by forte/background.h for the instrument, the undercut
// depth and the keyboard's tuning; a note whose bar is not built yet waits for it (a few ms).
// Voices come from a fixed pool: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

#include "forte/background.h"
#include "forte/engine.h"
#include "forte/lift.h"
#include "forte/press.h"
#include "forte/expression.h"
#include "marimba-model.h"
#include "marimba-params.h"

namespace forte::marimba {

// What the engine posts for the page (marimba/src/marimba-wasm.js turns them into its 'bar' and
// 'error' messages).
namespace msg {
enum : uint16_t {
  bar = 1,   // the focus key (0: none); amp[8], Eb, Et, X1, X2, kappa1, kappa2, ft1, ft2, contactMs, Fmax
  error = 2, // key: a bar's numerical failure
};
}

class MarimbaEngine : public Engine {
 public:
  static constexpr int MAX_MODES = 8;  // modes per bar (5 bending and 2 torsion)
  static constexpr int PAIRS = 2;      // bar modes 1 and 2, each with a tube resonance
  static constexpr int POOL = 48;      // voices, sounding or fading (at most 16 sound at once)
  explicit MarimbaEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void slide(double value, int key) override { expr.setSlide(value, key); } // the key's own roll
  void pressure(double value, int key) override { presses.set(value, key); } // the mallet pressed into the bar: the dead stroke
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A bar its page's model built already (packVoiceData; the page's noteData), for the next
  // note on that key, so the audio thread needn't build it. Only without threads (WebAssembly):
  // with them, the worker builds every bar ahead.
  bool offer(const double *packed, int n);

  using Data = KeyData<VoiceData>;
  // A bar mode and a tube resonance sharing the air in the gap: q, v the bar mode's displacement
  // and velocity, X, vx the tube's volume and its rate, and the implicit midpoint's matrix.
  struct Pair {
    bool on = false;
    double q = 0, v = 0, X = 0, vx = 0;
    double M11 = 1, M12 = 0, M22 = 1, K11 = 1, Ka = 1, c1 = 0, R = 0, k11 = 1, k22 = 1;
    double a11 = 1, a12 = 0, a22 = 1, id = 1, ws = 0, out = 0, kappa = 0, ft = 0;
  };
  struct Voice {
    int key = 0, N = 0;
    const VoiceData *d = nullptr;
    Data::Ref ref;
    uint64_t version = 0;
    bool inUse = false;
    std::array<Pair, PAIRS> pair{};
    std::array<double, MAX_MODES> q{}, q1{}, a1{}, a2{}, bc{}, ws{}, bws{}, accOut{};
    std::array<bool, MAX_MODES> cut{}; // modes at or above 0.45 fs (or Quality's top): left out, so they cannot alias
    double tubeGain = 0, compModes = 0;
    bool malletOn = false, contact = false;
    double eta = 0, etaPrev = 0, dPrev = -1, dPrev2 = -1;
    int inFlight = 0, contactSamples = 0, strokes = 0; // strokes: since the key went down (the tests count a roll's)
    double Fmax = 0, lastContactMs = 0;
    bool held = false, hand = false;     // the key is down; which mallet strikes next in a roll
    double vel = 0, rollIn = 0; // the first stroke's velocity, samples to the next stroke
    double fade = 1;
    Press press;     // the mallet pressed into the bar while its key is held: the dead stroke (forte/press.h)
    LiftTouch touch; // a mallet resting on the bar a moment after a fast lift (forte/lift.h)
    bool fading = false, dead = false;
    double age = 0;
    double E = 0, Emax = 0, Eb = 0, Et = 0;
    double top = 0, floor = 0; // Quality's, when the bar was struck: its highest mode (Hz), and where it is let go (× its most energy)
    double gl = 0, gr = 0;
    Mallet mal{};
    double kOverM = 0, halfAlpha = 0;
    double fd0 = 0, fV0 = 0, fP0 = 0; // the contact's step: compression, potential and δ^p two steps back

    void start(MarimbaEngine &eng, Data::Ref r, uint64_t ver);
    void coefs(const MarimbaEngine &eng);
    void tube(const MarimbaEngine &eng);
    void strike(const MarimbaEngine &eng, double velocity);
    double felt(double D) const;
    double contactForce(double dFree, double C);
    void render(float *L, float *R, int n, MarimbaEngine &eng);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  Voice *focus = nullptr;

 private:
  void strikeKey(int key, double velocity, Data::Ref r);
  void retryPending();
  void rolls(int n);
  double rollOf(const Voice &v) const;
  void postFocus();

  std::array<double, p::count> P{};
  bool hasParams = false;
  // the knobs that glide: gap (m), detune, offset, tubes
  enum { gGap, gDetune, gOffset, gTubes, gCount };
  std::array<double, gCount> S{}, T{};
  // the bars' version: a new one when the instrument, the depth or the tuning changes; its
  // snapshot (a ring, read by the builder) holds what that version's bars are cut for
  uint64_t version = 0;
  int physKind = 0;
  double physDepth = 1;
  forte::Tuning physTuning;
  struct Snapshot { std::atomic<int> kind{0}; std::atomic<double> depth{1}, ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}; };
  std::array<Snapshot, 8> snapshots;
  Data data;
  std::unique_ptr<VoiceData> offered;
  std::array<Voice, POOL> pool{};
  // notes whose bar is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 64> pending{};
  int nPending = 0;
  int blocks = 0;
  int malletMax;
  uint32_t rng = 0x2545F491u;
  Presses presses; // each key's pressure and the channel's
  NoteExpression expr{0}; // each key's own roll (no bend: a struck bar rings at its own pitch)
  Message barMsg; // kept between posts
};

} // namespace forte::marimba
