// birdsong-web.cpp — the model's functions the page's views call, and the tests' hooks
// (birdsong/src/birdsong-wasm.js).

#include "forte/web.h"
#include "birdsong-engine.h"
#include "birdsong-model.h"

using namespace forte::birdsong;

extern "C" {
// the model's constants: α at rest, c, the longest step, the harmonics a cycle reports, the trail
FORTE_EXPORT void birdsong_constants(double *out) {
  out[0] = ALPHA_REST; out[1] = C_AIR; out[2] = H_MAX; out[3] = HARMONICS; out[4] = TRAIL;
}
FORTE_EXPORT double birdsong_onset(double beta) { return onset(beta); }
FORTE_EXPORT double birdsong_rest_x(double alpha, double beta) { return restX(alpha, beta); }
FORTE_EXPORT int birdsong_fixed_points(double alpha, double beta, double *out) { return fixedPoints(alpha, beta, out); }
// the limit cycle at (α, β): ok, Ω, xmin, xmax, vmin, vmax, then |cₖ| for k = 1..HARMONICS
FORTE_EXPORT void birdsong_cycle(double alpha, double beta, double *out) {
  const Cycle c = limitCycle(alpha, beta);
  out[0] = c.ok; out[1] = c.omega; out[2] = c.xmin; out[3] = c.xmax; out[4] = c.vmin; out[5] = c.vmax;
  for (int k = 0; k < HARMONICS; k++) out[6 + k] = c.c[k];
}
FORTE_EXPORT int birdsong_cycle_points(double alpha, double beta, double *xv, int n) { return cyclePoints(alpha, beta, xv, n); }
FORTE_EXPORT double birdsong_trachea_gain(double f, double L, double r) { return tracheaGain(f, L, r); }
FORTE_EXPORT double birdsong_oec_gain(double f, double fo, double Q) { return oecGain(f, fo, Q); }
// one RK4 step from (x, v) at (α, β), for the tests: out = (x, v) after it
FORTE_EXPORT void birdsong_rk4(double x, double v, double alpha, double beta, double h, double *out) {
  State s{x, v};
  rk4(s, alpha, beta, h);
  out[0] = s.x; out[1] = s.v;
}

// The tests' hooks, on the engine of a handle (forte_engine): each pool slot's voice, as
// alive, held, key, env, e, α, β, d, Ω, γ, fNote, fSung, fo, voicing, sub, x, v
FORTE_EXPORT int birdsong_pool() { return BirdsongEngine::kPool; }
FORTE_EXPORT void birdsong_voice(BirdsongEngine *e, int i, double *out) {
  const Voice &v = e->voices[i];
  const double a[] = {(double)v.alive, (double)v.held, (double)v.key, v.env, v.e, v.alpha, v.beta, v.d, v.omega, v.gamma, v.fNote, v.fSung, v.fo, v.voicing, (double)v.sub, v.s.x, v.s.v};
  for (int j = 0; j < (int)(sizeof a / sizeof a[0]); j++) out[j] = a[j];
}
}
