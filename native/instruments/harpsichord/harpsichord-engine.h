// harpsichord-engine.h — the real-time harpsichord, on the engine contract (forte/engine.h).
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
//
// Sympathetic strings (forte/sympathetic.h): while a key is held, its strings whose jacks have risen
// (their dampers off them) ring along through the bridge with every other string sounding, plucked
// or not: a group of each such string's lowest partials, driven by the bridge signals of every
// voice's strings and group but its own.
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "forte/background.h"
#include "forte/engine.h"
#include "forte/sympathetic.h"
#include "harpsichord-model.h"
#include "harpsichord-params.h"

namespace forte::harpsichord {

// What the engine posts for the page (harpsichord/src/harpsichord-wasm.js turns them into its
// 'pluck' and 'error' messages).
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
  static constexpr int BLOCK = 128;  // the worklet's block
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
  // the sympathetic strings: a group per key and choir (key·3 + choir; the tests read it)
  static constexpr int SYM_MODES = 16;     // partials per string
  static constexpr double SYM_FMAX = 4000; // Hz: none above
  Sympathetic sym;
  // Quality (forte/engine.h): Medium and Low sound fewer keys at once, make a string with fewer
  // partials (none above fTop() but its first sixteen, none beyond the nTop()-th), stop its fading
  // top partials sooner, give each sympathetic string fewer partials (Medium) or none (Low), and
  // each string fewer sideways partials (Medium) or none (Low)
  int maxVoices() const { return pick(16, 12, 8); }
  int hardVoices() const { return pick(24, 16, 10); }
  double fTop() const { return pick<double>(INFINITY, 7000, 5000); }
  int nTop() const { return pick(N_MAX, 64, 40); }
  int kept(const Partials &pt) const;
  int symModes() const { return pick(SYM_MODES, 3, 0); }
  int sideModes() const { return pick(NZ_MAX, 8, 0); } // each string's sideways partials

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
    // each string's bridge signal Σ c Δq/h: [0] the last block's last step, [t + 1] step t's
    std::array<std::array<double, BLOCK + 1>, 3> sb{};
    int sbn = 0;

    void start(HarpsichordEngine &e, int k, Data::Ref r);
    void press(double vel);
    void release(double r);
    void kill();
    void render(int n);
    void knock(double J);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};

 private:
  friend struct Voice;
  // The soundboard: plate modes driven at the bridge points, heard as acceleration × each mode's
  // weight at two microphones, plus the residual path of the modes above the bank. One for the
  // harpsichord (and the lute-harpsichord), one for the virginal: the build plays on its own.
  struct Board {
    int K = 0;
    std::array<double, BOARD::maxModes> e0{}, e1{}, a1{}, a2{}, ml{}, mr{};
    std::array<double, BOARD::maxModes * NSEG> ph{};
    double fb = 0, lpG = 0;
    std::array<double, NSEG> lp{};
    std::array<double, 2 * NSEG> res{};
    double b0 = 0, b1 = 0, b2 = 0, ha1 = 0, ha2 = 0; // the residual's high-pass
    std::array<double, 8> hz{};
    void init(double fs, int which); // which: boardModel's (0 the harpsichord's, 1 the virginal's)
    void run(const double *seg, double *L, double *R, int n);
    void clear() { e0.fill(0); e1.fill(0); lp.fill(0); hz.fill(0); }
  };

  void processBlock(float *L, float *R, int n);
  void steal(Voice *keep);
  void retryPending();
  void begin(int key, double velocity, Data::Ref r); // noteOn once the key's strings are there
  void pluckInfo(Voice &v, PluckedString &st, int p);
  void symSet(int key, const KeyStrings &d, uint64_t ver); // a key's groups, from its strings
  void symRun(int n);
  static void onRelease(void *ctx, PluckedString &st, int p);

  std::array<double, p::count> P{};
  Params mp;
  bool hasParams = false;
  std::array<double, 5> physSig{};
  Tuning physTuning;
  uint64_t version = 0;
  // the strings, built off the audio thread for each version of the physics knobs
  struct Snapshot { std::atomic<double> ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, detune{0}, loss{1}, fmax{10}; std::atomic<int> build{0}; };
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
  std::array<Board, 2> boards; // the harpsichord's and the virginal's (boardOf)
  int boardOn = 0;
  double buff = 0, mix = 1, glide = 0;
  // the sympathetic strings: per key, held down and the version its groups were made from (0:
  // none); per group, its voices' bridge signals this block (a key may have an old voice fading)
  std::array<uint8_t, 128> down{};
  std::array<uint64_t, 128> symVer{};
  std::array<double, 6> symSig{}; // the knobs a group's damping depends on, as it was made
  Quality symQuality = Quality::high; // and the Quality
  std::array<std::array<double, BLOCK>, 3 * 128> own{};
  std::array<int, 3 * 128> ownAt{};
  int symStamp = 0;
  bool symHush = false; // Panic: the groups wait for the voices to fade
  bool boardHush = false; // Panic: the board rings until the voices have faded, then fades out
  std::array<double, BLOCK> tS{};
  Message pluckMsg;
};

} // namespace forte::harpsichord
