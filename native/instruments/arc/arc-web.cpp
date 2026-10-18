// arc-web.cpp — the model's functions the page's views call (arc/src/arc-wasm.js), and the
// engine's test hooks (the seed, noise and oversampling, kick, the arcs and the capacitor bank).
// Parameters P are indexed as in arc-params.h.

#include "arc-engine.h"
#include "forte/web.h"

using namespace forte::arc;

extern "C" {
// The operating point (arcOp): I0, l, A, B, tau, V0, Ur, Xm, delta, G0, u0, R0, w,
// K, Rd, kappa, Larc, Rb in out.
FORTE_EXPORT void arc_op(const double *P, double *out) {
  const Op o = arcOp(arcParams(P));
  const double v[18] = {o.I0, o.l, o.A, o.B, o.tau, o.V0, o.Ur, o.Xm, o.delta, o.G0, o.u0, o.R0, o.w, o.K, o.Rd, o.kappa, o.Larc, o.Rb};
  for (int i = 0; i < 18; i++) out[i] = v[i];
}
// The static characteristic at I, for an operating point's A, B, X_m and floor corner δ.
FORTE_EXPORT double arc_static_v(double I, double A, double B, double Xm, double delta) {
  Op o{};
  o.A = A; o.B = B; o.Xm = Xm; o.delta = delta;
  return staticV(I, o);
}
// The circuit's linear analysis with capacitance C: sigma, f, fLC, the musical root's re, im, then
// all four roots' re, im (rad/s).
FORTE_EXPORT void arc_linear(const double *P, double C, double *out) {
  const Linear la = linearAnalysis(circuit(arcParams(P), C));
  out[0] = la.sigma; out[1] = la.f; out[2] = la.fLC; out[3] = la.s.re; out[4] = la.s.im;
  for (int k = 0; k < 4; k++) { out[5 + 2 * k] = la.roots[k].re; out[6 + 2 * k] = la.roots[k].im; }
}
FORTE_EXPORT double arc_threshold_r(const double *P, double C) { return thresholdR(arcParams(P), C); }
FORTE_EXPORT double arc_threshold_current(const double *P, double C) { return thresholdCurrent(arcParams(P), C); }
FORTE_EXPORT double arc_upper_limit(const double *P) { return upperLimit(arcParams(P)); }
FORTE_EXPORT double arc_start_cap(int key, const double *P) { const ArcParams a = arcParams(P); return startCap(key, a, arcOp(a)); }
FORTE_EXPORT double arc_cap_for(int key, const double *P) { return capFor(key, arcParams(P)); }
// The steady note of capacitance C, started from a kick of that many amps in the coil (< 0: the
// engine's, 0.7 × the current): f, iaMin, iaMax, uMax, Iac.
FORTE_EXPORT void arc_steady(const double *P, double C, double kick, double *out) {
  SteadyOptions o;
  o.kick = kick;
  const Steady s = steadyNote(arcParams(P), C, o);
  out[0] = s.f; out[1] = s.iaMin; out[2] = s.iaMax; out[3] = s.uMax; out[4] = s.Iac;
}
FORTE_EXPORT double arc_hiss_current(double l) { return hissCurrent(l); }

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void arc_configure(ArcEngine *e, double seed, int quiet, int os) { e->configure(seed, quiet != 0, os); }
FORTE_EXPORT void arc_set_table(ArcEngine *e, const double *caps, int current) { e->setTable(caps, current != 0); }
FORTE_EXPORT void arc_kick(ArcEngine *e, double amps, int k) { if (k >= 0 && k < MAXA) e->kick(amps, k); }
FORTE_EXPORT int arc_ready(ArcEngine *e, int key) { return e->ready(key); }
// An arc's state: P, stUmax, nM, nT, active, X, u, ia, is, ic, Imean, uDC, CB
FORTE_EXPORT void arc_state(ArcEngine *e, int k, double *out) {
  const Arc &a = e->arcs[k];
  const double v[13] = {a.P, a.stUmax, (double)a.nM, (double)a.nT, (double)a.active(), a.X, a.u, a.ia, a.is, a.ic, a.Imean, a.uDC, a.CB};
  for (int i = 0; i < 13; i++) out[i] = v[i];
}
FORTE_EXPORT int arc_has(ArcEngine *e, int k, int key) { return e->arcs[k].has(key); }
FORTE_EXPORT int arc_holds(ArcEngine *e, int k, int key) { return e->arcs[k].holds(key); }
}
