// stars-engine.h — the real-time Star Keyboard, on the engine contract (forte/engine.h).
//
//   key ─▶ a star (stars-model.h: its modes, sped up K times into the audio band)
//       ─▶ every mode a damped oscillator (an exact two-pole recursion), kicked once per block by
//          Gaussian noise while the key is down (the convection), or, in a δ Scuti star, growing
//          by itself until the Landau term stops it
//       ─▶ seen at the set inclination, panned by the key's place on the keyboard
//
// One voice per key: pressing a sounding key drives the same star again. Each key's star (the
// page's noteData: a red giant's mixed modes take milliseconds) is built off the audio thread by
// forte/background.h for the kind, mass and speed-up the knobs are at; a note whose star is not
// built yet waits for it. A voice copies its star's modes, from a fixed pool: nothing is
// allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

#include "forte/background.h"
#include "forte/engine.h"
#include "stars-model.h"
#include "stars-params.h"

namespace forte::stars {

// What the engine posts for the page (stars/src/stars-wasm.js turns them into its 'amps' and
// 'error' messages).
namespace msg {
enum : uint16_t {
  ampsPart = 1, // key: the first mode's index; the focus star's observed mode amplitudes, up to 30
  amps = 2,     // key: the focus star's key; N, drive, held, its star's generation (after its parts)
  error = 3,    // key: a star's numerical failure
};
}

class StarEngine : public Engine {
 public:
  static constexpr int POOL = 40;   // voices, sounding or fading (at most 14 sound at once)
  static constexpr int GN = 8192;   // the Gaussian numbers' table
  static constexpr int BLOCK_MAX = 1024;
  explicit StarEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; }
  void allNotesOff() override;
  void pressure(double value, int key) override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A star its page built (the page's noteData, packed: key, K, δ Scuti?, N, then f, l, m,
  // zeta, p, gamma, wEnv, wCore, asat, mult), for the next note on that key, played as the knobs'
  // own star. Only without threads (WebAssembly): with them, the worker builds every star ahead.
  bool offer(const double *packed, int n);
  // Whether a key's star is built for the knobs as they are (asking for it if not): for the tests.
  bool ready(int key) { return hasParams && key >= KEY_LO && key <= KEY_HI && (bool)data.get(key, version); }

  struct Voice {
    int key = 0, N = 0, nAct = 0, nOn = 0;
    uint64_t id = 0; // the star's: its version (or a warm-up star's)
    uint32_t gen = 0; // and the version's generation (for the page: which star it is)
    bool dscuti = false, inUse = false;
    double K = K0;
    std::array<double, MAX_MODES> F0{}, WE{}, WC{}, Pw{}, GAM{}, Z{}, AS{};
    std::array<int, MAX_MODES> L{}, M{}, idx{};
    std::array<uint8_t, MAX_MODES> act{}, on{}; // sounding now; played at all (the Quality's trim)
    std::array<double, MAX_MODES> W{}, C{}, S{}, RHO{}, A1{}, A2{}, Y1{}, Y2{}, G{}, GT{}, AMP{}, ETA{};
    double gl = 0, gr = 0, lift = 1; // lift: the played modes' gain, for the power of those trimmed
    double vel = 0.7, pressure = 1, age = 0, fade = 1, peak = 1e-12, level = 0;
    bool held = false, fading = false, dead = false;
    Rng seed{1};

    void start(StarEngine &eng, int key, const Star &d, uint64_t id);
    void compact();
    void trim(StarEngine &eng);
    void freqs(const StarEngine &eng);
    void coeffs(const StarEngine &eng);
    void gains(const StarEngine &eng, bool now);
    void addC(int i, double u, double v);
    double amp2(int i) const;
    void press(const StarEngine &eng, double velocity);
    void render(float *Lo, float *Ro, int n, StarEngine &eng);
    void landau(const StarEngine &eng, int n, bool driving);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  Voice *focus = nullptr;

 private:
  friend struct Voice;
  using Data = KeyData<Star>;
  void startNote(int key, double velocity, const Star &d, uint64_t id);
  void retryPending();
  void table();
  void warmUp();
  void processBlock(float *L, float *R, int n);
  void postFocus();

  std::array<double, p::count> P{};
  bool hasParams = false;
  // the knobs that glide (targets T and present values S)
  enum { kSpin, kCore, kIncl, kDamping, kDriving, kFlare, kGrowth, kCount };
  std::array<double, kCount> S{}, T{};
  bool sustain = false, freqMoved = false, dampMoved = false, inclMoved = false;
  uint32_t presses = 0, rs = 0x2545f491;
  double postT = 0;
  std::array<double, 28> gtab{}; // √(V_l² E_lm(i)) at [l·7 + m + 3]
  std::array<double, GN> gauss{};
  std::array<Voice, POOL> pool{};
  std::array<float, MAX_MODES> ampOut{};
  std::array<double, BLOCK_MAX> buf{}; // a voice's block, before its pan
  std::array<double, MAX_MODES> rank{}; // scratch: the modes' powers, for the Quality's trim

  // each key's star, built off the audio thread for the kind, mass, speed-up and tuning (each pitch
  // class's ratio) of a version
  struct Snapshot { std::atomic<uint64_t> version{0}; std::atomic<double> family{0}, mass{1}, speedup{K0}, ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}; };
  std::array<Snapshot, 8> snapshots;
  int snapAt = 0;
  uint64_t version = 0;
  uint32_t generation = 0; // counts the versions: 0 for the first parameters, then one more at each change
  Data data;
  Star offered;
  bool hasOffer = false;
  // notes whose star is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 64> pending{};
  int nPending = 0;
  std::unique_ptr<Star> warm[2]; // the warm-up's made-up stars
};

} // namespace forte::stars
