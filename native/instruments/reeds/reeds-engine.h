// reeds-engine.h — the real-time reed piano, on the engine contract (forte/engine.h):
//
//   reeds (modes + felt hammer) ─▶ C(y) of each reed in its slot ─▶ Σ δC
//   ─▶ comb node (R·C0 high-pass) ─▶ preamp × tremolo (LED + photocell)
//   ─▶ preamp saturation ─▶ ↓2 ─▶ speakers (two 4"×8" ovals) or direct out
//
// The reeds and everything up to the decimator run 2× oversampled. The gap and the reed's rest
// height glide (the C(y) table is blended from block to block), and switching outputs crossfades.
//
// Each key's reed (keyModel, the page's noteData) is built off the audio thread by
// forte/background.h for the solder, strike and hardness the knobs are at; a note whose reed is
// not built yet waits for it (a few ms). The WebAssembly has no threads: the page builds the reed
// with its own WebAssembly model and offers it with the note (offer), as the vibraphone's bars.
// Voices come from a fixed pool and copy their reed's few modes: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

#include "forte/background.h"
#include "forte/dsp.h"
#include "forte/engine.h"
#include "reeds-model.h"
#include "reeds-params.h"

namespace forte::reeds {

class ReedEngine : public Engine {
 public:
  static constexpr int OS = 2;
  static constexpr int BLOCK = 128;   // samples per block at the output rate (longer calls are split)
  static constexpr int POOL = 96;     // voices, sounding or fading
  explicit ReedEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A reed its page's model built already (packVoiceData; the page's noteData), for the next
  // note on that key, so the audio thread needn't build it. Only without threads (WebAssembly):
  // with them, the worker builds every key ahead.
  bool offer(const double *packed, int n);

  struct Voice {
    int key = 0, N = 0;
    uint64_t version = 0;
    bool inUse = false;
    double k = 0;
    std::array<double, MAX_MODES> q{}, q1{}, a1{}, a2{}, a1d{}, a2d{}, w{}, bw{}, pk{}, bp{}, om{}, sig{}, dw{};
    double comp = 0, cStop = 0, stopDen = 1;
    int hits = 0;
    Hammer hammer{};
    bool keyDown = true, damped = false, killing = false, dead = false, hammerOn = false, contact = false;
    int quiet = 0, hammerSamples = 0, contactSamples = 0;
    double peak = 0, yMin = 0, yMax = 0, Fmax = 0;
    double eta = 0, etaPrev = 0, dPrev = -1, dPrev2 = -1, kOverM = 0, halfAlpha = 0;
    double fd0 = 0, fV0 = 0, fP0 = 0; // the contact's previous-but-one step: compression, potential, δ^p

    void start(const ReedEngine &eng, int key, const VoiceData &d);
    void setDamper(double sd);
    void updateDamping(const ReedEngine &eng) { damped = killing || (!keyDown && !eng.sustain); }
    void kill(const ReedEngine &eng);
    void strike(double v);
    double contactForce(double dFree);
    double felt(double D) const;
    void render(double *buf, int n, const ReedEngine &eng);
  };

  // read by the tests and the views (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  // the engine's state the tests read (fs2, the slot, the comb node)
  const double fs2;
  const int hammerMax;
  double damperSigma = LOSS.damper;
  double kF = 0, nodeA = 0, nodeB = 0;
  double *capA, *capB; // C(y) for the current gap and, while it glides, the next block's
  double y0 = 0, y0N = 0, cRest = 0, cRestN = 0, dRest = 0, dRestN = 0;
  bool blend = false, twoTables = false, sustain = false;
  // A test's own signal added to the comb's δC (2 × the block's samples), once, in the next block.
  std::array<double, BLOCK * OS> extra{};
  bool hasExtra = false;

 private:
  using Data = KeyData<VoiceData>;
  void strikeKey(int key, double velocity, const VoiceData &d);
  void retryPending();
  void restAt(const double *c, double y, double &C, double &D) const;
  void processBlock(float *L, float *R, int n);
  Voice *allocate();

  std::array<double, p::count> P{};
  bool hasParams = false;
  const int maxVoices = 32;
  std::array<double, BLOCK * OS> mono{};
  // decimator: Blackman-windowed sinc, symmetric (applied folded)
  static constexpr int T = 47;
  std::array<double, T> fir{};
  std::array<double, 128> hist{};
  int hi = 0;
  double u = 0, xPrev = 0, ldr = 0, tremPhase = 0;
  DCBlock dc;
  std::array<Biquad, 4> spk{};
  double hpA = 0, hpX1 = 0, hpY1 = 0;
  std::array<double, SLOT_Y.n> capTables[2]{};
  double gap = 0, gapT = 0, gapN = 0, y0T = 0;
  double mix = 1, mixStep;
  double drive = 1, tremInc = 0, ldrOn = 0, ldrOff = 0;

  // the reeds, built off the audio thread for each version of solder, strike and hardness
  struct Snapshot { std::atomic<uint64_t> version{0}; std::atomic<double> solder{1}, strike{0.4}, hardness{1}; };
  std::array<Snapshot, 8> snapshots;
  int snapAt = 0;
  uint64_t version = 0;
  int focus = 60;
  Data data;
  std::unique_ptr<VoiceData> offered;
  std::array<Voice, POOL> pool{};
  int nextSlot = 0;
  // notes whose reed is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 64> pending{};
  int nPending = 0;
};

} // namespace forte::reeds
