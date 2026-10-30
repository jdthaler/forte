// trautonium-web.cpp — the model's functions the page's views call, and the tests' hooks
// (trautonium/src/trautonium-wasm.js).

#include "forte/web.h"
#include "trautonium-engine.h"
#include "trautonium-model.h"

using namespace forte::trautonium;

extern "C" {
// the lamp's constants: V_s, V_e, C, and how many dividers and circuits
FORTE_EXPORT void trautonium_constants(double *out) {
  out[0] = V_STRIKE; out[1] = V_EXT; out[2] = CAP; out[3] = DIVIDERS; out[4] = FORMANTS;
}
FORTE_EXPORT double trautonium_periods(double supply) { return periods(supply); }
FORTE_EXPORT double trautonium_wire_r(double f, double supply) { return wireR(f, supply); }
FORTE_EXPORT double trautonium_window(double sync, double supply) { return window(sync, supply); }
FORTE_EXPORT int trautonium_lock_count(int n, double slack, double delta) { return lockCount(n, slack, delta); }
FORTE_EXPORT double trautonium_response(double f, const double *P) { return response(f, P); }

// The tests' hooks, on the engine of a handle (forte_engine): each pool slot's voice, as
// alive, held, key, p, f, f1, then per lamp (master first) firings, the pulse it fired on last
// and the time between its last two firings (samples).
FORTE_EXPORT int trautonium_pool() { return TrautoniumEngine::kPool; }
FORTE_EXPORT void trautonium_voice(TrautoniumEngine *e, int i, double *out) {
  const Voice &v = e->voices[i];
  out[0] = v.alive; out[1] = v.held; out[2] = v.key; out[3] = v.p; out[4] = v.f; out[5] = v.f1;
  for (int j = 0; j <= DIVIDERS; j++) {
    const Lamp &l = v.lamp[j];
    out[6 + 3 * j] = (double)l.nf; out[7 + 3 * j] = l.count; out[8 + 3 * j] = l.interval;
  }
}
}
