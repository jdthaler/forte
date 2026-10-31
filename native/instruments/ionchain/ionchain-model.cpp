// ionchain-model.cpp — the Ion Chain's physics (ionchain-model.h).

#include "ionchain-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"
#include "forte/linalg.h"
#include "ionchain-params.h"

namespace forte::ionchain {

namespace {
constexpr double PI = std::numbers::pi;
constexpr double KE_Q2 = 8.9875517923e9 * 1.602176634e-19 * 1.602176634e-19; // q² / 4πε₀ (J m)
constexpr double AMU = 1.66053906660e-27;
constexpr double ION_MASS = 39.96259 * AMU - 9.1093837015e-31;                // ⁴⁰Ca⁺ (kg)

// U, its gradient and its Hessian at r = (x₀, z₀, x₁, z₁ …) for α.
double energy(int N, double a2, const Vector &r) {
  double U = 0;
  for (int i = 0; i < N; i++) {
    U += 0.5 * (a2 * r[2 * i] * r[2 * i] + r[2 * i + 1] * r[2 * i + 1]);
    for (int j = i + 1; j < N; j++) U += 1 / std::sqrt((r[2 * i] - r[2 * j]) * (r[2 * i] - r[2 * j]) + (r[2 * i + 1] - r[2 * j + 1]) * (r[2 * i + 1] - r[2 * j + 1]));
  }
  return U;
}
void gradient(int N, double a2, const Vector &r, Vector &g) {
  for (int i = 0; i < N; i++) {
    double gx = a2 * r[2 * i], gz = r[2 * i + 1];
    for (int j = 0; j < N; j++) {
      if (j == i) continue;
      const double dx = r[2 * i] - r[2 * j], dz = r[2 * i + 1] - r[2 * j + 1], q = dx * dx + dz * dz, s = 1 / (q * std::sqrt(q));
      gx -= dx * s; gz -= dz * s;
    }
    g[2 * i] = gx; g[2 * i + 1] = gz;
  }
}
void hessian(int N, double a2, const Vector &r, Matrix &H) {
  H.setZero(2 * N, 2 * N);
  for (int i = 0; i < N; i++) {
    H(2 * i, 2 * i) += a2; H(2 * i + 1, 2 * i + 1) += 1;
    for (int j = 0; j < N; j++) {
      if (j == i) continue;
      const double dx = r[2 * i] - r[2 * j], dz = r[2 * i + 1] - r[2 * j + 1], q = dx * dx + dz * dz, s = 1 / (q * q * std::sqrt(q));
      // ∂²(1/r)/∂rᵢ∂rᵢ = (3 d dᵀ − r² I) / r⁵, and its negative between i and j
      const double kxx = (3 * dx * dx - q) * s, kzz = (3 * dz * dz - q) * s, kxz = 3 * dx * dz * s;
      H(2 * i, 2 * i) += kxx; H(2 * i + 1, 2 * i + 1) += kzz; H(2 * i, 2 * i + 1) += kxz; H(2 * i + 1, 2 * i) += kxz;
      H(2 * i, 2 * j) -= kxx; H(2 * i + 1, 2 * j + 1) -= kzz; H(2 * i, 2 * j + 1) -= kxz; H(2 * i + 1, 2 * j) -= kxz;
    }
  }
}
// The linear chain's axial Hessian's largest eigenvalue μ_N.
double topAxial(int N, const double *z) {
  Matrix A = Matrix::Zero(N, N);
  for (int i = 0; i < N; i++) {
    A(i, i) = 1;
    for (int j = 0; j < N; j++) if (j != i) { const double c = 2 / (std::fabs(z[i] - z[j]) * std::fabs(z[i] - z[j]) * std::fabs(z[i] - z[j])); A(i, i) += c; A(i, j) = -c; }
  }
  return symEig(A).lambda[N - 1];
}
} // namespace

double lengthScale(double fz) {
  const double w = 2 * PI * fz;
  return std::cbrt(KE_Q2 / (ION_MASS * w * w));
}

double pulseSpectrum(double f, double tau) {
  const double u = 2 * f * tau;
  return std::fabs(u - 1) < 1e-6 ? PI / 4 : std::fabs(fdlibm::cos((PI * u) / 2) / (1 - u * u));
}

void linearChain(int N, double *z) {
  if (N <= 1) { if (N == 1) z[0] = 0; return; }
  // a start that grows as the chain does (the ends near 0.63 (N − 1)^0.66 ℓ), then Newton on the
  // axial forces, its steps held to a third of the nearest gap so the ions keep their order
  const double end = 0.63 * fdlibm::pow(N - 1.0, 0.66);
  for (int i = 0; i < N; i++) z[i] = -end + (2 * end * i) / (N - 1);
  Matrix A(N, N);
  Vector g(N);
  for (int it = 0; it < 200; it++) {
    double worst = 0;
    for (int i = 0; i < N; i++) {
      double f = z[i];
      A.row(i).setZero();
      A(i, i) = 1;
      for (int j = 0; j < N; j++) {
        if (j == i) continue;
        const double d = z[i] - z[j], ad = std::fabs(d);
        f -= (d > 0 ? 1 : -1) / (d * d);
        A(i, i) += 2 / (ad * ad * ad); A(i, j) = -2 / (ad * ad * ad);
      }
      g[i] = f; worst = std::max(worst, std::fabs(f));
    }
    if (worst < 1e-14) break;
    Vector step = A.llt().solve(g);
    double gap = INFINITY, big = 0;
    for (int i = 0; i + 1 < N; i++) gap = std::min(gap, z[i + 1] - z[i]);
    for (int i = 0; i < N; i++) big = std::max(big, std::fabs(step[i]));
    const double scale = big > gap / 3 ? gap / (3 * big) : 1;
    for (int i = 0; i < N; i++) z[i] -= scale * step[i];
  }
}

double zigzagAlpha(int N) {
  if (N < 2) return 0;
  double z[MAXN];
  linearChain(N, z);
  return std::sqrt((topAxial(N, z) - 1) / 2);
}

void solveCrystal(Crystal &c, int N, double alpha, const Crystal *warm) {
  N = std::clamp(N, 1, MAXN);
  const int M = 2 * N;
  const double a2 = alpha * alpha;
  c.N = N; c.M = M; c.alpha = alpha;
  double z[MAXN];
  linearChain(N, z);
  Vector r = Vector::Zero(M);
  for (int i = 0; i < N; i++) r[2 * i + 1] = z[i];
  const bool line = N < 2 || a2 > (topAxial(N, z) - 1) / 2;
  if (!line) {
    // Past the transition the line is a saddle: start from the last zigzag of these ions, or
    // from the line bent into one, and go down U by Newton's method, shifted (H + μI) where H is
    // not yet positive definite, with a backtracking line search.
    if (warm && warm->N == N && warm->zigzag) for (int i = 0; i < N; i++) { r[2 * i] = warm->x[i]; r[2 * i + 1] = warm->z[i]; }
    else for (int i = 0; i < N; i++) r[2 * i] = (i % 2 ? -0.2 : 0.2);
    Vector g(M), step(M), trial(M);
    Matrix H(M, M);
    double U = energy(N, a2, r);
    for (int it = 0; it < 300; it++) {
      gradient(N, a2, r, g);
      if (g.cwiseAbs().maxCoeff() < 1e-13) break;
      hessian(N, a2, r, H);
      double mu = 0;
      for (int k = 0; k < 60; k++) {
        Eigen::LLT<Matrix> llt(H + mu * Matrix::Identity(M, M));
        if (llt.info() == Eigen::Success) { step = llt.solve(g); break; }
        mu = mu ? 4 * mu : 1e-3;
      }
      double t = 1;
      for (int k = 0; k < 40; k++, t /= 2) {
        trial = r - t * step;
        const double Ut = energy(N, a2, trial);
        if (Ut <= U) { r = trial; U = Ut; break; }
      }
      if (t < 1e-12) break;
    }
  }
  double reach = 0, zlo = INFINITY, zhi = -INFINITY, xlo = INFINITY, xhi = -INFINITY;
  bool bent = false;
  for (int i = 0; i < N; i++) {
    c.x[i] = r[2 * i]; c.z[i] = r[2 * i + 1];
    if (std::fabs(c.x[i]) > 1e-7) bent = true;
    reach = std::max(reach, std::sqrt(c.x[i] * c.x[i] + c.z[i] * c.z[i]));
    zlo = std::min(zlo, c.z[i]); zhi = std::max(zhi, c.z[i]); xlo = std::min(xlo, c.x[i]); xhi = std::max(xhi, c.x[i]);
  }
  if (!bent) for (int i = 0; i < N; i++) c.x[i] = 0;
  c.zigzag = bent;
  c.reach = std::max(reach, 1.0);
  c.spacing = N > 1 ? std::max({zhi - zlo, xhi - xlo, 1e-3}) / (N - 1) : 1;
  for (int i = 0; i < N; i++) { r[2 * i] = c.x[i]; r[2 * i + 1] = c.z[i]; }
  Matrix H(M, M);
  hessian(N, a2, r, H);
  const Eigen_ e = symEig(H);
  for (int m = 0; m < M; m++) {
    c.lam[m] = std::max(e.lambda[m], 1e-9); // at the transition itself the soft mode is zero
    for (int d = 0; d < M; d++) c.B[d][m] = e.X(d, m);
  }
}

void couple(const Crystal &c, const double *P, Couplings &out) {
  const int N = c.N, M = c.M;
  // the electrodes: one at distance R in the direction φ off the axis, the other opposite it
  const double R = P[p::distance] * c.reach, phi = P[p::side] * PI / 180;
  const double ex = R * fdlibm::sin(phi), ez = R * fdlibm::cos(phi);
  double El[MAXN][2], Er[MAXN][2], sl = 0, sr = 0;
  for (int j = 0; j < N; j++) {
    for (int s = 0; s < 2; s++) {
      const double px = s ? -ex : ex, pz = s ? -ez : ez;
      const double dx = px - c.x[j], dz = pz - c.z[j], q = dx * dx + dz * dz, k = 1 / (q * std::sqrt(q));
      double (&E)[MAXN][2] = s ? Er : El;
      E[j][0] = dx * k; E[j][1] = dz * k;
      (s ? sr : sl) += (dx * dx + dz * dz) * k * k;
    }
  }
  sl = std::sqrt(sl / N); sr = std::sqrt(sr / N);
  // the laser: a line through the axis at the beam's place, at its angle θ; each ion lit by the
  // Gaussian beam's intensity at its distance from that line, pushed along it
  const double th = P[p::angle] * PI / 180, kx = fdlibm::sin(th), kz = fdlibm::cos(th);
  double zEnd = 0;
  int end = 0;
  for (int j = 0; j < N; j++) if (c.z[j] > c.z[end]) end = j;
  zEnd = N > 1 ? c.z[end] : 0;
  const double zb = P[p::beam] * zEnd, w = P[p::waist] * c.spacing;
  double lit[MAXN], total = 0;
  for (int j = 0; j < N; j++) {
    const double d = c.x[j] * kz - (c.z[j] - zb) * kx;
    lit[j] = fdlibm::exp(-2 * d * d / (w * w));
    total += lit[j];
  }
  const double share = 1 / std::max(1.0, total);
  const bool endOnly = (int)P[p::coolOn] == coolOn_::end;
  for (int m = 0; m < M; m++) {
    double k = 0, wl = 0, wr = 0;
    for (int j = 0; j < N; j++) {
      const double bx = c.B[2 * j][m], bz = c.B[2 * j + 1][m];
      k += lit[j] * (kx * bx + kz * bz);
      wl += El[j][0] * bx + El[j][1] * bz;
      wr += Er[j][0] * bx + Er[j][1] * bz;
    }
    out.kick[m] = k * share;
    out.wl[m] = wl / sl;
    out.wr[m] = -wr / sr;
    out.sR[m] = 0.5 * (out.wl[m] * out.wl[m] + out.wr[m] * out.wr[m]) / P[p::resist];
    const double b2 = c.B[2 * end][m] * c.B[2 * end][m] + c.B[2 * end + 1][m] * c.B[2 * end + 1][m];
    out.sD[m] = (endOnly ? b2 : 1) / P[p::cool];
  }
}

} // namespace forte::ionchain
