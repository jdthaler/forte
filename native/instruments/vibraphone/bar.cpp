// bar.cpp — the bar's finite elements and their eigenmodes, as bar.js computes them.

#include "bar.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::vibraphone {

using std::numbers::pi;

double ebRatio(int n) { return std::pow(BETA_L[n] / BETA_L[0], 2); }

// 5-point Gauss–Legendre on [0, 1]
static constexpr double GX[5] = {0.04691007703066802, 0.2307653449471585, 0.5, 0.7692346550528415, 0.9530899229693319};
static constexpr double GW[5] = {0.11846344252809454, 0.23931433524968324, 0.28444444444444444, 0.23931433524968324, 0.11846344252809454};

// Thickness at distance X from the centre: flat at h₀ − d for X ≤ c, a cosine rise to h₀ at
// X = a (zero slope at both ends, so the cut is smooth).
double thickness(const Cut &cut, double X) {
  X = std::fabs(X);
  if (cut.d <= 0 || X >= cut.a) return cut.h0;
  if (X <= cut.c) return cut.h0 - cut.d;
  return cut.h0 - cut.d * 0.5 * (1 + std::cos((pi * (X - cut.c)) / (cut.a - cut.c)));
}

// Torsion constant of a b × h rectangle (b ≥ h), Roark's approximation.
double torsionJ(double b, double h) {
  const double t = std::min(b, h), w = std::max(b, h), r = t / w;
  return w * std::pow(t, 3) * (1.0 / 3 - 0.21 * r * (1 - std::pow(r, 4) / 12));
}

// Half-bar node positions (0 = centre … L/2 = end), with nodes on the cut's corners.
std::vector<double> halfMesh(const Cut &cut, double L, int fine) {
  const double half = L / 2;
  std::vector<double> x = {0};
  auto seg = [&](double to, int n) { const double from = x.back(); for (int i = 1; i <= n; i++) x.push_back(from + ((to - from) * i) / n); };
  auto n = [&](double k) { return std::max(1, (int)std::round(k * fine)); };
  if (cut.d <= 0 || cut.a <= 0) seg(half, n(36));
  else {
    const double a = std::min(cut.a, half), c = std::min(cut.c, a);
    if (c > 1e-5 * L) seg(c, n(10));
    seg(a, n(16));
    if (half - a > 1e-5 * L) seg(half, n(10));
  }
  return x;
}

// Timoshenko element with interdependent interpolation (exact for a uniform element in statics;
// Reddy): w cubic, θ quadratic, φ = 12EI/(κGAl²).
struct Shapes { double Nw[4], Nt[4], dNw[4], dNt[4]; };
static void shapes(double xi, double l, double phi, Shapes &o) {
  const double mu = 1 / (1 + phi), x2 = xi * xi, x3 = x2 * xi;
  o.Nw[0] = mu * (1 - 3 * x2 + 2 * x3 + phi * (1 - xi));
  o.Nw[1] = l * mu * (xi - 2 * x2 + x3 + (phi / 2) * (xi - x2));
  o.Nw[2] = mu * (3 * x2 - 2 * x3 + phi * xi);
  o.Nw[3] = l * mu * (-x2 + x3 + (phi / 2) * (-xi + x2));
  o.Nt[0] = ((6 * mu) / l) * (-xi + x2);
  o.Nt[1] = mu * (1 - 4 * xi + 3 * x2 + phi * (1 - xi));
  o.Nt[2] = ((6 * mu) / l) * (xi - x2);
  o.Nt[3] = mu * (-2 * xi + 3 * x2 + phi * xi);
  o.dNw[0] = (mu * (-6 * xi + 6 * x2 - phi)) / l;
  o.dNw[1] = mu * (1 - 4 * xi + 3 * x2 + (phi / 2) * (1 - 2 * xi));
  o.dNw[2] = (mu * (6 * xi - 6 * x2 + phi)) / l;
  o.dNw[3] = mu * (-2 * xi + 3 * x2 + (phi / 2) * (-1 + 2 * xi));
  o.dNt[0] = ((6 * mu) / (l * l)) * (-1 + 2 * xi);
  o.dNt[1] = (mu * (-4 + 6 * xi - phi)) / l;
  o.dNt[2] = ((6 * mu) / (l * l)) * (1 - 2 * xi);
  o.dNt[3] = (mu * (-2 + 6 * xi + phi)) / l;
}

