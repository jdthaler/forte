// bubbles-web.cpp — the model's functions the page's views call (bubbles/src/bubbles-wasm.js),
// and for the tests: a bubble in a liquid and gas of their own, its glide as the engine rings it,
// and the engine's hooks (the seed, pool size and soft limit, the log, pool and nozzles).

#include "bubbles-engine.h"
#include "forte/dsp.h"
#include "forte/web.h"

using namespace forte::bubbles;

static Env envOf(double p0, double d, int liquid, int gas) {
  Env env;
  env.p0 = p0; env.d = d; env.liq = &LIQUIDS[liquid]; env.gas = &GASES[gas];
  return env;
}

static void put(const Acoustics &a, double *out) {
  const double v[18] = {a.omega0, a.b, a.omegaD, a.f0, a.fd, a.delta, a.dvis, a.dth, a.drad, a.kappa, a.phiRe, a.phiIm, a.chi, a.D, a.pb, a.m, a.radFactor, a.R};
  for (int i = 0; i < 18; i++) out[i] = v[i];
}

extern "C" {
// One bubble's acoustics (acoustics) at liquid pressure p0, depth d, with the
// liquid's and the gas's indices: omega0, b, omegaD, f0, fd, delta, dvis, dth, drad, kappa,
// phiRe, phiIm, chi, D, pb, m, radFactor, R in out.
FORTE_EXPORT void bubbles_acoustics(double R, double p0, double d, int liquid, int gas, double *out) {
  put(acoustics(R, envOf(p0, d, liquid, gas)), out);
}
// The same in a liquid and a gas of the test's own: in = rho, mu, sigma, c, gamma, M, K, cp.
FORTE_EXPORT void bubbles_acoustics_custom(double R, double p0, double d, const double *in, double *out) {
  const Liquid liq = {"custom", in[0], in[1], in[2], in[3]};
  const Gas gas = {"custom", in[4], in[5], in[6], in[7]};
  Env env;
  env.p0 = p0; env.d = d; env.liq = &liq; env.gas = &gas;
  put(acoustics(R, env), out);
}
// The glide (glideRing), as the engine rings a bubble of radius R0 released at liquid pressure p0
// and depth d0: its ring n times t[i] seconds later with the air above the liquid at pT[i]
// (the bubble rises as riseDistance says; Φ and the swelling's exponent are the release's). Into
// out: fd (Hz), then b (s⁻¹), n each.
FORTE_EXPORT void bubbles_glide(double R0, double p0, double d0, int liquid, int gas, int n, const double *t, const double *pT, double *out) {
  const Env env = envOf(p0, d0, liquid, gas);
  const Acoustics a = acoustics(R0, env);
  const double U = riseSpeed(R0, *env.liq), nSlow = slowExponent(R0, *env.gas, a.pb);
  for (int i = 0; i < n; i++) {
    double R;
    const Acoustics g = glideRing(R0, a.pb, nSlow, {a.phiRe, a.phiIm}, *env.liq, *env.gas, d0 - riseDistance(t[i], U), pT[i], R);
    out[i] = g.fd; out[n + i] = g.b;
  }
}
// Each key's radius for parameters P (indexed as in bubbles-params.h), A3–C8, in out.
FORTE_EXPORT void bubbles_key_radii(const double *P, double *out) {
  const Env env = nozzleEnv(P), def = defaultEnv();
  const forte::Tuning t = tuningOf(P);
  for (int k = KEY_LO; k <= KEY_HI; k++) out[k - KEY_LO] = tuneRadius(forte::keyFreq(k) * t.ratio(k), P[p::keepInTune] ? env : def);
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
