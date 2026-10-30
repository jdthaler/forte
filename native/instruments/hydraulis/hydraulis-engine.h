// hydraulis-engine.h — the real-time water organ, on the engine contract (forte/engine.h).
//
//   pistons ─▶ bowl's air p ─┬─▶ stopcock ─▶ slide ─▶ foot ─▶ flue pipe (pipes-flue.h) ─▶ sound
//      ▲                     │
//   pumpers (effort)         └─▶ water under the rim:  M_w dQ_w/dt = p − ΔV/C_h − R_w Q_w,  dΔV/dt = Q_w
//                                C_a dp/dt = Q_pumps − Q_pipes − Q_w − Q_bubbles  (bubbles once ΔV reaches the rim)
//
// Per sample the wind is integrated (the draw of the pipes from the sample before), each key's
// slide moves (pushed by the finger, pulled back by its spring), and every sounding pipe steps its
// jet and modes with the jet its foot gives it: the Pipe Organ's flue pipes, on the hydraulis's
// bores. Pipes that sound at 2 kHz or more run at twice the sample rate (4× from 6 kHz), brought
// down by a 63-tap half-band FIR. The pumpers start a stroke whenever their effort's pace allows
// and the bowl has room for it, and push the air in through the valve (hydraulis-model.h).
//
// One voice per key holds its four pipes. A key's four voiced pipes (each a linear analysis solved
// by Newton) are built off the audio thread by forte/background.h for the voicing the knobs are
// at; a note whose key is not built yet waits for it. Voices come from a fixed pool with their
// delay lines' memory: nothing is allocated in process().
#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <vector>

#include "forte/background.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "hydraulis-model.h"
#include "hydraulis-params.h"
#include "pipes-flue.h"

namespace forte::hydraulis {

// What the engine posts for the page (hydraulis/src/hydraulis-wasm.js turns them into its 'wind'
// message).
namespace msg {
enum : uint16_t {
  state = 1, // key (the last played, 0: none); pc, dV, Vrim, Qw, Qpump, Qdraw, Qesc, piston 1, piston 2, effort, pRim, fb, pipes, bubbles, pumps, open
  keys = 2,  // the keys sounding: (key, the slide's opening) pairs
};
}

// What a key's pipes are cut for: the bore, the voicing and the keyboard's tuning for the key.
struct Design {
  double bore = 0.21;
  Voicing voicing;
  double ratio = 1;
  bool operator==(const Design &) const = default;
};
// A key's four pipes, voiced: what a note needs and the page's model can send (packKeyModels).
struct KeyModels {
  int key = 0;
  Design design;
  std::array<PipeModel, RANKS> pipes{};
};
KeyModels keyModels(int key, const Design &d);
// Packed as numbers: key, bore, cutup, gain, offset, ratio, then per pipe f, stopped, M, A, W, b, H,
// y0, h, dd, Sm, D, the number of modes and each mode's ω and σ (all the engine reads of a pipe).
int packKeyModels(const KeyModels &k, double *out);
bool unpackKeyModels(const double *in, int n, KeyModels &k);
constexpr int PACKED_MAX = 6 + RANKS * (13 + 2 * pipes::MODES_OPEN);
// The keyboard's tuning moves a key at most this far from equal temperament at A = 440 Hz: the
// delay lines a voice keeps ready are sized for it.
inline const double RATIO_MIN = *std::min_element(kPitches, kPitches + kPitchCount) / 440 * std::pow(2.0, -2 * kCentsRange / 1200);
inline const double RATIO_MAX = *std::max_element(kPitches, kPitches + kPitchCount) / 440 * std::pow(2.0, 2 * kCentsRange / 1200);
constexpr double MPE_BEND = 12; // a key's own bend reaches an octave either way, as the Pipe Organ's

class HydraulisEngine : public Engine {
 public:
  static constexpr int MAX_KEYS = 20;   // keys sounding at once
  static constexpr int POOL = 40;       // voices, sounding or fading
  static constexpr int BLOCK_MAX = 1024;
  static constexpr int NOISE_N = pipes::FLUE_NOISE_N;
  static constexpr int FIR_N = 63;
  static constexpr int BUBBLES = 16;    // bubbles ringing at once
  explicit HydraulisEngine(double fs, double fOS = 2000);
  int osFor(double f) const { return f >= 3 * fOS ? 4 : f >= fOS ? 2 : 1; }

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // leaning on a key: the pumpers work harder
  void bend(double value) override;              // the air warms or cools: every pipe's sound and jets ×r
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  int voiceCount() const override;
  bool ready(int key) { return bool(data.get(key, version)); }
  void process(float *L, float *R, int n) override;

