// cuore-model.cpp — CUORE's physics (cuore-model.h).

#include "cuore-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "cuore-params.h"
#include "forte/fdlibm.h"

namespace forte::cuore {

double crystalMass(double side) { return RHO * side * side * side; }

double crystalCapacity(double side, double T) {
  const double atoms = 3 * crystalMass(side) / MOLAR * NA, x = T / THETA_D;
  constexpr double PI4 = std::numbers::pi * std::numbers::pi * std::numbers::pi * std::numbers::pi;
  return 12 * PI4 / 5 * atoms * KB * x * x * x;
}

double resistance(double t0, double T) { return R0 * fdlibm::exp(std::sqrt(t0 / T)); }

void Bolometer::set(const double *P) {
  Vb = P[p::bias];
  Cp = P[p::wire] * 1e-12;
  iCp = 1 / Cp;
  T0 = P[p::t0];
  Ts = P[p::tbase] * 1e-3;
  Gct = Gts = P[p::clamp] * 1e-9;
  cc = crystalCapacity(P[p::side], 1);
}

// (Divisions are slow next to the rest: one each for 1/T_e, 1/C_c and 1/C_t, the others multiply.)
Bolometer::State Bolometer::deriv(const State &y, double *sub, double *dia, double *sup) const {
  const double V = y[0], Te = y[1], Tc = y[2], Tt = y[3];
  const double iTe = 1 / Te, s = std::sqrt(T0 * iTe), iR = fdlibm::exp(-s) * (1 / R0); // 1/R(T_e)
  const double Te2 = Te * Te, Tc2 = Tc * Tc, Tea = Te2 * Te2 * Te, Tca = Tc2 * Tc2 * Tc;
  const double Pec = G_EP * (Tea - Tca), Pct = Gct * (Tc - Tt), Pts = Gts * (Tt - Ts);
  const double iCe = iTe * (1 / GAMMA_E), iCc = 1 / (cc * Tc2 * Tc), iCt = 1 / (C_PTFE * Tt), J = V * V * iR;
  if (dia) {
    const double Ge = A_EP * G_EP * Te2 * Te2, Gc = A_EP * G_EP * Tc2 * Tc2, dlnR = -0.5 * s * iTe; // d ln R / dT_e
    dia[0] = -(1 / RL + iR) * iCp;      sup[0] = V * iR * dlnR * iCp;
    sub[1] = 2 * V * iR * iCe;          dia[1] = (-J * dlnR - Ge) * iCe;  sup[1] = Gc * iCe;
    sub[2] = Ge * iCc;                  dia[2] = (-Gc - Gct) * iCc;       sup[2] = Gct * iCc;
    sub[3] = Gct * iCt;                 dia[3] = (-Gct - Gts) * iCt;
  }
  return {((Vb - V) * (1 / RL) - V * iR) * iCp, (J - Pec) * iCe, (Pec - Pct) * iCc, (Pct - Pts) * iCt};
}

// ROS2 (Verwer et al. 1999): (I − γhJ) k₁ = f(y), (I − γhJ) k₂ = f(y + h k₁) − 2k₁,
// y ← y + h (3k₁ + k₂)/2, γ = 1 + 1/√2: second order with any J, and L-stable.
void Bolometer::step(State &y, double h) const {
  constexpr double G = 1 + std::numbers::sqrt2 / 2;
  double sub[4] = {}, dia[4] = {}, sup[4] = {};
  const State f0 = deriv(y, sub, dia, sup);
  // (I − γhJ), factored once (Thomas): e the pivots' inverses, m the multipliers
  const double gh = G * h;
  double e[4], m[4], c[4];
  for (int i = 0; i < 4; i++) c[i] = -gh * sup[i];
  e[0] = 1 / (1 - gh * dia[0]);
  m[0] = 0;
  for (int i = 1; i < 4; i++) { m[i] = -gh * sub[i] * e[i - 1]; e[i] = 1 / (1 - gh * dia[i] - m[i] * c[i - 1]); }
  auto solve = [&](State &x) {
    for (int i = 1; i < 4; i++) x[i] -= m[i] * x[i - 1];
    x[3] *= e[3];
    for (int i = 2; i >= 0; i--) x[i] = (x[i] - c[i] * x[i + 1]) * e[i];
  };
  State k1 = f0;
  solve(k1);
  State y1;
  for (int i = 0; i < 4; i++) y1[i] = y[i] + h * k1[i];
  for (int i = 1; i < 4; i++) y1[i] = std::max(y1[i], 1e-4);
  State k2 = deriv(y1);
  for (int i = 0; i < 4; i++) k2[i] -= 2 * k1[i];
  solve(k2);
  for (int i = 0; i < 4; i++) y[i] += h * (1.5 * k1[i] + 0.5 * k2[i]);
  for (int i = 1; i < 4; i++) y[i] = std::max(y[i], 1e-4); // never below 0.1 mK
}

// Many crystals at once, each a step of h: four at a time, stage by stage, the same arithmetic as
// step(). One crystal's step is a long chain of operations each waiting on the last (a division,
// a root, an exponential, the tridiagonal solve); four chains side by side keep the processor busy.
void Bolometer::stepMany(State *const *ys, int n, double h) const {
  constexpr double G = 1 + std::numbers::sqrt2 / 2;
  const double gh = G * h;
  for (int at = 0; at < n; at += 4) {
    const int N = std::min(4, n - at);
    State *y[4], before[4];
    for (int l = 0; l < 4; l++) { y[l] = ys[at + std::min(l, N - 1)]; before[l] = *y[l]; } // a short last group repeats its last crystal
    double sub[4][4] = {}, dia[4][4] = {}, sup[4][4] = {}, e[4][4], m[4][4], c[4][4];
    State k1[4], k2[4], y1[4];
    for (int l = 0; l < 4; l++) k1[l] = deriv(*y[l], sub[l], dia[l], sup[l]);
    for (int l = 0; l < 4; l++) {
      for (int i = 0; i < 4; i++) c[l][i] = -gh * sup[l][i];
      e[l][0] = 1 / (1 - gh * dia[l][0]);
      m[l][0] = 0;
      for (int i = 1; i < 4; i++) { m[l][i] = -gh * sub[l][i] * e[l][i - 1]; e[l][i] = 1 / (1 - gh * dia[l][i] - m[l][i] * c[l][i - 1]); }
    }
    auto solve = [&](int l, State &x) {
      for (int i = 1; i < 4; i++) x[i] -= m[l][i] * x[i - 1];
      x[3] *= e[l][3];
      for (int i = 2; i >= 0; i--) x[i] = (x[i] - c[l][i] * x[i + 1]) * e[l][i];
    };
    for (int l = 0; l < 4; l++) {
      solve(l, k1[l]);
      for (int i = 0; i < 4; i++) y1[l][i] = (*y[l])[i] + h * k1[l][i];
      for (int i = 1; i < 4; i++) y1[l][i] = std::max(y1[l][i], 1e-4);
    }
    for (int l = 0; l < 4; l++) k2[l] = deriv(y1[l]);
    for (int l = 0; l < N; l++) {
      for (int i = 0; i < 4; i++) k2[l][i] -= 2 * k1[l][i];
      solve(l, k2[l]);
      for (int i = 0; i < 4; i++) (*y[l])[i] += h * (1.5 * k1[l][i] + 0.5 * k2[l][i]);
      for (int i = 1; i < 4; i++) (*y[l])[i] = std::max((*y[l])[i], 1e-4);
      if (!sane(before[l], *y[l])) { *y[l] = before[l]; safeStep(*y[l], h, 6); }
    }
  }
}

// In range after a step from `from`: the thermistor's voltage between none and the bias (the
// divider), no node colder than the sink or the coldest was, and none warmer than the warmest
// was by more than the bias could heat the electrons in the step (a step the linearisation cannot
// follow overshoots).
bool Bolometer::sane(const State &from, const State &y) const {
  const double hot = std::max({from[1], from[2], from[3]}) + 0.002, cold = 0.999 * std::min({Ts, from[1], from[2], from[3]});
  return y[0] >= 0 && y[0] <= Vb && y[1] >= cold && y[2] >= cold && y[3] >= cold && y[1] < hot && y[2] < hot && y[3] < hot;
}

// A step too long for a pulse that warms the crystal far (a small crystal, a big pulse, a large
// speed-up) can leave the linearisation it is built on: then two of half the length, and so on.
void Bolometer::safeStep(State &y, double h, int depth) const {
  const State before = y;
  step(y, h);
  if (sane(before, y) || depth == 0) return;
  y = before;
  safeStep(y, h / 2, depth - 1);
  safeStep(y, h / 2, depth - 1);
}

void Bolometer::kick(State &y, double E) const {
  const double T2 = y[2] * y[2];
  y[2] = std::sqrt(std::sqrt(T2 * T2 + 4 * E / cc));
}

// At rest every link carries the Joule heat P = V²/R(T_e) on to the sink, so T_t, T_c and V follow
// from T_e, and T_e solves g(T_e⁵ − T_c⁵) = P: bisected on T_e.
Bolometer::State Bolometer::equilibrium() const {
  auto at = [&](double Te, State &y) {
    const double R = resistance(T0, Te), V = Vb * R / (R + RL), P = V * V / R;
    const double Tt = Ts + P / Gts, Tc = Tt + P / Gct;
    y = {V, Te, Tc, Tt};
    return fdlibm::pow(Tc * Tc * Tc * Tc * Tc + P / G_EP, 1 / A_EP) - Te; // > 0: T_e is too cold
  };
  State y{};
  double lo = Ts, hi = Ts;
  while (at(hi, y) > 0 && hi < 10) hi *= 1.5;
  for (int i = 0; i < 80; i++) {
    const double mid = 0.5 * (lo + hi);
    (at(mid, y) > 0 ? lo : hi) = mid;
  }
  at(0.5 * (lo + hi), y);
  return y;
}

} // namespace forte::cuore
