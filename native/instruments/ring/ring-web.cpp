// ring-web.cpp — the model's functions the page's views call (ring/src/ring-wasm.js) and the tests.

#include "forte/web.h"
#include "ring-model.h"
#include "ring-params.h"

using namespace forte::ring;

extern "C" {
// One key's ring for parameters P and key pressure: frev, fsyn, Qs, sigma, sigmaDelta, chroma, D, mu in out.
FORTE_EXPORT void ring_ring_of(int key, const double *P, double pressure, double *out) {
  const Ring r = ringOf(key, P, pressure);
  const double v[] = {r.frev, r.fsyn, r.Qs, r.sigma, r.sigmaDelta, r.chroma, r.D, r.mu};
  for (int i = 0; i < 8; i++) out[i] = v[i];
}
// The amplitude-detuning factor after θ = 4πμN: amp and phase in out.
FORTE_EXPORT void ring_detuning(double theta, double Z, double *out) {
  const Detuning d = detuning(theta, Z);
  out[0] = d.amp; out[1] = d.phase;
}
FORTE_EXPORT double ring_chromatic(double D, double phiS) { return chromatic(D, phiS); }
FORTE_EXPORT double ring_form_factor(double n, double sigma) { return formFactor(n, sigma); }
// The centroid N turns after a kick of Z σ (constant parameters): env and x in out.
FORTE_EXPORT void ring_centroid(double N, int key, const double *P, double Z, double *out) {
  const Centroid c = centroid(N, ringOf(key, P), Z, P[p::tune], P[p::damping]);
  out[0] = c.env; out[1] = c.x;
}
}
