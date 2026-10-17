// harpsichord-engine.h — the real-time harpsichord (harpsichord/src/harpsichord-engine.js in C++),
// on the engine contract (forte/engine.h).
//
//   key ─▶ its jacks rise at the key's speed ─▶ each engaged plectrum catches its string, slides
//          along and slips off (plucked-string.h: implicit contacts, every sample)
//   key up ─▶ the jacks fall: plectra brush past on their tongues, the dampers land
//   strings (front 8′, back 8′, 4′) ─▶ bridge force at their bridge points (5 segments)
//   soundboard: plate modes driven by the segments, two microphones over it, plus a residual path
//          above its modal band
//   knocks: the key landing on its cloth, the jack dropping back, into the board
//
// One voice per key: it holds that key's strings (made when first plucked) and its jacks. Pressing
// a sounding key again plucks the same strings. Physics knobs (tuning, scale, losses) give the next
// press a new voice and fade the old one. Each key's strings (their design and partials, the
// soundboard's admittance at every partial) are built off the audio thread by forte/background.h
// for the physics knobs as they stand; a note whose key is not built yet waits for it (a few ms).
// Voices come from a fixed pool: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "forte/background.h"
#include "forte/engine.h"
#include "harpsichord-model.h"
#include "harpsichord-params.h"

namespace forte::harpsichord {

// What the engine posts for the page (harpsichord/src/harpsichord-wasm.js turns them back into the
// JavaScript engine's 'pluck' and 'error' messages).
namespace msg {
enum : uint16_t {
  pluck = 1, // a plectrum let go: key; choir (0 front, 1 back, 2 the 4′), lute, F, u, w, s, theta, x
  error = 2, // key: a voice's numerical instability
};
}

// One key's strings for a version of the physics knobs: each choir's design and partials.
struct KeyStrings {
  std::array<StringDesign, 3> S;
  std::array<Partials, 3> parts;
};

class HarpsichordEngine : public Engine {
 public:
  static constexpr int BLOCK = 128;  // the block the JavaScript runs in (the worklet's)
  static constexpr int POOL = 48;    // voices, sounding or fading
  explicit HarpsichordEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // the key's strings are built for the knobs as they stand (tests: in WebAssembly, always)
  bool ready(int key) { return bool(data.get(key, version)); }

  using Data = KeyData<KeyStrings>;
  struct Voice {
    HarpsichordEngine *eng = nullptr;
    bool inUse = false;
    int key = 0;
    uint64_t version = 0;
    Data::Ref ref;
    std::array<PluckedString, 3> strings;      // by choir, made when first plucked
    std::array<bool, 3> has{}, lifts{}, sleep{};
    std::array<int, 3> quiet{}, w0{}, w1{};
    std::array<std::array<double, NSEG>, 3> w{}; // each string's segment weights
    std::array<int, 3> list{};                 // the strings in the order they were made
    int nList = 0;
    double lift = 0, V = 0.3, vDown = 0, top = 0;
    bool keyDown = false, pending = false;
    int knockT = -1, knockN = 2;
    double knockAmp = 0;
    bool killing = false, dead = false, sounded = false;
    double peak = 0, age = 0;
    std::array<double, NSEG> kw{};

    void start(HarpsichordEngine &e, int k, Data::Ref r);
    void press(double vel);
    void release(double r);
    void kill();
    void render(int n);
    void knock(double J);
  };

  // read by the tests (through the WebAssembly's hooks), in the JavaScript engine's order
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};

 private:
  friend struct Voice;
  // The soundboard: plate modes driven at the bridge points, heard as acceleration × each mode's
  // weight at two microphones, plus the residual path of the modes above the bank.
  struct Board {
    int K = 0;
    std::array<double, BOARD::maxModes> e0{}, e1{}, a1{}, a2{}, ml{}, mr{};
    std::array<double, BOARD::maxModes * NSEG> ph{};
    double fb = 0, lpG = 0;
    std::array<double, NSEG> lp{};
    std::array<double, 2 * NSEG> res{};
    double b0 = 0, b1 = 0, b2 = 0, ha1 = 0, ha2 = 0; // the residual's high-pass
    std::array<double, 8> hz{};
    void init(double fs);
    void run(const double *seg, double *L, double *R, int n);
  };

  void processBlock(float *L, float *R, int n);
  void steal(Voice *keep);
  void retryPending();
  void begin(int key, double velocity, Data::Ref r); // noteOn once the key's strings are there
  void pluckInfo(Voice &v, PluckedString &st, int p);
  static void onRelease(void *ctx, PluckedString &st, int p);

  std::array<double, p::count> P{};
  Params mp;
  bool hasParams = false;
  std::array<double, 6> physSig{};
  uint64_t version = 0;
  // the strings, built off the audio thread for each version of the physics knobs
  struct Snapshot { std::atomic<double> pitch{440}, temperament{0}, detune{0}, loss{1}, fmax{10}; };
  std::array<Snapshot, 8> snapshots;
  Data data;
  int focus = 60;
  std::array<Voice, POOL> pool{};
  // notes whose key is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; double relVel; };
  std::array<Pending, 64> pending{};
  int nPending = 0;

  std::array<double, NSEG * BLOCK> seg{};
  std::array<double, BLOCK> liftBuf{}, zeroBuf{}, buffBuf{}, bL{}, bR{};
  Board board;
  double buff = 0, mix = 1, glide = 0;
  Message pluckMsg;
};

} // namespace forte::harpsichord
