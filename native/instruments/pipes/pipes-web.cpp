// pipes-web.cpp — the model's functions the page's views and the tests call (pipes/src/pipes-wasm.js),
// a key's packed pipes for the engine, and the engine's test hooks (its wind, voices and pipes).

#include <algorithm>

#include "pipes-engine.h"
#include "forte/web.h"

using namespace forte::pipes;
using Voice = PipeEngine::Voice;
using Pipe = PipeEngine::Pipe;

extern "C" {
// One pipe (pipeModel(f, stopped, P, { tune })) into out, returning how many
// numbers: f, stopped, theta, the geometry (D, a, Sp, H, h, dLt, W, b, y0, dd, Sm, Kj, dLm), A, M,
// Le, L, fRes, Q1, gain, the number of modes, then per mode n, f, om, sigma, Q, harm.
FORTE_EXPORT int pipes_pipe_model(double f, int stopped, double cutup, double gain, double offset, double tune, double *out) {
  ModelOptions o;
  o.tune = tune;
  const PipeModel R = pipeModel(f, stopped != 0, {cutup, gain, offset}, o);
  const Geometry &g = R.geo;
  int n = 0;
  for (double v : {R.f, R.stopped ? 1.0 : 0.0, R.theta, g.D, g.a, g.Sp, g.H, g.h, g.dLt, g.W, g.b, g.y0, g.dd, g.Sm, g.Kj, g.dLm,
                   R.A, R.M, R.Le, R.L, R.fRes, R.Q1, R.gain, (double)R.nModes}) out[n++] = v;
  for (int k = 0; k < R.nModes; k++) {
    const Mode &m = R.modes[k];
    for (double v : {(double)m.n, m.f, m.om, m.sigma, m.Q, (double)m.harm}) out[n++] = v;
  }
  return n;
}
FORTE_EXPORT double pipes_tuning(double f, int stopped) { return tuning(f, stopped != 0); }
FORTE_EXPORT double pipes_pipe_freq(int key, int r) { return pipeFreq(key, r); }
FORTE_EXPORT double pipes_mode_freq(int n, double Le, int stopped) { return modeFreq(n, Le, stopped != 0); }
FORTE_EXPORT double pipes_chest_pan(int key) { return chestPan(key); }
// The wind system at stiffness stiff into out: Cc, Mt, Gs, Gr, Cr, Rt, fw.
FORTE_EXPORT void pipes_wind_system(double stiff, double *out) {
  const WindSystem w = windSystem(stiff);
  int n = 0;
  for (double v : {w.Cc, w.Mt, w.Gs, w.Gr, w.Cr, w.Rt, w.fw}) out[n++] = v;
}
}

// A pipe as pipes_pipe_model writes it (perhaps altered by a test: its jet's area, fewer modes)
// back into a model, for the linear analysis.
static PipeModel unflatten(const double *a) {
  PipeModel R;
  Geometry &g = R.geo;
  R.f = a[0]; R.stopped = a[1] != 0; R.theta = a[2];
  double *geo[] = {&g.D, &g.a, &g.Sp, &g.H, &g.h, &g.dLt, &g.W, &g.b, &g.y0, &g.dd, &g.Sm, &g.Kj, &g.dLm};
  for (int i = 0; i < 13; i++) *geo[i] = a[3 + i];
  g.stopped = R.stopped; R.Kj = g.Kj;
  R.A = a[16]; R.M = a[17]; R.Le = a[18]; R.L = a[19]; R.fRes = a[20]; R.Q1 = a[21]; R.gain = a[22];
  R.nModes = std::max(0, std::min(MODES_OPEN, (int)a[23]));
  for (int k = 0; k < R.nModes; k++) {
    const double *m = a + 24 + 6 * k;
    R.modes[k] = Mode{(int)m[0], m[1], m[2], m[3], m[4], (int)m[5]};
  }
  return R;
}

