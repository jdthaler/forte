// tubular-model.cpp — the physics of tubular bells (tubular-model.h).

#include "tubular-model.h"

#include <algorithm>
#include <cstring>
#include <type_traits>
#include <numbers>

namespace forte::tubular {

using std::numbers::pi;
using cx = std::complex<double>;

static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }

double cowperKappa(double nu, double m) {
  const double q = (1 + m * m) * (1 + m * m);
  return (6 * (1 + nu) * q) / ((7 + 6 * nu) * q + (20 + 12 * nu) * m * m);
}

Section sectionOf(int material, double diameterMm, double wallMm, double capGrams) {
  const Material &M = MATERIALS[std::min(2, std::max(0, material))];
  Section s;
  s.E = M.E; s.rho = M.rho; s.G = M.E / (2 * (1 + M.nu));
  s.a = diameterMm / 2000;
  const double t = std::min(wallMm / 1000, 0.45 * 2 * s.a); // the bore stays open
  s.ai = s.a - t;
  s.kappa = cowperKappa(M.nu, s.ai / s.a);
  s.A = pi * (s.a * s.a - s.ai * s.ai);
  s.I = (pi / 4) * (std::pow(s.a, 4) - std::pow(s.ai, 4));
  s.mc = std::max(0.0, capGrams) / 1000;
  // the plug, a short cylinder in the bore, turning about the tube's end
  s.Jc = s.mc * ((s.ai * s.ai) / 4 + (CAP_DEPTH * CAP_DEPTH) / 3);
  return s;
}

double eulerFreq(const Section &s, double L, int n) {
  const double b = n < 6 ? BETA_L[n] : (n + 0.5) * pi;
  return (b * b * std::sqrt((s.E * s.I) / (s.rho * s.A))) / (TAU * L * L);
}

double cutoffFreq(const Section &s) { return std::sqrt((s.kappa * s.G * s.A) / (s.rho * s.I)) / TAU; }

Roots roots(const Section &s, double omega) {
  const double kG = s.kappa * s.G, w2 = omega * omega;
  const double B = w2 * s.rho * (1 / kG + 1 / s.E), C = (s.rho * s.rho * w2 * w2) / (s.E * kG) - (s.rho * s.A * w2) / (s.E * s.I);
  const double disc = std::sqrt(B * B - 4 * C), al = std::sqrt(std::max(1e-300, 0.5 * (disc - B))), be = std::sqrt(0.5 * (disc + B));
  const double c = (s.rho * w2) / kG;
  return {al, be, al + c / al, be - c / be};
}

// Columns: e^{−αx}, e^{α(x−L)}, cos βx, sin βx. The shear κGA(w′ − ψ) is ρAω² (e^{−αx}/α,
// −e^{α(x−L)}/α, −sin βx/β, cos βx/β) and the moment EIψ′ is EI (αkₐ e^{−αx}, αkₐ e^{α(x−L)},
// −k_bβ cos βx, −k_bβ sin βx). Rows: the shear and the moment at the bottom, free; at the top,
// shear − m_c ω² w and moment − J_c ω² ψ. Shear rows ÷ ρAω²/β, moment rows ÷ EIβ².
Mat4 boundary(const Section &s, double L, double omega, const Roots &r) {
  const double al = r.alpha, be = r.beta, ka = r.ka, kb = r.kb, w2 = omega * omega;
  const double eL = std::exp(-al * L), cb = std::cos(be * L), sb = std::sin(be * L), b2 = be * be;
  const double mu = s.mc / (s.rho * s.A), jt = (s.Jc * w2) / (s.E * s.I * b2);
  Mat4 M;
  M[0] = {be / al, -(be / al) * eL, 0, 1};
  M[1] = {(al * ka) / b2, ((al * ka) / b2) * eL, -kb / be, 0};
  M[2] = {(be / al) * eL - mu * be * eL, -(be / al) - mu * be, -sb - mu * be * cb, cb - mu * be * sb};
  M[3] = {(al * ka * eL) / b2 + jt * ka * eL, (al * ka) / b2 - jt * ka, -(kb * cb) / be + jt * kb * sb, -(kb * sb) / be - jt * kb * cb};
  return M;
}

