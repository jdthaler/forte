// springs-engine.h — the real-time spring keyboard, on the engine contract (forte/engine.h).
//
//   key ─▶ mallet (a half-sine force pulse on the driving bead, shorter when harder)
//       ─▶ 1–3 springs in parallel, each a bank of modes of Wittrick's helical rod
//          (exact two-pole recursions; frequency, group speed and bead coupling from the model)
//       ─▶ the pickup bead at the far end of each spring, each spring panned to its own side
//
// One voice per key. A key's springs (a few hundred eigenproblems and the virtual-pitch tuning: the
// page's noteData) are built off the audio thread by forte/background.h, for the geometry the knobs
// are at; a note whose springs are not built yet waits for them (a few ms). Voices come from a
// fixed pool whose mode arrays are reserved up front in the plugin (grown on demand in the
// WebAssembly, where the Node tests make many engines): nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <vector>

#include "forte/background.h"
#include "forte/engine.h"
#include "springs-model.h"
#include "springs-params.h"

namespace forte::springs {

// What the engine posts for the page (springs/src/springs-wasm.js turns them into its 'echo' and
// 'error' messages).
namespace msg {
enum : uint16_t {
  echo = 1,  // key; n, the velocity: the strike's first n samples are in capture (springs_capture)
  error = 2, // key: a spring's numerical failure
};
}

class SpringEngine : public Engine {
 public:
  static constexpr int MAX_VOICES = 16;  // sounding keys at once
  static constexpr int POOL = 40;        // voices, sounding or fading
  static constexpr int MAX_MODES = 1500; // modes per spring reserved in the plugin (the most, the narrowest Slinky at A0: 1369)
  static constexpr int BLOCK_MAX = 1024;
  static constexpr int CAPTURE = 1 << 15;
  explicit SpringEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; }
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A key's springs its page's model built already (packKeySprings), for the next note on that
  // key, so the audio thread needn't build them. Only without threads (WebAssembly): with them,
  // the worker builds every key ahead.
  bool offer(const double *packed, int n);

  using Data = KeyData<KeySprings>;
  struct Bank {
    const SpringData *sp = nullptr;
    int N = 0, nAct = 0;
    std::vector<double> W, SIG0, C, WD, A1, A2, BC, G, GT, Y1, Y2, AMP, KA;
    std::vector<uint8_t> act;
    std::vector<int> idx;
    double gl = 0, gr = 0;
    void reserve(int n);
    void start(SpringEngine &eng, const SpringData *s, int N, double pl, double pr, double share);
    void sigma(const SpringEngine &eng, double extra, bool fixed = false);
    void gains(const SpringEngine &eng, bool now = false);
    void compact();
  };
  struct Voice {
    int key = 0, nBanks = 0;
    uint64_t id = 0;
    Data::Ref ref;
    bool inUse = false;
    std::array<Bank, 3> banks;
    const SpringData *sp = nullptr; // the first spring
    std::vector<double> pulse;
    int pulseN = 0, pulseAt = 0;
    double tau = 0, age = 0, fade = 1, peak = 0, level = 0, extra = 0, dampGlide = 0.03;
    bool fading = false, dead = false, released = false;

    void start(SpringEngine &eng, int key, Data::Ref r, uint64_t version);
    void strike(SpringEngine &eng, double velocity);
    void render(float *L, float *R, int n, SpringEngine &eng);
    double prune(Bank &b, bool pushing);
    bool anyActive() const;
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  // the page's echo view: the focus strike's first moments
  std::vector<float> capture;
  int capN = 0, capLen = 0, capKey = 0;
  double capVel = 0;

 private:
  friend struct Voice;
  friend struct Bank;
  void strikeKey(int key, double velocity, Data::Ref r);
  void retryPending();
  void finishCapture();
  void processBlock(float *L, float *R, int n);

  std::array<double, p::count> P{};
  // What the keys' springs depend on, for each of the last few versions: the worker builds a
  // version from its snapshot (written by setParams, read without locks, checked by a sequence
  // number); a version that has scrolled out is not built, and a newer one is asked for instead.
  struct Snapshot {
    std::atomic<uint32_t> seq{0};
    std::atomic<uint64_t> version{0};
    std::array<std::atomic<double>, 12> v{};
  };
  std::array<Snapshot, 8> snaps{};
  int snapAt = 0;
  void publish(const Params &g, uint64_t v);
  bool snapshot(uint64_t v, Params &g) const;
  bool hasParams = false;
  // the live knobs, gliding: endLoss, eta, oil, hand (σ), bead
  enum { kEndLoss, kEta, kOil, kHand, kBead, kCount };
  std::array<double, kCount> S{}, T{};
  bool sustain = false, lossMoved = false;
  double dampSigma = 0;
  uint64_t version = 0;
  int lastKey = 60;
  Data data;
  std::unique_ptr<KeySprings> offered;
  std::array<Voice, POOL> pool{};
  Voice *capturing = nullptr;
  // notes whose springs are still being built (only with threads)
  struct Pending { int key; double velocity; bool off; double offVelocity; };
  std::array<Pending, 64> pending{};
  int nPending = 0;
  std::vector<double> buf, force;
  const int pulseMax;
};

} // namespace forte::springs
