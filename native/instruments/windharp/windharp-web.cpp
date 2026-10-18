// windharp-web.cpp — the model's functions the page's views call (windharp/src/windharp-wasm.js),
// and the engine's test hooks (its seed and options, its voices and their strings, the wind).

#include "windharp-engine.h"
#include "forte/web.h"

using namespace forte::windharp;

namespace {
// A string's design from its inputs, as the page passes them: key, n0, tuning, unison, mass, q,
// and its place in the course (cents, gauge, idx, course).
StringDesign designOf(const double *in) {
  DesignParams P;
  P.n0 = in[1]; P.tuning = (int)in[2]; P.unison = in[3]; P.mass = in[4]; P.q = in[5];
  CourseOffset o;
  o.cents = in[6]; o.gauge = in[7]; o.idx = (int)in[8]; o.course = (int)in[9];
  return stringDesign((int)in[0], P, o);
}
// key, D, L, T, m, ms, mf, mu, B, f0, N, n0, zeta, Re0, stress, unison, St0, fNote, target, lc, cents,
// gauge, idx, course, then f[0 … N_MAX)
void putDesign(const StringDesign &S, double *out) {
  const double v[24] = {double(S.key), S.D, S.L, S.T, S.m, S.ms, S.mf, S.mu, S.B, S.f0, double(S.N), double(S.n0), S.zeta, S.Re0,
                        S.stress, double(S.unison), S.St0, S.fNote, S.target, S.lc, S.cents, S.gauge, double(S.idx), double(S.course)};
  for (int i = 0; i < 24; i++) out[i] = v[i];
  for (int i = 0; i < N_MAX; i++) out[24 + i] = S.f[i];
}
// n, lo, hi, mid, growth, AM, sheds
void putBand(const Band &b, double *out) {
  out[0] = b.n; out[1] = b.lo; out[2] = b.hi; out[3] = b.mid; out[4] = b.growth; out[5] = b.AM; out[6] = b.sheds;
}
float bigL[BLOCK], bigR[BLOCK];
WindHarpEngine::Voice *voiceAt(WindHarpEngine *e, int slot) { return slot >= 0 && slot < WindHarpEngine::POOL ? &e->pool[slot] : nullptr; }
} // namespace

