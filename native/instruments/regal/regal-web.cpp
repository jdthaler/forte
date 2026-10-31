// regal-web.cpp — the model's functions the page's views and the tests call
// (regal/src/regal-wasm.js), the tuning tool's measure, and the engine's test hooks.

#include "forte/web.h"
#include <algorithm>
#include <cmath>

#include "regal-engine.h"

using namespace forte::regal;

static Voicing voicingOf(const double *P) {
  Voicing v;
  v.curve = P[p::curve]; v.thick = P[p::thickness]; v.q = P[p::q];
  v.leather = (int)P[p::facing] == facing_::leather;
  v.shape = (int)P[p::resonator]; v.resLen = P[p::resLength];
  return v;
}

// A reed as flat numbers (regal-wasm.js, reedOf): f0, fNat, L, b, h, M, m, k, S, c, h0, bs, Ls,
// Ks, zc, Vb, ds, the tube's segment count, then its lengths and areas (MAX_SEG each).
constexpr int HEAD = 18, FLAT_N = HEAD + 2 * MAX_SEG;
static void flatten(const Reed &R, double *o) {
  const double head[HEAD] = {R.f0, R.fNat, R.L, R.b, R.h, R.M, R.m, R.k, R.S, R.c, R.h0, R.bs, R.Ls, R.Ks, R.zc, R.Vb, R.ds, (double)R.tube.n};
  for (int i = 0; i < HEAD; i++) o[i] = head[i];
  for (int i = 0; i < MAX_SEG; i++) { o[HEAD + i] = R.tube.len[i]; o[HEAD + MAX_SEG + i] = R.tube.area[i]; }
}

static Reed scratchReed;

// s: the window the tuning measures the pitch over (the bass settles slowly)
static double T0(double f0) { return f0 < 100 ? 0.8 : 0.4; }
static double T1(double f0) { return f0 < 100 ? 1.6 : 1.0; }

// The tuning ratio that cuts a tongue of voicing v (its resonator cut `off` harmonics from one of the
// note's) to sound f0 at P0 and fs: scan the cut for the first crossing of the note, then close in by
// regula falsi. The best found, and how many cents off it sounds in err (NaN if it never speaks).
static double tuneFor(double f0, const Voicing &v, double fs, double P0, double off, double &err) {
  const auto cents = [&](double tune) {
    design(f0, tune, v, scratchReed, off);
    const double f = measureReed(scratchReed, fs, P0, T0(f0), T1(f0));
    return f > 0 ? 1200 * std::log2(f / f0) : NAN;
  };
  double a = 0.8, ca = cents(a), best = 0, bestC = INFINITY;
  for (double b = a + 0.04; b <= 2.4; b += 0.04) {
    const double cb = cents(b);
    if (std::fabs(cb) < bestC) { bestC = std::fabs(cb); best = b; }
    if (ca == ca && cb == cb && ca > 0 && cb <= 0) {
      double lo = a, hi = b, clo = ca, chi = cb;
      for (int it = 0; it < 30; it++) {
        const double m = std::clamp(lo + (hi - lo) * clo / (clo - chi), lo + 0.02 * (hi - lo), hi - 0.02 * (hi - lo)), cm = cents(m);
        if (std::fabs(cm) < bestC) { bestC = std::fabs(cm); best = m; }
        if (!(cm == cm) || std::fabs(cm) < 0.01) break;
        if (cm > 0) { lo = m; clo = cm; } else { hi = m; chi = cm; }
      }
      break;
    }
    a = b; ca = cb;
  }
  err = bestC;
  return best;
}

