// gongs-engine.h — the real-time gong keyboard, on the engine contract (forte/engine.h).
//
// Each voice integrates one gong's shell modes x_k (in thicknesses) with the nonlinear coupling
// V_nl of gongs-model.h and a Hertzian mallet: the exact damped modal recursion for the linear
// part, a scalar auxiliary variable (SAV) for the nonlinearity, so that the scheme's energy is
// conserved (or decays) however hard the gong is hit, a consistency projection each step whose
// size is the error estimate for halving the step, and a linear tail once the coupling no longer
// matters. Voices run at fs/R (R = 1, 2, 4 or 8); each rate has a bus and a polyphase
// interpolator back to fs. gongs/README.md ("Time stepping that cannot blow up") has the scheme.
//
// The coupling tables (gongs-model.h, buildShell: a few milliseconds per change of Dome rise,
// Coupling terms or Rim) are built on a worker thread and handed over without locks (Shells); a
// note struck before its tables are ready waits for them. Voices live in a fixed pool, and
// nothing is allocated in process() (but for the tests' trace of a voice's steps).
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <vector>

#include "forte/background.h" // FORTE_THREADS
#include "forte/engine.h"
#include "forte/queue.h"
#include "gongs-model.h"

#if FORTE_THREADS
#include <thread>
#endif

namespace forte::gongs {

// What the engine posts for the page (gongs/src/gongs-wasm.js gathers them into its 'gong'
// message, and turns 'error' into its text).
namespace msg {
enum : uint16_t {
  amp1 = 1,  // key; the focus gong's mode amplitudes 0–29 (in thicknesses)
  amp2 = 2,  // key; amplitudes 30–59
  gong = 3,  // key; amplitudes 60–63, the six bands' energies, E, enl, cents, nl, sub, contact (ms), t (s), n
  error = 4, // key: a numerical failure
};
}

// The coupling tables, by spec: built on a worker thread (in place without threads), kept in a
// small cache the audio thread owns, freed on the worker once no voice holds them.
class Shells {
 public:
  Shells();
  ~Shells();
  Shells(const Shells &) = delete;
  Shells &operator=(const Shells &) = delete;
  // The audio thread: the tables for s if they are built (null otherwise).
  const Shell *find(const Spec &s);
  // The audio thread: have them built (without threads: now).
  void request(const Spec &s);
  void hold(const Shell *s);
  void release(const Shell *s);

 private:
  struct Entry { Shell *shell = nullptr; int holds = 0; uint64_t used = 0; };
  static constexpr int KEEP = 8; // tables kept while no voice holds them
  std::array<Entry, 48> cache{};
  uint64_t clock = 0;
  void adopt(Shell *s);
  bool evict(Entry &e);
#if FORTE_THREADS
  void run();
  SpscQueue<Spec> requests{64};
  SpscQueue<Shell *> built{64}, trash{256};
  Spec asked;
  bool hasAsked = false;
  std::atomic<bool> quit{false};
  std::thread worker;
#endif
};

class GongEngine;

// A coupling set restricted to a voice's modes (the rows' ends below Nv).
struct View {
  const Pack *c = nullptr;
  std::array<int, NSMAX> end1{}, endE{}, rows{};
  std::array<int, NMAX> end2{};
  int nrows = 0;
  void set(const Pack &pack, int N, int NS);
};

// The mallet while it flies and touches (its last values stay after it leaves).
struct Hit {
  bool on = false, touched = false;
  double K = 0, Mi = 0, xm = 0, xm1 = 0, d0 = 0, dm1 = 0, t = 0, tmax = 0, Fmax = 0;
  int steps = 0;
};

class Voice {
 public:
  using Modes = std::array<double, NMAX>;
  // A new voice for key, in a pool slot: nothing is allocated.
  void init(GongEngine &eng, int key, const double *P, const Shell &S);

  void setOutput(const double *P);
  void setDamping();
  void use();
  void resetFit();
  double mean(int i) const { return n2 > 0 ? m2[i] / n2 : 0; }
  bool fitted() const { return n2 > 0.4 && zn[S->tuned] >= 3; }
  void setSub(int m2);
  double energyD() const;
  bool rescale(double dE);
  void guard(double E);
  double energy() const;
  double tailAmp2(int i) const;
  void strike(double vel, const double *P);
  void setState(const double *x0, int n);
  double gradient();
  void project(double V);
  void step();
  void fit();
  void render(double *bl, double *br, int n, GongEngine &eng);
  void linear();
  void beginTail();
  void tailCoeffs();
  double snapshot(float *amp, int namp, float *band, int nband) const;

