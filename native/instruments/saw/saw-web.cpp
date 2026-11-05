// saw-web.cpp — the model's functions the page's views call, and the tests' hooks
// (saw/src/saw-wasm.js).

#include "forte/web.h"
#include "saw-engine.h"
#include "saw-model.h"

using namespace forte::saw;

extern "C" {
// constants: Y, ρ, ν, c, the blade's length, its width at the heel and the toe, where the
// inflection can sit (lo, hi), where the hands hold it (heel, tip), half the S's turn, β₂, β₃, a J's Q, the hand's T60
FORTE_EXPORT void saw_constants(double *out) {
  const double c[] = {YOUNG, RHO, NU, waveSpeed(), LEN, W_HEEL, W_TOE, S_LO, S_HI, GRIP_HEEL, GRIP_TIP, X_S, BETA[0], BETA[1], Q_J, HAND_T60};
  for (int i = 0; i < 16; i++) out[i] = c[i];
}
// the modes: m and n of each, and how many each Quality plays
FORTE_EXPORT void saw_modes(double *out) {
  for (int j = 0; j < NMODE; j++) { out[2 * j] = MODES[j].m; out[2 * j + 1] = MODES[j].n; }
  for (int q = 0; q < 3; q++) out[2 * NMODE + q] = NMODES_Q[q];
}
FORTE_EXPORT void saw_trapped(double eps, int n, double *out) { const Trap t = trapped(eps, n); out[0] = t.Omega; out[1] = t.rms; }
FORTE_EXPORT double saw_hermite(int n, double xi) { return hermite(n, xi); }
FORTE_EXPORT double saw_cross(int m, double u) { return crossShape(m, u); }
FORTE_EXPORT double saw_plate_a(double h) { return plateA(h); }
FORTE_EXPORT double saw_note_at(const double *P, double s) { return noteAt(blade(P), s); }
// a plan: f, s, λ, W, h, b′, b₀, a, q₂, q₃, ε₂, ε₃, then fm, ℓ, mass, σ, leak of each mode, massS, sigmaS, threshold at speed
FORTE_EXPORT int saw_plan(double f, const double *P, double *out) {
  const Plan pl = plan(blade(P), f);
  const double head[] = {pl.f, pl.s, pl.lambda, pl.W, pl.h, pl.bend, pl.b0, pl.a, pl.q[0], pl.q[1], pl.eps[0], pl.eps[1]};
  int c = 0;
  for (double x : head) out[c++] = x;
  for (const double *a : {pl.fm, pl.ell, pl.mass, pl.sigma, pl.leak}) for (int j = 0; j < NMODE; j++) out[c++] = a[j];
  out[c++] = pl.massS; out[c++] = pl.sigmaS;
  out[c++] = threshold(pl, P[forte::saw::p::speed]);
  return c;
}
FORTE_EXPORT double saw_band_edge(double f, const double *P, int m, double x) { return bandEdge(plan(blade(P), f), m, x); }
FORTE_EXPORT double saw_transmission(double f, const double *P, int m, double omega, int side) { return transmission(plan(blade(P), f), m, omega, side); }

// The tests' hooks, on the engine of a handle (forte_engine): the voice on a key as alive, held,
// f, bow force, threshold, stick fraction, modes played, the note's σ, s, λ, the mallet on, then |z| of each mode.
FORTE_EXPORT void saw_voice(SawEngine *e, int key, double *out) {
  const Voice *v = nullptr;
  for (const Voice &x : e->voices) if (x.alive && x.key == key) { v = &x; break; }
  for (int i = 0; i < 11 + NMODE; i++) out[i] = 0;
  if (!v) return;
  const double head[] = {1, v->held ? 1.0 : 0.0, v->f, v->N, v->Nth, v->sticks, (double)v->M, v->sg[0], v->pl.s, v->pl.lambda, v->mallet ? 1.0 : 0.0};
  for (int i = 0; i < 11; i++) out[i] = head[i];
  for (int j = 0; j < v->M; j++) out[11 + j] = std::hypot(v->zr[j], v->zi[j]);
}
}
