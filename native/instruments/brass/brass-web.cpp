// brass-web.cpp — the model's functions the page's views and the tests call
// (brass/src/brass-wasm.js), and the engine's test hooks.

#include "forte/web.h"
#include <algorithm>
#include <cmath>

#include "brass-engine.h"
#include "forte/dsp.h"

using namespace forte::brass;

// A key's plan as the engine makes it: at the voice's own rate fs × os (set in fs).
static Plan planOf(int key, const double *P, double &fs, HornCut &cut) {
  cut = cutHorn((int)P[p::horn], P[p::bellSize], fs);
  const double f = forte::keyFreq(key) * tuningOf(P).ratio(key);
  const Plan g = planKey(cut, f, fs, false);
  const int os = g.octave <= -2 ? std::min(8, 1 << (-g.octave - 1)) : 1;
  fs *= os;
  return planKey(cut, f, fs, true);
}

extern "C" {
// A key's plan at fs: horn, octave, partial, f, scale, ext, Le, position, valves, fPeak, the
// oversampling, the regulation (out, 12 numbers).
FORTE_EXPORT void brass_plan(int key, const double *P, double fs, double *out) {
  HornCut cut;
  const double fs0 = fs;
  const Plan pl = planOf(key, P, fs, cut);
  const int os = (int)std::lround(fs / fs0);
  const double o[12] = {(double)pl.horn, (double)pl.octave, (double)pl.partial, pl.f, pl.scale, pl.ext, pl.Le, pl.position, (double)pl.valves, pl.fPeak, (double)os, regulation(pl.horn, key)};
  for (int i = 0; i < 12; i++) out[i] = o[i];
}
// The key's bore as the engine builds it: count, then lengths and radii (MAX_SEG each), cyl0, cyl1.
FORTE_EXPORT int brass_bore(int key, const double *P, double fs, double *out) {
  HornCut cut;
  const Plan pl = planOf(key, P, fs, cut);
  Bore b;
  buildBore(cut.horn, pl.scale, cut.bellSize, fs, b, cut.dCyl);
  const int nc = std::max(1, b.cyl1 - b.cyl0);
  for (int i = 0; i < b.n; i++) { out[i] = b.len[i] + (i >= b.cyl0 && i < b.cyl1 ? pl.ext / nc : 0); out[MAX_SEG + i] = b.rad[i]; }
  out[2 * MAX_SEG] = b.cyl0; out[2 * MAX_SEG + 1] = b.cyl1;
  return b.n;
}
FORTE_EXPORT int brass_max_seg() { return MAX_SEG; }
// |Z_in| (Pa s/m³) of the key's bore, slide set, at n frequencies from lo to hi (log spaced), and
// its phase after them; plunger as given.
FORTE_EXPORT void brass_impedance(int key, const double *P, double fs, double plunger, double lo, double hi, int n, double *out) {
  HornCut cut;
  const Plan pl = planOf(key, P, fs, cut);
  Bore b; Digital d;
  buildBore(cut.horn, pl.scale, cut.bellSize, fs, b, cut.dCyl);
  realize(b, fs, pl.ext, plunger, d);
  for (int i = 0; i < n; i++) {
    const double f = lo * std::pow(hi / lo, n > 1 ? (double)i / (n - 1) : 0);
    const auto z = inputImpedance(d, f, fs);
    out[i] = std::abs(z); out[n + i] = std::arg(z);
  }
}
// The bore's impedance peak near f for the key (its digital bore at fs, the slide set).
FORTE_EXPORT double brass_peak(int key, const double *P, double fs, double f, double span) {
  HornCut cut;
  const Plan pl = planOf(key, P, fs, cut);
  Bore b; Digital d;
  buildBore(cut.horn, pl.scale, cut.bellSize, fs, b, cut.dCyl);
  realize(b, fs, pl.ext, 0, d);
  return peakNear(d, fs, f, span);
}
// A straight tube of length len and radius r, closed at x = 0 by a rigid wall and radiating at
// the other end, run as the engine runs a bore (hot segments of `pieces`): its |Z_in| at f, so the
// tests can compare it with the transmission line's closed form.
FORTE_EXPORT double brass_tube_impedance(double len, double r, int pieces, double f, double fs, int lossless) {
  Bore b;
  b.n = pieces;
  for (int i = 0; i < pieces; i++) { b.len[i] = len / pieces; b.rad[i] = r; b.hot[i] = true; }
  b.cyl0 = 0; b.cyl1 = pieces; b.cupV = 0; b.mouthR = r;
  Digital d;
  realize(b, fs, 0, 0, d);
  if (lossless) for (int i = 0; i < d.n; i++) { d.lg[i] = 1; d.lp[i] = 0; }
  return std::abs(inputImpedance(d, f, fs));
}
FORTE_EXPORT double brass_profile(int horn, double bellSize, double x) { return profile(horn, bellSize, x); }
FORTE_EXPORT double brass_horn_length(int horn) { return hornLength(horn); }
FORTE_EXPORT double brass_shock_distance(double p, double f) { return shockDistance(p, f); }
FORTE_EXPORT double brass_mouth_pressure(double vel, double f, double breath) { return mouthPressure(vel, f, breath); }
// Harmonics after a plane wave runs down a lossless straight tube (propagate): nh amplitudes in out.
FORTE_EXPORT void brass_propagate(double L, int pieces, double p, double f, double fs, int iters, int nh, double *out) {
  propagate(L, pieces, p, f, fs, iters, nh, out);
}
FORTE_EXPORT void brass_loss_filter(double lambda, double fs, double scale, double *out) { lossFilter(lambda, fs, scale, out[0], out[1]); }

// The engine's voices (the tests): key, down, partial, octave, f, fMeasured, trim, lipTrim, p_m,
// lip swing (m), env, os, position (out, 13 numbers); 0 past the last.
FORTE_EXPORT int brass_voice(forte::Engine *e, int i, double *out) {
  auto *E = static_cast<BrassEngine *>(e);
  int k = 0;
  for (const BrassEngine::Voice &v : E->pool) {
    if (!v.active) continue;
    if (k++ != i) continue;
    const double o[13] = {(double)v.key, (double)v.down, (double)v.plan.partial, (double)v.plan.octave, v.plan.f * v.bendNow, v.fm, v.trim, v.lipTrim, v.pm, v.yMax - v.yMin, v.env, (double)v.os, v.plan.position};
    for (int j = 0; j < 13; j++) out[j] = o[j];
    return 1;
  }
  return 0;
}
FORTE_EXPORT void brass_ear(forte::Engine *e, int on) { static_cast<BrassEngine *>(e)->ear = on != 0; }
FORTE_EXPORT int brass_iterations(forte::Engine *e) { return static_cast<BrassEngine *>(e)->iterations(); }
}
