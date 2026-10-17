// bowed-string.h — one bowed string as a digital waveguide in velocity waves (bowed/src/string.js in
// C++, operation for operation; McIntyre, Schumacher & Woodhouse 1983; Smith 1992).
//
//   bridge ──(2·Db)── bow ──(2·Dn)── nut          x = 0 at the bridge
//
// Waves are lossless in the delay lines; each round trip ends in a one-pole low-pass for the
// string's own losses over that trip. The nut reflects with −1; the bridge side ends on the shared
// bridge, whose velocity the engine solves for all strings at once. At the bow the friction force
// enters both ways with the admittance 1/(2Z₀) and is solved implicitly every sample; a second,
// lossy waveguide pair carries the torsional waves (Woodhouse & Loach 1999). Each string runs at
// fs·os (os = 1, 2 or 4) so that a slip is resolved; its bridge force is low-passed and decimated.
#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "bowed-model.h"
#include "forte/dsp.h"

namespace forte::bowed {

constexpr int SLIPS = 64;

class BowedString {
 public:
  BowedString(int key, double fsBase);

  void design(const Loop &L);                // L from loopDesign(key, P, fs)
  void setDamper(bool on, double sigma);     // felt damper: extra loss per round trip, exp(−σ_d / f₀)
  void clear();
  // One output sample with the other strings' bridge velocity Vo held: the force on the bridge.
  double tick(double Vo, double vB, double FN, const Friction &Fr) {
    if (os == 1) { const double f = bridge(Vo + kself * ob); bow(vB, FN, Fr); return f; }
    double f = 0;
    for (int j = 0; j < os; j++) {
      f = aa[1].run(aa[0].run(bridge(Vo + kself * ob)));
      bow(vB, FN, Fr);
    }
    return f;
  }
  // Put the string into ideal Helmholtz motion for bow speed vB, mid-stick.
  void initHelmholtz(double vB);
  // The motion over the last `win` slips: slips per period, kind.
  Motion motion(int win = 24);
  // Displacement along the string at out.size() points, bridge to nut.
  void shape(float *out, int nP) const;

  // the state (the engine, the views' messages and the test hooks read it)
  const int key, os;
  const double fs, fsBase;
  const int mask;
  int w = 0, wn = 0;
  double ob = 0, lb = 0, ln = 0, v = 0, vs = 0, F = 0, damp = 1, dampT = 1, kself = 0, ftau = 0, fa = 1;
  int tIdle = 0;
  std::array<Biquad, 2> aa;
  std::vector<double> fb, nl, hb, tb, tn; // bridge → bow, bow → nut → bow, bow → bridge (views), torsion
  FrictionState st;
  std::array<double, SLIPS> slipT{}, iv{};
  int64_t nSlip = 0, t = 0, stuck = 0;
  double e = 0;          // energy meter (Σ v² over the block)
  uint32_t rng;          // rosin and hair grain
  double grain = 0;
  Loop L{};
  double ga = 0, gs = 0, Z = 0, Y = 0, Yt = 0, Dtb = 0, Dtn = 0, rtb = 0, rtn = 0, Dfb = 0, Dnl = 0;
  double gb = 0, pb = 0, gn = 0, pn = 0, T0 = 0, wheel = 1;

 private:
  double bridge(double V) {
    const double a = ob;
    w = (w + 1) & mask;
    fb[w] = V - a;
    return Z * (2 * a - V);
  }
  double bow(double vB, double FN, const Friction &Fr);
};

// Guettler's measure of an attack: seconds until the slips come regularly (15 in a row within
// ±8 % of the period), the force ramping from 0 to FN in `rise` s; infinity if not within `sec`.
double settleTime(BowedString &s, const Friction &Fr, double vB, double FN, double rise, double sec = 0.6);

} // namespace forte::bowed
