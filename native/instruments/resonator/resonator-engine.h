// resonator-engine.h — the real-time Magnetic Resonator Piano, on the engine contract
// (forte/engine.h): a grand piano's strings, struck by their hammers or not at all, kept ringing
// by an electromagnet over each note in a feedback loop.
//
// Per sample:
//   1. one piezo on the soundboard hears every string at once: the sum of the bridges' signals,
//      a block late (the computer's buffering, 2.7 ms: McPherson's "several milliseconds");
//   2. each driven note's loop band-pass filters it at the partial it drives (Q 50), and a
//      phase-locked loop locks an oscillator to it; a second oscillator, ahead by the calibrated
//      phase (the loop's delays made up, so the push is in step with the string's velocity),
//      gives the drive waveform. Filters a semitone either side hold the loop when a neighbour
//      is louder (McPherson's dynamic loop gain);
//   3. the amplifier turns it into a current, with a bias so it never goes negative (a coil only
//      attracts), clipped at its rails, through the coil's inductance;
//   4. the coil pulls each string, F = κ i²/(g − u)², spread over the coil's width;
//   5. the felt hammer, if the key strikes, is a mass on a stiff nonlinear spring, solved
//      implicitly (scalar Newton);
//   6. every partial of every string advances exactly (two-pole), with the bridge's push: the
//      strings of a key share a resistive bridge, so its unisons couple; the bridge's velocity is
//      the sound.
//
// One voice per key, from a fixed pool (its strings are built at its first note: closed forms, no
// solve). At most 15 notes are driven at once, as the MRP's audio interface gave it 15 channels;
// the 16th takes the oldest's channel, and that string rings on by itself. Nothing is allocated
// in process().
#pragma once

#include <array>
#include <cstdint>

#include "forte/dsp.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "resonator-model.h"
#include "resonator-params.h"

namespace forte::resonator {

constexpr int CHANNELS = 15;     // the MRP's drive channels: one DAC output each
constexpr int RING = 1024;       // the pickup's history (samples, a power of two)
constexpr int MODES = MAX_PARTIALS * MAX_UNI;

// What the engine posts for the page (resonator/src/resonator-wasm.js turns them into its 'state'
// message). Posted every few blocks, the shape first.
namespace msg {
enum : uint16_t {
  state = 1, // key: env, the current's peak (A), lock offset (¢), locked, the bp's amplitude, the string's swing under the coil (mm), driven notes, keyDown, n, the drive's partial
  shape = 2, // key: the first string's partials: amplitude (mm) then phase, up to 15 each
};
}

class ResonatorEngine : public Engine {
 public:
  explicit ResonatorEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // pressing a held key harder: more current
  void slide(double value, int key) override;    // MPE: the note's own brightness
  int voiceCount() const override { return count; }
  void process(float *L, float *R, int n) override;

  struct Loop {
    int h = 1;
    double fc = 0, w0 = 0;    // the partial's frequency (Hz) and the oscillator's centre (rad/sample)
    Biquad bp, lo, hi;        // on the pickup: the partial, and a semitone below and above it
    double pw = 0, pwLo = 0, pwHi = 0, ka = 0; // their power, smoothed by ka
    double theta = 0, dw = 0, ef = 0, ke = 0, kp = 0, ki = 0, gain = 0, maxDw = 0;
    double cal = 0;           // the calibrated phase: the loop's delays and signs made up (rad)
    double share = 1;         // its part of the drive
    // the drive's harmonics, each at the string's own partial (McPherson's stretched waveform):
    // their frequencies over the loop's times m, and their phases
    double rs[DRIVE_HARMONICS]{}, ph[DRIVE_HARMONICS]{};
    int nh = 1;
  };

  struct Voice {
    int key = 0;
    bool keyDown = false, driven = false, damped = false, hammerOn = false, contact = false;
    double vel = 0, press = 0, bright = 0;
    double env = 0, current = 0, Inote = 0; // the drive's envelope, the coil's current (A), the note's signal current (A)
    uint64_t order = 0;     // when it was given its channel
    int nLoops = 1, N = 0, np = 0, nu = 1, quiet = 0;
    Loop loops[3];
    double g[DRIVE_HARMONICS]{};
    Strings s;
    // the modes, string by string (np partials each)
    std::array<double, MODES> q{}, q1{}, a1{}, a2{}, a1f{}, a2f{}, a1d{}, a2d{}, bA{}, bH{}, bB{}, psiA{}, psiH{}, beta{};
    double S = 0;           // the bridge's signal, Σ β q̇ (its velocity / √G)
    double hy = 0, hv = 0, hK = 0, hp = 0, hm = 0, cH = 0; // the hammer: height, speed, felt, mass; the strings' compliance under it
    int hammerAge = 0;
    double peak = 0, ua = 0, uaPeak = 0, pl = 0, pr = 0;
    double contactK = 0;
    double nz = 0, nz2 = 0, nzh = 0; // the noise drive's band
    double kz = 0, kzh = 0;
  };

  // read by the tests (through the WebAssembly's hooks): the voices in the order they started
  std::array<Voice *, NK> voices{};
  int count = 0;
  int driven() const;
  double offsetCents(const Voice &v) const; // the first loop's oscillator, against its partial

 private:
  void build(Voice &v, int key);
  void setDamper(Voice &v);
  void drive(Voice &v, double velocity);
  void loopsFor(Voice &v);
  void run(float *L, float *R, int n);
  void report();

  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  const double k;
  int D = 128;                    // the pickup's latency (samples)
  std::array<float, RING> ring{}; // the pickup's signal
  int pos = 0;
  double pressureAll = 0, gc = 0;
  uint64_t clock = 0;
  uint32_t rng = 2009;
  int focus = -1, tick = 0;
  NoteExpression expr{0};
  std::array<Voice, NK> slots{};
  std::array<float, 128> heard{}; // this block's pickup
};

} // namespace forte::resonator
