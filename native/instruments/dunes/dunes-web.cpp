// dunes-web.cpp — the model's functions the page's views call, and the tests' hooks
// (dunes/src/dunes-wasm.js).

#include "forte/web.h"
#include "dunes-engine.h"
#include "dunes-model.h"

using namespace forte::dunes;

extern "C" {
// constants: g, the shear law's 0.4, the onset speed, the reference sorting, the phase noise, the
// cavity's Q, water's e-folding share, c₁, c₂, the most patches and layer modes
FORTE_EXPORT void dunes_constants(double *out) {
  out[0] = G; out[1] = SHEAR; out[2] = U_ONSET; out[3] = SORTING_REF; out[4] = NOISE; out[5] = CAVITY_Q;
  out[6] = WATER_E; out[7] = C1; out[8] = C2; out[9] = MAX_GRAINS; out[10] = LAYER_MODES;
  for (int i = 0; i < 7; i++) out[11 + i] = WENTWORTH[i];
}
FORTE_EXPORT double dunes_grain_diameter(double f) { return grainDiameter(f); }
FORTE_EXPORT double dunes_shear_freq(double d) { return shearFreq(d); }
FORTE_EXPORT int dunes_wentworth(double d) { return wentworth(d); }
FORTE_EXPORT double dunes_layer_depth(double f) { return layerDepth(f); }
FORTE_EXPORT double dunes_layer_mode(int n, double H) { return layerMode(n, H); }
FORTE_EXPORT double dunes_freq_spread(double phi) { return freqSpread(phi); }
FORTE_EXPORT double dunes_critical_coupling(double s, double D) { return criticalCoupling(s, D); }
FORTE_EXPORT double dunes_coupling(double U, double water) { return coupling(U, water); }
FORTE_EXPORT double dunes_onset_speed(double phi, double water) { return onsetSpeed(phi, water); }
FORTE_EXPORT double dunes_pulse_harmonic(int n, double contact) { return pulseHarmonic(n, contact); }
FORTE_EXPORT double dunes_inv_normal(double p) { return invNormal(p); }
FORTE_EXPORT double dunes_simulate_r(int n, double s, double K, double D, double f0, double seconds, double fs, unsigned seed) {
  return simulateR(n, s, K, D, f0, seconds, fs, seed);
}

// The tests' hooks, on the engine of a handle (forte_engine): a key's avalanche as
// on, layer, U, K/K_c, R, patches, layer modes, f0.
FORTE_EXPORT void dunes_voice(DunesEngine *e, int key, double *out) {
  const Voice *v = e->voiceOf(key);
  out[0] = v ? 1 : 0;
  out[1] = v ? v->layer : 0;
  out[2] = v ? v->U : 0;
  out[3] = v ? v->drive : 0;
  out[4] = v && v->layer == 0 ? v->pop.R() : 0;
  out[5] = v && v->layer == 0 ? v->pop.n : 0;
  out[6] = v && v->layer == 1 ? v->modes : 0;
  out[7] = v ? v->f0 : 0;
}
}
