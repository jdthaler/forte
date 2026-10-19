// kalimba-model.cpp — the kalimba's physics (kalimba-model.h).
#include "kalimba-model.h"
#include <cmath>
#include <complex>
#include <numbers>
#include <Eigen/Dense>
#include "forte/dsp.h"
#include "kalimba-params.h"
namespace forte::kalimba {
namespace {
using std::numbers::pi;
using Mat8 = Eigen::Matrix<double, 8, 8>;

// The boundary conditions of the clamped–supported–free beam at βL = b, for back/front ratio r.
// Each segment is A cos βs + B sin βs + C e^(−βs) + D e^(−β(ℓ−s)), s from its own start (the
// clamp, then the bridge), ℓ its length: every term stays bounded, so the matrix stays well
// conditioned however high the mode. Derivative rows are divided by the matching power of β.
// With r = 0 the back segment is gone and the tine is clamped at the bridge (rows 0–3 then pin
// its first four unknowns to zero, leaving the clamped–free beam).
Mat8 conditions(double b, double r) {
  Mat8 m = Mat8::Zero();
  const double e1 = std::exp(-b), c1 = std::cos(b), s1 = std::sin(b);
  if (r > 0) {
    const double er = std::exp(-b * r), cr = std::cos(b * r), sr = std::sin(b * r);
    m.row(0) << 1, 0, 1, er, 0, 0, 0, 0;            // w(clamp) = 0
    m.row(1) << 0, 1, -1, er, 0, 0, 0, 0;           // w'(clamp) = 0
    m.row(2) << cr, sr, er, 1, 0, 0, 0, 0;          // w(bridge) = 0, from behind
    m.row(3) << 0, 0, 0, 0, 1, 0, 1, e1;            // w(bridge) = 0, in front
    m.row(4) << -sr, cr, -er, 1, 0, -1, 1, -e1;     // slope continuous over the bridge
    m.row(5) << -cr, -sr, er, 1, 1, 0, -1, -e1;     // bending moment continuous (a support holds none)
  } else {
    for (int i = 0; i < 4; i++) m(i, i) = 1;
    m.row(4) << 0, 0, 0, 0, 1, 0, 1, e1;            // w(bridge) = 0
    m.row(5) << 0, 0, 0, 0, 0, 1, -1, e1;           // w'(bridge) = 0: clamped there
  }
  m.row(6) << 0, 0, 0, 0, -c1, -s1, e1, 1;          // no moment at the tip
  m.row(7) << 0, 0, 0, 0, s1, -c1, -e1, 1;          // no shear at the tip
  return m;
}
double det(double b, double r) { return conditions(b, r).partialPivLu().determinant(); }

double segment(const std::array<double, 8> &c, int o, double b, double s, double len) {
  return c[o] * std::cos(b * s) + c[o + 1] * std::sin(b * s) + c[o + 2] * std::exp(-b * s) + c[o + 3] * std::exp(-b * (len - s));
}
} // namespace

double modeShape(const TineShape &t, int n, double xi) {
  const auto &c = t.c[n];
  const double b = t.beta[n];
  if (xi < 0) return t.r > 0 ? segment(c, 0, b, xi + t.r, t.r) : 0;
  return segment(c, 4, b, xi, 1);
}

const TineShape &tineShape(double r) {
  static TineShape cache;
  r = std::max(0.0, r);
  if (cache.r == r) return cache;
  TineShape t;
  t.r = r;
  // Roots of the determinant: a scan, then bisection. Modes are at least π/(1 + r) apart in βL.
  const double step = 0.25 / (1 + r);
  double b0 = 0.05, d0 = det(b0, r);
  while (t.count < MAX_MODES && b0 < 80) {
    const double b1 = b0 + step, d1 = det(b1, r);
    if ((d0 < 0) != (d1 < 0)) {
      double lo = b0, hi = b1, dlo = d0;
      for (int i = 0; i < 60; i++) {
        const double mid = 0.5 * (lo + hi), dm = det(mid, r);
        if ((dm < 0) == (dlo < 0)) { lo = mid; dlo = dm; } else hi = mid;
      }
      const double b = 0.5 * (lo + hi);
      // its shape: the null vector of the conditions
      Eigen::JacobiSVD<Mat8> svd(conditions(b, r), Eigen::ComputeFullV);
      const Eigen::Matrix<double, 8, 1> v = svd.matrixV().col(7);
      int n = t.count++;
      t.beta[n] = b;
      for (int i = 0; i < 8; i++) t.c[n][i] = v(i);
      // normalise: ∫φ² = 1 over the whole tine, the tip moving up; and its net force ∫φ
      const int N = 800;
      double s2 = 0, s1 = 0;
      for (int seg = 0; seg < 2; seg++) {
        const double x0 = seg ? 0 : -r, x1 = seg ? 1 : 0;
        if (x1 <= x0) continue;
        const double h = (x1 - x0) / N;
        for (int i = 0; i <= N; i++) { // Simpson
          const double w = (i == 0 || i == N) ? 1 : (i % 2 ? 4 : 2), y = modeShape(t, n, x0 + i * h);
          s2 += w * h / 3 * y * y; s1 += w * h / 3 * y;
        }
      }
      const double norm = (modeShape(t, n, 1) < 0 ? -1 : 1) / std::sqrt(s2);
      for (double &x : t.c[n]) x *= norm;
      t.S[n] = s1 * norm;
    }
    b0 = b1; d0 = d1;
  }
  cache = t;
  return cache;
}

double releaseSpectrum(double f, double tau) {
  const double u = 2 * f * tau;
  return std::fabs(u - 1) < 1e-6 ? pi / 4 : std::fabs(std::cos((pi * u) / 2) / (1 - u * u));
}

double bridgeX(int key) {
  // C4 in the middle, then alternately right and left, to 20 % either side for E6, the end of a
  // 17-tine kalimba; the tines beyond carry on to the same edges, alternating as they go.
  const int i = std::abs(key - 60), side = (i % 2 ? -1 : 1) * (key < 60 ? -1 : 1);
  return 0.5 + side * 0.2 * std::min(1.0, ((i + 1) / 2) / 14.0);
}

Tine tineOf(int key, const double *P) {
  const TineShape &s = tineShape(P[p::back]);
  Tine t;
  t.f1 = keyFreq(key) * tuningOf(P).ratio(key); // the note: equal temperament × the keyboard's tuning (forte/tuning.h)
  t.t = P[p::thick] / 1000;
  t.mu = RHO_STEEL * TINE_WIDTH * t.t;
  t.EI = E_STEEL * TINE_WIDTH * t.t * t.t * t.t / 12;
  // f1 = β1² √(EI/μ) / (2π L²): the front length that puts the first mode on the note
  t.L = std::sqrt(s.beta[0] * s.beta[0] * std::sqrt(t.EI / t.mu) / (TAU * t.f1));
  t.a = s.r * t.L;
  // The thumb pushes the pluck point down by DEPTH, unless that takes more than THUMB_FORCE: the
  // tine's flexibility there is Σ φ(p)² / (μL ω²) over its modes.
  double flex = 0;
  const double p = P[p::pluck];
  for (int n = 0; n < s.count; n++) {
    const double w = TAU * t.f1 * (s.beta[n] / s.beta[0]) * (s.beta[n] / s.beta[0]), ph = modeShape(s, n, p);
    flex += ph * ph / (t.mu * t.L * w * w);
  }
  t.force = std::min(DEPTH / flex, THUMB_FORCE);
  t.depth = t.force * flex;
  return t;
}

KeyModes keyModes(int key, const double *P) {
  KeyModes out;
  const TineShape &s = tineShape(P[p::back]);
  const Tine t = tineOf(key, P);
  out.tine = t;
  const double sigma0 = sigmaFromT60(P[p::t60]), tau = P[p::thumb] / 1000, p = P[p::pluck];
  for (int n = 0; n < s.count; n++) {
    const double f = t.f1 * (s.beta[n] / s.beta[0]) * (s.beta[n] / s.beta[0]);
    if (f > F_MAX) break;
    const double w = TAU * f, ph = modeShape(s, n, p), R = releaseSpectrum(f, tau);
    out.m[out.count++] = {f, sigma0 * std::pow(f / F_REF, P[p::damping]), t.force * ph * s.S[n] * R, t.force * ph * R / (t.mu * t.L * w * w)};
  }
  return out;
}

double staticDeflection(int key, const double *P, double xi) {
  const TineShape &s = tineShape(P[p::back]);
  const Tine t = tineOf(key, P);
  double w = 0;
  for (int n = 0; n < s.count; n++) {
    const double om = TAU * t.f1 * (s.beta[n] / s.beta[0]) * (s.beta[n] / s.beta[0]);
    w += t.force * modeShape(s, n, P[p::pluck]) * modeShape(s, n, xi) / (t.mu * t.L * om * om);
  }
  return w;
}

double plateShape(const PlateMode &pm, double x, double y) { return std::sin(pm.m * pi * x) * std::sin(pm.n * pi * y); }

Box boxOf(const double *P, double cover) {
  Box box;
  box.V = P[p::box] / 1000;
  const double s = std::cbrt(box.V / (BOX_A * BOX_B * BOX_D));
  box.a = BOX_A * s; box.b = BOX_B * s; box.d = BOX_D * s; box.h = BOX_H * s;
  // The top, simply supported on the sides: f_mn = (π/2) √(D/ρh) ((m/a)² + (n/b)²). Only modes
  // with m and n odd have a net volume velocity, S = ab · 4/(mnπ²) for a shape of height 1.
  const double Dp = E_WOOD * box.h * box.h * box.h / (12 * (1 - NU_WOOD * NU_WOOD)), c = (pi / 2) * std::sqrt(Dp / (RHO_WOOD * box.h));
  const int mn[PLATE_MODES][2] = {{1, 1}, {3, 1}, {1, 3}, {3, 3}, {5, 1}, {1, 5}, {5, 3}, {3, 5}};
  for (int i = 0; i < PLATE_MODES; i++) {
    const int m = mn[i][0], n = mn[i][1];
    box.plate[i] = {m, n, c * ((m / box.a) * (m / box.a) + (n / box.b) * (n / box.b)), RHO_WOOD * box.h * box.a * box.b / 4, box.a * box.b * 4 / (m * n * pi * pi)};
  }
  const PlateMode &p11 = box.plate[0];
  const double wp = TAU * p11.f;
  box.kappa = RHO_AIR * C_AIR * C_AIR / box.V;
  box.Rp = p11.M * wp / PLATE_Q;
  box.fp = p11.f;
  box.fpSealed = std::sqrt((p11.M * wp * wp + box.kappa * p11.S * p11.S) / p11.M) / TAU;
  // The sound hole: a neck as long as the top is thick plus the end corrections (0.85 r at each
  // end). A finger over part of it leaves an opening of the same area, as a smaller hole.
  const double rh = P[p::hole] / 2000, A = pi * rh * rh * (1 - std::clamp(cover, 0.0, 1.0));
  box.open = A > 1e-7;
  if (box.open) {
    const double re = std::sqrt(A / pi), Leff = box.h + 1.7 * re;
    box.Ih = RHO_AIR * Leff / A;
    box.Rh = std::sqrt(box.kappa * box.Ih) / HOLE_Q;
    box.fH = std::sqrt(box.kappa / box.Ih) / TAU;
    // the coupled pair: ω⁴ − ω²(ωps² + ωH²) + ωp²ωH² = 0
    const double a2 = std::pow(TAU * box.fpSealed, 2) + std::pow(TAU * box.fH, 2), a0 = wp * wp * std::pow(TAU * box.fH, 2);
    const double disc = std::sqrt(std::max(0.0, a2 * a2 - 4 * a0));
    box.fLo = std::sqrt((a2 - disc) / 2) / TAU;
    box.fHi = std::sqrt((a2 + disc) / 2) / TAU;
  } else {
    box.Ih = INFINITY; box.Rh = 0; box.fH = 0; box.fLo = 0; box.fHi = box.fpSealed;
  }
  return box;
}

double boxResponse(const Box &box, int key, double f) {
  using C = std::complex<double>;
  const double w = TAU * f, x = bridgeX(key);
  const C i(0, 1);
  const auto impedance = [&](const PlateMode &pm) { const double wm = TAU * pm.f; return pm.M * (wm * wm - w * w) + i * w * pm.M * wm / PLATE_Q; };
  // the (1,1) mode and the hole, coupled through the cavity: [Z11 Z12; Z12 Z22] [q; U] = [φF; 0]
  const PlateMode &p11 = box.plate[0];
  const double phi = plateShape(p11, x, BRIDGE_Y);
  const C Z11 = impedance(p11) + box.kappa * p11.S * p11.S;
  C Q;
  if (box.open) {
    const C Z12 = box.kappa * p11.S, Z22 = box.kappa - w * w * box.Ih + i * w * box.Rh, D = Z11 * Z22 - Z12 * Z12;
    Q = p11.S * phi * Z22 / D - phi * Z12 / D;
  } else {
    Q = p11.S * phi / Z11;
  }
  for (int j = 1; j < PLATE_MODES; j++) Q += box.plate[j].S * plateShape(box.plate[j], x, BRIDGE_Y) / impedance(box.plate[j]);
  return w * w * std::abs(Q);
}

const std::array<Cap, MAX_CAPS> CAPS = {{
  {0.20, 0.85, 3400, 8100}, {0.35, 0.88, 4100, 9300}, {0.50, 0.84, 3700, 8800}, {0.65, 0.87, 4500, 10100},
  {0.80, 0.85, 3900, 8600}, {0.27, 0.75, 4800, 10900}, {0.58, 0.76, 3200, 7600}, {0.73, 0.74, 4300, 9700},
}};

} // namespace forte::kalimba
