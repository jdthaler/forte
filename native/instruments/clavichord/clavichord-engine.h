// clavichord-engine.h — the real-time clavichord, on the engine contract (forte/engine.h).
//
//   key ─▶ its tangent (the key's and the finger's mass, pushed by the finger) meets the strings
//          at the key's speed and stays on them: a moving end of the speaking length, so every
//          partial is driven by the tangent's acceleration, gₙ z̈ (clavichord-model.h)
//   the tangent feels the strings pull it down, the speaking length's and the afterlength's slopes
//          at it (T y′ either side), and settles where they balance the finger's pressure; that
//          stretches the strings, and their tension and every partial's pitch follow, sample by
//          sample (pressure, Bebung, the attack's overshoot)
//   key up ─▶ the tangent drops at the key's speed; when it is clear of the strings, their shape
//          becomes the open string's (bridge to hitchpin), which the listing damps
//   fretted courses: a tangent arriving nearer the bridge takes the strings over from the one
//          already there (its shape projected onto the new speaking length); leaving, it hands
//          them back to the lower tangent still down, which then speaks, plucked by the string
//   bridge force (each string's T y′ at the bridge) ─▶ soundboard plate modes at three points along
//          the bridge ─▶ two microphones, plus the residual path above the modal band
//
// One voice per course (the strings a key, or a fretted pair, shares), from a fixed pool; its
// strings are designed at its first stroke (closed forms: a few hundred partials, the board's
// admittance at each). Nothing is allocated in process().
#pragma once

#include <array>
#include <cstdint>

#include "clavichord-model.h"
#include "clavichord-params.h"
#include "forte/engine.h"

namespace forte::clavichord {

// What the engine posts for the page (clavichord/src/clavichord-wasm.js turns them into its
// 'state' message), every few blocks, the state last.
namespace msg {
enum : uint16_t {
  shape = 1, // the focused course's string 0: 10 partials' amplitudes and velocities (speaking, or the
             // open string's), 4 of the afterlength's and their velocities, the basis length, the phase
  state = 2, // key (sounding); phase, z, ż, finger force, cents, L, a, l, T/Tnom, strings, peak, course
};
}
enum class Phase : uint8_t { idle, held, lifting, open };

class ClavichordEngine : public Engine {
 public:
  static constexpr int BLOCK = 128;
  static constexpr int POOL = 32;   // voices, sounding or fading
  explicit ClavichordEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: the finger presses harder
  void slide(double value, int key) override;    // MPE: the note's own Bebung
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;

  // Quality (forte/engine.h): Medium and Low sound fewer courses at once, give each string fewer
  // partials (none above fTop(), none beyond nTop()), and fewer afterlength and open-string partials.
  int maxVoices() const { return pick(20, 14, 9); }
  int nTop() const { return pick(N_MAX, 48, 28); }
  double fTop() const { return pick<double>(1e9, 6000, 4000); }
  int mTop() const { return pick(M_AFTER, 4, 2); }
  int jTop() const { return pick(J_OPEN, 16, 8); }

  // One string of a course and its three sets of partials (clavichord-model.h): the speaking
  // length's (q), the afterlength's (p) and, once the tangent has left, the open string's (r).
  struct Str {
    StringDesign S;
    int N = 0, M = 0, J = 0;
    double T = 0, Tref = 0;            // the tension now; and the one the steps were made at
    double Ls = 0, as = 0;             // its speaking length and afterlength under the sounding tangent
    double sumS = 0, sumA = 0, kc = 0; // Σ(−1)ⁿkₙqₙ, Σκₘpₘ, the vibration's stretch
    std::array<double, N_MAX> q{}, q1{}, A1{}, A2{}, G{}, EP{}, KS{}, KB{}, KK{};
    std::array<double, M_AFTER> p{}, p1{}, B1{}, B2{}, H{}, KA{}, KKa{};
    std::array<double, J_OPEN> r{}, r1{}, C1{}, C2{}, KO{};
    Modes sp, af, op;
  };
  struct Voice {
    bool inUse = false, dead = false;
    int course = 0, nKeys = 1, nStr = 2;
    std::array<int, 2> keys{};
    std::array<bool, 2> down{};
    std::array<double, 2> vel{};
    int active = -1;                 // which of keys sounds (its tangent on the strings), or −1
    Phase phase = Phase::idle;
    double z = 0, z1 = 0, zv = 0;    // the tangent: height above the strings' rest line, a sample ago, speed
    double L = 0, a = 0;             // the sounding tangent's speaking length and afterlength (the 8′'s)
    double fnom = 0;                 // its fundamental at the nominal touch (rigid nut)
    double F = 0, lift = 0, M = 0.012;
    int handTo = -1;                 // lifting: the lower key on the course still down, which takes the strings over
    double zHand = 0;                // once this tangent is down to here
    double beb = 0, bebAge = 0;      // the Bebung's phase, and how long the finger has been at it
    double fade = 1, fadeStep = 0;   // stolen: fading out
    double peak = 0, age = 0;
    int quiet = 0;
    std::array<double, NSEG> w{};
    double pl = 0, pr = 0;
    std::array<Str, CHOIRS> s;
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  Params mp;
  Voice *find(int course);

 private:
  struct Board {
    int K = 0;
    std::array<double, BOARD::maxModes> e0{}, e1{}, a1{}, a2{}, ml{}, mr{};
    std::array<double, BOARD::maxModes * NSEG> ph{};
    double fb = 0, lpG = 0;
    std::array<double, NSEG> lp{};
    std::array<double, 2 * NSEG> res{};
    double b0 = 0, b1 = 0, b2 = 0, ha1 = 0, ha2 = 0;
    std::array<double, 8> hz{};
    void init(double fs);
    void run(const double *seg, double *L, double *R, int n);
    void clear() { e0.fill(0); e1.fill(0); lp.fill(0); hz.fill(0); }
  };
  struct Piece { bool lin; double c, r, w, ph, x0, x1; }; // c·sin(wX + ph), or cX + r, on [x0, x1]

  void block(float *L, float *R, int n);
  Voice *allocate(int course);
  void design(Voice &v);
  void tune(Voice &v, int idx, double zStart);      // the speaking and afterlength partials for keys[idx]
  void strike(Voice &v, int idx, double speed, double propZ = 0); // keys[idx]'s tangent onto the strings (speed 0: holding them up at propZ)
  void toOpen(Voice &v);                            // the tangent has left the strings
  int pieces(const Voice &v, Phase phase, const Str &s, bool before, Piece *out, double propX = 0, double propZ = 0) const;
  static double eval(const Piece *pc, int n, double X);
  static double project(const Piece *pc, int n, double w, double ph, double x0, double x1);
  void render(Voice &v, int n);
  double fingerTarget(const Voice &v) const;
  void report();

  std::array<double, p::count> P{};
  bool hasParams = false;
  const double dt;
  std::array<Voice, POOL> pool{};
  std::array<double, 128> after{}, slides{};
  double afterAll = 0;
  std::array<double, NSEG * BLOCK> seg{};
  std::array<double, BLOCK> bL{}, bR{}, dir{};
  double dcx = 0, dcy = 0;
  Board board;
  int focus = -1, tick = 0;
  std::array<Piece, 2 * (J_OPEN + N_MAX + M_AFTER + 2)> scratch{};
  uint32_t order = 0;
};

} // namespace forte::clavichord
