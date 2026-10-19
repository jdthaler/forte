// cavity-web.cpp — the model's functions the page's views call (cavity/src/cavity-wasm.js) and the tests.

#include "forte/web.h"
#include "cavity-model.h"
#include "cavity-params.h"

using namespace forte::cavity;

constexpr int MODE_VALUES = 13;

extern "C" {
// A key's cavity for parameters P: the count of modes, and for each in out (MODE_VALUES apiece)
// band, mode, f, phase, kick (re, im), x1, xN, invQ0, invQn, wIn, wHom and its decay rate (1/s)
// with the coupler at Q_ext (released: pushed in) and the walls superconducting or quenched.
FORTE_EXPORT int cavity_modes(int key, const double *P, int released, int quenched, double *out) {
  const Cavity c = cavityOf(key, P);
  for (int j = 0; j < c.count; j++) {
    const Mode &m = c.modes[j];
    const double v[MODE_VALUES] = {(double)m.band, (double)m.mode, m.f, m.phase, m.kick.real(), m.kick.imag(), m.x1, m.xN,
                                   m.invQ0, m.invQn, m.wIn, m.wHom,
                                   decayRate(m, P[p::qext], P[p::qhom], released ? P[p::release] : 0, quenched != 0)};
    for (int i = 0; i < MODE_VALUES; i++) out[MODE_VALUES * j + i] = v[i];
  }
  return c.count;
}
FORTE_EXPORT int cavity_mode_values() { return MODE_VALUES; }
FORTE_EXPORT double cavity_mode_shape(int tuned, int N, int mode, int n) { return modeShape(tuned != 0, N, mode, n); }
FORTE_EXPORT double cavity_phase_advance(int tuned, int N, int mode) { return phaseAdvance(tuned != 0, N, mode); }
FORTE_EXPORT void cavity_transit(int p, double theta, double *out) {
  const std::complex<double> t = transit(p, theta);
  out[0] = t.real(); out[1] = t.imag();
}
FORTE_EXPORT double cavity_surface_resistance(double f, double T) { return surfaceResistance(f, T); }
FORTE_EXPORT double cavity_physical_frequency(double f, double fpi) { return physicalFrequency(f, fpi); }
FORTE_EXPORT double cavity_band_ratio(int band, double betag, double k) { return bandRatio(band, betag, k); }
FORTE_EXPORT double cavity_bessel(int n, double x) { return besselJ(n, x); }
FORTE_EXPORT int cavity_band_count() { return BANDS; }
FORTE_EXPORT int cavity_band_m(int b) { return BAND[b].m; }
FORTE_EXPORT int cavity_band_p(int b) { return BAND[b].p; }
FORTE_EXPORT double cavity_band_j(int b) { return BAND[b].j; }
FORTE_EXPORT double cavity_qscale() { return QSCALE; }
FORTE_EXPORT double cavity_train() { return TRAIN; }
FORTE_EXPORT double cavity_tc() { return TC; }
}
