// springs-model.cpp — springs/src/springs-model.js in C++ (springs-model.h).

#include "springs-model.h"

#include <algorithm>
#include <bit>
#include <cmath>
#include <cstdio>
#include <cstring>

#include "forte/fdlibm.h"
#include "springs-params.h"

namespace forte::springs {

namespace fd = forte::fdlibm;

// ---- V8's Math.log2 and Math.round ------------------------------------------------------------------

// log(1 + f) − f + f²/2 for f in [√2/2 − 1, √2 − 1] (FreeBSD's k_log.h)
static double k_log1p(double f) {
  static const double Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
                      Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
                      Lg7 = 1.479819860511658591e-01;
  const double s = f / (2.0 + f), z = s * s, w = z * z;
  const double t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const double t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  const double R = t2 + t1, hfsq = 0.5 * f * f;
  return s * (hfsq + R);
}
static void words(double x, int32_t &hi, uint32_t &lo) { uint64_t b; std::memcpy(&b, &x, 8); hi = (int32_t)(b >> 32); lo = (uint32_t)b; }
static double fromWords(int32_t hi, uint32_t lo) { const uint64_t b = ((uint64_t)(uint32_t)hi << 32) | lo; double x; std::memcpy(&x, &b, 8); return x; }

// Math.log2 as V8 computes it (src/base/ieee754.cc: FreeBSD's e_log2.c)
double log2(double x) {
  static const double two54 = 1.80143985094819840000e+16, ivln2hi = 1.44269504072144627571e+00, ivln2lo = 1.67517131648865118353e-10;
  int32_t hx;
  uint32_t lx;
  words(x, hx, lx);
  int32_t k = 0;
  if (hx < 0x00100000) { // x < 2^−1022
    if (((hx & 0x7fffffff) | lx) == 0) return -INFINITY;
    if (hx < 0) return NAN;
    k -= 54;
    x *= two54; // subnormal: scale up
    words(x, hx, lx);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx == 0x3ff00000 && lx == 0) return 0;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const int32_t i = (hx + 0x95f64) & 0x100000;
  x = fromWords(hx | (i ^ 0x3ff00000), lx); // normalise x or x/2
  k += (i >> 20);
  const double y = k, f = x - 1.0, hfsq = 0.5 * f * f, r = k_log1p(f);
  int32_t hh;
  uint32_t hl;
  double hi = f - hfsq;
  words(hi, hh, hl);
  hi = fromWords(hh, 0);
  const double lo = (f - hi) - hfsq + r;
  double val_hi = hi * ivln2hi, val_lo = (lo + hi) * ivln2lo + lo * ivln2hi;
  const double w = y + val_hi;
  val_lo += (y - w) + val_hi;
  val_hi = w;
  return val_lo + val_hi;
}
// Math.round: the nearest integer, halves up
double jsRound(double x) {
  if (!std::isfinite(x)) return x;
  double r = std::ceil(x);
  if (r - 0.5 > x) r -= 1;
  return r;
}

double keyFreq(double m) { return 440 * fd::pow(2, (m - 69) / 12); }
double cents(double f, double g) { return 1200 * log2(f / g); }
const double cE = std::sqrt(STEEL_E / STEEL_RHO);
double shearK(double nu) { return (6 * (1 + nu)) / (7 + 6 * nu); }

// ---- the parameters a key's springs depend on --------------------------------------------------------

Params paramsOf(const double *P) {
  Params q;
  q.slinky = (int)P[p::family] == family_::slinky;
  q.axial = (int)P[p::drive] == drive_::axial;
  q.coil = P[p::coil]; q.wire = P[p::wire]; q.helix = P[p::helix];
  q.springs = P[p::springs]; q.spread = P[p::spread]; q.mallet = P[p::mallet]; q.bead = P[p::bead];
  q.endLoss = P[p::endLoss]; q.eta = P[p::eta]; q.oil = P[p::oil];
  return q;
}
uint64_t geometryId(const Params &P) {
  uint64_t h = 1469598103934665603ull;
  auto mix = [&](double v) { const uint64_t b = std::bit_cast<uint64_t>(v + 0.0); for (int i = 0; i < 8; i++) { h ^= (b >> (8 * i)) & 0xff; h *= 1099511628211ull; } };
  for (double v : {P.slinky ? 1.0 : 0.0, P.coil, P.wire, P.helix, P.axial ? 1.0 : 0.0, P.springs, P.spread, P.mallet, P.bead, P.endLoss, P.eta, P.oil}) mix(v);
  return h;
}

// ---- the scaled family of springs ---------------------------------------------------------------------

Geometry geometry(int key, const Params &P) {
  const bool slinky = P.slinky;
  const double s = slinky ? 1 : fd::pow(2, -(key - REF_KEY) / 12);
  const double BR = slinky ? SLINKY_R : REF_R, Br = slinky ? SLINKY_r : REF_r;
  const double R = BR * s * P.coil, r = Br * s * P.wire;
  const double alpha = (P.helix * PI) / 180;
  return {R, r, alpha, STEEL_NU, STEEL_E, STEEL_RHO, slinky};
}

// ---- Wittrick's helical rod ----------------------------------------------------------------------------

RodConstants rodConstants(const Shape &s) {
  const double rr = s.rr, alpha = s.alpha, nu = s.nu;
  const double A = PI * rr * rr, I = (PI * fd::pow(rr, 4)) / 4, J = 2 * I, G = 1 / (2 * (1 + nu));
  RodConstants rc;
  rc.kap = fd::pow(fd::cos(alpha), 2); rc.tau = fd::sin(alpha) * fd::cos(alpha);
  const double ks = shearK(nu);
  const double C[6] = {ks * G * A, ks * G * A, A, I, I, G * J}, M[6] = {A, A, A, I, I, J};
  for (int i = 0; i < 6; i++) { rc.C[i] = C[i]; rc.M[i] = M[i]; }
  rc.A = A; rc.I = I; rc.J = J; rc.G = G;
  return rc;
}

static void strainRows(const RodConstants &rc, double *B0, double *B1) {
  const double kap = rc.kap, tau = rc.tau;
  std::fill(B0, B0 + 36, 0.0); std::fill(B1, B1 + 36, 0.0);
  B1[0] = -1; B0[1] = -tau; B0[2] = kap; B0[4] = -1;  // γ_n = −k y₁ − τ y₂ + κ y₃ − y₅
  B0[6] = tau; B1[7] = 1; B0[9] = 1;                  // γ_b = τ y₁ + k y₂ + y₄
  B0[12] = -kap; B1[14] = 1;                          // γ_t = −κ y₁ + k y₃
  B1[21] = -1; B0[22] = -tau; B0[23] = kap;           // χ_n = −k y₄ − τ y₅ + κ y₆
  B0[27] = tau; B1[28] = 1;                           // χ_b = τ y₄ + k y₅
  B0[33] = -kap; B1[35] = 1;                          // χ_t = −κ y₄ + k y₆
}

RodSolver::RodSolver(const Shape &shape) : shape(shape), rc(rodConstants(shape)) {
  strainRows(rc, B0, B1);
  for (int i = 0; i < 6; i++) sM[i] = 1 / std::sqrt(rc.M[i]);
  for (int i = 0; i < 6; i++) ord[i] = i;
}

void RodSolver::solve(double k) {
  for (int i = 0; i < 36; i++) bk[i] = B0[i] + k * B1[i];
  // A = M^(−½) K M^(−½), K = Σ Cᵢ bᵢ bᵢᵀ
  for (int a = 0; a < 6; a++) for (int b = a; b < 6; b++) {
    double s = 0;
    for (int i = 0; i < 6; i++) s += rc.C[i] * bk[i * 6 + a] * bk[i * 6 + b];
    Am[a * 6 + b] = Am[b * 6 + a] = s * sM[a] * sM[b];
  }
  jacobi6(Am, V, lam);
  for (int i = 0; i < 6; i++) ord[i] = i;
  std::stable_sort(ord, ord + 6, [&](int a, int b) { return lam[a] - lam[b] < 0; });
  for (int j = 0; j < 6; j++) {
    const int c = ord[j];
    const double l = std::max(0.0, lam[c]);
    w[j] = std::sqrt(l);
    for (int i = 0; i < 6; i++) Y[i * 6 + j] = V[i * 6 + c] * sM[i];
    // dω²/dk = yᵀ (dK/dk) y = 2 Σ Cᵢ (b1ᵢ·y)(bᵢ·y)
    double d = 0;
    for (int i = 0; i < 6; i++) {
      double p = 0, q = 0;
      for (int m = 0; m < 6; m++) { const double y = Y[m * 6 + j]; p += B1[i * 6 + m] * y; q += bk[i * 6 + m] * y; }
      d += 2 * rc.C[i] * p * q;
    }
    dw[j] = w[j] > 0 ? d / (2 * w[j]) : 0;
  }
}

// Cyclic Jacobi for a symmetric 6 × 6 (row-major A, destroyed): eigenvalues in d, vectors in V's columns.
void jacobi6(double *A, double *V, double *d) {
  const int n = 6;
  std::fill(V, V + 36, 0.0);
  for (int i = 0; i < n; i++) V[i * n + i] = 1;
  for (int sweep = 0; sweep < 30; sweep++) {
    double off = 0, diag = 0;
    for (int p = 0; p < n; p++) { diag += A[p * n + p] * A[p * n + p]; for (int q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q]; }
    if (off <= 1e-30 * diag) break;
    for (int p = 0; p < n - 1; p++) for (int q = p + 1; q < n; q++) {
      const double apq = A[p * n + q];
      if (apq == 0) continue;
      const double app = A[p * n + p], aqq = A[q * n + q];
      if (std::fabs(apq) < 1e-18 * std::sqrt(std::fabs(app * aqq))) { A[p * n + q] = A[q * n + p] = 0; continue; }
      const double th = (aqq - app) / (2 * apq);
      const double thOr1 = th == 0 || std::isnan(th) ? 1 : th; // th || 1
      const double sg = thOr1 > 0 ? 1 : thOr1 < 0 ? -1 : thOr1;
      const double t = sg / (std::fabs(th) + std::sqrt(th * th + 1));
      const double c = 1 / std::sqrt(t * t + 1), s = t * c;
      for (int k = 0; k < n; k++) { // columns p, q
        const double akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (int k = 0; k < n; k++) { // rows p, q
        const double apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
      for (int k = 0; k < n; k++) {
        const double vkp = V[k * n + p], vkq = V[k * n + q];
        V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
      }
    }
  }
  for (int i = 0; i < n; i++) d[i] = A[i * n + i];
}

// What a bead at the end moves (springs-model.js, beadShare): its rotation about the axis, or its
// slide along it.
double beadShare(const double *Y, int j, double alpha, bool axial) {
  const double sa = fd::sin(alpha), ca = fd::cos(alpha);
  if (axial) {
    const double uz = Y[12 + j] * sa + Y[6 + j] * ca, thphi = Y[30 + j] * ca - Y[24 + j] * sa;
    return uz + thphi;
  }
  return Y[30 + j] * sa + Y[24 + j] * ca;
}

int driveSheet(RodSolver &solver, bool axial) {
  solver.solve(1e-3);
  const double a = std::fabs(beadShare(solver.Y, 0, solver.shape.alpha, axial)), b = std::fabs(beadShare(solver.Y, 1, solver.shape.alpha, axial));
  return a > b ? 0 : 1;
}
Transition transition(RodSolver &solver, bool axial) {
  const int j = driveSheet(solver, axial);
  const double k0 = fd::cos(solver.shape.alpha);
  double best = 0, kb = 0;
  for (int i = 1; i <= 200; i++) {
    const double k = ((double)i / 200) * 0.95 * k0;
    solver.solve(k);
    const double w = solver.w[j];
    if (w > best) { best = w; kb = k; }
  }
  double lo = std::max(1e-4, kb - (0.95 * k0) / 200), hi = kb + (0.95 * k0) / 200;
  for (int i = 0; i < 60; i++) {
    const double m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    solver.solve(m1); const double w1 = solver.w[j];
    solver.solve(m2); const double w2 = solver.w[j];
    if (w1 < w2) lo = m1; else hi = m2;
  }
  const double k = 0.5 * (lo + hi);
  solver.solve(k);
  return {j, k, solver.w[j], 0};
}

// Solvers are cached per shape, by its numbers printed to nine decimals, as the JavaScript keeps
// them: at most 17, the oldest dropped first.
std::shared_ptr<RodSolver> solverFor(const Shape &shape) {
  thread_local std::vector<std::shared_ptr<RodSolver>> solvers;
  char buf[96];
  std::snprintf(buf, sizeof buf, "%.9f|%.9f|0.29", shape.rr, shape.alpha);
  const std::string id(buf);
  for (auto &s : solvers) if (s->id == id) return s;
  if (solvers.size() > 16) solvers.erase(solvers.begin());
  auto s = std::make_shared<RodSolver>(shape);
  s->id = id;
  solvers.push_back(s);
  return s;
}

// ---- tuning -------------------------------------------------------------------------------------------

Spring tuneSpring(int key, const Params &P) {
  const Geometry g = geometry(key, P);
  const Shape shape = shapeOf(g);
  std::shared_ptr<RodSolver> solver = solverFor(shape);
  const bool axial = P.axial;
  const double f0 = keyFreq(key);
  RodSolver &S = *solver;
  if (!S.tuned[axial]) {
    Transition tr = transition(S, axial);
    S.solve(1e-4);
    tr.c0 = S.w[tr.j] / 1e-4;
    S.tune[axial] = tr; S.tuned[axial] = true;
  }
  const Transition tr = S.tune[axial];
  const double scale = cE / g.R;
  const double wHat = (TAU * f0) / scale;
  const bool onBranch = !g.slinky && wHat < 0.98 * tr.w;
  double k1;
  if (g.slinky) k1 = (PI * g.R) / (SLINKY_L * fd::pow(2, -(key - SLINKY_KEY) / 24));
  else if (onBranch) {
    double lo = 0, hi = tr.k;
    for (int i = 0; i < 60; i++) { const double m = 0.5 * (lo + hi); S.solve(m); if (S.w[tr.j] < wHat) lo = m; else hi = m; }
    k1 = 0.5 * (lo + hi);
  } else k1 = wHat / tr.c0;
  const double L = (PI * g.R) / k1;
  const double c0 = tr.c0 * cE;
  const double turns = (L * fd::cos(g.alpha)) / (TAU * g.R);
  Spring sp;
  sp.R = g.R; sp.r = g.r; sp.alpha = g.alpha; sp.nu = g.nu; sp.E = g.E; sp.rho = g.rho; sp.slinky = g.slinky;
  sp.key = key; sp.f0 = f0; sp.L = L; sp.turns = turns;
  sp.height = turns * TAU * g.R * std::tan(g.alpha); // (for show)
  sp.mass = g.rho * PI * g.r * g.r * L;
  sp.c0 = c0; sp.TD = (2 * L) / c0; sp.Fc = (tr.w * scale) / TAU; sp.kc = tr.k / g.R; sp.sheet = tr.j;
  sp.onBranch = onBranch; sp.axial = axial; sp.fMax = g.slinky ? SLINKY_FMAX : 18000;
  sp.solver = solver;
  return sp;
}

// ---- the modes of one spring ----------------------------------------------------------------------

std::vector<Mode> springModes(const Spring &sp, double fMax, double fMin, double wMin) {
  RodSolver &solver = *sp.solver;
  const double R = sp.R, L = sp.L, alpha = sp.alpha, scale = cE / R, A = solver.rc.A;
  const double wMaxHat = (TAU * fMax) / scale, wMinHat = (TAU * fMin) / scale;
  const double k0 = fd::cos(alpha);
  std::vector<Mode> out;
  for (int n = 1; n < 4000; n++) {
    const double kh = (n * PI * R) / L;
    solver.solve(kh);
    if (solver.w[0] > wMaxHat && kh > k0) break;
    for (int j = 0; j < 2; j++) {
      const double w = solver.w[j];
      if (w > wMaxHat || w < wMinHat) continue;
      const double d = beadShare(solver.Y, j, alpha, sp.axial), wt = d * d, rel = wt * A;
      if (rel > wMin) out.push_back({n, j, kh / R, (w * scale) / TAU, solver.dw[j] * cE, wt, rel});
    }
  }
  return out;
}

// ---- losses and the mallet ----------------------------------------------------------------------------

double modeSigma(double f, double cg, double L, double endLoss, double eta, double oil) {
  const double np = (endLoss * 2.302585092994046) / 20; // dB per reflection → nepers (Math.LN10)
  return oil + PI * f * eta + (np * std::fabs(cg)) / L;
}
double pulseLength(double mallet, double velocity) { return (mallet / 1000) * fd::pow(0.7 / std::max(0.05, velocity), 0.2); }
double pulseSpectrum(double f, double tau) {
  const double u = 2 * f * tau;
  return std::fabs(u - 1) < 1e-6 ? PI / 4 : std::fabs(fd::cos((PI * u) / 2) / (1 - u * u));
}

// ---- the virtual pitch ------------------------------------------------------------------------------------

namespace shs {
constexpr double ppo = 96, compression = 0.75, fLo = 25, fHi = 5000, floorDb = -50;
constexpr int harmonics = 15, width = 4;
}
static double pitchWeight(double f) { return 1 / std::sqrt((1 + fd::pow(f / 2500, 2)) * (1 + fd::pow(300 / f, 2))); }

Pitch virtualPitch(const std::vector<Partial> &partials, double center, double halfCents) {
  using namespace shs;
  const double lo = log2(fLo);
  const int n = (int)jsRound((log2(fHi * harmonics * 2) - lo) * ppo);
  std::vector<double> Pw(n, 0.0), E(n, 0.0);
  for (const Partial &p : partials) {
    if (!(p.f > fLo) || !(p.a > 0)) continue;
    const double x = (log2(p.f) - lo) * ppo;
    const int i0 = (int)std::floor(x);
    for (int i = i0 - width; i <= i0 + width + 1; i++) {
      if (i < 0 || i >= n) continue;
      const double w = 1 - std::fabs(i - x) / (width + 1);
      if (w > 0) Pw[i] += p.a * p.a * w;
    }
  }
  double pm = 0;
  for (int i = 0; i < n; i++) if (Pw[i] > pm) pm = Pw[i];
  if (!(pm > 0)) return {NAN, 0, NAN, false};
  const double floor = pm * fd::pow(10, floorDb / 10);
  for (int i = 0; i < n; i++) if (Pw[i] > floor) E[i] = pitchWeight(fd::pow(2, lo + i / ppo)) * fd::pow(Pw[i] / pm, 0.3);
  const int m = (int)jsRound((log2(fHi) - lo) * ppo);
  std::vector<double> curve(m + 1);
  for (int i = 0; i <= m; i++) {
    double sum = 0, w = 1;
    for (int k = 1; k <= harmonics; k++) {
      const double x = i + log2(k) * ppo;
      const int j = (int)std::floor(x);
      const double fr = x - j;
      if (j + 1 < n) sum += w * (E[j] * (1 - fr) + E[j + 1] * fr);
      w *= compression;
    }
    curve[i] = sum;
  }
  struct Pick { double f, s; bool edge; };
  auto pick = [&](int a, int b) {
    int bi = a;
    for (int i = a; i <= b; i++) if (curve[i] > curve[bi]) bi = i;
    double x = bi;
    if (bi > 0 && bi < m) { const double A = curve[bi - 1], B = curve[bi], C = curve[bi + 1], d = A - 2 * B + C; if (d < 0) x = bi + (0.5 * (A - C)) / d; }
    return Pick{fd::pow(2, lo + x / ppo), curve[bi], bi == a || bi == b};
  };
  const Pick all = pick(0, m);
  const int c = (int)jsRound((log2(center) - lo) * ppo), hw = (int)jsRound((halfCents / 1200) * ppo);
  const Pick near = pick(std::max(0, c - hw), std::min(m, c + hw));
  return {near.f, near.s, all.f, near.edge};
}

std::vector<Partial> heardPartials(const std::vector<const SpringData *> &springs, const Params &P, double rho) {
  const double tau = pulseLength(P.mallet, MF);
  std::vector<Partial> out;
  for (const SpringData *sp : springs) {
    const double fb = sp->f0 / (PI * std::max(1e-4, P.bead / 100)), share = 1.0 / springs.size();
    for (size_t i = 0; i < sp->f.size(); i++) {
      const double f = sp->f[i] * rho, x = f / fb, sig = modeSigma(f, sp->cg[i], sp->L / rho, P.endLoss, P.eta, P.oil), st = 2 * sig * HEAR;
      const double a = (std::fabs(sp->rel[i]) * share * pulseSpectrum(f, tau)) / (1 + x * x);
      out.push_back({f, a * std::sqrt(st > 1e-9 ? (1 - fd::exp(-st)) / st : 1)});
    }
  }
  return out;
}

// ---- a key's springs ------------------------------------------------------------------------------------

static const double SPRING_OFFSETS[3][3] = {{0, 0, 0}, {0.5, -0.5, 0}, {0, 1, -1}};

namespace {
struct Estimate { double f; bool edge; double global; };
}

KeySprings keySprings(int key, const Params &P, double fs, double wMin) {
  const int nS = (int)std::max(1.0, std::min(3.0, jsRound(P.springs)));
  const Spring base = tuneSpring(key, P);
  std::vector<SpringData> raw;
  for (int s = 0; s < nS; s++) {
    const double off = SPRING_OFFSETS[nS - 1][s] * (P.spread / 100);
    Spring sp = base;
    if (off != 0) { sp.L = base.L * (1 + off); sp.TD = base.TD * (1 + off); }
    const std::vector<Mode> modes = springModes(sp, std::min(sp.fMax, 0.45 * fs), 20, wMin);
    SpringData d;
    d.L = sp.L; d.f0 = sp.f0; d.key = key; d.TD = sp.TD; d.Fc = sp.Fc; d.gain = sp.slinky ? SLINKY_GAIN : 1;
    for (const Mode &m : modes) { d.f.push_back(m.f); d.cg.push_back(m.cg); d.rel.push_back(m.rel * (m.n % 2 ? -1 : 1)); d.n.push_back(m.n); }
    raw.push_back(std::move(d));
  }
  // the mean (in cents) of each spring's own virtual pitch, then the whole set's peak within 40 ¢
  const double f0 = base.f0;
  auto est = [&](double r) -> Estimate {
    double c = 0;
    bool edge = false;
    for (const SpringData &sp : raw) {
      const Pitch v = virtualPitch(heardPartials({&sp}, P, r), f0);
      c += log2(v.f / f0) / raw.size();
      edge = edge || !(v.f > 0) || v.edge;
    }
    const double mean = f0 * fd::pow(2, c);
    if (raw.size() == 1 || edge) return {mean, edge, mean};
    std::vector<const SpringData *> all;
    for (const SpringData &sp : raw) all.push_back(&sp);
    const Pitch a = virtualPitch(heardPartials(all, P, r), mean, 40);
    return a.edge || !(a.f > 0) ? Estimate{mean, edge, a.global} : Estimate{a.f, edge, a.global};
  };
  const Estimate before = est(1);
  double rho = 1;
  Estimate after = before;
  if (!base.slinky && before.f > 0 && !before.edge) {
    // a fixed point, ρ ← ρ·f₀/estimate; then, if the estimate jumps between neighbouring peaks, a
    // bisection between the closest settings either side of the note
    struct Tried { double rho, e; Estimate v; };
    std::vector<Tried> tried{{1, cents(before.f, f0), before}};
    Tried best = tried[0];
    Estimate v = before;
    for (int it = 0; it < 6 && std::fabs(best.e) > 0.3; it++) {
      const double next = rho * (f0 / v.f);
      if (!(next > 0.8 && next < 1.25)) break;
      rho = next; v = est(rho);
      if (!(v.f > 0) || v.edge) break;
      tried.push_back({rho, cents(v.f, f0), v});
      if (std::fabs(tried.back().e) < std::fabs(best.e)) best = tried.back();
    }
    const Tried *below = nullptr, *above = nullptr;
    for (const Tried &t : tried) {
      if (t.e < 0 && (!below || t.e > below->e)) below = &t;
      if (t.e > 0 && (!above || t.e < above->e)) above = &t;
    }
    if (std::fabs(best.e) > 0.5 && below && above) {
      Tried a = *below, b = *above;
      for (int it = 0; it < 10 && std::fabs(best.e) > 0.3; it++) {
        const double r = std::sqrt(a.rho * b.rho);
        const Estimate u = est(r);
        if (!(u.f > 0) || u.edge) break;
        const Tried t{r, cents(u.f, f0), u};
        if (std::fabs(t.e) < std::fabs(best.e)) best = t;
        if ((t.e < 0) == (a.e < 0)) a = t; else b = t;
      }
    }
    rho = best.rho; after = best.v;
  }
  const double fMax = std::min(base.fMax, 0.45 * fs);
  KeySprings out;
  out.id = geometryId(P); out.fs = fs; out.key = key;
  out.rho = rho; out.pitchBefore = before.f; out.pitch = after.f; out.global = after.global;
  for (const SpringData &sp : raw) {
    SpringData d;
    d.L = sp.L / rho; d.f0 = sp.f0; d.key = sp.key; d.TD = sp.TD / rho; d.Fc = sp.Fc * rho; d.gain = sp.gain;
    for (size_t i = 0; i < sp.f.size(); i++) if (sp.f[i] * rho <= fMax) {
      d.f.push_back(sp.f[i] * rho); d.cg.push_back(sp.cg[i]); d.rel.push_back(sp.rel[i]); d.n.push_back(sp.n[i]);
    }
    out.springs.push_back(std::move(d));
  }
  return out;
}

std::vector<double> packKeySprings(const KeySprings &d) {
  std::vector<double> a{(double)(uint32_t)(d.id >> 32), (double)(uint32_t)d.id, d.fs, (double)d.key, d.rho, d.pitchBefore, d.pitch, d.global, (double)d.springs.size()};
  for (const SpringData &s : d.springs) {
    const size_t N = s.f.size();
    for (double v : {s.L, s.f0, s.TD, s.Fc, s.gain, (double)N}) a.push_back(v);
    a.insert(a.end(), s.f.begin(), s.f.end());
    a.insert(a.end(), s.cg.begin(), s.cg.end());
    a.insert(a.end(), s.rel.begin(), s.rel.end());
    for (int n : s.n) a.push_back(n);
  }
  return a;
}
bool unpackKeySprings(const double *a, int n, KeySprings &d) {
  if (n < 9) return false;
  d.id = ((uint64_t)(uint32_t)a[0] << 32) | (uint32_t)a[1];
  d.fs = a[2]; d.key = (int)a[3]; d.rho = a[4]; d.pitchBefore = a[5]; d.pitch = a[6]; d.global = a[7];
  const int nS = (int)a[8];
  if (nS < 1 || nS > 3) return false;
  int i = 9;
  d.springs.clear();
  for (int s = 0; s < nS; s++) {
    if (i + 6 > n) return false;
    SpringData sp;
    sp.L = a[i]; sp.f0 = a[i + 1]; sp.TD = a[i + 2]; sp.Fc = a[i + 3]; sp.gain = a[i + 4]; sp.key = d.key;
    const int N = (int)a[i + 5];
    i += 6;
    if (N < 0 || i + 4 * N > n) return false;
    sp.f.assign(a + i, a + i + N); sp.cg.assign(a + i + N, a + i + 2 * N); sp.rel.assign(a + i + 2 * N, a + i + 3 * N);
    for (int q = 0; q < N; q++) sp.n.push_back((int)a[i + 3 * N + q]);
    i += 4 * N;
    d.springs.push_back(std::move(sp));
  }
  return i == n;
}

// ---- the dispersion, for the views ------------------------------------------------------------------

double kAbove(const Spring &sp, double R, double f) {
  RodSolver &solver = *sp.solver;
  const double wHat = (TAU * f * R) / cE;
  double lo = fd::cos(sp.alpha), hi = lo + 0.5;
  for (;;) { solver.solve(hi); if (!(solver.w[0] < wHat && hi < 1e4)) break; hi *= 1.5; }
  for (int i = 0; i < 50; i++) { const double m = 0.5 * (lo + hi); solver.solve(m); if (solver.w[0] < wHat) lo = m; else hi = m; }
  return hi;
}
void dispersionCurve(const Spring &sp, double R, double fTop, int n, std::vector<CurvePoint> pts[2]) {
  RodSolver &solver = *sp.solver;
  const double scale = cE / R, kTop = kAbove(sp, R, fTop);
  pts[0].clear(); pts[1].clear();
  for (int i = 1; i <= n; i++) {
    const double kh = ((double)i / n) * kTop;
    solver.solve(kh);
    for (int j = 0; j < 2; j++) {
      const double d = beadShare(solver.Y, j, sp.alpha, sp.axial);
      pts[j].push_back({kh / R, (solver.w[j] * scale) / TAU, solver.dw[j] * cE, d * d});
    }
  }
}

} // namespace forte::springs
