// clavier-web.cpp — the model's functions the page's views call (clavier/src/clavier-wasm.js), and
// the engine's hooks: its voices, as the test suite and the page's slow motion read (and the tests
// write) the JavaScript engine's. P is indexed as in clavier-params.h.

#include "clavier-engine.h"
#include "forte/web.h"

using namespace forte::clavier;
using Voice = ClavierEngine::Voice;

static void design(const StringDesign &S, double *out) {
  const double v[] = {(double)S.key, S.f0, S.L, S.Ln, S.wound ? 1.0 : 0.0, S.d, S.D, S.mu, S.A, S.EA, S.EI, S.T, S.T0,
                      S.dTnom, S.dLnom, S.gap, S.B, S.stress, S.c, S.mag, S.pull, S.fRelease};
  for (int i = 0; i < 22; i++) out[i] = v[i];
}
// a key's modes: n, f, sigma, a1, a2, b, kn each
static int modes(const KeyModel &m, double *out) {
  for (int i = 0; i < m.nModes; i++) {
    const Mode &x = m.modes[i];
    const double v[] = {(double)x.n, x.f, x.sigma, x.a1, x.a2, x.b, x.kn};
    for (int k = 0; k < 7; k++) out[7 * i + k] = v[k];
  }
  return m.nModes;
}

// The voice's fields, by number (clavier-wasm.js has the same list).
enum Field { fKey, fN, fM, fS, fS1, fEta, fEta1, fC1, fC0, fUm, fQ, fFlp, fFr, fFa, fForce, fPl, fPu, fUl, fUu, fKcGain, fKr, fWrapK,
             fMass, fCb, fCy, fMs, fPressure, fFade, fPeak, fFpeak, fQuiet, fDown, fThrown, fDead, fKilling, fVersion, fXl, fXu, fGl,
             fGu, fLam, fXm, fPb, fPg };
static double *real(Voice *v, int f) {
  switch (f) {
    case fS: return &v->s; case fS1: return &v->s1; case fEta: return &v->eta; case fEta1: return &v->eta1; case fC1: return &v->C1;
    case fC0: return &v->C0; case fUm: return &v->um; case fQ: return &v->Q; case fFlp: return &v->Flp; case fFr: return &v->Fr;
    case fFa: return &v->Fa; case fForce: return &v->force; case fPl: return &v->Pl; case fPu: return &v->Pu; case fUl: return &v->ul;
    case fUu: return &v->uu; case fKcGain: return &v->kcGain; case fKr: return &v->Kr; case fWrapK: return &v->wrapK; case fMass: return &v->mass;
    case fCb: return &v->Cb; case fCy: return &v->Cy; case fMs: return &v->ms; case fPressure: return &v->pressure; case fFade: return &v->fade;
    case fPeak: return &v->peak; case fFpeak: return &v->Fpeak; case fXl: return &v->xl; case fXu: return &v->xu; case fGl: return &v->gl;
    case fGu: return &v->gu; case fLam: return &v->lam; case fXm: return &v->xm; case fPb: return &v->Pb; case fPg: return &v->Pg;
    default: return nullptr;
  }
}

extern "C" {
// stringDesign: key, f0, L, Ln, wound, d, D, mu, A, EA, EI, T, T0, dTnom, dLnom, gap, B, stress, c, mag, pull, fRelease
FORTE_EXPORT void clavier_string_design(int key, const double *P, double *out) { design(stringDesign(key, P), out); }
// keyModel: how many speaking modes; out = the pickups' places (lower, upper), the yarn's mode
// count, then the modes (n, f, sigma, a1, a2, b, kn each), then the yarn's (m, km, f, sigma, a1, a2, b)
FORTE_EXPORT int clavier_key_model(int key, const double *P, double fs, double *out) {
  static KeyModel m;
  keyModel(key, P, fs, m);
  out[0] = m.X.lower; out[1] = m.X.upper; out[2] = m.nYarn;
  double *o = out + 3 + 7 * modes(m, out + 3);
  for (int j = 0; j < m.nYarn; j++) {
    const YarnMode &y = m.yarn[j];
    const double v[] = {(double)y.m, y.km, y.f, y.sigma, y.a1, y.a2, y.b};
    for (int k = 0; k < 7; k++) *o++ = v[k];
  }
  return m.nModes;
}
FORTE_EXPORT void clavier_pickup_x(int key, const double *P, double *out) { const PickupX X = pickupX(key, P); out[0] = X.lower; out[1] = X.upper; }
FORTE_EXPORT void clavier_pickup_mix(int sel, double *out) { const auto [a, b] = pickupMix(sel); out[0] = a; out[1] = b; }
FORTE_EXPORT double clavier_pickup_weight(int n, double x, double L) { return pickupWeight(n, x, L); }
FORTE_EXPORT double clavier_pressure_cents(int key, double F, const double *P) { return pressureCents(key, F, P); }
FORTE_EXPORT double clavier_tone_response(double f, const double *P) { return toneResponse(f, P); }
// releasedFreqs: how many (0 if the eigenproblem failed)
FORTE_EXPORT int clavier_released_freqs(int key, const double *P, int count, double *out) { return releasedFreqs(key, P, count, out); }

// The hooks, on the engine of a handle (forte_engine): its voices in order, each key's, and the
// felt's engagement.
FORTE_EXPORT int clavier_voices(ClavierEngine *e) { return e->nVoices; }
FORTE_EXPORT Voice *clavier_voice(ClavierEngine *e, int i) { return i >= 0 && i < e->nVoices ? e->voices[i] : nullptr; }
FORTE_EXPORT Voice *clavier_by_key(ClavierEngine *e, int key) { return key >= LO && key <= HI ? e->byKey[key - LO] : nullptr; }
FORTE_EXPORT double clavier_mute_level(ClavierEngine *e) { return e->muteLevel; }
FORTE_EXPORT void clavier_set_mute_level(ClavierEngine *e, double x) { e->muteLevel = x; }
FORTE_EXPORT double clavier_voice_get(Voice *v, int f) {
  if (double *x = real(v, f)) return *x;
  switch (f) {
    case fKey: return v->key; case fN: return v->N; case fM: return v->M; case fQuiet: return v->quiet; case fDown: return v->down;
    case fThrown: return v->thrown; case fDead: return v->dead; case fKilling: return v->killing; case fVersion: return v->version;
    default: return 0;
  }
}
FORTE_EXPORT void clavier_voice_set(Voice *v, int f, double x) {
  if (double *p = real(v, f)) *p = x;
}
// q, q1, r, r1 (as they stand now: their roles swap every sample), c, w, A1, A2, eps, beta, phi, gam, Wl, Wu, B1, B2, by
FORTE_EXPORT double *clavier_voice_array(Voice *v, int which) {
  switch (which) {
    case 0: return v->q; case 1: return v->q1; case 2: return v->r; case 3: return v->r1; case 4: return v->c; case 5: return v->w;
    case 6: return v->A1; case 7: return v->A2; case 8: return v->eps; case 9: return v->beta; case 10: return v->phi; case 11: return v->gam;
    case 12: return v->Wl; case 13: return v->Wu; case 14: return v->B1; case 15: return v->B2; default: return v->by;
  }
}
// the voice's string (as clavier_string_design) and its modes (as clavier_key_model's): how many
FORTE_EXPORT void clavier_voice_design(Voice *v, double *out) { design(v->mdl.S, out); }
FORTE_EXPORT int clavier_voice_modes(Voice *v, double *out) { return modes(v->mdl, out); }
}
