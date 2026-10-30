// steelpan-web.cpp — the model's functions the page's views and the tests call
// (steelpan/src/steelpan-wasm.js).

#include "forte/web.h"
#include "steelpan-engine.h"
#include "steelpan-model.h"

using namespace forte::steelpan;

extern "C" {
// The modes of a key for parameters P: count, and f, sigma, shape, rad, i, j for each in out.
FORTE_EXPORT int steelpan_note_modes(int key, const double *P, double fmax, double *out) {
  const NoteModes nm = noteModes(key, P, fmax);
  for (int i = 0; i < nm.count; i++) {
    const Mode &m = nm.m[i];
    double *o = out + 6 * i;
    o[0] = m.f; o[1] = m.sigma; o[2] = m.shape; o[3] = m.rad; o[4] = m.i; o[5] = m.j;
  }
  return nm.count;
}
// A stroke's impulse on each of a key's modes (per unit velocity, times velocity): count.
FORTE_EXPORT int steelpan_strike(int key, const double *P, double velocity, double *out) {
  const NoteModes nm = noteModes(key, P, 18000);
  const double f1 = nm.m[0].f, tau = contactTime(P[p::contact], f1, velocity);
  for (int i = 0; i < nm.count; i++) out[i] = strikeGain(nm.m[i], f1, tau);
  return nm.count;
}
// The dome's couplings among a key's modes: count, and i, j, k, c for each in out.
FORTE_EXPORT int steelpan_triples(int key, const double *P, double *out) {
  Triple t[kTriples];
  const int n = noteTriples(noteModes(key, P, 18000), t);
  for (int q = 0; q < n; q++) { out[4 * q] = t[q].i; out[4 * q + 1] = t[q].j; out[4 * q + 2] = t[q].k; out[4 * q + 3] = t[q].c; }
  return n;
}
FORTE_EXPORT double steelpan_shape(int i, int j, double x, double y) { return shape(i, j, x, y); }
FORTE_EXPORT double steelpan_plate_ratio(int i, int j, double r) { return plateRatio(i, j, r); }
FORTE_EXPORT double steelpan_pulse(double f, double tau) { return pulseSpectrum(f, tau); }
FORTE_EXPORT double steelpan_contact(double tau0Ms, double f1, double v) { return contactTime(tau0Ms, f1, v); }
FORTE_EXPORT double steelpan_skirt(int key, double scale) { return skirtLength(key, scale); }
FORTE_EXPORT double steelpan_radiation(double f, double L) { return radiation(f, L); }
FORTE_EXPORT double steelpan_ring_time(int key, double t60) { return ringTime(key, t60); }
FORTE_EXPORT double steelpan_constant(int which) { return which == 0 ? kAmp : which == 1 ? kRise : which == 2 ? kHarden : kWindow; }
// The notes beside a key: count, and (key, weight) pairs in out.
FORTE_EXPORT int steelpan_neighbours(int key, int layout, double *out) {
  Neighbour nb[8];
  const int n = neighbours(key, layout, nb);
  for (int i = 0; i < n; i++) { out[2 * i] = nb[i].key; out[2 * i + 1] = nb[i].weight; }
  return n;
}

// The tests' hooks, on the engine of a handle (forte_engine): a note's state.
FORTE_EXPORT int steelpan_active(forte::Engine *e, int key) { return static_cast<SteelPanEngine *>(e)->note(key).active; }
FORTE_EXPORT double steelpan_amplitude(forte::Engine *e, int key, int p) {
  auto *s = static_cast<SteelPanEngine *>(e);
  return s->note(key).active ? s->amplitude(s->note(key), p) : 0;
}
FORTE_EXPORT double steelpan_displacement(forte::Engine *e, int key, int p) { return static_cast<SteelPanEngine *>(e)->note(key).y1[p]; }
// the modes a note integrates (0 asleep)
FORTE_EXPORT int steelpan_modes(forte::Engine *e, int key) { const auto &v = static_cast<SteelPanEngine *>(e)->note(key); return v.active ? v.run : 0; }
}