static double det3(double a, double b, double c, double d, double e, double f, double g, double h, double i) {
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}
static double minor(const Mat4 &M, int row, int col) {
  double m[9];
  int k = 0;
  for (int i = 0; i < 4; i++) {
    if (i == row) continue;
    for (int j = 0; j < 4; j++) if (j != col) m[k++] = M[i][j];
  }
  return det3(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
}
static double det4(const Mat4 &M) {
  double d = 0;
  for (int j = 0; j < 4; j++) d += (j % 2 ? -1 : 1) * M[0][j] * minor(M, 0, j);
  return d;
}

double tubeDet(const Section &s, double L, double omega) { return det4(boundary(s, L, omega, roots(s, omega))); }

// A sign change of the determinant between x0 and x1 (Hz), refined (Illinois).
static double refine(const Section &s, double L, double x0, double x1, double d0, double d1) {
  int side = 0;
  for (int it = 0; it < 100 && x1 - x0 > 1e-13 * x1; it++) {
    const double xm = (x0 * d1 - x1 * d0) / (d1 - d0), dm = tubeDet(s, L, TAU * xm);
    if (!(xm > x0 && xm < x1)) { // numerically stuck: bisect
      const double xb = 0.5 * (x0 + x1), db = tubeDet(s, L, TAU * xb);
      if ((db < 0) == (d0 < 0)) { x0 = xb; d0 = db; } else { x1 = xb; d1 = db; }
      continue;
    }
    if (dm == 0) return xm;
    if ((dm < 0) == (d0 < 0)) { x0 = xm; d0 = dm; if (side == -1) d1 *= 0.5; side = -1; }
    else { x1 = xm; d1 = dm; if (side == 1) d0 *= 0.5; side = 1; }
  }
  return 0.5 * (x0 + x1);
}

int tubeFreqs(const Section &s, double L, double fLo, double fHi, int n, double *f) {
  constexpr double STEP = 1.004; // modes are at least 2 % apart
  int found = 0;
  double fa = fLo, da = tubeDet(s, L, TAU * fa);
  while (found < n && fa < fHi) {
    const double fb = std::min(fa * STEP, fHi), db = tubeDet(s, L, TAU * fb);
    if ((da < 0) != (db < 0)) f[found++] = refine(s, L, fa, fb, da, db);
    if (fb >= fHi) break;
    fa = fb; da = db;
  }
  return found;
}

// ---- the modes ------------------------------------------------------------------------------

static void basis(const Roots &r, double L, double x, double *w, double *psi) {
  const double e1 = std::exp(-r.alpha * x), e2 = std::exp(r.alpha * (x - L)), cb = std::cos(r.beta * x), sb = std::sin(r.beta * x);
  w[0] = e1; w[1] = e2; w[2] = cb; w[3] = sb;
  psi[0] = -r.ka * e1; psi[1] = r.ka * e2; psi[2] = -r.kb * sb; psi[3] = r.kb * cb;
}

double modeW(const Mode &m, double L, double x) {
  double w[4], psi[4];
  basis(m.r, L, x, w, psi);
  return m.c[0] * w[0] + m.c[1] * w[1] + m.c[2] * w[2] + m.c[3] * w[3];
}
double modePsi(const Mode &m, double L, double x) {
  double w[4], psi[4];
  basis(m.r, L, x, w, psi);
  return m.c[0] * psi[0] + m.c[1] * psi[1] + m.c[2] * psi[2] + m.c[3] * psi[3];
}

// ∫₀ᴸ e^{σx + shift} dx
static cx expInt(cx sigma, double shift, double L) {
  const cx z = sigma * L;
  if (std::abs(z) < 1e-5) return std::exp(cx(shift, 0) + z * 0.5) * L;
  return (std::exp(z + shift) - std::exp(shift)) / sigma;
}
// (e^{iub} − e^{iua}) / (iu) given e^{iua} and e^{iub}; (b − a) e^{iu(a+b)/2} as u → 0
static cx expDiff(double u, double a, double b, cx Ea, cx Eb) {
  if (std::fabs(u) * (b - a) < 1e-6) return (b - a) * std::exp(cx(0, 0.5 * u * (a + b)));
  return (Eb - Ea) / cx(0, u);
}

// ∫ₐᵇ w(x) e^{iκx} dx in closed form, given e^{iκa} and e^{iκb} and the basis' exponentials at a and b.
struct Ends { double e1, e2, c, s; }; // e^{−αx}, e^{α(x−L)}, cos βx, sin βx
static Ends endsAt(const Mode &m, double L, double x) {
  return {std::exp(-m.r.alpha * x), std::exp(m.r.alpha * (x - L)), std::cos(m.r.beta * x), std::sin(m.r.beta * x)};
}
static cx segment(const Mode &m, double kappa, double a, double b, const Ends &A, const Ends &B, cx Ea, cx Eb) {
  const double al = m.r.alpha, be = m.r.beta;
  const cx t1 = (B.e1 * Eb - A.e1 * Ea) / cx(-al, kappa), t2 = (B.e2 * Eb - A.e2 * Ea) / cx(al, kappa);
  const cx pa(A.c, A.s), pb(B.c, B.s); // e^{iβa}, e^{iβb}
  const cx P = expDiff(kappa + be, a, b, Ea * pa, Eb * pb), Q = expDiff(kappa - be, a, b, Ea * std::conj(pa), Eb * std::conj(pb));
  return m.c[0] * t1 + m.c[1] * t2 + m.c[2] * 0.5 * (P + Q) + m.c[3] * (P - Q) * cx(0, -0.5);
}
cx modeTransform(const Mode &m, double L, double kappa) {
  static const Ends zero = {1, 0, 1, 0};
  Ends A = zero;
  A.e2 = std::exp(-m.r.alpha * L);
  return segment(m, kappa, 0, L, A, endsAt(m, L, L), 1, std::exp(cx(0, kappa * L)));
}
// The basis' Gram matrix, ∫₀ᴸ φᵢφⱼ dx for (e^{−αx}, e^{α(x−L)}, cos βx, sin βx), in closed form.
static std::array<std::array<double, 4>, 4> gram(const Mode &m, double L) {
  struct Term { cx coef, sigma; double shift; };
  const double al = m.r.alpha, be = m.r.beta;
  const Term T[4][2] = {{{1, -al, 0}, {0, 0, 0}}, {{1, al, -al * L}, {0, 0, 0}},
                        {{0.5, cx(0, be), 0}, {0.5, cx(0, -be), 0}}, {{cx(0, -0.5), cx(0, be), 0}, {cx(0, 0.5), cx(0, -be), 0}}};
  std::array<std::array<double, 4>, 4> G{};
  for (int i = 0; i < 4; i++)
    for (int j = i; j < 4; j++) {
      cx sum = 0;
      for (const Term &u : T[i]) for (const Term &v : T[j]) if (u.coef != 0.0 && v.coef != 0.0) sum += u.coef * v.coef * expInt(u.sigma + v.sigma, u.shift + v.shift, L);
      G[i][j] = G[j][i] = sum.real();
    }
  return G;
}


// ---- the radiation ---------------------------------------------------------------------------

// Bessel functions by their power series (|x| ≤ 20, cancellation costs a few digits at most) and
// their asymptotic forms beyond.
static constexpr double EULER_GAMMA = 0.57721566490153286;
double besselJ0(double x) {
  if (x > 20) return std::sqrt(2 / (pi * x)) * std::cos(x - pi / 4);
  const double q = -(x * x) / 4;
  double t = 1, s = 1;
  for (int k = 1; k < 80; k++) { t *= q / (k * k); s += t; if (std::fabs(t) < 1e-17 * std::fabs(s) && k > 5) break; }
  return s;
}
double besselJ1(double x) {
  if (x > 20) return std::sqrt(2 / (pi * x)) * std::cos(x - 3 * pi / 4);
  const double q = -(x * x) / 4;
  double t = x / 2, s = t;
  for (int k = 1; k < 80; k++) { t *= q / (k * (k + 1)); s += t; if (std::fabs(t) < 1e-17 * std::fabs(s) && k > 5) break; }
  return s;
}
double besselY0(double x) {
  if (x > 20) return std::sqrt(2 / (pi * x)) * std::sin(x - pi / 4);
  const double q = -(x * x) / 4;
  double t = 1, H = 0, s = 0;
  for (int k = 1; k < 80; k++) { t *= q / (k * k); H += 1.0 / k; s -= t * H; if (std::fabs(t * H) < 1e-17 * (std::fabs(s) + 1e-300) && k > 5) break; }
  return (2 / pi) * ((std::log(x / 2) + EULER_GAMMA) * besselJ0(x) + s);
}
double besselY1(double x) {
  if (x > 20) return std::sqrt(2 / (pi * x)) * std::sin(x - 3 * pi / 4);
  // Y₁ = −2/(πx) + (2/π) ln(x/2) J₁ − (1/π) Σ (−1)ᵏ [ψ(k+1) + ψ(k+2)] (x/2)^{2k+1} / (k!(k+1)!)
  const double q = -(x * x) / 4;
  double t = x / 2, psi1 = -EULER_GAMMA, psi2 = 1 - EULER_GAMMA, s = t * (psi1 + psi2);
  for (int k = 1; k < 80; k++) {
    t *= q / (k * (k + 1)); psi1 += 1.0 / k; psi2 += 1.0 / (k + 1);
    const double d = t * (psi1 + psi2);
    s += d;
    if (std::fabs(d) < 1e-17 * std::fabs(s) && k > 5) break;
  }
  return -2 / (pi * x) + (2 / pi) * std::log(x / 2) * besselJ1(x) - s / pi;
}
double fatCylinder(double ka) {
  if (ka < 1e-3) return 1;
  const double J1p = besselJ0(ka) - besselJ1(ka) / ka, Y1p = besselY0(ka) - besselY1(ka) / ka;
  return 4 / (pi * pi * std::pow(ka, 4) * (J1p * J1p + Y1p * Y1p));
}

Place placeOf(int key) {
  static constexpr int WHITES_BELOW[12] = {0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6};
  static constexpr bool BLACK[12] = {false, true, false, true, false, false, true, false, true, false, true, false};
  const int pc = ((key % 12) + 12) % 12, oct = (key - pc) / 12;
  const double idx = 7 * oct + WHITES_BELOW[pc] - (BLACK[pc] ? 0.5 : 0);
  constexpr double CENTRE = 40; // between C4 (35) and F5 (45)
  return {(idx - CENTRE) * SPACING, BLACK[pc] ? ROW : 0};
}

// Each mode's far field (J, its radiation loss) and the pressure it makes at the microphones: a
// line of transverse dipoles, 2πa² of volume per unit length (a cylinder's, in potential flow),
// summed over short stretches whose path to a microphone is nearly straight, each in closed form.
double NM_SCALE = 1.25;
void radiate(Tube &t, double distance) {
  const Section &s = t.s;
  const double L = t.L, a = s.a;
  t.distance = distance;
  for (int n = 0; n < t.count; n++) {
    Mode &m = t.m[n];
    const double om = TAU * m.f, k = om / C_AIR, chi = fatCylinder(k * a);
    // J = ∫₋₁¹ (1 − μ²)|I(kμ)|² dμ, by the midpoint rule fine enough for |I|² (a band-limited function)
    const int NM = std::min(4096, std::max(32, (int)std::ceil((NM_SCALE * k * L) / pi) + 8));
    double J = 0;
    for (int j = 0; j < NM; j++) {
      const double mu = (j + 0.5) / NM;
      J += (1 - mu * mu) * std::norm(modeTransform(m, L, k * mu));
    }
    m.J = (2 * J) / NM;
    m.sigRad = (pi * RHO_AIR * om * om * k * k * std::pow(a, 4) * m.J * chi) / (8 * C_AIR);
    // the microphones: p = Re(G A), A the modal acceleration
    for (int side = 0; side < 2; side++) {
      const double xm = (side ? 1 : -1) * MIC_HALF, dy = distance + t.place.y, dx = t.place.x - xm;
      const double rmin = std::sqrt(dx * dx + dy * dy);
      const double ell = std::min(0.15, std::sqrt((0.8 * rmin) / k));
      const int S = std::max(4, (int)std::ceil(L / ell));
      cx G = 0;
      Ends A = endsAt(m, L, 0);
      for (int j = 0; j < S; j++) {
        const double xa = (L * j) / S, xb = (L * (j + 1)) / S, xs = 0.5 * (xa + xb), dz = (xs - L) + MIC_DROP;
        const Ends B = endsAt(m, L, xb);
        const double r = std::sqrt(dx * dx + dy * dy + dz * dz), nu = dz / r, cosA = dy / r, kap = -k * nu;
        // along the stretch the path is r + ν(x − x_s): e^{−ikr(x)} = e^{−ikr} e^{ikνx_s} e^{−ikνx}
        const cx green = k * cosA * cx(1, -1 / (k * r)) * std::exp(cx(0, k * (nu * xs - r))) / r;
        G += green * segment(m, kap, xa, xb, A, B, std::exp(cx(0, kap * xa)), std::exp(cx(0, kap * xb)));
        A = B;
      }
      m.gain[side] = cx(0, (RHO_AIR * a * a) / 2) * std::sqrt(chi) * G;
    }
  }
}

// Mode 4 of a tube of length L: by a full scan, or (near an estimate) by a short one.
static double mode4(const Section &s, double L) {
  double f[4];
  return tubeFreqs(s, L, 0.1 * eulerFreq(s, L, 0), 1.05 * eulerFreq(s, L, 3), 4, f) < 4 ? 0 : f[3];
}
static double mode4Near(const Section &s, double L, double est) {
  double fa = 0.97 * est, da = tubeDet(s, L, TAU * fa);
  while (fa < 1.03 * est) {
    const double fb = fa * 1.002, db = tubeDet(s, L, TAU * fb);
    if ((da < 0) != (db < 0)) return refine(s, L, fa, fb, da, db);
    fa = fb; da = db;
  }
  return 0;
}

double cutLength(const Section &s, double note) {
  const double target = 2 * note;
  const double L0 = std::sqrt((BETA_L[3] * BETA_L[3] * std::sqrt((s.E * s.I) / (s.rho * s.A))) / (TAU * target));
  // f₄ ∝ L^−pw: 2 for a slender tube, less where shear or the cap holds it back; mode 4 followed
  // by short scans near its estimate, then checked by a full one (or found by full ones throughout)
  for (int full = 0; full < 2; full++) {
    double L = L0, f4 = mode4(s, L), pw = 2, Lp = 0, fp = 0;
    if (!(f4 > 0)) return L0;
    for (int it = 0; it < 60; it++) {
      const double r = f4 / target;
      if (std::fabs(r - 1) < 1e-13) break;
      if (Lp > 0 && std::fabs(std::log(Lp / L)) > 1e-12) pw = std::min(3.0, std::max(0.3, -std::log(fp / f4) / std::log(Lp / L)));
      const double Ln = L * std::pow(r, 1 / pw), est = f4 * std::pow(L / Ln, pw);
      Lp = L; fp = f4; L = Ln;
      const double got = full ? mode4(s, L) : mode4Near(s, L, est);
      if (!(got > 0)) break;
      f4 = got;
    }
    if (full || std::fabs(mode4(s, L) / target - 1) < 1e-9) return L;
  }
  return L0;
}

void buildTube(int key, int material, double diameterMm, double wallMm, double capGrams, double ratio, double distance, Tube &t) {
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  t = Tube{};
  t.key = key;
  t.material = material; t.diameterMm = diameterMm; t.wallMm = wallMm; t.capGrams = capGrams; t.ratio = ratio;
  t.s = sectionOf(material, diameterMm, wallMm, capGrams);
  const Section &s = t.s;
  t.L = cutLength(s, keyFreq(key) * ratio);
  const double L = t.L;
  t.mass = s.rho * s.A * L;
  t.place = placeOf(key);
  double f[MAX_MODES];
  const double fHi = std::min(20000.0, 0.97 * cutoffFreq(s));
  const int n = tubeFreqs(s, L, 0.1 * eulerFreq(s, L, 0), fHi, MAX_MODES, f);
  t.count = n;
  for (int i = 0; i < n; i++) {
    Mode &m = t.m[i];
    m.f = f[i];
    m.r = roots(s, TAU * f[i]);
    const Mat4 M = boundary(s, L, TAU * f[i], m.r);
    // the null vector: the cofactors of the row that carries them best
    double best = -1;
    for (int row = 0; row < 4; row++) {
      std::array<double, 4> c;
      double nn = 0;
      for (int j = 0; j < 4; j++) { c[j] = ((row + j) % 2 ? -1 : 1) * minor(M, row, j); nn += c[j] * c[j]; }
      if (nn > best) { best = nn; m.c = c; }
    }
    // unit modal mass: ∫ρ(Aw² + Iψ²) dx + m_c w(L)² + J_c ψ(L)², in closed form (ψ's basis is
    // (−kₐ e^{−αx}, kₐ e^{α(x−L)}, −k_b sin βx, k_b cos βx))
    const auto Gm = gram(m, L);
    const double d[4] = {-m.r.ka, m.r.ka, -m.r.kb, m.r.kb};
    const int sw[4] = {0, 1, 3, 2};
    double ww = 0, pp = 0;
    for (int a = 0; a < 4; a++)
      for (int b = 0; b < 4; b++) { ww += m.c[a] * m.c[b] * Gm[a][b]; pp += m.c[a] * m.c[b] * d[a] * d[b] * Gm[sw[a]][sw[b]]; }
    const double wL = modeW(m, L, L), pL = modePsi(m, L, L);
    const double mass = s.rho * (s.A * ww + s.I * pp) + s.mc * wL * wL + s.Jc * pL * pL;
    const double sc = (wL < 0 ? -1 : 1) / std::sqrt(mass);
    for (double &c : m.c) c *= sc;
  }
  // the damper felt: a pad across the tubes DAMPER_Z below the tops, DAMPER_W tall; each mode feels
  // the mean of its w² under it, relative to the mean of the strike note's modes (4–6)
  auto underPad = [&](const Mode &m) {
    double sum = 0;
    for (int j = 0; j < 7; j++) { const double w = modeW(m, L, clamp(L - DAMPER_Z + DAMPER_W * (j / 6.0 - 0.5), 0, L)); sum += (w * w) / 7; }
    return sum;
  };
  double ref = 0;
  int nr = 0;
  for (int i = STRIKE_MODE; i < std::min(n, STRIKE_MODE + 3); i++, nr++) ref += underPad(t.m[i]);
  ref = nr ? ref / nr : 1;
  for (int i = 0; i < n; i++) t.m[i].dampW = underPad(t.m[i]) / ref;
  t.f4 = n > STRIKE_MODE ? t.m[STRIKE_MODE].f : 0;
  radiate(t, distance);
}

static_assert(std::is_trivially_copyable_v<Tube>);
static constexpr double PACK_MAGIC = 7031.0625; // and the struct's size, so a stale page's data is refused
int packTube(const Tube &t, double *out) {
  out[0] = PACK_MAGIC + sizeof(Tube);
  std::memcpy(out + 1, &t, sizeof(Tube));
  return PACKED;
}
bool unpackTube(const double *in, int n, Tube &t) {
  if (n != PACKED || in[0] != PACK_MAGIC + sizeof(Tube)) return false;
  std::memcpy(&t, in + 1, sizeof(Tube));
  return t.count >= 0 && t.count <= MAX_MODES && t.key >= KEY_MIN && t.key <= KEY_MAX;
}

Mallet malletOf(double hardness, double massGrams) {
  return {massGrams / 1000, hardness / std::pow(1e-3, MALLET_P), MALLET_P, MALLET_ALPHA};
}

} // namespace forte::tubular
