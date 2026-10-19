// windharp-engine.h — the real-time Wind Harp, on the engine contract (forte/engine.h).
//
//   wind U(t) = slider (smoothed) × (1 + gusts) × (1 + aftertouch)
//        │
//        ▼  per key: a shutter slides along the string and uncovers it
//   wake stations q_j ──lift ¼ρU²DC_L0 q_j──▶ string modes a_n ──T∂Y/∂x──▶ bridge ──▶ soundbox ──▶ two mics
//        ▲                                       │
//        └────────── (A/D) Ÿ(x_j) ◀──────────────┘          and the lift itself radiates (a dipole)
//
// Each sample the string's modal accelerations give each station's acceleration, each station's van
// der Pol wake advances by leapfrog, and the lift is projected back onto the modes, each of which
// steps exactly under a first-order hold (windharp/README.md, "The engine", has the details). A low
// string steps at a half or a quarter of the sample rate. The wind follows the slider, two seeded
// Ornstein–Uhlenbeck gusts and aftertouch, worked out once a block and ramped across it.
//
// One voice per key: a course of one or two strings behind one shutter. A string's design is a
// closed form (a few fixed-point loops, microseconds), made in noteOn into a fixed pool of voices:
// nothing is allocated after the constructor. Seeded, the engine plays the same samples to the
// last bit of a double everywhere.
#pragma once

#include <cstdint>

#include "forte/dsp.h"
#include "forte/engine.h"
#include "windharp-model.h"
#include "windharp-params.h"

namespace forte::windharp {

// What the engine posts for the page (windharp/src/windharp-wasm.js gathers them into its 'harp'
// message): the focused string's arrays and the sounding keys first, the summary last.
namespace msg {
enum : uint16_t {
  harp = 1,  // key (the focus, or −1); U, Uw, voices, N, J, Om, D, L, lock, amp, home, x, Uv, Re, course, nk
  array = 2, // key: which (0 a, 1 v, 2 w, 3 q, 4 qv, 5 e); the focused string's first N (or J) values
  keys = 3,  // the first entry, then up to 9 entries of (key, locked harmonic, Ŷ/D)
};
}

// The longest block process() takes in one piece (a longer one is split). The hosts call it with
// at most 128 samples; the tests play some in blocks of 256 and 512 (the wind is worked out once a
// block), which the WebAssembly passes whole (windharp_process).
constexpr int BLOCK = 512;

// The engine's options, for the tests.
struct EngineOptions {
  double eps = WAKE.eps; // the wake's ε (tests may turn it down to see the linear coupled-mode growth)
  double noise = 1;      // scales the wake's turbulence (tests)
  bool rigid = false;    // hold every string still: the wakes of fixed cylinders (tests)
};

class WindHarpEngine : public Engine {
 public:
  static constexpr int MAX_VOICES = 12; // keys sounding at once
  static constexpr int POOL = 48;       // voices, with those fading out
  using Options = EngineOptions;
  explicit WindHarpEngine(double fs, double seed = 1, Options opts = {});
  // the tests' hooks: the seed and the options. Call before playing.
  void configure(double seed, Options opts);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: the wind blows harder
  void bend(double value) override;              // every string's tension ×r²
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // One string: its modes, its wake stations and their exposure to the wind.
  struct Str {
    StringDesign S;
    int key = 0, N = 1, J = 1, Jh = 0, odd = 1, No = 1, Ne = 0;
    double a[N_MAX], v[N_MAX], gOld[N_MAX], w[N_MAX], w2[N_MAX], cv[N_MAX], co[8 * N_MAX], kb[N_MAX];
    double phi[N_MAX * (N_MAX / 2)], phiMid[N_MAX], phiO[(N_MAX / 2) * (N_MAX / 2)], phiE[(N_MAX / 2) * (N_MAX / 2)];
    double accO[N_MAX / 2], accE[N_MAX / 2];
    double q[N_MAX], qv[N_MAX], ya[N_MAX], sp[N_MAX / 2], sm[N_MAX / 2], e[N_MAX], de[N_MAX];
    uint32_t rs = 1;                         // the turbulence's own seeded stream (xorshift32)
    double k0[5], k1[5], dk[5];              // per-sample ramped scalars: Ω_d², εΩ, r, lift → modal acceleration, noise
    bool started = false;
    double Ad = 0, Ucur = 0, Om = 0, Re = 0, r = 0, zetaAt = -1, OmAt = -1;
    int home = 1;
    double x = 0, target = 0;                // its shutter's position and target (the voice's, copied each block)
    int Dmax = 1, D = 1;                     // its step, in samples
    double hs = 0, fbLast = 0, dipLast = 0;
    double bent = 1;                         // the tension's ratio (squared) its modes are tuned to
  };
  // One key: a course of strings behind one shutter.
  struct Voice {
    Str strings[COURSE_MAX];
    int ns = 0, key = 0, version = 0;
    bool used = false, held = false, pedal = false, fading = false, dead = false;
    double x = 0, target = 0, rate = 0, fade = 1, age = 0, env = 0, press = 0, pressS = 0;
    double pb = 0, gl = 0, gr = 0, liftPrev = 0;
    void open(double velocity);
    void close(double velocity);
  };
  struct Dominant { int n; double amp; };
  static Dominant dominant(const Str &s);

  // read and written by the tests (through the WebAssembly's hooks)
  double wind(int n);       // the wind at the end of a block of n samples
  Voice *voices[POOL] = {}; // the voices in the order they started
  int nv = 0;
  Voice pool[POOL];
  Voice *byKey[128] = {};
  double Uw = U_REF, U = U_REF;
  double bendTo = 1, bendNow = 1; // pitch bend: the ratio, and where the glide is
  Options opts;

 private:
  void initString(Str &s, int key, const StringDesign &S);
  void tension(Str &s, double r);
  void prepare(Str &s, double U, int n, double x0, double x1, double target);
  static bool quiet(const Str &s);
  void ring(Str &s, int n);
  void step(Str &s, int n);
  void run(Str &s, int n);
  Voice *freeVoice();
  double rand();
  double gauss();
  void postState();

  double P[p::count] = {};
  bool hasParams = false, started = false, sustain = false;
  double seed, h;
  double designKey[4] = {};
  forte::Tuning designKeyboard; // and the keyboard's tuning the designs were made in
  int version = 0;
  uint32_t randState = 1;
  double g1 = 0, g2 = 0, Ug = 0, chanPress = 0, chanS = 0;
  Biquad bp[5];
  double shelf[3] = {}, shelfZ[2] = {};
  Voice *focus = nullptr;
  int blocks = 0;
  // a block's scratch: the mix, a voice's sums, a string's force and lift (at its own rate, then the sample rate)
  double flatL[BLOCK], flatR[BLOCK], mono[BLOCK], dipL[BLOCK], dipR[BLOCK], fbSum[BLOCK], dipSum[BLOCK];
  double fbs[BLOCK], dips[BLOCK], fb[BLOCK], dip[BLOCK];
};

} // namespace forte::windharp
