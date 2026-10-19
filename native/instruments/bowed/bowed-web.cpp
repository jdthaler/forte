// bowed-web.cpp — the model's functions the page's views call (bowed/src/bowed-wasm.js), the
// engine's test hooks (the keys' strings), and a string bowed alone for the tests and the tuner.

#include <algorithm>
#include <memory>

#include "bowed-engine.h"
#include "bowed-params.h"
#include "forte/web.h"

using namespace forte::bowed;

static Params paramsOf(double speed, double beta, double losses, double mobility, double torsionQ) {
  Params P = defaults();
  P.speed = speed; P.beta = beta; P.losses = losses; P.mobility = mobility; P.torsionQ = torsionQ;
  return P;
}

static Params paramsOf(const double *a) { // the descriptor's parameters, in the native order (p::)
  Params P = defaults();
  P.speed = a[p::speed]; P.beta = a[p::beta]; P.treadle = a[p::treadle]; P.treadleRate = a[p::treadleRate];
  P.force = a[p::force]; P.attack = a[p::attack]; P.mus = a[p::mus]; P.mud = a[p::mud]; P.v0 = a[p::v0];
  P.memory = a[p::memory]; P.grain = a[p::grain]; P.torsionQ = a[p::torsionQ]; P.losses = a[p::losses];
  P.mobility = a[p::mobility]; P.boardEta = a[p::boardEta]; P.damper = a[p::damper]; P.lifted = a[p::lifted] != 0;
  P.tuning = tuningOf(a);
  return P;
}

// One string bowed alone, its bridge held still (the other strings' bridge velocity 0, as the
// tuner and the string-alone tests bow it), with the friction of the parameters it was made with.
struct Alone {
  BowedString s;
  Friction Fr;
  Alone(int key, double fs, const Params &P) : s(key, fs), Fr(friction(P)) { s.design(loopDesign(key, P, s.fs)); }
};

