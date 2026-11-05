// marimba-web.cpp — the model's functions the page's views and the tools call
// (marimba/src/marimba-wasm.js), and the engine's test hooks (its voices, in order and by key).

#include <algorithm>
#include <memory>

#include "forte/web.h"
#include "marimba-engine.h"

using namespace forte::marimba;

// The views ask for the same bar again and again: keep the last one.
// ratio: the key's tuning (forte/tuning.h), 1 in equal temperament at A = 440 Hz.
static const BarModel &cachedBar(int kind, int key, double depth, double ratio) {
  static std::unique_ptr<BarModel> bar;
  static int lastKind = -1, lastKey = -1;
  static double lastDepth = 0, lastRatio = 0;
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  if (!bar || kind != lastKind || key != lastKey || depth != lastDepth || ratio != lastRatio) {
    bar = std::make_unique<BarModel>(barModel(kind, key, depth, ratio));
    lastKind = kind; lastKey = key; lastDepth = depth; lastRatio = ratio;
  }
  return *bar;
}

extern "C" {
// One bar (barModel) into out, returning how many numbers it wrote: key, L, b, h0, cf, A, D,
// depth, the cut (h0, a, c, d), mass, hmin, nx, the number of modes, the number of cords; the
// cords' places; xs; then per mode: torsion?, n, f, ratio, sym, sigSup, sigRad, out, and its shape.
FORTE_EXPORT int marimba_bar_model(int kind, int key, double depth, double ratio, double *out) {
  const BarModel &B = cachedBar(kind, key, depth, ratio);
  const Geometry &g = B.geom;
  int n = 0;
  for (double v : {(double)B.key, g.L, g.b, g.h0, g.cf, g.A, g.D, g.depth, g.cut.h0, g.cut.a, g.cut.c, g.cut.d, B.mass, B.hmin,
                   (double)B.xs.size(), (double)B.modes.size(), (double)B.nodes.size()}) out[n++] = v;
  for (double x : B.nodes) out[n++] = x;
  for (double x : B.xs) out[n++] = x;
  for (const Mode &m : B.modes) {
    for (double v : {m.tors ? 1.0 : 0.0, (double)m.n, m.f, m.ratio, m.sym ? 1.0 : 0.0, m.sigSup, m.sigRad, m.out}) out[n++] = v;
    for (double w : m.w) out[n++] = w;
  }
  return n;
}
// The tube under that bar for a gap (m), detune (¢) and mouth offset (× L): its bore a, length,
// le, ma, mg, then for each of its two resonances Ka, R, ft (bar held), the bar mode's S_b and the
// pair's M11, M12, M22, κ: 5 + 2 × 8 numbers.
FORTE_EXPORT void marimba_tube(int kind, int key, double depth, double ratio, double gap, double detune, double offset, double *out) {
  const BarModel &B = cachedBar(kind, key, depth, ratio);
  const double a = tubeRadius(kind, B.key);
  const TubeState ts = tubeState(a, B.geom.b, B.modes[0].f, gap, detune);
  int n = 0;
  for (double v : {a, ts.length, ts.le, ts.ma, ts.mg}) out[n++] = v;
  for (int m = 0; m < 2; m++) {
    const int nx = (int)B.xs.size();
    const double Sb = std::fabs(mouthVolume(B.modes[m].w.data(), nx, B.geom.L, B.geom.b, a, offset));
    const TubePair p = pairOf(ts, Sb);
    for (double v : {ts.Ka[m], ts.R[m], ts.ft[m], Sb, p.M11, p.M12, p.M22, p.kappa}) out[n++] = v;
  }
}
FORTE_EXPORT double marimba_thickness(double h0, double a, double c, double d, double X) { return forte::vibraphone::thickness({h0, a, c, d}, X); }
// malletOf: m, K, p, alpha
FORTE_EXPORT void marimba_mallet(double hardness, double mass, double *out) {
  const Mallet m = malletOf(hardness, mass);
  out[0] = m.m; out[1] = m.K; out[2] = m.p; out[3] = m.alpha;
}
// The blank (b, h0, cf, A) and the layout (accidental, x, pan left, pan right) of a key.
FORTE_EXPORT void marimba_blank(int kind, int key, double *out) {
  const Blank b = barBlank(kind, key);
  const Layout l = barLayout(kind, key);
  const auto pan = barPan(kind, key);
  const double v[8] = {b.b, b.h0, b.cf, b.A, l.accidental ? 1.0 : 0.0, l.x, pan[0], pan[1]};
  for (int i = 0; i < 8; i++) out[i] = v[i];
}
// The tuning of one bar, from start {A, D, L} (tools/marimba-bars.mjs): L, A, D, the residuals
// (cents: mode 2's ratio, mode 3's, mode 1's pitch) and the iterations.
FORTE_EXPORT void marimba_tune(int kind, int key, double A, double D, double L, double *out) {
  const Tuned t = tuneBar(kind, key, {A, D, L});
  const double v[7] = {t.L, t.A, t.D, t.cents[0], t.cents[1], t.cents[2], (double)t.iterations};
  for (int i = 0; i < 7; i++) out[i] = v[i];
}

// A key's bar for the parameters P (its instrument, undercut depth and the tuning, as the engine
// reads them), its voice data packed (packVoiceData) into out, returning how many numbers: what
// the page sends with a note (noteData), and its engine takes (marimba_offer).
FORTE_EXPORT int marimba_voice_data(int key, const double *P, double *out) {
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  return packVoiceData(voiceData((int)P[p::kind], key, P[p::depth], tuningOf(P).ratio(key)), out);
}
FORTE_EXPORT int marimba_offer(MarimbaEngine *e, const double *packed, int n) { return e->offer(packed, n); }

// The tests' hooks, on the engine of a handle (forte_engine): its voices in order, and each one's
// key, fading, dead, held, Eb, Et, E, lastContactMs, Fmax, age, whether it is its key's (byKey),
// malletOn, the two pairs' κ, and the strokes since its key went down.
FORTE_EXPORT int marimba_voices(MarimbaEngine *e) { return e->nVoices; }
FORTE_EXPORT void marimba_voice(MarimbaEngine *e, int i, double *out) {
  const MarimbaEngine::Voice &v = *e->voices[i];
  const double x[15] = {(double)v.key, (double)v.fading, (double)v.dead, (double)v.held, v.Eb, v.Et, v.E, v.lastContactMs, v.Fmax, v.age,
                        (double)(e->byKey[v.key] == &v), (double)v.malletOn, v.pair[0].kappa, v.pair[1].kappa, (double)v.strokes};
  for (int k = 0; k < 15; k++) out[k] = x[k];
}
}
