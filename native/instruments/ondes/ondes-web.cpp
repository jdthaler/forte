// ondes-web.cpp — the model's functions the page's views call, and the tests' hooks
// (ondes/src/ondes-wasm.js).

#include "forte/web.h"
#include "ondes-engine.h"
#include "ondes-model.h"

using namespace forte::ondes;

extern "C" {
FORTE_EXPORT double ondes_beat(double delta, double K) { return beat(delta, K); }
FORTE_EXPORT double ondes_trim(double f, double K) { return trimFor(f, K); }
FORTE_EXPORT double ondes_ratio(double delta, double K) { return harmonicRatio(delta, K); }
FORTE_EXPORT double ondes_level_db(double F) { return levelDb(F); }
FORTE_EXPORT double ondes_key_gain(double F) { return keyGain(F); }
FORTE_EXPORT double ondes_key_force(double v, double after) { return keyForce(v, after); }
FORTE_EXPORT double ondes_plate_equation(int m, double lam, double nu) { return plateEquation(m, lam, nu); }
FORTE_EXPORT int ondes_plate_count() { return (int)plateModes().size(); }
// mode i of the free plate: m, λ, and its shape at the coil
FORTE_EXPORT void ondes_plate_mode(int i, double *out) {
  const PlateMode &p = plateModes()[i];
  out[0] = p.m; out[1] = p.lam; out[2] = p.w;
}
FORTE_EXPORT double ondes_plate_hz(double diameter) { return plateHzPerLam2(diameter); }
FORTE_EXPORT double ondes_spring_omega(double k) { return springOmega(k); }
FORTE_EXPORT double ondes_spring_fc() { return springFc(); }
// the constants: F_SOFT, F_HARD, F_MAX, F_OPEN, SPRING_R, SPRING_r, BRASS_E, BRASS_RHO, GONG_H,
// BRONZE_E, BRONZE_RHO, BRONZE_NU, GONG_COIL, SPRINGS, PALME
FORTE_EXPORT void ondes_constants(double *out) {
  const double c[] = {F_SOFT, F_HARD, F_MAX, F_OPEN, SPRING_R, SPRING_r, BRASS_E, BRASS_RHO, GONG_H, BRONZE_E, BRONZE_RHO, BRONZE_NU, GONG_COIL, SPRINGS, PALME};
  for (int i = 0; i < (int)(sizeof c / sizeof *c); i++) out[i] = c[i];
}
FORTE_EXPORT double ondes_spring_length(int j) { return SPRING_L[j]; }

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT int ondes_pool() { return OndesEngine::kPool; }
// slot i: alive, held, key, F, gain, f, delta
FORTE_EXPORT void ondes_voice(OndesEngine *e, int i, double *out) {
  const Voice &v = e->voices[i];
  out[0] = v.alive; out[1] = v.held; out[2] = v.key; out[3] = v.F; out[4] = v.g1; out[5] = v.f; out[6] = v.delta;
}
// the diffuseurs' banks: the springs' and the tam-tam's modes, f (Hz) and decay σ (1/s) of mode k
FORTE_EXPORT int ondes_bank_size(OndesEngine *e, int which) { return which ? e->gong.n : e->springs.n; }
FORTE_EXPORT void ondes_bank_mode(OndesEngine *e, int which, int k, double *out) {
  const double fs = e->fs;
  const double pr = which ? e->gong.pr[k] : e->springs.pr[k], pi = which ? e->gong.pi[k] : e->springs.pi[k];
  const double r = std::sqrt(pr * pr + pi * pi);
  out[0] = std::atan2(pi, pr) * fs / (2 * PI); out[1] = -std::log(r) * fs;
}
FORTE_EXPORT double ondes_drift(OndesEngine *e) { return e->driftHz; }
}
