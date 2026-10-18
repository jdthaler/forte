// organ-model.cpp — the tone generator as numbers (organ-model.h).

#include "organ-model.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::organ {

namespace fd = forte::fdlibm;

constexpr double PI_ = 3.141592653589793;

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
  while (w < (d == 0 ? 13 : 1)) w += 12; // the 16' leaves wheels 1–12 to the pedals
  return w;
}
int percWheel(int key, bool third) {
  int w = key - 23 + (third ? 19 : 12);
  while (w > NUM_WHEELS) w -= 12;
  return w;
}

double drawbarGain(int n) { return n <= 0 ? 0 : fd::pow(10, (-3.0 * (8 - n)) / 20); }

// Kon Zissis's 1965 C-3 (hammond-leslie.info, KonsData-20171011.xls): the output at the preamp's
// GG terminals as each key is played on one drawbar, times that key's wire in ohms, so through
// WIRE_REF. A straight line in dB fits each run of wheels that share a kind of filter to within
// 0.8 dB. Wheels 1–12 (the pedals') are not on the manual; they take wheel 13's level.
namespace {
struct Run { int first, last; double dbFirst, dbLast; };
constexpr Run RUNS[] = {
  {13, 36, 11.21, 9.00}, {37, 48, 7.06, 5.48}, {49, 60, 4.28, 1.06}, {61, 72, 1.60, -1.51}, {73, 91, -1.54, -7.08},
};
constexpr double LEVEL_REF = 7.06; // wheel 37
} // namespace

double wheelLevelDb(int w) {
  w = std::max(w, 13);
  for (const Run &r : RUNS)
    if (w <= r.last) return r.dbFirst + (r.dbLast - r.dbFirst) * (w - r.first) / (r.last - r.first) - LEVEL_REF;
  return 0;
}

// The wires' six gauges (ohms, the mean of each gauge's measured wires) and, for keys C2–C7, the
// gauge of each drawbar's wire, 16' to 1'. From the key-tapering charts of Kon Zissis's 1965 C-3 and
// Peter's 1966 C-3 (the same spreadsheet), which agree on every wire but key 43's 1⅓' (24 Ω on
// Peter's, 35 here). Low keys keep their fundamentals down and their upper drawbars up, and the top
// keys the other way round. Keys past the manual are wired as its end key.
namespace {
constexpr double GAUGE[6] = {10.5, 15.5, 23.8, 35.1, 51.0, 103.5};
const char *const WIRES[KEY_HI - KEY_LO + 1] = {
  "534300122", "534300122", "534300122", "534300122", "534300122", "534300122",
  "534300122", "534300122", "534300122", "534300122", "534300122", "534301122",
  "434311122", "434211122", "424211122", "423211122", "323211122", "323211122",
  "323211222", "323212222", "323222222", "323222222", "323222222", "322222222",
  "222222222", "222222222", "222222222", "222222222", "222222222", "222222222",
  "222222222", "222222222", "222222222", "222222222", "222222222", "222222222",
  "122222222", "121222222", "111222222", "111322222", "111332222", "111333222",
  "111333332", "111333334", "111333334", "111333334", "111333334", "111333334",
  "011333344", "010333344", "000333344", "000333444", "000343444", "000343444",
  "000343444", "000344444", "000344444", "000344444", "000344444", "000344444",
  "000344444",
};
} // namespace

double wireOhms(int key, int d) {
  const int k = std::max(KEY_LO, std::min(KEY_HI, key)) - KEY_LO;
  return GAUGE[WIRES[k][d] - '0'];
}

double filterGain(int w, double ratio, double drift) {
  if (w <= 43) return 1;
  if (w <= 48) return std::sqrt((1 + 1 / (REACTOR_CORNER * REACTOR_CORNER)) / (1 + ratio * ratio / (REACTOR_CORNER * REACTOR_CORNER)));
  // |H| = 1/√(1 + Q²(f/f₀ − f₀/f)²), the resonance f₀ at the wheel's frequency / √(1 + drift); the
  // wheel is calibrated with the filter as built (|H| = 1 at its own frequency)
  const double r = ratio * std::sqrt(1 + drift), x = FILTER_Q * (r - 1 / r);
  return 1 / std::sqrt(1 + x * x);
}

