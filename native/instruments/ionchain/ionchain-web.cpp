// ionchain-web.cpp — the model's functions the page's views call, and the tests' hooks
// (ionchain/src/ionchain-wasm.js).

#include <cmath>
#include <numbers>

#include "forte/web.h"
#include "ionchain-engine.h"
#include "ionchain-model.h"

using namespace forte::ionchain;

namespace {
Crystal last; // the page's last crystal, so a zigzag keeps its side as the wheel moves
}

extern "C" {
// SLOW, MAXN and the ion's mass in u
FORTE_EXPORT void ionchain_constants(double *out) { out[0] = SLOW; out[1] = MAXN; out[2] = ION_U; }
FORTE_EXPORT double ionchain_length_scale(double fz) { return lengthScale(fz); }
FORTE_EXPORT double ionchain_pulse(double f, double tau) { return pulseSpectrum(f, tau); }
FORTE_EXPORT void ionchain_linear_chain(int N, double *z) { linearChain(N, z); }
FORTE_EXPORT double ionchain_zigzag_alpha(int N) { return zigzagAlpha(N); }

// The crystal and its couplings for the parameters P, as the engine makes them: writes
// N, M, zigzag, reach, spacing, then x[N], z[N], λ[M], kick[M], wl[M], wr[M], sR[M], sD[M] and B[M × M]
// (row-major: coordinate d, mode m); returns M.
FORTE_EXPORT int ionchain_modes(const double *P, double *out) {
  Crystal c;
  const int N = (int)P[p::ions] < 1 ? 1 : (int)P[p::ions];
  solveCrystal(c, N, P[p::aniso], last.N == N ? &last : nullptr);
  last = c;
  Couplings k;
  couple(c, P, k);
  const int M = c.M;
  double *o = out;
  *o++ = c.N; *o++ = M; *o++ = c.zigzag; *o++ = c.reach; *o++ = c.spacing;
  for (int j = 0; j < c.N; j++) *o++ = c.x[j];
  for (int j = 0; j < c.N; j++) *o++ = c.z[j];
  for (const double *a : {c.lam, k.kick, k.wl, k.wr, k.sR, k.sD}) for (int m = 0; m < M; m++) *o++ = a[m];
  for (int d = 0; d < M; d++) for (int m = 0; m < M; m++) *o++ = c.B[d][m];
  return M;
}

// The tests' hooks, on the engine of a handle (forte_engine): each pool slot's voice, as alive,
// held, cooled, stolen, key, N, M, f0, bend, the modes it plays, then per mode its velocity's
// amplitude |c| ω_d, its frequency ω_d / 2π and its decay rate σ.
FORTE_EXPORT int ionchain_pool() { return IonChainEngine::kPool; }
FORTE_EXPORT void ionchain_voice(IonChainEngine *e, int i, double *out) {
  const Voice &v = e->voices[i];
  int on = 0;
  for (int m = 0; m < v.M; m++) on += v.on[m];
  out[0] = v.alive; out[1] = v.held; out[2] = v.cooled; out[3] = v.stolen; out[4] = v.key; out[5] = v.N; out[6] = v.M;
  out[7] = v.f0; out[8] = v.bend; out[9] = on;
  for (int m = 0; m < v.M; m++) {
    out[10 + 3 * m] = std::sqrt(v.cr[m] * v.cr[m] + v.ci[m] * v.ci[m]) * v.wd[m];
    out[11 + 3 * m] = v.wd[m] / (2 * std::numbers::pi);
    out[12 + 3 * m] = v.sig[m];
  }
}
}
