// ring-model.cpp — the storage ring's physics.

#include "ring-model.h"

#include <cmath>

#include "forte/dsp.h"
#include "ring-params.h"

namespace forte::ring {

// Every ring is the same lattice cell repeated, more of them in a bigger (lower) ring: the
// chromaticity and the amplitude detuning are the C4 ring's, scaled by f_rev(C4)/f_rev.
Ring ringOf(int key, const double *P, double pressure) {
  Ring r{};
  r.frev = keyFreq(key);
  const double V = 1 + PRESS_GAIN * pressure, cells = keyFreq(REF_KEY) / r.frev;
  r.fsyn = P[p::synch] * std::sqrt(V);
  r.Qs = r.fsyn / r.frev;
  r.sigma = P[p::bunch] * std::pow(V, -0.25);
  r.sigmaDelta = P[p::spread] * std::pow(V, 0.25);
  r.chroma = P[p::chroma] * cells;
  r.D = (r.chroma * r.sigmaDelta) / r.Qs;
  r.mu = P[p::octupole] * OCTUPOLE_UNIT * cells;
  return r;
}

Detuning detuning(double theta, double Z) {
  const double u = 1 + theta * theta;
  return {std::exp((-Z * Z * theta * theta) / (2 * u)) / u, 2 * std::atan(theta) + (Z * Z * theta) / (2 * u)};
}

double chromatic(double D, double phiS) {
  const double s = std::sin(phiS / 2);
  return std::exp(-2 * D * D * s * s);
}

Centroid centroid(double N, const Ring &r, double Z, double q, double tauX) {
  const Detuning d = detuning(4 * std::numbers::pi * r.mu * N, Z);
  const double env = Z * d.amp * chromatic(r.D, TAU * r.Qs * N) * std::exp(-N / (r.frev * tauX));
  return {env, env * std::cos(TAU * q * N + d.phase)};
}

double formFactor(double n, double sigma) {
  const double x = TAU * n * sigma;
  return std::exp(-0.5 * x * x);
}

} // namespace forte::ring
