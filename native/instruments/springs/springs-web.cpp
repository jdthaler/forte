// springs-web.cpp — the model's functions the page and its views call (springs/src/springs-wasm.js),
// and the engine's test hooks (its voices, in order and by key) and its capture of the last
// strike (the echo view's samples).
//
// P is the parameter array in springs-params.h's order (the page writes it as shared/wasm.js
// writes the engine's).

#include <memory>
#include <vector>

#include "forte/web.h"
#include "springs-engine.h"

using namespace forte::springs;

static int clampKey(int key) { return key < KEY_LO ? KEY_LO : key > KEY_HI ? KEY_HI : key; }

extern "C" {
// A key's springs (keySprings), packed (packKeySprings): what the page sends with a note. Returns
// how many numbers; they are at springs_packed() until the next call.
static std::vector<double> packed, input;
FORTE_EXPORT int springs_key_springs(int key, const double *P, double fs) {
  packed = packKeySprings(keySprings(clampKey(key), paramsOf(P), fs));
  return (int)packed.size();
}
FORTE_EXPORT const double *springs_packed() { return packed.data(); }
// Room for n numbers to hand to springs_offer (a key's springs can outgrow the scratch area).
FORTE_EXPORT double *springs_input(int n) {
  if ((int)input.size() < n) input.resize(n);
  return input.data();
}
FORTE_EXPORT int springs_offer(SpringEngine *e, int n) { return e->offer(input.data(), n); }

// The key's spring, tuned (tuneSpring): R, r, alpha, nu, E, rho, slinky, key, f0, L, turns, height,
// mass, c0, TD, Fc, kc, sheet, onBranch, axial, fMax and its solver's cross-section A (r/R units).
FORTE_EXPORT int springs_tune(int key, const double *P, double *out) {
  const Spring s = tuneSpring(clampKey(key), paramsOf(P));
  const double v[] = {s.R, s.r, s.alpha, s.nu, s.E, s.rho, s.slinky ? 1.0 : 0.0, (double)s.key, s.f0, s.L, s.turns, s.height,
                      s.mass, s.c0, s.TD, s.Fc, s.kc, (double)s.sheet, s.onBranch ? 1.0 : 0.0, s.axial ? 1.0 : 0.0, s.fMax, s.solver->rc.A};
  int n = 0;
  for (double x : v) out[n++] = x;
  return n;
}
// dispersionCurve of the key's spring with coil radius R (scaled as the page plays it), up to
// fTop, n points: k, f, c_g, share for each point of sheet 0, then of sheet 1.
FORTE_EXPORT int springs_dispersion(int key, const double *P, double R, double fTop, int n, double *out) {
  const Spring s = tuneSpring(clampKey(key), paramsOf(P));
  std::vector<CurvePoint> pts[2];
  dispersionCurve(s, R, fTop, n, pts);
  int i = 0;
  for (int j = 0; j < 2; j++) for (const CurvePoint &q : pts[j]) { out[i++] = q.k; out[i++] = q.f; out[i++] = q.cg; out[i++] = q.share; }
  return i;
}
// Wittrick's rod at any shape (r/R, helix angle α, Poisson's ν) and wavenumber k (1/R units, R = 1,
// E = ρ = 1): its six ω ascending, dω/dk, and the bead share (beadShare) of each in rotation and
// along the axis, 24 numbers. A solver of its own (solverFor's cache keys ν = 0.29), kept while
// the shape stays the same.
FORTE_EXPORT int springs_rod(double rr, double alpha, double nu, double k, double *out) {
  static std::unique_ptr<RodSolver> rod;
  if (!rod || rod->shape.rr != rr || rod->shape.alpha != alpha || rod->shape.nu != nu) rod = std::make_unique<RodSolver>(Shape{rr, alpha, nu});
  rod->solve(k);
  for (int j = 0; j < 6; j++) {
    out[j] = rod->w[j];
    out[6 + j] = rod->dw[j];
    out[12 + j] = beadShare(rod->Y, j, alpha, false);
    out[18 + j] = beadShare(rod->Y, j, alpha, true);
  }
  return 24;
}
FORTE_EXPORT double springs_mode_sigma(double f, double cg, double L, double endLoss, double eta, double oil) { return modeSigma(f, cg, L, endLoss, eta, oil); }
FORTE_EXPORT double springs_pulse_length(double mallet, double velocity) { return pulseLength(mallet, velocity); }
FORTE_EXPORT double springs_pulse_spectrum(double f, double tau) { return pulseSpectrum(f, tau); }

// The engine's capture of its last strike (CAPTURE samples; an echo message says how many are filled).
FORTE_EXPORT const float *springs_capture(SpringEngine *e) { return e->capture.data(); }

// The tests' hooks, on the engine of a handle (forte_engine): its voices in order, and each one's
// key, fading, dead, released, level, peak, age and whether it is its key's (byKey).
FORTE_EXPORT int springs_voices(SpringEngine *e) { return e->nVoices; }
FORTE_EXPORT void springs_voice(SpringEngine *e, int i, double *out) {
  const SpringEngine::Voice &v = *e->voices[i];
  const double x[8] = {(double)v.key, (double)v.fading, (double)v.dead, (double)v.released, v.level, v.peak, v.age, (double)(e->byKey[v.key] == &v)};
  for (int k = 0; k < 8; k++) out[k] = x[k];
}
}