// Bending: banded K, M of the half bar, and the per-element bending stiffness blocks (for
// strain-energy bookkeeping). shear = false gives Euler–Bernoulli (φ = 0, no rotary inertia).
Bending assembleBending(const std::vector<double> &nodes, const Cut &cut, double b, bool shear) {
  const double E = AL.E, rho = AL.rho;
  const int nn = (int)nodes.size(), n = 2 * nn;
  Bending B{std::vector<double>(n * 4), std::vector<double>(n * 4), n, {}};
  B.Kb.reserve(nn);
  Shapes SH;
  for (int e = 0; e < nn - 1; e++) {
    const double x0 = nodes[e], l = nodes[e + 1] - x0, hm = thickness(cut, x0 + l / 2);
    const double phi = shear ? (12 * E * (b * std::pow(hm, 3) / 12)) / (KAPPA * G_AL * b * hm * l * l) : 0;
    double kb[16] = {}, ks[16] = {}, me[16] = {};
    for (int g = 0; g < 5; g++) {
      const double xi = GX[g], h = thickness(cut, x0 + xi * l), A = b * h, I = (b * std::pow(h, 3)) / 12, w = GW[g] * l;
      shapes(xi, l, phi, SH);
      for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
        kb[i * 4 + j] += w * E * I * SH.dNt[i] * SH.dNt[j];
        if (shear) ks[i * 4 + j] += w * KAPPA * G_AL * A * (SH.dNw[i] - SH.Nt[i]) * (SH.dNw[j] - SH.Nt[j]);
        me[i * 4 + j] += w * rho * (A * SH.Nw[i] * SH.Nw[j] + (shear ? I * SH.Nt[i] * SH.Nt[j] : 0));
      }
    }
    for (int i = 0; i < 4; i++) for (int j = i; j < 4; j++) {
      B.K[(2 * e + i) * 4 + j - i] += kb[i * 4 + j] + ks[i * 4 + j];
      B.M[(2 * e + i) * 4 + j - i] += me[i * 4 + j];
    }
    ElementBending el{{}, phi, l, hm};
    std::copy(kb, kb + 16, el.kb.begin());
    B.Kb.push_back(el);
  }
  return B;
}

// Torsion (Saint-Venant, linear elements): GJ θ″ and the polar inertia ρ(bh³ + hb³)/12.
Torsion assembleTorsion(const std::vector<double> &nodes, const Cut &cut, double b) {
  const int nn = (int)nodes.size();
  Torsion T{std::vector<double>(nn * 4), std::vector<double>(nn * 4), nn};
  const double rho = AL.rho;
  for (int e = 0; e < nn - 1; e++) {
    const double x0 = nodes[e], l = nodes[e + 1] - x0;
    double k = 0, m11 = 0, m12 = 0, m22 = 0;
    for (int g = 0; g < 5; g++) {
      const double xi = GX[g], h = thickness(cut, x0 + xi * l), w = GW[g] * l;
      k += (w * G_AL * torsionJ(b, h)) / (l * l);
      const double ip = (rho * (b * std::pow(h, 3) + h * std::pow(b, 3))) / 12;
      m11 += w * ip * std::pow(1 - xi, 2); m12 += w * ip * (1 - xi) * xi; m22 += w * ip * xi * xi;
    }
    T.K[e * 4] += k; T.K[e * 4 + 1] -= k; T.K[(e + 1) * 4] += k;
    T.M[e * 4] += m11; T.M[e * 4 + 1] += m12; T.M[(e + 1) * 4] += m22;
  }
  return T;
}

// Drop one degree of freedom (a symmetry condition at the centre) from a band matrix.
static std::vector<double> dropDof(const std::vector<double> &B, int n, int s) {
  const int N = n - 1;
  std::vector<double> out(N * 4);
  for (int i = 0; i < N; i++) {
    const int a = i < s ? i : i + 1;
    for (int j = 0; j < 4 && i + j < N; j++) {
      const int c = i + j < s ? i + j : i + j + 1;
      if (c - a <= 3) out[i * 4 + j] = B[a * 4 + c - a];
    }
  }
  return out;
}

