// template-web.cpp — the model's functions the page's views call (docs/template/src/template-wasm.js).

#include "forte/web.h"
#include "template-model.h"

using namespace forte::template_;

extern "C" {
// The modes of a key for parameters P: count, and f, sigma, amp for each in out.
FORTE_EXPORT int template_key_modes(int key, const double *P, double *out) {
  const KeyModes km = keyModes(key, P);
  for (int i = 0; i < km.count; i++) { out[3 * i] = km.m[i].f; out[3 * i + 1] = km.m[i].sigma; out[3 * i + 2] = km.m[i].amp; }
  return km.count;
}
FORTE_EXPORT double template_mode_shape(int n, double x) { return modeShape(n, x); }
FORTE_EXPORT double template_beta_l(int n) { return BETA_L[n]; }
FORTE_EXPORT int template_mode_count() { return (int)BETA_L.size(); }
}
