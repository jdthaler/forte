// drums-model.cpp — the Timpani and Tabla's physics (drums-model.h).

#include "drums-model.h"

#include <algorithm>
#include <cmath>
#include <complex>
#include <memory>

#include "forte/dsp.h"
#include "forte/linalg.h"
#include "drums-params.h"

namespace forte::drums {

using cplx = std::complex<double>;

// Timpani: a 26-inch (66 cm) kettle at D3, the set's middle drum, its air a cylinder of a
// hemisphere's volume (depth ⅔ a). The dayan: a 14 cm head at C♯4 on a closed wooden shell about
// 25 cm deep and wider inside than its head (a cylinder of the head's radius holding as much air is
// about 7 a deep), with a syahi laid on thickest at its centre: about nine times the skin's density
// there, out to 0.56 a (fitted to the modes Raman measured: drums-tests). The bayan: a 23 cm head
// at C3 on a bowl, with a smaller patch (0.3 a, after Sathej and Adhikari), set at the centre.
const std::array<Drum, NDRUMS> DRUMS = {{
  {"Timpani", 0.33, 50, 0.67, 0, 0, 1, 1, 1, 1, 1, 1},
  {"Dayan", 0.07, 61, 7.0, 0.5575, 8.09, 0.3965, 1, 1, 2, 3, 4},
  {"Bayan", 0.115, 48, 1.3, 0.30, 8.0, 0.4, 0, 1, 1, 3, 4},
}};

// Mylar 0.19 mm (1380 kg/m³, E 4.5 GPa); calfskin about 0.35 mm (1100 kg/m³, E 0.6 GPa, lossier);
// goatskin about 0.25 mm (E 1 GPa). ν = 0.3 throughout.
const std::array<Head, 4> HEADS = {{
  {"", 0, 0, 0},
  {"Mylar", 0.262, 1.22e6, 0.003},
  {"Calfskin", 0.385, 3.0e5, 0.012},
  {"Goatskin", 0.30, 3.6e5, 0.004},
}};

// A felt mallet's head is 20–30 g with the stick's share; felt stiffens as it is squeezed (p > 1).
// A fingertip is lighter and softer than hard felt; wood barely gives.
const std::array<Beater, 5> BEATERS = {{
  {"", 0, 0, 1},
  {"Soft felt", 0.022, 4e6, 2.0},
  {"Hard felt", 0.022, 6e7, 2.0},
  {"Wood", 0.025, 2e8, 1.5},
  {"Fingertip", 0.010, 3e6, 1.8},
}};

bool shapesDrum(int i) {
  switch (i) {
    case p::drum: case p::size: case p::head: case p::loss: case p::syahi:
    case p::air: case p::under: case p::depth: case p::mic:
    case p::pitch: case p::temperament: case p::tuningRoot:
    case p::cents1: case p::cents2: case p::cents3: case p::cents4: case p::cents5: case p::cents6:
    case p::cents7: case p::cents8: case p::cents9: case p::cents10: case p::cents11:
      return true;
    default: return false;
  }
}

void besselJ(int M, double x, double *out) {
  for (int k = 0; k <= M; k++) out[k] = 0;
  if (x == 0) { out[0] = 1; return; }
  const double ax = std::fabs(x);
  const int top = std::max(M, (int)ax) + 20 + (int)std::sqrt(40.0 * (std::max(M, (int)ax) + 1));
  const int N = top + (top & 1); // even
  double jp = 0, j = 1e-30, sum = 0;
  for (int k = N; k >= 1; k--) {
    const double jm = ((2.0 * k) / ax) * j - jp;
    jp = j; j = jm; // j is J_{k−1}
    if (k - 1 <= M) out[k - 1] = j;
    if ((k - 1) % 2 == 0 && k > 1) sum += 2 * j;
    if (std::fabs(j) > 1e200) {
      j *= 1e-200; jp *= 1e-200; sum *= 1e-200;
      for (int i = std::max(0, k - 1); i <= M; i++) out[i] *= 1e-200;
    }
  }
  sum += j;
  const double s = 1 / sum;
  for (int k = 0; k <= M; k++) out[k] *= (x < 0 && (k & 1)) ? -s : s;
}

namespace {

constexpr int MJ = MORD + 1; // J_0 … J_MORD
constexpr int NR = 400;      // the radial quadrature (Simpson, NR intervals)

double J(int m, double x) { double b[MJ + 2]; besselJ(MJ + 1, x, b); return b[m]; }
double Jp(int m, double x) { // J_m′
  double b[MJ + 2]; besselJ(MJ + 1, x, b);
  return m == 0 ? -b[1] : 0.5 * (b[m - 1] - b[m + 1]);
}

// The tables every drum shares, in units of the radius: Bessel zeros, the basis's Hankel transforms
// on the k·a grid, its values on the radial quadrature, and its coupling to the kettle's modes.
struct Tables {
  double zero[MORD][NB], zeroP[MORD][NQ];
  double norm[MORD][NB];          // ∫₀¹ J_m(j ρ)² ρ dρ = J_{m+1}(j)² / 2
  double jm1[MORD][NB];           // J_{m+1}(j_mi)
  double ft[MORD][NB][NKG];       // φ̃_i(κ) = ∫₀¹ J_m(j_i ρ) J_m(κρ) ρ dρ
  double basis[MORD][NB][NR + 1]; // J_m(j_i ρ_r)
  double C[MORD][NB][NQ];         // ∫₀¹ J_m(j_i ρ) J_m(β_q ρ) ρ dρ
  double Npsi[MORD][NQ];          // ∫₀¹ J_m(β_q ρ)² ρ dρ
};

double refine(int m, bool prime, double lo, double hi) {
  auto f = [&](double x) { return prime ? Jp(m, x) : J(m, x); };
  double flo = f(lo);
  for (int it = 0; it < 80; it++) {
    const double mid = 0.5 * (lo + hi), fm = f(mid);
    if ((fm < 0) == (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

const Tables &tables() {
  static const std::unique_ptr<Tables> t = [] {
    auto T = std::make_unique<Tables>();
    // the zeros, by scanning for sign changes and bisecting
    const double step = 0.02;
    for (int m = 0; m < MORD; m++) {
      int nz = 0, np = 0;
      if (m == 0) T->zeroP[0][np++] = 0;
      double prevJ = J(m, step * 0.5), prevP = Jp(m, step * 0.5);
      for (double x = step * 1.5; (nz < NB || np < NQ) && x < 120; x += step) {
        const double vj = J(m, x), vp = Jp(m, x);
        if (nz < NB && (vj < 0) != (prevJ < 0)) T->zero[m][nz++] = refine(m, false, x - step, x);
        if (np < NQ && (vp < 0) != (prevP < 0)) T->zeroP[m][np++] = refine(m, true, x - step, x);
        prevJ = vj; prevP = vp;
      }
      for (int i = 0; i < NB; i++) { T->jm1[m][i] = J(m + 1, T->zero[m][i]); T->norm[m][i] = 0.5 * T->jm1[m][i] * T->jm1[m][i]; }
      for (int q = 0; q < NQ; q++) {
        const double b = T->zeroP[m][q], Jb = J(m, b);
        T->Npsi[m][q] = b == 0 ? 0.5 : 0.5 * (1 - (m * m) / (b * b)) * Jb * Jb;
        for (int i = 0; i < NB; i++) {
          const double j = T->zero[m][i];
          T->C[m][i][q] = (j * Jb * T->jm1[m][i]) / (j * j - b * b);
        }
      }
    }
    // the Hankel transforms on the grid: one recurrence gives every order at a point
    for (int g = 0; g < NKG; g++) {
      const double x = g * KH;
      double b[MJ + 2]; besselJ(MJ + 1, x, b);
      for (int m = 0; m < MORD; m++)
        for (int i = 0; i < NB; i++) {
          const double j = T->zero[m][i];
          T->ft[m][i][g] = std::fabs(x - j) < 1e-9 ? T->norm[m][i] : (j * T->jm1[m][i] * b[m]) / (j * j - x * x);
        }
    }
    for (int r = 0; r <= NR; r++) {
      const double rho = (double)r / NR;
      for (int m = 0; m < MORD; m++)
        for (int i = 0; i < NB; i++) T->basis[m][i][r] = J(m, T->zero[m][i] * rho);
    }
    return T;
  }();
  return *t;
}

// Weights for ∫₀^∞ f(κ) dκ / √(κ² − κ₀²) with f linear between the grid's nodes: wr is the real
// part (κ > κ₀), wi the imaginary part's (κ < κ₀, where 1/γ = −i/√(κ₀² − κ²)).
void hankelWeights(double k0, double *wr, double *wi) {
  for (int g = 0; g < NKG; g++) wr[g] = wi[g] = 0;
  k0 = std::max(k0, 1e-9);
  auto acoshR = [&](double x) { const double y = x / k0; return y <= 1 ? 0.0 : std::log(y + std::sqrt(y * y - 1)); };
  auto sqrtAbove = [&](double x) { return x <= k0 ? 0.0 : std::sqrt(x * x - k0 * k0); };
  auto asinR = [&](double x) { const double y = std::min(1.0, x / k0); return std::atan2(y, std::sqrt(std::max(0.0, 1 - y * y))); };
  auto sqrtBelow = [&](double x) { return x >= k0 ? 0.0 : -std::sqrt(k0 * k0 - x * x); };
  for (int g = 0; g + 1 < NKG; g++) {
    const double xa = g * KH, xb = xa + KH;
    if (xa > k0 + 4 * KH) { // well above κ₀ the kernel is smooth: the trapezoidal rule
      const double ga = 0.5 * KH / std::sqrt(xa * xa - k0 * k0), gb = 0.5 * KH / std::sqrt(xb * xb - k0 * k0);
      wr[g] += ga; wr[g + 1] += gb;
      continue;
    }
    // above κ₀
    const double ua = std::max(xa, k0), ub = std::max(xb, k0);
    if (ub > ua) {
      const double I0 = acoshR(ub) - acoshR(ua), I1 = sqrtAbove(ub) - sqrtAbove(ua);
      wr[g] += (xb * I0 - I1) / KH; wr[g + 1] += (I1 - xa * I0) / KH;
    }
    const double la = std::min(xa, k0), lb = std::min(xb, k0);
    if (lb > la) {
      const double I0 = asinR(lb) - asinR(la), I1 = sqrtBelow(lb) - sqrtBelow(la);
      wi[g] += (xb * I0 - I1) / KH; wi[g + 1] += (I1 - xa * I0) / KH;
    }
  }
}

double eps(int m) { return m == 0 ? 2 * std::numbers::pi : std::numbers::pi; }

// One drum's physics, ready to solve order by order.
struct Setup {
  const Drum *d;
  double a, T, sigma, eta, rho, depth, load;
  bool kettle;
};

struct OrderSolve {
  Matrix Mm, K;
};

OrderSolve orderMatrices(const Setup &s, int m) {
  const Tables &tb = tables();
  OrderSolve o{Matrix::Zero(NB, NB), Matrix::Zero(NB, NB)};
  const double e = eps(m), a2 = s.a * s.a;
  double w[NR + 1], h = 1.0 / NR;
  for (int r = 0; r <= NR; r++) {
    const double rho = r * h, simpson = (r == 0 || r == NR) ? 1 : (r & 1) ? 4 : 2;
    w[r] = (simpson * h / 3) * rho * patchDensity(*s.d, s.load, rho);
  }
  for (int i = 0; i < NB; i++) {
    o.K(i, i) = s.T * e * tb.zero[m][i] * tb.zero[m][i] * tb.norm[m][i];
    for (int j = i; j < NB; j++) {
      double acc = 0;
      for (int r = 0; r <= NR; r++) acc += w[r] * tb.basis[m][i][r] * tb.basis[m][j][r];
      o.Mm(i, j) = o.Mm(j, i) = s.sigma * e * a2 * acc;
    }
  }
  return o;
}

// The air's mass at angular frequency ω for order m: the air above as a mass (Mr), the kettle's as
// the stiffness it is worth at ω (Kr), and both their losses as the imaginary part of a mass (Mi).
void airMass(const Setup &s, int m, double omega, Matrix &Mr, Matrix &Mi, Matrix &Kr) {
  Mr.setZero(NB, NB); Mi.setZero(NB, NB); Kr.setZero(NB, NB);
  if (s.rho <= 0) return;
  const Tables &tb = tables();
  const double e = eps(m), a = s.a, k0 = omega / C_AIR;
  double wr[NKG], wi[NKG];
  hankelWeights(k0 * a, wr, wi);
  const int sides = s.kettle ? 1 : 2; // open: the same half-space of air on each side
  const double sc = sides * s.rho * e * a * a * a;
  double kr[NKG], ki[NKG], ti[NKG], tr[NKG];
  int top = NKG;
  while (top > 1 && wr[top - 1] == 0 && wi[top - 1] == 0) top--;
  for (int g = 0; g < top; g++) { kr[g] = wr[g] * (g * KH); ki[g] = wi[g] * (g * KH); }
  for (int i = 0; i < NB; i++) {
    const double *fi = tb.ft[m][i];
    for (int g = 0; g < top; g++) { tr[g] = kr[g] * fi[g]; ti[g] = ki[g] * fi[g]; }
    for (int j = i; j < NB; j++) {
      const double *fj = tb.ft[m][j];
      double ar = 0, ai = 0;
      for (int g = 0; g < top; g++) { ar += tr[g] * fj[g]; ai += ti[g] * fj[g]; }
      Mr(i, j) = Mr(j, i) = sc * ar;
      Mi(i, j) = Mi(j, i) = sc * ai;
    }
  }
  if (!s.kettle) return;
  // the kettle: −ρ ε a² Σ_q cot(κ_q d)/κ_q · C_iq C_jq / N_q, with a little loss in its walls and vent
  const cplx k0c = cplx(k0, -0.01 * k0);
  for (int q = 0; q < NQ; q++) {
    const double beta = tb.zeroP[m][q] / a;
    const cplx kap = std::sqrt(k0c * k0c - beta * beta);
    const cplx z = kap * s.depth;
    cplx F;
    if (std::abs(z) < 1e-6) F = 1.0 / (kap * kap * s.depth);
    else if (std::imag(z) < -30 || std::imag(z) > 30) F = cplx(0, std::imag(z) > 0 ? -1 : 1) / kap; // cot → ∓i
    else F = std::cos(z) / std::sin(z) / kap;
    const double sc = s.rho * e * a * a / tb.Npsi[m][q];
    for (int i = 0; i < NB; i++)
      for (int j = i; j < NB; j++) {
        // as a stiffness at this ω (−ω² × the mass), which is what it is for the round modes
        const cplx add = -sc * F * tb.C[m][i][q] * tb.C[m][j][q];
        Kr(i, j) -= omega * omega * std::real(add); Mi(i, j) -= std::imag(add);
        if (j != i) { Kr(j, i) = Kr(i, j); Mi(j, i) = Mi(i, j); }
      }
  }
}

// Mode n (0-based) of order m: ω found by iterating the air's mass at it.
struct Solved { double omega = 0, sigmaAir = 0; Vector x; bool ok = false; };
Solved solveMode(const Setup &s, const OrderSolve &o, int m, int n, double guess) {
  Solved out;
  Matrix Ar(NB, NB), Ai(NB, NB), Ak(NB, NB);
  // the fixed point ω = √λ(ω), by the secant method on √λ(ω) − ω
  double omega = guess, w0 = 0, h0 = 0;
  for (int it = 0; it < 20; it++) {
    airMass(s, m, omega, Ar, Ai, Ak);
    const auto E = genEig(o.K + Ak, o.Mm + Ar);
    if (!E) return out;
    const double next = std::sqrt(std::max(E->lambda(n), 1e-12)), h = next - omega;
    out.x = E->X.col(n);
    if (std::fabs(h) < 1e-9 * next) { omega = next; break; }
    double w = next;
    if (it > 0 && h != h0) {
      w = omega - h * (omega - w0) / (h - h0);
      if (!(w > 0.5 * omega && w < 2 * omega)) w = next; // a secant step that runs away: the plain one
    }
    w0 = omega; h0 = h; omega = w;
  }
  out.omega = omega;
  // the mode's mass: d(ω²M(ω))/dω², so a kettle that is a spring at this frequency adds none
  // (Kr = −ω² × its mass); the losses over it give the decay rate
  Matrix Ar2(NB, NB), Ai2(NB, NB), Ak2(NB, NB);
  const Vector x = out.x;
  airMass(s, m, omega, Ar, Ai, Ak);
  const double w2 = omega * (1 + 1e-5);
  airMass(s, m, w2, Ar2, Ai2, Ak2);
  const double e1 = omega * omega * x.dot((o.Mm + Ar) * x) - x.dot(Ak * x), e2 = w2 * w2 * x.dot((o.Mm + Ar2) * x) - x.dot(Ak2 * x);
  const double mass = (e2 - e1) / (w2 * w2 - omega * omega);
  out.sigmaAir = 0.5 * omega * x.dot(Ai * x) / mass;
  out.x = x / std::sqrt(mass); // unit modal mass
  out.ok = mass > 0;
  return out;
}

double bareOmega(const Setup &s, int m, int n) { // ω of a uniform head without air (a first guess)
  return tables().zero[m][n] * std::sqrt(s.T / s.sigma) / s.a;
}

Setup setupFor(const Drum &d, int drum, double a, double T, const double *P) {
  const int hi = (int)P[p::head] == 0 ? d.head : std::clamp((int)P[p::head], 1, 3);
  const Head &h = HEADS[hi];
  return {&d, a, T, h.sigma, h.eta * P[p::loss], RHO_AIR * P[p::air], d.depth * P[p::depth] * a, drum == 0 ? 0 : P[p::syahi], (int)P[p::under] == 0};
}

KeyDrum solveDrum(int key, const Drum &dr, int drum, double a, double T, double target, const double *P) {
  KeyDrum k;
  Setup s = setupFor(dr, drum, a, T, P);
  const Drum &d = *s.d;
  // the tension: the principal mode on the target (its frequency goes nearly as √T)
  if (target > 0) {
    // at ω = 2π·target the air's mass is fixed: find the tension whose eigenvalue is ω² there
    const double wt = TAU * target * d.pmult, j = tables().zero[d.pm][d.pn - 1];
    s.T = s.sigma * std::pow((wt * a) / j, 2);
    const OrderSolve o = orderMatrices(s, d.pm);
    const Matrix K1 = o.K / s.T;
    Matrix Ar(NB, NB), Ai(NB, NB), Ak(NB, NB);
    airMass(s, d.pm, wt, Ar, Ai, Ak);
    double T0 = s.T, l0 = 0;
    for (int it = 0; it < 40; it++) {
      const auto E = genEig(s.T * K1 + Ak, o.Mm + Ar);
      if (!E) break;
      const double l = E->lambda(d.pn - 1);
      if (std::fabs(l / (wt * wt) - 1) < 1e-13) break;
      double next = s.T * (wt * wt) / std::max(l, 1e-12); // λ grows about as T
      if (it > 0 && l != l0) next = s.T + (wt * wt - l) * (s.T - T0) / (l - l0); // secant
      T0 = s.T; l0 = l;
      s.T = std::max(next, 0.05 * s.T);
    }
  }
  const Tables &tb = tables();
  k.key = key; k.drum = drum; k.a = a; k.T = s.T; k.sigma = s.sigma; k.eta = s.eta; k.rho = s.rho;
  k.depth = s.depth; k.kettle = s.kettle;
  k.Eh = HEADS[(int)P[p::head] == 0 ? d.head : std::clamp((int)P[p::head], 1, 3)].Eh;
  const double phi = P[p::mic] * std::numbers::pi / 180;
  std::array<Mode, MORD * NPER> all{};
  int na = 0;
  double factor = 1; // the last mode's frequency over the bare membrane's: a first guess for the next
  for (int m = 0; m < MORD; m++) {
    const OrderSolve o = orderMatrices(s, m);
    for (int n = 0; n < NPER; n++) {
      // the principal starts where the tension was solved for (a small, high kettle has its own
      // resonances near the note, and the iteration could settle on the next branch instead)
      const bool principal = target > 0 && m == d.pm && n == d.pn - 1;
      const double guess = principal ? TAU * target * d.pmult : factor * bareOmega(s, m, n);
      const Solved sv = solveMode(s, o, m, n, guess);
      if (!sv.ok) continue;
      Mode md;
      md.m = m; md.n = n + 1;
      md.f = sv.omega / TAU;
      md.sigmaAir = sv.sigmaAir;
      md.sigma = sv.sigmaAir + 0.5 * s.eta * sv.omega;
      for (int i = 0; i < NB; i++) md.c[i] = sv.x(i);
      double g = 0, ft = 0;
      const double ks = (sv.omega / C_AIR) * a * std::sin(phi);
      double b[MJ + 2]; besselJ(MJ + 1, ks, b);
      for (int i = 0; i < NB; i++) {
        const double j = tb.zero[m][i];
        g += md.c[i] * md.c[i] * eps(m) * j * j * tb.norm[m][i];
        ft += md.c[i] * (std::fabs(ks - j) < 1e-9 ? tb.norm[m][i] : (j * tb.jm1[m][i] * b[m]) / (j * j - ks * ks));
      }
      md.grad = g;
      for (int r = 0; r < NRS; r++) {
        double bb[MJ + 2], acc = 0;
        for (int i = 0; i < NB; i++) { besselJ(MJ + 1, tb.zero[m][i] * r / (NRS - 1.0), bb); acc += md.c[i] * bb[m]; }
        md.radial[r] = acc;
      }
      // p = ρ/(2πR) · 2π iᵐ cos mψ φ̃(k sin φ) · a² per unit modal acceleration, the listener across
      // the drum from the player (ψ = π) at R = 3a: each drum heard from three of its radii away
      md.far = RHO_AIR * ((m & 1) ? -1 : 1) * ft * a / 3; // (heard through sea-level air, whatever loads the head)
      all[na++] = md;
      factor = sv.omega / bareOmega(s, m, n);
    }
  }
  std::sort(all.begin(), all.begin() + na, [](const Mode &x, const Mode &y) { return x.f < y.f; });
  k.count = std::min(na, MAXMODES);
  for (int i = 0; i < k.count; i++) {
    k.mode[i] = all[i];
    if (all[i].m == d.pm && all[i].n == d.pn) { k.principal = i; k.f0 = all[i].f / d.pmult; }
  }
  return k;
}

} // namespace

double patchDensity(const Drum &d, double load, double rho) {
  if (!(d.patchExcess > 0) || !(load > 0) || rho >= d.patchK) return 1;
  const double u = rho / d.patchK;
  return 1 + load * d.patchExcess * std::pow(1 - u * u, d.patchPower);
}

double besselZero(int m, int i) { return tables().zero[m][i - 1]; }
double besselZeroPrime(int m, int i) { return tables().zeroP[m][i - 1]; }
double bareRatio(int m, int n) { return tables().zero[m][n - 1] / tables().zero[1][0]; }

double shape(const KeyDrum &k, int n, double rho) {
  const Mode &md = k.mode[n];
  const Tables &tb = tables();
  double s = 0;
  for (int i = 0; i < NB; i++) {
    double b[MJ + 2]; besselJ(MJ + 1, tb.zero[md.m][i] * rho, b);
    s += md.c[i] * b[md.m];
  }
  return s;
}

double shapeAt(const Mode &md, double rho) {
  const double x = std::clamp(rho, 0.0, 1.0) * (NRS - 1);
  const int i = std::min((int)x, NRS - 2);
  const double t = x - i;
  return md.radial[i] + t * (md.radial[i + 1] - md.radial[i]);
}

KeyDrum keyDrum(int key, const double *P) {
  const int drum = std::clamp((int)P[p::drum], 0, NDRUMS - 1);
  const Drum &d = DRUMS[drum];
  // below the drum's own key the head grows by half its diameter every two octaves, looser, as a set
  // of timpani is graded; above it, it halves every octave, so its tension stays the drum's own (a
  // head tightened further carries its waves faster than sound, and radiates its ring away at once)
  const double oct = (key - d.key) / 12.0;
  const double a = d.radius * P[p::size] * std::pow(2.0, -(oct > 0 ? oct : oct / 2));
  const double target = keyFreq(key) * tuningOf(P).ratio(key);
  return solveDrum(key, d, drum, a, 0, target, P);
}

KeyDrum drumAt(int drum, double a, double T, const double *P) {
  drum = std::clamp(drum, 0, NDRUMS - 1);
  return solveDrum(-1, DRUMS[drum], drum, a, T, 0, P);
}

KeyDrum compositeHead(double ratio, double K, double a, double T, const double *P) {
  const Drum d = {"Composite", a, 60, 1, K, ratio - 1, 0, 1, 1, 1, 3, 4}; // a step: (1 − u²)⁰ inside K
  return solveDrum(-1, d, 1, a, T, 0, P);
}

} // namespace forte::drums
