// carillon-web.cpp — the model's functions the page's views call (carillon/src/carillon-wasm.js),
// and the engine's test hooks (its voices, as the test suite reads them). A bell is named by its
// key, profile and historic amount (bellOf's arguments); P is indexed as in carillon-params.h.

#include "carillon-engine.h"
#include "forte/web.h"

using namespace forte::carillon;

static Bell bell; // the last bell asked for
static const Bell &bellAt(int key, int profile, double historicAmount) {
  bellOf(key, profile, historicAmount, bell);
  return bell;
}

extern "C" {
// bellOf: D, H, mass, fNom, fPrime, strikeHeight, the rib's mode count n, historic (0 or 1), then
// every mode's frequency (n); a historic bell then has its lnf (n), d (5) and asym (e, psi × 33).
FORTE_EXPORT void carillon_bell(int key, int profile, double historicAmount, double *out) {
  const Bell &b = bellAt(key, profile, historicAmount);
  const int n = b.rib->modeCount;
  const double head[] = {b.D, b.H, b.mass, b.fNom, b.fPrime, b.strikeHeight, (double)n, b.hasHist ? 1.0 : 0.0};
  for (int i = 0; i < 8; i++) out[i] = head[i];
  double *o = out + 8;
  for (int j = 0; j < n; j++) *o++ = b.f[j];
  if (!b.hasHist) return;
  for (int j = 0; j < n; j++) *o++ = b.hist.lnf[j];
  for (double d : b.hist.d) *o++ = d;
  for (const auto &a : b.hist.asym) { *o++ = a.e; *o++ = a.psi; }
}
// The rib's index in the table (bell-table.h's RIBS, in bell-table.js's order).
FORTE_EXPORT int carillon_rib(int key, int profile) { return (int)(&ribFor(profile, key) - RIBS); }
// bellModes: how many; each j, m, k, name (−1 for none), f, sigma, sigRad, sigInt, eff, reach, rad, kappa.
FORTE_EXPORT int carillon_bell_modes(int key, int profile, double historicAmount, const double *P, double *out) {
  static BellMode md[MODES_MAX];
  const int n = bellModes(bellAt(key, profile, historicAmount), P, md);
  for (int i = 0; i < n; i++) {
    const BellMode &m = md[i];
    const double v[12] = {(double)m.j, (double)m.m, (double)m.k, (double)m.name, m.f, m.sigma, m.sigRad, m.sigInt, m.eff, m.reach, m.rad, m.kappa};
    for (int k = 0; k < 12; k++) out[12 * i + k] = v[k];
  }
  return n;
}
// clapperOf: m, R, K, Es.
FORTE_EXPORT void carillon_clapper(int key, int profile, double historicAmount, const double *P, double *out) {
  const Clapper c = clapperOf(bellAt(key, profile, historicAmount), P);
  out[0] = c.m; out[1] = c.R; out[2] = c.K; out[3] = c.Es;
}
FORTE_EXPORT double carillon_clapper_speed(int key, int profile, double historicAmount, const double *P, double velocity) {
  return clapperSpeed(bellAt(key, profile, historicAmount), P, velocity);
}
FORTE_EXPORT double carillon_hertz_time(double m, double K, double v) { return hertzTime(m, K, v); }
// asymmetryOf (with the bell's own, if historic): e, psi.
FORTE_EXPORT void carillon_asymmetry(int key, int profile, double historicAmount, int m, double eps, double *out) {
  const Bell &b = bellAt(key, profile, historicAmount);
  const Asymmetry a = asymmetryOf(m, eps, b.hasHist ? &b.hist : nullptr);
  out[0] = a.e; out[1] = a.psi;
}
FORTE_EXPORT void carillon_doublet_split(double kappa, double e, double *out) { doubletSplit(kappa, e, out); }
// struckPartials at `velocity`: how many; each f, a.
FORTE_EXPORT int carillon_struck_partials(int key, int profile, double historicAmount, const double *P, double velocity, double *out) {
  return struckPartials(bellAt(key, profile, historicAmount), P, velocity, (Heard *)out);
}
// strikeNote on n partials (f, a each, at in): f, strength, the curve's length, then the curve.
FORTE_EXPORT void carillon_strike_note(const double *in, int n, double *out) {
  const StrikeNote s = strikeNote((const Heard *)in, n, out + 3);
  out[0] = s.f; out[1] = s.strength; out[2] = s.curveN;
}
FORTE_EXPORT double carillon_air_absorption(double f, double T, double hr) { return airAbsorption(f, T, hr); }
FORTE_EXPORT double carillon_radiation_efficiency(int l, double ka) { return radiationEfficiency(l, ka); }

// The tests' hooks, on the engine of a handle (forte_engine): the voices in the order they were
// struck, and which one hangs at a key.
FORTE_EXPORT int carillon_voices(CarillonEngine *e) { return e->nVoices; }
// key, fading, dead, released, the clapper on, its contact (ms), its force pulse's width (ms), its
// peak force, its speed, the voice's age and level
FORTE_EXPORT void carillon_voice(CarillonEngine *e, int i, double *out) {
  const CarillonEngine::Voice &v = e->voice(i);
  const double x[] = {(double)v.key, (double)v.fading, (double)v.dead, (double)v.released, (double)v.cl.on, v.cl.ms, v.cl.fwhm, v.cl.Fmax, v.cl.v, v.age, v.level};
  for (int k = 0; k < 11; k++) out[k] = x[k];
}
// the index (in carillon_voice's order) of the voice at a key, or −1
FORTE_EXPORT int carillon_by_key(CarillonEngine *e, int key) {
  if (key < KEY_MIN || key > KEY_MAX) return -1;
  const int slot = e->byKey[key - KEY_MIN];
  for (int i = 0; i < e->nVoices; i++) if (e->order[i] == slot) return i;
  return -1;
}
}
