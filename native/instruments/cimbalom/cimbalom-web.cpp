// cimbalom-web.cpp — the model's functions the page's views call (cimbalom/src/cimbalom-wasm.js),
// and the engine's test hooks (its voices, its sympathetic strings).

#include "cimbalom-engine.h"
#include "forte/web.h"

using namespace forte::cimbalom;

static constexpr int COURSE_FIELDS = 17;

extern "C" {
// A key's course for parameters P (indexed as in cimbalom-params.h), flat in out: strings, wound,
// side, L, L′, f₀, f′, d, μ, T, EI, B, B′, Z, stress, place, and the bridge's conductance at f₀.
FORTE_EXPORT void cimbalom_course(int key, const double *P, double *out) {
  const Params q = paramsOf(P);
  const Course C = courseOf(key, q);
  const double v[COURSE_FIELDS] = {(double)C.strings, C.wound ? 1.0 : 0.0, (double)C.side, C.L, C.Lfar, C.f0, C.ffar, C.d, C.mu, C.T, C.EI, C.B, C.Bfar, C.Z, C.stress, C.place,
                                   boardAdmittance(q.build, C.place, C.f0)[0]};
  for (int i = 0; i < COURSE_FIELDS; i++) out[i] = v[i];
}
// String str's partials, struck side (far 0) or far side (1), up to fmax and nmax; strike: the
// strike point as a share of L. Returns the count; out: f, k, sigma, sigB, psi, beta for each.
FORTE_EXPORT int cimbalom_partials(int key, int str, int far, const double *P, double strike, int nmax, double fmax, double *out) {
  const Params q = paramsOf(P);
  const Course C = courseOf(key, q);
  Partial ps[N_MAX];
  const int n = partials(C, str, far != 0, q, strike * C.L, std::min(nmax, far ? N_FAR : N_MAX), fmax, ps);
  for (int i = 0; i < n; i++) {
    const double v[6] = {ps[i].f, ps[i].k, ps[i].sigma, ps[i].sigB, ps[i].psi, ps[i].beta};
    for (int j = 0; j < 6; j++) out[6 * i + j] = v[j];
  }
  return n;
}
FORTE_EXPORT double cimbalom_detune_cents(int key, int str, const double *P) {
  const Params q = paramsOf(P);
  return detuneCents(key, str, courseOf(key, q).strings, q);
}
// A hammer face: K, p, α; and the speed a stroke throws it at.
FORTE_EXPORT void cimbalom_face(int head, double *out) { const Face f = faceOf(head); out[0] = f.K; out[1] = f.p; out[2] = f.alpha; }
FORTE_EXPORT double cimbalom_hammer_speed(double vel) { return hammerSpeed(vel); }
FORTE_EXPORT double cimbalom_sigma_damper() { return SIGMA_DAMPER; }
// The soundboard: its modes (f, σ) and the admittance at a place along the bridges.
FORTE_EXPORT int cimbalom_board_modes(int build, double *out) {
  const BoardModel &B = boardModel(build);
  for (int k = 0; k < B.K; k++) { out[2 * k] = B.f[k]; out[2 * k + 1] = B.sigma[k]; }
  return B.K;
}
FORTE_EXPORT void cimbalom_admittance(int build, double place, double f, double *out) {
  const auto y = boardAdmittance(build, place, f);
  out[0] = y[0]; out[1] = y[1];
}
FORTE_EXPORT void cimbalom_constants(double *out) {
  const double v[12] = {(double)KEY_MIN, (double)KEY_MAX, (double)N_MAX, (double)N_FAR, (double)STR_MAX, (double)SYM_MODES, (double)CIMBALOM_LO, (double)CIMBALOM_HI,
                        (double)DULCIMER_LO, (double)DULCIMER_HI, (double)DULCIMER_TREBLE, (double)DULCIMER_LEFT};
  for (int i = 0; i < 12; i++) out[i] = v[i];
}

// The tests' hooks, on the engine of a handle (forte_engine): the voices, in order.
FORTE_EXPORT int cimbalom_voice_count(CimbalomEngine *e) { return e->nVoices; }
// key, strings, nStruck, nFar, damped, down, peak, level, fade, strokes, xh, hammer active, its
// height over the strings (−δ), its speed, force, peak force, time in contact, contacts, S, the
// stick's speed, the head's and the stick's masses
FORTE_EXPORT void cimbalom_voice_state(CimbalomEngine *e, int i, double *out) {
  const CimbalomEngine::Voice &v = *e->voices[i];
  const double s[22] = {(double)v.key, (double)v.strings, (double)v.nStruck, (double)v.nFar, v.damped ? 1.0 : 0.0, v.down ? 1.0 : 0.0, v.peak, v.level, v.fade, (double)v.strokes, v.xh,
                        v.h.active ? 1.0 : 0.0, -v.h.delta, v.h.v, v.h.F, v.h.peakF, v.h.onTime, (double)v.h.contacts, v.S, v.h.vs, v.h.m, v.h.ms};
  for (int j = 0; j < 22; j++) out[j] = s[j];
}
// voice i's oscillators (string after string: its struck partials, then its far side's): q now (0),
// a sample ago (1), or their output weights β (2)
FORTE_EXPORT double *cimbalom_voice_q(CimbalomEngine *e, int i, int which) {
  CimbalomEngine::Voice &v = *e->voices[i];
  return which == 0 ? v.q.data() : which == 1 ? v.q1.data() : v.beta.data();
}
FORTE_EXPORT int cimbalom_voice_osc(CimbalomEngine *e, int i) { return e->voices[i]->nOsc; }
// the sympathetic strings: partials running in the last block, a key's group's energy and size
FORTE_EXPORT int cimbalom_sym_running(CimbalomEngine *e) { return e->sym.running; }
FORTE_EXPORT double cimbalom_sym_energy(CimbalomEngine *e, int key) { return e->sym.energy(key); }
FORTE_EXPORT int cimbalom_sym_size(CimbalomEngine *e, int key) { return e->sym.size(key); }
// the last stroke's force, sample by sample (the focused key's)
FORTE_EXPORT int cimbalom_history(CimbalomEngine *e, double *out) {
  for (int i = 0; i < e->historyLen; i++) out[i] = e->history[i];
  return e->historyLen;
}
}
