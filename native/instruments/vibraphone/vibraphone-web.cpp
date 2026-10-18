// vibraphone-web.cpp — the model's functions the page's views call (vibraphone/src/vibraphone-wasm.js),
// and the engine's test hooks (its voices, in order and by key).

#include <algorithm>
#include <memory>

#include "vibraphone-engine.h"
#include "forte/web.h"

using namespace forte::vibraphone;

// The views ask for the same bar again and again (its model, then its tube): keep the last one.
static const BarModel &cachedBar(int key, double depth) {
  static std::unique_ptr<BarModel> bar;
  static int lastKey = -1;
  static double lastDepth = 0;
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  if (!bar || key != lastKey || depth != lastDepth) {
    bar = std::make_unique<BarModel>(barModel(key, depth));
    lastKey = key; lastDepth = depth;
  }
  return *bar;
}

static TubeState stateOf(const double *t) {
  TubeState s;
  double *f[] = {&s.length, &s.le, &s.ma, &s.Ka, &s.mg, &s.Sb, &s.Rrad, &s.Rwall, &s.R, &s.lvS, &s.cd, &s.M11, &s.M12, &s.M22};
  for (int i = 0; i < 14; i++) *f[i] = t[i];
  return s;
}

extern "C" {
// One bar (barModel) into out, returning how many numbers it wrote: key, L, b,
// h0, cf, A, D, depth, the cut (h0, a, c, d), mass, hmin, nx, the number of modes, the number of
// cords; the cords' places; xs; then per mode: torsion?, n, f, ratio, sym, sigTE, sigSup, sigRad,
// out, and its shape at xs.
FORTE_EXPORT int vibraphone_bar_model(int key, double depth, double *out) {
  const BarModel &B = cachedBar(key, depth);
  const Geometry &g = B.geom;
  int n = 0;
  for (double v : {(double)B.key, g.L, g.b, g.h0, g.cf, g.A, g.D, g.depth, g.cut.h0, g.cut.a, g.cut.c, g.cut.d, B.mass, B.hmin,
                   (double)B.xs.size(), (double)B.modes.size(), (double)B.nodes.size()}) out[n++] = v;
  for (double x : B.nodes) out[n++] = x;
  for (double x : B.xs) out[n++] = x;
  for (const Mode &m : B.modes) {
    for (double v : {m.tors ? 1.0 : 0.0, (double)m.n, m.f, m.ratio, m.sym ? 1.0 : 0.0, m.sigTE, m.sigSup, m.sigRad, m.out}) out[n++] = v;
    for (double w : m.w) out[n++] = w;
  }
  return n;
}
// The tube under that bar (tubeGeometry): a, S, Sb, Rb, delta0, lv.
FORTE_EXPORT void vibraphone_tube_geometry(int key, double depth, double *out) {
  const BarModel &B = cachedBar(key, depth);
  const TubeGeometry t = tubeGeometry(B.key, B);
  const double v[6] = {t.a, t.S, t.Sb, t.Rb, t.delta0, t.lv};
  for (int i = 0; i < 6; i++) out[i] = v[i];
}
// tubeState: in = the tube's geometry (6), f1, gap (m), detune, temp, cd; out = length, le, ma, Ka,
// mg, Sb, Rrad, Rwall, R, lvS, cd, M11, M12, M22.
FORTE_EXPORT void vibraphone_tube_state(const double *in, double *out) {
  const TubeGeometry tg{in[0], in[1], in[2], in[3], in[4], in[5]};
  const TubeState s = tubeState(tg, in[6], in[7], in[8], in[9], in[10]);
  const double v[14] = {s.length, s.le, s.ma, s.Ka, s.mg, s.Sb, s.Rrad, s.Rwall, s.R, s.lvS, s.cd, s.M11, s.M12, s.M22};
  for (int i = 0; i < 14; i++) out[i] = v[i];
}
// coupling: ts as tubeState writes it; out = kappa, ft, fb, m22.
FORTE_EXPORT void vibraphone_coupling(const double *ts, double theta, double fb, double *out) {
  const Coupling c = coupling(stateOf(ts), theta, fb);
  out[0] = c.kappa; out[1] = c.ft; out[2] = c.fb; out[3] = c.m22;
}
FORTE_EXPORT double vibraphone_thickness(double h0, double a, double c, double d, double X) { return thickness({h0, a, c, d}, X); }
FORTE_EXPORT double vibraphone_bar_temp_scale(double temp) { return barTempScale(temp); }
// malletOf: m, K, p, alpha
FORTE_EXPORT void vibraphone_mallet(double hardness, double mass, double *out) {
  const Mallet m = malletOf(hardness, mass);
  out[0] = m.m; out[1] = m.K; out[2] = m.p; out[3] = m.alpha;
}

// A bar's voice data, packed (packVoiceData) into out, returning how many numbers: what the page
// sends with a note (noteData), and its engine takes (vibraphone_offer).
FORTE_EXPORT int vibraphone_voice_data(int key, double depth, double *out) {
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  return packVoiceData(voiceData(key, depth), out);
}
FORTE_EXPORT int vibraphone_offer(VibraphoneEngine *e, const double *packed, int n) { return e->offer(packed, n); }

// The tests' hooks, on the engine of a handle (forte_engine): its voices in order, and each one's
// key, fading, dead, released, Eb, Et, E, lastContactMs, Fmax, age, whether it is its key's
// (byKey), malletOn.
FORTE_EXPORT int vibraphone_voices(VibraphoneEngine *e) { return e->nVoices; }
FORTE_EXPORT void vibraphone_voice(VibraphoneEngine *e, int i, double *out) {
  const VibraphoneEngine::Voice &v = *e->voices[i];
  const double x[12] = {(double)v.key, (double)v.fading, (double)v.dead, (double)v.released, v.Eb, v.Et, v.E, v.lastContactMs, v.Fmax, v.age,
                        (double)(e->byKey[v.key] == &v), (double)v.malletOn};
  for (int k = 0; k < 12; k++) out[k] = x[k];
}
}