  GongEngine *eng = nullptr;
  Gong g;
  const Shell *S = nullptr;
  int key = 0, N = 0, R = 1;
  double k = 0;
  std::array<double, p::count> P{};
  Modes x{}, x1{}, xs{}, gv{}, a0{}, a1{}, phi{}, mL{}, mR{}, wd{}, sg{};
  struct Coef { Modes A, B, iD, WD, iW; };
  std::array<Coef, 4> cf{}; // steps k, k/2, k/4, k/8
  std::array<double, NSMAX> Q{}, L{}, y{}, z{};
  Modes m1{}, m2{}, zt{}, zT{}, zn{}, yp{}, tm{}, tdw{}, toff{}, te0{}, tw{};
  View views[2];                    // the full and the lite coupling sets
  View *full = &views[0], *lite = &views[1], *cs = &views[0];
  double vScale = 0;
  double extra = 0;
  bool released = false, damped = false, killing = false, dead = false;
  int m = 1;
  double h = 0, calm = 0;
  bool adapt = true, tail = false;
  double n1 = 0, n2 = 0, lam = 0, tf = 0;
  bool fitting = false, wantFit = false, odd = false, armed = false;
  double *A = nullptr, *B = nullptr, *iD = nullptr, *WD = nullptr, *iW = nullptr;
  bool nl = false;
  double psi = 0, eps0 = 1.5, V = 0, Vprev = 0, V3 = 0, V4 = 0, defect = 0;
  Hit hit;
  int quiet = 0;
  int64_t age = 0;
  double peak = 0, contactMs = 0, Einj = 0;
  int guards = 0;
  double lastF = 0, nlr = 0, v4max = 0, v3max = 0;
  double ph = 0, cents = 0;
  bool phInit = false;
  double dc = 0, KE = 0, vImpact = 0;
  uint32_t serial = 0;              // which voice this is (the tests' handle)
  std::vector<double> *trace = nullptr; // the tests: x after every step
};

class GongEngine : public Engine {
 public:
  static constexpr int MAX_VOICES = 16; // live voices; with those fading out, the pool's size
  static constexpr int POOL = 40;
  explicit GongEngine(double fs);
  ~GongEngine() override;

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: a hand pressed against the gong
  int voiceCount() const override { return nv; }
  void process(float *L, float *R, int n) override;

  // the tests' hooks (gongs-web.cpp)
  Voice *place(int key, const double *x0, int n); // a voice in a given state, at rest
  int voices(Voice **out) const { for (int i = 0; i < nv; i++) out[i] = order[i]; return nv; }
  bool ready(); // the tables for the parameters are built (or being built: false)

  // read by the voices
  int subVoices = 0;
  double loudest = 0, loud = 0;

 private:
  friend class Voice;
  struct Upsampler {
    int R = 1, w = 0;
    std::array<double, 8 * 24> h{};
    std::array<double, 2 * 24> hl{}, hr{};
    std::array<double, 129> inL{}, inR{};
    double outL[8] = {}, outR[8] = {};
    int idle = 1 << 30; // input samples since a voice last played on it
    void init(int R);
    void push(double l, double r);
  };
  Upsampler &bus(int R) { return buses[R == 1 ? 0 : R == 2 ? 1 : R == 4 ? 2 : 3]; }
  Voice *add(int key, const Shell &S);
  void remove(int i);
  void start(int key, double velocity); // noteOn, with the tables ready
  void limitNonlinear();
  void postViews();

  std::array<double, p::count> P{};
  bool hasP = false;
  Shells shells;
  std::array<Voice, POOL> pool;
  std::array<Voice *, POOL> order{}; // the voices playing, oldest first
  int nv = 0;
  std::array<Upsampler, 4> buses;
  bool sustain = false;
  Voice *focus = nullptr;
  int64_t frame = 0, sinceView = 0;
  uint32_t serials = 0;
  float amp[64] = {}, band[6] = {};
  // notes struck while their tables were being built (with threads): played when they are ready
  struct Pending { int key; double vel; bool released; };
  std::array<Pending, 32> pending{};
  int npending = 0;
};

} // namespace forte::gongs
