// cristal-web.cpp — the model's functions the page's views call (cristal/src/cristal-wasm.js), and
// the engine's test hooks (its voices, the rod's trace, the collector).

#include "cristal-engine.h"
#include "cristal-tuning.h"
#include "forte/web.h"

using namespace forte::cristal;

// a stem, flat: f0, len, weight, height, count, main, then f, zeta, tip, col for each mode
static void putStem(const Stem &s, double *out) {
  out[0] = s.f0; out[1] = s.len; out[2] = s.weight; out[3] = s.height; out[4] = s.count; out[5] = s.main;
  for (int i = 0; i < s.count; i++) {
    const Mode &m = s.modes[i];
    out[6 + 4 * i] = m.f; out[7 + 4 * i] = m.zeta; out[8 + 4 * i] = m.tip; out[9 + 4 * i] = m.col;
  }
}

extern "C" {
// A key's stem(key, P), flat (putStem), in out; ratio: the key's tuning (forte/tuning.h).
FORTE_EXPORT void cristal_stem(int key, double height, double loss, double ratio, double *out) {
  StemParams sp;
  sp.height = height; sp.loss = loss; sp.ratio = ratio;
  putStem(stem(key, sp), out);
}
// stemModes(len, h, w, ζ): the count, and f, zeta, tip, col of each in out
FORTE_EXPORT int cristal_stem_modes(double len, double h, double w, double zeta, double *out) {
  Mode m[MODES];
  const int n = stemModes(len, h, w, zeta, m, MODES);
  for (int i = 0; i < n; i++) { out[4 * i] = m[i].f; out[4 * i + 1] = m[i].zeta; out[4 * i + 2] = m[i].tip; out[4 * i + 3] = m[i].col; }
  return n;
}
// friction(wet): mus, mud, v0, noise
FORTE_EXPORT void cristal_friction(double wet, double *out) {
  const Friction f = friction(wet);
  out[0] = f.mus; out[1] = f.mud; out[2] = f.v0; out[3] = f.noise;
}
FORTE_EXPORT double cristal_mu(double u, double wet) { return mu(u, friction(wet)); }
// threshold and maxForce of one mode (f, zeta, tip) at finger speed uf
FORTE_EXPORT double cristal_threshold(double f, double zeta, double tip, double uf, double wet) { return threshold(Mode{f, zeta, tip, 0}, uf, friction(wet)); }
FORTE_EXPORT double cristal_max_force(double f, double zeta, double tip, double uf, double wet) { return maxForce(Mode{f, zeta, tip, 0}, uf, friction(wet)); }
FORTE_EXPORT double cristal_regulation(int key) { return regulation(key); }
FORTE_EXPORT double cristal_tuning_weight(int key) { return tuningWeight(key); }
// how many cents sharp a key's stem is cut (cristal-tuning.h)
FORTE_EXPORT double cristal_cut(int key) { return key >= KEY_MIN && key <= KEY_MAX ? CUT[key - KEY_MIN] : 0; }
FORTE_EXPORT double cristal_whisker_length(int i) { return whiskerLength(i); }
FORTE_EXPORT double cristal_whisker_stretch(int i, int n) { return whiskerStretch(i, n); }
FORTE_EXPORT double cristal_whisker_sway(int i) { return whiskerSway(i); }
// constants: KEY_LO, KEY_HI, MODES, ROD_L, ROD_D, ROD_M, STEM_D, STROKE, COLLECTOR_M, COLLECTOR_F, U_REF, WHISKERS, TRACE
FORTE_EXPORT void cristal_constants(double *out) {
  const double c[13] = {KEY_LO, KEY_HI, MODES, ROD_L, ROD_D, ROD_M, STEM_D, STROKE, COLLECTOR_M, COLLECTOR_F, U_REF, WHISKERS, TRACE};
  for (int i = 0; i < 13; i++) out[i] = c[i];
}

// The tests' hooks, on the engine of a handle (forte_engine): the voices, in order.
FORTE_EXPORT int cristal_voice_count(CristalEngine *e) { return e->count; }
// key, Nreg, Nn, touch, modes, uf, v, F, stick, phase, pos, peak
FORTE_EXPORT void cristal_voice_state(CristalEngine *e, int i, double *out) {
  const CristalEngine::Voice &v = *e->voices[i];
  const double s[12] = {(double)v.key, v.Nreg, v.Nn, (double)v.touch, (double)v.N, v.uf, v.v, v.F, (double)v.stick, (double)v.phase, v.pos, v.peak};
  for (int k = 0; k < 12; k++) out[k] = s[k];
}
FORTE_EXPORT void cristal_voice_stem(CristalEngine *e, int i, double *out) { putStem(e->voices[i]->s, out); }
FORTE_EXPORT bool cristal_ready(CristalEngine *e, int key) { return e->ready(key); }
// the focused rod's trace (0: its velocity, 1: the finger's; TRACE floats) and where it writes next
FORTE_EXPORT float *cristal_trace(CristalEngine *e, int which) { return which ? e->trU.data() : e->trV.data(); }
FORTE_EXPORT int cristal_trace_pos(CristalEngine *e) { return e->tw; }
// the collector's velocity at the end of the last block, and the whiskers' part of it
FORTE_EXPORT double cristal_collector(CristalEngine *e, int which) { return which ? e->whiskerOut : e->collector; }
}
