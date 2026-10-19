// pyrophone-engine.h — the real-time pyrophone, on the engine contract (forte/engine.h): one
// Rijke-tube Galerkin model per sounding key.
//
// Each tube integrates N acoustic modes in its own time (units of L/c). A mode is advanced by the
// exact solution of η̈ + ζη̇ + ω²η = F over one sample with F held (zero-order hold), so the linear
// acoustics is exact at any pitch and temperature; the flame couples the modes through the
// delayed, nonlinear heat release, felt with seeded turbulence (an xorshift with a fixed seed, so
// the same breath every time).
//
// The tubes are cut from the tuning table (pyrophone-model.h: harmonic balance, tens of ms), which
// depends only on the tube's parameters (bore, damping, flame position, lag). It is built off the
// audio thread (forte/background.h, slot 0), and kept until the next one is in, as the page keeps
// its last table while a slider moves; a note before the first table waits for it. Without
// threads (WebAssembly) it is built in place, unless the page offers its own (offer()). Voices
// come from a fixed pool: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "forte/background.h"
#include "forte/engine.h"
#include "pyrophone-model.h"
#include "pyrophone-params.h"

namespace forte::pyrophone {

// What the engine posts for the page every 16 ms (pyrophone/src/pyrophone-wasm.js gathers them
// into its 'tubes' message).
namespace msg {
enum : uint16_t {
  tube = 1,  // key; β, amplitude of mode 1, of mode 2, key down, warmth θ
  trail = 2, // key; the focused tube's mode-1 trail: the first value's index in the ring, then up to 14 (η₁, η̇₁/W) pairs
  focus = 3, // key; W, β, amplitude, θ, T, cents, period (s), ring index, snapshot taken, then η and η̇ of the snapshot
  end = 4,   // the tubes posted
};
}

class PyrophoneEngine : public Engine {
 public:
  static constexpr int MAXV = 24;    // tubes before the quietest is stolen
  static constexpr int POOL = 64;    // tubes, sounding or fading out
  static constexpr int HIST = 8192;  // flame delay line (samples): τ ≤ 1.5 L/c down to A0, cold and bent down, at up to 192 kHz
  static constexpr int TRAIL = 512;  // the focused tube's mode-1 trail: 256 pairs
  explicit PyrophoneEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: parts the flames further
  void bend(double value) override;              // the burner's gas: a hotter flame, faster sound, every tube up
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;

  // The page's tuning table (WebAssembly only: without threads the engine would build it on the
  // audio thread): bore, damping, x_f, lag, β_H, β_max, mode, fold (NaN for none), b0, db, then
  // the table's TUNE_N values. Once a page offers tables, a tube change keeps the old table until
  // the page's new one arrives.
  bool offer(const double *packed, int n);
  // the tests: whether the tuning for the current parameters is in (asks for it if not)
  bool ready() { return current() && tuneVersion == version; }

  struct Voice {
    int key = 0, N = N_MODES;
    uint32_t id = 0;
    std::array<double, N_MODES> eta{}, vel{}, cf{}, g{}, wo{}, m11{}, m12{}, m21{}, m22{}, b1{};
    std::array<double, HIST> hist{};
    int hw = 0;
    double panL = 0, panR = 0;
    double beta = 0, betaT = 0, press = 0, vel0 = 0;
    double xf = -1, h = 0, dBore = NAN, dDamp = NAN, d = 0, W = 1, hHot = 0;
    double gain = 1;
    int fade = 0;
    bool dead = false;
    double turb = 0, amp = 0, amp2 = 0, peak = 0, song = 0;
    bool keyDown = false;
    double age = 0, since = 0, rel = 0, chkT = 0, chkA = INFINITY;
    // strobe and phase portrait for the views
    double prevE1 = 0, period = 100, strobe = 0;
    int sinceZ = 0, snapAt = -1;
    bool wantSnap = false, watch = false, snapped = false;
    std::array<float, TRAIL> trail{};
    int ti = 0, tdec = 1, tcount = 0, tnew = 0;
    std::array<float, 2 * N_MODES> snap{};
    double theta = 0;

    void init(PyrophoneEngine &eng, int key);
    void tune(const PyrophoneEngine &eng, double beta);
    void coeffs(const PyrophoneEngine &eng);
    void render(PyrophoneEngine &eng, float *L, float *R, int n);
    void observe(double e1, double v1);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  const Tuning *tune = nullptr; // the table the tubes are cut from (the last one in)

 private:
  using Data = KeyData<Tuning>;
  const Tuning *current();
  double bH() { const Tuning *t = current(); return t ? t->betaH : B_MAX; }
  double betaMax() const { return tune ? tune->betaMax : B_MAX; }
  double betaDown(double vel, double press);
  double betaUp() { return P[p::keyup] * bH(); }
  double coolTheta(int key) const;
  void start(int key, double velocity);
  void steal();
  void store(const Voice &v);
  void retune();
  void report();
  std::unique_ptr<Tuning> build(uint64_t version);

  std::array<double, p::count> P{};
  bool hasParams = false;
  Tube sys;
  TubeParams tp;
  std::array<double, 128> warm{}, warmAt{};
  double time = 0, sincePost = 0, pressure_ = 0;
  double bendTo = 1, bendNow = 1; // pitch bend: the sound speed's ratio, and where it is going
  forte::Tuning keys; // the keyboard's tuning (forte/tuning.h): each tube is cut for its key's tuned note
  uint32_t seed = 0x2545f491;
  int focus = -1;
  const double kSep, kTurb, turbNorm;
  const int fadeLen;
  uint32_t serial = 0, shownFocus = 0;
  std::array<Voice, POOL> pool{};
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 128> pending{};
  int nPending = 0;

  // the tuning: its version (one per tube), the table in use and the one held for it
  uint64_t version = 0, tuneVersion = 0;
  Data::Ref tuneRef;
  bool pageTables = false, hasOffered = false;
  Tuning offered;
  // the tube parameters of each version, for the worker (a ring: it builds the latest)
  std::array<std::array<std::atomic<double>, 4>, 8> snapshots{};
  Data data; // last: its worker uses the members above, and stops before they go
};

} // namespace forte::pyrophone
