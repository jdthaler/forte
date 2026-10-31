// clavier-engine.h — the real-time tangent clavier, on the engine contract (forte/engine.h).
//
// Per key (clavier-model.h): speaking modes q_n coupled through their mass to the string's height
// s at the anvil, quarter-wave yarn modes r_m with s = Σ r_m, a tangent of mass M on a Hertzian
// rubber tip, and a Hertzian steel anvil. Each sample:
//   1. every mode takes its free step (exact two-pole recursion)
//   2. the tangent and the anvil are solved together, implicitly (2-D Newton on the tip height η
//      and the string height s); the felt mute, a linear spring–dashpot on the string, is
//      eliminated into the same solve
//   3. every mode gets its share of the result: the speaking modes through the anvil point's
//      acceleration, the yarn modes through the force there
// The tension of the speaking length follows its stretch, so key pressure (the rubber wrapping the
// string round the anvil) and large swings (Kirchhoff–Carrier) both move the pitch. The pickups
// sense the speaking length's height under each pole through an exponential field; the selected
// tone networks make one biquad on the sum, then the amplifier's shelves.
//
// Space and CC64 engage the mute bar; aftertouch and the pitch wheel (up only) press held keys
// harder, and a note's own bend (MPE) presses its key as the wheel would, on top of the wheel. A
// key's model is built in noteOn (clavier-model.h says why that is cheap). Voices live in a fixed
// pool: nothing is allocated after construction.
#pragma once

#include <array>
#include <cstdint>
#include <memory>

#include "clavier-model.h"
#include "clavier-params.h"
#include "forte/engine.h"
#include "forte/expression.h"

namespace forte::clavier {

// What the engine posts (clavier/src/clavier-wasm.js turns it into the page's message).
namespace msg {
enum : uint16_t {
  error = 1, // key: the string failed numerically
};
}

class ClavierEngine : public Engine {
 public:
  static constexpr int MAX_VOICES = 24; // beyond this the quietest other voice fades out
  // Quality (forte/engine.h): the only trim, fewer voices at once at Medium and Low (a string is
  // cheap; its partials and its tangent's solve are what it is)
  int maxVoices() const { return pick(MAX_VOICES, 16, 10); }
  static constexpr int POOL = 64;       // voices kept, with those fading out
  static constexpr int BLOCK_MAX = 4096;
  explicit ClavierEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { space = on; } // Space / CC64 engages the mute bar
  void allNotesOff() override;
  void pressure(double value, int key) override;
  void bend(double value) override; // the wheel presses every held key harder (up only)
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); } // that key pressed harder
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;

  struct Voice {
    int key = 0, version = 0;
    KeyModel mdl;
    int N = 0, M = 0;
    // q holds q[n], q1 q[n−1]: two arrays whose roles swap every sample
    double qa[N_MAX], qb[N_MAX], *q = qa, *q1 = qb;
    double A1[N_MAX], A2[N_MAX], eps[N_MAX], beta[N_MAX], c[N_MAX], w[N_MAX], phi[N_MAX], gam[N_MAX], Wl[N_MAX], Wu[N_MAX];
    double ra[M_MAX], rb[M_MAX], *r = ra, *r1 = rb;
    double B1[M_MAX], B2[M_MAX], by[M_MAX];
    double ms = 0, Cb = 0, Cy = 0, mass = 0, kcGain = 0, Kr = 0, wrapK = 0;
    double s = 0, s1 = 0, eta = 0, eta1 = 0, C1 = 0, C0 = 0, um = 0, Q = 0;
    double Flp = 0, Fr = 0, Fa = 0, force = 0, Pl = 0, Pu = 0, ul = 0, uu = 0;
    double xl = 0, xu = 0, gl = 0, gu = 0, lam = 0, xm = 0, Pb = 0, Pg = 0;
    double pressure = 0, fade = 1, peak = 0, Fpeak = 0;
    double fz[FRAME_MODES], fz1[FRAME_MODES], Z = 0; // the frame as this key's anvil drives it, and its last sum
    int quiet = 0;
    bool down = false, thrown = false, dead = false, killing = false, muted = false;
  };

  // read (and the tests' state written) through the WebAssembly's hooks: the voices in the order
  // they were made, and which one is each key's
  int nVoices = 0;
  std::array<Voice *, POOL> voices{};
  std::array<Voice *, KEY_MAX - KEY_MIN + 1> byKey{};
  double muteLevel = 0; // the felt's engagement, 0 … the felt pressure (a page's slow motion sets it)

 private:
  void init(Voice &v, int key);
  void setPickups(Voice &v);
  void setMuteX(Voice &v);
  void render(Voice &v, double *out, int n);
  void block(float *L, float *R, int n);

  std::unique_ptr<Voice[]> pool;
  std::array<double, p::count> P{};
  bool hasParams = false, space = false;
  int version = 0;
  Tuning tuning; // the keyboard's, as the strings were last tuned to it
  double bendNow = 0, chanPressure = 0;
  NoteExpression expr{kBendSemitones}; // each key's own bend: as far as the wheel presses
  double k, lpF, lpFall, lpM, killDecay;
  double fA1[FRAME_MODES], fA2[FRAME_MODES], fB[FRAME_MODES], magSum = 0; // the frame's steps; Σ every string's steel under the pickups
  ToneBiquad tone{};
  double tz1 = 0, tz2 = 0;
  struct Shelf { double b0, b1, b2, a1, a2, z1 = 0, z2 = 0; double run(double x); };
  Shelf shL, shH;
  double dcx = 0, dcy = 0, dcR, gain = -1, lpG;
  std::array<double, BLOCK_MAX> mono{};
};

} // namespace forte::clavier
