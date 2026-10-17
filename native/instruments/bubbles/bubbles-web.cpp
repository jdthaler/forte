// bubbles-web.cpp — the model's functions the page's views call (bubbles/src/bubbles-wasm.js),
// and the engine's test hooks (the JavaScript engine's constructor options, log, pool and nozzles).

#include "bubbles-engine.h"
#include "forte/dsp.h"
#include "forte/web.h"

using namespace forte::bubbles;

static Env envOf(double p0, double d, int liquid, int gas) {
  Env env;
  env.p0 = p0; env.d = d; env.liq = &LIQUIDS[liquid]; env.gas = &GASES[gas];
  return env;
}

extern "C" {
// One bubble's acoustics (bubbles-model.js, acoustics) at liquid pressure p0, depth d, with the
// liquid's and the gas's indices: omega0, b, omegaD, f0, fd, delta, dvis, dth, drad, kappa,
// phiRe, phiIm, chi, D, pb, m, radFactor, R in out.
FORTE_EXPORT void bubbles_acoustics(double R, double p0, double d, int liquid, int gas, double *out) {
  const Acoustics a = acoustics(R, envOf(p0, d, liquid, gas));
  const double v[18] = {a.omega0, a.b, a.omegaD, a.f0, a.fd, a.delta, a.dvis, a.dth, a.drad, a.kappa, a.phiRe, a.phiIm, a.chi, a.D, a.pb, a.m, a.radFactor, a.R};
  for (int i = 0; i < 18; i++) out[i] = v[i];
}
// Each key's radius for parameters P (indexed as in bubbles-params.h), A3–C8, in out.
FORTE_EXPORT void bubbles_key_radii(const double *P, double *out) {
  const Env env = nozzleEnv(P), def = defaultEnv();
  for (int k = KEY_LO; k <= KEY_HI; k++) out[k - KEY_LO] = tuneRadius(forte::keyFreq(k), P[p::keepInTune] ? env : def);
}
FORTE_EXPORT double bubbles_ambient(const double *P) { return nozzleEnv(P).p0; }
FORTE_EXPORT double bubbles_rise_distance(double t, double U) { return riseDistance(t, U); }
FORTE_EXPORT double bubbles_rise_speed(double R, int liquid) { return riseSpeed(R, LIQUIDS[liquid]); }
FORTE_EXPORT double bubbles_peak_pressure(int liquid, double velocity) { return peakPressure(LIQUIDS[liquid], velocity); }
FORTE_EXPORT double bubbles_snap_gain(double f, double tau) { return snapGain(f, tau); }

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void bubbles_configure(BubbleEngine *e, unsigned seed, int pool, int soft) { e->configure(seed, pool, soft); }
FORTE_EXPORT void bubbles_log(BubbleEngine *e, int on) { e->logging = on != 0; e->log.clear(); }
FORTE_EXPORT int bubbles_log_count(BubbleEngine *e) { return (int)e->log.size(); }
// key, frame, R, vel, first
FORTE_EXPORT void bubbles_log_entry(BubbleEngine *e, int i, double *out) {
  const BubbleEngine::LogEntry &r = e->log[i];
  out[0] = r.key; out[1] = (double)r.frame; out[2] = r.R; out[3] = r.vel; out[4] = r.first;
}
FORTE_EXPORT int bubbles_pool_size(BubbleEngine *e) { return (int)e->pool.size(); }
// on, fadeStep, age (samples), fade
FORTE_EXPORT void bubbles_pool_bubble(BubbleEngine *e, int i, double *out) {
  const BubbleEngine::Bubble &b = e->pool[i];
  out[0] = b.on; out[1] = b.fadeStep; out[2] = b.age; out[3] = b.fade;
}
FORTE_EXPORT int bubbles_nozzle_held(BubbleEngine *e, int i) { return e->nozzles[i].held; }
}
