// kalimba-engine.h — the real-time part, on the engine contract (forte/engine.h). Each plucked
// tine is a set of modes whose net force drives the box; the box (its top, the air in the hole,
// the caps on it) is one for all the tines.
#pragma once
#include <array>
#include <vector>
#include "forte/engine.h"
#include "kalimba-model.h"
#include "kalimba-params.h"
namespace forte::kalimba {

// The box in time: the (1,1) mode and the hole's air coupled through the cavity, and the higher
// plate modes, each integrated by the trapezoidal rule (unconditionally stable, and cheap to
// rebuild while a finger moves over the hole); the caps bounce on the top.
class Body {
 public:
  explicit Body(double fs) : fs(fs) {}
  void set(const Box &box, int caps);
  // One sample: generalised forces on the plate modes in, sound pressure (Pa at 1 m) out.
  double run(const double *F);
  // A tine pressed down with force F at weights w before it is let go: the top's static sag
  // under it (and the force the trapezoidal rule last saw), so the release starts from rest.
  void preload(double F, const double *w);
  void reset();
  double capRing() const { return capOut; }
 private:
  double fs;
  Box box{};
  // (1,1) mode and hole: x = [q, U], v = [q', U']; s[n+1] = Ad s[n] + Bd (f[n] + f[n+1])
  double Ad[4][4]{}, Bd[4]{}, s[4]{};
  double K11 = 0, M11 = 1, invIh = 0;
  struct Mode { double Ad[2][2], Bd[2], x = 0, v = 0, K, M, R, S; };
  std::array<Mode, PLATE_MODES> modes{}; // [0] unused: the (1,1) mode is in s
  std::array<double, PLATE_MODES> fPrev{};
  struct CapState { double phi[PLATE_MODES]; double z = 0, zd = 0; bool contact = true; double a1[2], a2[2], b[2], y1[2]{}, y2[2]{}; };
  std::array<CapState, MAX_CAPS> caps{};
  int capCount = 0;
  double capOut = 0;
};

class KalimbaEngine : public Engine {
 public:
  explicit KalimbaEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override;
 private:
  static constexpr int kMaxVoices = 48;
  struct Resonator { double a1, a2, y1, y2; };
  struct Voice {
    int key = 0;
    std::array<Resonator, MAX_MODES> modes{};
    int count = 0;
    std::array<double, PLATE_MODES> w{}; // where it drives the plate modes
    double level = 1, start = 0;         // start: Σ|force| at release, for when it has died away
    bool released = false, damped = false, grabbed = false;
  };
  void rebuildBody();
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  double cover = -1, coverTarget = 0, builtBox = -1, builtHole = -1, builtCover = -1;
  int builtCaps = -1;
  std::vector<Voice> voices; // reserved: never reallocates
  Body body;
};

} // namespace forte::kalimba
