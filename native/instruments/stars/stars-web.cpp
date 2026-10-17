// stars-web.cpp — the model's functions the page's views call (stars/src/stars-wasm.js), and the
// engine's test hooks (its voices, as the JavaScript engine's voices and byKey show them).

#include "stars-engine.h"
#include "forte/web.h"

using namespace forte::stars;

static int putStar(const StarState &s, double *out) {
  const double v[7] = {s.M, s.R, s.T, s.L, s.s, (double)(int)s.stage, s.track};
  for (int i = 0; i < 7; i++) out[i] = v[i];
  return 7;
}

extern "C" {
// A key's star (stars-model.js, keyStar) into out, returning how many numbers it wrote, or −1 if
// they don't fit in max: key, K, δ Scuti?, N, the number of multiplets, norm, pitch, target; the
// star (M, R, T, L, s, stage, track); its seismic parameters (dnu, numax, eps, d02, alpha, fwhm,
// gamma, dPi, q); the modes' f, l, m, zeta, p, gamma, wEnv, wCore, asat, mult (N each); then every
// multiplet the model has: l, n, nu, zeta, power, gamma and whether it is played.
FORTE_EXPORT int stars_key_star(int family, double mass, double speedup, int key, double *out, int max) {
  const Star d = keyStar(key, {family, mass, speedup});
  const int nAll = (int)d.all.size();
  if (8 + 7 + 9 + 10 * d.N + 7 * nAll > max) return -1;
  int n = 0;
  for (double v : {(double)d.key, d.K, d.dscuti ? 1.0 : 0.0, (double)d.N, (double)nAll, d.norm, d.pitch, d.target}) out[n++] = v;
  n += putStar(d.star, out + n);
  for (double v : {d.sz.dnu, d.sz.numax, d.sz.eps, d.sz.d02, d.sz.alpha, d.sz.fwhm, d.sz.gamma, d.sz.dPi, d.sz.q}) out[n++] = v;
  for (int i = 0; i < d.N; i++) out[n++] = d.f[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.l[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.m[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.zeta[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.p[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.gamma[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.wEnv[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.wCore[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.asat[i];
  for (int i = 0; i < d.N; i++) out[n++] = d.mult[i];
  size_t k = 0;
  for (int j = 0; j < nAll; j++) {
    const Multiplet &m = d.all[j];
    const bool played = k < d.keptAt.size() && d.keptAt[k] == j;
    if (played) k++;
    for (double v : {(double)m.l, m.n, m.nu, m.zeta, m.power, m.gamma, played ? 1.0 : 0.0}) out[n++] = v;
  }
  return n;
}
// starAt: M, R, T, L, s, stage (0 dwarf, 1 subgiant, 2 giant), track
FORTE_EXPORT void stars_star_at(double s, double M, double *out) { putStar(starAt(s, M), out); }
// zams: M, R, T, L
FORTE_EXPORT void stars_zams(double M, double *out) { putStar(zams(M), out); }
FORTE_EXPORT double stars_legendre(int l, int m, double x) { return legendre(l, m, x); }
FORTE_EXPORT double stars_elm(int l, int m, double incl) { return Elm(l, m, incl); }

// A star for the next note (StarEngine::offer): what the page or a test sends with the note.
FORTE_EXPORT int stars_offer(StarEngine *e, const double *packed, int n) { return e->offer(packed, n); }

// The tests' hooks, on the engine of a handle (forte_engine): its voices in order, and each one's
// key, fading, dead, held, whether it is its key's (byKey), age, level, peak, vel, pressure, N, nAct.
FORTE_EXPORT int stars_voices(StarEngine *e) { return e->nVoices; }
FORTE_EXPORT void stars_voice(StarEngine *e, int i, double *out) {
  const StarEngine::Voice &v = *e->voices[i];
  const double x[12] = {(double)v.key, (double)v.fading, (double)v.dead, (double)v.held, (double)(e->byKey[v.key] == &v), v.age, v.level, v.peak,
                        v.vel, v.pressure, (double)v.N, (double)v.nAct};
  for (int k = 0; k < 12; k++) out[k] = x[k];
}
}
