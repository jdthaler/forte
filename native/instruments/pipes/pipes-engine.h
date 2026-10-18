// pipes-engine.h — the real-time pipe organ, on the engine contract (forte/engine.h).
//
//   reservoir ─▶ trunk ─▶ chest P_c ─▶ pallet ─▶ groove ─▶ slider ─▶ foot p ─▶ jet U_j = √(2p/ρ)
//                                                                              │
//        modes of the pipe ◀── Δp = (ρδ_d/S_m) dQ_in/dt − ½ρ(v/α)²sgn v ◀── Q_in = bHU_j(1 + tanh((η − y₀)/b))
//              │                                                                 ▲
//              └── mouth flow v ── delay τ = W/c_pU_j ── low-pass ── η = (hA/U_j)·v(t − τ) + turbulence
//
// Per sample, each sounding pipe reads the flow through its mouth a jet transit earlier from a
// delay line (Catmull–Rom), passes it through the jet's low-pass, splits the jet on the labium
// (tanh), and drives its modes with the time derivative of the flow it puts into the pipe plus the
// vortex-shedding loss. Pipes that sound at 2 kHz or more run at twice the sample rate, brought
// down by a 63-tap half-band FIR. Every pipe's flue draws on the chest, whose pressure the wind
// system integrates once per sample.
//
// One voice per key holds its six pipes (Principal 8′, Octave 4′, Gedackt 8′, Mixture ×3). A key's
// six voiced pipes (each a linear analysis solved by Newton, about a millisecond a key) are built
// off the audio thread by forte/background.h for the voicing the knobs are at; a note whose key is
// not built yet waits for it. Voices come from a fixed pool, each with its delay lines' memory for
// the longest key at the widest cut-up: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <vector>

#include "forte/background.h"
#include "forte/engine.h"
#include "pipes-model.h"
#include "pipes-params.h"

namespace forte::pipes {

// What the engine posts for the page (pipes/src/pipes-wasm.js turns them into its 'pipe'
// message): the focused pipe's traces in pieces, then the state.
namespace msg {
enum : uint16_t {
  state = 1, // key (0: none); Pc, Pr, Pset, Q, pipes, trem, rank, f, W, b, h, H, D, A, y0, Uj, foot, theta, tau, n, dt
  v = 2,     // the traces: values[0] is where the piece starts, then up to 29 points
  dp = 3,
  eta = 4,
  qin = 5,
};
}

// A key's six pipes, voiced: what a note needs and the page's model can send (packKeyModels).
struct KeyModels {
  int key = 0;
  Voicing design;
  std::array<PipeModel, RANKS> pipes{};
};
KeyModels keyModels(int key, const Voicing &design);
// Packed as numbers: key, cutup, gain, offset, then per pipe f, stopped, M, A, W, b, H, y0, h, dd,
// Sm, D, the number of modes and each mode's ω and σ (all the engine reads of a pipe).
int packKeyModels(const KeyModels &k, double *out);
bool unpackKeyModels(const double *in, int n, KeyModels &k);
constexpr int PACKED_MAX = 4 + RANKS * (13 + 2 * MODES_OPEN);

class PipeEngine : public Engine {
 public:
  static constexpr int MAX_KEYS = 20;   // keys sounding at once
  static constexpr int POOL = 40;       // voices, sounding or fading
  static constexpr int BLOCK_MAX = 1024;
  static constexpr int NOISE_N = 16384; // the seeded table of jet turbulence
  static constexpr int TRACE = 256;     // points in the live trace of the focused pipe
  static constexpr int FIR_N = 63;
  explicit PipeEngine(double fs, double fOS = 2000);
  // Each pipe's rate over the output's: from fOS up 2×, and from 3·fOS (6 kHz: only pipes past the
  // Baroque compass, whose highest is 5.6 kHz) 4×, so that the jet's transit across the mouth
  // (21 µs at C8's 8.4 kHz) stays more than the two steps the delay line's interpolation needs.
  int osFor(double f) const { return f >= 3 * fOS ? 4 : f >= fOS ? 2 : 1; }

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void bend(double value) override; // the organ's air warms or cools: every pipe's sound and jets ×r
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // The tests' and tools' options: the turbulence's seed (its table is drawn again) and
  // following every pipe's pitch.
  void configure(uint32_t seed, bool track);
  // A key's pipes its page's model built already (packKeyModels), for the next note on that key,
  // so the audio thread needn't build them. Only without threads (WebAssembly): with them, the
  // worker builds every key ahead.
  bool offer(const double *packed, int n);
  // The models every following note plays, whatever its key (the tests' modelsFor);
  // kept until the engine goes. Not for the audio thread.
  bool useModels(const double *packed, int n);

