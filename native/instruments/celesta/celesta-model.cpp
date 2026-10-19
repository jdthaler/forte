// celesta-model.cpp — the celesta's physics (celesta-model.h).

#include "celesta-model.h"

#include <algorithm>
#include <numbers>

namespace forte::celesta {

using std::numbers::pi;

static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }
static double tKey(int k) { return clamp((double)(k - KEY_LO) / (KEY_HI - KEY_LO), 0, 1); }

Blank barBlank(int k, double thick) {
  const double t = tKey(k);
  return {0.030 - 0.010 * t, (thick / 1000) * (1 - 0.2 * t)};
}

static const double D_TH = THERMO.k / (STEEL.rho * THERMO.cp);
double zener(double h, double f) {
  const double wt = (TAU * f * h * h) / (pi * pi * D_TH);
  return (ZENER_DELTA * wt) / (1 + wt * wt);
}

double eulerFreq(double L, double b, double h, int n) {
  (void)b;
  return (BETA_L[n] * BETA_L[n] * h * std::sqrt(STEEL.E / (12 * STEEL.rho))) / (TAU * L * L);
}

// ---------------------------------------------------------------------------
// The Timoshenko beam
//
// κGA(w'' − ψ') + ρAω² w = 0 and EIψ'' + κGA(w' − ψ) + ρIω² ψ = 0. With w ∝ e^{λx}:
// λ⁴ + ρω²(1/κG + 1/E) λ² + ρ²ω⁴/(EκG) − ρAω²/(EI) = 0, whose roots (below the second spectrum)
// are ±α and ±iβ, and ψ = (λ + c/λ) w with c = ρω²/(κG). The general solution
//   w = C₁ cosh αx + C₂ sinh αx + C₃ cos βx + C₄ sin βx
//   ψ = kₐ(C₁ sinh αx + C₂ cosh αx) + k_b(−C₃ sin βx + C₄ cos βx),   kₐ = α + c/α, k_b = β − c/β
// is free at x = 0 (no moment ψ' = 0, no shear w' − ψ = 0) when C₃ = kₐα C₁/(k_bβ) and
// C₄ = (β/α) C₂, which leaves two conditions at x = L on C₁, C₂.

namespace {
struct Roots { double alpha, beta, ka, kb; };
Roots roots(double omega, double b, double h) {
  const double A = b * h, I = (b * h * h * h) / 12, kG = KAPPA * G_STEEL, w2 = omega * omega;
  const double B = w2 * STEEL.rho * (1 / kG + 1 / STEEL.E), C = (STEEL.rho * STEEL.rho * w2 * w2) / (STEEL.E * kG) - (STEEL.rho * A * w2) / (STEEL.E * I);
  const double disc = std::sqrt(B * B - 4 * C), al = std::sqrt(std::max(1e-300, 0.5 * (disc - B))), be = std::sqrt(0.5 * (disc + B));
  const double c = (STEEL.rho * w2) / kG;
  return {al, be, al + c / al, be - c / be};
}
// The two conditions at x = L, rows of a 2 × 2 matrix in (C₁, C₂): the moment, and the shear × k_b.
struct Rows { double a11, a12, a21, a22; };
Rows endRows(const Roots &r, double L) {
  const double ch = std::cosh(r.alpha * L), sh = std::sinh(r.alpha * L), cb = std::cos(r.beta * L), sb = std::sin(r.beta * L);
  const double b2 = r.beta * r.beta;
  return {r.ka * r.alpha * (ch - cb), r.ka * r.alpha * sh - (r.kb * b2 * sb) / r.alpha,
          -(r.kb * sh) / r.alpha - (r.ka * r.alpha * sb) / b2, (r.kb * (cb - ch)) / r.alpha};
}
} // namespace

double timoshenkoDet(double omega, double L, double b, double h) {
  const Roots r = roots(omega, b, h);
  const Rows m = endRows(r, L);
  return (L * L * (m.a11 * m.a22 - m.a12 * m.a21)) / std::cosh(r.alpha * L);
}

