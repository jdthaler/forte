// clavicylinder-web.cpp — the model's functions the page's views call
// (clavicylinder/src/clavicylinder-wasm.js), and the engine's test hooks (its voices, the cylinder
// and the contact trace).

#include "clavicylinder-engine.h"
#include "forte/web.h"

using namespace forte::clavicylinder;

static constexpr int BAR_FIELDS = 16, MODE_FIELDS = 5;
// a bar, flat: key, f1, fbar, L, h, m, post, xc, arm, flever, tx, ty, xs, meff, reg, balance, then
// count and f, sigma, c, cn, e for each mode
static void putBar(const Bar &b, double *out) {
  const double v[BAR_FIELDS] = {(double)b.key, b.f1, b.fbar, b.L, b.h, b.m, b.post ? 1.0 : 0.0, b.xc, b.arm, b.flever, b.tx, b.ty, b.xs, b.meff, b.reg, b.balance};
  for (int k = 0; k < BAR_FIELDS; k++) out[k] = v[k];
  out[BAR_FIELDS] = b.count;
  for (int i = 0; i < b.count; i++) {
    const BarMode &m = b.modes[i];
    const double w[MODE_FIELDS] = {m.f, m.sigma, m.c, m.cn, m.e};
    for (int k = 0; k < MODE_FIELDS; k++) out[BAR_FIELDS + 1 + MODE_FIELDS * i + k] = w[k];
  }
}

extern "C" {
// bar(key, P, fs), flat (putBar), in out; P indexed as in clavicylinder-params.h
FORTE_EXPORT void clavicylinder_bar(int key, const double *P, double fs, double *out) { putBar(bar(key, P, fs), out); }
FORTE_EXPORT double clavicylinder_mode_shape(int n, double x) { return modeShape(n, x); }
FORTE_EXPORT double clavicylinder_mode_slope(int n, double x) { return modeSlope(n, x); }
FORTE_EXPORT double clavicylinder_beta_l(int n) { return BETA_L[n]; }
FORTE_EXPORT int clavicylinder_mode_count() { return MODES; }
FORTE_EXPORT double clavicylinder_rubbed_mass(int key, int build, double h) { return rubbedMass(key, build, h); }
// friction(wet, grip, L): mud, dmu, v0, beta, noise in out
FORTE_EXPORT void clavicylinder_friction(double wet, double grip, double L, double *out) {
  const Friction f = friction(wet, grip, L);
  out[0] = f.mud; out[1] = f.dmu; out[2] = f.v0; out[3] = f.beta; out[4] = f.noise;
}
// pad(wet, layers, L): m, k, zeta in out
FORTE_EXPORT void clavicylinder_pad(double wet, int layers, double L, double *out) {
  const Pad d = pad(wet, layers, L);
  out[0] = d.m; out[1] = d.k; out[2] = d.zeta;
}
// the geometry's constants: NODE, POST, POST_AT, ARM, SPLIT, CYL_R, WIDTH, H0
FORTE_EXPORT void clavicylinder_constants(double *out) {
  const double v[8] = {NODE, POST, POST_AT, ARM, (double)SPLIT, CYL_R, WIDTH, H0};
  for (int k = 0; k < 8; k++) out[k] = v[k];
}

// The tests' hooks, on the engine of a handle (forte_engine): the voices, in order.
FORTE_EXPORT int clavicylinder_voice_count(ClavicylinderEngine *e) { return e->count; }
// key, Nn, touch, modes, stick, slip, F, sticks (the share of the last block stuck)
FORTE_EXPORT void clavicylinder_voice_state(ClavicylinderEngine *e, int i, double *out) {
  const ClavicylinderEngine::Voice &v = *e->voices[i];
  out[0] = v.key; out[1] = v.Nn; out[2] = v.touch; out[3] = v.N; out[4] = v.stick; out[5] = v.slip; out[6] = v.F; out[7] = v.sticks;
}
// the voice's modal state: 0 q, 1 q1 (MODES doubles each)
FORTE_EXPORT double *clavicylinder_voice_q(ClavicylinderEngine *e, int i, int which) {
  ClavicylinderEngine::Voice &v = *e->voices[i];
  return which ? v.q1.data() : v.q.data();
}
FORTE_EXPORT void clavicylinder_voice_bar(ClavicylinderEngine *e, int i, double *out) { putBar(e->voices[i]->b, out); }
// the cylinder: speed (rad/s), angle, the bars' drag (N)
FORTE_EXPORT void clavicylinder_cylinder(ClavicylinderEngine *e, double *out) { out[0] = e->W; out[1] = e->theta; out[2] = e->load; }
// the focused bar's contact trace (0: slip speed, 1: friction force; TRACE floats) and where it writes next
FORTE_EXPORT float *clavicylinder_trace(ClavicylinderEngine *e, int which) { return which ? e->trF.data() : e->trS.data(); }
FORTE_EXPORT int clavicylinder_trace_pos(ClavicylinderEngine *e) { return e->tw; }
}
