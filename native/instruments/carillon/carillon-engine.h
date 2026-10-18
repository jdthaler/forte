// carillon-engine.h — the real-time carillon, on the engine contract (forte/engine.h).
//
//   key ─▶ clapper (a mass on a pendulum, Hertz contact, solved implicitly every sample against
//          every mode of the bell, where the bell is: a ringing bell is struck as it moves)
//       ─▶ bell modes (exact two-pole recursions; each m ≥ 1 family a doublet, split by the asymmetry)
//       ─▶ each mode's radiated pressure at the listener ─▶ panned by the bell's place in the frame
//
// A carillon has no dampers: key-up does nothing, and the bells ring until they die away. One voice
// per bell. A bell's modes come from the FEM's table (bell-table.h) scaled to its note: a few
// hundred multiplications and some Bessel recurrences when it is struck, no eigen-solve, so the
// engine builds a bell in noteOn. Voices live in a fixed pool: nothing is
// allocated after construction.
#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <vector>

#include "carillon-model.h"
#include "carillon-params.h"
#include "forte/engine.h"

namespace forte::carillon {

// What the engine posts for the page (carillon/src/carillon-wasm.js gathers them into its 'bell'
// message).
namespace msg {
enum : uint16_t {
  bell = 1,  // the struck bell (key, 0 for none): n, age, contactMs, fwhm, Fmax, v, profile, historic
  amp = 2,   // the first resonator's index, then up to 29 resonators' amplitudes as heard
  done = 3,  // the bell's message is complete: n
  error = 4, // key: the bell failed numerically
};
}

constexpr int RES_MAX = 2 * MODES_MAX; // resonators: two per mode at most (a doublet)

class CarillonEngine : public Engine {
 public:
  static constexpr int MAX_VOICES = 36; // bells sounding at once; the quietest older one fades out beyond this
  static constexpr int POOL = 96;       // voices kept, with those fading out
  explicit CarillonEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; } // a carillon has no dampers: nothing to lift
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;

  struct Clap {
    bool on = false;
    double x = 0, x1 = 0, d1 = -1, d2 = -1;
    int n = 0, contact = 0;
    double Fmax = 0, ms = 0, fwhm = 0, v = 0;
  };
  struct Voice {
    int key = 0, profile = 0;
    double historicAmount = 0; // with the profile, which bell hangs there
    Bell bell;
    BellMode modes[MODES_MAX];
    int nModes = 0, N = 0;
    int src[RES_MAX];
    uint8_t mem[RES_MAX], act[RES_MAX];
    int idx[RES_MAX], nAct = 0;
    double A1[RES_MAX], A2[RES_MAX], Bc[RES_MAX], PHI[RES_MAX], B[RES_MAX], G[RES_MAX], GT[RES_MAX];
    double Y1[RES_MAX], Y2[RES_MAX], W[RES_MAX], SIG[RES_MAX], AMP[RES_MAX], ANG[RES_MAX], HRE[RES_MAX], HIM[RES_MAX];
    double gl = 0, gr = 0, eps = 0, age = 0, fade = 1, peak = 0, level = 0;
    bool fading = false, dead = false, released = false;
    Clapper clap{};
    double Cm = 0, hm = 0, fd0 = 0, fV0 = 0;
    Clap cl;
    std::vector<double> forces; // the clapper's force, sample by sample (sized at construction)
  };

  // read by the tests (through the WebAssembly's hooks): the voices in the order they were struck
  int nVoices = 0;
  std::array<int, POOL> order{}; // pool indices
  std::array<int, KEY_HI - KEY_LO + 1> byKey{}; // pool index, or −1
  const Voice &voice(int i) const { return pool[order[i]]; }

 private:
  int newVoice(int key);
  void coefs(Voice &v, bool first);
  void gains(Voice &v, bool now);
  void strike(Voice &v, double velocity);
  double hertz(Voice &v, double D) const;
  double contactForce(Voice &v, double dFree, double C);
  void render(Voice &v, float *L, float *R, int n);
  void endContact(Voice &v);
  void prune(Voice &v);
  static void compact(Voice &v);
  void block(float *L, float *R, int n);
  void postFocus();

  std::unique_ptr<Voice[]> pool;
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  double S_asym = 0, S_distance = 0, T_asym = 0, T_distance = 0; // gliding values and their targets
  int focus = -1, blocks = 0;
  int forcesLen;
  std::vector<double> buf;
  BellMode modesNow[MODES_MAX]; // scratch: a bell's modes at the strike
};

} // namespace forte::carillon
