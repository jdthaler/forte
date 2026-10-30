// hydraulis-web.cpp — the model's functions the page's views and the tests call
// (hydraulis/src/hydraulis-wasm.js), a key's packed pipes for the engine, and the engine's test
// hooks (its wind, pumps, voices and pipes).

#include "hydraulis-engine.h"
#include "forte/web.h"

using namespace forte::hydraulis;
using Voice = HydraulisEngine::Voice;
using Pipe = HydraulisEngine::Pipe;

extern "C" {
// One pipe (pipeModel(f, stopped, bore, voicing, tune)) into out, returning how many numbers: f,
// stopped, theta, D, H, h, W, A, M, Le, L, fRes, Q1, gain, the number of modes, then per mode f,
// sigma, Q.
FORTE_EXPORT int hydraulis_pipe_model(double f, int stopped, double bore, double cutup, double gain, double offset, double tune, double *out) {
  const PipeModel R = pipeModel(f, stopped != 0, bore, {cutup, gain, offset}, tune);
  const forte::pipes::Geometry &g = R.geo;
  int n = 0;
  for (double v : {R.f, R.stopped ? 1.0 : 0.0, R.theta, g.D, g.H, g.h, g.W, R.A, R.M, R.Le, R.L, R.fRes, R.Q1, R.gain, (double)R.nModes}) out[n++] = v;
  for (int k = 0; k < R.nModes; k++) for (double v : {R.modes[k].f, R.modes[k].sigma, R.modes[k].Q}) out[n++] = v;
  return n;
}
// The linear analysis of that pipe at foot pressure p (pipes-model.h linearRoot): mode n's root
// (Re s, Im s) into out; 0 if lost.
FORTE_EXPORT int hydraulis_linear_root(double f, int stopped, double bore, double cutup, double gain, double offset, double tune, double p, int n, double *out) {
  PipeModel R = pipeModel(f, stopped != 0, bore, {cutup, gain, offset}, tune);
  const std::optional<forte::pipes::Cx> s = forte::pipes::linearRoot(R, p, n);
  if (!s) return 0;
  out[0] = s->re; out[1] = s->im;
  return 1;
}
FORTE_EXPORT double hydraulis_tuning(double f, int stopped) { return tuning(f, stopped != 0); }
FORTE_EXPORT double hydraulis_pipe_freq(int key, int r, double ratio) { return pipeFreq(key, r, ratio); }
FORTE_EXPORT double hydraulis_bore(double f, double bore, int stopped) { return boreD(f, bore, stopped != 0); }
FORTE_EXPORT double hydraulis_lens(double r, double d) { return lensArea(r, d); }
FORTE_EXPORT double hydraulis_slide_open(double s) { return slideOpen(s); }
FORTE_EXPORT double hydraulis_push_time(double velocity, double push) { return pushTime(velocity, push); }
FORTE_EXPORT double hydraulis_spring_omega(double ms) { return springOmega(ms); }
FORTE_EXPORT double hydraulis_stroke_time(double effort) { return strokeTime(effort); }
FORTE_EXPORT double hydraulis_piston_flow(double push, double p, double t, double share, double T) { return pistonFlow(push, p, t, share, T); }
FORTE_EXPORT double hydraulis_push_pressure(double effort, double pRim) { return pushPressure(effort, pRim); }
FORTE_EXPORT double hydraulis_minnaert(double R) { return minnaert(R); }
FORTE_EXPORT double hydraulis_row_pan(int key) { return rowPan(key); }
// The constants: HOLE_FLUE, MARGIN, CD_HOLE, STROKE_V, PISTON_A, DELIVER, D_REF, RHO_W, G, P0, KEY_LO, KEY_HI, R_VALVE.
FORTE_EXPORT void hydraulis_constants(double *out) {
  const double v[13] = {HOLE_FLUE, MARGIN, CD_HOLE, STROKE_V, PISTON_A, DELIVER, D_REF, RHO_W, G, P0, (double)KEY_LO, (double)KEY_HI, R_VALVE};
  for (int i = 0; i < 13; i++) out[i] = v[i];
}
// The cistern (size, pRim) into out: Ain, Aout, Mw, Ch, Ca, Rw, xRim, Vrim, pRim, fb.
FORTE_EXPORT void hydraulis_cistern(double size, double pRim, double *out) {
  const Cistern c = cistern(size, pRim);
  const double v[10] = {c.Ain, c.Aout, c.Mw, c.Ch, c.Ca, c.Rw, c.xRim, c.Vrim, c.pRim, c.fb};
  for (int i = 0; i < 10; i++) out[i] = v[i];
}
// A key's four pipes, packed (packKeyModels) into out, returning how many numbers: what the page
// sends with a note, and its engine takes (hydraulis_offer); P is indexed as in hydraulis-params.h.
FORTE_EXPORT int hydraulis_key_models(int key, const double *P, double *out) {
  Design d;
  d.bore = P[p::bore]; d.voicing = {P[p::cutup], P[p::gain], P[p::offset]}; d.ratio = tuningOf(P).ratio(key);
  return packKeyModels(keyModels(key, d), out);
}
// One pipe cut with the correction `tune`, in every rank of a key, packed (the tuning tool's:
// tools/hydraulis-tuning.mjs plays it with hydraulis_use_models).
FORTE_EXPORT int hydraulis_pipe_packed(double f, int stopped, double bore, double cutup, double gain, double offset, double tune, double *out) {
  KeyModels k;
  k.key = 0; k.design.bore = bore; k.design.voicing = {cutup, gain, offset};
  for (PipeModel &R : k.pipes) R = pipeModel(f, stopped != 0, bore, k.design.voicing, tune);
  return packKeyModels(k, out);
}
FORTE_EXPORT int hydraulis_offer(HydraulisEngine *e, const double *packed, int n) { return e->offer(packed, n); }
FORTE_EXPORT int hydraulis_use_models(HydraulisEngine *e, const double *packed, int n) { return e->useModels(packed, n); }
FORTE_EXPORT void hydraulis_configure(HydraulisEngine *e, unsigned seed, int track, int still) { e->configure(seed, track != 0, still != 0); }
FORTE_EXPORT int hydraulis_ready(HydraulisEngine *e, int key) { return e->ready(key); }

// The tests' hooks, on the engine of a handle (forte_engine).
// The wind: 0 pc, 1 dV, 2 Qw, 3 Qdraw, 4 Qpump, 5 Qesc, 6 effort, 7 strokes, 8 bubbles; the cistern
// as it is (as hydraulis_cistern), and both pumps' cycling flags.
static double *windField(HydraulisEngine *e, int which) {
  double *f[] = {&e->pc, &e->dV, &e->Qw, &e->Qdraw, &e->Qpump, &e->Qesc, &e->effort};
  return which >= 0 && which < 7 ? f[which] : nullptr;
}
FORTE_EXPORT double hydraulis_wind(HydraulisEngine *e, int which) {
  if (which == 7) return e->strokes;
  if (which == 8) return e->bubbled;
  if (which == 9) return e->pump[0].cycling + 2 * e->pump[1].cycling;
  double *f = windField(e, which);
  return f ? *f : 0;
}
FORTE_EXPORT void hydraulis_set_wind(HydraulisEngine *e, int which, double v) { if (double *f = windField(e, which)) *f = v; }
FORTE_EXPORT double *hydraulis_noise(HydraulisEngine *e) { return e->noise.data(); }
// The voices in order, a key's voice (byKey) or null; a voice's fields: 0 key, 1 down, 2 fading,
// 3 s (the slide), 4 open, 5 env, 6 fade; a voice's pipe's: 0 freq(), 1 foot, 2 Uj, 3 asleep, 4 os,
// 5 the number of modes it plays, 6 its frequency (model).
FORTE_EXPORT int hydraulis_voices(HydraulisEngine *e) { return e->nVoices; }
FORTE_EXPORT Voice *hydraulis_voice(HydraulisEngine *e, int i) { return i >= 0 && i < e->nVoices ? e->voices[i] : nullptr; }
FORTE_EXPORT Voice *hydraulis_by_key(HydraulisEngine *e, int key) { return key >= 0 && key < 128 ? e->byKey[key] : nullptr; }
FORTE_EXPORT double hydraulis_voice_get(Voice *v, int which) {
  switch (which) {
    case 0: return v->key;
    case 1: return v->down;
    case 2: return v->fading;
    case 3: return v->s;
    case 4: return v->open;
    case 5: return v->env;
    case 6: return v->fade;
    default: return 0;
  }
}
FORTE_EXPORT double hydraulis_pipe_get(Voice *v, int r, int which) {
  if (r < 0 || r >= RANKS) return 0;
  const Pipe &q = v->pipes[r];
  switch (which) {
    case 0: return q.freq();
    case 1: return q.foot;
    case 2: return q.Uj;
    case 3: return q.asleep;
    case 4: return q.os;
    case 5: return q.n;
    case 6: return q.R ? q.R->f : 0;
    default: return 0;
  }
}
}
