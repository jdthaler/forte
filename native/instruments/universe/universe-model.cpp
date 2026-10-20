// universe-model.cpp — the early universe's physics (universe-model.h).

#include "universe-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "universe-params.h"

namespace forte::universe {

namespace {

constexpr double PI = std::numbers::pi;
constexpr double Z_HOT = 8000;   // above this, every atom is ionised (helium's last electron goes at z ≈ 6000)
constexpr double Z_END = 200;    // the tables stop here, long after recombination
constexpr int N_GRID = 4000;     // the tables' points from the beginning to Z_END
constexpr double SAHA_TILL = 0.99; // hydrogen follows Saha's equation until it is this ionised, then Peebles's

// Péquignot, Petitjean & Boisson (1991): the case-B coefficient (m³/s), with the fudge
double alphaB(double T) {
  const double t = T / 1e4;
  return FUDGE * 1e-19 * 4.309 * std::pow(t, -0.6166) / (1 + 0.6703 * std::pow(t, 0.5300));
}

} // namespace

Background::Background(const Cosmology &cos) : c(cos) {
  og = OMEGA_G;
  onu = c.neff * NU_SHARE * OMEGA_G;
  orad = og + onu;
  om = c.ob + c.oc;
  // (a')² = H₁₀₀² (ω_m a + ω_r) / c², solved: a = A τ² + B τ
  A = om / (4 * C_H * C_H);
  B = std::sqrt(orad) / C_H;
  zEq = om / orad - 1;
  tauEq = tauOf(1 / (1 + zEq));
  nH0 = (1 - c.yp) * c.ob * RHO_CRIT / M_H;
  fHe = c.yp * c.ob * RHO_CRIT / M_HE / nH0;
  if (!(fHe >= 0)) fHe = 0;

  // The free electrons, on an even grid of conformal time
  tauEnd = tauOf(1 / (1 + Z_END));
  dtau = tauEnd / N_GRID;
  X.assign(N_GRID + 1, 1 + 2 * fHe);
  bool peebles = false;
  double xp = 1;
  for (int j = 1; j <= N_GRID; j++) {
    const double tau = j * dtau, a = this->a(tau), z = 1 / a - 1;
    if (z > Z_HOT) continue;
    const double T = T_CMB * (1 + z), kT = K_B_EV * T, nH = nH0 / (a * a * a), S = SAHA * T * std::sqrt(T);
    const double sH = S * std::exp(-B_H / kT), s1 = 4 * S * std::exp(-B_HE1 / kT), s2 = S * std::exp(-B_HE2 / kT);
    // helium's electrons for n_e (Saha, both stages): per hydrogen atom
    auto helium = [&](double ne) { const double r1 = s1 / ne, r2 = s2 / ne, y1 = 1 / (1 + r1 + r1 * r2); return fHe * (r1 * y1 + 2 * r1 * r2 * y1); };
    if (!peebles) {
      // Saha for both: the n_e that makes them agree (bisection in log n_e)
      double lo = std::log(1e-12 * nH), hi = std::log(nH * (1 + 2 * fHe));
      for (int it = 0; it < 50; it++) {
        const double mid = 0.5 * (lo + hi), ne = std::exp(mid);
        const double got = nH * (sH / (sH + ne) + helium(ne));
        (got > ne ? lo : hi) = mid;
      }
      const double ne = std::exp(0.5 * (lo + hi));
      xp = sH / (sH + ne);
      if (xp < SAHA_TILL) peebles = true;
      else { X[j] = ne / nH; continue; }
    }
    // Peebles (1968): dx/dt = −C [α n_e x − β (1 − x) e^(−E₂₁/kT)], implicit Euler in τ
    const double al = alphaB(T), beta = al * S * std::exp(-B_H / (4 * kT)), betaE = al * sH;
    const double H = H100 * std::sqrt(om / (a * a * a) + orad / (a * a * a * a));
    const double Kp = LYMAN_ALPHA * LYMAN_ALPHA * LYMAN_ALPHA / (8 * PI * H);
    const double dtdtau = a * MPC / C_LIGHT, he = helium(std::max(1e-30, nH * xp));
    const double x0 = xp;
    auto g = [&](double x) {
      const double n1s = nH * (1 - x), Cp = (1 + Kp * LAMBDA_2S * n1s) / (1 + Kp * (LAMBDA_2S + beta) * n1s);
      const double rate = -Cp * (al * nH * (x + he) * x - betaE * (1 - x));
      return x - x0 - dtau * dtdtau * rate;
    };
    double x = x0;
    for (int it = 0; it < 30; it++) {
      const double h = 1e-7 * std::max(x, 1e-6), gx = g(x), d = (g(x + h) - gx) / h;
      const double nx = std::clamp(x - gx / d, 0.5 * x, std::min(1.0, 2 * x));
      const bool done = std::fabs(nx - x) < 1e-13 * x;
      x = nx;
      if (done) break;
    }
    xp = x;
    X[j] = xp + he;
  }
  // The optical depth back from Z_END (what lies after it is too little to move the peak), the
  // sound horizon and the damping
  K.assign(N_GRID + 1, 0);
  RS.assign(N_GRID + 1, 0);
  D.assign(N_GRID + 1, 0);
  DD.assign(N_GRID + 1, 0);
  for (int j = 0; j <= N_GRID; j++) {
    const double tau = j * dtau, k1 = opacity(tau);
    const double r = R(tau);
    DD[j] = j == 0 ? 0 : (r * r / (1 + r) + SHEAR) / (6 * (1 + r) * k1);
  }
  for (int j = N_GRID - 1; j >= 0; j--) K[j] = K[j + 1] + 0.5 * dtau * (opacity(j * dtau) + opacity((j + 1) * dtau));
  for (int j = 1; j <= N_GRID; j++) {
    RS[j] = RS[j - 1] + 0.5 * dtau * (cs((j - 1) * dtau) + cs(j * dtau));
    D[j] = D[j - 1] + 0.5 * dtau * (DD[j - 1] + DD[j]);
  }
  // recombination: the visibility's peak, refined by a parabola through the grid's highest three
  int best = 1;
  double gbest = 0;
  for (int j = 1; j < N_GRID; j++) { const double gj = visibility(j * dtau); if (gj > gbest) { gbest = gj; best = j; } }
  const double gm = visibility((best - 1) * dtau), g0 = gbest, gp = visibility((best + 1) * dtau);
  const double den = gm - 2 * g0 + gp, shift = den < 0 ? std::clamp(0.5 * (gm - gp) / den, -0.5, 0.5) : 0;
  tauStar = (best + shift) * dtau;
  zStar = 1 / a(tauStar) - 1;
  rsStar = rs(tauStar);
  kdStar = 1 / std::sqrt(damping(tauStar));
  ageStar = (A * tauStar * tauStar * tauStar / 3 + B * tauStar * tauStar / 2) * MPC / C_LIGHT / YEAR;
}

double Background::tauOf(double a) const { return 2 * a / (B + std::sqrt(B * B + 4 * A * a)); }
double Background::hubble(double tau) const { return (2 * A * tau + B) / ((A * tau + B) * tau); }
double Background::R(double tau) const { return 0.75 * c.ob / og * a(tau); }
double Background::cs(double tau) const { return 1 / std::sqrt(3 * (1 + R(tau))); }
double Background::at(const std::vector<double> &v, double tau) const {
  const double u = std::clamp(tau / dtau, 0.0, (double)N_GRID);
  const int j = std::min((int)u, N_GRID - 1);
  return v[j] + (u - j) * (v[j + 1] - v[j]);
}
double Background::xe(double tau) const { return at(X, tau); }
double Background::opacity(double tau) const { const double a = this->a(tau); return xe(tau) * nH0 * SIGMA_T * MPC / (a * a); }
double Background::visibility(double tau) const { return opacity(tau) * std::exp(-at(K, tau)); }
double Background::rs(double tau) const { return at(RS, tau); }
double Background::damping(double tau) const { return at(D, tau); }
double Background::dampingRate(double tau) const { return at(DD, tau); }
double Background::xeOfZ(double z) const { return xe(tauOf(1 / (1 + z))); }

// The equations (Ma & Bertschinger 1995, conformal Newtonian gauge), the photons and baryons
// tightly coupled: δ_c, θ_c, δ_b, δ_γ, θ (the fluid's), δ_ν, θ_ν, the neutrinos' F₂ … F_L, and φ.
namespace {

constexpr int PHI = 6 + NU_L, NV = PHI + 1;
constexpr double INSIDE = 10; // kτ: where the potential's equation changes (see potentials)

struct Waves {
  const Background &bg;
  double k;
  // the potentials. Outside the horizon (kτ < INSIDE) φ is carried along by Einstein's 0-0
  // equation, k²φ + 3ℋ(φ' + ℋψ) = −4πGa²δρ (solved for φ instead, it loses every digit there);
  // inside it, where that equation turns stiff, φ is what the 0-0 and 0-i equations give together,
  // k²φ = −4πGa²[δρ + 3ℋ(ρ+P)θ/k²], and φ' the 0-i's, k²(φ' + ℋψ) = 4πGa²(ρ+P)θ. ψ differs by
  // the neutrinos' shear: k²(φ − ψ) = 12πGa²(ρ+P)σ.
  void potentials(double tau, const double *y, double &phi, double &psi, double &dphi) const {
    const double a = bg.a(tau), H = bg.hubble(tau), s = 1.5 / (C_H * C_H), mat = s / a, rad = s / (a * a), k2 = k * k;
    const double drho = mat * (bg.c.oc * y[0] + bg.c.ob * y[2]) + rad * (bg.og * y[3] + bg.onu * y[5]);
    const double flux = mat * (bg.c.oc * y[1] + bg.c.ob * y[4]) + rad * (4.0 / 3.0) * (bg.og * y[4] + bg.onu * y[6]);
    const double shear = rad * (4.0 / 3.0) * bg.onu * 0.5 * y[7];
    if (k * tau < INSIDE) {
      phi = y[PHI];
      psi = phi - 3 * shear / k2;
      dphi = -(k2 * phi + drho) / (3 * H) - H * psi;
    } else {
      phi = -(drho + 3 * H * flux / k2) / k2;
      psi = phi - 3 * shear / k2;
      dphi = flux / k2 - H * psi;
    }
  }
  void deriv(double tau, const double *y, double *dy) const {
    double phi, psi, dphi;
    potentials(tau, y, phi, psi, dphi);
    const double H = bg.hubble(tau), R = bg.R(tau), k2 = k * k;
    dy[0] = -y[1] + 3 * dphi;
    dy[1] = -H * y[1] + k2 * psi;
    dy[2] = -y[4] + 3 * dphi;
    dy[3] = -(4.0 / 3.0) * y[4] + 4 * dphi;
    dy[4] = (-H * R * y[4] + k2 * y[3] / 4) / (1 + R) + k2 * psi;
    dy[5] = -(4.0 / 3.0) * y[6] + 4 * dphi;
    dy[6] = k2 * (y[5] / 4 - 0.5 * y[7]) + k2 * psi;
    // F_ℓ at y[5 + ℓ] for ℓ ≥ 2
    dy[7] = (8.0 / 15.0) * y[6] - (3.0 / 5.0) * k * y[8];
    for (int l = 3; l < NU_L; l++) dy[5 + l] = (k / (2 * l + 1)) * (l * y[4 + l] - (l + 1) * y[6 + l]);
    dy[5 + NU_L] = k * y[4 + NU_L] - (NU_L + 1) * y[5 + NU_L] / tau;
    dy[PHI] = dphi;
  }
  void step(double tau, double h, double *y) const {
    double k1[NV], k2[NV], k3[NV], k4[NV], t[NV];
    deriv(tau, y, k1);
    for (int i = 0; i < NV; i++) t[i] = y[i] + 0.5 * h * k1[i];
    deriv(tau + 0.5 * h, t, k2);
    for (int i = 0; i < NV; i++) t[i] = y[i] + 0.5 * h * k2[i];
    deriv(tau + 0.5 * h, t, k3);
    for (int i = 0; i < NV; i++) t[i] = y[i] + h * k3[i];
    deriv(tau + h, t, k4);
    for (int i = 0; i < NV; i++) y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  // Adiabatic initial conditions, outside the horizon in the radiation era (Ma & Bertschinger's
  // eq. 98, with C = 1: the same primordial curvature whatever the neutrinos)
  void initial(double tau, double *y) const {
    const double Rn = bg.onu / bg.orad, psi = 20 / (15 + 4 * Rn), kt = k * tau;
    for (int i = 0; i < NV; i++) y[i] = 0;
    y[3] = y[5] = -2 * psi;
    y[0] = y[2] = 0.75 * y[3];
    y[1] = y[4] = y[6] = 0.5 * k * kt * psi;
    y[7] = 2 * kt * kt * psi / 15;
    y[PHI] = (1 + 0.4 * Rn) * psi;
  }
  // What the wave shows at τ. The diffusion damps its oscillation, Θ₀ + (1 + R)ψ, and its
  // velocity by exp(−k²/k_D²), and leaves the offset gravity holds it at, −(1 + R)ψ (Hu &
  // Sugiyama 1995): the fluid's equations above are the tight coupling's, without the diffusion.
  ModeOut out(double tau, const double *y, bool damp) const {
    ModeOut o;
    double dphi;
    potentials(tau, y, o.phi, o.psi, dphi);
    o.dg = y[3]; o.theta = y[4]; o.dc = y[0];
    const double f = damp ? std::exp(-k * k * bg.damping(tau)) : 1, lift = (1 + bg.R(tau)) * o.psi;
    o.plasma = f * (y[3] / 4 + lift) - lift;
    o.sky = o.plasma + o.psi;
    o.doppler = f * y[4] / (std::sqrt(3.0) * k);
    return o;
  }
};

} // namespace

void evolve(const Background &bg, double k, const double *t, int n, ModeOut *out, bool damp) {
  const Waves w{bg, k};
  double y[NV];
  double tau = 1e-3 * std::min(1 / k, bg.tauEq);
  w.initial(tau, y);
  for (int i = 0; i < n; i++) {
    const double target = t[i];
    if (damp && k * k * bg.damping(target) > DEAD) { // damped away: only gravity's offset is left, and it is tiny here
      for (int j = i; j < n; j++) out[j] = ModeOut{};
      return;
    }
    if (target <= tau) { // still outside the horizon: the initial conditions hold
      double yi[NV];
      w.initial(std::max(target, 1e-12), yi);
      out[i] = w.out(std::max(target, 1e-12), yi, damp);
      continue;
    }
    while (tau < target) {
      double h = std::min({0.12 / k, 0.08 * tau, target - tau});
      if (target - tau - h < 1e-9 * target) h = target - tau;
      w.step(tau, h, y);
      tau = tau + h >= target - 1e-12 * target ? target : tau + h;
    }
    out[i] = w.out(tau, y, damp);
  }
}

Cosmology cosmologyOf(const double *P) { return {P[p::baryons], P[p::darkMatter], P[p::neutrinos], P[p::helium]}; }

std::unique_ptr<Universe> buildUniverse(const Cosmology &c) {
  auto u = std::make_unique<Universe>();
  const Background bg(c);
  u->c = c;
  u->tauStar = bg.tauStar;
  u->rsStar = bg.rsStar;
  u->k1 = PI / bg.rsStar;
  std::array<double, NT> t;
  for (int j = 0; j < NT; j++) t[j] = (bg.tauStar * j) / (NT - 1);
  std::array<ModeOut, NT> o;
  for (int m = 0; m < MAX_HARMONICS; m++) {
    evolve(bg, (m + 1) * u->k1, t.data(), NT, o.data());
    for (int j = 0; j < NT; j++) { u->sky[m][j] = (float)o[j].sky; u->doppler[m][j] = (float)o[j].doppler; u->plasma[m][j] = (float)o[j].plasma; }
  }
  return u;
}

double j0(double x) { return std::fabs(x) < 1e-4 ? 1 - x * x / 6 : std::sin(x) / x; }
double j1(double x) { return std::fabs(x) < 1e-3 ? x / 3 - x * x * x / 30 : std::sin(x) / (x * x) - std::cos(x) / x; }

} // namespace forte::universe
