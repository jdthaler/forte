// gamelan-web.cpp — the model's functions the page's views and the tests call
// (gamelan/src/gamelan-wasm.js).

#include "forte/web.h"
#include "gamelan-engine.h"
#include "gamelan-model.h"

using namespace forte::gamelan;

extern "C" {
// A key's design for parameters P struck at velocity v: its modes (f, sigma, amp, out, kind,
// order for each, from out[16]) and, in out[0..15]: count, family, band, f1, the bar's L, w, h,
// the tube's f, sigma, a and coupling (0 without), the gongs' partner mode and G, Γ, the
// mallet's contact, whether it pairs.
FORTE_EXPORT int gamelan_key_design(int key, const double *P, double v, double *out) {
  const KeyDesign d = keyDesign(key, P, v);
  const double head[16] = {(double)d.count, (double)d.reg.family, (double)d.reg.band, d.f1, d.bar.L, d.bar.w, d.bar.h,
                           d.hasTube ? d.tube.f : 0, d.tube.sigma, d.tube.a, d.tubeK, (double)d.round2, d.G, d.Gamma, d.tau, d.pairs ? 1.0 : 0.0};
  for (int i = 0; i < 16; i++) out[i] = head[i];
  for (int i = 0; i < d.count; i++) {
    double *o = out + 16 + 6 * i;
    const Mode &m = d.m[i];
    o[0] = m.f; o[1] = m.sigma; o[2] = m.amp; o[3] = m.out; o[4] = m.kind; o[5] = m.order;
  }
  return d.count;
}
FORTE_EXPORT double gamelan_note_freq(int key, const double *P) { return noteFreq(key, P); }
FORTE_EXPORT double gamelan_laras_cents(int key, int laras) { return larasCents(key, laras); }
FORTE_EXPORT int gamelan_laras_degree(int key, int laras) { return larasDegree(key, laras); }
FORTE_EXPORT int gamelan_family(int key, int instrument) { return registerOf(key, instrument).family; }
FORTE_EXPORT int gamelan_band(int key, int instrument) { return registerOf(key, instrument).band; }
// the register's name, as a C string in the module's memory
FORTE_EXPORT const char *gamelan_register_name(int key, int instrument) { return registerOf(key, instrument).name; }
FORTE_EXPORT double gamelan_huang(double b, double r, double s) { return huangDet(b, r, s); }
FORTE_EXPORT int gamelan_timoshenko(double hL, int n, double *out) { return timoshenkoRoots(hL, n, out); }
FORTE_EXPORT double gamelan_beta_l(int n) { return betaL(n); }
FORTE_EXPORT double gamelan_bend_shape(int n, double u) { return bendShape(n, u); }
FORTE_EXPORT double gamelan_torsion_freq(double L, double w, double h, int n) { return torsionFreq(L, w, h, n); }
FORTE_EXPORT double gamelan_torsion_k(double w, double h) { return torsionK(w, h); }
// the bar a family cuts for a note: L, w, h in out
FORTE_EXPORT void gamelan_bar(int family, double f1, double thick, double *out) {
  const Bar b = barFor(family, f1, thick);
  out[0] = b.L; out[1] = b.w; out[2] = b.h;
}
// a tube under a bar of width w, tuned to f: f, sigma, a
FORTE_EXPORT void gamelan_tube(double w, double f, double *out) {
  const Tube t = tubeFor({0, w, 0}, f);
  out[0] = t.f; out[1] = t.sigma; out[2] = t.a;
}
// a gong table (0: the bonang's, 1: the gong ageng's): count, and ratio, m, kind for each
FORTE_EXPORT int gamelan_gong_table(int which, double *out) {
  const GongMode *T = which ? GONG : BONANG;
  const int n = which ? kGongModes : kBonangModes;
  for (int i = 0; i < n; i++) { out[3 * i] = T[i].ratio; out[3 * i + 1] = T[i].m; out[3 * i + 2] = T[i].kind; }
  return n;
}
FORTE_EXPORT double gamelan_pulse(double f, double tau) { return pulseSpectrum(f, tau); }
FORTE_EXPORT double gamelan_contact(int family, double softness, double f, double v) { return contactTime(family, softness, f, v); }
FORTE_EXPORT double gamelan_ring_time(int family, double t60, double f) { return ringTime(family, t60, f); }
FORTE_EXPORT double gamelan_constant(int which) { return which == 0 ? kCurve : which == 1 ? kHarden : which == 2 ? kGongF1 : which == 3 ? kE : which == 4 ? kRho : which == 5 ? kNu : kKappa; }

// The tests' hooks, on the engine of a handle (forte_engine): a key's voice.
static const GamelanEngine::Voice *V(forte::Engine *e, int key) { return static_cast<GamelanEngine *>(e)->voice(key); }
FORTE_EXPORT int gamelan_active(forte::Engine *e, int key) { return V(e, key) != nullptr; }
FORTE_EXPORT int gamelan_modes(forte::Engine *e, int key) { const auto *v = V(e, key); return v ? v->count : 0; }
FORTE_EXPORT int gamelan_partners(forte::Engine *e, int key) { const auto *v = V(e, key); return v ? v->subs : 0; }
FORTE_EXPORT double gamelan_beat(forte::Engine *e, int key) { const auto *v = V(e, key); return v ? v->beat : -1; }
FORTE_EXPORT int gamelan_damped(forte::Engine *e, int key) { const auto *v = V(e, key); return v ? v->damped : -1; }
FORTE_EXPORT double gamelan_level(forte::Engine *e, int key) { const auto *v = V(e, key); return v ? static_cast<GamelanEngine *>(e)->level(*v) : 0; }
FORTE_EXPORT double gamelan_partner_f1(forte::Engine *e, int key, int s) { const auto *v = V(e, key); return v && s < v->subs ? v->sub[s].f1 : 0; }
// mode p's displacement in partner s (the note 0, the tube −1)
FORTE_EXPORT double gamelan_displacement(forte::Engine *e, int key, int s, int p) {
  const auto *v = V(e, key);
  if (!v || s >= v->subs) return 0;
  return p < 0 ? v->sub[s].tube.y1 : v->sub[s].m[p].y1;
}
}
