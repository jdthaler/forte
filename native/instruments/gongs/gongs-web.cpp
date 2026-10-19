// gongs-web.cpp — the model's functions the page's views call (gongs/src/gongs-wasm.js), and the
// engine's test hooks: its voices, their state and methods, and a voice placed in a given state
// (the test suite reaches into the engine's voices through these).

#include <cstdint>
#include <memory>
#include <vector>

#include "forte/web.h"
#include "gongs-engine.h"

using namespace forte::gongs;

namespace {
// the views' tables, by spec (the page's own copy of the model; built in place, a few kept)
const Shell *viewShell(const Spec &s) {
  static std::vector<std::unique_ptr<Shell>> cache;
  for (auto &c : cache) if (c->spec == s) return c.get();
  if (cache.size() >= 8) cache.erase(cache.begin());
  cache.push_back(buildShell(s));
  return cache.back().get();
}
enum Field {
  fKey, fN, fR, fK, fH, fM, fNl, fHit, fPsi, fEps0, fV, fEinj, fGuards, fPeak, fNlr, fAdapt, fW0, fCs, fFull, fLite,
  fHitK, fHitMi, fHitXm, fHitXm1, fHitD0, fHitDm1, fHitSteps, fHitFmax, fHitTouched, fTail, fDead, fKilling, fReleased,
  fDamped, fV3, fV4, fFitting, fCents, fSerial,
};
} // namespace

