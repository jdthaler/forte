// piano-engine.h — the real-time Ribbon Piano, on the engine contract (forte/engine.h): modal
// synthesis of hammered strings.
//
// Each sounding key is a Voice: all modes of all unison strings and all motion families of that
// key, integrated sample by sample:
//
//   q[n+1] = a1 q[n] − a2 q[n−1] + b·f[n]        (exact for a damped mode)
//   f      = −c_v S_v − c_h S_h                   (resistive bridge: S = Σ c q̇, shared by every mode)
//          +  w F                                 (felt hammer, only while it is in flight)
//
// The hammer is a mass on a nonlinear hysteretic felt spring, F = K [δ^p + α d(δ^p)/dt]₊, solved
// implicitly each sample (scalar Newton). Modes are stored in four contiguous segments by the
// bridge channels they touch: V only | H only | V and H | torsion (output only).
//
// Each key's voice data (piano-model.h, the page's noteData) is built off the audio thread by
// forte/background.h for the 'model' parameters as they stand; a note whose key is not built yet
// waits for it (a few ms). The WebAssembly has no threads: the page builds the data with its own
// WebAssembly model and offers it with the note, or ahead of it (offer), and the engine keeps the
// last data sent per key. Voices come from a fixed pool and their modes from a fixed arena:
// nothing is allocated in process().
//
// Sympathetic strings (forte/sympathetic.h): every key whose damper is up (the pedal, a held key,
// the undamped treble) rings along through the bridge, as a group of its unison's lowest partials
// driven by the bridge signals S_V, S_H of every voice and group but its own key's.
#pragma once

#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>

#include "forte/background.h"
#include "forte/engine.h"
#include "forte/longitudinal.h"
#include "forte/sympathetic.h"
#include "piano-model.h"
#include "piano-params.h"

namespace forte::piano {

// What the engine posts for the page (piano/src/piano-wasm.js turns them into its 'hammer' and
// 'error' messages).
namespace msg {
enum : uint16_t {
  hammer = 1, // key: the hammer left the string; contactMs, Fmax
  error = 2,  // key: numerical instability, the voice is silenced
};
}

class PianoEngine : public Engine {
 public:
  static constexpr int POOL = 160;        // voices, sounding or dying
  static constexpr int ARENA = 16384;     // modes across every voice
  static constexpr int ARRAYS = 21;       // per-mode arrays in a voice's block of the arena
  static constexpr int MAXB = 256;        // render in chunks of at most this many samples
  explicit PianoEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override; // velocity: the hammer's speed in m/s
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A key's voice data from the page (packVoiceData), kept for that key's notes until the next
  // is sent. Only without threads (WebAssembly).
  bool offer(const double *packed, int n);
  void offers() {
#if !FORTE_THREADS
    offering = true;
#endif
  }
  double *offerBuffer(int n); // where the page writes it (allocates; not on the audio path)
  int modeCount() const;

  struct Voice {
    int key = 0, N = 0, e0 = 0, e1 = 0, e2 = 0;
    uint64_t version = 0;
    bool inUse = false;
    int at = 0; // its block in the arena
    double k = 0;
    // per-mode arrays (in the arena); q and q1 swap every sample
    double *q = nullptr, *q1 = nullptr, *a1 = nullptr, *a2 = nullptr, *a1d = nullptr, *a2d = nullptr;
    double *wN = nullptr, *bwN = nullptr, *wU = nullptr, *bwU = nullptr, *fbv = nullptr, *fbh = nullptr;
    double *cvk = nullptr, *chk = nullptr, *ctk = nullptr, *om = nullptr, *sig = nullptr, *perm = nullptr;
    // tension modulation: each mode's stretch weight g, its a1's change per newton (b·g), its
    // string; the modes of a segment are in runs by string, run[seg][u] to run[seg][u + 1]
    double *gw = nullptr, *eps = nullptr, *us = nullptr;
    double kcGain = 0, Tt = 0, dT[3] = {0, 0, 0};
    int nu = 1, run[4][4] = {};
    bool stretched = false; // still stretched enough to matter (the strike sets it; the decay clears it)
    // longitudinal modes (forte/longitudinal.h): the force along the string at the bridge
    Longitudinal lon;
    void startLong(const PianoEngine &eng, const VoiceData &d);
    const double *w = nullptr, *bw = nullptr;
    double compN = 0, compU = 0, comp = 0, KU = 0, hK = 0;
    struct { double mass, K, p, alpha; } hammer{};
    double outV = 0, outH = 0;
    bool hasDamper = true;
    double sv = 0, sh = 0;
    bool keyDown = true, damped = false, killing = false, dead = false, hammerOn = false, contact = false;
    int contactSamples = 0, hammerSamples = 0, quiet = 0;
    double Fmax = 0, peak = 0, age = 0, damperSigma = 0;
    double panL = 0, panR = 0, tPanL = 0, tPanR = 0;
    bool panMoving = false;
    double eta = 0, etaPrev = 0, dPrev = -1, kOverM = 0, alphaK = 0;
    // its bridge signals S_V, S_H as the next steps feel them: [0] the last block's last, [s + 1] step s's
    std::array<double, MAXB + 1> bv{}, bh{};
    int bn = 0;

