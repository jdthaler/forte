// trautonium-model.cpp — the Trautonium's physics in closed form (trautonium-model.h).

#include "trautonium-model.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"
#include "trautonium-params.h"

namespace forte::trautonium {

double periods(double supply) { return fdlibm::log((supply - V_EXT) / (supply - V_STRIKE)); }

double wireR(double f, double supply) { return 1 / (f * CAP * periods(supply)); }

// The lamp is within K of striking for the last ln[(S − V_s + K)/(S − V_s)] time constants of its
// ramp: that over the period's g.
double window(double sync, double supply) {
  const double K = sync * (V_STRIKE - V_EXT), d = supply - V_STRIKE;
  return fdlibm::log((d + K) / d) / periods(supply);
}

// Started in step with the master (both just fired), the divider's own firing is due after
// n(1 + s) master periods. After m of them the part of its period still to run is 1 − m/(n(1+s)):
// the first m that brings it within δ catches it, if that comes before it fires on its own. From
// then on each capture starts it in step again, so it repeats.
int lockCount(int n, double slack, double delta) {
  const double due = n * (1 + slack);
  const int m = std::max(1, (int)std::ceil(due * (1 - delta) - 1e-12));
  return m <= due + 1e-12 ? m : 0;
}

double response(double f, const double *P) {
  double re = P[p::dry], im = 0;
  const int fi[FORMANTS] = {p::f1, p::f2, p::f3, p::f4}, qi[FORMANTS] = {p::q1, p::q2, p::q3, p::q4}, gi[FORMANTS] = {p::g1, p::g2, p::g3, p::g4};
  for (int i = 0; i < FORMANTS; i++) {
    const double g = P[gi[i]];
    if (g <= 0) continue;
    // H = (jω ω₀/Q) / (ω₀² − ω² + jω ω₀/Q), 1 at ω₀, rung Q/Q_REF as hard
    const double u = f / P[fi[i]], Q = P[qi[i]];
    const double a = 1 - u * u, b = u / Q, den = a * a + b * b, w = (g * Q) / Q_REF;
    re += w * (b * b) / den;
    im += w * (b * a) / den;
  }
  return std::sqrt(re * re + im * im);
}

} // namespace forte::trautonium
