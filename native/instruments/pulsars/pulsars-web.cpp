// pulsars-web.cpp — the model's functions the page's views call (pulsars/src/pulsars-wasm.js), and
// the tests'.

#include <vector>

#include "forte/web.h"
#include "pulsars-engine.h"
#include "pulsars-model.h"

using namespace forte::pulsars;

namespace {
Builder &builder() { static Builder b(NTAB); return b; }
std::vector<float> scratchL(NTAB + 1), scratchR(NTAB + 1);
}

extern "C" {
// A key's pulsar for parameters P (DM dm), into out: f, α, ζ, β, ρ, R_LC, r_em, the scattering
// time at the band's centre, each sub-band's smear left, the band's whole spread of delays.
FORTE_EXPORT void pulsars_geometry(int key, const double *P, double dm, double *out) {
  const Setup s = setupOf(key, P, dm);
  const Geometry g = geometryOf(s);
  const Band a = bandOf(s);
  const double v[11] = {g.f, g.alpha, g.zeta, g.beta, g.rho, g.rlc, g.rem, scatterTime(s.dm, s.fc, s.scatter), smearLeft(s, 0), smearLeft(s, 1),
                        dmDelay(s.dm, a.lo) - dmDelay(s.dm, a.hi)};
  for (int i = 0; i < 11; i++) out[i] = v[i];
}
// The intrinsic profile (peak 1) at m phases from −½ to ½ turn.
FORTE_EXPORT void pulsars_profile(int key, const double *P, int m, double *out) { builder().profile(setupOf(key, P, P[p::dm]), out, m); }
// The engine's two tables for the key (High Quality, harmonics up to top Hz, `pieces` pieces of an
// undedispersed band), m phases from −½ to ½ turn each, the mean added back: left then right,
// then the two means, the harmonics kept and the beam's own peak. On the scale where a cut through the beam's middle has
// an rms of 1.
FORTE_EXPORT void pulsars_tables(int key, const double *P, double dm, double top, int pieces, int m, double *out) {
  Tables t;
  t.L = scratchL.data(); t.R = scratchR.data();
  builder().build(setupOf(key, P, dm), t, top, pieces);
  for (int i = 0; i < m; i++) {
    const double x = ((double)i / (m - 1) + 0.5) * t.n;
    const int j = (int)x % t.n;
    const double fr = x - (int)x;
    out[i] = t.L[j] + fr * (t.L[j + 1] - t.L[j]) + t.dcL;
    out[m + i] = t.R[j] + fr * (t.R[j + 1] - t.R[j]) + t.dcR;
  }
  out[2 * m] = t.dcL; out[2 * m + 1] = t.dcR; out[2 * m + 2] = t.harmonics; out[2 * m + 3] = t.peak;
}
// One narrow channel at f MHz, w MHz wide, folded at m phases, on the intrinsic profile's scale.
FORTE_EXPORT void pulsars_channel(int key, const double *P, double f, double w, int m, double *out) { builder().channel(setupOf(key, P, P[p::dm]), f, w, out, m); }
// Sub-band b's response at ω (rad/s) for the key's setup: re, im into out.
FORTE_EXPORT void pulsars_transfer(int key, const double *P, double dm, int b, double w, int pieces, double *out) {
  const auto h = transfer(setupOf(key, P, dm), b, w, pieces);
  out[0] = h.real(); out[1] = h.imag();
}
FORTE_EXPORT double pulsars_arrived(int key, const double *P, int b, double t) { return arrived(setupOf(key, P, P[p::dm]), b, t); }
FORTE_EXPORT double pulsars_delay(double dm, double f) { return dmDelay(dm, f); }
FORTE_EXPORT double pulsars_scatter(double dm, double f, double scale) { return scatterTime(dm, f, scale); }
FORTE_EXPORT double pulsars_beam_radius(double r, double rlc) { return beamRadius(r, rlc); }
FORTE_EXPORT double pulsars_beam(double x, double core) { return beam(x, core); }
FORTE_EXPORT double pulsars_light_cylinder(double f) { return lightCylinder(f); }
FORTE_EXPORT double pulsars_constant(int i) {
  const double c[] = {K_DM, C_KM, LC_SHARE, CORE_W, CONE_AT, CONE_W, BHAT_A, BHAT_B, BHAT_C, BHAT_X, RIM_KM, M_SUN, FASTEST, breakUp(), (double)NTAB, FLOOR_T};
  return c[i];
}
// For the tests, on an engine (forte_engine(handle)): the harmonics and table size of a key's voice.
FORTE_EXPORT int pulsars_harmonics(forte::Engine *e, int key) { return static_cast<PulsarsEngine *>(e)->harmonicsOf(key); }
FORTE_EXPORT int pulsars_table_size(forte::Engine *e, int key) { return static_cast<PulsarsEngine *>(e)->tableSizeOf(key); }
}
