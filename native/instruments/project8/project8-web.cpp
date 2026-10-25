// project8-web.cpp — the model's functions the page's views call (project8/src/project8-wasm.js) and the tests.

#include <cmath>

#include "forte/web.h"
#include "project8-model.h"
#include "project8-params.h"

using namespace forte::project8;

namespace {
Rng testRng(12345u);
}

extern "C" {
FORTE_EXPORT double project8_constant(int i) {
  const double c[] = {C, QE, ME_KG, ME_EV, EPS0, KB, HBARC_EV_NM, A0_NM, ALPHA, KR_K, T2_ENDPOINT, T_Z, SIGMA_INEL, SIGMA_REF_EV,
                      ELASTIC_SHARE, GAS_T, LOSS_EXC, LOSS_ION, INEL_ANGLE, TF_SCREEN, GUIDE_A, TE11};
  return c[i];
}
FORTE_EXPORT double project8_gyro() { return gyro(); }
FORTE_EXPORT double project8_cyclotron(double B, double K) { return cyclotron(B, K); }
FORTE_EXPORT double project8_cooling_time(double B) { return coolingTime(B); }
FORTE_EXPORT double project8_power(double B, double K, double c) { return power(B, K, c); }
// An electron of energy K at pitch angle cos θ, cooled for t s in B: its energy, cos θ, γ∥ and u⊥ into out.
FORTE_EXPORT void project8_cool(double K, double c, double B, double t, int steps, double *out) {
  Electron e = Electron::of(K, c);
  const double tau = coolingTime(B);
  for (int i = 0; i < steps; i++) e.cool(t / steps, tau);
  out[0] = e.kinetic(); out[1] = e.cosTheta(); out[2] = e.gpar; out[3] = e.uPerp();
}
// The trap for parameters P: Δ, the widest held cos θ, the walls' z (m), the reference electron's
// axial frequency at 90° and its cyclotron frequency (Hz), the waveguide's index h at the walls.
FORTE_EXPORT void project8_trap(const double *P, double K, double *out) {
  Trap t;
  t.B = P[p::field]; t.delta = P[p::depth] * 1e-3 / t.B; t.L = P[p::length] * 0.01;
  const Electron e = Electron::of(K, 0);
  const double f = cyclotron(t.B, K);
  out[0] = t.delta; out[1] = std::sqrt(t.cos2Max()); out[2] = t.L * std::sqrt(t.delta);
  out[3] = axialFrequency(t, e); out[4] = f; out[5] = guideIndex(f, t.L, std::sqrt(t.delta));
}
FORTE_EXPORT double project8_axial(double K, double c, double Lm) {
  Trap t; t.L = Lm;
  return axialFrequency(t, Electron::of(K, c));
}
FORTE_EXPORT double project8_guide_cutoff() { return guideCutoff(); }
FORTE_EXPORT double project8_guide_index(double f, double L, double cot) { return guideIndex(f, L, cot); }
FORTE_EXPORT double project8_bessel(int n, double x) { return besselJ(n, x); }
FORTE_EXPORT double project8_bessel_d(int n, double x) { return besselJd(n, x); }
FORTE_EXPORT double project8_side_on(int n, double b) { return sideOn(n, b); }
FORTE_EXPORT double project8_harmonic_power(int n, double b) { return harmonicPower(n, b); }
FORTE_EXPORT double project8_beta_spectrum(double K) { return betaSpectrum(K); }
FORTE_EXPORT double project8_beta_mean() { return betaMean(); }
FORTE_EXPORT double project8_collision_rate(double p, double K) { return collisionRate(p, K); }
FORTE_EXPORT double project8_screening_angle(double K) { return screeningAngle(K); }
// n tritium energies (the tests' own generator) into out.
FORTE_EXPORT void project8_draw_tritium(int n, double *out) { for (int i = 0; i < n; i++) out[i] = drawTritium(testRng); }
// n collisions of an electron of energy K at cos θ = c: elastic, loss, angle and the new cos θ, into out.
FORTE_EXPORT void project8_collide(int n, double K, double c, double *out) {
  for (int i = 0; i < n; i++) {
    double ct = c;
    const Collision col = collide(testRng, K, ct);
    out[4 * i] = col.elastic; out[4 * i + 1] = col.loss; out[4 * i + 2] = col.angle; out[4 * i + 3] = ct;
  }
}
}
