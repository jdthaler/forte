// pyrophone-model.cpp — pyrophone/src/pyrophone-model.js in C++, operation for operation.

#include "pyrophone-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::pyrophone {

namespace fd = forte::fdlibm;
constexpr double PI = std::numbers::pi;

const double C_HOT = 331.3 * std::sqrt(T_HOT / 273.15);
const double GAIN = std::sqrt(3.0) / 2;
static const double NU = 2.6e-5;                          // m²/s, kinematic viscosity of air at 400 K
static const double KAPPA = 1 + 0.4 / std::sqrt(0.7);     // 1 + (γ−1)/√Pr: viscous + thermal wall loss
static const double L_REF = 0.6;                          // m, tube length at which c₂ is evaluated
static const double S3 = std::sqrt(1.0 / 3);

double heat(double u) { return std::sqrt(std::min(U_SAT, std::fabs(1.0 / 3 + u))) - S3; }

double hypot2(double a, double b) {
  a = std::fabs(a); b = std::fabs(b);
  const double max = std::max(a, b);
  if (max == INFINITY) return INFINITY;
  if (std::isnan(a) || std::isnan(b)) return NAN;
  if (max == 0) return 0;
  double sum = 0, comp = 0;
  for (double v : {a, b}) {
    const double n = v / max, summand = n * n - comp, pre = sum + summand;
    comp = (pre - sum) - summand;
    sum = pre;
  }
  return std::sqrt(sum) * max;
}

// JavaScript's x || y for numbers: y where x is 0 or NaN
static inline double orElse(double x, double y) { return x == 0 || std::isnan(x) ? y : x; }

Damping damping(double bore, double damp) {
  return {damp * fd::pow(PI * bore, 2), (damp * KAPPA * std::sqrt((2 * PI * NU) / (C_HOT * L_REF))) / bore};
}

Tube tubeC(double c1, double c2, double xf, double lag) {
  Tube t;
  for (int j = 1; j <= N_MODES; j++) {
    const double wj = j * PI;
    t.w[j - 1] = wj;
    t.zeta[j - 1] = c1 * j * j + c2 * std::sqrt((double)j);
    t.cf[j - 1] = fd::cos(wj * xf);
    t.g[j - 1] = -2 * wj * fd::sin(wj * xf);
  }
  t.tau = lag; t.xf = xf; t.c1 = c1; t.c2 = c2;
  return t;
}
Tube tube(const TubeParams &P) {
  const Damping d = damping(P.bore, P.damp);
  return tubeC(d.c1, d.c2, P.xf, P.lag);
}

