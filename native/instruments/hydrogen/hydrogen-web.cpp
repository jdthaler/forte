// hydrogen-web.cpp — the model's functions the page's views and the tests call
// (hydrogen/src/hydrogen-wasm.js).

#include <cmath>
#include <vector>

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

// A gas's lines: their count, and line i as (ratio to the reference line, vacuum wavelength nm, its
// upper and lower states, its clock (1: the slow ladder's), whether Case B traps it) into out[6].
FORTE_EXPORT int hydrogen_gas_lines(int gas) { return gasOf((GasKind)gas).lines; }
FORTE_EXPORT void hydrogen_gas_line(int gas, int i, double *out) {
  const Gas &a = gasOf((GasKind)gas);
  const Line &L = a.line[i];
  out[0] = L.ratio; out[1] = L.nm; out[2] = L.upper; out[3] = L.lower; out[4] = L.upper < a.slowStates; out[5] = L.trapped;
}
// Its states: count, and state i as (energy above the ground in Rydbergs, weight, code, Case A
// decay rate s⁻¹) into out[4]; the states the page's diagram shows into out (returns how many);
// the reference line's frequency (Hz).
FORTE_EXPORT int hydrogen_gas_states(int gas) { return gasOf((GasKind)gas).states; }
FORTE_EXPORT void hydrogen_gas_state(int gas, int i, double *out) {
  const Gas &a = gasOf((GasKind)gas);
  out[0] = a.E[i]; out[1] = a.g[i]; out[2] = a.code[i]; out[3] = a.gamma[i];
}
FORTE_EXPORT int hydrogen_gas_display(int gas, double *out) {
  const Gas &a = gasOf((GasKind)gas);
  for (size_t i = 0; i < a.display.size(); i++) out[i] = a.display[i];
  return (int)a.display.size();
}
FORTE_EXPORT double hydrogen_gas_ref_hz(int gas) { return gasOf((GasKind)gas).refHz; }
// A line's rate: the sum of its transitions' A (s⁻¹; helium's: a term's average over its J levels).
FORTE_EXPORT double hydrogen_gas_line_a(int gas, int line) {
  const Gas &a = gasOf((GasKind)gas);
  double s = 0;
  for (int x = a.lineStart[line]; x < a.lineStart[line + 1]; x++) s += a.tr[a.byLine[x]].A;
  return s;
}

// The steady glow for parameters P: every line of its gas's power (Rydbergs × s⁻¹ per unit pump)
// (hydrogen's: index lineOf(n, m)), and every state's population (hydrogen's: index stateOf(n, l)),
// into the buffer at hydrogen_result() (a gas has more lines than the scratch holds); returns the
// count.
static std::vector<double> result;
FORTE_EXPORT const double *hydrogen_result() { return result.data(); }
FORTE_EXPORT int hydrogen_steady_lines(const double *P) {
  const Lamp lamp = lampOf(P);
  const Gas &a = gasOf(lamp.gas);
  static std::vector<double> N;
  N.assign(a.states, 0);
  steady(lamp, N.data());
  result.assign(a.lines, 0);
  linePowers(lamp, N.data(), result.data());
  return a.lines;
}
FORTE_EXPORT int hydrogen_steady_populations(const double *P) {
  const Lamp lamp = lampOf(P);
  result.assign(gasOf(lamp.gas).states, 0);
  steady(lamp, result.data());
  return (int)result.size();
}
// The glow's step response for P: line (n, m)'s power at times t[0 … count) (s, the atom's time)
// after the switch-on, into out; and the steady value it tends to as the return value.
// (By line index: the times are the line's own clock's.)
FORTE_EXPORT double hydrogen_step_line(const double *P, int line, const double *t, int count, double *out) {
  Glow &g = glowOf(P);
  int j = -1;
  for (size_t i = 0; i < g.kept.size(); i++) if (g.kept[i] == line) j = (int)i;
  for (int i = 0; i < count; i++) {
    if (j < 0) { out[i] = 0; continue; }
    const bool slow = g.clockOf[j];
    g.ensure(slow ? 0 : t[i], slow ? t[i] : 0, Glow::ROWS);
    out[i] = slow ? g.powerAtRow(j, g.rowAt(t[i], 1)) : g.powerAt(j, t[i]);
  }
  return j < 0 ? 0 : g.steadyPower[j];
}
FORTE_EXPORT double hydrogen_step(const double *P, int n, int m, const double *t, int count, double *out) { return hydrogen_step_line(P, lineOf(n, m), t, count, out); }
// The glow's time grid's end (s): past it the step response is its steady value.
FORTE_EXPORT double hydrogen_glow_end(const double *P) { return glowOf(P).end(); }
FORTE_EXPORT double hydrogen_glow_end_slow(const double *P) { Glow &g = glowOf(P); return g.slow() ? g.end(1) : 0; }
// Line (n, m)'s natural FWHM in the glow for P (Hz, the atom's time).
FORTE_EXPORT double hydrogen_natural_width_line(const double *P, int line) {
  Glow &g = glowOf(P);
  for (size_t i = 0; i < g.kept.size(); i++) if (g.kept[i] == line) return g.width[i];
  return 0;
}
FORTE_EXPORT double hydrogen_natural_width(const double *P, int n, int m) { return hydrogen_natural_width_line(P, lineOf(n, m)); }
// Line (n, m)'s fine-structure components for P at α × scale: count, and (2j, 2j′, ratio, weight)
// for each in out.
FORTE_EXPORT int hydrogen_components_line(const double *P, int line, double scale, double *out) {
  Glow &g = glowOf(P);
  static Component c[MAX_COMPONENTS];
  const int k = components(g.lamp.gas, line, g.Nss.data(), scale, c);
  for (int i = 0; i < k; i++) { out[4 * i] = c[i].tj; out[4 * i + 1] = c[i].tk; out[4 * i + 2] = c[i].ratio; out[4 * i + 3] = c[i].weight; }
  return k;
}
FORTE_EXPORT int hydrogen_components(const double *P, int n, int m, double scale, double *out) {
  Glow &g = glowOf(P);
  static Component c[MAX_COMPONENTS];
  const int k = components(lineOf(n, m), g.Nss.data(), scale, c);
  for (int i = 0; i < k; i++) { out[4 * i] = c[i].tj; out[4 * i + 1] = c[i].tk; out[4 * i + 2] = c[i].ratio; out[4 * i + 3] = c[i].weight; }
  return k;
}
}
