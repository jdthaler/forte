// whistlers-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// lightning stroke heard at a key's field line: for each duct and each hop, the whistler's two
// branches, each a tone whose frequency at time t is the one whose delay is t (the stationary
// phase), at its amplitude; the stroke's own crack along the ground (a click and the tweeks of the
// waveguide's modes); and, while the key is held, chorus. Two crossed loop antennas hear it: the
// whistler is circularly polarised, so it reaches them a quarter cycle apart.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "whistlers-model.h"
#include "whistlers-params.h"

namespace forte::whistlers {

// Messages to the page: a stroke (its key's field line), a chorus element starting.
enum MessageType : uint16_t { kStroke = 0, kChorus = 1 };
constexpr int MAX_HOPS = 8, MAX_TWEEKS = 8, MAX_ELEMENTS = 8;
constexpr double PRESSURE_RATE = 30; // chorus elements a second that full key pressure adds

// A key's field lines, one per duct, kept until the parameters that shape them change.
struct KeyLines {
  bool valid = false;
  double density = 0, lpp = 0, spread = 0, f = 0;
  int ducts = 0;
  std::array<Track, MAX_DUCTS> tr{};
};

class WhistlersEngine : public Engine {
 public:
  explicit WhistlersEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; }
  void pressure(double value, int key) override;
  void allNotesOff() override { voices.clear(); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;
  // the key's lines for the current parameters (built on its first note)
  const KeyLines &linesOf(int key);

 private:
  static constexpr int kMaxVoices = 24;
  struct Comp {   // one duct's whistler after `hop` hops, one branch (dir −1 the falling one, +1 the rising)
    int duct = 0, hop = 1, dir = -1, idx = 0;
    double gain = 0, zr = 1, zi = 0, w = 0, a = 0;
    bool done = false;
  };
  struct Tweek {  // a waveguide mode of the stroke's crack
    int m = 1;
    double zr = 1, zi = 0, w = 0, a = 0, loss = 1;
    bool done = false;
  };
  struct Element { // a chorus element: a rising tone
    double f0 = 0, f1 = 0, dur = 0, age = 0, amp = 0, zr = 1, zi = 0, w = 0;
    bool live = false;
  };
  struct Voice {
    int key = 0, ducts = 1, ncomp = 0, ntweek = 0;
    double vel = 0, scale = 1, clock = 0, sfClock = 0, env = 1;
    std::array<Track, MAX_DUCTS> tr{};
    std::array<Comp, MAX_DUCTS * MAX_HOPS * 2> comps{};
    std::array<Tweek, MAX_TWEEKS> tweeks{};
    std::array<Element, MAX_ELEMENTS> el{};
    double click = 0, lp1 = 0, lp2 = 0; // the crack's click: its impulse, through a band-pass
    bool clicked = false;
    double press = 0, pressTarget = 0, toNext = 0;
    bool held = true, stolen = false, done = false;
  };
  void start(Voice &v, int key, double velocity);
  void evalComp(const Voice &v, const Comp &c, double T, double &f, double &a) const;
  void play(Voice &v, float *L, float *R, int n);
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  Rng rng;
  std::vector<KeyLines> lines;  // the 88 keys'
  std::vector<Voice> voices;    // reserved (twice kMaxVoices, for the stolen ones fading out): never reallocates
};

} // namespace forte::whistlers
