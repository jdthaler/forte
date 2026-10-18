// harmonium-engine.h — the real-time free-reed organ, on the engine contract (forte/engine.h).
//
//   bellows → reservoir P ─┬─▶ key's pallet ─▶ throat M_a ─▶ cell p_c ─▶ gap A(y) ─▶ jet ─▶ sound ∝ dU_out/dt
//                          │                                   ▲            ▲
//                          │                       reed modes ─┴─ Δp·S ─────┘  (all solved together, implicitly)
//                          └─ every reed draws on P (it sags with big chords)
//
// Reeds that sound at 440 Hz or more are integrated at twice the sample rate (the sum is brought
// down by a 63-tap half-band FIR); the rest at the sample rate. Per step, each reed's two modes
// advance exactly under the mean of the old and new force, and the jet speed through the gap is
// found by Newton so that the cell's air balance closes, the air integrated by BDF2.
//
// One voice per key, holding a reed for every rank (16′, 8′, the musette's two 8′s, 4′); the
// stops open and close the ranks' mutes over 20 ms. Beyond 16 keys the quietest released key
// fades out over 30 ms. A key's reeds depend on the voicing knobs: they are designed off the
// audio thread (forte/background.h; in WebAssembly, at once on the key's first note). Voices come
// from a fixed pool; nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "forte/background.h"
#include "forte/engine.h"
#include "harmonium-model.h"
#include "harmonium-params.h"

namespace forte::harmonium {

constexpr int TRACE = 256;      // points in the live trace of the focused reed
constexpr int ENV = 64;         // the focused key's rms per block, kept for the posts
constexpr int NOISE_N = 8192;   // a seeded table of turbulence, read by each reed from its own offset
constexpr int POOL = 64;        // voices: 16 keys sounding, and those fading out

// What the engine posts for the page (harmonium/src/harmonium-wasm.js turns them into its 'reed'
// message). Every 6 blocks: the traces, the envelope, then the header.
namespace msg {
enum : uint16_t {
  trace = 1,  // key: which trace (0 y, 1 U, 2 A, 3 dp); the first index, then up to 29 points
  env = 2,    // the focused key's rms per block since the last post, oldest first
  reed = 3,   // key (0: none focused); rank, P, Ptarget, Uair, reeds, fSound, fNat, xm, n, dtTrace,
              // (unused), dtEnv, L, b, h, e, delta, y0, lam, f × 5, amp × 5
};
}

// A key's reeds, one for each rank, designed for one version of the voicing knobs.
struct KeyReeds { std::array<ReedModel, NRANKS> r; };

class HarmoniumEngine : public Engine {
 public:
  explicit HarmoniumEngine(double fs, uint32_t seed = 1);
  // the tests' hooks: the seed, the frequency from which reeds run at 2× (0: all; infinity: none)
  // and whether every reed's pitch is followed. Call before playing.
  void configure(uint32_t seed, double fOS, bool track);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void bend(double value) override; // every tongue's stiffness ×r², its note ×r
  void pressure(double value, int key) override; // aftertouch: more wind (up to double)
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;
  // the tests: whether the key's reeds for the current knobs are designed (asks for them if not)
  bool ready(int key) { return bool(keys.get(key, version)); }

  // A reed's constants (K_…) and state (S_…), as flat arrays the tests can read and write.
  enum : int { K_A11, K_A12, K_A21, K_A22, K_B11, K_B12, K_B21, K_B22, K_GQ1, K_GV1, K_GQ2, K_GV2, K_S1, K_S2, K_R1, K_DVS,
               K_RLH, K_CH, K_HAK, K_ALK, K_TLO, K_TDY, K_TIDY, K_TN2, K_YMA, K_DQ, K_DV };
  enum : int { S_Q1, S_V1, S_Q2, S_V2, S_UIN, S_UINP, S_PC, S_PCP, S_X, S_XP, S_DP, S_UG, S_W, S_A, S_DW,
               S_YM, S_PREVY, S_T, S_LASTX, S_PER, S_NX, S_AMP, S_AIN };
  struct Reed {
    const ReedModel *R = nullptr;
    int os = 1;
    double h = 0, fsr = 0, m1 = 1, k1 = 1, m2 = 1, k2 = 1, ampK = 0, kr = 1; // kr: pitch bend's ratio its modes are tuned to
    const double *T = nullptr;
    const double *io = nullptr, *noise = nullptr;
    int ni = 0;
    bool two = false, track = false, asleep = true;
    double k[32] = {}, st[24] = {};
    void init(HarmoniumEngine &eng, const ReedModel &model);
    void stiffen(double r);
    void reset();
    void setSteady(const Equilibrium &e);
    double energy() const;
    void step();
    double freq() const { const double p = st[S_PER]; return p > 0 ? 1 / (p * h) : 0; }
  };
  enum : int { V_A, V_AT, V_AR, V_FADE, V_ENV };
  struct Voice {
    int key = 0;
    uint64_t version = 0;
    KeyData<KeyReeds>::Ref data;
    bool pending = false;   // its reeds are not designed yet (the plugin's worker; a few ms)
    double vel = 0;         // the velocity it was struck with, for when they are
    std::array<Reed, NRANKS> reeds;
    double mute[NRANKS] = {};
    double s[8] = {};
    bool down = false, fading = false, dead = false;
    double age = 0, gl = 0, gr = 0;
    Reed *list[NRANKS] = {};
    double amul[NRANKS] = {};
    int nList = 0;
  };

  // read by the tests (through the WebAssembly's hooks): the voices in the order they started,
  // the turbulence table, the reservoir and the air drawn
  std::array<Voice *, POOL> voices{};
  int count = 0;
  std::array<double, NOISE_N> noise{};
  double Pres = 0, Utot = 0;

 private:
  double rand();
  void start(Voice &v); // its reeds, once designed (noteOn's work that needs them)
  void setFocus(Voice *v);
  void updateAfter();
  void run(float *L, float *R, int n);
  void decimate(float *L, float *R, int n);
  int shownReed(const Voice &v) const;
  void record(const Voice &v);
  void postView(int n);

  std::array<double, p::count> P{};
  bool hasParams = false;
  double fOS = 440;
  double bendTo = 1, bendNow = 1; // pitch bend: the ratio, and where the glide is
  bool trackAll = false;
  uint32_t rng = 1;
  const double h;
  uint64_t version = 0;
  double designKey[6] = {};
  double io[2] = {};
  double Ptarget = 0, Pt = 0, after = 0, afterS = 0, tWind = 0;
  std::array<double, 128> press{};
  bool started = false;
  double cOn = 0, pd = 0, Uk = 0, cassF = 0, UkPrev = 0, Wlast = 0;
  Cassotto cass{};
  std::array<double, 63> fir{};
  std::array<double, 126> histL{}, histR{};
  int hpos = 0;
  std::array<double, 256> hiL{}, hiR{}; // the 2× bus
  Voice *focus = nullptr;
  int blocks = 0;
  std::array<Voice *, 128> byKey{};
  std::array<Voice, POOL> pool{};
  struct Trace { std::array<double, TRACE * 8> y{}, U{}, A{}, dp{}; int w = 0, dec = 1, cnt = 0; } trace;
  std::array<double, ENV> envBuf{};
  int nEnv = 0;
  bool on[NRANKS] = {};
  double Usum = 0;
  int Ucnt = 0;

  // the reeds, designed off the audio thread for each version of the voicing knobs
  struct Snapshot { std::atomic<double> v[6]; };
  std::array<Snapshot, 8> snapshots;
  KeyData<KeyReeds> keys;
};

} // namespace forte::harmonium