extern "C" {
// ---- the model -----------------------------------------------------------------------------------
FORTE_EXPORT void windharp_string_design(const double *in, double *out) { putDesign(designOf(in), out); }
// idx, course, cents, gauge for each string of key's course; returns how many
FORTE_EXPORT int windharp_course_offsets(int key, double *out) {
  CourseOffset o[COURSE_MAX];
  const int n = courseOffsets(key, o);
  for (int i = 0; i < n; i++) { out[4 * i] = o[i].idx; out[4 * i + 1] = o[i].course; out[4 * i + 2] = o[i].cents; out[4 * i + 3] = o[i].gauge; }
  return n;
}
// Re, St, r, fs, Om, sheds
FORTE_EXPORT void windharp_shedding(double U, double D, double *out) {
  const Shedding s = shedding(U, D);
  out[0] = s.Re; out[1] = s.St; out[2] = s.r; out[3] = s.fs; out[4] = s.Om; out[5] = s.sheds;
}
FORTE_EXPORT int windharp_home_harmonic(const double *in) { return homeHarmonic(designOf(in)); }
FORTE_EXPORT int windharp_lock_band(const double *in, int n, double *out) {
  Band b;
  if (!lockBand(designOf(in), n, b)) return 0;
  putBand(b, out);
  return 1;
}
// the band, then upTo, downTo, Ymid, Yup, Ydown
FORTE_EXPORT int windharp_locked_range(const double *in, int n, double *out) {
  LockedRange r;
  if (!lockedRange(designOf(in), n, r)) return 0;
  putBand(r.band, out);
  out[7] = r.upTo; out[8] = r.downTo; out[9] = r.Ymid; out[10] = r.Yup; out[11] = r.Ydown;
  return 1;
}
// The single-mode harmonic balance at δ, λ, AM, M, ε, r: each solution's w, Q, Y, P; returns how
// many (balance). windharp_locked_state: the locked one (lockedState), 1 if there is one.
FORTE_EXPORT int windharp_balance(double delta, double lam, double AM, double M, double eps, double r, double *out) {
  BalanceState s[BALANCE_MAX];
  const int n = balance(delta, lam, AM, M, eps, r, s);
  for (int i = 0; i < n; i++) { out[4 * i] = s[i].w; out[4 * i + 1] = s[i].Q; out[4 * i + 2] = s[i].Y; out[4 * i + 3] = s[i].P; }
  return n;
}
FORTE_EXPORT int windharp_locked_state(double delta, double lam, double AM, double M, double eps, double r, double *out) {
  BalanceState s;
  if (!lockedState(delta, lam, AM, M, eps, r, s)) return 0;
  out[0] = s.w; out[1] = s.Q; out[2] = s.Y; out[3] = s.P;
  return 1;
}
FORTE_EXPORT double windharp_locked_amplitude(const double *in, int n, double U) { return lockedAmplitude(designOf(in), n, U); }

// ---- the tests' hooks, on the engine of a handle (forte_engine) ----------------------------------
FORTE_EXPORT void windharp_configure(WindHarpEngine *e, double seed, double eps, double noise, int rigid) {
  WindHarpEngine::Options o;
  o.eps = eps; o.noise = noise; o.rigid = rigid != 0;
  e->configure(seed, o);
}
FORTE_EXPORT int windharp_voices(WindHarpEngine *e) { return e->nv; }
// the pool slot of the i-th voice, in the order they started
FORTE_EXPORT int windharp_voice_slot(WindHarpEngine *e, int i) { return int(e->voices[i] - e->pool); }
FORTE_EXPORT int windharp_by_key(WindHarpEngine *e, int key) { return key >= 0 && key < 128 && e->byKey[key] ? int(e->byKey[key] - e->pool) : -1; }
// a voice's key, x, target, fading, dead, held, pedal, age, env, strings, fade, press
FORTE_EXPORT double windharp_voice_get(WindHarpEngine *e, int slot, int field) {
  const WindHarpEngine::Voice *v = voiceAt(e, slot);
  if (!v) return 0;
  const double f[12] = {double(v->key), v->x, v->target, double(v->fading), double(v->dead), double(v->held), double(v->pedal), v->age, v->env, double(v->ns), v->fade, v->press};
  return field >= 0 && field < 12 ? f[field] : 0;
}
FORTE_EXPORT void windharp_voice_set(WindHarpEngine *e, int slot, int field, double value) {
  WindHarpEngine::Voice *v = voiceAt(e, slot);
  if (!v) return;
  if (field == 1) v->x = value;
  else if (field == 2) v->target = value;
}
// a string's N, J, x, target, Om, Re, r, Ucur, home
FORTE_EXPORT double windharp_string_get(WindHarpEngine *e, int slot, int si, int field) {
  const WindHarpEngine::Voice *v = voiceAt(e, slot);
  if (!v || si < 0 || si >= v->ns) return 0;
  const WindHarpEngine::Str &s = v->strings[si];
  const double f[9] = {double(s.N), double(s.J), s.x, s.target, s.Om, s.Re, s.r, s.Ucur, double(s.home)};
  return field >= 0 && field < 9 ? f[field] : 0;
}
FORTE_EXPORT void windharp_string_set(WindHarpEngine *e, int slot, int si, int field, double value) {
  WindHarpEngine::Voice *v = voiceAt(e, slot);
  if (!v || si < 0 || si >= v->ns) return;
  if (field == 2) v->strings[si].x = value;
  else if (field == 3) v->strings[si].target = value;
}
// a string's state, in place: 0 a, 1 v, 2 w (its modes), 3 q, 4 qv, 5 e (its wake stations)
FORTE_EXPORT double *windharp_string_array(WindHarpEngine *e, int slot, int si, int which) {
  WindHarpEngine::Voice *v = voiceAt(e, slot);
  if (!v || si < 0 || si >= v->ns) return nullptr;
  WindHarpEngine::Str &s = v->strings[si];
  double *const a[6] = {s.a, s.v, s.w, s.q, s.qv, s.e};
  return which >= 0 && which < 6 ? a[which] : nullptr;
}
FORTE_EXPORT void windharp_string_design_of(WindHarpEngine *e, int slot, int si, double *out) {
  const WindHarpEngine::Voice *v = voiceAt(e, slot);
  if (v && si >= 0 && si < v->ns) putDesign(v->strings[si].S, out);
}
// A block of up to BLOCK samples in one piece, longer than the 128 of forte_process (the tests
// play some); the output in windharp_left, windharp_right.
FORTE_EXPORT void windharp_process(WindHarpEngine *e, int n) { e->process(bigL, bigR, n < BLOCK ? n : BLOCK); }
FORTE_EXPORT float *windharp_left() { return bigL; }
FORTE_EXPORT float *windharp_right() { return bigR; }
FORTE_EXPORT double windharp_get_uw(WindHarpEngine *e) { return e->Uw; }
FORTE_EXPORT void windharp_set_uw(WindHarpEngine *e, double U) { e->Uw = U; }
FORTE_EXPORT double windharp_get_u(WindHarpEngine *e) { return e->U; }
FORTE_EXPORT double windharp_wind(WindHarpEngine *e, int n) { return e->wind(n); }
}