extern "C" {
// The linear analysis of a pipe (flattened): the root of mode n at foot pressure p (Re s, Im s in
// out; 0 if lost), the jet's loop gain L(s) (re, im in out), θ = U_j/(fW) at foot pressure p and
// back, and the speaking window of mode n
// between thetaLo and thetaHi (out: the number of edges, the grid's length, the edges, then the
// grid's θ, Re s pairs).
FORTE_EXPORT int pipes_linear_root(const double *flat, double p, int n, int steps, double *out) {
  PipeModel R = unflatten(flat);
  const std::optional<Cx> s = linearRoot(R, p, n, steps);
  if (!s) return 0;
  out[0] = s->re; out[1] = s->im;
  return 1;
}
FORTE_EXPORT void pipes_loop_gain(const double *flat, double re, double im, double p, double *out) {
  const PipeModel R = unflatten(flat);
  const Cx L = loopGain(R, {re, im}, p);
  out[0] = L.re; out[1] = L.im;
}
FORTE_EXPORT double pipes_theta_at(const double *flat, double p) { return thetaAt(unflatten(flat), p); }
FORTE_EXPORT double pipes_pressure_at(const double *flat, double theta) { return pressureAt(unflatten(flat), theta); }
FORTE_EXPORT int pipes_speaking_window(const double *flat, int n, double thetaLo, double thetaHi, double *out) {
  PipeModel R = unflatten(flat);
  const Window w = speakingWindow(R, n, thetaLo, thetaHi);
  int k = 0;
  out[k++] = (double)w.edges.size(); out[k++] = (double)w.grid.size();
  for (double e : w.edges) out[k++] = e;
  for (const auto &g : w.grid) { out[k++] = g[0]; out[k++] = g[1]; }
  return k;
}

// A key's six pipes, packed (packKeyModels) into out, returning how many numbers: what the page
// sends with a note, and its engine takes (pipes_offer).
FORTE_EXPORT int pipes_key_models(int key, double cutup, double gain, double offset, double *out) {
  return packKeyModels(keyModels(key, {cutup, gain, offset}), out);
}
FORTE_EXPORT int pipes_offer(PipeEngine *e, const double *packed, int n) { return e->offer(packed, n); }
FORTE_EXPORT int pipes_use_models(PipeEngine *e, const double *packed, int n) { return e->useModels(packed, n); }
FORTE_EXPORT void pipes_configure(PipeEngine *e, unsigned seed, int track) { e->configure(seed, track != 0); }

// The tests' hooks, on the engine of a handle (forte_engine).
// The wind: 0 Pset, 1 Pr, 2 Pc, 3 Qt, 4 Qdraw, 5 Qtrem.
static double *windField(PipeEngine *e, int which) {
  double *f[] = {&e->Pset, &e->Pr, &e->Pc, &e->Qt, &e->Qdraw, &e->Qtrem};
  return which >= 0 && which < 6 ? f[which] : nullptr;
}
FORTE_EXPORT double pipes_wind(PipeEngine *e, int which) { double *f = windField(e, which); return f ? *f : 0; }
FORTE_EXPORT void pipes_set_wind(PipeEngine *e, int which, double v) { if (double *f = windField(e, which)) *f = v; }
FORTE_EXPORT double *pipes_noise(PipeEngine *e) { return e->noise.data(); }
// The voices in order, a key's voice (byKey) or null, and a voice's pipe.
FORTE_EXPORT int pipes_voices(PipeEngine *e) { return e->nVoices; }
FORTE_EXPORT Voice *pipes_voice(PipeEngine *e, int i) { return i >= 0 && i < e->nVoices ? e->voices[i] : nullptr; }
FORTE_EXPORT Voice *pipes_by_key(PipeEngine *e, int key) { return key >= 0 && key < 128 ? e->byKey[key] : nullptr; }
FORTE_EXPORT Pipe *pipes_voice_pipe(Voice *v, int r) { return &v->pipes[r]; }
// A voice's fields: 0 key, 1 fading, 2 dead, 3 down, 4 a, 5 aTarget, 6 kPal, 7 age, 8 env, 9 fade, 10 pg.
static double *voiceField(Voice *v, int which) {
  double *f[] = {nullptr, nullptr, nullptr, nullptr, &v->a, &v->aTarget, &v->kPal, &v->age, &v->env, &v->fade, &v->pg};
  return which >= 0 && which < 11 ? f[which] : nullptr;
}
FORTE_EXPORT double pipes_voice_get(Voice *v, int which) {
  switch (which) {
    case 0: return v->key;
    case 1: return v->fading;
    case 2: return v->dead;
    case 3: return v->down;
    default: { double *f = voiceField(v, which); return f ? *f : 0; }
  }
}
FORTE_EXPORT void pipes_voice_set(Voice *v, int which, double x) {
  if (which == 1) v->fading = x != 0;
  else if (which == 3) v->down = x != 0;
  else if (double *f = voiceField(v, which)) *f = x;
}
// A pipe's fields: 0 freq(), 1 foot, 2 vm, 3 qin, 4 bH, 5 y0, 6 ib, 7 asleep, 8 Uj, 9 eta, 10 dp,
// 11 nx, 12 os, 13 rank, 14 lp, 15 Q; and its modes' flows and displacements, in place.
static double *pipeField(Pipe *p, int which) {
  double *f[] = {nullptr, &p->foot, &p->vm, &p->qin, &p->bH, &p->y0, &p->ib, nullptr, &p->Uj, &p->eta, &p->dp, nullptr, nullptr, nullptr, &p->lp, &p->Q};
  return which >= 0 && which < 16 ? f[which] : nullptr;
}
FORTE_EXPORT double pipes_pipe_get(Pipe *p, int which) {
  switch (which) {
    case 0: return p->freq();
    case 7: return p->asleep;
    case 11: return p->nx;
    case 12: return p->os;
    case 13: return p->rank;
    default: { double *f = pipeField(p, which); return f ? *f : 0; }
  }
}
FORTE_EXPORT void pipes_pipe_set(Pipe *p, int which, double x) {
  if (which == 7) p->asleep = x != 0;
  else if (double *f = pipeField(p, which)) *f = x;
}
FORTE_EXPORT double *pipes_pipe_v(Pipe *p) { return p->v.data(); }
FORTE_EXPORT double *pipes_pipe_x(Pipe *p) { return p->x.data(); }
FORTE_EXPORT int pipes_pipe_modes(Pipe *p) { return p->n; }
}
