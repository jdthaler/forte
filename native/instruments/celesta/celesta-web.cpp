// celesta-web.cpp — the model's functions the page's views call (celesta/src/celesta-wasm.js),
// and the engine's test hooks (its voices, in order and by key).

#include <algorithm>

#include "celesta-engine.h"
#include "forte/web.h"

using namespace forte::celesta;

// The views ask for the same bar again and again: keep the last one.
// ratio: the key's tuning (forte/tuning.h), 1 in equal temperament at A = 440 Hz.
static const Bar &cachedBar(int key, double thick, double ratio) {
  static Bar bar;
  static int lastKey = -1;
  static double lastThick = 0, lastRatio = 0;
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  if (key != lastKey || thick != lastThick || ratio != lastRatio) { buildBar(key, thick, bar, ratio); lastKey = key; lastThick = thick; lastRatio = ratio; }
  return bar;
}

extern "C" {
// One bar (buildBar, cut for the key's tuning ratio) into out, returning how many numbers it wrote: key, L, b, h, mass, the
// number of modes, NX, the two nodes, the box (w, l, S, Sb, Rb, delta0, perim), the pan (2); then
// per mode: torsion?, f, ratio, sigTE, sigSup, sigRad, out, dampW, and its shape at NX points.
FORTE_EXPORT int celesta_bar(int key, double thick, double ratio, double *out) {
  const Bar &B = cachedBar(key, thick, ratio);
  const Geometry &g = B.geom;
  const Box &x = B.box;
  int n = 0;
  for (double v : {(double)g.key, g.L, g.b, g.h, g.mass, (double)B.count, (double)NX, B.nodes[0], B.nodes[1],
                   x.w, x.l, x.S, x.Sb, x.Rb, x.delta0, x.perim, B.pan[0], B.pan[1]}) out[n++] = v;
  for (int i = 0; i < B.count; i++) {
    for (double v : {B.tors[i] ? 1.0 : 0.0, B.f[i], B.ratio[i], B.sigTE[i], B.sigSup[i], B.sigRad[i], B.out[i], B.dampW[i]}) out[n++] = v;
    for (double w : B.w[i]) out[n++] = w;
  }
  return n;
}
// The box under a bar for the knobs (boxState): depth, le, ma, Ka, mg, Rrad, Rwall, R, M11, M12, M22.
FORTE_EXPORT void celesta_box_state(int key, double thick, double ratio, double gap, double detune, double *out) {
  const Bar &B = cachedBar(key, thick, ratio);
  const BoxState s = boxState(B.box, B.f[0], gap, detune);
  const double v[11] = {s.depth, s.le, s.ma, s.Ka, s.mg, s.Rrad, s.Rwall, s.R, s.M11, s.M12, s.M22};
  for (int i = 0; i < 11; i++) out[i] = v[i];
}
FORTE_EXPORT double celesta_timoshenko_det(double omega, double L, double b, double h) { return timoshenkoDet(omega, L, b, h); }
FORTE_EXPORT int celesta_timoshenko_freqs(double L, double b, double h, int n, double *out) { return timoshenkoFreqs(L, b, h, n, out); }
FORTE_EXPORT double celesta_euler_freq(double L, double b, double h, int n) { return eulerFreq(L, b, h, n); }
FORTE_EXPORT double celesta_torsion_freq(double L, double b, double h, int n) { return torsionFreq(L, b, h, n); }
FORTE_EXPORT double celesta_torsion_j(double b, double h) { return torsionJ(b, h); }
FORTE_EXPORT double celesta_zener(double h, double f) { return zener(h, f); }
FORTE_EXPORT double celesta_beta_l(int n) { return BETA_L[n]; }
// The constants the tests check against: E, rho, nu, kappa, G.
FORTE_EXPORT void celesta_steel(double *out) { out[0] = STEEL.E; out[1] = STEEL.rho; out[2] = STEEL.nu; out[3] = KAPPA; out[4] = G_STEEL; }
FORTE_EXPORT void celesta_two_oscillator(double fb, double ft, double kappa, double *out) {
  const auto f = twoOscillator(fb, ft, kappa);
  out[0] = f[0]; out[1] = f[1];
}
// hammerOf: m, K, p, alpha
FORTE_EXPORT void celesta_hammer(int key, double hardness, double mass, double *out) {
  const Hammer h = hammerOf(key, hardness, mass);
  out[0] = h.m; out[1] = h.K; out[2] = h.p; out[3] = h.alpha;
}

// The tests' hooks, on the engine of a handle (forte_engine): its voices in order, and each one's
// key, fading, dead, released, Eb, Et, E, lastContactMs, Fmax, age, whether it is its key's
// (byKey), hammerOn, damp.
FORTE_EXPORT int celesta_voices(CelestaEngine *e) { return e->nVoices; }
FORTE_EXPORT void celesta_voice(CelestaEngine *e, int i, double *out) {
  const CelestaEngine::Voice &v = *e->voices[i];
  const double x[13] = {(double)v.key, (double)v.fading, (double)v.dead, (double)v.released, v.Eb, v.Et, v.E, v.lastContactMs, v.Fmax, v.age,
                        (double)(e->byKey[v.key] == &v), (double)v.hammerOn, v.damp};
  for (int k = 0; k < 13; k++) out[k] = x[k];
}
}
