// cimbalom-engine.h — the real-time cimbalom and hammered dulcimer, on the engine contract
// (forte/engine.h).
//
//   key ─▶ a hammer thrown at the key's course at the stroke's speed: its contact with the strings
//          solved each sample (cimbalom-model.h), semi-implicitly: the strings' next position
//          without the hammer, then the force that the compression it leaves gives, by Newton's
//          method on F = K δᵖ(1 + α δ̇); the force shared by the course's strings at the strike point
//   the strings: every string's partials (and, on the dulcimer's treble, its far side's), each an
//          exact two-pole resonator, all meeting the bridge at one point: the bridge signal
//          S = Σ c q̇ pushes back on every partial with −c S (c² = 2σ_B), so the strings of a course
//          and the two sides of the dulcimer's bridge drive one another
//   tremolo: while a key is held, more strokes, the hands alternating
//   the dampers: on every course not held by a key or by the pedal, when the bar is fitted
//   the other courses: sympathetic strings (forte/sympathetic.h), driven by the voices' bridge signals
//   bridge forces ─▶ the soundboard's plate modes at three points along the bridges ─▶ two
//          microphones, plus the residual path above the modal band
//
// One voice per key, from a fixed pool, built at its first stroke (closed forms). Nothing is
// allocated in process().
#pragma once

#include <array>
#include <cstdint>

#include "cimbalom-model.h"
#include "cimbalom-params.h"
#include "forte/engine.h"
#include "forte/sympathetic.h"

namespace forte::cimbalom {

// What the engine posts for the page (cimbalom/src/cimbalom-wasm.js), every few blocks.
namespace msg {
enum : uint16_t {
  shape = 1,   // the focused course's string 0: L, L′, x_h, the hammer's height over the strings,
               // the force, the side, then 12 struck-side and 8 far-side amplitudes (mm)
  contact = 2, // the last stroke's force against time: key = the chunk (0, 1, 2); dt, count, then 28 values
  state = 3,   // the focused key's level (dB), its peak, voices, the last stroke's peak force,
               // contact time and number of contacts, the sympathetic partials running
};
}

class CimbalomEngine : public Engine {
 public:
  static constexpr int BLOCK = 128;
  static constexpr int POOL = 40;
  static constexpr int OSC = STR_MAX * (N_MAX + N_FAR);
  static constexpr int HISTORY = 288; // the stroke's force, sample by sample, for the page (6 ms at 48 kHz)
  explicit CimbalomEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; }
  void allNotesOff() override;
  void pressure(double value, int key) override;
  void slide(double value, int key) override; // MPE: the note's own strike point
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;

  // Quality (forte/engine.h): Medium and Low sound fewer courses at once, give each string fewer
  // partials (none above fTop()), the far sides fewer, the course at most two strings (Low), and
  // the sympathetic strings fewer partials (Medium) or none (Low).
  int maxVoices() const { return pick(32, 16, 10); }
  int nTop() const { return pick(N_MAX, 24, 12); }
  int farTop() const { return pick(N_FAR, 16, 6); }
  double fTop() const { return pick<double>(14000, 7000, 4500); }
  int strTop() const { return pick(STR_MAX, STR_MAX, 2); }
  int symModes() const { return pick(SYM_MODES, 4, 0); }

  struct Hammer {
    bool active = false;
    double y = 0, v = 0, m = 0.001, F = 0, delta = 0, age = 0; // the head: height, speed (toward the strings), mass
    double ys = 0, vs = 0, ms = 0.003, ks = 0, rs = 0;         // the stick behind it, and its flex between them
    Face face{};
    double peakF = 0, onTime = 0; // its stroke: the largest force, the time in contact
    int contacts = 0;
    bool touching = false;
  };
  struct Voice {
    bool inUse = false, down = false;
    int key = 0, strings = 0, nStruck = 0, nFar = 0, nOsc = 0;
    Course C;
    double xh = 0;                 // the strike point (m)
    double S = 0;                  // the bridge signal of the last sample
    double fade = 1, fadeStep = 0; // stolen: fading out
    double peak = 0, level = 0, age = 0, vel = 0;
    double nextRoll = 0;           // s until the tremolo's next stroke
    int strokes = 0, quiet = 0;
    bool damped = false;
    uint64_t ver = 0;              // the strings' design it was built from
    Quality built = Quality::high; // and the Quality
    std::array<double, NSEG> w{};
    double pl = 0, pr = 0;
    Hammer h;
    // per oscillator (string j's partials, then its far side's, string after string)
    std::array<double, OSC> q{}, q1{}, A1{}, A2{}, D1{}, D2{}, bg{}, bc{}, cK{}, bpsi{}, psiy{}, beta{}, tmp{};
    std::array<double, BLOCK> Sblock{}; // its bridge signal this block (the sympathetic strings take it out of their own)
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  Params mp;
  Voice *find(int key);
  Sympathetic sym;
  bool historyDone = false;
  std::array<double, HISTORY> history{};
  int historyLen = 0;

 private:
  struct Board {
    int K = 0;
    std::array<double, BOARD_MODES> e0{}, e1{}, a1{}, a2{}, ml{}, mr{};
    std::array<double, BOARD_MODES * NSEG> ph{};
    double lpG = 0;
    std::array<double, NSEG> lp{};
    std::array<double, 2 * NSEG> res{};
    double b0 = 0, b1 = 0, b2 = 0, ha1 = 0, ha2 = 0;
    std::array<double, 8> hz{};
    void init(int build, double fs);
    void run(const double *seg, double *L, double *R, int n);
    void clear() { e0.fill(0); e1.fill(0); lp.fill(0); hz.fill(0); }
  };

  Voice *allocate(int key);
  void build(Voice &v);
  void launch(Voice &v, double speed);
  void render(Voice &v, int n, double *seg);
  void symRefresh();
  void report();

  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  int built = -1; // the board the engine was built for
  std::array<Board, 2> boards;
  std::array<Voice, POOL> pool{};
  std::array<double, 128> after{}, slides{};
  std::array<uint8_t, 128> down{};
  std::array<uint64_t, 128> symVer{};
  uint64_t version = 1;
  int symNext = 0;
  Quality symQuality = Quality::high;
  std::array<double, NSEG * BLOCK> seg{};
  std::array<double, BLOCK> bL{}, bR{}, Sall{}, zeros{};
  std::array<double *, NSEG> bus{};
  double dcx = 0, dcy = 0, dcL = 0, dcR = 0;
  int focus = -1, tick = 0;
  uint32_t rng = 22222;
  double lastPeakF = 0, lastOn = 0;
  int lastContacts = 0;
};

} // namespace forte::cimbalom
