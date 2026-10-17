// windharp-model.cpp — the Wind Harp's physics, as windharp-model.js computes it.

#include "windharp-model.h"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <limits>

#include "forte/fdlibm.h"

namespace forte::windharp {

namespace {
constexpr double PI = std::numbers::pi;
constexpr double NaN = std::numeric_limits<double>::quiet_NaN();
using fdlibm::pow;
// JavaScript's Math.max and Math.min of two (NaN wins), and the model's clamp (NaN passes)
double jmax(double a, double b) { return a != a || b != b ? NaN : a > b ? a : b; }
double clamp(double x, double a, double b) { return x < a ? a : x > b ? b : x; }
double jsign(double x) { return x > 0 ? 1 : x < 0 ? -1 : x; }
// V8's Math.hypot of two (the largest's scale, then a compensated sum)
double hypot2(double a, double b) {
  a = std::fabs(a); b = std::fabs(b);
  if (a == INFINITY || b == INFINITY) return INFINITY;
  const double mx = jmax(a, b);
  if (mx != mx) return NaN;
  if (mx == 0) return 0;
  double sum = 0, comp = 0;
  for (const double x : {a, b}) {
    const double n = x / mx, summand = n * n - comp, pre = sum + summand;
    comp = (pre - sum) - summand;
    sum = pre;
  }
  return std::sqrt(sum) * mx;
}
} // namespace

double keyFreq(double m) { return 440 * pow(2, (m - 69) / 12); }

// ---- air and the wake ----------------------------------------------------------------------------
double strouhal(double Re) { return 0.2698 - 1.0271 / std::sqrt(jmax(Re, RE_C)); }
double onset(double Re) { return clamp((Re - RE_C) / (RE_FULL - RE_C), -1, 1); }
double vdpKappa(double e) { return 1 - (e * e) / 16 + (17 * pow(e, 4)) / 3072; }

Shedding shedding(double U, double D) {
  const double Re = (U * D) / AIR.nu, St = strouhal(Re), r = onset(Re);
  const double fs = (St * U) / D;
  const double Om = (TAU * fs) / vdpKappa(WAKE.eps * jmax(r, 0));
  return {Re, St, r, fs, Om, Re > RE_C};
}

// ---- the strings ---------------------------------------------------------------------------------
double diameterFor(double f, double U) {
  double D = (0.2 * U) / f;
  for (int i = 0; i < 60; i++) D = (strouhal((U * D) / AIR.nu) * U) / f;
  return D;
}

StringDesign stringDesign(int key, const DesignParams &P, const CourseOffset &o) {
  StringDesign S;
  const double fNote = keyFreq(key), D = diameterFor(fNote, U_REF) * o.gauge;
  const double area = (PI * D * D) / 4, ms = NYLON.rho * P.mass * area, mf = AIR.rho * area, m = ms + mf;
  const bool unison = P.tuning == 1;
  const double n0 = unison ? 1 : P.n0;
  const double target = (unison ? keyFreq(P.unison) : fNote) * pow(2, o.cents / 1200);
  double f0 = target / n0, L = 0, T = 0, B = 0;
  for (int i = 0; i < 40; i++) {
    L = L_REF * pow(f0 / 100, -0.5);
    T = m * pow(2 * L * f0, 2);
    B = (pow(PI, 3) * NYLON.E * pow(D, 4)) / (64 * T * L * L);
    f0 = target / (n0 * std::sqrt(1 + B * n0 * n0));
  }
  T = m * pow(2 * L * f0, 2);
  const double mu = m / (AIR.rho * D * D), Re0 = (U_REF * D) / AIR.nu;
  // modes: enough to reach the Strouhal frequency at the top wind, and one more
  const double top = shedding(U_MAX, D).fs;
  const int N = (int)clamp(std::ceil(top / f0) + 1, (unison ? 1 : n0) + 2, N_MAX);
  for (int n = 1; n <= N; n++) S.f[n - 1] = n * f0 * std::sqrt(1 + B * n * n);
  S.key = key; S.D = D; S.L = L; S.T = T; S.m = m; S.ms = ms; S.mf = mf; S.mu = mu; S.B = B; S.f0 = f0;
  S.N = N; S.n0 = (int)n0; S.zeta = 1 / (2 * P.q); S.Re0 = Re0; S.stress = T / area; S.unison = unison;
  S.St0 = strouhal(Re0); S.fNote = fNote; S.target = target; S.lc = CORR * D; S.cents = o.cents; S.gauge = o.gauge;
  S.idx = o.idx; S.course = o.course;
  return S;
}

int courseSize(int key) { return key >= COURSE.three ? 3 : key >= COURSE.two ? 2 : 1; }
namespace {
double hash(double a, double b) { // seeded, in [−0.5, 0.5)
  const double x = fdlibm::sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - std::floor(x) - 0.5;
}
} // namespace
int courseOffsets(int key, CourseOffset *out) {
  const int n = courseSize(key);
  for (int i = 0; i < n; i++) {
    const double c = i - (n - 1) / 2.0;
    out[i] = {i, n, n == 1 ? 0 : COURSE.cents * c + COURSE.jitter * hash(key, i), n == 1 ? 1 : 1 + COURSE.gauge * (c + 0.5 * hash(key, i + 7))};
  }
  return n;
}

int homeHarmonic(const StringDesign &S) {
  if (!S.unison) return S.n0;
  int best = 1;
  for (int n = 1; n <= S.N; n++)
    if (std::fabs(fdlibm::log(S.f[n - 1] / S.fNote)) < std::fabs(fdlibm::log(S.f[best - 1] / S.fNote))) best = n;
  return best;
}

// ---- the linear analysis (de Langre 2006) --------------------------------------------------------
Harmonic harmonicParams(const StringDesign &S, int n, double U) {
  const Shedding sh = shedding(U, S.D);
  const double Om = sh.Om, wn = TAU * S.f[n - 1];
  const double StO = (Om * S.D) / (TAU * U), M = WAKE.CL0 / (16 * pow(PI, 2) * pow(StO, 2) * S.mu);
  return {sh, wn / Om, (2 * S.zeta * wn) / Om + WAKE.gamma / S.mu, M, WAKE.A * M, wn};
}

namespace {
// Roots of the quartic s⁴ + c3 s³ + c2 s² + c1 s + c0 (Durand–Kerner)
void quarticRoots(double c3, double c2, double c1, double c0, Root z[4]) {
  const double cs[4] = {c3, c2, c1, c0};
  auto p = [&](double zr, double zi, double &r, double &i) {
    r = 1; i = 0;
    for (const double c : cs) { const double nr = r * zr - i * zi + c, ni = r * zi + i * zr; r = nr; i = ni; }
  };
  const double start[4][2] = {{0.4, 0.9}, {-0.4, 0.9}, {0.4, -0.9}, {-0.4, -0.9}};
  for (int k = 0; k < 4; k++) z[k] = {start[k][0] * 1.3, start[k][1] * 1.3};
  for (int it = 0; it < 400; it++) {
    double moved = 0;
    for (int k = 0; k < 4; k++) {
      double nr, ni;
      p(z[k].re, z[k].im, nr, ni);
      double dr = 1, di = 0;
      for (int j = 0; j < 4; j++)
        if (j != k) { const double ar = z[k].re - z[j].re, ai = z[k].im - z[j].im, tr = dr * ar - di * ai; di = dr * ai + di * ar; dr = tr; }
      double den = dr * dr + di * di;
      if (!(den != 0)) den = 1e-300; // `|| 1e-300`: 0 and NaN
      const double qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      z[k].re -= qr; z[k].im -= qi; moved = jmax(moved, std::fabs(qr) + std::fabs(qi));
    }
    if (moved < 1e-15) break;
  }
}
} // namespace

void coupledRoots(double delta, double lam, double AM, double eps, Root out[4]) {
  quarticRoots(lam - eps, 1 + delta * delta - lam * eps - AM, lam - eps * delta * delta, delta * delta, out);
}
Root flutterGrowth(double delta, double lam, double AM, double eps) {
  Root z[4];
  coupledRoots(delta, lam, AM, eps, z);
  double best = -INFINITY, w = 0;
  for (const Root &r : z) if (r.re > best) { best = r.re; w = std::fabs(r.im); }
  return {best, w};
}

namespace {
// The wind at which δ(U) = target(h) for harmonic n, by bisection (NaN if none in [lo, hi])
template <class F> double windAt(const StringDesign &S, int n, F target, double lo = 0.2, double hi = 40) {
  auto g = [&](double U) { const Harmonic h = harmonicParams(S, n, U); return h.delta - target(h); };
  double a = lo, b = hi, ga = g(a), gb = g(b);
  if (ga * gb > 0) return NaN;
  for (int i = 0; i < 70; i++) { const double c = std::sqrt(a * b), gc = g(c); if (ga * gc <= 0) { b = c; gb = gc; } else { a = c; ga = gc; } }
  (void)gb;
  return std::sqrt(a * b);
}
} // namespace

bool lockBand(const StringDesign &S, int n, Band &out) {
  const double lo = windAt(S, n, [](const Harmonic &h) { return 1 + std::sqrt(h.AM); });
  const double hi = windAt(S, n, [](const Harmonic &h) { return 1 - std::sqrt(h.AM); });
  const double mid = windAt(S, n, [](const Harmonic &) { return 1.0; });
  if (lo != lo || hi != hi || mid != mid) return false;
  const Harmonic h = harmonicParams(S, n, mid);
  const Root g = flutterGrowth(h.delta, h.lam, h.AM, 0);
  out = {n, lo, hi, mid, g.re * h.sh.Om, h.AM, shedding(lo, S.D).sheds};
  return true;
}

// ---- the locked state: harmonic balance ----------------------------------------------------------
int balance(double delta, double lam, double AM, double M, double eps, double r, BalanceState *out) {
  auto f = [&](double w2) { return (1 - w2) * (pow(delta * delta - w2, 2) + lam * lam * w2) + AM * w2 * (delta * delta - w2); };
  const double lo = 0.25, hi = 2.5;
  const int K = 6000;
  int count = 0;
  double a = lo, fa = f(a);
  for (int i = 1; i <= K; i++) {
    const double b = lo + ((hi - lo) * i) / K, fb = f(b);
    if (fa * fb <= 0 && fa != fb) {
      double x0 = a, x1 = b, f0 = fa;
      for (int k = 0; k < 60; k++) { const double xm = 0.5 * (x0 + x1), fm = f(xm); if (f0 * fm <= 0) x1 = xm; else { x0 = xm; f0 = fm; } }
      // P from the imaginary part, or (where ω = δ makes that 0/0) from the real part
      const double w2 = 0.5 * (x0 + x1), w = std::sqrt(w2), dd = delta * delta - w2;
      const double P = std::fabs(dd) > 1e-7 ? (-lam * (1 - w2)) / (eps * dd) : ((1 - w2) * dd + AM * w2) / (eps * lam * w2);
      if (r + P >= 0 && count < BALANCE_MAX) {
        const double Q = 2 * std::sqrt(r + P), Y = (M * Q) / hypot2(delta * delta - w2, lam * w);
        out[count++] = {w, Q, Y, P};
      }
    }
    a = b; fa = fb;
  }
  return count;
}
bool lockedState(double delta, double lam, double AM, double M, double eps, double r, BalanceState &out) {
  BalanceState s[BALANCE_MAX];
  const int n = balance(delta, lam, AM, M, eps, r, s);
  bool found = false;
  for (int i = 0; i < n; i++) if (std::fabs(s[i].w / delta - 1) < 0.02 && (!found || s[i].Y > out.Y)) { out = s[i]; found = true; }
  return found;
}

namespace {
double cubicMax(double c3, double c2, double c1, double c0) { // largest real root of c3 z³ + c2 z² + c1 z + c0, c3 > 0
  const double a = c2 / c3, b = c1 / c3, c = c0 / c3, Q = (a * a - 3 * b) / 9, R = (2 * pow(a, 3) - 9 * a * b + 27 * c) / 54;
  if (R * R < pow(Q, 3)) { const double th = std::acos(R / std::sqrt(pow(Q, 3))); return -2 * std::sqrt(Q) * fdlibm::cos((th + 2 * PI) / 3) - a / 3; }
  const double A = -jsign(R) * std::cbrt(std::fabs(R) + std::sqrt(R * R - pow(Q, 3))), B = A == 0 ? 0 : Q / A;
  return A + B - a / 3;
}
void distResidual(double w, double y, const Harmonic &h, const double *shape, int J, double eps, double out[2]) {
  double sr = 0, si = 0;
  for (int j = 0; j < J; j++) {
    const double ph = shape[j], z = stationResponse(WAKE.A * w * w * y * ph, w, h.sh.r, eps), P = z / 4 - h.sh.r;
    const double dr = 1 - w * w, di = eps * w * P, den = dr * dr + di * di;
    sr += (ph * ph * dr) / den; si -= (ph * ph * di) / den;
  }
  sr *= 2.0 / J; si *= 2.0 / J;
  out[0] = h.delta * h.delta - w * w + h.AM * w * w * sr; out[1] = h.lam * w + h.AM * w * w * si;
}
} // namespace

double stationResponse(double F, double w, double r, double eps) {
  const double a = 1 - w * w, b = eps * w;
  return jmax(0, cubicMax((b * b) / 16, (-b * b * r) / 2, a * a + b * b * r * r, -F * F));
}
void modeShapeAt(int n, int J, double *out) { for (int j = 0; j < J; j++) out[j] = fdlibm::sin((n * PI * (j + 0.5)) / J); }

bool lockedDist(const Harmonic &h, const double *shape, int J, Locked guess, Locked &out, double eps) {
  if (!(h.sh.r > 0)) return false;
  double w = guess.w, y = guess.Y, f[2], fa[2], fb[2];
  for (int it = 0; it < 60; it++) {
    distResidual(w, y, h, shape, J, eps, f);
    const double dw = 1e-8, dy = 1e-7 * y;
    distResidual(w + dw, y, h, shape, J, eps, fa); distResidual(w, y + dy, h, shape, J, eps, fb);
    const double j11 = (fa[0] - f[0]) / dw, j21 = (fa[1] - f[1]) / dw, j12 = (fb[0] - f[0]) / dy, j22 = (fb[1] - f[1]) / dy, det = j11 * j22 - j12 * j21;
    double sw = (f[0] * j22 - f[1] * j12) / det, sy = (j11 * f[1] - j21 * f[0]) / det;
    if (!std::isfinite(sw) || !std::isfinite(sy)) return false;
    const double lim = 0.2 * y;
    if (std::fabs(sy) > lim) { sw *= lim / std::fabs(sy); sy *= lim / std::fabs(sy); }
    if (std::fabs(sw) > 1e-3) { sy *= 1e-3 / std::fabs(sw); sw = 1e-3 * jsign(sw); }
    w -= sw; y -= sy;
    if (!(y > 1e-6)) return false;
    if (std::fabs(sw) < 1e-13 && std::fabs(sy) < 1e-11 * y) { out = {w, y}; return true; }
  }
  distResidual(w, y, h, shape, J, eps, f);
  if (hypot2(f[0], f[1]) < 1e-10) { out = {w, y}; return true; }
  return false;
}

double lockedAmplitude(const StringDesign &S, int n, double U) {
  const Harmonic h = harmonicParams(S, n, U);
  BalanceState s1{};
  const bool has = h.sh.r > 0 && lockedState(h.delta, h.lam, h.AM, h.M, WAKE.eps, h.sh.r, s1);
  double shape[N_MAX];
  modeShapeAt(n, S.N, shape);
  Locked s;
  return lockedDist(h, shape, S.N, {h.delta, has ? 1.25 * s1.Y : 0.04}, s) ? s.Y : 0;
}

bool lockedRange(const StringDesign &S, int n, LockedRange &out) {
  Band band;
  if (!lockBand(S, n, band) || !(shedding(band.mid, S.D).r > 0)) return false;
  double shape[N_MAX];
  modeShapeAt(n, S.N, shape);
  auto at = [&](double U, Locked g, Locked &s) { return lockedDist(harmonicParams(S, n, U), shape, S.N, g, s); };
  const Harmonic h0 = harmonicParams(S, n, band.mid);
  BalanceState s1{};
  const bool has = lockedState(h0.delta, h0.lam, h0.AM, h0.M, WAKE.eps, h0.sh.r, s1);
  Locked s0;
  if (!at(band.mid, {h0.delta, has ? 1.25 * s1.Y : 0.04}, s0)) return false;
  auto edge = [&](double dir, double &Uout, double &Yout) {
    double U = band.mid, step = 0.005 * band.mid;
    Locked g = s0, s;
    for (int k = 0; k < 400; k++) {
      if (at(U + dir * step, g, s)) { U += dir * step; g = s; } else if (step > 2e-5 * band.mid) step /= 2; else break;
    }
    Uout = U; Yout = g.Y;
  };
  out.band = band; out.Ymid = s0.Y;
  edge(1, out.upTo, out.Yup);
  edge(-1, out.downTo, out.Ydown);
  return true;
}

// ---- shutters ------------------------------------------------------------------------------------
double shutterOpen(double v) { return 0.3 * pow(1.0 / 30, clamp(v, 0, 1)); }
double shutterClose(double v) { return v < 0 || v != v ? 0.04 : 0.1 * pow(0.15, clamp(v, 0, 1)); }

// ---- the soundbox --------------------------------------------------------------------------------
double topMass(int key) { return BOX.mBass * pow(BOX.mTreble / BOX.mBass, std::max(0.0, std::min(1.0, (key - KEY_LO) / double(KEY_HI - KEY_LO)))); }
double boxGain(int key) { return AIR.rho / (TAU * topMass(key) * BOX.r); }

} // namespace forte::windharp
