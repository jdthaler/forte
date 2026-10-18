// arc-engine.h — the real-time singing arc, on the engine contract (forte/engine.h): Duddell's
// circuit integrated sample by sample, one circuit per arc lamp.
//
//   supply E ─ rheostat R_b ─ choke L_b ─┬─ arc (Mayr column on Ayrton's curve, seeded flicker)
//                                         └─ coil L, R ─ the capacitors the keys switch in
//
// Stepped implicitly at 4× the sample rate (2× above 50 kHz): trapezoidal coils and capacitors, a
// θ-method column solved by Newton's method against the circuit's Norton source; the radiated
// pressure is the thermophone's, ∝ dP/dt, decimated through a windowed-sinc low-pass.
//
// Each key's capacitor is cut for its sounding note (arc-model.h, capFor), which takes a few
// milliseconds: in the plugins it is built off the audio thread by forte/background.h for the
// parameters it depends on, and a note whose key is not built yet takes that key's last
// capacitor (the bank as it was cut, as the page plays a stale table while a slider moves), or
// Kelvin's if it never had one. The WebAssembly has no threads: the page cuts the bank with its
// own WebAssembly model and offers it (setTable).
// Arcs, contacts and the singer are fixed arrays: nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <vector>

#include "arc-model.h"
#include "arc-params.h"
#include "arc-voice.h"
#include "forte/background.h"
#include "forte/engine.h"

namespace forte::arc {

// What the engine posts for the page (arc/src/arc-wasm.js gathers them into its 'arc'
// message).
namespace msg {
enum : uint16_t {
  arc = 1,   // key: the arc's index; P, Iac, out, umax, I, u, the number of keys, the keys
  head = 2,  // focus, mode, arcs, ti, X, I0, u0, Xm, Ur, hiss, Ih, vowel (−1: none)
  trail = 3, // the first value's index, then up to 29 values of the focused arc's (i, u) trail
  show = 4,  // the message is complete
};
}

constexpr int MAXA = 6;   // arc lamps
constexpr int MAXE = 16;  // engaged capacitors per arc (closed + switching)
constexpr int TRAIL = 256; // (i, u) points in the view's loop
constexpr int NONE = -99; // no key (−1 is the talking arc's blocking condenser)

class ArcEngine;

struct Arc {
  ArcEngine *eng = nullptr;
  int index = 0;
  int mKey[MAXE] = {}; double mC[MAXE] = {}; int nM = 0;
  int tKey[MAXE] = {}; double tC[MAXE] = {}, tV[MAXE] = {}, tI[MAXE] = {}, tR[MAXE] = {}, tY[MAXE] = {}, tW[MAXE] = {};
  int8_t tDir[MAXE] = {}; int nT = 0;
  double capV[128], capT[128] = {};
  double CB = 0, vB = 0, ic = 0, is = 0, X = 1, u = 0, ia = 0, P = 0, uDC = 0, Imean = 0;
  uint32_t seed = 1; double nf = 0;
  double gl, gr;
  double onset = 0, released = 0; int pendKey = NONE; double pendC = 0, pendAt = 0;
  double stP = 0, stI2 = 0, stOut = 0, stN = 0, stUmax = 0;
  float trail[2 * TRAIL] = {}; int ti = 0, tcount = 0, dec = 1;

  void init(ArcEngine *e, int k, double seed);
  void rest(const Op &op);
  bool active() const { return nM > 0 || nT > 0 || pendKey != NONE; }
  bool held() const;
  bool has(int key) const;
  bool holds(int key) const;
  void engage(int key, double C);
  void release(int key);
  void releaseAll();
  void run(int n, const double *emf);
  void removeT(int k);
};

class ArcEngine : public Engine {
 public:
  explicit ArcEngine(double fs, double seed = 1, bool quiet = false, int os = 0);
  // the tests' hooks: the seed, no noise, the oversampling (0: by the sample rate). Allocates;
  // call before playing.
  void configure(double seed, bool quiet, int os);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void bend(double value) override; // the coil's iron core slides: L by 1/r², the note by r (talk: the voice's pitch)
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // The page's capacitor bank, one per key from KEY_LO: cut for the parameters as they stand
  // (current) or for others (a slider moving; played until replaced).
  void setTable(const double *caps, bool current);
  void kick(double amps, int k = 0) { arcs[k].ic += amps; } // tests: kick an arc's musical branch (A)
  bool ready(int key);                                      // the key's capacitor is built for the parameters now

  // read by Arc::run and the tests
  int OS = 4;
  double h = 0, time = 0;
  bool quiet = false;
  std::array<Arc, MAXA> arcs;
  int nArcs = 1, mode = mode_::mono, focus = 0;
  std::array<double, p::count> P{};
  // per-sample parameters of the block, and the oversampled output
  double sE[128], sRb[128], sA[128], sB[128], sXm[128], sDel2[128], sItau[128], sTh[128], sL[128], sR[128], sKout[128], sSig[128], emf[128];
  std::vector<double> osL, osR;
  double kNoise = 0, noiseNorm = 0, kDC = 0;
  struct Smooth { double I0, l, tau, rho, L, R, dist, hiss, voice; } sm{}, target{};

 private:
  void setup(double seed, bool quiet, int os);
  void reconfigure(int mode, int nArcs);
  double capOf(int key);
  void block(float *L, float *R, int s0, int n);
  int trailDec(const Arc &arc) const;
  void report();

  double seed = 1, bendRatio = 1;
  bool hasParams = false;
  Op op{};
  double kS = 0, sincePost = 0;
  int firN = 1;
  std::vector<double> fir, histL, histR;
  int hp = 0;
  Singer singer;
  int stack[128] = {}, nStack = 0;
  // the capacitors: the page's table, the worker's (KeyData), and each key's last
  std::array<double, NK> table{};
  bool hasTable = false;
  uint64_t tableVersion = 0, version = 0;
  std::array<double, 128> lastCap{};
  std::array<uint64_t, 128> lastVer{};
  int poll = 0;
  struct Snapshot { std::atomic<uint64_t> version{0}; std::array<std::atomic<double>, 7> v{}; };
  std::array<Snapshot, 4> snapshots;
  int snapAt = 0;
  KeyData<double> data;
};

} // namespace forte::arc
