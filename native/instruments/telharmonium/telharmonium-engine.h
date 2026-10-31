// telharmonium-engine.h — the Telharmonium on the engine contract (forte/engine.h).
//
//   the shafts: twelve (or eight) shaft angles, turning together at the motor's speed, which droops
//   under the alternators' electrical load and follows it (and the wheel's field rheostat) through
//   the flywheel's time constant. Every alternator in use is a phasor locked to its shaft's angle:
//   two keys that use the same alternator get the same wave, in phase.
//   a key: its relay switches up to eight alternators (its harmonics) onto its manual's eight buses.
//   Each winding's current is y = e/Z_s, the steady part exact for its sine (iωτ/(1 + iωτ)) plus an
//   offset decaying as e^{−t/τ}; a winding switched in starts where its share of the bus's flux
//   puts it (y = ρI), so the bus's current stays continuous; one switched out takes its own offset
//   with it. A bus's current is I = Σy/(1 + Nρ_h): the notes on it rob one another.
//   the output: each manual's buses mixed through the transformers (a 16 Hz high-pass), the swell,
//   its own line (the telegrapher's line's exact response, as an impulse response), the receiver (a magnet's
//   pull, the square of the flux, on a diaphragm's first mode) and its paper horn (a waveguide).
//   Manual I's receivers stand to the left, Manual II's to the right.
//
// With V8's fdlibm for exp, pow, sin and cos, so the WebAssembly and the plugins play alike. Fixed
// pools; nothing is allocated after construction except when a parameter rebuilds the lines.
// The alternators' fields are voiced (Cahill's rheostats) against the 1906 diaphragm's slope.
#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "forte/convolver.h"
#include "forte/engine.h"
#include "forte/tuning.h"
#include "telharmonium-model.h"
#include "telharmonium-params.h"

namespace forte::telharmonium {

// What the engine posts (telharmonium/src/telharmonium-wasm.js).
namespace msg {
enum : uint16_t { state = 1, note = 2 };
}

struct Alternator {
  int shaft = -1, teeth = 0, refs = 0;
  double phase = 0;           // its place on the shaft (turns), fixed when it was built
  double zr = 1, zi = 0;      // e^{iφ}: its flux's phase now
  double wr = 1, wi = 0;      // its turn in one sample
};

struct Source {
  int alt = -1, bus = 0, harmonic = 1;
  double h0r = 0, h0i = 0;    // the winding's response at its frequency, iωτ/(1 + iωτ) (voiced)
  double h3r = 0, h3i = 0;    // and at three times it (the tooth error's twelfth); 0 past Nyquist
  double u1 = 0, u3 = 0;      // its EMF over R, a sine of amplitude v ωτ (and 3 v ωτ for the twelfth)
  double c0 = 0;              // its offset when it settled (or was last rebased)
  int64_t t0 = 0;             // then (samples)
  // while its contacts close or open: their engagement (0 → 1 or 1 → 0 over `len` samples), and the
  // winding's current y, followed step by step (τ y' + y = κ e/R)
  int dir = 0, at = 0, len = 0;
  double y = 0, uPrev = 0;
};

struct Key {
  bool on = false;            // held down: its relay closed
  int key = 0, shaft = 0, teeth = 0, manual = 0, root = -1;
  int64_t born = 0;
  double vel = 0, after = 0, gain = 0, gainNow = 0;
  int count = 0;              // its windings on the buses (closing, closed or opening)
  std::array<Source, HARMONICS> src;
  bool alive() const { return on || count > 0; }
};


class TelharmoniumEngine : public Engine {
 public:
  static constexpr int kPool = 40, kMaxKeys = 32, kAlts = 512, kHorn = 8192;
  explicit TelharmoniumEngine(double fs);
  void setParams(const double *P) override;
  void setQuality(Quality q) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override;
  void bend(double value) override;
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // read by the tests (telharmonium-web.cpp)
  int tap = 0;                 // 0: the output; 1: the buses' mixed currents; 2: after the lines; 3: the diaphragms
  double cents = 0;            // the shafts' speed now, in cents from full speed
  double load = 0;             // the alternators' load, over LOAD_REF
  int busCount[BUSES] = {};    // the windings on each bus
  std::array<Key, kPool> keys;
  int lineTapCount() const { return lineOn ? lineTaps : 0; }

 private:
  static constexpr int CHUNK = 32;
  void start(Key &k);
  void open(Key &k);          // the relay opens: its contacts part over the contact time
  void drop(Key &k);          // its windings leave at once
  void dropSource(Key &k, int i);
  void settle(Source &s, const Key &k, int64_t now);
  double steady(const Source &s, const Key &k) const;
  double emf(const Source &s, const Key &k) const;
  void connect(Key &k);
  int acquire(int shaft, int teeth);
  void place(Alternator &a) const;
  double busSum(int b) const;
  void buildLine();
  double voiced(double f) const;
  void buildReceiver();
  void run(float *L, float *R, int n);
  double keyGain(const Key &k) const;
  int rootFor(int key, const Key *except) const;

  std::array<double, p::count> P{};
  bool hasP = false;
  double keyTarget[128] = {};
  forte::Tuning keyboard;
  double unit[12] = {}, theta[12] = {};
  std::array<Alternator, kAlts> alts;
  double C[BUSES] = {}, level[BUSES] = {}, rhoBus[BUSES] = {}, decay = 1, tau = 0.004, rho = 0.15;
  double top = 4000, tooth = 0, toothNow = 0, touch = 0.5, voicingAmount = 0;
  int contact = 0;            // the relays' contact time (samples)
  int split = 60;
  bool eight = false, pierce = false;
  double speed = 1, bendCents = 0, droop = 0, flywheel = 3;
  double swell = 1, swellNow = 1;
  int64_t t = 0;
  // the output chain, per manual
  double hpRho = 0, hpX[MANUALS] = {}, hpY[MANUALS] = {};
  Convolver lines[MANUALS];
  bool lineOn = false;
  int lineKind = -1, lineTaps = 0;
  double lineKm = -1;
  double work[27] = {};
  double rA[4] = {}, rB[2] = {}, rx[MANUALS][2] = {}, magnet = 20;
  int receiver = -1;
  double hornLen = -1, hornD = 0, hornA = 0, bareGain = 1;
  std::vector<float> fwd[MANUALS], back[MANUALS];
  int hornAt = 0;
  double lp[MANUALS] = {}, prevV[MANUALS] = {};
  double accBus[BUSES] = {};
  int accN = 0, stateEvery = 0, sinceState = 0;
};

} // namespace forte::telharmonium
