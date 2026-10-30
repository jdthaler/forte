// hydrogen-web.cpp — the model's functions the page's views and the tests call
// (hydrogen/src/hydrogen-wasm.js).

#include <cmath>

#include "forte/web.h"
#include "hydrogen-model.h"

using namespace forte::hydrogen;

// the glow of the last parameters asked about (building one takes a few milliseconds)
static Glow &glowOf(const double *P) {
  static Glow g;
  const Lamp lamp = lampOf(P);
  if (!g.ready() || !(g.lamp == lamp)) g.build(lamp);
  return g;
}

extern "C" {
FORTE_EXPORT int hydrogen_nmax() { return NMAX; }
FORTE_EXPORT int hydrogen_line_of(int n, int m) { return lineOf(n, m); }
FORTE_EXPORT double hydrogen_line_hz(int n, int m) { return lineHz(n, m); }
FORTE_EXPORT double hydrogen_wavelength(int n, int m) { return wavelengthNm(n, m); }
FORTE_EXPORT double hydrogen_radial(int n, int l, int m, int k) { return radial(n, l, m, k); }
FORTE_EXPORT double hydrogen_einstein_a(int n, int l, int m, int k) { return einsteinA(n, l, m, k); }
FORTE_EXPORT double hydrogen_oscillator_1s(int n) { return oscillator1s(n); }
FORTE_EXPORT double hydrogen_recombination(int n, int l, double T) { return recombination(n, l, T); }
FORTE_EXPORT double hydrogen_sixj(int a, int b, int c, int d, int e, int f) { return sixj(a, b, c, d, e, f); }
FORTE_EXPORT double hydrogen_dirac_shift(int n, double j, double scale) { return diracShift(n, j, scale); }
FORTE_EXPORT double hydrogen_stark_width(int n, int m, double N) { return starkWidth(n, m, N); }
FORTE_EXPORT double hydrogen_doppler_width(double T) { return dopplerWidth(T); }
// a state's total decay rate: Case A (every line) or B (no Lyman lines), s⁻¹
FORTE_EXPORT double hydrogen_gamma(int n, int l, int caseB) { return caseB ? atom().gammaB[stateOf(n, l)] : atom().gamma[stateOf(n, l)]; }

// The steady glow for parameters P: every line's power (Rydbergs × s⁻¹ per unit pump) into out[LINES]
// (index lineOf(n, m)); returns LINES.
FORTE_EXPORT int hydrogen_steady_lines(const double *P, double *out) {
  const Lamp lamp = lampOf(P);
  static double N[STATES];
  steady(lamp, N);
  linePowers(lamp, N, out);
  return LINES;
}
// The steady populations for parameters P, into out[STATES] (index stateOf(n, l)).
FORTE_EXPORT int hydrogen_steady_populations(const double *P, double *out) {
  steady(lampOf(P), out);
  return STATES;
}
// The glow's step response for P: line (n, m)'s power at times t[0 … count) (s, the atom's time)
// after the switch-on, into out; and the steady value it tends to as the return value.
FORTE_EXPORT double hydrogen_step(const double *P, int n, int m, const double *t, int count, double *out) {
  Glow &g = glowOf(P);
  int j = -1;
  for (size_t i = 0; i < g.kept.size(); i++) if (g.kept[i] == lineOf(n, m)) j = (int)i;
  for (int i = 0; i < count; i++) {
    if (j < 0) { out[i] = 0; continue; }
    g.ensure(t[i]);
    out[i] = g.powerAt(j, t[i]);
  }
  return j < 0 ? 0 : g.steadyPower[j];
}
// The glow's time grid's end (s): past it the step response is its steady value.
FORTE_EXPORT double hydrogen_glow_end(const double *P) { return glowOf(P).end(); }
// Line (n, m)'s natural FWHM in the glow for P (Hz, the atom's time).
FORTE_EXPORT double hydrogen_natural_width(const double *P, int n, int m) {
  Glow &g = glowOf(P);
  for (size_t i = 0; i < g.kept.size(); i++) if (g.kept[i] == lineOf(n, m)) return g.width[i];
  return 0;
}
// Line (n, m)'s fine-structure components for P at α × scale: count, and (2j, 2j′, ratio, weight)
// for each in out.
FORTE_EXPORT int hydrogen_components(const double *P, int n, int m, double scale, double *out) {
  Glow &g = glowOf(P);
  static Component c[MAX_COMPONENTS];
  const int k = components(lineOf(n, m), g.Nss.data(), scale, c);
  for (int i = 0; i < k; i++) { out[4 * i] = c[i].tj; out[4 * i + 1] = c[i].tk; out[4 * i + 2] = c[i].ratio; out[4 * i + 3] = c[i].weight; }
  return k;
}
}
