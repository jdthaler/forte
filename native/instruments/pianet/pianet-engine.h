// pianet-engine.h — the real-time sticky-pad piano, on the engine contract (forte/engine.h): one
// sticky-pad mechanism per key (pianet-model.h), the pickup, the output network and an optional
// valve combo.
//
//   key ─▶ holder ─▶ foam + tacky bond ─▶ reed modes (2× oversampled) ─▶ pickup: Σ dΦ/dt through the
//   coils (T) or the plate rail's ΔC (N) ─▶ valve drive ─▶ decimating FIR ─▶ tone RC ─▶ speaker
//
// Each key's reed (a finite-element solve, cut to pitch) is built off the audio thread by
// forte/background.h for the tip mass and loss the knobs are at; a note whose reed is not built
// yet waits for it (a millisecond or so). Voices come from a fixed pool: nothing is allocated in
// process(). Mono: both channels carry the same signal.
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "forte/background.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "pianet-model.h"
#include "pianet-params.h"

namespace forte::pianet {

// What the engine posts for the page (pianet/src/pianet-wasm.js turns them into its 'release'
// and 'error' messages).
namespace msg {
enum : uint16_t {
  release = 1, // key; y, F, v, t, V at the moment the pad let go
  error = 2,   // key: numerical instability
};
}

class PianetEngine : public Engine {
 public:
  static constexpr int OS = 2;
  static constexpr int POOL = 96;        // voices, sounding or fading (40 sound at most, then the quietest goes)
  static constexpr int BLOCK_MAX = 4096; // the buffers' length: blocks longer than this are split
  // semitones: one note's own bend (MPE) at most. The pad's preload and tack are forces, so a reed
  // softened by r² is held and pulled 1/r² as far: an octave down, a forte note already swings
  // into the T's pole piece up to C5 and plays up to 4× louder; two octaves down, past every gap.
  static constexpr double NOTE_BEND = 12;
  explicit PianetEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void bend(double value) override; // every reed's stiffness ×r², its notes ×r
  void noteBend(double ratio, int key) override; // one reed's stiffness ×r², on top of the wheel's
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // whether key's reed is built for the knobs as they are (the tests wait for it)
  bool ready(int key) { return bool(data.get(key, version)); }

  using Data = KeyData<KeyReed>;
  struct Voice {
    int key = 0;
    uint64_t version = 0;
    Data::Ref ref;
    bool inUse = false;
    Pluck p;
    double own = 1; // its own bend (MPE), gliding to its key's: p.bend is the wheel's × this
    double pol = 1;
    bool held = false, posted = false, sleep = false;
    int quiet = 0;
    bool pending = false; // a re-press waiting for its pad to land and re-tack
    double pressVel = 0;
    int wait = 0;
    double fade = 1;
    bool dying = false, dead = false;
    double g = 0, g1 = 0, ye = 0, ye1 = 0, gT = 0, yeT = 0, c0 = 0;
    double phiPrev = 0, dC = 0;

    void start(PianetEngine &eng, int key, Data::Ref r);
    void setPickup(const PianetEngine &eng, bool now = false);
    void retire() { dying = true; }
  };

 private:
  void startNote(int key, double velocity, Voice *v);
  void retryPending();
  void glide(Voice &v, int n2, bool es);
  void processBlock(float *L, float *R, int n);
  PadParams pad() const { return {P[p::tack], P[p::rate], P[p::padK], P[p::padC]}; }

  const double fs2;
  std::array<double, p::count> P{};
  bool hasParams = false;
  // the reeds, built off the audio thread for each version of (tip mass, loss, the tuning)
  struct Snapshot { std::atomic<double> tipMass{1}, loss{1e-3}, ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}; };
  Tuning physTuning;
  std::array<Snapshot, 8> snapshots;
  uint64_t version = 0;
  Data data;
  int lastKey = 60;

  std::array<Voice, POOL> pool{};
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  bool sustain = false;
  // notes whose reed is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 64> pending{};
  int nPending = 0;

  std::array<double, OS * BLOCK_MAX> mono{}, dCs{};
  int pick = pickup_::em;
  double duck = 1;
  double bendTo = 1, bendNow = 1; // pitch bend: the ratio, and where the glide is
  NoteExpression expr{NOTE_BEND};  // each key's own bend (MPE)
  PlateRail rail;
  double glideA, mix = 0, mixStep, duckStep;
  int waitMax;
  static constexpr int T = 63;
  std::array<double, T> fir{};
  std::array<double, 256> hist{};
  int hi = 0;
  Biquad coil;
  OnePole toneLP;
  std::array<Biquad, 4> spk{};
  double driveK = 1, driveN = 1;
};

} // namespace forte::pianet
