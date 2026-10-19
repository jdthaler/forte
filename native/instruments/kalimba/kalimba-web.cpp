// kalimba-web.cpp — the model's functions the page's views and the tests call (kalimba/src/kalimba-wasm.js).
#include <vector>
#include "forte/web.h"
#include "kalimba-engine.h"
#include "kalimba-model.h"
using namespace forte::kalimba;
extern "C" {
// The modes of a key for parameters P: count, and f, sigma, amp (N), q (m) for each in out.
FORTE_EXPORT int kalimba_key_modes(int key, const double *P, double *out) {
  const KeyModes km = keyModes(key, P);
  for (int i = 0; i < km.count; i++) { const Mode &m = km.m[i]; out[4 * i] = m.f; out[4 * i + 1] = m.sigma; out[4 * i + 2] = m.amp; out[4 * i + 3] = m.q; }
  return km.count;
}
// A key's tine: f1, front length, back length, thickness, mass per length, EI, the thumb's force
// and how far it pushes.
FORTE_EXPORT void kalimba_tine(int key, const double *P, double *out) {
  const Tine t = tineOf(key, P);
  const double v[] = {t.f1, t.L, t.a, t.t, t.mu, t.EI, t.force, t.depth};
  for (int i = 0; i < 8; i++) out[i] = v[i];
}
// The clamped–supported–free beam for back/front ratio r: its modes' βL, shapes and ∫φ.
FORTE_EXPORT int kalimba_mode_count(double r) { return tineShape(r).count; }
FORTE_EXPORT double kalimba_beta(double r, int n) { return tineShape(r).beta[n]; }
FORTE_EXPORT double kalimba_mode_shape(double r, int n, double xi) { return modeShape(tineShape(r), n, xi); }
FORTE_EXPORT double kalimba_mode_area(double r, int n) { return tineShape(r).S[n]; }
FORTE_EXPORT double kalimba_static_deflection(int key, const double *P, double xi) { return staticDeflection(key, P, xi); }
FORTE_EXPORT double kalimba_release_spectrum(double f, double tau) { return releaseSpectrum(f, tau); }
FORTE_EXPORT double kalimba_bridge_x(int key) { return bridgeX(key); }
// The box with the hole this much covered: fH, fp, fpSealed, fLo, fHi, open, V, then its
// plate modes' frequencies.
FORTE_EXPORT int kalimba_box(const double *P, double cover, double *out) {
  const Box b = boxOf(P, cover);
  const double v[] = {b.fH, b.fp, b.fpSealed, b.fLo, b.fHi, b.open ? 1.0 : 0.0, b.V};
  for (int i = 0; i < 7; i++) out[i] = v[i];
  for (int j = 0; j < PLATE_MODES; j++) out[7 + j] = b.plate[j].f;
  return 7 + PLATE_MODES;
}
FORTE_EXPORT double kalimba_box_response(const double *P, double cover, int key, double f) { return boxResponse(boxOf(P, cover), key, f); }
// The engine's box in time: the sound (Pa at 1 m) of a 1 N impulse at key's place on the
// bridge, n samples at fs (returned in a buffer of its own: longer than the scratch).
FORTE_EXPORT const double *kalimba_box_impulse(const double *P, double cover, int key, double fs, int n) {
  static std::vector<double> out;
  out.assign(n, 0);
  Body body(fs);
  body.set(boxOf(P, cover), 0);
  double w[PLATE_MODES];
  const int mn[PLATE_MODES][2] = {{1, 1}, {3, 1}, {1, 3}, {3, 3}, {5, 1}, {1, 5}, {5, 3}, {3, 5}};
  for (int j = 0; j < PLATE_MODES; j++) w[j] = plateShape({mn[j][0], mn[j][1], 0, 0, 0}, bridgeX(key), BRIDGE_Y);
  for (int i = 0; i < n; i++) {
    double F[PLATE_MODES];
    for (int j = 0; j < PLATE_MODES; j++) F[j] = i == 0 ? w[j] * fs : 0;
    out[i] = body.run(F);
  }
  return out.data();
}
}