int timoshenkoFreqs(double L, double b, double h, int n, double *f) {
  n = std::min(n, N_BEND);
  // shear and rotary inertia only lower a mode: scan from well below mode 1 to just past mode n's
  // Euler–Bernoulli frequency, then bisect each change of sign
  const double lo = 0.3 * eulerFreq(L, b, h, 0), hi = 1.02 * eulerFreq(L, b, h, n - 1), step = 1.003;
  int found = 0;
  double fa = lo, da = timoshenkoDet(TAU * fa, L, b, h);
  while (found < n && fa < hi) {
    const double fb = fa * step, db = timoshenkoDet(TAU * fb, L, b, h);
    if ((da < 0) != (db < 0)) {
      double x0 = fa, x1 = fb, d0 = da;
      for (int it = 0; it < 80 && x1 - x0 > 1e-13 * x1; it++) {
        const double xm = 0.5 * (x0 + x1), dm = timoshenkoDet(TAU * xm, L, b, h);
        if ((dm < 0) == (d0 < 0)) { x0 = xm; d0 = dm; } else x1 = xm;
      }
      f[found++] = 0.5 * (x0 + x1);
    }
    fa = fb; da = db;
  }
  return found;
}

double torsionJ(double b, double h) {
  const double a = std::max(b, h), c = std::min(b, h), q = c / a;
  return a * c * c * c * (1.0 / 3 - 0.21 * q * (1 - (q * q * q * q) / 12));
}
double torsionFreq(double L, double b, double h, int n) {
  const double Ip = (b * h * (b * b + h * h)) / 12;
  return ((n + 1) / (2 * L)) * std::sqrt((G_STEEL * torsionJ(b, h)) / (STEEL.rho * Ip));
}

Geometry barGeometry(int k, double thick, double ratio) {
  k = std::min(KEY_MAX, std::max(KEY_MIN, k));
  const Blank bl = barBlank(k, thick);
  const double ft = keyFreq(k) * ratio;
  // Euler–Bernoulli first, then the Timoshenko bar: f₁ ∝ 1/L², nearly
  double L = std::sqrt((BETA_L[0] * BETA_L[0] * bl.h * std::sqrt(STEEL.E / (12 * STEEL.rho))) / (TAU * ft));
  for (int it = 0; it < 12; it++) {
    double f1;
    if (timoshenkoFreqs(L, bl.b, bl.h, 1, &f1) < 1) break;
    const double r = f1 / ft;
    L *= std::sqrt(r);
    if (std::fabs(r - 1) < 1e-12) break;
  }
  return {k, L, bl.b, bl.h, STEEL.rho * bl.b * bl.h * L};
}

// ---------------------------------------------------------------------------
// One bar

// A thin strip moving normal to itself radiates as a line of dipoles:
// J = ∫(1 − μ²)|I(μ)|² dμ, with a density per unit length that is constant along the bar.
static double radiationJ(const std::array<double, NX> &shape, double L, double density, double k) {
  constexpr int NM = 16;
  const double dx = L / (NX - 1);
  double J = 0;
  for (int j = 0; j < NM; j++) {
    const double mu = -1 + (2 * (j + 0.5)) / NM;
    double re = 0, im = 0;
    for (int i = 0; i < NX; i++) {
      const double wq = (i == 0 || i == NX - 1 ? 0.5 : 1) * dx, ph = k * (i * dx - L / 2) * mu, v = density * shape[i] * wq;
      re += v * std::cos(ph); im += v * std::sin(ph);
    }
    J += (1 - mu * mu) * (re * re + im * im) * (2.0 / NM);
  }
  return J;
}

double shapeAt(const Bar &bar, int mode, double u) {
  const double x = clamp(u, 0, 1) * (NX - 1), i = std::min(std::floor(x), (double)NX - 2), fr = x - i;
  const auto &w = bar.w[mode];
  return w[(int)i] * (1 - fr) + w[(int)i + 1] * fr;
}

// Simpson's rule over the NX points.
static double simpson(const std::array<double, NX> &y, double L) {
  double s = y[0] + y[NX - 1];
  for (int i = 1; i < NX - 1; i++) s += (i % 2 ? 4 : 2) * y[i];
  return (s * L) / (3 * (NX - 1));
}