// ---- complex helpers -----------------------------------------------------------------------
static inline Cx cmul(Cx a, Cx b) { return {a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re}; }
static inline Cx cdiv(Cx a, Cx b) { const double d = b.re * b.re + b.im * b.im; return {(a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d}; }
static inline Cx cexp(Cx a) { const double e = fd::exp(a.re); return {e * fd::cos(a.im), e * fd::sin(a.im)}; }
static inline Cx poly(const Tube &sys, int j, Cx s) {
  return {s.re * s.re - s.im * s.im + sys.zeta[j] * s.re + sys.w[j] * sys.w[j], 2 * s.re * s.im + sys.zeta[j] * s.im};
}

Cx transfer(const Tube &sys, Cx s) {
  double re = 0, im = 0;
  for (int j = 0; j < sys.N; j++) { const Cx r = cdiv({sys.cf[j] * sys.g[j], 0}, poly(sys, j, s)); re += r.re; im += r.im; }
  return {re, im};
}

// ---- linear stability ------------------------------------------------------------------------
// F_m(s) = P_m(s) − (√3/2) β e^{−sτ} [cf_m g_m + P_m(s) Σ_{j≠m} cf_j g_j / P_j(s)], regular near mode m.
static Cx charF(const Tube &sys, int m, double beta, Cx s, bool taylor) {
  const Cx Pm = poly(sys, m, s);
  Cx sum = {sys.cf[m] * sys.g[m], 0};
  for (int j = 0; j < sys.N; j++) if (j != m) { const Cx r = cmul(Pm, cdiv({sys.cf[j] * sys.g[j], 0}, poly(sys, j, s))); sum.re += r.re; sum.im += r.im; }
  const Cx lag = taylor ? Cx{1 - s.re * sys.tau, -s.im * sys.tau} : cexp({-s.re * sys.tau, -s.im * sys.tau});
  const Cx t = cmul(lag, sum);
  return {Pm.re - GAIN * beta * t.re, Pm.im - GAIN * beta * t.im};
}
template <class F>
static Cx newton(F f, Cx s) {
  for (int it = 0; it < 40; it++) {
    const Cx Fs = f(s);
    const double h = 1e-7;
    const Cx Fh = f({s.re + h, s.im});
    const Cx d = cdiv(Fs, {(Fh.re - Fs.re) / h, (Fh.im - Fs.im) / h});
    s = {s.re - d.re, s.im - d.im};
    if (hypot2(d.re, d.im) < 1e-12) break;
  }
  return s;
}
static Cx start(const Tube &sys, int m) {
  const double z = sys.zeta[m], w = sys.w[m];
  return {-z / 2, std::sqrt(std::max(w * w - z * z / 4, 1e-9))};
}

Cx root(const Tube &sys, int m, double beta, bool taylor) {
  Cx s = start(sys, m);
  const int steps = std::max(1, (int)std::ceil(std::fabs(beta) / 0.02));
  for (int k = 1; k <= steps; k++) {
    const double b = (beta * k) / steps;
    s = newton([&](Cx x) { return charF(sys, m, b, x, taylor); }, s);
  }
  return s;
}

Hopf hopf(const Tube &sys, int m, double bMax) {
  const double db = 0.02;
  Cx s = start(sys, m);
  double b = 0;
  while (b < bMax) {
    const double b1 = b + db;
    const Cx s1 = newton([&](Cx x) { return charF(sys, m, b1, x, false); }, s);
    if (s1.re >= 0) {
      double lo = b, hi = b + db;
      Cx slo = s, shi = s1;
      for (int it = 0; it < 60 && hi - lo > 1e-12; it++) {
        const double mid = lo + ((hi - lo) * -slo.re) / (shi.re - slo.re);
        const Cx sm = newton([&](Cx x) { return charF(sys, m, mid, x, false); }, slo);
        if (std::fabs(sm.re) < 1e-13) { lo = mid; slo = sm; break; }
        if (sm.re < 0) { lo = mid; slo = sm; } else { hi = mid; shi = sm; }
      }
      return {true, m + 1, lo, slo.im};
    }
    s = s1; b += db;
  }
  return {};
}

// ---- limit cycles by harmonic balance ---------------------------------------------------------
// Gaussian elimination with partial pivoting (solveDense in the JavaScript)
using Mat = std::array<std::array<double, HB_X>, HB_X>;
static void solveDense(Mat &A, HbX &b, HbX &x) {
  const int n = HB_X;
  for (int k = 0; k < n; k++) {
    int p = k;
    for (int i = k + 1; i < n; i++) if (std::fabs(A[i][k]) > std::fabs(A[p][k])) p = i;
    std::swap(A[k], A[p]); std::swap(b[k], b[p]);
    const double piv = orElse(A[k][k], 1e-300);
    for (int i = k + 1; i < n; i++) {
      const double f = A[i][k] / piv;
      if (f != 0 && !std::isnan(f)) { for (int j = k; j < n; j++) A[i][j] -= f * A[k][j]; b[i] -= f * b[k]; }
    }
  }
  x.fill(0);
  for (int i = n - 1; i >= 0; i--) { double s = b[i]; for (int j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / orElse(A[i][i], 1e-300); }
}

HbSolver::HbSolver(const Tube &sys) : sys(sys) {
  for (int h = 0; h <= HB_H; h++)
    for (int m = 0; m < HB_M; m++) { cosT[h][m] = fd::cos((2 * PI * h * m) / HB_M); sinT[h][m] = fd::sin((2 * PI * h * m) / HB_M); }
}

const HbQ &HbSolver::harmonics(const HbX &x, double A) {
  for (int m = 0; m < HB_M; m++) {
    double v = x[2] + A * cosT[1][m];
    for (int h = 2; h <= HB_H; h++) v += x[2 * h - 1] * cosT[h][m] + x[2 * h] * sinT[h][m];
    q[m] = heat(v);
  }
  for (int h = 0; h <= HB_H; h++) {
    double re = 0, im = 0;
    for (int m = 0; m < HB_M; m++) { re += q[m] * cosT[h][m]; im -= q[m] * sinT[h][m]; }
    Hq[h] = {re / HB_M, im / HB_M};
  }
  return Hq;
}

void HbSolver::residual(const HbX &x, double A, HbX &r) {
  const double W = x[0], beta = x[1];
  harmonics(x, A);
  for (int h = 0; h <= HB_H; h++) {
    const Cx G = transfer(sys, {0, h * W}), lag = {fd::cos(h * W * sys.tau), -fd::sin(h * W * sys.tau)};
    const Cx P = cmul(cmul(G, lag), {beta * Hq[h].re, beta * Hq[h].im}); // predicted U_h
    if (h == 0) r[2] = x[2] - P.re;
    else if (h == 1) { const Cx rel = cdiv(P, {A / 2, 0}); r[0] = 1 - rel.re; r[1] = -rel.im; }
    else { r[2 * h - 1] = x[2 * h - 1] - 2 * P.re; r[2 * h] = x[2 * h] + 2 * P.im; } // U_h = (a − ib)/2
  }
}

bool HbSolver::solve(const HbX &x0, double A, HbX &out) {
  HbX x = x0, r, rk, xk, d, mr;
  Mat J;
  for (int it = 0; it < 25; it++) {
    residual(x, A, r);
    for (int k = 0; k < HB_X; k++) { // the Jacobian by forward differences
      const double e = 1e-7 * std::max(1.0, std::fabs(x[k]));
      xk = x; xk[k] += e;
      residual(xk, A, rk);
      for (int i = 0; i < HB_X; i++) J[i][k] = (rk[i] - r[i]) / e;
    }
    for (int i = 0; i < HB_X; i++) mr[i] = -r[i];
    solveDense(J, mr, d);
    double nd = 0;
    bool finite = true;
    for (int k = 0; k < HB_X; k++) { x[k] += d[k]; nd = std::max(nd, std::fabs(d[k])); }
    for (int k = 0; k < HB_X; k++) finite = finite && std::isfinite(x[k]);
    if (!finite) return false;
    if (nd < 1e-10) { out = x; return true; }
  }
  residual(x, A, r);
  double worst = 0; // (Math.max over the residuals: NaN if any is)
  for (int i = 0; i < HB_X; i++) { const double v = std::fabs(r[i]); if (std::isnan(v) || std::isnan(worst)) worst = NAN; else worst = std::max(worst, v); }
  if (!(worst < 1e-7)) return false;
  out = x;
  return true;
}

Cx modeAmp(const Tube &sys, int j, int h, double W, double beta, Cx Hh) {
  const double w = h * W;
  const Cx lag = {fd::cos(w * sys.tau), -fd::sin(w * sys.tau)};
  return cdiv(cmul(lag, {sys.g[j] * beta * Hh.re, sys.g[j] * beta * Hh.im}), {sys.w[j] * sys.w[j] - w * w, w * sys.zeta[j]});
}

static OrbitPt point(const Tube &sys, HbSolver &hb, int m, const HbX &x, double A) {
  OrbitPt p;
  p.Hq = hb.harmonics(x, A);
  const Cx e = modeAmp(sys, m, 1, x[0], x[1], p.Hq[1]);
  p.A = A; p.beta = x[1]; p.W = x[0]; p.U0 = x[2]; p.x = x;
  p.y = 2 * std::fabs(sys.cf[m]) * hypot2(e.re, e.im);
  return p;
}

Family branch(const Tube &sys, int m, double aMax, double bMax, int steps) {
  Family fam;
  const Hopf hp = hopf(sys, m, bMax);
  if (!hp.found) return fam;
  fam.found = true; fam.mode = m + 1; fam.hopf = hp;
  HbSolver hb(sys);
  auto &pts = fam.pts;
  pts.reserve(steps + 1);
  HbX x{}, guess, sol;
  x[0] = hp.W; x[1] = hp.beta;
  const double A0 = 0.01;
  for (int k = 0; k <= steps; k++) {
    const double A = A0 * fd::pow(aMax / A0, (double)k / steps);
    guess = x;
    if (pts.size() > 1) { // secant predictor in log A
      const OrbitPt &a = pts[pts.size() - 2], &b = pts[pts.size() - 1];
      const double t = fd::log(A / b.A) / fd::log(b.A / a.A);
      for (int i = 0; i < HB_X; i++) guess[i] = b.x[i] + t * (b.x[i] - a.x[i]);
    }
    if (!hb.solve(guess, A, sol) && !hb.solve(x, A, sol)) break;
    if (sol[1] <= 0 || sol[1] > bMax) break;
    x = sol;
    pts.push_back(point(sys, hb, m, x, A));
  }
  const int n = (int)pts.size();
  for (int i = 0; i < n; i++) pts[i].stable = pts[std::min(n - 1, i + 1)].beta > pts[std::max(0, i - 1)].beta;
  int lo = -1;
  for (int i = 0; i < n; i++) if (lo < 0 || pts[i].beta < pts[lo].beta) lo = i;
  if (lo > 0 && lo < n - 1) fam.fold = {true, pts[lo].beta, pts[lo].A, pts[lo].y};
  return fam;
}

// A family's stable points: from the fold (subcritical) or the Hopf point (supercritical) up.
static std::vector<const OrbitPt *> stablePts(const Family &f) {
  std::vector<const OrbitPt *> st;
  if (!f.found) return st;
  const double from = f.fold.found ? f.fold.beta : f.hopf.beta;
  for (const OrbitPt &p : f.pts) if (p.stable && p.beta >= from) st.push_back(&p);
  return st;
}
template <class Get>
static double interp(const std::vector<const OrbitPt *> &pts, double beta, Get get) {
  if (beta <= pts[0]->beta) return get(*pts[0]);
  for (size_t i = 1; i < pts.size(); i++)
    if (pts[i]->beta >= beta) { const OrbitPt &a = *pts[i - 1], &c = *pts[i]; return get(a) + ((beta - a.beta) / (c.beta - a.beta)) * (get(c) - get(a)); }
  return get(*pts.back());
}

Orbit orbitAt(const Tube &sys, const Family &fam, double beta) {
  const auto st = stablePts(fam);
  if (st.size() < 2 || beta < st[0]->beta) return {};
  int i = -1;
  for (size_t k = 0; k < st.size(); k++) if (st[k]->beta >= beta) { i = (int)k; break; }
  if (i < 0) return {};
  if (i == 0) i = 1;
  HbSolver hb(sys);
  struct End { double A, f; HbX x; };
  End a = {st[i - 1]->A, st[i - 1]->beta - beta, st[i - 1]->x}, b = {st[i]->A, st[i]->beta - beta, st[i]->x};
  HbX x = a.x, sol;
  double A = a.A;
  int side = 0;
  // Illinois regula falsi in log A, to 0.1 % in β
  for (int it = 0; it < 16 && std::fabs(b.A - a.A) > 1e-10; it++) {
    A = fd::exp((fd::log(a.A) * b.f - fd::log(b.A) * a.f) / (b.f - a.f));
    const bool nearA = std::fabs(fd::log(A / a.A)) < std::fabs(fd::log(A / b.A));
    const End &near = nearA ? a : b, &far = nearA ? b : a;
    if (!hb.solve(near.x, A, sol) && !hb.solve(far.x, A, sol)) break;
    x = sol;
    const double f = x[1] - beta;
    if (std::fabs(f) < 1e-3 * beta) break;
    if (f < 0) { a = {A, f, x}; if (side == -1) b.f /= 2; side = -1; } else { b = {A, f, x}; if (side == 1) a.f /= 2; side = 1; }
  }
  Orbit o{true, point(sys, hb, fam.mode - 1, x, A)};
  o.pt.stable = true;
  return o;
}

double listenWeight(int j, double listen) { return ((j % 2 ? 1 : -1) - listen) / (1 + listen); }
std::array<double, HB_H> orbitSpectrum(const Tube &sys, const OrbitPt &pt, double listen) {
  std::array<double, HB_H> out{};
  for (int h = 1; h <= HB_H; h++) {
    double re = 0, im = 0;
    for (int j = 0; j < sys.N; j++) {
      const Cx e = modeAmp(sys, j, h, pt.W, pt.beta, pt.Hq[h]);
      const double wo = listenWeight(j, listen) * h * pt.W;
      re -= wo * e.im; im += wo * e.re;
    }
    out[h - 1] = 2 * hypot2(re, im);
  }
  return out;
}

double steadyY(const Family &fam, double beta) {
  const auto st = stablePts(fam);
  return !st.empty() && beta >= st[0]->beta ? interp(st, beta, [](const OrbitPt &p) { return p.y; }) : 0;
}

Bifurcation bifurcation(const TubeParams &P) {
  Bifurcation b;
  b.P = P; b.sys = tube(P);
  for (int m = 0; m < 2; m++) b.fam[m] = branch(b.sys, m);
  return b;
}

double screamLimit(const Tube &sys, int mode) {
  double best = B_MAX / SCREAM;
  for (int m = 3; m < sys.N; m++) {
    if (m + 1 == mode) continue;
    const Hopf h = hopf(sys, m, best); // (every mode: through the others, even one Rayleigh leaves undriven can go unstable)
    if (h.found && h.beta < best) best = h.beta;
  }
  return std::min(B_MAX, SCREAM * best);
}

Limit silenceLimit(const Tube &sys) {
  Limit best = {B_MAX, 0};
  for (int m = 0; m < sys.N; m++) {
    const int j = m + 1;
    const double drive = (GAIN / 2) * B_MAX * fd::sin(2 * j * PI * sys.xf) * fd::sin(j * PI * sys.tau);
    if (drive < 0.7 * (sys.zeta[m] / 2)) continue;
    const Hopf h = hopf(sys, m, best.beta);
    if (h.found && h.beta < best.beta) best = {h.beta, j};
  }
  return best;
}

double Tuning::W(double beta) const {
  const double x = std::min(TUNE_N - 1.001, std::max(0.0, (beta - b0) / db));
  const int i = (int)std::floor(x);
  const double f = x - i;
  return Ws[i] + f * (Ws[i + 1] - Ws[i]);
}

Tuning tuning(const TubeParams &P, const Bifurcation *bif) {
  Tuning t;
  t.P = P;
  const Tube sys = bif ? bif->sys : tube(P);
  const Limit first = silenceLimit(sys);
  const int j = first.mode ? first.mode : 1;
  // the family of the mode that speaks first (modes 1 and 2 have one)
  Family own;
  const Family *fam = nullptr;
  if (j <= 2) {
    if (bif) fam = &bif->fam[j - 1];
    else { own = branch(sys, j - 1); fam = &own; }
  }
  const auto st = fam ? stablePts(*fam) : std::vector<const OrbitPt *>{};
  t.b0 = 0; t.db = B_MAX / (TUNE_N - 1);
  Cx s = root(sys, j - 1, 0);
  for (int i = 0; i < TUNE_N; i++) {
    const double beta = i * t.db;
    s = newton([&](Cx x) { return charF(sys, j - 1, beta, x, false); }, s);
    t.Ws[i] = (!st.empty() && beta >= st[0]->beta ? interp(st, beta, [](const OrbitPt &p) { return p.W; }) : s.im) / j;
  }
  t.betaH = first.beta;
  t.betaMax = screamLimit(sys, first.mode);
  t.mode = first.mode;
  t.fold = fam && fam->found && fam->fold.found && first.mode ? fam->fold.beta : NAN;
  return t;
}

} // namespace forte::pyrophone
