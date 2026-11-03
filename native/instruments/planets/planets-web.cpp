// planets-web.cpp — the model's functions the page's views and the tests call
// (planets/src/planets-wasm.js).

#include <algorithm>
#include <cmath>
#include <numbers>
#include <vector>

#include "forte/web.h"
#include "planets-engine.h"
#include "planets-model.h"
#include "planets-params.h"

using namespace forte::planets;

namespace {
Response &cache() { static Response r; return r; }
}

extern "C" {
// The planets' table: count, and for planet i its radius (km), ₀S₂ (Hz), sidereal day (s), the
// deepest source in its table (km) and its number of multiplets
FORTE_EXPORT int planets_count() { return (int)(sizeof kPlanets / sizeof kPlanets[0]); }
FORTE_EXPORT double planets_radius(int i) { return kPlanets[i].R; }
FORTE_EXPORT double planets_f0s2(int i) { return kPlanets[i].f0S2; }
FORTE_EXPORT double planets_day(int i) { return kPlanets[i].day; }
FORTE_EXPORT double planets_max_depth(int i) { return kPlanets[i].depth[kDepths - 1]; }
FORTE_EXPORT int planets_table_count(int i) { return kPlanets[i].count; }
// Table row j of planet i: type, n, l, f (Hz), Q, χ, U, V, P at the surface, in out
FORTE_EXPORT void planets_table_mode(int i, int j, double *out) {
  const TableMode &m = kPlanets[i].modes[j];
  const double v[] = {(double)m.type, (double)m.n, (double)m.l, m.f, m.Q, m.chi, m.U, m.V, m.P};
  std::copy(v, v + 9, out);
}
// The time-lapse of a key: the planet's ₀S₂ on the key's tuned frequency
FORTE_EXPORT double planets_speedup(int key, const double *P) { return speedup(key, P); }
FORTE_EXPORT double planets_half_duration(double velocity, const double *P) { return halfDuration(magnitude(velocity, P), P); }
FORTE_EXPORT double planets_magnitude(double velocity, const double *P) { return magnitude(velocity, P); }
// The station's colatitude and longitude (rad), with the quake at longitude 0
FORTE_EXPORT void planets_station(const double *P, double *out) { stationAt(P, out[0], out[1]); }
// The multiplets a key's note plays, loudest first, up to max: for each its frequency (Hz, as
// heard), its initial amplitude (both channels, the singlets added), its decay (1/s, as heard),
// type, n and l. Returns the count.
FORTE_EXPORT int planets_multiplets(int key, double velocity, const double *P, double *out, int max) {
  Response &r = cache();
  respond(P, r);
  const double K = speedup(key, P), mw = magnitude(velocity, P), h = halfDuration(mw, P);
  const double scale = std::pow(10.0, 1.5 * (mw - MW_REF));
  struct Row { double f, a, d; int type, n, l; };
  std::vector<Row> rows;
  for (const Multiplet &m : r.m) {
    double lr = 0, li = 0, rr = 0, ri = 0;
    for (int k = 0; k <= 2 * m.l; k++) { lr += r.cL[m.off + 2 * k]; li += r.cL[m.off + 2 * k + 1]; rr += r.cR[m.off + 2 * k]; ri += r.cR[m.off + 2 * k + 1]; }
    const double a = scale * sourceSpectrum(m.w, h) * std::sqrt(0.5 * (lr * lr + li * li + rr * rr + ri * ri));
    rows.push_back({K * m.w / (2 * std::numbers::pi), a, K * m.decay, m.type, m.n, m.l});
  }
  std::stable_sort(rows.begin(), rows.end(), [](const Row &a, const Row &b) { return a.a > b.a; });
  const int n = std::min(max, (int)rows.size());
  for (int i = 0; i < n; i++) {
    const double v[] = {rows[i].f, rows[i].a, rows[i].d, (double)rows[i].type, (double)rows[i].n, (double)rows[i].l};
    std::copy(v, v + 6, out + 6 * i);
  }
  return n;
}
// The ground's radial displacement at n points (θ, φ pairs, rad) t seconds (the planet's time)
// after a quake played at this velocity, from the spheroidal multiplets of degree ≤ lmax
FORTE_EXPORT void planets_field(double velocity, const double *P, int lmax, double t, int n, const double *pts, double *out) {
  Response &r = cache();
  respond(P, r);
  const double mw = magnitude(velocity, P);
  for (int i = 0; i < n; i++) out[i] = radialAt(r, P, mw, lmax, pts[2 * i], pts[2 * i + 1], t);
}
// For the tests: the fully normalised Legendre functions and their θ-derivatives up to L
FORTE_EXPORT void planets_legendre(int L, double theta, double *P, double *dP) { legendre(L, theta, P, dP); }
// For the tests: a voice's oscillators (sounding voices, in the engine's order)
FORTE_EXPORT int planets_voice_oscillators(forte::Engine *e, int v) {
  auto *eng = static_cast<PlanetEngine *>(e);
  return v >= 0 && v < PlanetEngine::MAX_VOICES && eng->voices[v].on ? eng->voices[v].count : -1;
}
}