void buildBar(int k, double thick, Bar &bar, double ratio) {
  const Geometry g = barGeometry(k, thick, ratio);
  const double L = g.L, b = g.b, h = g.h, A = b * h, I = (b * h * h * h) / 12, dx = L / (NX - 1);
  bar = Bar{};
  bar.geom = g;
  double fb[N_BEND];
  const int nb = timoshenkoFreqs(L, b, h, N_BEND, fb);
  int count = 0;
  std::array<double, NX> w{}, psi{}, m{};
  for (int n = 0; n < nb; n++) {
    if (fb[n] > 20000) break;
    const Roots r = roots(TAU * fb[n], b, h);
    const Rows e = endRows(r, L);
    // C₂ from whichever end condition carries it best (they agree at a root)
    const double s1 = std::max(std::fabs(e.a11), std::fabs(e.a12)), s2 = std::max(std::fabs(e.a21), std::fabs(e.a22));
    const double C1 = 1, C2 = std::fabs(e.a12) / s1 >= std::fabs(e.a22) / s2 ? -e.a11 / e.a12 : -e.a21 / e.a22;
    const double C3 = (r.ka * r.alpha) / (r.kb * r.beta), C4 = (r.beta / r.alpha) * C2;
    for (int i = 0; i < NX; i++) {
      const double x = i * dx, ax = r.alpha * x, bx = r.beta * x;
      w[i] = C1 * std::cosh(ax) + C2 * std::sinh(ax) + C3 * std::cos(bx) + C4 * std::sin(bx);
      psi[i] = r.ka * (C1 * std::sinh(ax) + C2 * std::cosh(ax)) + r.kb * (-C3 * std::sin(bx) + C4 * std::cos(bx));
      m[i] = STEEL.rho * (A * w[i] * w[i] + I * psi[i] * psi[i]);
    }
    const double s = (w[0] < 0 ? -1 : 1) / std::sqrt(simpson(m, L)); // unit modal mass, the end moving up
    for (int i = 0; i < NX; i++) bar.w[count][i] = w[i] * s;
    bar.f[count] = fb[n];
    bar.tors[count] = false;
    count++;
  }
  const int nBend = count;
  const double Ip = (b * h * (b * b + h * h)) / 12;
  for (int n = 0; n < N_TORS; n++) {
    const double f = torsionFreq(L, b, h, n);
    if (f > 20000) break;
    const double s = 1 / std::sqrt((STEEL.rho * Ip * L) / 2);
    for (int i = 0; i < NX; i++) bar.w[count][i] = s * std::cos(((n + 1) * pi * i) / (NX - 1));
    bar.f[count] = f;
    bar.tors[count] = true;
    count++;
  }
  bar.count = count;
  // the blocks sit at mode 1's nodes
  {
    const auto &w1 = bar.w[0];
    int j = 0;
    for (int i = 1; i < NX && j < 2; i++)
      if ((w1[i - 1] < 0) != (w1[i] < 0)) bar.nodes[j++] = (i - 1 + w1[i - 1] / (w1[i - 1] - w1[i])) * dx;
  }
  // the damper felt: a pad across the bar, DAMPER_W long, centred DAMPER_X from the end; each mode
  // feels the mean of its shape² under it (torsion: averaged over the width too), relative to mode 1
  auto underPad = [&](int i) {
    double s = 0;
    for (int j = 0; j < 9; j++) { const double v = shapeAt(bar, i, DAMPER_X + DAMPER_W * (j / 8.0 - 0.5)); s += v * v / 9; }
    return s * (bar.tors[i] ? (b * b) / 12 : 1);
  };
  const double d1 = underPad(0);
  for (int i = 0; i < count; i++) {
    const double f = bar.f[i], kw = (TAU * f) / C_AIR, dip = 1 / std::sqrt(1 + std::pow((kw * b) / 2, 2));
    bar.ratio[i] = f / bar.f[0];
    // the blocks: a dashpot over each pad's width (bending: the pad's own rocking too; torsion: across the width)
    double sup = 0;
    for (double x : bar.nodes) {
      const double u = x / L, v = shapeAt(bar, i, u), sl = (shapeAt(bar, i, u + 1e-3) - shapeAt(bar, i, u - 1e-3)) / (2e-3 * L);
      sup += bar.tors[i] ? 0.5 * SUPPORT.r * v * v * (b * b) / 12 : 0.5 * SUPPORT.r * (v * v + (SUPPORT.halfWidth * SUPPORT.halfWidth * sl * sl) / 3);
    }
    bar.sigSup[i] = sup;
    bar.sigTE[i] = bar.tors[i] ? 0 : pi * f * zener(h, f);
    const double J = radiationJ(bar.w[i], L, bar.tors[i] ? (pi * std::pow(b, 4) * kw) / 128 : (pi * b * b) / 4, kw);
    bar.sigRad[i] = (RHO_AIR * C_AIR * std::pow(kw, 4) * J * dip * dip) / (32 * pi);
    bar.out[i] = (kw * std::sqrt(J) * dip) / 2;
    bar.dampW[i] = underPad(i) / d1;
  }
  (void)nBend;
  // the box: its mouth spans the blocks, as wide as the bar
  Box &bx = bar.box;
  bx.w = b; bx.l = bar.nodes[1] - bar.nodes[0]; bx.S = bx.w * bx.l;
  {
    std::array<double, NX> part{};
    for (int i = 0; i < NX; i++) { const double x = i * dx; part[i] = x >= bar.nodes[0] && x <= bar.nodes[1] ? bar.w[0][i] : 0; }
    bx.Sb = std::fabs(bx.w * simpson(part, L));
  }
  bx.Rb = bx.w / 2;
  bx.delta0 = 0.61 * std::sqrt(bx.S / pi);
  bx.perim = 2 * (bx.w + bx.l);
  const auto [pl, pr] = keyPan(k, 0.5, KEY_LO, KEY_HI);
  bar.pan = {pl, pr};
}

