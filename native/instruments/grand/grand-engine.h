// grand-engine.h — the real-time electric grand (grand/src/grand-engine.js in C++), on the engine
// contract (forte/engine.h).
//
// Each sounding key is a Voice: every partial of every unison string in both polarisations, as
// exactly discretised damped oscillators, coupled through the bridge. Within one polarisation the
// bridge is a rank-one damping shared by every mode, solved implicitly with a centred bridge
// velocity (Sherman–Morrison: one scalar per polarisation per sample). The hammer is a mass on a
// nonlinear hysteretic felt, F = K[δ^p + α d(δ^p)/dt]₊, solved by a scalar Newton iteration
// together with the bridge. The piezo hears the bridge force of both polarisations; the vertical
// force also drives the soundboard, when there is one: plate modes heard by two microphones, plus
// the residual path of the modes above the modal band. Then the piezo's RC high-pass and the
// preamp's EQ, and the blend with the microphones.
//
// A key's model (its partials, a few hundred µs; more with a soundboard) and the soundboard's
// (a few ms) are built off the audio thread (forte/background.h), for the parameters they depend
// on; a note whose key is not built yet waits for it, a new board's microphones for theirs. Without
// threads (WebAssembly) both are built in place, as the JavaScript engine builds them. Voices come
// from a fixed pool: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <bit>
#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>

#include "forte/background.h"
#include "forte/dsp.h"
#include "forte/engine.h"
#include "grand-model.h"
#include "grand-params.h"

namespace forte::grand {

// What the engine posts for the page (grand/src/grand-wasm.js turns it back into the JavaScript
// engine's message).
namespace msg {
enum : uint16_t {
  error = 1, // key: a voice's numerical instability
};
}

constexpr int MODE_BUDGET = 4000;  // oscillators across all voices (default; the page may lower it)
constexpr double C_PIEZO = 10e-9;  // F, capacitance of the piezo elements
struct Eq { double bass, mid, midQ, treble; };
constexpr Eq EQ = {120, 1000, 0.8, 3500}; // Hz
constexpr int BOARD_MODES = BOARD.maxModes;

// First-order analog section (b1 s + b0)/(a1 s + a0), bilinear with prewarping at fw.
class RC1 {
 public:
  RC1 &set(double b1, double b0, double a1, double a0, double fw, double fs);
  RC1 &highpass(double f, double fs);
  RC1 &lowShelf(double f, double g, double fs);
  RC1 &highShelf(double f, double g, double fs);
  double run(double x) { const double y = B0 * x + B1 * x1 - A1 * y1; x1 = x; y1 = y; return y; }

 private:
  double B0 = 1, B1 = 0, A1 = 0, x1 = 0, y1 = 0;
};

// The soundboard's filter coefficients (grand-engine.js, Board), built with its model.
struct BoardCoefs {
  double boardH = 9;
  int K = 0;
  std::array<double, BOARD_MODES> a1{}, a2{}, rl{}, rr{};
  std::array<double, BOARD_MODES * SEGMENTS> ph{};
  double lpG = 0;
  std::array<double, RES_BANDS * 2 * SEGMENTS> res{};
  std::array<Biquad, 4 * RES_BANDS> rf{}; // [band][mic][stage]
  std::array<Biquad, 4> rh{};
};

// What the worker builds: a key's model and what a voice derives from it alone (the slots of keys
// KEY_LO…KEY_HI), or the soundboard (slot 0).
struct Built {
  KeyModel d;
  std::vector<double> om, sig, h, bh, u, beta, a1, a2;
  double comp0 = 0;
  std::unique_ptr<BoardCoefs> board;
};

class GrandEngine : public Engine {
 public:
  static constexpr int POOL = 64;     // voices, sounding or fading out
  static constexpr int CAP = 1400;    // modes per voice: the most any key has is 1304 (concert stringing, key 31, 16 kHz)
  static constexpr int BLOCK = 128;   // process() runs in blocks of at most this
  explicit GrandEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // The page's { type: 'budget', modes }: lower (or restore) the oscillator budget.
  void budget(double modes);
  // the tests: whether the key's model for the current parameters is built (asks for it if not)
  bool ready(int key) { return bool(data.get(key, version)); }
  bool boardReady() const { return (int)P[p::mount] != mount_::board || (board && board->c.boardH == P[p::boardH]); }

