// whistlers-web.cpp — the model's functions the page's views call (whistlers/src/whistlers-wasm.js) and the tests.

#include "forte/web.h"
#include "whistlers-model.h"
#include "whistlers-params.h"

using namespace forte::whistlers;

namespace {
Track track;
Line line(double L, const double *P) { return lineAt(L, P[p::plasmapause], P[p::density]); }
}

extern "C" {
// The field line whose nose is f Hz, for parameters P: its L.
FORTE_EXPORT double whistlers_line_for(double f, const double *P) { return lineFor(f, P[p::plasmapause], P[p::density]); }
// The line at L for parameters P, into out: f_ce, n_eq, α, λ₀, and its nose's f, τ and τ''.
FORTE_EXPORT void whistlers_line(double L, const double *P, double *out) {
  const Line ln = line(L, P);
  const Nose n = noseOf(ln);
  const double v[7] = {ln.fce, ln.neq, ln.alpha, ln.lam0, n.f, n.tau, n.tau2};
  for (int i = 0; i < 7; i++) out[i] = v[i];
}
FORTE_EXPORT double whistlers_delay(double L, const double *P, double f) { return delay(line(L, P), f); }
FORTE_EXPORT double whistlers_delay_to(double L, const double *P, double f, double lam) { return delayTo(line(L, P), f, lam); }
FORTE_EXPORT double whistlers_density(double L, double lpp, double scale) { return eqDensity(L, lpp, scale); }
FORTE_EXPORT double whistlers_alpha(double L, double lpp) { return alphaOf(L, lpp); }
FORTE_EXPORT double whistlers_fce(double L) { return fceAt(L); }
FORTE_EXPORT double whistlers_group_index(double fpe, double fce, double f) { return groupIndex(fpe, fce, f); }
FORTE_EXPORT double whistlers_stroke(double f) { return stroke(f); }
// The engine's track for the line at L: f, τ and amplitude at NT frequencies into out (3 NT),
// then cap and ta; the count.
FORTE_EXPORT int whistlers_track(double L, const double *P, double *out) {
  trackOf(track, L, P[p::plasmapause], P[p::density]);
  for (int i = 0; i < NT; i++) { out[i] = track.f[i]; out[NT + i] = track.tau[i]; out[2 * NT + i] = track.amp[i]; }
  out[3 * NT] = track.cap; out[3 * NT + 1] = track.ta;
  return NT;
}
FORTE_EXPORT double whistlers_tweek_cutoff(int m, double h) { return tweekCutoff(m, h); }
FORTE_EXPORT double whistlers_tweek_freq(int m, double h, double d, double t) { return tweekFreq(m, h, d, t); }
FORTE_EXPORT double whistlers_tweek_start(int m, double h, double d, double ftop) { return tweekStart(m, h, d, ftop); }
FORTE_EXPORT double whistlers_tweek_amp(int m, double h, double d, double f) { return tweekAmp(m, h, d, f); }
FORTE_EXPORT double whistlers_constant(int i) {
  const double c[] = {F_CE1, FPE_K, C_KM, RE_KM, TOP_KM, CA_A, CA_B, CA_DL, CA_TROUGH, ALPHA_PS, ALPHA_TROUGH, DUCT_CUTOFF, DUCT_EDGE,
                      STROKE_T1, STROKE_T2, BOUNCE_R, (double)NLO, (double)NT, LOW_SPAN, B0_NT, GYRO_HZ_PER_NT};
  return c[i];
}
}