// ---------------------------------------------------------------------------
// The box

BoxState boxState(const Box &box, double f1, double gap, double detune) {
  const double g = std::max(5e-4, gap);
  // cut the box so that, with the gap's air on its mouth, it sounds at the bar's pitch (× detune)
  const double wT = TAU * f1 * std::pow(2.0, detune / 1200), lx = (std::log(1 + box.Rb / g) * box.S) / (TAU * g);
  const double le = -lx + std::sqrt(lx * lx + std::pow((pi * C_AIR) / (2 * wT), 2));
  const double ma = (RHO_AIR * le) / (2 * box.S), Ka = ma * std::pow((pi * C_AIR) / (2 * le), 2), mg = gapInertance(g, box.Rb);
  const double k = (TAU * f1) / C_AIR, Rrad = (RHO_AIR * C_AIR * k * k) / (4 * pi);
  const double sw = 2.95e-5 * std::sqrt(f1) * (box.perim / (2 * box.S)) * C_AIR; // the walls' viscous and thermal boundary layers
  BoxState s;
  s.depth = le - box.delta0; s.le = le; s.ma = ma; s.Ka = Ka; s.mg = mg; s.Rrad = Rrad;
  s.Rwall = 2 * sw * ma; s.R = Rrad + s.Rwall;
  s.M11 = 1 + mg * box.Sb * box.Sb; s.M12 = -mg * box.Sb; s.M22 = ma + mg;
  return s;
}

std::array<double, 2> twoOscillator(double fb, double ft, double kappa) {
  const double wb = TAU * fb, wt = TAU * ft, s = wb * wb + wt * wt, dsc = std::sqrt(s * s - 4 * (1 - kappa * kappa) * wb * wb * wt * wt);
  return {std::sqrt((s - dsc) / (2 * (1 - kappa * kappa))) / TAU, std::sqrt((s + dsc) / (2 * (1 - kappa * kappa))) / TAU};
}

Hammer hammerOf(int k, double hardness, double massGrams) {
  const double t = tKey(k);
  return {(massGrams / 1000) * std::pow(0.5, t), (hardness * std::pow(40.0, t)) / std::pow(1e-3, FELT_P), FELT_P, FELT_ALPHA};
}

} // namespace forte::celesta