  using Data = KeyData<Built>;
  struct Voice {
    int key = 0, N = 0, nV = 0, ns = 1, nVa = 0, nHa = 0, seg = 0;
    double k = 0;
    uint64_t version = 0;
    bool inUse = false;
    Data::Ref ref;
    const Built *b = nullptr;
    double *q = nullptr, *q1 = nullptr, *a1d = nullptr, *a2d = nullptr; // the voice's own (the pool's)
    const double *a1 = nullptr, *a2 = nullptr, *h = nullptr, *bh = nullptr, *u = nullptr, *beta = nullptr, *bf = nullptr, *om = nullptr, *sig = nullptr, *dmp = nullptr;
    double comp0 = 0, comp = 0, invV = 1, invH = 1, kapV = 0, kapH = 0, swV = 0, swH = 0, rhoV = 0, rhoH = 0;
    Hammer hammer;
    bool hasDamper = false;
    double panL = 0, panR = 0, trim = 1, dropThr = 0;
    bool keyDown = false, damped = false, killing = false, dead = false, hammerOn = false, contact = false;
    double peak = 0, age = 0, struck = -INFINITY;
    int quiet = 0;
    double eta = 0, etaPrev = 0, dPrev = -1, F = 0, FV = 0, FH = 0, Fmax = 0, v0 = 0, kOverM = 0, alphaK = 0, damperSigma = 0;
    int contactSamples = 0, hammerSamples = 0;

    int active() const { return nVa + nHa; }
    void start(const GrandEngine &eng, Data::Ref r, uint64_t ver);
    void bridgeSums();
    bool quietTop(int i1);
    void dropTop();
    void coef(double *A1, double *A2, bool kill, double sd) const;
    void setDamper(double sd) { coef(a1d, a2d, killing, sd); damperSigma = sd; }
    void updateDamping(const GrandEngine &eng) { damped = killing || (!keyDown && !eng.sustain && hasDamper); }
    void kill() { if (killing) return; killing = true; setDamper(damperSigma); damped = true; }
    void strike(double v);
    double contactForce(double dFree);
    void hammerStep(const double *A1, const double *A2, const GrandEngine &eng);
    void render(double *PL, double *PR, double *SEG, int n, GrandEngine &eng);
  };

  // read by the tests and the page's slow-motion view (through the WebAssembly's hooks), in the
  // JavaScript engine's order
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};

  // The soundboard: its coefficients and its state, kept for the last few thicknesses (the
  // JavaScript keeps up to five).
  struct BoardSlot {
    bool used = false;
    BoardCoefs c;
    std::array<double, BOARD_MODES> e0{}, e1{};
    std::array<double, SEGMENTS> lp{};
    int quiet = 0;
    void run(const double *SEG, double *ML, double *MR, int n, bool active);
  };

 private:
  void run(float *L, float *R, int n);
  void retryPending();
  Voice *freeVoice();
  void enforceBudget(const Voice *keep);
  BoardSlot *boardFor(double boardH);
  BoardSlot *install(const BoardCoefs &c);
  std::unique_ptr<Built> build(int key, uint64_t version);
  const BoardModel &workerBoard(double boardH);
  static uint64_t boardVersion(double h) { return std::bit_cast<uint64_t>(h + 0.0); } // the board's id: its thickness (−0 is 0)

  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  std::array<double, p::count> phys{}; // the physics parameters the key models were built for
  uint64_t version = 0;
  int focus = 60;
  int maxModes = MODE_BUDGET;
  const int hammerMax, repeat;
  std::unique_ptr<double[]> store; // the voices' own arrays: q, q1, a1d, a2d
  std::array<Voice, POOL> pool{};
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 128> pending{};
  int nPending = 0;
  std::array<double, BLOCK> pL{}, pR{}, mL{}, mR{};
  std::array<double, SEGMENTS * BLOCK> seg{};
  std::array<RC1, 2> hp{}, lo{}, hi{};
  std::array<Biquad, 2> mid{};
  double mix = 0;
  std::array<BoardSlot, 5> boards{};
  BoardSlot *board = nullptr;
  double wantBoard = NAN; // a thickness whose board is being built (only with threads)

  // the parameters of each version, for the worker (a ring: it builds the latest)
  std::array<std::array<std::atomic<double>, p::count>, 8> snapshots{};
  std::unique_ptr<BoardModel> wBoard; // the worker's last board model (only the worker touches it)
  Data data; // last: its worker uses the members above, and stops before they go
};

} // namespace forte::grand