    void start(PianoEngine &eng, int key, const VoiceData &d, int at);
    void setDamperSigma(double sd) { damperSigma = sd; computeDamped(); }
    void computeDamped();
    void setPan(const PianoEngine &eng, bool snap = false);
    void updateDamping(const PianoEngine &eng);
    void kill();
    void strike(double v, bool unaCorda);
    double contactForce(double dFree);
    void render(float *L, float *R, int n, PianoEngine &eng);
    void modeAmplitudes(const PianoEngine &eng, double *out) const; // in the voice data's order
  };

  // read by the tests and the slow-motion view (through the WebAssembly's hooks), in the order
  // they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  double maxModes = 4500; // CPU budget (total oscillators across all voices)
  bool overBudget = false;
  // Quality (forte/engine.h): Medium and Low strike a voice with fewer modes (none above fTop()
  // but a family's first eight, which carry the treble's tone and its blow; none beyond the
  // nTop()-th, the faint top of the bass), give it a smaller share of the budget, let a fading
  // voice go sooner, and give each sympathetic string fewer partials (Medium) or none (Low)
  double fTop() const { return pick<double>(INFINITY, 7000, 5000); }
  int nTop() const { return pick(1 << 30, 80, 56); }
  bool keeps(const VoiceData &d, int j) const { return d.idx[j] < nTop() && (d.freq[j] < fTop() || d.idx[j] < 8); }
  int kept(const VoiceData &d) const;
  Voice *last = nullptr;  // the voice the latest noteOn struck
  // the sympathetic strings: a group per key (the tests read it)
  static constexpr int SYM_MODES = 16;     // partials per key
  static constexpr double SYM_FMAX = 4000; // Hz: none above
  Sympathetic sym;
  int symModes() const { return pick(SYM_MODES, 3, 0); }
  // and the longitudinal modes from fewer partials (Medium) or none (Low)
  int longPartials() const { return pick(Longitudinal::PARTIALS, 12, 0); }
  int longModes() const { return pick(Longitudinal::MODES, 2, 0); }
  bool symReady(int key) const { return symVer[key] != 0; }

 private:
  using Data = KeyData<VoiceData>;
  void strikeKey(int key, double velocity, const VoiceData &d);
  void retryPending();
  void enforceBudget(const Voice *keep);
  int allocate(int n); // a free block of n modes in the arena, or −1
  void snapGains();
  void symFetch();                                  // the groups' partials, from each key's data
  void symSet(int key, const VoiceData &d, uint64_t ver);
  void symRun(float *L, float *R, int n, const double *GV, const double *GH);

  std::array<double, p::count> P{};
  bool hasParams = false;
  bool sustain = false;
  const double k;
  const int hammerMaxSamples;
  const double aSm; // one-pole glide of live gains and pan (no zipper noise)
  double sV = 0, sH = 0, sT = 0;
  std::array<double, MAXB> gV{}, gH{}, gT{};
  // per key: held down; whether it has a damper; the version its group was built from (0: none);
  // its output gains; its voices' bridge signals (a key may have an old voice still fading)
  std::array<uint8_t, 128> down{}, symDamper{};
  std::array<uint64_t, 128> symVer{};
  std::array<double, 128> symOV{}, symOH{};
  std::array<std::array<double, MAXB + 1>, 128> ownV{}, ownH{};
  std::array<int, 128> ownAt{};
  int symNext = 0, symStamp = 0;
  double symDamperSigma = -1, symWidth = -1;
  Quality symQuality = Quality::high; // the Quality the groups were built at
  bool symHush = false; // Panic: the groups wait for the voices to fade
  std::array<double, MAXB + 1> tV{}, tH{};
  std::array<std::array<double, MAXB>, 4> bus{}; // V left, V right, H left, H right

  // the voice data, built off the audio thread for each version of the model parameters
  struct Snapshot { std::atomic<uint64_t> version{0}; std::array<std::atomic<double>, p::count> P{}; };
  std::array<Snapshot, 8> snapshots;
  int snapAt = 0;
  uint64_t version = 0;
  int focus = 60;
  Data data;
#if !FORTE_THREADS
  std::array<std::unique_ptr<VoiceData>, 128> sent{};
  bool offering = false; // the page offers every key's data (else the groups build their own)
  int blocks = 0;
  std::vector<double> offered;
#endif
  std::array<Voice, POOL> pool{};
  int nextSlot = 0;
  std::vector<double> arena;
  // notes whose key is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 64> pending{};
  int nPending = 0;

  friend struct Voice;
};

} // namespace forte::piano