extern "C" {
// loopDesign(key, P, fs), flat: fKey, f0, L, T, c, mu, Z0, d, B, stress, wound, G, Zall, N0, beta,
// wheel, vB, Db, Dn, gb, pb, gn, pn, rB, sigma1, Zt, ft, Dtb, Dtn, rtb, rtn (31 values); ratio the
// keyboard's tuning for the key (shared/tuning.js tuningRatio)
FORTE_EXPORT void bowed_loop_design(int key, double fs, double speed, double beta, double losses, double mobility, double torsionQ, double ratio, double *out) {
  Params P = paramsOf(speed, beta, losses, mobility, torsionQ);
  P.tuning.r[((key % 12) + 12) % 12] = ratio;
  const Loop L = loopDesign(key, P, fs);
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
  if (key < KEY_MIN || key > KEY_MAX) return 0;
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

// ---- a string alone ---------------------------------------------------------------------------
// bowed_string_new(key, fs, P): P the descriptor's parameters in the native order (p::count of
// them); the string runs at fs × oversample(key, fs), designed by loopDesign at that rate.
FORTE_EXPORT Alone *bowed_string_new(int key, double fs, const double *P) {
  if (key < KEY_MIN || key > KEY_MAX) return nullptr;
  return new Alone(key, fs, paramsOf(P));
}
FORTE_EXPORT void bowed_string_free(Alone *a) { delete a; }
FORTE_EXPORT void bowed_string_init_helmholtz(Alone *a, double vB) { a->s.initHelmholtz(vB); }
FORTE_EXPORT void bowed_string_set_damper(Alone *a, int on, double sigma) { a->s.setDamper(on != 0, sigma); }
// n output samples with the normal force FN[i] and the wheel speed vB[i]; v[i] the bow-point
// velocity and f[i] the force on the bridge after each, slips[i] the slips counted so far (any of
// the three may be null).
FORTE_EXPORT void bowed_string_bow(Alone *a, int n, const double *FN, const double *vB, double *v, double *f, double *slips) {
  BowedString &s = a->s;
  for (int i = 0; i < n; i++) {
    const double fb = s.tick(0, vB[i], FN[i], a->Fr);
    if (v) v[i] = s.v;
    if (f) f[i] = fb;
    if (slips) slips[i] = (double)s.nSlip;
  }
}
// os, fs (the string's rate), t (its samples so far), slips counted, T0 (its period in samples)
FORTE_EXPORT void bowed_string_state(Alone *a, double *out) {
  const BowedString &s = a->s;
  const double v[5] = {(double)s.os, s.fs, (double)s.t, (double)s.nSlip, s.T0};
  for (int i = 0; i < 5; i++) out[i] = v[i];
}
// motion(win): slips per period, kind
FORTE_EXPORT void bowed_string_motion(Alone *a, int win, double *out) {
  const Motion m = a->s.motion(win);
  out[0] = m.spp; out[1] = (double)m.kind;
}

// ---- the friction junction and the loss filters ------------------------------------------------
// friction(P): mus, mud, v0, tau, grain
FORTE_EXPORT void bowed_friction(double mus, double mud, double v0, double memory, double grain, double *out) {
  Params P = defaults();
  P.mus = mus; P.mud = mud; P.v0 = v0; P.memory = memory; P.grain = grain;
  const Friction F = friction(P);
  out[0] = F.mus; out[1] = F.mud; out[2] = F.v0; out[3] = F.tau; out[4] = F.grain;
}
// frictionForce(vh, vB, FN, Y, F, state): state[0] the junction's state s in and out
FORTE_EXPORT double bowed_friction_force(double vh, double vB, double FN, double Y, double mus, double mud, double v0, double *state) {
  const Friction F = {mus, mud, v0, 0, 0};
  FrictionState st;
  st.s = (int)state[0];
  const double f = frictionForce(vh, vB, FN, Y, F, st);
  state[0] = st.s;
  return f;
}
// lossFilter: g, p, tau
FORTE_EXPORT void bowed_loss_filter(double f0, double s0, double fh, double sh, double fs, double dur, double *out) {
  const LossFilter l = lossFilter(f0, s0, fh, sh, fs, dur);
  out[0] = l.g; out[1] = l.p; out[2] = l.tau;
}

// ---- the soundboard -----------------------------------------------------------------------------
// BOARD: a, b, rhoH, Dx, Dy, then plateYinf, plateDensity
FORTE_EXPORT void bowed_board(double *out) {
  const double v[7] = {BOARD.a, BOARD.b, BOARD.rhoH, BOARD.Dx, BOARD.Dy, plateYinf(), plateDensity()};
  for (int i = 0; i < 7; i++) out[i] = v[i];
}
FORTE_EXPORT double bowed_plate_freq(int m, int n) { return plateFreq(m, n); }
FORTE_EXPORT double bowed_plate_shape(int m, int n, double x, double y) { return plateShape(m, n, x, y); }
FORTE_EXPORT double bowed_board_load(int m, int n) { return stringLoad(m, n); }
// wallace(m, n, f, θ, φ): re, im
FORTE_EXPORT void bowed_wallace(int m, int n, double f, double theta, double phi, double *out) { wallace(m, n, f, theta, phi, out); }
// boardModes(fMax, eta), at most max of them: m, n, f, sigma, M, load each; returns how many
FORTE_EXPORT int bowed_board_modes(double fMax, double eta, int max, double *out) {
  const auto modes = boardModes(fMax, eta);
  const int n = std::min((int)modes.size(), max);
  for (int i = 0; i < n; i++) {
    const BoardMode &b = modes[i];
    const double v[6] = {(double)b.m, (double)b.n, b.f, b.sigma, b.M, b.load};
    for (int j = 0; j < 6; j++) out[6 * i + j] = v[j];
  }
  return (int)modes.size();
}
}
