// abracadabra-web.cpp — the model's functions the page's views call (abracadabra/src/abracadabra-wasm.js)
// and the tests.

#include <cmath>

#include "forte/web.h"
#include "abracadabra-model.h"

using namespace forte::abracadabra;

namespace {
Field testField;
}

extern "C" {
FORTE_EXPORT double abracadabra_constant(int i) {
  const double c[] = {C_KMS, H_EV, HBARC_GEV_M, PHI0, RHO_DM, V0, V_LAB, STREAM_V, STREAM_SIGMA, ABRA_R_IN, ABRA_R_OUT, ABRA_H,
                      ABRA_V, ABRA_G, ABRA_LOOP, ABRA_B, M_IN, L_T, SQUID_NOISE, SCALE, CHANNEL_Q, MAX_WAVES, STREAM_WAVES};
  return c[i];
}
FORTE_EXPORT double abracadabra_axion_frequency(double m) { return axionFrequency(m); }
FORTE_EXPORT double abracadabra_axion_mass(double f) { return axionMass(f); }
FORTE_EXPORT double abracadabra_coupling_per_meter(double g, double rho) { return couplingPerMeter(g, rho); }
FORTE_EXPORT double abracadabra_pickup_flux(double g, double rho, double B, double size) { return pickupFlux(g, rho, B, size); }
FORTE_EXPORT double abracadabra_squid_flux(double g, double rho, double B, double size) { return squidFlux(g, rho, B, size); }
FORTE_EXPORT double abracadabra_channel_noise(double noise, double f) { return channelNoise(noise, f); }
FORTE_EXPORT double abracadabra_geometry(double a, double R, double Ro, double h) { return geometryFactor(a, R, Ro, h); }
FORTE_EXPORT double abracadabra_ellip_k(double k) { return ellipK(k); }
FORTE_EXPORT double abracadabra_ellip_e(double k) { return ellipE(k); }
FORTE_EXPORT double abracadabra_speed_pdf(double v, double v0, double vlab) { return labSpeedPdf(v, v0, vlab); }
FORTE_EXPORT double abracadabra_line_pdf(double d, double fa, double v0, double vlab) { return linePdf(d, fa, v0, vlab); }
FORTE_EXPORT double abracadabra_line_mean(double fa, double v0, double vlab) { return lineMean(fa, v0, vlab); }
FORTE_EXPORT double abracadabra_line_spread(double fa, double v0, double vlab) { return lineSpread(fa, v0, vlab); }
FORTE_EXPORT double abracadabra_coherence_time(double fa, double v0, double vlab) { return coherenceTime(fa, v0, vlab); }
// A test universe: a field drawn from seed.
FORTE_EXPORT void abracadabra_field_seed(unsigned seed) { Rng r(seed); testField.init(r); }
// That field at t (s), for an axion at fa Hz: re and im into out.
FORTE_EXPORT void abracadabra_field_at(double t, double fa, int halo, int stream, double v0, double vlab, double vs, double share, double *out) {
  FieldShape s;
  s.halo = halo; s.stream = stream; s.v0 = v0; s.vlab = vlab; s.vs = vs; s.share = share;
  fieldAt(testField, s, fa, t, out[0], out[1]);
}
// The speeds (km/s) of that field's waves: the halo's, then the stream's.
FORTE_EXPORT void abracadabra_field_speeds(double v0, double vlab, double vs, double *out) {
  for (int i = 0; i < MAX_WAVES + STREAM_WAVES; i++) out[i] = Field::speedOf(testField.w[i], i >= MAX_WAVES, v0, vlab, vs);
}
}
