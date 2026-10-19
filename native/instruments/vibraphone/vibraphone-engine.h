// vibraphone-engine.h — the real-time vibraphone, on the engine contract (forte/engine.h).
//
//   mallet (Hertz contact, implicit) ─▶ bar modes 2–5 and torsion 1–2 (exact two-pole recursions)
//                                    └▶ bar mode 1 ⇄ tube mode 1 (implicit midpoint, coupled through the gap's air)
//   motor ─▶ shaft angle ─▶ each disc's open area ─▶ the tube's end correction and coupling, per sample
//   output = the tube's volume acceleration (a monopole) + each bar mode's own radiation, panned by
//   the bar's place along the frame
//
// One voice per bar: striking a ringing bar hits it where it is. Each bar's modes (a finite-element
// solve, the page's noteData) are built off the audio thread by forte/background.h, for the
// undercut depth the knob is at and the keyboard's tuning (each bar cut to its key's pitch); a note whose bar is not built yet waits for it (a few ms). Voices
// come from a fixed pool: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

#include "forte/background.h"
#include "forte/engine.h"
#include "vibraphone-model.h"
#include "vibraphone-params.h"

namespace forte::vibraphone {

// What the engine posts for the page (vibraphone/src/vibraphone-wasm.js turns them into its
// 'vibe' and 'error' messages).
namespace msg {
enum : uint16_t {
  vibe = 1,  // the focus key (0: none); amp[8], Eb, Et, theta, open, kappa, ft, contactMs, Fmax, shaft, motor, X
  error = 2, // key: a bar's numerical failure
};
}

class VibraphoneEngine : public Engine {
 public:
  static constexpr int MAX_MODES = 8;  // modes per bar (5 bending and 2 torsion)
  static constexpr int POOL = 48;      // voices, sounding or fading (at most 16 sound at once)
  static constexpr int BLOCK_MAX = 1024;
  explicit VibraphoneEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; }
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A bar its page's model built already (packVoiceData; the page's noteData), for the next
  // note on that key, so the audio thread needn't build it. Only without threads (WebAssembly):
  // with them, the worker builds every bar ahead.
  bool offer(const double *packed, int n);

  using Data = KeyData<VoiceData>;
  struct Voice {
    int key = 0, N = 0;
    const VoiceData *d = nullptr;
    Data::Ref ref;
    uint64_t version = 0;
    bool inUse = false;
    std::array<double, MAX_MODES> q{}, q1{}, a1{}, a2{}, bc{}, ws{}, bws{}, accOut{}, sig{};
    std::array<bool, MAX_MODES> cut{}; // modes at or above 0.45 fs: left out, so they cannot alias
    double qb = 0, vb = 0, X = 0, vx = 0;
    // block parameters at the start (…) and end (…n) of the audio block
    double M11 = 1, M12 = 0, M22 = 1, Ka = 1, R = 0, lvS = 0, cdisc = 0, tubeGain = 0, Rd = 0;
    double M11n = 1, M12n = 0, M22n = 1, Kan = 1, Rn = 0, lvSn = 0, cdiscn = 0, tubeGainn = 0, Rdn = 0;
    bool fresh = true;
    double K11 = 1, sig1 = 0, ws0 = 0, out0 = 0, compModes = 0;
    double cph = 1, sph = 0;
    bool malletOn = false, contact = false;
    double eta = 0, etaPrev = 0, dPrev = -1, dPrev2 = -1;
    int inFlight = 0, contactSamples = 0;
    double Fmax = 0, lastContactMs = 0;
    bool released = false;
    double damp = 0, dampSet = -1;
    double fade = 1;
    bool fading = false, dead = false;
    double age = 0;
    double E = 0, Emax = 0, Eb = 0, Et = 0;
    double gl = 0, gr = 0;
    Mallet mal{};
    double kOverM = 0, halfAlpha = 0;
    double fd0 = 0, fV0 = 0, fP0 = 0; // the contact's step: compression, potential and δ^p two steps back

    void start(VibraphoneEngine &eng, Data::Ref r, uint64_t ver);
    void coefs(const VibraphoneEngine &eng);
    void tube(const VibraphoneEngine &eng);
    void strike(const VibraphoneEngine &eng, double velocity);
    double felt(double D) const;
    double contactForce(double dFree, double C);
    void render(float *L, float *R, int n, VibraphoneEngine &eng);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  Voice *focus = nullptr;

 private:
  void strikeKey(int key, double velocity, Data::Ref r);
  void retryPending();
  void shaft(int n);
  void postFocus();
  void processBlock(float *L, float *R, int n);

  std::array<double, p::count> P{};
  bool hasParams = false;
  // the knobs that glide: gap (m), detune, temp, cd, tubes, twist, shaft2
  enum { gGap, gDetune, gTemp, gCd, gTubes, gTwist, gShaft2, gCount };
  std::array<double, gCount> S{}, T{};
  bool sustain = false;
  // the bars' version: a new one when the depth or the tuning changes; its snapshot (a ring, read
  // by the builder) holds what that version's bars are cut for
  uint64_t version = 0;
  double physDepth = 1;
  forte::Tuning physTuning;
  struct Snapshot { std::atomic<double> depth{1}, ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}; };
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
  std::array<double, BLOCK_MAX> sinT{}, cosT{};
  double theta = 0, omega = 0, parkTarget = 0;
  int parkMode = -1;
  Message vibe; // kept between posts
};

} // namespace forte::vibraphone
