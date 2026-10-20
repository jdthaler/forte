// universe-web.cpp — the model's functions the page's views call (universe/src/universe-wasm.js)
// and the tests, and the engine's offer of a universe the page built.

#include <memory>

#include "forte/web.h"
#include "universe-engine.h"
#include "universe-model.h"

using namespace forte::universe;

namespace {
std::unique_ptr<Background> bg;
std::unique_ptr<Universe> built;
float table[OFFER_SIZE];
}

extern "C" {
// The background for a cosmology (ω_b, ω_c, N_eff, Y_p), kept for the calls below; its numbers in
// out: z_eq, τ_eq, z*, τ*, r_s*, k_D*, age*, R*, ω_γ, ω_ν, ω_m, n_H today, f_He, A, B.
FORTE_EXPORT void universe_background(double ob, double oc, double neff, double yp, double *out) {
  bg = std::make_unique<Background>(Cosmology{ob, oc, neff, yp});
  const double v[] = {bg->zEq, bg->tauEq, bg->zStar, bg->tauStar, bg->rsStar, bg->kdStar, bg->ageStar, bg->R(bg->tauStar),
                      bg->og, bg->onu, bg->om, bg->nH0, bg->fHe, bg->A, bg->B};
  for (int i = 0; i < (int)(sizeof v / sizeof *v); i++) out[i] = v[i];
}
FORTE_EXPORT double universe_a(double tau) { return bg->a(tau); }
FORTE_EXPORT double universe_tau_of(double a) { return bg->tauOf(a); }
FORTE_EXPORT double universe_hubble(double tau) { return bg->hubble(tau); }
FORTE_EXPORT double universe_r(double tau) { return bg->R(tau); }
FORTE_EXPORT double universe_xe(double z) { return bg->xeOfZ(z); }
FORTE_EXPORT double universe_opacity(double tau) { return bg->opacity(tau); }
FORTE_EXPORT double universe_visibility(double tau) { return bg->visibility(tau); }
FORTE_EXPORT double universe_rs(double tau) { return bg->rs(tau); }
FORTE_EXPORT double universe_damping(double tau) { return bg->damping(tau); }
FORTE_EXPORT double universe_damping_rate(double tau) { return bg->dampingRate(tau); }
// The wave k evolved in the background above to the n times t: 8 numbers a time in out (sky,
// doppler, plasma, φ, ψ, δ_γ, θ, δ_c).
FORTE_EXPORT void universe_evolve(double k, const double *t, int n, double *out, int damp) {
  std::unique_ptr<ModeOut[]> o(new ModeOut[n]);
  evolve(*bg, k, t, n, o.get(), damp != 0);
  for (int i = 0; i < n; i++) {
    const double v[8] = {o[i].sky, o[i].doppler, o[i].plasma, o[i].phi, o[i].psi, o[i].dg, o[i].theta, o[i].dc};
    for (int j = 0; j < 8; j++) out[8 * i + j] = v[j];
  }
}
// The universe the engine plays for a cosmology: its table (the sky's, the Doppler's and the
// plasma's, each harmonic's NT values in turn) at the pointer returned, τ*, r_s*, k₁ in out.
FORTE_EXPORT float *universe_build(double ob, double oc, double neff, double yp, double *out) {
  built = buildUniverse(Cosmology{ob, oc, neff, yp});
  for (int m = 0; m < MAX_HARMONICS; m++) for (int j = 0; j < NT; j++) {
    table[(0 * MAX_HARMONICS + m) * NT + j] = built->sky[m][j];
    table[(1 * MAX_HARMONICS + m) * NT + j] = built->doppler[m][j];
    table[(2 * MAX_HARMONICS + m) * NT + j] = built->plasma[m][j];
  }
  out[0] = built->tauStar; out[1] = built->rsStar; out[2] = built->k1;
  return table;
}
FORTE_EXPORT int universe_harmonics() { return MAX_HARMONICS; }
FORTE_EXPORT int universe_nt() { return NT; }
// The engine's: where the page's table goes, then the offer (cos: ω_b, ω_c, N_eff, Y_p, τ*, r_s*, k₁).
FORTE_EXPORT float *universe_offer_buffer() { return EarlyUniverseEngine::offerBuffer; }
FORTE_EXPORT int universe_offer(EarlyUniverseEngine *e, const double *cos) { return e->offer(cos) ? 1 : 0; }
}