// LDLᵀ of the band matrix K − λM (no pivoting): returns the number of negative pivots, which by
// Sylvester's law of inertia is the number of eigenvalues below λ.
static int ldl(const double *k, const double *m, int N, double lam, double *d, double *Lb) {
  int neg = 0;
  for (int i = 0; i < N; i++) {
    double di = k[i * 4] - lam * m[i * 4];
    for (int t = 1; t <= 3 && i - t >= 0; t++) { const double l = Lb[(i - t) * 4 + t]; di -= l * l * d[i - t]; }
    if (di == 0) di = 1e-300;
    d[i] = di; if (di < 0) neg++;
    for (int j = 1; j <= 3 && i + j < N; j++) {
      double v = k[i * 4 + j] - lam * m[i * 4 + j];
      for (int kk = std::max(0, i + j - 3); kk < i; kk++) v -= Lb[kk * 4 + (i + j - kk)] * Lb[kk * 4 + (i - kk)] * d[kk];
      Lb[i * 4 + j] = v / di;
    }
  }
  return neg;
}

// Band matrix × vector.
static void bandMul(const double *B, int N, const double *x, double *y) {
  std::fill(y, y + N, 0.0);
  for (int i = 0; i < N; i++) {
    y[i] += B[i * 4] * x[i];
    for (int j = 1; j <= 3 && i + j < N; j++) { const double v = B[i * 4 + j]; y[i] += v * x[i + j]; y[i + j] += v * x[i]; }
  }
}

double bandEig(const std::vector<double> &kv, const std::vector<double> &mv, int N, int idx, std::vector<double> *xOut, double tol, double guess) {
  const double *k = kv.data(), *m = mv.data();
  std::vector<double> d(N), Lb(N * 4);
  double lo = 0, hi = guess;
  while (ldl(k, m, N, hi, d.data(), Lb.data()) < idx) hi *= 4;
  for (int it = 0; it < 200 && hi - lo > tol * hi; it++) {
    const double mid = 0.5 * (lo + hi);
    if (ldl(k, m, N, mid, d.data(), Lb.data()) >= idx) hi = mid; else lo = mid;
  }
  const double lambda = 0.5 * (lo + hi);
  if (!xOut) return lambda;
  // inverse iteration at a shift just off the eigenvalue
  const double shift = lambda * (1 - 1e-9) - 1e-9;
  std::vector<double> &x = *xOut, y(N);
  x.assign(N, 0.0);
  for (int i = 0; i < N; i++) x[i] = 1 + 0.37 * std::sin(1.7 * i);
  for (int it = 0; it < 3; it++) {
    ldl(k, m, N, shift, d.data(), Lb.data());
    bandMul(m, N, x.data(), y.data());
    for (int i = 0; i < N; i++) { double v = y[i]; for (int t = 1; t <= 3 && i - t >= 0; t++) v -= Lb[(i - t) * 4 + t] * y[i - t]; y[i] = v; } // L z = y
    for (int i = 0; i < N; i++) y[i] /= d[i];
    for (int i = N - 1; i >= 0; i--) { double v = y[i]; for (int t = 1; t <= 3 && i + t < N; t++) v -= Lb[i * 4 + t] * y[i + t]; y[i] = v; } // Lᵀ x = z
    bandMul(m, N, y.data(), x.data());
    double s = 0; for (int i = 0; i < N; i++) s += y[i] * x[i];
    s = 1 / std::sqrt(s);
    for (int i = 0; i < N; i++) x[i] = y[i] * s;
  }
  return lambda;
}

std::array<double, 3> bendingFreqs3(const Cut &cut, double L, double b, int fine) {
  const std::vector<double> nodes = halfMesh(cut, L, fine);
  const Bending B = assembleBending(nodes, cut, b);
  const int n = B.n, N = n - 1;
  const auto ks = dropDof(B.K, n, 1), ms = dropDof(B.M, n, 1), ka = dropDof(B.K, n, 0), ma = dropDof(B.M, n, 0);
  auto f = [&](const std::vector<double> &k, const std::vector<double> &m, int i) { return std::sqrt(bandEig(k, m, N, i)) / (2 * pi); };
  return {f(ks, ms, 2), f(ka, ma, 2), f(ks, ms, 3)};
}

// Interpolate a half-bar bending eigenvector (dofs w, θ per node, one dropped) to positions xs
// (from the centre) and expand by symmetry.
static std::vector<double> bendingShape(const std::vector<double> &nodes, const std::vector<ElementBending> &Kb, const std::vector<double> &x,
                                        int drop, bool sym, const std::vector<double> &xs) {
  std::vector<double> full(2 * nodes.size());
  for (size_t i = 0, j = 0; i < full.size(); i++) full[i] = (int)i == drop ? 0 : x[j++];
  std::vector<double> out(xs.size());
  Shapes SH;
  for (size_t q = 0; q < xs.size(); q++) {
    const double X = xs[q], ax = std::fabs(X);
    size_t e = 0;
    while (e < nodes.size() - 2 && ax > nodes[e + 1]) e++;
    const double l = nodes[e + 1] - nodes[e], xi = std::min(1.0, std::max(0.0, (ax - nodes[e]) / l));
    shapes(xi, l, Kb[e].phi, SH);
    double w = 0;
    for (int i = 0; i < 4; i++) w += SH.Nw[i] * full[2 * e + i];
    out[q] = X < 0 && !sym ? -w : w;
  }
  return out;
}

