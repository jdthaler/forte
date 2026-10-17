// organ-model.cpp — tonewheels.js in C++ (organ-model.h).

#include "organ-model.h"

#include <algorithm>

#include "forte/fdlibm.h"

namespace forte::organ {

namespace fd = forte::fdlibm;

const int GEAR[12][2] = {
  {85, 104}, {71, 82}, {67, 73}, {105, 108}, {103, 100}, {84, 77},
  {74, 64}, {98, 80}, {96, 74}, {88, 64}, {67, 46}, {108, 70},
};
const Drawbar DRAWBARS[9] = {{-12, 0.5}, {7, 1.5}, {0, 1}, {12, 2}, {19, 3}, {24, 4}, {28, 5}, {31, 6}, {36, 8}};

// Wheels 1–84 cover C1–B7. The top seven (85–91, C8–F♯8) have 192 teeth and sit on the shafts a
// fifth lower.
WheelSpec wheelSpec(int w) {
  if (w <= 84) {
    const int pc = (w - 1) % 12, oct = (w - 1) / 12;
    return {w, pc, oct + 1, 2 << oct, GEAR[pc][0], GEAR[pc][1], pc};
  }
  const int pc = w - 85, shaftPc = pc + 5; // C8 on the F shaft, … F♯8 on the B shaft
  return {w, pc, 8, 192, GEAR[shaftPc][0], GEAR[shaftPc][1], shaftPc};
}

double etFreq(int w) { return 440 * fd::pow(2, (double)(w - 46) / 12); }
double gearFreq(int w) { const WheelSpec s = wheelSpec(w); return (SHAFT_RPS * s.teeth * s.driving) / s.driven; }
double centsOff(int w) { return 1200 * fd::log2(gearFreq(w) / etFreq(w)); }

int keyWheel(int key, int d) {
  int w = key - 23 + DRAWBARS[d].offset; // key 36 (C2) → wheel 13 at 8'
  while (w > NUM_WHEELS) w -= 12;
  while (w < 1) w += 12;
  return w;
}
int percWheel(int key, bool third) {
  int w = key - 23 + (third ? 19 : 12);
  while (w > NUM_WHEELS) w -= 12;
  return w;
}

double drawbarGain(int n) { return n <= 0 ? 0 : fd::pow(10, (-3.0 * (8 - n)) / 20); }

void buildGenerator(Generator &g, int tuning, double mainsHz, double wheelHarm, double crosstalk, double leakage, double fs) {
  Rng r(91);
  const double mains = mainsHz / 60;
  const double xt = crosstalk <= -79 ? 0 : fd::pow(10, crosstalk / 20);
  const double lk = leakage <= -89 ? 0 : fd::pow(10, leakage / 20);
  g.wheelHz[0] = g.level[0] = g.a2[0] = g.a3[0] = g.xtalk[0] = g.leak[0] = 0;
  g.partner[0] = 0;
  for (int w = 1; w <= NUM_WHEELS; w++) {
    g.wheelHz[w] = (tuning == et ? etFreq(w) : gearFreq(w)) * mains;
    // pickup output is close to a sine; low wheels (few, broad teeth) less so
    const double low = 1 - (double)(w - 1) / 90;
    g.level[w] = 1 + 0.06 * (r() - 0.5);
    g.a2[w] = g.wheelHz[w] * 2 < 0.45 * fs ? wheelHarm * 0.04 * (0.3 + low) : 0;
    g.a3[w] = g.wheelHz[w] * 3 < 0.45 * fs ? wheelHarm * 0.10 * (0.2 + low * low) : 0;
    // wheels sharing a compartment are four octaves apart
    g.partner[w] = (int16_t)(w + 48 <= NUM_WHEELS ? w + 48 : w - 48 >= 1 ? w - 48 : 0);
    g.xtalk[w] = g.partner[w] ? xt * (0.6 + 0.8 * r()) : 0;
    g.leak[w] = lk * (0.3 + 0.7 * r());
  }
  for (int k = 0; k < NUM_KEYS; k++) {
    const int key = KEY_LO + k;
    for (int d = 0; d < 9; d++) g.keyMap[k * 9 + d] = (int16_t)keyWheel(key, d);
    g.perc2[k] = (int16_t)percWheel(key, false);
    g.perc3[k] = (int16_t)percWheel(key, true);
    g.keyHz[k] = g.wheelHz[keyWheel(key, 2)];
  }
  g.harmonic = tuning == harmonic;
}

void keyAnalysis(int key, int tuning, double mainsHz, Analysis out[9]) {
  const double mains = mainsHz / 60;
  auto f = [&](int w) { return (tuning == et ? etFreq(w) : gearFreq(w)) * mains; };
  const double f8 = f(keyWheel(key, 2));
  for (int d = 0; d < 9; d++) {
    const int w = keyWheel(key, d);
    const double ideal = f8 * DRAWBARS[d].harmonic;
    const double actual = tuning == harmonic ? ideal : f(w);
    out[d] = {w, actual, ideal, 1200 * fd::log2(actual / ideal), key - 23 + DRAWBARS[d].offset > NUM_WHEELS};
  }
}

Geometry leslieGeometry(double hornRadius, double micDist) {
  const double wall = std::max(CABINET, hornRadius + 0.04);
  return {wall, std::max(micDist, wall + MIC_CLEAR)};
}

} // namespace forte::organ