void pickupHarmonics(int w, double relief, double &h2, double &h3) {
  const double pitch = (PI_ * WHEEL_D) / wheelSpec(w).teeth;
  const double e = std::min(0.99, relief * fd::exp((-2 * PI_ * GAP) / pitch));
  // 1/(1 − e cos φ) = (1 + 2 Σ βᵏ cos kφ)/√(1 − e²), β = (1 − √(1 − e²))/e; the EMF's harmonic k
  // goes as k βᵏ, so relative to the fundamental as k βᵏ⁻¹
  const double b = e > 1e-12 ? (1 - std::sqrt(1 - e * e)) / e : 0;
  h2 = 2 * b;
  h3 = 3 * b * b;
}

void buildGenerator(Generator &g, const GenParams &q, double fs) {
  Rng r(91);
  const double mains = q.mains / 60;
  const bool b3 = q.levels == Levels::b3;
  const double xt = q.crosstalk <= -79 ? 0 : fd::pow(10, q.crosstalk / 20);
  const double lk = q.leakage <= -89 ? 0 : fd::pow(10, q.leakage / 20);
  g.wheelHz[0] = g.level[0] = g.a2[0] = g.a3[0] = g.xtalk[0] = g.leak[0] = 0;
  g.partner[0] = 0;
  for (int w = 1; w <= NUM_WHEELS; w++) g.wheelHz[w] = (q.tuning == et ? etFreq(w) : gearFreq(w)) * mains;
  for (int w = 1; w <= NUM_WHEELS; w++) {
    // calibrated with new capacitors: a drifted one detunes the filter, and the wheel loses level
    const double filter = b3 ? filterGain(w, 1, q.drift) : 1;
    g.level[w] = (b3 ? fd::pow(10, wheelLevelDb(w) / 20) * filter : 1) * (1 + 0.06 * (r() - 0.5));
    double h2, h3;
    pickupHarmonics(w, q.relief, h2, h3);
    if (b3) { h2 *= filterGain(w, 2, q.drift) / filter; h3 *= filterGain(w, 3, q.drift) / filter; }
    g.a2[w] = g.wheelHz[w] * 2 < 0.45 * fs ? h2 : 0;
    g.a3[w] = g.wheelHz[w] * 3 < 0.45 * fs ? h3 : 0;
    // wheels sharing a compartment are four octaves apart; the partner's field reaches the pickup
    // coil, ahead of the filter
    g.partner[w] = (int16_t)(w + 48 <= NUM_WHEELS ? w + 48 : w - 48 >= 1 ? w - 48 : 0);
    const int pw = g.partner[w];
    g.xtalk[w] = pw ? xt * (0.6 + 0.8 * r()) * (b3 ? filterGain(w, g.wheelHz[pw] / g.wheelHz[w], q.drift) / filter : 1) : 0;
    g.leak[w] = lk * (0.3 + 0.7 * r());
  }
  for (int k = 0; k < NUM_KEYS; k++) {
    const int key = KEY_MIN + k;
    for (int d = 0; d < 9; d++) {
      g.keyMap[k * 9 + d] = (int16_t)keyWheel(key, d);
      g.taper[k * 9 + d] = b3 ? WIRE_REF / wireOhms(key, d) : 1;
    }
    g.perc2[k] = (int16_t)percWheel(key, false);
    g.perc3[k] = (int16_t)percWheel(key, true);
    g.perc2t[k] = g.taper[k * 9 + 3];
    g.perc3t[k] = g.taper[k * 9 + 4];
    g.keyHz[k] = g.wheelHz[keyWheel(key, 2)];
  }
  g.harmonic = q.tuning == harmonic;
}

void keyAnalysis(int key, int tuning, int levels, double mainsHz, Analysis out[9]) {
  const double mains = mainsHz / 60;
  auto f = [&](int w) { return (tuning == et ? etFreq(w) : gearFreq(w)) * mains; };
  const double f8 = f(keyWheel(key, 2));
  for (int d = 0; d < 9; d++) {
    const int w = keyWheel(key, d);
    const double ideal = f8 * DRAWBARS[d].harmonic;
    const double actual = tuning == harmonic ? ideal : f(w);
    const int at = key - 23 + DRAWBARS[d].offset; // the wheel it would tap with no foldback
    const double db = levels == Levels::b3 ? wheelLevelDb(w) + 20 * fd::log10(WIRE_REF / wireOhms(key, d)) : 0;
    out[d] = {w, actual, ideal, 1200 * fd::log2(actual / ideal), w != at, db};
  }
}

Geometry leslieGeometry(double hornRadius, double micDist) {
  const double wall = std::max(CABINET, hornRadius + 0.04);
  return {wall, std::max(micDist, wall + MIC_CLEAR)};
}

} // namespace forte::organ
