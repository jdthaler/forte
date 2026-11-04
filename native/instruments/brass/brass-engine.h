// brass-engine.h — the real-time brass, on the engine contract (forte/engine.h).
//
//   breath p_m ─▶ lips y ─▶ cup p_c ─▶ ┬─ backbore ─ leadpipe ─ slide ─ bell taper ─ flare ─┬─▶ plunger ─▶ air
//                   ▲                   └──────────── waves both ways, each a delay ─────────┘
//                   └── S (p_m − p_c)
//
// Each key is a player with a horn of their own (brass-model.h's plan: the horn's size, the
// partial and the slide). Per sample the lips move under the pressure across them (symplectic
// Euler), the flow through them and the cup's pressure follow in closed form (Bernoulli into the
// cup, backward Euler), and the waves cross the bore's junctions (Kelly–Lochbaum) to the bell,
// whose open end radiates. Along every long segment a wave travels at c + β u: each sample is read
// out of its delay at the time its own pressure carried it, so a loud wave steepens as it goes, and
// the walls' losses (a filter per segment) keep its shock finite.
//
// The player's ear listens to the lips and moves the slide (or the valve's trim) until the note is
// in tune; what it learned is kept for the key's next press. Voices come from a fixed pool, each
// with its own delay memory; nothing is allocated in process().
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "brass-model.h"
#include "brass-params.h"

namespace forte::brass {

constexpr int POOL = 20;          // voices: up to 12 sounding, and those dying away
constexpr int MEM = 1 << 16;      // floats of delay memory per voice
constexpr int TRACE = 96;         // points in each live trace
constexpr int SNAP = 84;          // points along the bore in a snapshot
constexpr double MPE_BEND = 12;   // semitones a note's own bend reaches (the slide, and the lips with it)

// What the engine posts for the page (brass/src/brass-wasm.js turns them into its messages).
namespace msg {
enum : uint16_t {
  state = 1,  // key; horn, octave, partial, position, valves, f, fMeasured, p_m (Pa), lip swing (m), slide (m), Le, bore length,
              //   trim, lip trim (cents), where the long tubes end (m), the traces' dt, plunger, scale
  bore = 2,   // key; the bore's length (m), first index, then up to 28 radii at SNAP points along it
  snap = 3,   // key; which (0: p⁺, 1: p⁻), first index, then up to 28 pressures (Pa) at the SNAP points
  trace = 4,  // key; which (0: p_c, 1: lip opening, 2: p⁺ into the flare, 3: radiated), first index, then up to 28
};
}

class BrassEngine : public Engine {
 public:
  explicit BrassEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void bend(double value) override { bendTo = std::pow(2.0, value * kBendSemitones / 12); }
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); }
  void pressure(double value, int key) override;
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  struct Voice {
    int key = 0;
    Plan plan;
    Bore bore;
    Digital dig;
    Lips lips{};
    double lipR = 0;
    float *mem = nullptr;
    int off[2][MAX_SEG] = {}, mask[2][MAX_SEG] = {};
    double last[2][MAX_SEG] = {}, last2[2][MAX_SEG] = {}, lz[2][MAX_SEG] = {};
    double kap[MAX_SEG] = {};
    int base[MAX_SEG] = {};   // the linear segments' fractional delays: taps, per block
    double taps[MAX_SEG][4] = {}; // junction i | i+1: (Y_i − Y_{i+1}) / (Y_i + Y_{i+1})
    double fo[MAX_SEG] = {}, bo[MAX_SEG] = {};
    uint32_t t = 0;
    int os = 1;          // steps a sample
    double fsV = 48000;  // its own rate: fs × os
    double gain = 1;     // regulation (brass-model.h)
    // lips, cup, breath
    double y = 0, v = 0, pc = 0, U = 0, pm = 0, pTarget = 0, vel = 0, age = 0, attack = 0.01;
    double fl = 0;
    // the bell's radiation and its sound
    double ra = 0, rb = 0, Uo = 0, out = 0, env = 0, gl = 0, gr = 0, plunger = 0, plungerTo = 0;
    // the ear: the lips' crossings of their mean, the slide's trim ρ (× the horn's length)
    double ym = 0, yPrev = 0, yl1 = 0, yl2 = 0, tCross = -1, fm = 0, trim = 1, lipTrim = 0, slideNow = 0, bendNow = 1;
    int crossings = 0;
    double yAmp = 0, yMax = 0, yMin = 0;
    bool down = false, active = false, low = false;
  };
  std::array<Voice, POOL> pool;
  // the ear's memory: each key's trim the last time it played (with the plan it had)
  double learned[128] = {}, learnedLip[128] = {};
  Plan learnedPlan[128];
  int planVersion = 0, learnedVersion[128] = {};
  // the tests: the player's ear on (it trims the slide and the lips) or off (the plan alone)
  bool ear = true;
  // the tests: run the nonlinear reads this many times (Quality)
  int iterations() const { return pick(2, 1, 1); }
  // the tests: the delay memory for one voice is this many floats
  static constexpr int memPerVoice() { return MEM; }

 private:
  void start(Voice &v, double velocity);
  void retune(Voice &v, bool reset);
  void step(Voice &v, double &outL, double &outR);
  void listen(Voice &v);
  void postView();
  void record(const Voice &v);
  double hornOf() const;

  std::array<double, p::count> P{};
  bool hasParams = false;
  HornCut cut;
  bool cutValid = false;
  Tuning tuning;
  NoteExpression expr{MPE_BEND};
  double bendTo = 1, bendNow = 1, press[128] = {}, after = 0;
  std::array<float, POOL * MEM> memory{};
  uint32_t order = 0;
  uint32_t started[POOL] = {};
  // views
  Voice *focus = nullptr;
  int blocks = 0;
  struct Trace { float pc[TRACE] = {}, h[TRACE] = {}, pb[TRACE] = {}, rad[TRACE] = {}; int n = 0, cnt = 0, dec = 4; double dt = 1.0 / 12000; bool armed = true; } trace;
};

} // namespace forte::brass
