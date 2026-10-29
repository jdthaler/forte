// tess-web.cpp — the model's functions the page's views and the tests call (tess/src/tess-wasm.js).

#include <cmath>

#include "forte/web.h"
#include "tess-model.h"

using namespace forte::tess;

// the occultation table of the last planet asked about (building one takes a millisecond)
static const Occultation &occultation(const Orbit &o) {
  static Occultation occ;
  if (o.k != occ.k || o.ld.u1 != occ.ld.u1 || o.ld.u2 != occ.ld.u2) occ.build(o.k, o.ld);
  return occ;
}

extern "C" {
// A key's planet for parameters P: out = [freq, period (s), speedup, aR, k, b, cosi, phiT, depth, u1, u2].
FORTE_EXPORT void tess_orbit(int key, const double *P, double *out) {
  const Orbit o = orbitOf(key, P);
  const double v[] = {o.freq, o.period, o.speedup, o.aR, o.k, o.b, o.cosi, o.phiT, o.depth, o.ld.u1, o.ld.u2};
  for (int i = 0; i < 11; i++) out[i] = v[i];
}
// The share of light the key's planet blocks at phase φ (0: mid-transit), from the table the engine reads.
FORTE_EXPORT double tess_dip(int key, const double *P, double phase) {
  const Orbit o = orbitOf(key, P);
  return occultation(o).at(separation(o, phase));
}
// The light curve's Fourier coefficients c[0..H] (tess-model.h harmonics).
FORTE_EXPORT void tess_harmonics(int key, const double *P, int H, double *out) {
  const Orbit o = orbitOf(key, P);
  harmonics(o, occultation(o), H, out);
}
FORTE_EXPORT double tess_blocked(double z, double k, double u1, double u2) { return blocked(z, k, {u1, u2}); }
FORTE_EXPORT double tess_u1(double teff) { return limbDarkening(teff).u1; }
FORTE_EXPORT double tess_u2(double teff) { return limbDarkening(teff).u2; }
FORTE_EXPORT double tess_photons(double T) { return photons(T); }
FORTE_EXPORT double tess_noise(double T, double dt) { return noise(T, dt); }
}