extern "C" {
FORTE_EXPORT int regal_flat_size() { return FLAT_N; }
FORTE_EXPORT int regal_max_seg() { return MAX_SEG; }
// The reed a key's rank sounds with, for parameters P (indexed as in regal-params.h), in out.
FORTE_EXPORT void regal_reed(int key, int rank, const double *P, double *out) {
  designKey(key, rank, voicingOf(P), tuningOf(P), scratchReed);
  flatten(scratchReed, out);
}
// The same reed's tube's input impedance at f: |Z| and its phase in out (lossless = 1: no losses).
FORTE_EXPORT void regal_impedance(int key, int rank, const double *P, double f, int lossless, double *out) {
  designKey(key, rank, voicingOf(P), tuningOf(P), scratchReed);
  const auto Z = inputImpedance(scratchReed.tube, f, lossless != 0);
  out[0] = std::abs(Z); out[1] = std::arg(Z);
}
// Its first impedance peak (Hz) between fLo and fHi.
FORTE_EXPORT double regal_first_peak(int key, int rank, const double *P, double fLo, double fHi) {
  designKey(key, rank, voicingOf(P), tuningOf(P), scratchReed);
  return firstPeak(scratchReed.tube, fLo, fHi);
}
// A tube of one cylinder (length, area): its input impedance and first peak, for the tests.
FORTE_EXPORT void regal_cylinder_impedance(double len, double area, double f, int lossless, double *out) {
  Tube t; t.add(len, area);
  const auto Z = inputImpedance(t, f, lossless != 0);
  out[0] = std::abs(Z); out[1] = std::arg(Z);
}
FORTE_EXPORT double regal_cylinder_peak(double len, double area, double fLo, double fHi) { Tube t; t.add(len, area); return firstPeak(t, fLo, fHi); }
FORTE_EXPORT double regal_end_correction(double area) { Tube t; t.add(1, area); return endCorrection(t); }
FORTE_EXPORT void regal_contact(double q, double h0, double *out) { contact(q, h0, out[0], out[1]); }
FORTE_EXPORT double regal_gap_area(double q, double h0, double bs, double Ls) { return gapArea(q, h0, bs, Ls); }
FORTE_EXPORT double regal_cantilever(double L, double h, double b, double M) { return cantileverFreq(L, h, b, M); }
FORTE_EXPORT double regal_tune_ratio(double f0, int shape) { return tuneRatio(f0, shape); }
FORTE_EXPORT double regal_tune_offset(double f0, int shape) { return tuneOffset(f0, shape); }
// The voicer's retuning for a key's rank at parameters P, the bellows weighted to P0 (cents sharp).
FORTE_EXPORT double regal_voicing_cents(int key, int rank, const double *P, double P0) {
  designKey(key, rank, voicingOf(P), tuningOf(P), scratchReed);
  return voicingCents(scratchReed.f0, voicingOf(P), P0);
}
FORTE_EXPORT double regal_bellows_pressure(double P0, double fill) { return bellowsPressure(P0, fill); }
// The pitch a key's rank sounds alone (the reed in its tube, the chest held at P0), over [t0, t1] s.
FORTE_EXPORT double regal_measure(int key, int rank, const double *P, double fs, double P0, double t0, double t1, unsigned seed) {
  designKey(key, rank, voicingOf(P), tuningOf(P), scratchReed);
  const double f0 = scratchReed.f0;
  return measureReed(scratchReed, fs, P0, t0 < 0 ? T0(f0) : t0, t1 < 0 ? T1(f0) : t1, seed ? seed : 12345);
}
// The tuning tool: the ratio that cuts a tongue of shape `shape` (default voicing), its resonator cut
// `off` harmonics from one of the note's, to sound f0 at P0 and fs; out[0] how many cents off it
// sounds then.
FORTE_EXPORT double regal_tune(double f0, int shape, double fs, double P0, double off, double *out) {
  Voicing v; v.shape = shape;
  return tuneFor(f0, v, fs, P0, off, out[0]);
}

// A reed of shape `shape` (default voicing) cut with tuning ratio `tune` for f0: the pitch it sounds.
FORTE_EXPORT double regal_measure_cut(double f0, int shape, double tune, double off, double fs, double P0) {
  Voicing v; v.shape = shape;
  design(f0, tune, v, scratchReed, off);
  return measureReed(scratchReed, fs, P0, T0(f0), T1(f0));
}

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void regal_configure(RegalEngine *e, unsigned seed, double fOS) { e->configure(seed, fOS); }
// The wind: P_bellows, P_chest, fill 0, fill 1, active, draw (m³/s).
FORTE_EXPORT void regal_wind(RegalEngine *e, double *out) {
  out[0] = e->Pbel; out[1] = e->Pw; out[2] = e->fill[0]; out[3] = e->fill[1]; out[4] = e->active; out[5] = e->draw;
}
// Voice i: key, down, pallet open, fading, then per rank: awake, level (output units), P_boot, q (mm).
FORTE_EXPORT int regal_voice(RegalEngine *e, int i, double *out) {
  if (i < 0 || i >= e->count) return 0;
  const auto &v = *e->voices[i];
  out[0] = v.key; out[1] = v.down; out[2] = v.open; out[3] = v.fading;
  for (int r = 0; r < NRANKS; r++) {
    const auto &s = v.sim[r];
    out[4 + 4 * r] = !s.asleep; out[5 + 4 * r] = s.R ? s.env * 0.06 * s.R->gain : 0; out[6 + 4 * r] = s.Pb; out[7 + 4 * r] = 1e3 * s.q;
  }
  return 1;
}
// How many reeds are awake, and how many of them run at 2×.
FORTE_EXPORT int regal_awake(RegalEngine *e, int twice) {
  int n = 0;
  for (int i = 0; i < e->count; i++) for (const auto &s : e->voices[i]->sim) if (!s.asleep && (!twice || s.os == 2)) n++;
  return n;
}
}
