// hurdygurdy-engine.h — the hurdy-gurdy in real time, on the engine contract (forte/engine.h).
//
// Every sample:
//   1. the hand turns the crank: toward the crank speed while a key is held (or Space, or Keep
//      turning), with the coups' surges, the hand's unevenness and the wheel's inertia;
//   2. each bridge's velocity follows from the strings on it at once (the chanterelles share the
//      middle one; each drone has its own): V = 2G Σ Z_k a_k / (1 + G ΣZ), a_k the wave each string
//      sends it;
//   3. each string reflects at its bridge (the trompette at the chien, which it may lift), meets the
//      wheel (friction solved implicitly) and returns its force on the bridge (hurdygurdy-string.h);
//   4. the bridge's force and the chien's foot drive the soundboard's plate modes, heard by two
//      microphones (Wallace 1972), plus a direct path for the dense modes above the modelled range.
//
// The keys work the chanterelles' tangents: the highest key held stops them (its tangent is the
// nearest the bridge), the next highest when it lets go. With no key held the open strings sound
// while the crank turns; when the hand stops the crank, the last tangent stays down until the wheel
// has stopped. Nothing is allocated in process().
#pragma once

#include <array>
#include <bitset>
#include <cstdint>
#include <memory>

#include "forte/engine.h"
#include "hurdygurdy-model.h"
#include "hurdygurdy-params.h"
#include "hurdygurdy-string.h"

namespace forte::hurdygurdy {

constexpr int TRACE = 1024;    // the chien's lift and the trompette's pull, for the view
constexpr int MAX_MODES = 96;  // the board's modes below F_BODY

// What the engine posts for the page (hurdygurdy/src/hurdygurdy-wasm.js turns them into its
// 'state'). The traces come first, the state last.
namespace msg {
enum : uint16_t {
  state = 1, // key (the melody's); turns/s, phase (turns), v_B, threshold (turns/s), stop length, β, landings/s,
             // F_t, running, the strings on and sounding (bits), the chien's highest lift (m), surge
  lift = 2,  // the first index, then up to 29 samples of the chien's lift (m), oldest first
  pull = 3,  // the first index, then up to 29 samples of the trompette's pull on the chien (N)
};
}

class HurdyGurdyEngine : public Engine {
 public:
  explicit HurdyGurdyEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { pedal = on; } // the coup de poignet, held
  void allNotesOff() override;
  void pressure(double value, int key) override;    // aftertouch: the hand leans into the crank
  void bend(double value) override;                 // the tangents push the chanterelles: their notes × r
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  struct Str : HurdyString {
    Str(int id, double fs, int os, double fLow) : HurdyString(fs, os, fLow), id(id) {}
    const int id;
    bool active = false;
    double FN = 0, FT = 0;
    int idle = 0;
  };

  // read by the tests (through the WebAssembly's hooks)
  std::array<std::unique_ptr<Str>, NSTR> S;
  Chien chien;
  double rate = 0, phase = 0, vB = 0, drive = 0, surge = 0; // the crank: turns/s, turns, the wheel's speed, the hand
  int melody = KEY_OPEN;  // the key whose tangent stops the chanterelles (KEY_OPEN: open)
  bool running = false;
  int64_t t = 0;
  bool hasParams = false;
  Params Pm;

 private:
  void run(float *L, float *R, int n);
  void restop();          // the chanterelles to the melody's length (and the bend)
  void redesign(Str &s);  // a string's loop at its length now
  void applyQuality();
  void buildBody(double eta);
  void retire();
  void report();
  int topKey() const;

  bowed::Friction Fr{};
  std::bitset<128> held;
  int nHeld = 0;
  bool pedal = false;
  double after = 0, shotA = 0, bendR = 1, bendTo = 1;
  int64_t shotAt = -1;
  double kB[NBRIDGE] = {}, kself[NSTR] = {}, zeta = 0;
  double hand = 0, flyK = 0; // the wheel's lag behind the hand
  Quality applied = Quality::high;

  // the board
  int M = 0;
  std::array<Mode, MAX_MODES> modes{};
  std::array<double, MAX_MODES> a1{}, a2{}, b0{}, q1{}, q2{}, cLr{}, cLi{}, cRr{}, cRi{};
  std::array<Biquad, 2> hp;
  OnePole mass;
  std::array<double, 64> dl{};
  int dw = 0;
  double etaBody = -1, bodyE = 0;

  // the view
  std::array<float, TRACE> lift{}, pull{}, liftOut{}, pullOut{};
  int tw = 0;
  int64_t lastPost = 0, hits0 = 0, hitsT = 0;
  double liftMax = 0;
};

} // namespace forte::hurdygurdy
