// steelpan-model.cpp — the steelpan's physics (steelpan-model.h).

#include "steelpan-model.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <numbers>

#include "forte/dsp.h"
#include "steelpan-params.h"

namespace forte::steelpan {

constexpr double C4 = 261.6255653005986;

double shape(int i, int j, double x, double y) {
  const double h = std::numbers::pi / 2;
  return std::sin(i * h * (x + 1)) * std::sin(j * h * (y + 1));
}

double plateRatio(int i, int j, double r) { return (i * i + r * r * j * j) / (1 + r * r); }

double pulseSpectrum(double f, double tau) {
  const double u = 2 * f * tau;
  return std::fabs(u - 1) < 1e-6 ? std::numbers::pi / 4 : std::fabs(std::cos((std::numbers::pi * u) / 2) / (1 - u * u));
}

double contactTime(double tau0Ms, double f1, double velocity) {
  return tau0Ms / 1000 * std::pow(std::max(velocity, 0.02), -0.2) * std::sqrt(C4 / f1);
}

double skirtLength(int key, double scale) {
  return scale * std::clamp(0.86 * std::pow(keyFreq(key) / 98, -1.4), 0.14, 0.86);
}

double radiation(double f, double L) {
  const double kd = (TAU * f * (L + kRim)) / kSound; // the back's way round: down the skirt and over the rim
  return kd / std::sqrt(4 + kd * kd);
}

double tuningError(int key, int mode, double cents) {
  uint32_t h = (uint32_t)(key * 7919 + mode * 104729) * 2654435761u;
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
  return cents * (2 * (h / 4294967296.0) - 1);
}

double ringTime(int key, double t60C4) { return t60C4 * std::sqrt(C4 / keyFreq(key)); }

NoteModes noteModes(int key, const double *P, double fmax) {
  NoteModes out;
  const double f1 = keyFreq(key), r = P[p::aspect];
  const int tuning = (int)P[p::tuning];
  double r2 = 2, r3 = tuning == tuning_::double_ ? 4 : 3;
  if (tuning == tuning_::raw) { r2 = plateRatio(2, 1, r); r3 = plateRatio(1, 2, r); }
  else { r2 *= std::exp2(tuningError(key, 1, P[p::accuracy]) / 1200); r3 *= std::exp2(tuningError(key, 2, P[p::accuracy]) / 1200); }
  const double sigma1 = sigmaFromT60(ringTime(key, P[p::t60])), L = skirtLength(key, P[p::skirt]);
  const double x = P[p::along], y = P[p::across];
  auto mode = [&](double f, int i, int j) {
    return Mode{f, sigma1 * std::pow(f / f1, P[p::damping]), shape(i, j, x, y), radiation(f, L), i, j};
  };
  out.m[out.count++] = mode(f1, 1, 1);
  out.m[out.count++] = mode(f1 * r2, 2, 1);
  out.m[out.count++] = mode(f1 * r3, 1, 2);
  // the rest of the plate's modes, where its shape puts them: the tuner leaves them be
  std::array<Mode, 24> rest;
  int n = 0;
  for (int i = 1; i <= 6; i++) for (int j = 1; j <= 4; j++) {
    if ((i == 1 && j == 1) || (i == 2 && j == 1) || (i == 1 && j == 2)) continue;
    const double f = f1 * plateRatio(i, j, r);
    if (f < fmax && n < (int)rest.size()) rest[n++] = mode(f, i, j);
  }
  std::sort(rest.begin(), rest.begin() + n, [](const Mode &a, const Mode &b) { return a.f < b.f; });
  for (int k = 0; k < n && out.count < kModes; k++) out.m[out.count++] = rest[k];
  // a top note's tuned partials may be past hearing: they stay (the coupling needs them), silent
  for (int k = 0; k < kTuned; k++) if (out.m[k].f >= fmax) out.m[k].rad = 0;
  return out;
}

double strikeGain(const Mode &m, double f1, double tau) { return kAmp * m.shape * pulseSpectrum(m.f, tau) * TAU * f1; }

void tunedForces(const double *x, const double *w, double g, double *F) {
  const double w0 = w[0], r1 = w[1] / w0, r2 = w[2] / w0;
  const double Q = x[0] * x[0] + r1 * r1 * x[1] * x[1] + r2 * r2 * x[2] * x[2], h = kHarden * w0 * w0 * Q;
  F[0] = -g * (2 * x[0] * x[1] + x[1] * x[2]) - h * x[0];
  F[1] = -g * (x[0] * x[0] + x[0] * x[2] + 2 * x[1] * x[2]) - h * r1 * r1 * x[1];
  F[2] = -g * (x[0] * x[1] + x[1] * x[1]) - h * r2 * r2 * x[2];
}

double tunedPotential(const double *x, const double *w, double g) {
  const double w0 = w[0], r1 = w[1] / w0, r2 = w[2] / w0;
  const double Q = x[0] * x[0] + r1 * r1 * x[1] * x[1] + r2 * r2 * x[2] * x[2];
  return g * (x[0] * x[0] * x[1] + x[0] * x[1] * x[2] + x[1] * x[1] * x[2]) + 0.25 * kHarden * w0 * w0 * Q * Q;
}

int neighbours(int key, int layout, Neighbour *out) {
  int n = 0;
  const int step = layout == layout_::chromatic ? 1 : 7; // round the ring: by fifths, or by semitones
  auto put = [&](int k, double w) { if (k >= KEY_MIN && k <= KEY_MAX && k != key) out[n++] = {k, w}; };
  auto ring = [&](int k, double w) { // k's two neighbours in its own ring (an octave from C)
    const int base = k - k % 12, pc = k % 12;
    put(base + (pc + step) % 12, w);
    put(base + (pc + 12 - step) % 12, w);
  };
  ring(key, 1);
  put(key + 12, 1); // the same note an octave up, in the ring inside
  put(key - 12, 1); // and down, in the ring outside
  ring(key + 12, 0.5);
  ring(key - 12, 0.5);
  return n;
}

} // namespace forte::steelpan
