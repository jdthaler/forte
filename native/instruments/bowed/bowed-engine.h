// bowed-engine.h — the viola organista in real time, on the engine contract (forte/engine.h).
//
// Every sample:
//   1. the treadle sets the wheel speed v_B (with a ripple per stroke);
//   2. the shared bridge velocity follows from all sounding strings at once:
//      V = 2G Σ Z_k a_k / (1 + G ΣZ), a_k the wave each string sends it;
//   3. each string reflects at the bridge, meets the wheel (friction solved implicitly, with the
//      force its key applies) and returns its force on the bridge (bowed-string.h);
//   4. the bridge forces drive the soundboard's plate modes, heard by two microphones through each
//      mode's baffled-plate radiation (Wallace 1972), plus a direct path for the dense modes above
//      the modelled range.
//
// One string per key, all made with the engine (their rings sized for the sample rate). What a key
// depends on is closed-form (loopDesign: a few exp and cos per key), recomputed in setParams; the
// board's modes are found once and only their damping follows the loss factor. Nothing is
// allocated in process().
#pragma once

#include <array>
#include <cstdint>
#include <memory>

#include "bowed-model.h"
#include "bowed-params.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "bowed-string.h"

namespace forte::bowed {

constexpr int NSEG = 8;         // the bridge, as 8 drive points along its length
constexpr int SHAPE_N = 96;     // points along the string for the view
constexpr int TRACE = 2048;     // bow-point velocity history for the view
constexpr int MAX_MODES = 128;  // the board's modes below F_BODY (77)

// What the engine posts for the page (bowed/src/bowed-wasm.js turns them into its 'state' and
// 'error' messages). The shape and the trace come first, the state last.
namespace msg {
enum : uint16_t {
  state = 1, // key; FN, FT, vB, beta, down, active, kind (0 none, 1 helmholtz, 2 multiple, 3 raucous), spp, period, f
  shape = 2, // the first index, then up to 29 points of the string's shape
  trace = 3, // the first index, then up to 29 samples of the bow-point velocity (oldest first)
  error = 4, // a string went numerically unstable and was stopped
};
}

class OrganistaEngine : public Engine {
 public:
  explicit OrganistaEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: the finger presses harder
  void bend(double value) override;              // the strings' bridges slide: every sounding length ÷r, the notes ×r
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); } // one key's bridge alone
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // A key's string and its key action.
  struct Key : BowedString {
    Key(int key, double fs) : BowedString(key, fs) {}
    bool down = false, active = false;
    double vel = 0, after = 0, FN = 0, FT = 0, up = 0, dn = 0;
    double nb = 1; // its key's own bend (MPE), where the glide is
    int idle = 0, seg = 0;
  };
  Key *string(int key) { return key >= KEY_MIN && key <= KEY_MAX ? S[key - KEY_MIN].get() : nullptr; }

  // read by the tests (through the WebAssembly's hooks)
  int nAct = 0;
  double vB = 0;
  double bendTo = 1, bendNow = 1; // pitch bend: the ratio, and where the glide is
  NoteExpression expr{MPE_BEND};  // each key's own bend

 private:
  void run(float *L, float *R, int n);
  void buildBody(double eta);
  bool damped(const Key &s) const { return !s.down && !Pm.lifted; }
  // With the dampers lifted, the 49 strings of C2–C6 (the board is drawn on them) ring in sympathy;
  // the strings past them join only when played, and leave the loop once they are silent. Medium
  // keeps the sympathy of the 24 below C4 (each runs at the output rate), Low none: a string
  // then joins only when played.
  bool sympathetic(int key) const { return key >= KEY_LO && key <= (applied == Quality::high ? KEY_HI : applied == Quality::medium ? KEY_LO + 23 : KEY_LO - 1); }
  void applyQuality();
  void liftAll();
  void activate(Key &s);
  void fault(Key &s);
  void retire();
  void report();

  bool hasParams = false;
  Params Pm;
  Friction Fr{};
  double vBt = 0, kB = 0, ph = 0;
  int64_t t = 0;
  std::array<std::unique_ptr<Key>, NK> S;
  std::array<Key *, NK> act{};
  std::array<double, NSEG> seg{};
  std::array<int, NSEG> segOn{};
  int focus = 60;
  int64_t lastPost = 0, shotAt = 0;
  double shotF = 0;
  bool shot = false;
  double bodyE = 0;
  std::array<float, SHAPE_N> shapeBuf{};
  std::array<float, TRACE> trace{}, traceOut{};
  int tw = 0;
  Motion motion;
  std::array<Biquad, 2> hp;
  OnePole mass;
  std::array<double, 64> dl{};
  int dw = 0;
  double etaBody = -1;
  int faults = 0;
  Quality applied = Quality::high; // the Quality the strings, the sympathy and the board follow
  const double fly;

  // the board: its modes (found once; the loss factor sets their damping) and their state
  int M = 0;
  std::array<BoardMode, MAX_MODES> modes{};
  std::array<double, MAX_MODES> a1{}, a2{}, q1{}, q2{}, cLr{}, cLi{}, cRr{}, cRi{};
  std::array<double, MAX_MODES * NSEG> drive{}, driveOn{}; // (driveOn: at the segments sounding this block)
  std::array<double, NSEG> segF{};
  // Medium and Low: the board at fs/2 (buildBody), each pair of samples' bridge forces summed in
  // segH, its output held for two samples
  bool half = false;
  int pair = 0;
  double holdL = 0, holdR = 0;
  std::array<double, NSEG> segH{};
  std::array<double, MAX_MODES> a1h{}, a2h{}, cLrh{}, cLih{}, cRrh{}, cRih{};
  std::array<double, MAX_MODES * NSEG> driveH{};
};

} // namespace forte::bowed
