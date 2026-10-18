// harmonium-web.cpp — the model's functions the page's views and the tests call
// (harmonium/src/harmonium-wasm.js), and the engine's test hooks (its seed and options, its voices and reeds, the turbulence table,
// the reservoir).

#include "harmonium-engine.h"
#include "forte/web.h"

using namespace forte::harmonium;

// A reed's model as flat numbers (harmonium-wasm.js, reedOf, reads them back): fNat, fSound,
// tune; the geometry L, b, h, e, delta, lam1, lam2, mu, y0; perim, Ma, C, V, Ain, K, lj, drag,
// fCell, m0, M, sag, Anom, Rj, eps, uOpt, throatLA; each mode's n, lam, f, om, m, k, S, I1, I2,
// I3, zeta; the area table's lo, dy, n and its n values.
constexpr int MODE_AT = 29, TABLE_AT = MODE_AT + 22, FLAT_N = TABLE_AT + 3 + AREA_N;
static void flatten(const ReedModel &R, double *o) {
  const Geo &g = R.geo;
  const double head[MODE_AT] = {R.fNat, R.fSound, R.tune, g.L, g.b, g.h, g.e, g.delta, g.lam[0], g.lam[1], g.mu, g.y0,
                                R.perim, R.Ma, R.C, R.V, R.Ain, R.K, R.lj, R.drag, R.fCell, R.m0, R.M, R.sag, R.Anom, R.Rj, R.eps, R.uOpt, R.throatLA};
  for (int i = 0; i < MODE_AT; i++) o[i] = head[i];
  for (int n = 0; n < 2; n++) {
    const Mode &m = R.modes[n];
    const double v[11] = {(double)m.n, m.lam, m.f, m.om, m.m, m.k, m.S, m.I1, m.I2, m.I3, m.zeta};
    for (int i = 0; i < 11; i++) o[MODE_AT + 11 * n + i] = v[i];
  }
  o[TABLE_AT] = R.table.lo; o[TABLE_AT + 1] = R.table.dy; o[TABLE_AT + 2] = R.table.n;
  for (int j = 0; j < AREA_N; j++) o[TABLE_AT + 3 + j] = R.table.A[j];
}
static void unflatten(const double *o, ReedModel &R) {
  Geo &g = R.geo;
  double *head[MODE_AT] = {&R.fNat, &R.fSound, &R.tune, &g.L, &g.b, &g.h, &g.e, &g.delta, &g.lam[0], &g.lam[1], &g.mu, &g.y0,
                           &R.perim, &R.Ma, &R.C, &R.V, &R.Ain, &R.K, &R.lj, &R.drag, &R.fCell, &R.m0, &R.M, &R.sag, &R.Anom, &R.Rj, &R.eps, &R.uOpt, &R.throatLA};
  for (int i = 0; i < MODE_AT; i++) *head[i] = o[i];
  for (int n = 0; n < 2; n++) {
    Mode &m = R.modes[n];
    const double *v = o + MODE_AT + 11 * n;
    m = Mode{(int)v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10]};
  }
  R.table.lo = o[TABLE_AT]; R.table.dy = o[TABLE_AT + 1]; R.table.n = AREA_N;
  for (int j = 0; j < AREA_N; j++) R.table.A[j] = o[TABLE_AT + 3 + j];
}

static ReedModel scratchModel; // too big for the stack of a view's call

