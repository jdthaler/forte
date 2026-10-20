// huygens-engine.h — a keyboard of relaxation oscillators on one supply rail, on the engine
// contract (forte/engine.h).
//
//   each key: a capacitor charged through its resistor from the rail, a neon lamp across it that
//   fires at V_s and dumps it to V_e; firing times solved exactly within each sample
//   a firing kicks every other lamp by K: one within K of striking fires in the same instant
//   (and may set off others); the rest are left exactly as they were
//   optional rail sag (source resistance and reservoir), drift of each resistor, and a slow
//   supply servo that holds the average pitch
//   output: each sawtooth band-limited with polyBLEP, keyed, through a 15 Hz coupling capacitor
//
// With V8's fdlibm for exp, log, pow, sin and cos and a seeded generator for the random phases
// and drift, so it plays the same firings in the WebAssembly and the plugins.
// Oscillators live in a fixed pool; nothing is allocated after construction.
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/impulses.h"
#include "huygens-model.h"
#include "huygens-params.h"

namespace forte::huygens {

// What the engine posts (huygens/src/huygens-wasm.js turns it into its 'state'): only that one is
// due; the firings are read back from the engine, in double precision.
namespace msg {
enum : uint16_t { state = 1 };
}

constexpr uint32_t SEED = 0x48757967; // 'Huyg'

// The descriptor's engine parameters and the circuit's constants
struct Neon {
  double vNom = 150, vStrike = 90, vExt = 60; // supply, lamp striking and extinction voltages
  double cap = 10e-9;                          // timing capacitor (F)
  double kick = 0.055;                         // pulse coupling, a fraction of V_s − V_e
  double rSrc = 0, cRail = 2e-9;               // rail sag: source resistance (Ω), reservoir (F)
  bool regulate = true;                        // the regulator removes the average sag
  bool pitchHold = true;                       // the slow supply servo
  double holdTime = 0.4;
  double attack = 0.004, release = 0.03;       // the key's RC and the keyer's fade
  double dcCut = 15;                           // output coupling capacitor (Hz)
  double drift = 0, driftRate = 0.25;
  double master = 1, width = 0.5;
  int maxOsc = 32;
};

class NeonEngine;

struct Osc {
  int key = 0;
  double fTarget = 0, C = 0, R = 0, tau = 0, V = 0;
  double gate = 0, power = 0;
  bool keyDown = false, dead = false;
  bool used = false;           // in the engine's list (the pool's slots)
  double fires[256] = {};
  int64_t nf = 0, sent = 0;
  double prevOut = 0, hx = 0, hy = 0, I = 0;
  double drift = 0, driftCents = 0;
  double panL = 0, panR = 0;
  double supply = 0, V0 = 0, fireAt = -1;
  double bend = 1;               // the note's own bend: its timing resistor turned to R/bend
  int64_t bentAt = INT64_MIN / 2; // when it last moved (the servo doesn't hear a lamp mid-bend)

  // what it is tuned to play: its design frequency, bent
  double target() const { return fTarget * bend; }
  void start(NeonEngine &eng, int key, double f, double phase, bool settled);
  void setPan(double width);
  void retune(double f, const Neon &p);
  void applyDrift(NeonEngine &eng, double dt);
  void plan(double vr, const NeonEngine &eng);
  double voltageAt(double x, double k) const;
  double finish(const NeonEngine &eng, double t);
  double frequency(double t, double win, double fs) const;
};

// the resistor that tunes an oscillator to f with the rail at its nominal voltage
double tuneR(double f, const Neon &p);

class NeonEngine : public Engine {
 public:
  static constexpr int kPool = 128;                  // oscillators: every key, and those fading
  static constexpr int kFireBuf = 32 * 258, kOscBuf = 32 * 3;
  explicit NeonEngine(double fs, uint32_t seed = SEED);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  // a note's bend: its lamp's timing resistor turned, gliding (the pulse coupling, the rail's, is
  // every lamp's: no slide)
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  // the key's bend for a lamp designed to play f: short of fs/4 (one already up there is not bent up)
  double bendOf(int key, double f) const;
  int voiceCount() const override { return nos; }
  void process(float *L, float *R, int n) override;

  // The page's note data for the next noteOn: its design frequency (NaN: the
  // engine's tuning), its starting phase (NaN: random) and whether it starts settled (keyed and
  // powered, for analysis). Without it a note takes its tuning from the parameters.
  void offer(double f, double phase, bool settled) { offered = true; offF = f; offPhase = phase; offSettled = settled; }
  void retune(int key, double f);
  // the page's 'state': firings since the last call, packed as [key, n, t₁ … t_n, key, …]
  // (sounding keys only, times in samples), and [key, design frequency, drift (¢)] per sounding key
  int drainFirings(double *buf, int cap);
  int summary(double *buf, int cap) const;
  // the mean frequency each oscillator plays over the last win seconds (0 if released)
  struct Report { int key; double f, fTarget, drift; };
  int report(double win, Report *out, int cap) const;

  // read by the page and the tests (through the WebAssembly's hooks)
  Osc *osc[kPool] = {};
  int nos = 0;
  Osc *last = nullptr;         // what the latest noteOn played
  int64_t t = 0;               // samples
  double hold = 0;             // pitch-hold correction, octaves
  bool listening = false;      // a page reads the state: drain the firings for it
  double fireBuf[kFireBuf] = {}, oscBuf[kOscBuf] = {};
  int stateFires = 0, stateOsc = 0;
  int64_t stateT = 0;
  double stateHold = 0;

  // read by the oscillators
  Neon p;
  double k, attackAlpha = 0, releaseAlpha = 0, regAlpha = 0, dcRho = 0;
  Mulberry32 rand;

 private:
  void update();
  double supplySetpoint(double dt);
  Osc *slot();

  std::array<Osc, kPool> pool;
  Osc *byKey[128] = {};
  Osc *order[kPool] = {};
  double vr, Ilp = 0;
  int tuning = 0, tonic = 0;
  double mistune = 0;
  forte::NoteExpression expr{48}; // each key's bend
  forte::Tuning keyboard; // the keyboard's tuning (forte/tuning.h), on top of the lamps' own
  // a key's design frequency: the lamps' tuning (equal or just, mistuned) times the keyboard's
  double keyTarget(int key) const { return tunedFreq(key, tuning, tonic, mistune) * keyboard.ratio(key); }
  int stateEvery, sinceState = 0;
  bool offered = false, offSettled = false;
  double offF = 0, offPhase = 0;
};

} // namespace forte::huygens