extern "C" {
// ---- the model, for the views --------------------------------------------------------------------
// The key's gong for parameters P (indexed as in gongs-params.h) at fs: its tables (the return
// value, for gongs_shell: good until the next call), and in out f0, w0, a, h, mass, fsi, R, k, Nv, fc, cp,
// then σ of each of its Nv modes.
FORTE_EXPORT const Shell *gongs_key(const double *P, int key, double fs, double *out) {
  const Shell *S = viewShell(specOf(P));
  Gong g;
  keyGong(g, key, P, fs, *S);
  const double v[11] = {g.f0, g.w0, g.a, g.h, g.mass, g.fsi, (double)g.R, g.k, (double)g.Nv, g.fc, g.cp};
  for (int i = 0; i < 11; i++) out[i] = v[i];
  for (int i = 0; i < g.Nv; i++) out[11 + i] = g.sigma[i];
  return S;
}
// What a set of tables is for: the Rim's index, Dome rise, Coupling terms, Asymmetry (a fraction).
FORTE_EXPORT void gongs_shell_spec(const Shell *S, double *out) { out[0] = S->spec.bc; out[1] = S->spec.rise; out[2] = S->spec.terms; out[3] = S->spec.asym; }
// A set of tables: N, NS, tuned, then Om, m, the dominant plate mode's m and s (for the labels), the
// twin (0 cos, 1 sin) and the round gong's mode of each of the N modes, C of each of the NS in-plane
// modes, the N radial shapes (NR each).
FORTE_EXPORT void gongs_shell(const Shell *S, double *out) {
  const forte::gongs::table::Table &T = *forte::gongs::table::kTables[S->spec.bc];
  int at = 0;
  out[at++] = S->N; out[at++] = S->NS; out[at++] = S->tuned;
  for (int i = 0; i < S->N; i++) out[at++] = S->Om[i];
  for (int i = 0; i < S->N; i++) out[at++] = S->m[i];
  for (int i = 0; i < S->N; i++) out[at++] = T.modes[S->plate[i]].m;
  for (int i = 0; i < S->N; i++) out[at++] = T.modes[S->plate[i]].s;
  for (int i = 0; i < S->N; i++) out[at++] = S->fam[i];
  for (int i = 0; i < S->N; i++) out[at++] = S->base[i];
  for (int n = 0; n < S->NS; n++) out[at++] = S->C[n];
  for (int i = 0; i < S->N; i++) for (int r = 0; r < NR; r++) out[at++] = S->R[i][r];
}
// Its couplings (n, i, j, v for `count` of them from `from`) and curvature terms (n, i, v).
FORTE_EXPORT int gongs_shell_h_count(const Shell *S) { return (int)S->H.size(); }
FORTE_EXPORT void gongs_shell_h(const Shell *S, int from, int count, double *out) {
  for (int e = 0; e < count; e++) { const Term &h = S->H[from + e]; out[4 * e] = h.n; out[4 * e + 1] = h.i; out[4 * e + 2] = h.j; out[4 * e + 3] = h.v; }
}
FORTE_EXPORT int gongs_shell_e_count(const Shell *S) { return (int)S->E.size(); }
FORTE_EXPORT void gongs_shell_e(const Shell *S, int from, int count, double *out) {
  for (int e = 0; e < count; e++) { const ETerm &t = S->E[from + e]; out[3 * e] = t.n; out[3 * e + 1] = t.i; out[3 * e + 2] = t.v; }
}
// The backbone of mode p for the tables of a spec.
FORTE_EXPORT double gongs_backbone(int bc, double rise, int terms, double asym, int p, int Nv) { return backbone(*viewShell({bc, rise, terms, asym}), p, Nv); }
FORTE_EXPORT double gongs_contact_time(const double *P, int key, double fs, double vel) {
  Gong g;
  keyGong(g, key, P, fs, *viewShell(specOf(P)));
  return contactTime(g, P, vel);
}
FORTE_EXPORT double gongs_interp_r(const double *R, double r) { return interpR(R, r); }

// ---- the tests' hooks, on the engine of a handle (forte_engine) ------------------------------------
// The voices, oldest first: (voice, serial) pairs in out; their count.
FORTE_EXPORT int gongs_voices(GongEngine *e, int *out) {
  Voice *v[GongEngine::POOL];
  const int n = e->voices(v);
  for (int i = 0; i < n; i++) { out[2 * i] = (int)(intptr_t)v[i]; out[2 * i + 1] = (int)v[i]->serial; }
  return n;
}
// A voice at rest in the displacement x0 (n values): the tests' free vibration of chosen modes.
FORTE_EXPORT Voice *gongs_place(GongEngine *e, int key, const double *x0, int n) { return e->place(key, x0, n); }
FORTE_EXPORT double gongs_voice_get(const Voice *v, int f) {
  switch (f) {
    case fKey: return v->key; case fN: return v->N; case fR: return v->R; case fK: return v->k; case fH: return v->h;
    case fM: return v->m; case fNl: return v->nl; case fHit: return v->hit.on; case fPsi: return v->psi; case fEps0: return v->eps0;
    case fV: return v->V; case fEinj: return v->Einj; case fGuards: return v->guards; case fPeak: return v->peak; case fNlr: return v->nlr;
    case fAdapt: return v->adapt; case fW0: return v->g.w0;
    case fCs: return (double)(intptr_t)v->cs; case fFull: return (double)(intptr_t)v->full; case fLite: return (double)(intptr_t)v->lite;
    case fHitK: return v->hit.K; case fHitMi: return v->hit.Mi; case fHitXm: return v->hit.xm; case fHitXm1: return v->hit.xm1;
    case fHitD0: return v->hit.d0; case fHitDm1: return v->hit.dm1; case fHitSteps: return v->hit.steps; case fHitFmax: return v->hit.Fmax;
    case fHitTouched: return v->hit.touched; case fTail: return v->tail; case fDead: return v->dead; case fKilling: return v->killing;
    case fReleased: return v->released; case fDamped: return v->damped; case fV3: return v->V3; case fV4: return v->V4;
    case fFitting: return v->fitting; case fCents: return v->cents; case fSerial: return v->serial;
    default: return 0;
  }
}
FORTE_EXPORT void gongs_voice_set(Voice *v, int f, double x) {
  if (f == fAdapt) v->adapt = x != 0;
  else if (f == fLite) v->lite = (intptr_t)x == (intptr_t)v->full ? v->full : &v->views[1]; // (v.lite = v.full)
}
// x, x1, the recursion's A, σ (the gong's, per mode), the strike shape φ, the gradient
FORTE_EXPORT double *gongs_voice_array(Voice *v, int which) {
  switch (which) {
    case 0: return v->x.data(); case 1: return v->x1.data(); case 2: return v->A; case 3: return v->g.sigma.data();
    case 4: return v->phi.data(); default: return v->gv.data();
  }
}
FORTE_EXPORT const Shell *gongs_voice_shell(const Voice *v) { return v->S; }
FORTE_EXPORT void gongs_voice_step(Voice *v) { v->step(); }
FORTE_EXPORT void gongs_voice_set_damping(Voice *v) { v->setDamping(); }
FORTE_EXPORT double gongs_voice_energy_d(const Voice *v) { return v->energyD(); }
FORTE_EXPORT void gongs_voice_linear(Voice *v) { v->linear(); }
// x after every step the engine takes, for a test that watches them
FORTE_EXPORT void gongs_voice_trace(Voice *v, int on) {
  if (on && !v->trace) v->trace = new std::vector<double>();
  else if (!on) { delete v->trace; v->trace = nullptr; }
}
FORTE_EXPORT int gongs_voice_trace_count(const Voice *v) { return v->trace ? (int)v->trace->size() : 0; }
FORTE_EXPORT const double *gongs_voice_trace_data(const Voice *v) { return v->trace ? v->trace->data() : nullptr; }
FORTE_EXPORT void gongs_voice_trace_clear(Voice *v) { if (v->trace) v->trace->clear(); }
}