extern "C" {
FORTE_EXPORT int harmonium_flat_size() { return FLAT_N; }
// The reed a rank of key m sounds with, for parameters P (indexed as in harmonium-params.h), in out.
FORTE_EXPORT void harmonium_reed_model(double fSound, const double *P, int tuned, double *out) {
  reedModel(fSound, voicingOf(P), scratchModel, tuned != 0);
  flatten(scratchModel, out);
}
FORTE_EXPORT double harmonium_rank_freq(int m, int r, const double *P) { return rankFreq(m, r, voicingOf(P)); }
FORTE_EXPORT double harmonium_mode_shape(double lam, double u) { return modeShape(lam, u); }
FORTE_EXPORT double harmonium_tune_ratio(double fSound) { return tuneRatio(fSound); }
// The threshold of a reed (flattened as harmonium_reed_model writes it), with a cassotto at
// cassF if cassF > 0: P and the frequency it starts at in out; 0 if it never starts below pMax.
FORTE_EXPORT int harmonium_threshold(const double *flat, double pMax, double cassF, double *out) {
  unflatten(flat, scratchModel);
  const Cassotto cs = cassotto(cassF > 0 ? cassF : 1500);
  const auto t = threshold(scratchModel, pMax, cassF > 0 ? &cs : nullptr);
  if (!t) return 0;
  out[0] = t->P; out[1] = t->f;
  return 1;
}
// The steady state of a reed (flattened) at wind Pw, less pd: y, x, U, dp, pc, A, dA in out.
FORTE_EXPORT void harmonium_equilibrium(const double *flat, double Pw, double pd, double *out) {
  unflatten(flat, scratchModel);
  const Equilibrium q = equilibrium(scratchModel, Pw, pd);
  const double v[7] = {q.y, q.x, q.U, q.dp, q.pc, q.A, q.dA};
  for (int i = 0; i < 7; i++) out[i] = v[i];
}
// The linear analysis's root of a reed (flattened) at wind Pw, from s0 = s0re + i s0im if start,
// with a cassotto at cassF if cassF > 0: Re s and Im s in out; 0 if Newton failed.
FORTE_EXPORT int harmonium_linear_root(const double *flat, double Pw, int start, double s0re, double s0im, double cassF, double *out) {
  unflatten(flat, scratchModel);
  const Cassotto cs = cassotto(cassF > 0 ? cassF : 1500);
  const Cx s0{s0re, s0im};
  const auto s = linearRoot(scratchModel, Pw, start ? &s0 : nullptr, cassF > 0 ? &cs : nullptr);
  if (!s) return 0;
  out[0] = s->re; out[1] = s->im;
  return 1;
}
// The cassotto tuned to f: M, C, R, V, f in out.
FORTE_EXPORT void harmonium_cassotto(double f, double *out) {
  const Cassotto c = cassotto(f);
  const double v[5] = {c.M, c.C, c.R, c.V, c.f};
  for (int i = 0; i < 5; i++) out[i] = v[i];
}
FORTE_EXPORT double harmonium_gap_width(double w, double e, double h, double delta) { return gapWidth(w, e, h, delta); }

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void harmonium_configure(HarmoniumEngine *e, unsigned seed, double fOS, int track) { e->configure(seed, fOS, track != 0); }
FORTE_EXPORT double *harmonium_noise(HarmoniumEngine *e) { return e->noise.data(); }
FORTE_EXPORT double harmonium_pres(HarmoniumEngine *e) { return e->Pres; }
FORTE_EXPORT double harmonium_utot(HarmoniumEngine *e) { return e->Utot; }
FORTE_EXPORT int harmonium_voices(HarmoniumEngine *e) { return e->count; }
FORTE_EXPORT HarmoniumEngine::Voice *harmonium_voice(HarmoniumEngine *e, int i) { return e->voices[i]; }
// key, fading, dead, down, a, aTarget, age, env, pending
FORTE_EXPORT void harmonium_voice_state(const HarmoniumEngine::Voice *v, double *out) {
  const double s[9] = {(double)v->key, (double)v->fading, (double)v->dead, (double)v->down, v->s[HarmoniumEngine::V_A], v->s[HarmoniumEngine::V_AT], v->age, v->s[HarmoniumEngine::V_ENV], (double)v->pending};
  for (int i = 0; i < 9; i++) out[i] = s[i];
}
FORTE_EXPORT void harmonium_voice_set_a(HarmoniumEngine::Voice *v, double a, double aTarget) { v->s[HarmoniumEngine::V_A] = a; v->s[HarmoniumEngine::V_AT] = aTarget; }
FORTE_EXPORT HarmoniumEngine::Reed *harmonium_reed(HarmoniumEngine::Voice *v, int r) { return &v->reeds[r]; }
// the reed's state (S_…), to read and write in place
FORTE_EXPORT double *harmonium_reed_state(HarmoniumEngine::Reed *rd) { return rd->st; }
// h, os, two, asleep, m1, m2, k1, k2, track, ni
FORTE_EXPORT void harmonium_reed_info(const HarmoniumEngine::Reed *rd, double *out) {
  const double s[10] = {rd->h, (double)rd->os, (double)rd->two, (double)rd->asleep, rd->m1, rd->m2, rd->k1, rd->k2, (double)rd->track, (double)rd->ni};
  for (int i = 0; i < 10; i++) out[i] = s[i];
}
FORTE_EXPORT int harmonium_reed_model_of(const HarmoniumEngine::Reed *rd, double *out) { if (!rd->R) return 0; flatten(*rd->R, out); return 1; }
FORTE_EXPORT double harmonium_reed_freq(const HarmoniumEngine::Reed *rd) { return rd->freq(); }
FORTE_EXPORT double harmonium_reed_energy(const HarmoniumEngine::Reed *rd) { return rd->energy(); }
FORTE_EXPORT void harmonium_reed_set_steady(HarmoniumEngine::Reed *rd, double y, double x, double U, double dp, double pc, double A, double dA) {
  rd->setSteady(Equilibrium{y, x, U, dp, pc, A, dA});
}
}
