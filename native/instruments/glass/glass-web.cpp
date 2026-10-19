// glass-web.cpp — the model's functions the page's views call (glass/src/glass-wasm.js), and the
// engine's test hooks (its voices and contact trace).

#include "glass-engine.h"
#include "forte/web.h"

using namespace forte::glass;

static constexpr int MODE_FIELDS = 11;
// a bowl, flat: a, h, f0, mass, the number of families, then n, f, fEmpty, load, f1, f2, sigma,
// M, bryan, rad, psi for each
static void putBowl(const Bowl &b, double *out) {
  out[0] = b.a; out[1] = b.h; out[2] = b.f0; out[3] = b.mass; out[4] = b.count;
  for (int i = 0; i < b.count; i++) {
    const Mode &m = b.modes[i];
    const double v[MODE_FIELDS] = {(double)m.n, m.f, m.fEmpty, m.load, m.f1, m.f2, m.sigma, m.M, m.bryan, m.rad, m.psi};
    for (int k = 0; k < MODE_FIELDS; k++) out[5 + MODE_FIELDS * i + k] = v[k];
  }
}

extern "C" {
// A key's bowl(key, P), flat (putBowl), in out; ratio: the key's tuning (forte/tuning.h).
FORTE_EXPORT void glass_bowl(int key, double split, double loss, double water, double ratio, double *out) {
  BowlParams bp;
  bp.split = split; bp.loss = loss; bp.water = water; bp.ratio = ratio;
  putBowl(bowl(key, bp), out);
}
// speakingThreshold(key, P): the normal force (N) at which the bowl starts to speak.
FORTE_EXPORT double glass_speaking_threshold(int key, double wet, double v0, double rough, double speed, double split, double loss, double water, double ratio) {
  BowlParams bp;
  bp.split = split; bp.loss = loss; bp.water = water; bp.ratio = ratio;
  TouchParams tp;
  tp.wet = wet; tp.v0 = v0; tp.rough = rough; tp.speed = speed;
  return speakingThreshold(key, tp, bowl(key, bp));
}
FORTE_EXPORT double glass_regulation(int key) { return regulation(key); }
// freeLines(m, rot) for family n: f, w of each of the four lines, in out.
FORTE_EXPORT void glass_free_lines(int n, double bryan, double f1, double f2, double rot, double *out) {
  Mode m{};
  m.n = n; m.bryan = bryan; m.f1 = f1; m.f2 = f2;
  Line lines[4];
  freeLines(m, rot, lines);
  for (int i = 0; i < 4; i++) { out[2 * i] = lines[i].f; out[2 * i + 1] = lines[i].w; }
}
FORTE_EXPORT double glass_ring_ratio(int n) { return ringRatio(n); }
FORTE_EXPORT double glass_rim_speed(int key, double speed) { return rimSpeed(key, speed); }
FORTE_EXPORT double glass_transport(int n, double bryan, double rot) { Mode m{}; m.n = n; m.bryan = bryan; return transport(m, rot); }

// The tests' hooks, on the engine of a handle (forte_engine): the voices, in order.
FORTE_EXPORT int glass_voice_count(ArmonicaEngine *e) { return e->count; }
// key, Nreg, Nn, touch, the number of families
FORTE_EXPORT void glass_voice_state(ArmonicaEngine *e, int i, double *out) {
  const ArmonicaEngine::Voice &v = *e->voices[i];
  out[0] = v.key; out[1] = v.Nreg; out[2] = v.Nn; out[3] = v.touch; out[4] = v.N;
}
FORTE_EXPORT void glass_voice_set_nn(ArmonicaEngine *e, int i, double Nn) { e->voices[i]->Nn = Nn; }
// the voice's modal state: 0 qc, 1 qc1, 2 qs, 3 qs1 (MODES doubles each)
FORTE_EXPORT double *glass_voice_q(ArmonicaEngine *e, int i, int which) {
  ArmonicaEngine::Voice &v = *e->voices[i];
  return which == 0 ? v.qc.data() : which == 1 ? v.qc1.data() : which == 2 ? v.qs.data() : v.qs1.data();
}
FORTE_EXPORT void glass_voice_bowl(ArmonicaEngine *e, int i, double *out) { putBowl(e->voices[i]->b, out); }
// the focused bowl's contact trace (0: slip speed, 1: friction force; TRACE floats) and where it writes next
FORTE_EXPORT float *glass_trace(ArmonicaEngine *e, int which) { return which ? e->trF.data() : e->trS.data(); }
FORTE_EXPORT int glass_trace_pos(ArmonicaEngine *e) { return e->tw; }
}
