// hurdygurdy-string.h — one string on the wheel, as the Viola Organista's (bowed-string.h): a
// digital waveguide in velocity waves (McIntyre, Schumacher & Woodhouse 1983; Smith 1992).
//
//   bridge or chien ──(2·Db)── wheel ──(2·Dn)── nut or tangent        x = 0 at the bridge
//
// Waves are lossless in the delay lines; each round trip ends in a one-pole low-pass for the
// string's own losses. The far end (the nut, or the tangent that stops it) reflects with −1, and
// moves when a tangent lands: only the wheel's far side changes length. At the wheel the friction
// force enters both ways with the admittance 1/(2Z₀) and is solved implicitly every step
// (bowed::frictionForce). The bridge end either sits on the shared bridge, whose velocity the
// engine solves for every string at once, or (the trompette) on the chien. Each string runs at
// fs·os, its forces low-passed and decimated. No torsional waves: the Viola Organista's steel
// strings need them more than gut does.
#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "forte/dsp.h"
#include "hurdygurdy-model.h"

namespace forte::hurdygurdy {

class HurdyString {
 public:
  // fsBase, os steps a sample; rings long enough for fLow (Hz) at fsBase·os (and so at any fewer)
  HurdyString(double fsBase, int os, double fLow);
  void setOversample(int os); // fewer steps (Medium and Low): design() again after, and clear()

  void design(const StringDesign &S, const Loop &L); // the string, and its loop at its length now
  void clear();
  // The cotton pressed on a stopped wheel: an extra loss of σ (s⁻¹) per round trip, exp(−σ/f₀),
  // reached smoothly; 0 lets it go.
  void setDamper(double sigma) { dampT = fdlibm::exp(-sigma / L.f0); }

  // One output sample on the shared bridge, the other strings' share of its velocity Vo held: the
  // force on the bridge.
  double tick(double Vo, double kself, double vB, double FN, const bowed::Friction &Fr) {
    double f = 0;
    for (int j = 0; j < os; j++) {
      f = run(bridge(Vo + kself * ob));
      bow(vB, FN, Fr);
    }
    return f;
  }
  // One output sample on the chien (the trompette): its force on the board through the chien's
  // foot, low-passed and decimated as the bridge forces are.
  double tickChien(Chien &c, double Ft, double m, double zeta, double vB, double FN, const bowed::Friction &Fr) {
    double f = 0;
    const double dt = 1 / fs;
    for (int j = 0; j < os; j++) {
      const double a = ob;
      chienStep(c, 2 * Z * a, Z, Ft, m, zeta, dt);
      w = (w + 1) & mask;
      fb[w] = c.v - a; // the wave leaves the moving chien
      f = run(-c.Fc);
      bow(vB, FN, Fr);
    }
    return f;
  }

  // the state (the engine, the views' messages and the test hooks read it)
  int os;
  double fs;
  const double fsBase;
  const int mask;
  int w = 0, wn = 0;
  double ob = 0, lb = 0, ln = 0, v = 0, F = 0, Z = 0, ftau = 0, fa = 1, damp = 1, dampT = 1;
  bowed::FrictionState st;
  std::array<Biquad, 2> aa;
  std::vector<double> fb, nl; // bridge → wheel → bridge, wheel → nut → wheel
  int64_t nSlip = 0, t = 0, stuck = 0;
  double e = 0;          // energy meter (Σ of the arriving waves² over the block)
  uint32_t rng;          // rosin and cotton grain
  double grain = 0, ga = 0, gs = 0;
  StringDesign S{};
  Loop L{};
  double Dfb = 1, Dnl = 1, gb = 0, pb = 0, gn = 0, pn = 0, T0 = 1;

 private:
  double run(double x) { return os == 1 ? x : aa[1].run(aa[0].run(x)); }
  double bridge(double V) {
    const double a = ob;
    w = (w + 1) & mask;
    fb[w] = V - a;
    return Z * (2 * a - V);
  }
  void bow(double vB, double FN, const bowed::Friction &Fr);
};

} // namespace forte::hurdygurdy
