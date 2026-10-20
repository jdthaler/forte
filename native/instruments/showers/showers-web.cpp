// showers-web.cpp — the model's functions the page's views call (showers/src/showers-wasm.js) and the tests.

#include "forte/web.h"
#include "showers-model.h"
#include "showers-params.h"

using namespace forte::showers;

namespace {
Rng rng;
Deposit dep;
}

extern "C" {
// A key's crystal for parameters P, with modes up to fmax: the count, and for each in out
// (5 apiece) flex, n, f, sigma, hear.
FORTE_EXPORT int showers_modes(int key, const double *P, double fmax, double *out) {
  const Crystal c = crystalOf(key, P, fmax);
  for (int j = 0; j < c.count; j++) {
    const Mode &m = c.modes[j];
    const double v[5] = {m.flex ? 1.0 : 0.0, (double)m.n, m.f, m.sigma, m.hear};
    for (int i = 0; i < 5; i++) out[5 * j + i] = v[i];
  }
  return c.count;
}
// A shower (kind, E GeV) in a crystal T X0 deep, into the model's deposit (random ones from the
// model's own generator, reseeded by seed ≥ 0): its total share, and its start in *start.
FORTE_EXPORT double showers_shower(int kind, double E, double T, int seed, double *start) {
  if (seed >= 0) rng = Rng((uint32_t)seed);
  shower(dep, (Particle)kind, E, T, rng);
  *start = dep.start;
  return dep.total();
}
FORTE_EXPORT double showers_deposit_at(int i) { return dep.q[i]; } // per unit ζ, slice i of NZ
FORTE_EXPORT void showers_set_deposit(int i, double v) { dep.q[i] = v; } // a deposit of the tests' own
FORTE_EXPORT int showers_nz() { return NZ; }
// The last deposit's kicks: the stretching modes' a_n (MAX_LONG of them), then the bending
// modes' b_m per unit centroid offset (MAX_FLEX).
FORTE_EXPORT void showers_kicks(double slender, double *out) {
  const Kicks k = kicksOf(dep, slender);
  for (int n = 0; n < MAX_LONG; n++) out[n] = k.a[n];
  for (int m = 0; m < MAX_FLEX; m++) out[MAX_LONG + m] = k.b[m];
}
FORTE_EXPORT int showers_max_long() { return MAX_LONG; }
FORTE_EXPORT int showers_max_flex() { return MAX_FLEX; }
FORTE_EXPORT double showers_em_profile(double t, double tmax) { return emProfile(t, tmax); }
FORTE_EXPORT double showers_em_tmax(double E, int photonLike) { return emTmax(E, photonLike ? C_G : C_E); }
FORTE_EXPORT double showers_gamma_share(double a, double b, double t) { return gammaShare(a, b, t); }
FORTE_EXPORT double showers_mean_fem(double E) { return meanFem(E); }
FORTE_EXPORT void showers_share(double x0, double width, int j, double *out) {
  const Share s = crystalShare(x0, width, j);
  out[0] = s.e; out[1] = s.xbar;
}
FORTE_EXPORT double showers_containment(double r) { return radialContainment(r); }
FORTE_EXPORT double showers_flex_shape(int m, double z) { return flexShape(m, z); }
FORTE_EXPORT double showers_flex_curvature(int m, double z) { return flexCurvature(m, z); }
FORTE_EXPORT double showers_beta_l(int m) { return BETA_L[m]; }
FORTE_EXPORT double showers_slenderness(double depth, double width) { return slenderness(depth, width); }
FORTE_EXPORT double showers_long_ratio(int n, double slender) { return longRatio(n, slender); }
FORTE_EXPORT double showers_flex_ratio(int m, double slender) { return flexRatio(m, slender); }
FORTE_EXPORT int showers_love_modes(double slender) { return loveModes(slender); }
FORTE_EXPORT double showers_constant(int i) {
  const double c[] = {EC_MEV, LAMBDA_PI, LAMBDA_I, MIP_MEV, POISSON, B_EM, C_E, C_G, BH, R_LAT, FEM_E0, FEM_M, HAD_A0, HAD_A1, HAD_D, INVISIBLE, FEM_SPREAD};
  return c[i];
}
}
