// huygens-web.cpp — the model's functions the page's views call (huygens/src/huygens-wasm.js),
// and the engine's hooks: the note data the page sends with a note ({ f, phase, settled }),
// 'retune', the oscillators, report(), and the page's state (firings, summary).

#include "huygens-engine.h"
#include "forte/web.h"

using namespace forte::huygens;

extern "C" {
// a key's design frequency, and δ
FORTE_EXPORT double huygens_tuned_freq(int key, int tuning, int tonic, double mistune) { return tunedFreq(key, tuning, tonic, mistune); }
FORTE_EXPORT double huygens_delta(double kick, double vNom, double vStrike, double vExt) { return deltaOf(kick, vNom, vStrike, vExt); }
// p, q in out; 0 if no shared firing comes within maxFirings
FORTE_EXPORT int huygens_lock_ratio(double r, double delta, int maxFirings, double *out) {
  Lock l;
  if (!lockRatio(r, delta, l, maxFirings)) return 0;
  out[0] = l.p; out[1] = l.q;
  return 1;
}

// The hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void huygens_offer(NeonEngine *e, double f, double phase, int settled) { e->offer(f, phase, settled != 0); }
FORTE_EXPORT void huygens_retune(NeonEngine *e, int key, double f) { e->retune(key, f); }
FORTE_EXPORT void huygens_listen(NeonEngine *e, int on) { e->listening = on != 0; }
FORTE_EXPORT double huygens_time(NeonEngine *e) { return (double)e->t; }
FORTE_EXPORT double huygens_hold(NeonEngine *e) { return e->hold; }
FORTE_EXPORT Osc *huygens_last(NeonEngine *e) { return e->last; }
FORTE_EXPORT int huygens_osc_count(NeonEngine *e) { return e->nos; }
FORTE_EXPORT Osc *huygens_osc_at(NeonEngine *e, int i) { return e->osc[i]; }
// key, nf, fTarget, panL, panR, keyDown, dead, gate, power, driftCents, V, sent
FORTE_EXPORT void huygens_osc(Osc *o, double *out) {
  const double v[12] = {(double)o->key, (double)o->nf, o->fTarget, o->panL, o->panR, (double)o->keyDown, (double)o->dead, o->gate, o->power, o->driftCents, o->V, (double)o->sent};
  for (int i = 0; i < 12; i++) out[i] = v[i];
}
FORTE_EXPORT double *huygens_osc_fires(Osc *o) { return o->fires; }
// key, f, fTarget, drift per oscillator in out (at most cap); returns how many
FORTE_EXPORT int huygens_report(NeonEngine *e, double win, double *out, int cap) {
  NeonEngine::Report r[NeonEngine::kPool];
  const int n = e->report(win, r, cap < NeonEngine::kPool ? cap : NeonEngine::kPool);
  for (int i = 0; i < n; i++) { out[4 * i] = r[i].key; out[4 * i + 1] = r[i].f; out[4 * i + 2] = r[i].fTarget; out[4 * i + 3] = r[i].drift; }
  return n;
}
// drainFirings and summary into the engine's own buffers (huygens_fire_buf, huygens_osc_buf)
FORTE_EXPORT int huygens_drain(NeonEngine *e, int cap) { return e->drainFirings(e->fireBuf, cap < NeonEngine::kFireBuf ? cap : NeonEngine::kFireBuf); }
FORTE_EXPORT int huygens_summary(NeonEngine *e, int cap) { return e->summary(e->oscBuf, cap < NeonEngine::kOscBuf ? cap : NeonEngine::kOscBuf); }
FORTE_EXPORT double *huygens_fire_buf(NeonEngine *e) { return e->fireBuf; }
FORTE_EXPORT double *huygens_osc_buf(NeonEngine *e) { return e->oscBuf; }
// the state the engine drained for the page when it posted msg::state: firings and summary
// lengths, the time and the servo's correction then
FORTE_EXPORT void huygens_state(NeonEngine *e, double *out) { out[0] = e->stateFires; out[1] = e->stateOsc; out[2] = (double)e->stateT; out[3] = e->stateHold; }
}
