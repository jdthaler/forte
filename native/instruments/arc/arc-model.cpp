// arc-model.cpp — the physics of the singing arc (arc/src/arc-model.js), operation for operation.

#include "arc-model.h"

#include <cmath>
#include <cstring>

#include "arc-params.h"
#include "forte/fdlibm.h"

namespace forte::arc {

// Math.max and Math.min: NaN if either is NaN
static double jmax(double a, double b) { return a != a || b != b ? NAN : a > b ? a : b; }
static double jmin(double a, double b) { return a != a || b != b ? NAN : a < b ? a : b; }
// Math.hypot as V8 computes it (scaled by the largest, Kahan-compensated sum)
static double jsHypot(double a, double b) {
  const double x = std::fabs(a), y = std::fabs(b), mx = std::max(x, y);
  if (mx == 0) return 0;
  if (std::isinf(mx)) return INFINITY;
  double sum = 0, comp = 0;
  for (double v : {x, y}) {
    const double n = v / mx, summand = n * n - comp, prelim = sum + summand;
    comp = (prelim - sum) - summand;
    sum = prelim;
  }
  return std::sqrt(sum) * mx;
}

double keyFreq(double m) { return 440 * fdlibm::pow(2.0, (m - 69) / 12); }

ArcParams arcParams(const double *P) {
  ArcParams a;
  a.current = P[p::current]; a.gap = P[p::gap]; a.tau = P[p::tau]; a.restrike = P[p::restrike];
  a.coil = P[p::coil]; a.coilR = P[p::coilR]; a.tune = (int)P[p::tune]; a.talk = (int)P[p::mode] == mode_::talk;
  return a;
}

// ---- the arc ----------------------------------------------------------------------------------

Op arcOp(const ArcParams &P) {
  Op op{};
  const double I0 = P.current, l = P.gap, A = AYRTON.a + AYRTON.b * l, B = AYRTON.c + AYRTON.d * l, tau = P.tau * 1e-6;
  const double V0 = A + B / I0, Ur = P.restrike * V0, Xm = B / (Ur - A);
  op.I0 = I0; op.l = l; op.A = A; op.B = B; op.tau = tau; op.V0 = V0; op.Ur = Ur; op.Xm = Xm; op.delta = FLOOR_SHARP * Xm;
  const double G0 = cond(I0, op);
  op.G0 = G0; op.u0 = I0 / G0; op.R0 = 1 / G0;
  op.w = wOf(I0, op);
  op.K = I0 * op.R0 * dlnG(I0, op);
  op.Rd = op.R0 - op.K;
  op.kappa = 2 * op.w - 1;
  op.Larc = (op.K * tau) / (2 * op.w);
  op.Rb = (SUPPLY.E - op.u0) / I0;
  return op;
}
double xEff(double X, const Op &op) { const double d = X - op.Xm; return 0.5 * (X + op.Xm + std::sqrt(d * d + op.delta * op.delta)); }
double cond(double X, const Op &op) { const double Xe = xEff(X, op); return (Xe * Xe) / (op.A * Xe + op.B); }
double dlnG(double X, const Op &op) {
  const double d = X - op.Xm, r = std::sqrt(d * d + op.delta * op.delta), Xe = 0.5 * (X + op.Xm + r), dXe = 0.5 * (1 + d / r);
  return (dXe * (op.A * Xe + 2 * op.B)) / (Xe * (op.A * Xe + op.B));
}
double wOf(double X, const Op &op) { return (op.A * X + op.B) / (op.A * X + 2 * op.B); }
double flow(double X, double i, const Op &op) { return (wOf(X, op) / op.tau) * ((i * i - X * X) / X); }
double flowDX(double X, double i, const Op &op) {
  const double A = op.A, B = op.B, w = wOf(X, op), q = A * X + 2 * B, dw = (A * B) / (q * q);
  return (dw * ((i * i - X * X) / X) - w * ((i * i) / (X * X) + 1)) / op.tau;
}
double flowDi(double X, double i, const Op &op) { return (wOf(X, op) / op.tau) * ((2 * i) / X); }
double staticV(double I, const Op &op) { return I / cond(std::fabs(I), op); }

Cx zArc(double omega, const Op &op) {
  const double a = 2 * op.w, b = omega * op.tau, den = a * a + b * b;
  return {op.R0 - (op.K * a * a) / den, (op.K * a * b) / den};
}
double negLimit(const Op &op) { return op.K > op.R0 ? (2 * op.w * std::sqrt(op.K / op.R0 - 1)) / op.tau : 0; }

// ---- complex helpers ----------------------------------------------------------------------------

static Cx cmul(Cx a, Cx b) { return {a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re}; }
static Cx cdiv(Cx a, Cx b) { const double d = b.re * b.re + b.im * b.im; return {(a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d}; }
static Cx cadd(Cx a, Cx b) { return {a.re + b.re, a.im + b.im}; }
// polynomials as (coefficients, length)
struct Poly { double c[9] = {}; int n = 0; };
static Poly pmul(const Poly &p, const Poly &q) {
  Poly r; r.n = p.n + q.n - 1;
  for (int i = 0; i < p.n; i++) for (int j = 0; j < q.n; j++) r.c[i + j] += p.c[i] * q.c[j];
  return r;
}
static Poly padd(const Poly &p, const Poly &q) {
  Poly r; r.n = std::max(p.n, q.n);
  for (int i = 0; i < r.n; i++) r.c[i] = (i < p.n ? p.c[i] : 0) + (i < q.n ? q.c[i] : 0);
  return r;
}

void polyRoots(const double *c, int n, Cx *z) {
  double a[9];
  const double lead = c[n];
  for (int k = 0; k <= n; k++) a[k] = c[k] / lead;
  auto ev = [&](Cx x) { Cx r{1, 0}; for (int k = n - 1; k >= 0; k--) r = cadd(cmul(r, x), {a[k], 0}); return r; };
  double mx = -INFINITY;
  for (int k = 0; k < n; k++) mx = jmax(mx, std::fabs(a[k]));
  for (int k = 0; k < n; k++) {
    const double ph = 0.4 + (TAU * k) / n, m = 1 + fdlibm::pow(mx, 1.0 / n);
    z[k] = {m * fdlibm::cos(ph), m * fdlibm::sin(ph)};
  }
  Cx nz[8];
  for (int it = 0; it < 500; it++) {
    double moved = 0;
    for (int i = 0; i < n; i++) {
      const Cx zi = z[i];
      Cx d{1, 0};
      for (int j = 0; j < n; j++) if (j != i) d = cmul(d, {zi.re - z[j].re, zi.im - z[j].im});
      const Cx step = cdiv(ev(zi), d);
      moved = jmax(moved, jsHypot(step.re, step.im) / (1 + jsHypot(zi.re, zi.im)));
      nz[i] = {zi.re - step.re, zi.im - step.im};
    }
    for (int i = 0; i < n; i++) z[i] = nz[i];
    if (moved < 1e-14) break;
  }
}

// ---- the circuit: linear analysis ---------------------------------------------------------------

Circuit circuit(const ArcParams &P, double C, const Op &op) {
  return {op, C, P.talk ? TALK.L : P.coil * 1e-3, P.talk ? TALK.R : P.coilR, SUPPLY.Lb, op.Rb};
}

Linear linearAnalysis(const Circuit &ckt) {
  const Op &op = ckt.op;
  const double C = ckt.C, L = ckt.L, R = ckt.R, Lb = ckt.Lb, Rb = ckt.Rb;
  const double w0 = 1 / std::sqrt(L * C), tw = op.tau * w0, a = 2 * op.w;
  const Poly Da{{a, tw}, 2}, Na{{a * op.R0 - a * op.K, op.R0 * tw}, 2};
  const Poly Zb{{Rb, Lb * w0}, 2}, Nlc{{1, R * C * w0, 1}, 3}, sC{{0, C * w0}, 2};
  const Poly poly = padd(pmul(pmul(Da, Zb), Nlc), pmul(Na, padd(Nlc, pmul(sC, Zb))));
  Linear out{};
  Cx z[8];
  polyRoots(poly.c, poly.n - 1, z);
  for (int k = 0; k < 4; k++) out.roots[k] = {z[k].re * w0, z[k].im * w0};
  Cx s = out.roots[0];
  for (const Cx &r : out.roots) if (r.im > s.im) s = r;
  out.s = s; out.sigma = s.re; out.f = s.im / TAU; out.fLC = w0 / TAU;
  return out;
}

double thresholdR(const ArcParams &P, double C) {
  auto g = [&](double R) { ArcParams Q = P; Q.coilR = R; return linearAnalysis(circuit(Q, C)).sigma; };
  double lo = 0, hi = 50;
  if (g(lo) <= 0) return 0;
  if (g(hi) > 0) return hi;
  for (int i = 0; i < 60; i++) { const double m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}
double thresholdCurrent(const ArcParams &P, double C) {
  auto g = [&](double I) { ArcParams Q = P; Q.current = I; return linearAnalysis(circuit(Q, C)).sigma; };
  double lo = 0, hi = 0, prev = g(1);
  for (int k = 1; k <= 48; k++) {
    const double I = 1 * fdlibm::pow(60.0, k / 48.0), v = g(I);
    if (prev > 0 && v <= 0) { lo = fdlibm::pow(60.0, (k - 1) / 48.0); hi = I; }
    prev = v;
  }
  if (!hi) return prev > 0 ? INFINITY : 0;
  for (int i = 0; i < 50; i++) { const double m = std::sqrt(lo * hi); if (g(m) > 0) lo = m; else hi = m; }
  return std::sqrt(lo * hi);
}
double upperLimit(const ArcParams &P) {
  const double L = P.coil * 1e-3;
  auto g = [&](double f) { return linearAnalysis(circuit(P, kelvinC(f, L))).sigma; };
  double lo = 20, hi = 2e5;
  if (g(lo) <= 0) return 0;
  if (g(hi) > 0) return hi;
  for (int i = 0; i < 60; i++) { const double m = std::sqrt(lo * hi); if (g(m) > 0) lo = m; else hi = m; }
  return std::sqrt(lo * hi);
}

// ---- the steady note ----------------------------------------------------------------------------

Steady steadyNote(const ArcParams &P, double C, const SteadyOptions &o, const Op &op) {
  const int M = o.M, measure = o.measure;
  const double kick = o.kick < 0 ? 0.7 * P.current : o.kick, settle = o.settle;
  const double L = P.talk ? TALK.L : P.coil * 1e-3, R = P.talk ? TALK.R : P.coilR;
  const double A = op.A, B = op.B, Xm = op.Xm, tau = op.tau, del2 = op.delta * op.delta, E = SUPPLY.E, Lb = SUPPLY.Lb, Rb = op.Rb;
  const double f0 = 1 / (TAU * std::sqrt(L * C)), h = 1 / (f0 * M), h2 = h / 2;
  const double z = (h * 2 * op.w) / tau, th = jmax(0.5, 1 - 1 / z);
  const double as = Lb / h + Rb / 2, bs = 1 / (2 * as), ac = L / h + R / 2, bc = 1 / (2 * ac), D = C + h2 * bc, q = (h2 * bc) / D;
  double is = op.I0, ic = kick, vC = op.u0, X = op.I0, ia = is - ic, u = ia / cond(X, op);
  const double nSettle = jmax(12, std::ceil(settle * f0)) * M, nTot = nSettle + measure * M;
  double prev = ic, first = -1, last = -1, iaMin = INFINITY, iaMax = -INFINITY, uMax = -INFINITY, i2 = 0, peak0 = 0, peak1 = 0;
  int count = 0, n2 = 0;
  for (double n = 0; n < nTot; n++) {
    const double a_s = (is * Lb / h + E - 0.5 * Rb * is - 0.5 * u) / as;
    const double a_c = (ic * L / h + 0.5 * (u - R * ic - vC)) / ac;
    const double p = (C * vC + h2 * (ic + a_c)) / D;
    const double J = a_s - (a_c - bc * p), GN = bs + bc * (1 - q);
    const double Fold = flow(X, ia, op);
    double Y = jmin(jmax(X + h * Fold, 0.5 * X), 2 * X + Xm);
    for (int it = 0; it < 30; it++) {
      const double d = Y - Xm, rr = std::sqrt(d * d + del2), Xe = 0.5 * (Y + Xm + rr), dXe = 0.5 * (1 + d / rr), den = A * Xe + B;
      const double G = (Xe * Xe) / den, dG = (G * dXe * (A * Xe + 2 * B)) / (Xe * den), S = GN + G, iN = (G * J) / S;
      const double res = Y - X - h * ((1 - th) * Fold + th * flow(Y, iN, op));
      const double dres = 1 - h * th * (flowDX(Y, iN, op) + flowDi(Y, iN, op) * ((J * GN * dG) / (S * S)));
      double Yn = Y - res / dres;
      Yn = jmin(jmax(Yn, 0.5 * Y), 2 * Y + Xm);
      const bool done = std::fabs(Yn - Y) < 1e-11 * (Y + Xm);
      Y = Yn;
      if (done) break;
    }
    X = jmax(Y, 1e-3 * Xm);
    const double G = cond(X, op);
    u = J / (GN + G); ia = G * u; is = a_s - bs * u;
    const double vn = p + q * u, icn = a_c + bc * (u - vn);
    vC = vn;
    if (n >= nSettle) {
      if (prev < 0 && icn >= 0) { const double t = n - icn / (icn - prev); if (first < 0) first = t; last = t; count++; }
      iaMin = jmin(iaMin, ia); iaMax = jmax(iaMax, ia); uMax = jmax(uMax, u); i2 += icn * icn; n2++;
      if (n < nSettle + 4 * M) peak0 = jmax(peak0, std::fabs(icn)); else if (n >= nTot - 4 * M) peak1 = jmax(peak1, std::fabs(icn));
    }
    prev = icn; ic = icn;
    if (!std::isfinite(ic)) break;
  }
  const bool dying = !(peak1 > 1e-3 * op.I0) || peak1 < 0.97 * peak0;
  const double f = count > 2 && !dying ? (count - 1) / ((last - first) * h) : NAN;
  return {f, iaMin, iaMax, uMax, std::sqrt(i2 / std::max(1, n2))};
}

// ---- the keyboard's capacitors ------------------------------------------------------------------

double startCap(int key, const ArcParams &P, const Op &op) {
  const double f = keyFreq(key), L = P.coil * 1e-3;
  double C = kelvinC(f, L);
  for (int it = 0; it < 4; it++) {
    const double fs = linearAnalysis(circuit(P, C, op)).f;
    if (!(fs > 0)) break;
    const double r = fs / f;
    C *= r * r;
  }
  return C;
}
double capFor(int key, const ArcParams &P, const Op &op) {
  const double f = keyFreq(key), L = P.coil * 1e-3;
  if (P.tune == tune_::kelvin) return kelvinC(f, L);
  double C = startCap(key, P, op);
  const double lin = C;
  for (int it = 0; it < 5; it++) {
    const Steady r = steadyNote(P, C, {}, op);
    if (!(r.f > 0)) return lin;
    const double c = 1200 * std::log2(r.f / f), x = r.f / f;
    C *= x * x;
    if (std::fabs(c) < 0.1) break;
  }
  return C;
}
uint64_t tuneVersion(const ArcParams &P) {
  uint64_t h = 1469598103934665603ull;
  auto add = [&](double v) {
    v += 0.0;
    uint64_t b;
    std::memcpy(&b, &v, 8);
    for (int k = 0; k < 8; k++) { h ^= (b >> (8 * k)) & 0xff; h *= 1099511628211ull; }
  };
  for (double v : {P.current, P.gap, P.tau, P.restrike, P.coil, P.coilR, (double)P.tune}) add(v);
  return h | 1; // never 0
}

double hissFactor(double I, double l) {
  const double Ih = hissCurrent(l), x = jmin(1, jmax(0, (I - Ih) / (HISS.width * Ih)));
  return x * x * (3 - 2 * x);
}

} // namespace forte::arc
