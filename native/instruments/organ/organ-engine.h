// organ-engine.h — the real-time tonewheel organ, signal path of a B-3 + Leslie 122, on the
// engine contract (forte/engine.h).
//
//   motor ─▶ 91 tonewheels ─▶ key contacts ─▶ 9 busbars ─▶ drawbars ─┐
//                        └─▶ percussion (1' contacts, single-trigger) ┤
//     preamp (swell pedal) ─▶ scanner vibrato (LC delay line) ─▶ tube drive + coupling capacitor
//       ─▶ Leslie: crossover ─▶ rotating horn + drum (Doppler, directivity,
//                                cabinet reflection) ─▶ two microphones
//
// With V8's fdlibm for every transcendental (tanh and hypot too) and seeded generators for the
// wheels' phases and the contacts' timing and bounce, so it plays the same samples in the
// WebAssembly and the plugins. The console (drawbars, percussion, vibrato, Leslie and motor) comes
// as parameters after the groups' (organ-params.h). The generator's tables are rebuilt in place,
// with nothing allocated, when the sample rate's or a 'gen' parameter's change asks for them; the
// keys live in a fixed array. Every 768 samples it posts its state for the page's views.
#pragma once

#include <cstdint>

#include "forte/engine.h"
#include "organ-model.h"
#include "organ-params.h"

namespace forte::organ {

// What the engine posts (organ/src/organ-wasm.js turns them into the page's messages):
// state: shaft, hornAng, hornHz, drumAng, drumHz, scanPos, lcN, percEnv; error: none
namespace msg {
enum : uint16_t { state = 1, error = 2 };
}

constexpr int MAX_EVENTS = 9 * 17; // per key: each contact closes, and bounces at most 8 times

// The engine's parameters, p: the console's as the page's P has them
struct Params {
  int tuning = gears;
  int levels = b3;
  double mains = 60, relief = 0.06, drift = 0, crosstalk = -48, leakage = -70;
  int drawbars[9] = {8, 8, 8, 0, 0, 0, 0, 0, 0};
  bool motor = true;
  double inertia = 6, spinUp = 1.2, loading = 0.25;
  double spread = 1.2, bounce = 0.5, contactTime = 20;
  bool percOn = false, percSoft = false, percFast = true, percThird = true;
  double percFastTau = 0.15, percSlowTau = 0.6, percLevel = 1;
  int vib = 6; // off, V1, V2, V3, C1, C2, C3
  double sections = 18, sectionDelay = 50, scanRate = 6.87;
  double expression = 0.85, drive = 0.15, master = 1;
  bool leslieOn = true;
  enum Speed : int { slow, fast, stop } leslie = slow;
  double hornSlow = 0.8, hornFast = 6.75, drumSlow = 0.67, drumFast = 5.9;
  double hornAccel = 0.7, hornDecel = 0.9, drumAccel = 4.5, drumDecel = 5.5;
  double hornRadius = 0.18, micDist = 0.8, micSpread = 120, balance = 0, crossover = 800, reflections = 0.35;
};

// RBJ biquad, transposed direct form II
struct Biquad {
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
  void set(bool lowpass, double f, double Q, double fs);
  double run(double x) {
    const double y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
};

// a contact's change: at sample t, contact d opens (s 0) or closes (s 1)
struct ContactEvent {
  int64_t t;
  uint8_t d, s;
};

// A key: its nine contacts (gains, targets, fixed geometry), their scheduled changes, and in the
// "harmonic" tuning its own nine oscillators.
struct Key {
  int key = 0, idx = 0;
  bool live = false; // in the engine's list
  double g[9] = {};
  uint8_t tgt[9] = {};
  double order[9] = {};
  bool down = false;
  ContactEvent ev[MAX_EVENTS];
  int nev = 0, evi = 0;
  bool osc = false; // its oscillators made
  double hc[9] = {}, hs[9] = {}, hrc[9] = {}, hrs[9] = {}, hv[9] = {};
  uint8_t hmute[9] = {};
};

class OrganEngine : public Engine {
 public:
  explicit OrganEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void bend(double value) override; // the supply frequency: the whole organ, ±2 semitones
  int voiceCount() const override { return nLive; }
  void process(float *L, float *R, int n) override;
  // the same in double precision (the tests' render)
  void processDouble(double *L, double *R, int n);

  // What setParams does once it has the parameters: p set to them.
  void apply(const Params &next);

  // state the tests and the views read
  Params p;
  double speed = 1; // shaft speed / synchronous speed at the organ's own mains frequency
  double supply = 1, bendTo = 1; // pitch bend: the supply frequency / the mains', and where it is going
  double shaft = 1;  // speed · supply: what turns the wheels
  double hornAng = 0, drumAng = 1.3, hornHz, drumHz;
  double scanPos = 0, percEnv = 0, peak = 0;
  int lcN = 18;
  int keyCount() const { return nArr; }
  int liveCount() const { return nLive; }

 private:
  template <class T> void render(T *L, T *R, int n);
  void configure();
  void liveTargets();
  void snapLive();
  void setCrossover(double f);
  void updateDerived();
  void updateRotations();
  void initKeyOsc(Key &k);
  void updateKeyRot(Key &k);
  void schedule(Key &k, bool closing, double keySpeed);
  void tick(int n);
  void postState();

  const double dt;
  Rng rand{7};
  int64_t now = 0;
  int stateClock = 0; // samples since the last state message

  // generator (built by the first setParams)
  Generator gen;
  bool haveGen = false;
  double genOf[7] = {}; // the 'gen' parameters it was built from: tuning, levels, mains, relief, drift, crosstalk, leakage
  double cr[NW] = {}, ci[NW] = {}, rc[NW] = {}, rs[NW] = {}, v[NW] = {};

  // keys and busbars (keyArr: the sounding keys, in the order they came)
  Key keys[NUM_KEYS];
  Key *keyArr[NUM_KEYS] = {};
  int nArr = 0, nLive = 0;
  int held = 0;
  double num[10] = {}, den[10] = {};

  // derived from the parameters
  double alphaC = 1, percDecay = 0, dbg[9] = {}, percGain = 0, expGain = 1;
  double lcTau = 0, lcK = 0;

  // the swell pedal's shut side: a low-passed copy of the signal (swLp, one pole at SWELL_CORNER)
  double swK = 0, swLp = 0;

  // scanner vibrato: LC ladder, normalised to Z0 = 1 (so L = C = τ per section)
  double I[64] = {}, V[65] = {};
  double scanPhase = 0;

  // Leslie
  static constexpr int BUF_LEN = 4096, MASK = BUF_LEN - 1;
  double hornBuf[BUF_LEN] = {}, drumBuf[BUF_LEN] = {};
  int wi = 0;
  Biquad lp1, lp2, hp1, hp2;
  double mics[4] = {};
  double dcIn = 0, dcOut = 0;

  // live parameters that glide (targets t…, smoothed s…)
  double aSm;
  bool gliding = false;
  double tPre = 0, tPreLo = 0, tDrive = 0, tLam = 0, tMaster = 0, tHornG = 0, tDrumG = 0, tRefl = 0, tXo = 0;
  double sPre = 0, sPreLo = 0, sPre1 = 0, sPreLo1 = 0, sDrive = 0, sLam = 0, sMaster = 0, sHornG = 0, sDrumG = 0, sRefl = 0, sXo = 0;
  double driveK = 0, driveN = 0;
};

// The parameters (indexed as in organ-params.h) as the engine's p.
Params paramsOf(const double *P);

} // namespace forte::organ
