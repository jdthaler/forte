// pyrophone-web.cpp — the model's functions the page's views call (pyrophone/src/pyrophone-wasm.js),
// the page's tuning table for the engine, and the engine's test hooks (its tubes).

#include <memory>

#include "forte/web.h"
#include "pyrophone-engine.h"

using namespace forte::pyrophone;
using Voice = PyrophoneEngine::Voice;

// The views ask about the same tube again and again: keep its bifurcation analysis and tuning.
namespace {
struct Analysis { Bifurcation bif; Tuning tune; };
const Analysis &analysis(double bore, double damp, double xf, double lag) {
  static std::unique_ptr<Analysis> last;
  const TubeParams P = {bore, damp, xf, lag};
  if (!last || !(last->bif.P == P)) {
    last = std::make_unique<Analysis>();
    last->bif = bifurcation(P);
    last->tune = tuning(P, &last->bif);
  }
  return *last;
}
int putPoint(const OrbitPt &p, double *out) {
  int k = 0;
  for (double v : {p.A, p.beta, p.W, p.U0, p.y, p.stable ? 1.0 : 0.0}) out[k++] = v;
  for (double v : p.x) out[k++] = v;
  for (const Cx &c : p.Hq) { out[k++] = c.re; out[k++] = c.im; }
  return k;
}
OrbitPt getPoint(double W, double beta, const double *Hq) {
  OrbitPt p;
  p.W = W; p.beta = beta;
  for (int h = 0; h <= HB_H; h++) p.Hq[h] = {Hq[2 * h], Hq[2 * h + 1]};
  return p;
}
} // namespace

