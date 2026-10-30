// hydraulis-model.cpp — the water organ's physics (hydraulis-model.h).

#include "hydraulis-model.h"

#include <algorithm>

#include "hydraulis-tuning.h"

namespace forte::hydraulis {

namespace {
constexpr double PI = std::numbers::pi;
}

PipeModel pipeModel(double f, bool stopped, double bore, const Voicing &v, double tune) {
  pipes::ModelOptions o;
  o.scale = boreD(f, bore, stopped) / pipes::toepferD(f); // the Pipe Organ's model takes the diameter as a share of Töpfer's
  o.W = cutW(f, stopped);
  o.tune = tune;
  return pipes::pipeModel(f, stopped, {v.cutup, v.gain * GAIN, v.offset}, o);
}

double tuning(double f, bool stopped) {
  const TuneRow *t = stopped ? TUNING_STOPPED : TUNING_OPEN;
  const int n = stopped ? (int)std::size(TUNING_STOPPED) : (int)std::size(TUNING_OPEN);
  const double x = std::log2(f);
  if (x <= t[0].x) return t[0].tune;
  for (int i = 1; i < n; i++) if (x <= t[i].x) { const double x0 = t[i - 1].x, y0 = t[i - 1].tune, x1 = t[i].x, y1 = t[i].tune; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return t[n - 1].tune;
}

double lensArea(double r, double d) {
  if (d >= 2 * r) return 0;
  if (d <= 0) return PI * r * r;
  return 2 * r * r * std::acos(d / (2 * r)) - (d / 2) * std::sqrt(4 * r * r - d * d);
}
double slideOpen(double x) {
  const double r = 0.5; // (a hole of unit width: the share is the same for any)
  return lensArea(r, std::clamp((1 - x) * (1 + MARGIN), 0.0, 2 * r)) / (PI * r * r);
}
double pushTime(double velocity, double push) {
  return (push / 1000) * std::pow(2.0, (0.7 - std::clamp(velocity, 0.0, 1.0)) / 0.3);
}

Cistern cistern(double size, double pRim) {
  Cistern c;
  const double s = std::max(0.05, size);
  c.Ain = WIND.Ain * s; c.Aout = WIND.Aout * s;
  const double Dbowl = std::sqrt((4 * c.Ain) / PI), Agap = WIND.gap * PI * Dbowl; // the gap under the rim, all round
  c.Mw = RHO_W * (WIND.Lin / c.Ain + WIND.Lgap / Agap + WIND.Lout / c.Aout);
  c.Ch = 1 / (RHO_W * G * (1 / c.Ain + 1 / c.Aout));
  c.Ca = (WIND.Vair * (0.5 + 0.5 * s)) / (AIR.gamma * P0); // the air above the water in the bowl (∝ its area) and in the chest
  const double k = 1 / c.Ch + 1 / c.Ca;                    // the bounce's stiffness: the head and the air in series with the water
  c.Rw = 2 * WIND.zeta * std::sqrt(c.Mw * k);              // the water's losses, as a damping ratio of the bounce
  c.pRim = pRim;
  c.xRim = pRim / (RHO_W * G * (1 + c.Ain / c.Aout));
  c.Vrim = c.Ain * c.xRim;
  c.fb = std::sqrt(k / c.Mw) / TAU;
  return c;
}

double rowPan(int key) {
  const double u = std::clamp((double)(key - KEY_LO) / (KEY_HI - KEY_LO), 0.0, 1.0); // past the compass: its ends
  return -0.6 + 1.2 * u;
}

} // namespace forte::hydraulis
