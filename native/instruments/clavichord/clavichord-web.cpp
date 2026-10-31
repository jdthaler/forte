// clavichord-web.cpp — the model's functions the page's views call (clavichord/src/clavichord-wasm.js),
// and the engine's test hooks (its voices).

#include "clavichord-engine.h"
#include "forte/web.h"

using namespace forte::clavichord;

static constexpr int COURSE_FIELDS = 12, STRING_FIELDS = 12;

extern "C" {
// A key's course for parameters P (indexed as in clavichord-params.h), flat in out: course,
// strings, keys, key0, key1, L (this key's tangent, the 8′'s speaking length), a, l, the tangent's rest
// height and the note's cents from its tuned pitch at the touch P gives, the rigid nut's cents from the
// note (what the tuner allowed for the tangent's give), the listing's width; then
// per string: choir, brass, d, μ, EA, T₀, T at nominal, its rest height, f₀, stress, B, Z.
FORTE_EXPORT void clavichord_course(int key, const double *P, double *out) {
  const Params q = paramsOf(P);
  const int course = courseOf(key, q.fretted), n = choirsOf(course, q);
  int keys[2] = {course, course};
  const int nk = courseKeys(course, q.fretted, keys);
  StringDesign S[CHOIRS];
  designCourse(course, q, S, n);
  const double L = tangentPoint(key, q), z = restHeight(S, n, L, q.press), zn = restHeight(S, n, L, PRESS_NOM);
  // cents from the note as tuned (at the nominal touch); and the rigid nut's pitch from the note
  const double fnom = partialFreq(S[0], L, tensionAt(S[0], zn, L), 1);
  const double c = 1200 * std::log2(partialFreq(S[0], L, tensionAt(S[0], z, L), 1) / fnom);
  const double cn = 1200 * std::log2(fnom / (keyPitch(key, q) * std::pow(2.0, detuneCents(course, 0, q) / 1200)));
  const double v[COURSE_FIELDS] = {(double)course, (double)n, (double)nk, (double)keys[0], (double)keys[nk - 1], L, S[0].l - L, S[0].l, z, c, cn, listingWidth(S[0].a)};
  for (int i = 0; i < COURSE_FIELDS; i++) out[i] = v[i];
  for (int s = 0; s < n; s++) {
    const StringDesign &d = S[s];
    const double w[STRING_FIELDS] = {(double)s, d.mat == &BRASS ? 1.0 : 0.0, d.d, d.mu, d.EA, d.T0, d.Tnom, d.hnom, d.f0, d.stress, d.B, d.Z};
    for (int i = 0; i < STRING_FIELDS; i++) out[COURSE_FIELDS + STRING_FIELDS * s + i] = w[i];
  }
}
// The cents key's fundamental moves by with the finger pressing at F (N), held still, from the
// nominal touch it was tuned at.
FORTE_EXPORT double clavichord_cents(int key, const double *P, double F) {
  const Params q = paramsOf(P);
  const int course = courseOf(key, q.fretted), n = choirsOf(course, q);
  StringDesign S[CHOIRS];
  designCourse(course, q, S, n);
  const double L = tangentPoint(key, q), z = restHeight(S, n, L, F), zn = restHeight(S, n, L, PRESS_NOM);
  return 1200 * std::log2(partialFreq(S[0], L, tensionAt(S[0], z, L), 1) / partialFreq(S[0], L, tensionAt(S[0], zn, L), 1));
}
FORTE_EXPORT double clavichord_rest_height(int key, const double *P, double F) {
  const Params q = paramsOf(P);
  const int course = courseOf(key, q.fretted), n = choirsOf(course, q);
  StringDesign S[CHOIRS];
  designCourse(course, q, S, n);
  return restHeight(S, n, tangentPoint(key, q), F);
}
// A string's partials, for key's tangent at the nominal touch: which 0 speaking, 1 afterlength,
// 2 open (bridge to hitchpin). Returns the count; f, σ, σ_bridge for each in out.
FORTE_EXPORT int clavichord_partials(int key, int choir, const double *P, double fs, int which, double *out) {
  const Params q = paramsOf(P);
  const int course = courseOf(key, q.fretted), n = choirsOf(course, q);
  StringDesign S[CHOIRS];
  designCourse(course, q, S, n);
  const StringDesign &s = S[std::min(choir, n - 1)];
  const double L = tangentPoint(key, q), T = tensionAt(s, restHeight(S, n, L, PRESS_NOM), L);
  Modes m;
  if (which == 0) speakingModes(s, L, T, q, fs, N_MAX, m);
  else if (which == 1) afterModes(s, L, T, q, M_AFTER, m);
  else openModes(s, s.T0, q, fs, J_OPEN, m);
  for (int i = 0; i < m.N; i++) { out[3 * i] = m.f[i]; out[3 * i + 1] = m.sigma[i]; out[3 * i + 2] = m.sigB[i]; }
  return m.N;
}
FORTE_EXPORT int clavichord_course_of(int key, int fretted) { return courseOf(key, fretted != 0); }
// where key's tangent meets the strings (m from the bridge), in the keyboard's tuning P gives
FORTE_EXPORT double clavichord_tangent_point(int key, const double *P) { return tangentPoint(key, paramsOf(P)); }
FORTE_EXPORT double clavichord_scale_length(int key) { return scaleLength(key); }
FORTE_EXPORT double clavichord_after_length(int key) { return afterLength(key); }
FORTE_EXPORT double clavichord_listing_sigma(double beta, double w, double listing) { return listingSigma(beta, w, listing); }
FORTE_EXPORT double clavichord_sin_sin(double a, double phi, double b, double psi, double x0, double x1) { return sinSin(a, phi, b, psi, x0, x1); }
FORTE_EXPORT double clavichord_lin_sin(double p, double r, double b, double psi, double x0, double x1) { return linSin(p, r, b, psi, x0, x1); }
// The board: its modes (count; f, σ in out), and its admittance at key's bridge point (Re, Im).
FORTE_EXPORT int clavichord_board_modes(double *out) {
  const BoardModel &B = boardModel();
  for (int k = 0; k < B.K; k++) { out[2 * k] = B.f[k]; out[2 * k + 1] = B.sigma[k]; }
  return B.K;
}
FORTE_EXPORT void clavichord_admittance(int key, double f, double *out) {
  const auto [x, y] = bridgePoint(key);
  const auto Y = boardAdmittance(x, y, f);
  out[0] = Y[0]; out[1] = Y[1];
}
// the constants the page needs: KEY_LO, KEY_HI, OCTAVE_TOP, PRESS_NOM, bed, N_MAX, M_AFTER, J_OPEN
FORTE_EXPORT void clavichord_constants(double *out) {
  const double v[8] = {KEY_LO, KEY_HI, OCTAVE_TOP, PRESS_NOM, ACTION::bed, N_MAX, M_AFTER, J_OPEN};
  for (int i = 0; i < 8; i++) out[i] = v[i];
}

// The tests' hooks, on the engine of a handle (forte_engine): the voices, in order.
FORTE_EXPORT int clavichord_voice_count(ClavichordEngine *e) { return e->nVoices; }
// course, phase, sounding key (−1), z, ż, finger force, strings, N, M, J, T (string 0), T (string 1),
// T₀ (string 0), Tref (string 0), peak, L, a, fade
FORTE_EXPORT void clavichord_voice_state(ClavichordEngine *e, int i, double *out) {
  const ClavichordEngine::Voice &v = *e->voices[i];
  const ClavichordEngine::Str &s = v.s[0];
  const double w[18] = {(double)v.course, (double)v.phase, v.active >= 0 ? (double)v.keys[v.active] : -1.0, v.z, v.zv, v.F, (double)v.nStr,
                        (double)s.N, (double)s.M, (double)s.J, s.T, v.s[1].T, s.S.T0, s.Tref, v.peak, v.L, v.a, v.fade};
  for (int k = 0; k < 18; k++) out[k] = w[k];
}
}
extern "C" {
// a voice's string c: its speaking partials' amplitudes now (0), a sample ago (1), or their frequencies (2)
FORTE_EXPORT double *clavichord_voice_q(ClavichordEngine *e, int i, int c, int which) {
  ClavichordEngine::Str &s = e->voices[i]->s[c];
  return which == 0 ? s.q.data() : which == 1 ? s.q1.data() : s.sp.f.data();
}
}
