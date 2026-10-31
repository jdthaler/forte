// hurdygurdy-web.cpp — the model's functions the page's views call, and the tests' hooks
// (hurdygurdy/src/hurdygurdy-wasm.js). P is every parameter, as the engine takes them.

#include "forte/web.h"
#include "hurdygurdy-engine.h"
#include "hurdygurdy-model.h"

using namespace forte::hurdygurdy;

extern "C" {
FORTE_EXPORT double hurdygurdy_wheel_d() { return WHEEL_D; }
// the tuning corrections (tools/hurdygurdy-tuning.mjs): tangent i (0: open) or drone 100 + j, in cents
FORTE_EXPORT double hurdygurdy_tune(int i) { return i >= 100 ? DRONE_TUNE[i - 100] : TANGENT_TUNE[i]; }
FORTE_EXPORT void hurdygurdy_set_tune(int i, double cents) { (i >= 100 ? DRONE_TUNE[i - 100] : TANGENT_TUNE[i]) = cents; }
// string id's design: f, L, μ, T, c, Z₀, wound, key
FORTE_EXPORT void hurdygurdy_string_design(int id, const double *P, double *out) {
  const StringDesign s = stringDesign(id, paramsOf(P));
  out[0] = s.f; out[1] = s.L; out[2] = s.mu; out[3] = s.T; out[4] = s.c; out[5] = s.Z0; out[6] = s.wound; out[7] = s.key;
}
// its loop at length Ls (≤ 0: its own) at fs, and Schelleng's bounds at wheel speed vB: f0, Ls, β,
// N0, Db, Dn, σ₁, F_max, F_min
FORTE_EXPORT void hurdygurdy_loop(int id, double Ls, const double *P, double fs, double vB, double *out) {
  const Params x = paramsOf(P);
  const StringDesign s = stringDesign(id, x);
  const Loop L = loopDesign(s, Ls > 0 ? Ls : s.L, x, fs);
  const Schelleng S = schelleng(s, L, x, vB);
  out[0] = L.f0; out[1] = L.Ls; out[2] = L.beta; out[3] = L.N0; out[4] = L.Db; out[5] = L.Dn; out[6] = L.sigma1; out[7] = S.Fmax; out[8] = S.Fmin;
}
FORTE_EXPORT double hurdygurdy_stop_length(int key, const double *P) { return stopLength(key, paramsOf(P)); }
FORTE_EXPORT double hurdygurdy_voiced(int id) { return voiced(id); }
FORTE_EXPORT double hurdygurdy_threshold(const double *P) { return buzzThreshold(paramsOf(P)); }
FORTE_EXPORT int hurdygurdy_oversample(int id, double fs) { return oversample(id, fs); }
FORTE_EXPORT double hurdygurdy_coup_shape(double u, int N, double r) { return coupShape(u, N, r); }
FORTE_EXPORT double hurdygurdy_contact_zeta(double e) { return contactZeta(e); }
FORTE_EXPORT double hurdygurdy_chien_k() { return CHIEN_K; }
// The chien alone, its top pulled by a force F[i] each step dt (no string: Z = 0), from the state
// st = {lift, speed, lifted, landings}, which it updates: its lift each step into Y, the contact
// force into C.
FORTE_EXPORT void hurdygurdy_chien_run(int n, const double *F, double Ft, double m, double e, double dt, double *st, double *Y, double *C) {
  Chien c;
  c.y = st[0]; c.v = st[1]; c.up = st[2] > 0; c.hits = (int64_t)st[3];
  const double z = contactZeta(e);
  for (int i = 0; i < n; i++) { chienStep(c, F[i], 0, Ft, m, z, dt); Y[i] = c.y; C[i] = c.Fc; }
  st[0] = c.y; st[1] = c.v; st[2] = c.up; st[3] = (double)c.hits;
}
// the board: Y∞, and its modes below fMax (up to max of them) as m, n, f
FORTE_EXPORT double hurdygurdy_yinf() { return plateYinf(); }
FORTE_EXPORT int hurdygurdy_board_modes(double fMax, int max, double *out) {
  const auto modes = boardModes(fMax, 0);
  for (int i = 0; i < (int)modes.size() && i < max; i++) { out[3 * i] = modes[i].m; out[3 * i + 1] = modes[i].n; out[3 * i + 2] = modes[i].f; }
  return (int)modes.size();
}

// The tests' hooks, on the engine of a handle (forte_engine).
// A string: active, FN, FT, os, f0, Ls, β, slips, steps, Z
FORTE_EXPORT void hurdygurdy_string_state(HurdyGurdyEngine *e, int id, double *out) {
  const HurdyGurdyEngine::Str &s = *e->S[id];
  out[0] = s.active; out[1] = s.FN; out[2] = s.FT; out[3] = s.os; out[4] = s.L.f0; out[5] = s.L.Ls; out[6] = s.L.beta;
  out[7] = (double)s.nSlip; out[8] = (double)s.t; out[9] = s.Z;
}
// The crank and the chien: turns/s, phase, v_B, the hand's drive, surge, running, the melody's key,
// the chien's lift, landings, contact force
FORTE_EXPORT void hurdygurdy_crank(HurdyGurdyEngine *e, double *out) {
  out[0] = e->rate; out[1] = e->phase; out[2] = e->vB; out[3] = e->drive; out[4] = e->surge; out[5] = e->running;
  out[6] = e->melody; out[7] = e->chien.y; out[8] = (double)e->chien.hits; out[9] = e->chien.Fc;
}
}
