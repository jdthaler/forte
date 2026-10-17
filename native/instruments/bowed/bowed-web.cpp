// bowed-web.cpp — the model's functions the page's views call (bowed/src/bowed-wasm.js), and the
// engine's test hooks (the JavaScript engine's strings, S[key]).

#include <memory>

#include "bowed-engine.h"
#include "forte/web.h"

using namespace forte::bowed;

static Params paramsOf(double speed, double beta, double losses, double mobility, double torsionQ) {
  Params P = defaults();
  P.speed = speed; P.beta = beta; P.losses = losses; P.mobility = mobility; P.torsionQ = torsionQ;
  return P;
}

extern "C" {
// loopDesign(key, P, fs), flat: fKey, f0, L, T, c, mu, Z0, d, B, stress, wound, G, Zall, N0, beta,
// wheel, vB, Db, Dn, gb, pb, gn, pn, rB, sigma1, Zt, ft, Dtb, Dtn, rtb, rtn (31 values)
FORTE_EXPORT void bowed_loop_design(int key, double fs, double speed, double beta, double losses, double mobility, double torsionQ, double *out) {
  const Loop L = loopDesign(key, paramsOf(speed, beta, losses, mobility, torsionQ), fs);
  const double v[31] = {L.fKey, L.f0, L.L, L.T, L.c, L.mu, L.Z0, L.d, L.B, L.stress, L.wound ? 1.0 : 0.0, L.G, L.Zall, L.N0, L.beta,
                        L.wheel, L.vB, L.Db, L.Dn, L.gb, L.pb, L.gn, L.pn, L.rB, L.sigma1, L.Zt, L.ft, L.Dtb, L.Dtn, L.rtb, L.rtn};
  for (int i = 0; i < 31; i++) out[i] = v[i];
}
// schelleng(L, P, beta, vB): R, Fmax, Fmin
FORTE_EXPORT void bowed_schelleng(double Z0, double f0, double sigma1, double mus, double mud, double v0, double beta, double vB, double *out) {
  Loop L{};
  L.Z0 = Z0; L.f0 = f0; L.sigma1 = sigma1;
  Params P = defaults();
  P.mus = mus; P.mud = mud; P.v0 = v0;
  const Schelleng s = schelleng(L, P, beta, vB);
  out[0] = s.R; out[1] = s.Fmax; out[2] = s.Fmin;
}
FORTE_EXPORT double bowed_voiced(int key) { return voiced(key); }
FORTE_EXPORT double bowed_torsion_echo(int key) { return torsionEcho(key); }
FORTE_EXPORT int bowed_oversample(int key, double fs) { return oversample(key, fs); }

// The attack map: settleTime on one string kept per key (as the page keeps its BowedString), for P.
FORTE_EXPORT double bowed_settle_time(int key, double fs, double speed, double beta, double losses, double mobility, double torsionQ,
                                      double mus, double mud, double v0, double memory, double grain, double vB, double FN, double rise, double sec) {
  static std::unique_ptr<BowedString> s;
  if (key < KEY_LO || key > KEY_HI) return 0;
  if (!s || s->key != key || s->fsBase != fs) s = std::make_unique<BowedString>(key, fs);
  Params P = paramsOf(speed, beta, losses, mobility, torsionQ);
  P.mus = mus; P.mud = mud; P.v0 = v0; P.memory = memory; P.grain = grain;
  s->design(loopDesign(key, P, s->fs));
  return settleTime(*s, friction(P), vB, FN, rise, sec);
}

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT int bowed_act_count(OrganistaEngine *e) { return e->nAct; }
FORTE_EXPORT double bowed_vb(OrganistaEngine *e) { return e->vB; }
// FN, FT, down, active, L.vB, the ring's size, os, f0
FORTE_EXPORT void bowed_key_state(OrganistaEngine *e, int key, double *out) {
  const OrganistaEngine::Key *s = e->string(key);
  if (!s) return;
  const double v[8] = {s->FN, s->FT, s->down ? 1.0 : 0.0, s->active ? 1.0 : 0.0, s->L.vB, (double)(s->mask + 1), (double)s->os, s->L.f0};
  for (int i = 0; i < 8; i++) out[i] = v[i];
}
FORTE_EXPORT void bowed_key_set_fn(OrganistaEngine *e, int key, double FN) { if (auto *s = e->string(key)) s->FN = FN; }
FORTE_EXPORT void bowed_key_init_helmholtz(OrganistaEngine *e, int key, double vB) { if (auto *s = e->string(key)) s->initHelmholtz(vB); }
// motion(win): slips per period, kind (0 none, 1 helmholtz, 2 multiple, 3 raucous)
FORTE_EXPORT void bowed_key_motion(OrganistaEngine *e, int key, int win, double *out) {
  auto *s = e->string(key);
  if (!s) return;
  const Motion m = s->motion(win);
  out[0] = m.spp; out[1] = (double)m.kind;
}
// a key's rings: 0 fb, 1 nl, 2 hb, 3 tb, 4 tn (the ring's size doubles each)
FORTE_EXPORT double *bowed_key_ring(OrganistaEngine *e, int key, int which) {
  auto *s = e->string(key);
  if (!s) return nullptr;
  return (which == 0 ? s->fb : which == 1 ? s->nl : which == 2 ? s->hb : which == 3 ? s->tb : s->tn).data();
}
}