extern "C" {
// tube(P): N, then w, zeta, cf and g (N each), tau, xf, c1, c2.
FORTE_EXPORT int pyrophone_tube(double bore, double damp, double xf, double lag, double *out) {
  const Tube t = tube({bore, damp, xf, lag});
  int k = 0;
  out[k++] = t.N;
  for (const auto *a : {&t.w, &t.zeta, &t.cf, &t.g}) for (double v : *a) out[k++] = v;
  for (double v : {t.tau, t.xf, t.c1, t.c2}) out[k++] = v;
  return k;
}
// bifurcation(P) and tuning(P): the table (β_H, β_max, mode, fold or NaN, b0, db, the TUNE_N values
// W), then the families of modes 1 and 2: found, mode, the Hopf point's β and W, the fold (found, β,
// A, y), the number of points, and per point A, β, W, U₀, y, stable, x (HB_X) and Ĥ (HB_H + 1
// complex). Returns the count.
FORTE_EXPORT int pyrophone_bifurcation(double bore, double damp, double xf, double lag, double *out) {
  const Analysis &a = analysis(bore, damp, xf, lag);
  const Tuning &t = a.tune;
  int k = 0;
  for (double v : {t.betaH, t.betaMax, (double)t.mode, t.fold, t.b0, t.db}) out[k++] = v;
  for (double v : t.Ws) out[k++] = v;
  for (const Family &f : a.bif.fam) {
    for (double v : {f.found ? 1.0 : 0.0, (double)f.mode, f.hopf.beta, f.hopf.W, f.fold.found ? 1.0 : 0.0, f.fold.beta, f.fold.A, f.fold.y, (double)f.pts.size()}) out[k++] = v;
    for (const OrbitPt &p : f.pts) k += putPoint(p, out + k);
  }
  return k;
}
// orbitAt(sys, fam[m], beta): found, then the point as above.
FORTE_EXPORT int pyrophone_orbit_at(double bore, double damp, double xf, double lag, int m, double beta, double *out) {
  const Analysis &a = analysis(bore, damp, xf, lag);
  const Orbit o = orbitAt(a.bif.sys, a.bif.fam[m < 1 ? 0 : 1], beta);
  out[0] = o.found ? 1 : 0;
  return o.found ? 1 + putPoint(o.pt, out + 1) : 1;
}
// steadyY(bif, beta)
FORTE_EXPORT double pyrophone_steady_y(double bore, double damp, double xf, double lag, double beta) {
  return steadyY(analysis(bore, damp, xf, lag).bif.fam[0], beta);
}
// orbitSpectrum(sys, pt, listen) for an orbit's W, β and Ĥ (HB_H + 1 complex): HB_H levels.
FORTE_EXPORT void pyrophone_orbit_spectrum(double bore, double damp, double xf, double lag, double W, double beta, const double *Hq, double listen, double *out) {
  const auto s = orbitSpectrum(tube({bore, damp, xf, lag}), getPoint(W, beta, Hq), listen);
  for (int h = 0; h < HB_H; h++) out[h] = s[h];
}
// The views' orbitState(sys, pt, theta): the modes' η and η̇ at phase θ of the orbit (N each).
FORTE_EXPORT void pyrophone_orbit_state(double bore, double damp, double xf, double lag, double W, double beta, const double *Hq, double theta, double *out) {
  const Tube sys = tube({bore, damp, xf, lag});
  const OrbitPt pt = getPoint(W, beta, Hq);
  double *eta = out, *vel = out + sys.N;
  for (int j = 0; j < sys.N; j++) {
    eta[j] = 0; vel[j] = 0;
    for (int k = 1; k <= HB_H; k++) {
      const Cx a = modeAmp(sys, j, k, pt.W, pt.beta, pt.Hq[k]);
      const double c = std::cos(k * theta), sn = std::sin(k * theta);
      eta[j] += 2 * (a.re * c - a.im * sn);
      vel[j] += -2 * k * pt.W * (a.re * sn + a.im * c);
    }
  }
}
// root(sys, m, beta, taylor): growth rate and angular frequency (taylor ≠ 0: the delay
// Taylor-expanded, e^{−sτ} → 1 − sτ, as Magri & Juniper have it).
FORTE_EXPORT void pyrophone_root(double bore, double damp, double xf, double lag, int m, double beta, int taylor, double *out) {
  const Cx s = root(tube({bore, damp, xf, lag}), m, beta, taylor != 0);
  out[0] = s.re; out[1] = s.im;
}
FORTE_EXPORT double pyrophone_heat(double u) { return heat(u); }

// The page's tuning table, packed (PyrophoneEngine::offer).
FORTE_EXPORT int pyrophone_offer(PyrophoneEngine *e, const double *packed, int n) { return e->offer(packed, n) ? 1 : 0; }

// The hooks, on the engine of a handle (forte_engine): its tubes in order; each one's key, amp,
// amp2, W, h, beta, betaT, theta, keyDown, song, fade, peak, since, age, rel; and its arrays (0 m11,
// 1 m12, 2 m21, 3 m22, 4 b1, 5 eta, 6 vel). A tube stays where it is in the pool while it sounds.
FORTE_EXPORT int pyrophone_voices(PyrophoneEngine *e) { return e->nVoices; }
FORTE_EXPORT Voice *pyrophone_voice(PyrophoneEngine *e, int i) { return i >= 0 && i < e->nVoices ? e->voices[i] : nullptr; }
FORTE_EXPORT void pyrophone_voice_state(const Voice *v, double *out) {
  const double x[15] = {(double)v->key, v->amp, v->amp2, v->W, v->h, v->beta, v->betaT, v->theta, v->keyDown ? 1.0 : 0.0, v->song, (double)v->fade, v->peak, v->since, v->age, v->rel};
  for (int k = 0; k < 15; k++) out[k] = x[k];
}
FORTE_EXPORT double *pyrophone_voice_array(Voice *v, int which) {
  std::array<double, N_MODES> *a[7] = {&v->m11, &v->m12, &v->m21, &v->m22, &v->b1, &v->eta, &v->vel};
  return which >= 0 && which < 7 ? a[which]->data() : nullptr;
}
}
