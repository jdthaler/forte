// nmr-web.cpp — the model's functions the page's views call, and the tests' hooks
// (nmr/src/nmr-wasm.js).

#include <complex>
#include <memory>

#include "forte/dsp.h"
#include "forte/web.h"
#include "nmr-engine.h"
#include "nmr-model.h"

using namespace forte::nmr;

namespace {
// A spin system written out: groups (n, ppm) and couplings (a, b, J).
Sample custom(int ng, const double *g, int nc, const double *c) {
  Sample s{};
  s.groups = std::min(ng, MAX_GROUPS);
  s.couplings = std::min(nc, MAX_COUPLINGS);
  for (int i = 0; i < s.groups; i++) s.g[i] = {(int)g[2 * i], g[2 * i + 1]};
  for (int i = 0; i < s.couplings; i++) s.c[i] = {(int)c[3 * i], (int)c[3 * i + 1], c[3 * i + 2]};
  s.D = 0;
  return s;
}
// f0, B0, the anchor's shift and line, ok, then each line's frequency (Hz) and intensity
int report(const KeySystem &k, double *out) {
  out[0] = k.f0; out[1] = k.B0; out[2] = k.anchor; out[3] = k.fAnchor; out[4] = k.ok ? 1 : 0;
  for (int l = 0; l < k.lines; l++) { out[5 + 2 * l] = k.line[l].w / forte::TAU; out[6 + 2 * l] = k.line[l].intensity; }
  return k.lines;
}
// The receiver's signal (re, im) of a 90° pulse at 0 and π pulses at the times given, at time t,
// with no field spread and no relaxation: the coherences alone.
void signalAt(const KeySystem &k, int np, const double *at, double t, double *out) {
  std::vector<std::complex<double>> x(k.elems), y(k.elems);
  for (int e = 0; e < k.elems; e++) x[e] = k.elem[e].start;
  double t0 = 0;
  for (int i = 0; i < np && at[i] <= t; i++) {
    for (int e = 0; e < k.elems; e++) x[e] *= std::polar(1.0, k.elem[e].w * (at[i] - t0));
    piPulse(k, x.data(), y.data());
    x.swap(y);
    t0 = at[i];
  }
  std::complex<double> s = 0;
  for (int e = 0; e < k.elems; e++) s += x[e] * std::polar(1.0, k.elem[e].w * (t - t0)) * k.elem[e].fm;
  out[0] = s.real(); out[1] = s.imag();
}
} // namespace

extern "C" {
// γ/2π (MHz/T), the strongest magnet (T), the coil's length (m), the samples
FORTE_EXPORT void nmr_constants(double *out) { out[0] = GAMMA_MHZ_T; out[1] = STRONGEST_T; out[2] = COIL_M; out[3] = SAMPLES; }
// A sample: groups, then n and ppm for each; couplings, then a, b and J for each; D. Returns how many numbers.
FORTE_EXPORT int nmr_sample(int index, double *out) {
  const Sample &s = sample(index);
  int i = 0;
  out[i++] = s.groups;
  for (int g = 0; g < s.groups; g++) { out[i++] = s.g[g].n; out[i++] = s.g[g].ppm; }
  out[i++] = s.couplings;
  for (int c = 0; c < s.couplings; c++) { out[i++] = s.c[c].a; out[i++] = s.c[c].b; out[i++] = s.c[c].J; }
  out[i++] = s.D;
  return i;
}
// A key's spins for parameters P (indexed as nmr-params.h): see report. Returns the lines.
FORTE_EXPORT int nmr_key_system(int key, const double *P, double *out) {
  auto k = std::make_unique<KeySystem>();
  keySystem(key, P, *k);
  return report(*k, out);
}
// The same for a spin system written out, in a magnet of Larmor frequency f0 (Hz).
FORTE_EXPORT int nmr_custom_system(int ng, const double *g, int nc, const double *c, double f0, double *out) {
  auto k = std::make_unique<KeySystem>();
  buildSystem(custom(ng, g, nc, c), f0, *k);
  return report(*k, out);
}
// The coherences' signal at t after π pulses at the times `at` (see signalAt), for a key or a system written out.
FORTE_EXPORT void nmr_key_signal(int key, const double *P, int np, const double *at, double t, double *out) {
  auto k = std::make_unique<KeySystem>();
  keySystem(key, P, *k);
  signalAt(*k, np, at, t, out);
}
FORTE_EXPORT void nmr_custom_signal(int ng, const double *g, int nc, const double *c, double f0, int np, const double *at, double t, double *out) {
  auto k = std::make_unique<KeySystem>();
  buildSystem(custom(ng, g, nc, c), f0, *k);
  signalAt(*k, np, at, t, out);
}
FORTE_EXPORT double nmr_key_larmor(int key, const double *P) { return keyLarmor(key, P); }
FORTE_EXPORT double nmr_dephasing(int profile, double S) { return dephasing(profile, S); }
// the tests' hooks into an engine (forte_engine(handle))
FORTE_EXPORT int nmr_engine_pulses(forte::Engine *e) { return static_cast<NmrEngine *>(e)->pulses; }
FORTE_EXPORT double nmr_engine_pulsed_at(forte::Engine *e) { return static_cast<NmrEngine *>(e)->pulsedAt; }
FORTE_EXPORT double nmr_engine_mz(forte::Engine *e, int key) { return static_cast<NmrEngine *>(e)->mzOf(key); }
FORTE_EXPORT int nmr_engine_lines(forte::Engine *e, int key) { return static_cast<NmrEngine *>(e)->linesOf(key); }
}