  using Data = KeyData<KeyModels>;
  struct Pipe {
    const PipeModel *R = nullptr;
    int rank = 0, os = 1, n = 0;
    bool stopped = false;
    double fsI = 0, h = 0, fsS = 0, rt = 1; // fsS: steps per second of its own time (fsI/rt); rt: pitch bend's ratio
    std::array<double, 6 * MODES_OPEN> c{};
    std::array<double, MODES_OPEN> x{}, v{}, om{};
    double cv = 0, W = 0, b = 0, H = 0, y0 = 0, ib = 0, bH = 0, hA = 0, Ks = 0, Kl = 0, iSm = 0, tauK = 0, kxc = 0, flue = 0;
    double *buf = nullptr;
    int N = 0, mask = 0, maxD = 0, w = 0, ni = 0;
    const double *noise = nullptr;
    // state
    double lp = 0, qin = 0, vm = 0, Q = 0, dp = 0, eta = 0, out = 0, foot = 0, Uj = 0;
    bool asleep = true;
    // the live pitch: upward zero crossings of the mouth flow's running integral through its mean
    bool track = false;
    double dsp = 0, mean = 0, prev = 0, t = 0, last = -1, per = 0, kMean = 0;
    int nx = 0;

    static int lineLength(double tauK); // the delay line's length for a jet transit of tauK/U_j
    void init(PipeEngine &eng, const PipeModel *R, int rank, double *buf);
    void retime(double r);
    double freq() const { return per > 0 ? fsI / per : 0; }
    void reset();
    double energy() const;
    void step(double Uj, double iU, double nz);
  };

  struct Voice {
    int key = 0;
    uint64_t version = 0;
    std::array<Pipe, RANKS> pipes{};
    std::array<double, RANKS> slider{}, open{}; // slider travel, and the foot's opening
    double kPal = 0, a = 0, aTarget = 0, aRate = 0, fade = 1, env = 0, age = 0, pg = 0, gl = 0, gr = 0;
    bool down = false, fading = false, dead = false, inUse = false;
    std::array<Pipe *, RANKS> list{};
    int nList = 0;
    const KeyModels *models = nullptr;
    Data::Ref ref;
    std::vector<double> lines; // the delay lines' memory
  };

  // read (and some written) by the tests, through the WebAssembly's hooks, in the order they
  // started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  std::array<double, NOISE_N> noise{};
  double Pset = 0, Pr = 0, Qt = 0, Pc = 0, Qdraw = 0, Qtrem = 0;
  Voice *focus = nullptr;

 private:
  friend struct Pipe;
  double rand();
  bool startKey(int key, double velocity, const KeyModels *models, Data::Ref ref);
  Voice *freeVoice(size_t need);
  void retryPending();
  void processBlock(float *L, float *R, int n);
  void decimate(float *L, float *R, int n);
  void decimate4(int n);
  int shownRank(const Voice &v) const;
  void record(const Pipe &p);
  void postView();
  int voiceCountNow() const;

  std::array<double, p::count> P{};
  bool hasParams = false, started = false, track = false;
  const double fOS, h;
  uint32_t seed = 1;
  // the voicing each version was built for (a ring the worker reads)
  struct Design { std::atomic<double> cutup{1}, gain{1}, offset{0.4}; };
  std::array<Design, 16> designs{};
  Voicing design;
  uint64_t version = 0;
  Data data;
  std::unique_ptr<KeyModels> offered;
  std::vector<std::unique_ptr<KeyModels>> custom;
  size_t lineMax = 0; // the delay lines' memory a voice keeps ready
  std::array<Voice, POOL> pool{};
  struct Pending { int key; double velocity; bool off; double offVelocity; };
  std::array<Pending, 64> pending{};
  int nPending = 0;
  // the wind
  WindSystem wsys;
  double stiff = -1, trem = 0, tremPh = 0, nz = 0;
  double bendTo = 1, bendNow = 1; // pitch bend: the ratio, and where the glide is
  // the decimator
  std::array<double, FIR_N> fir{};
  std::array<double, 2 * FIR_N> histL{}, histR{};
  int hpos = 0;
  std::array<double, 2 * BLOCK_MAX> hiL{}, hiR{};
  std::array<double, 2 * FIR_N> hist4L{}, hist4R{}; // and 4× → 2× before it, for the 4× pipes
  int h4pos = 0, quiet4 = FIR_N;                   // quiet4: 4× samples since a 4× pipe last sounded (to FIR_N)
  std::array<double, 4 * BLOCK_MAX> hi4L{}, hi4R{};
  std::array<double, BLOCK_MAX> loL{}, loR{};
  bool on[RANKS] = {};
  // the view's trace and state
  struct Trace { std::array<double, TRACE * 8> v{}, dp{}, eta{}, qin{}; int w = 0, dec = 1, cnt = 0; } trace;
  double Qsum = 0;
  int Qcnt = 0, blocks = 0;
};

} // namespace forte::pipes