  // The tests' and tools' options: the turbulence's seed (its table is drawn again), following
  // every pipe's pitch, and a still wind (no pumps, no water: the chest held at the full wind).
  void configure(uint32_t seed, bool track, bool still = false);
  bool offer(const double *packed, int n);
  bool useModels(const double *packed, int n);

  using Data = KeyData<KeyModels>;
  using Pipe = pipes::FluePipe;

  struct Voice {
    int key = 0;
    uint64_t version = 0;
    std::array<Pipe, RANKS> pipes{};
    double s = 0, sv = 0, open = 0; // the slide: how far in (a share of its travel), its speed, and the holes' open share
    double s0 = 0, pushT = 0, pushDur = 0; // a push: where it started, how long it has gone, how long it takes
    bool pushing = false, down = false, fading = false, dead = false, inUse = false;
    double fade = 1, env = 0, age = 0, gl = 0, gr = 0, nb = 1;
    std::array<Pipe *, RANKS> list{};
    int nList = 0;
    const KeyModels *models = nullptr;
    Data::Ref ref;
    std::vector<double> lines;
  };
  struct Pump { bool cycling = false; double t = 0, vol = 0, back = -1, pos = 1; }; // back: the share of the return done (−1: delivering)
  struct Bubble { double c = 0, s = 0, rc = 1, rs = 0, decay = 0, amp = 0; bool on = false; };

  // read (and some written) by the tests, through the WebAssembly's hooks
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  std::array<double, NOISE_N> noise{};
  // the wind: the air's pressure, the water pushed out from under the bowl and its flow, and the
  // flows of the last sample
  double pc = 0, dV = 0, Qw = 0, Qdraw = 0, Qpump = 0, Qesc = 0;
  Cistern cis;
  std::array<Pump, 2> pump{};
  double effort = 0.5, lean = 0, sinceStroke = 1e9;
  int nextPump = 0, strokes = 0, bubbled = 0;
  bool still = false;
  std::array<Bubble, BUBBLES> bubbles{};

 private:
  double rand();
  bool startKey(int key, double velocity, const KeyModels *models, Data::Ref ref);
  Voice *freeVoice(size_t need);
  void retryPending();
  void processBlock(float *L, float *R, int n);
  void decimate(float *L, float *R, int n);
  void decimate4(int n);
  void popBubble();
  void postView();
  int voiceCountNow() const;

  std::array<double, p::count> P{};
  bool hasParams = false, started = false, track = false;
  const double fOS, h;
  uint32_t seed = 1;
  // the design each version was built for (a ring the worker reads)
  struct Shared { std::atomic<double> bore{0.21}, cutup{1}, gain{1}, offset{0.4}, ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}; };
  std::array<Shared, 16> designs{};
  Design design;
  Tuning tuning;
  uint64_t version = 0;
  Data data;
  std::unique_ptr<KeyModels> offered;
  std::vector<std::unique_ptr<KeyModels>> custom;
  size_t lineMax = 0;
  std::array<Voice, POOL> pool{};
  struct Pending { int key; double velocity; bool off; double offVelocity; };
  std::array<Pending, 64> pending{};
  int nPending = 0;
  // the stopcocks: each rank's channel turning open or shut
  std::array<double, RANKS> cock{}, cockOpen{};
  double pRimNow = 0, sizeNow = 0, nz = 0, escAcc = 0, nextBubble = 0;
  double bendTo = 1, bendNow = 1;
  NoteExpression expr{MPE_BEND};
  std::array<double, 128> leanKey{};
  // the decimator
  std::array<double, FIR_N> fir{};
  std::array<double, 2 * FIR_N> histL{}, histR{};
  int hpos = 0;
  std::array<double, 2 * BLOCK_MAX> hiL{}, hiR{};
  std::array<double, 2 * FIR_N> hist4L{}, hist4R{};
  int h4pos = 0, quiet4 = FIR_N;
  std::array<double, 4 * BLOCK_MAX> hi4L{}, hi4R{};
  std::array<double, BLOCK_MAX> loL{}, loR{};
  // the view's averages
  double sumPump = 0, sumDraw = 0, sumEsc = 0;
  int sumN = 0, blocks = 0;
  int focusKey = 0;
};

} // namespace forte::hydraulis