BarModes barModes(const Cut &cut, double L, double b, int nx, int fine, int nBend, int nTors) {
  const std::vector<double> nodes = halfMesh(cut, L, fine);
  const Bending B = assembleBending(nodes, cut, b);
  const int n = B.n, N = n - 1, ne = (int)nodes.size() - 1;
  std::vector<double> xs(nx);
  for (int i = 0; i < nx; i++) xs[i] = ((double)i / (nx - 1)) * L - L / 2;
  struct Set { int drop; bool sym; std::vector<double> k, m; };
  const Set sets[2] = {{1, true, dropDof(B.K, n, 1), dropDof(B.M, n, 1)}, {0, false, dropDof(B.K, n, 0), dropDof(B.M, n, 0)}};
  BarModes out{L, b, cut, nx, {}, {}, {}, 0};
  std::vector<double> x;
  // mode order: 1 sym, 2 anti, 3 sym, 4 anti, 5 sym (index 1 of each set is a rigid-body mode)
  for (int i = 0; i < nBend; i++) {
    const Set &s = sets[i % 2];
    const int idx = 2 + i / 2;
    const double lambda = bandEig(s.k, s.m, N, idx, &x);
    std::vector<double> half(x.size());
    for (size_t j = 0; j < x.size(); j++) half[j] = x[j] * std::numbers::sqrt2 / 2; // half-bar normalised to ½ → whole bar to 1
    std::vector<double> full(n);
    for (int r = 0, j = 0; r < n; r++) full[r] = r == s.drop ? 0 : half[j++];
    // bending share of strain energy per element (for thermoelastic loss)
    BendMode md;
    double Ub = 0;
    const double Ut = 0.5 * lambda * 0.5; // ½ ω² (xᵀMx = ½ on the half bar)
    md.elems.reserve(ne);
    std::vector<double> u(ne), h(ne);
    for (int e = 0; e < ne; e++) {
      const double xe[4] = {full[2 * e], full[2 * e + 1], full[2 * e + 2], full[2 * e + 3]};
      const auto &kb = B.Kb[e].kb;
      double ue = 0;
      for (int p = 0; p < 4; p++) for (int q = 0; q < 4; q++) ue += 0.5 * xe[p] * kb[p * 4 + q] * xe[q];
      u[e] = ue; h[e] = B.Kb[e].h; Ub += ue;
    }
    for (int e = 0; e < ne; e++) md.elems.push_back({h[e], u[e] / Ut});
    md.w = bendingShape(nodes, B.Kb, half, s.drop, s.sym, xs);
    if (md.w[0] < 0) for (double &v : md.w) v = -v; // sign: the end at x = 0 moves +
    md.f = std::sqrt(lambda) / (2 * pi); md.omega = std::sqrt(lambda); md.sym = s.sym; md.bendShare = Ub / Ut;
    out.bend.push_back(std::move(md));
  }
  // torsion
  const Torsion T = assembleTorsion(nodes, cut, b);
  struct TSet { int drop; bool sym; int idx; };
  const TSet tsets[2] = {{0, false, 1}, {-1, true, 2}};
  for (int i = 0; i < nTors; i++) {
    const TSet &s = tsets[i % 2];
    const std::vector<double> k = s.drop >= 0 ? dropDof(T.K, T.n, s.drop) : T.K, m = s.drop >= 0 ? dropDof(T.M, T.n, s.drop) : T.M;
    const int Nt = s.drop >= 0 ? T.n - 1 : T.n;
    const double lambda = bandEig(k, m, Nt, s.idx + i / 2, &x);
    std::vector<double> full(T.n);
    for (int r = 0, j = 0; r < T.n; r++) full[r] = r == s.drop ? 0 : x[j++] * (std::numbers::sqrt2 / 2);
    TorsMode md{std::sqrt(lambda) / (2 * pi), std::sqrt(lambda), s.sym, std::vector<double>(nx)};
    for (int q = 0; q < nx; q++) {
      const double X = xs[q], ax = std::fabs(X);
      size_t e = 0;
      while (e < nodes.size() - 2 && ax > nodes[e + 1]) e++;
      const double uu = std::min(1.0, std::max(0.0, (ax - nodes[e]) / (nodes[e + 1] - nodes[e])));
      const double v = (1 - uu) * full[e] + uu * full[e + 1];
      md.psi[q] = X < 0 && !s.sym ? -v : v;
    }
    if (md.psi[0] < 0) for (double &v : md.psi) v = -v;
    out.tors.push_back(std::move(md));
  }
  double mass = 0;
  for (int e = 0; e < ne; e++) {
    const double l = nodes[e + 1] - nodes[e];
    for (int g = 0; g < 5; g++) mass += 2 * GW[g] * l * AL.rho * b * thickness(cut, nodes[e] + GX[g] * l);
  }
  out.mass = mass;
  out.xs.resize(nx);
  for (int i = 0; i < nx; i++) out.xs[i] = xs[i] + L / 2;
  return out;
}

