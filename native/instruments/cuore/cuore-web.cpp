// cuore-web.cpp — the model's functions the page's views and the tests call (cuore/src/cuore-wasm.js).

#include <cmath>

#include "forte/web.h"
#include "cuore-model.h"
#include "cuore-params.h"

using namespace forte::cuore;

static Bolometer bolometer(const double *P) { Bolometer b; b.set(P); return b; }

extern "C" {
// The crystal at rest for parameters P: out = [V, T_e, T_c, T_t, R, Joule power, C_c, mass (g)].
FORTE_EXPORT void cuore_rest(const double *P, double *out) {
  const Bolometer b = bolometer(P);
  const Bolometer::State y = b.equilibrium();
  const double v[] = {y[0], y[1], y[2], y[3], resistance(b.T0, y[1]), b.joule(y), b.cc * y[2] * y[2] * y[2], crystalMass(P[forte::cuore::p::side])};
  for (int i = 0; i < 8; i++) out[i] = v[i];
}
// Pulses of E MeV every `period` s (0: one) from rest, stepped by dt s (sub ROS2 steps each) for n
// steps: out[4j..4j+3] = V, T_e, T_c, T_t after step i = (j + 1)·stride − 1, the first pulse
// landing at t = 0.
FORTE_EXPORT void cuore_train(const double *P, double E, double period, double dt, int n, int sub, int stride, double *out) {
  const Bolometer b = bolometer(P);
  Bolometer::State y = b.equilibrium();
  double next = 0, t = 0;
  for (int i = 0; i < n; i++) {
    double left = dt;
    while (next >= 0 && next < t + left) { // a pulse inside this step
      const double h = next - t;
      if (h > 0) b.steps(y, h, std::max(1, (int)std::ceil(sub * h / dt)));
      b.kick(y, E * MEV);
      t = next; left -= h;
      if (left > 0) { b.afterKick(y, left, std::max(1, (int)std::ceil(sub * left / dt))); t += left; left = 0; }
      next = period > 0 ? next + period : -1;
    }
    if (left > 0) b.steps(y, left, std::max(1, (int)std::ceil(sub * left / dt)));
    t += left;
    if ((i + 1) % stride == 0) for (int j = 0; j < 4; j++) out[4 * (i / stride) + j] = y[j];
  }
}
FORTE_EXPORT double cuore_capacity(double side, double T) { return crystalCapacity(side, T); }
FORTE_EXPORT double cuore_mass(double side) { return crystalMass(side); }
FORTE_EXPORT double cuore_resistance(double t0, double T) { return resistance(t0, T); }
FORTE_EXPORT double cuore_constant(int i) {
  const double c[] = {R0, RL, GAMMA_E, G_EP, A_EP, C_PTFE, THETA_D, RHO, MOLAR, ADC_FULL, Q_BB, MEV};
  return i >= 0 && i < 12 ? c[i] : NAN;
}
}