static std::array<double, 3> solve3(std::array<std::array<double, 3>, 3> A, std::array<double, 3> b) {
  double m[3][4];
  for (int i = 0; i < 3; i++) { for (int j = 0; j < 3; j++) m[i][j] = A[i][j]; m[i][3] = b[i]; }
  for (int c = 0; c < 3; c++) {
    int p = c;
    for (int r = c + 1; r < 3; r++) if (std::fabs(m[r][c]) > std::fabs(m[p][c])) p = r;
    for (int k = 0; k < 4; k++) std::swap(m[c][k], m[p][k]);
    for (int r = c + 1; r < 3; r++) { const double f = m[r][c] / m[c][c]; for (int k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
  }
  std::array<double, 3> x = {0, 0, 0};
  for (int r = 2; r >= 0; r--) { double s = m[r][3]; for (int k = r + 1; k < 3; k++) s -= m[r][k] * x[k]; x[r] = s / m[r][r]; }
  return x;
}

Tuned tuneUndercut(double f1, double b, double h0, double cf, std::array<double, 3> start, double r2, double r3, int fine, int maxIter) {
  // unknowns u = [A = a/(L/2), D = d/h0, ln L]
  using V = std::array<double, 3>;
  V u = {start[0], start[1], std::log(start[2])};
  auto res = [&](const V &v) -> V {
    const double L = std::exp(v[2]), a = (v[0] * L) / 2;
    const auto f = bendingFreqs3({h0, a, cf * a, v[1] * h0}, L, b, fine);
    return {std::log(f[1] / f[0] / r2), std::log(f[2] / f[0] / r3), std::log(f[0] / f1)};
  };
  auto norm = [](const V &x) { return std::hypot(x[0], x[1], x[2]); };
  V r = res(u);
  int it = 0;
  for (; it < maxIter; it++) {
    if (std::fabs(r[0]) + std::fabs(r[1]) + std::fabs(r[2]) < 1e-9) break;
    std::array<V, 3> J;
    const double e = 1e-6;
    for (int j = 0; j < 3; j++) {
      V v = u; v[j] += e;
      const V rj = res(v);
      for (int i = 0; i < 3; i++) J[i][j] = (rj[i] - r[i]) / e;
    }
    const V step = solve3(J, {-r[0], -r[1], -r[2]});
    double s = std::min(1.0, 0.08 / std::max({std::fabs(step[0]), std::fabs(step[1]), 1e-12}));
    // backtrack until the residual falls
    V un{}, rn{};
    bool have = false;
    for (int bt = 0; bt < 12; bt++, s *= 0.5) {
      un = {u[0] + s * step[0], u[1] + s * step[1], u[2] + s * step[2]};
      if (!(un[0] > 0.05 && un[0] < 1 && un[1] > 0 && un[1] < 0.92)) continue;
      rn = res(un); have = true;
      if (norm(rn) < norm(r)) break;
    }
    if (!have) break;
    u = un; r = rn;
  }
  const double L = std::exp(u[2]), a = (u[0] * L) / 2;
  Tuned t{L, u[0], u[1], cf, {h0, a, cf * a, u[1] * h0}, {}, it};
  for (int i = 0; i < 3; i++) t.residualCents[i] = (1200 * r[i]) / std::numbers::ln2;
  return t;
}

} // namespace forte::vibraphone
