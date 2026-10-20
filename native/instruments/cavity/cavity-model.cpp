// cavity-model.cpp — the RF cavity's physics (cavity-model.h).

#include "cavity-model.h"

#include <cmath>

#include "forte/dsp.h"
#include "cavity-params.h"

namespace forte::cavity {

constexpr double J01 = 2.404825557695773, J11 = 3.831705970207512, J02 = 5.520078110286311, J12 = 7.015586669815619;

const std::array<Band, BANDS> BAND = {{
  {"TM010", 0, J01, 0}, // the accelerating passband
  {"TM011", 0, J01, 1},
  {"TM110", 1, J11, 0},
  {"TM111", 1, J11, 1},
  {"TM012", 0, J01, 2},
  {"TM020", 0, J02, 0},
  {"TM120", 1, J12, 0},
}};

// J_n(x) by its power series: plenty for the |x| < 8 the cells need.
double besselJ(int n, double x) {
  const double h = x / 2;
  double term = 1;
  for (int k = 1; k <= n; k++) term *= h / k;
  double s = term;
  for (int k = 1; k < 60; k++) {
    term *= -(h * h) / (k * (k + n));
    s += term;
    if (std::fabs(term) < 1e-17 * std::fabs(s)) break;
  }
  return s;
}

double phaseAdvance(bool tunedEnds, int N, int mode) {
  return tunedEnds ? (std::numbers::pi * mode) / N : (std::numbers::pi * mode) / (N + 1);
}

// The circuit model (Nagle, Knapp & Knapp 1967; Padamsee, Knobloch & Hays ch. 7): cell n obeys
//   (ω_c²/ω²) X_n = X_n + (k/2)(X_{n−1} + X_{n+1}),
// so ω = ω_c/√(1 + k cos φ). With tuned end cells the cell past each end mirrors as −X (the π mode
// flat): X_n ∝ sin(φ(n − ½)), φ = mπ/N, m = 1..N. Without, the end cells see nothing past them:
// X_n ∝ sin(φn), φ = mπ/(N + 1).
double modeShape(bool tunedEnds, int N, int mode, int n) {
  const double phi = phaseAdvance(tunedEnds, N, mode);
  if (tunedEnds) return (mode == N ? std::sqrt(1.0 / N) : std::sqrt(2.0 / N)) * std::sin(phi * (n - 0.5));
  return std::sqrt(2.0 / (N + 1)) * std::sin(phi * n);
}

std::complex<double> transit(int p, double theta) {
  // ∫₀¹ e^{iαu} du = (e^{iα} − 1)/(iα); cos(pπu) = (e^{ipπu} + e^{−ipπu})/2
  const auto E = [](double a) -> std::complex<double> {
    if (std::fabs(a) < 1e-8) return {1, a / 2};
    return {std::sin(a) / a, (1 - std::cos(a)) / a};
  };
  if (p == 0) return E(theta);
  const double q = p * std::numbers::pi;
  return 0.5 * (E(theta + q) + E(theta - q));
}

double surfaceResistance(double f, double T) {
  if (T >= TC) return R_NORMAL * std::sqrt(f / F_REF);
  const double r = f / 1.5e9;
  return (BCS_A * r * r / T) * std::exp(-BCS_GAP / T) + R_RES;
}

// A pillbox cell of radius R is β_g λ/2 long, λ the π mode's wavelength, so πR/d = j01/(β_g √(1 − k))
// (the single cell sits √(1 − k) below the π mode). Its TM_mnp mode is at c √((j/R)² + (pπ/d)²).
double bandRatio(int band, double betag, double k) {
  const Band &b = BAND[band];
  const double kz = (b.p * J01) / (betag * std::sqrt(1 - k)); // pπR/d
  return std::sqrt(b.j * b.j + kz * kz) / J01;
}

// The stored energy of a pillbox mode per unit E0² (its E_z on the axis, or J1's at the offset),
// against TM010's: ∫|E|² over the cell, with J_m'(j) = −J_{m+1}(j) and E_r for p ≥ 1.
static double energyRatio(int band, double betag, double k) {
  const Band &b = BAND[band];
  const double az = b.m == 0 ? 1 : 0.5;                 // ∫cos²(mφ) dφ / 2π
  const double jr = besselJ(b.m + 1, b.j) / besselJ(1, J01);
  const double kz = (b.p * J01) / (betag * std::sqrt(1 - k)) / b.j; // k_z/k_r
  const double z = b.p == 0 ? 1 : 0.5 * (1 + kz * kz);
  return az * jr * jr * z;
}

double radialOf(int band, double r) {
  const Band &B = BAND[band];
  return B.m == 0 ? besselJ(0, B.j * r) : besselJ(1, B.j * r);
}

Cavity cavityOf(int key, const double *P) {
  Cavity c;
  const int N = std::clamp((int)std::lround(P[p::cells]), 1, MAX_CELLS);
  const double k = P[p::coupling], betag = P[p::betag], beta = P[p::beta], r = P[p::offset];
  c.cells = N;
  c.fpi = keyFreq(key) * tuningOf(P).ratio(key); // the note, as the keyboard's tuning puts it: the cavity is cut for it
  const double fc = c.fpi * std::sqrt(1 - k), T = P[p::temp];
  for (int b = 0; b < BANDS; b++) {
    const Band &B = BAND[b];
    const bool tuned = b == 0;
    const double fb = fc * bandRatio(b, betag, k), u = energyRatio(b, betag, k);
    const double radial = radialOf(b, r); // the field where the bunch passes
    for (int m = 1; m <= N; m++) {
      Mode &M = c.modes[c.count++];
      M.band = b; M.mode = m;
      M.phase = phaseAdvance(tuned, N, m);
      M.f = fb / std::sqrt(1 + k * std::cos(M.phase));
      // the voltage the bunch sees: cell n is crossed from (n − 1)d/v on, θ = ωd/v per cell
      const double theta = std::numbers::pi * (M.f / c.fpi) * (betag / beta);
      std::complex<double> V = 0;
      for (int n = 1; n <= N; n++) V += modeShape(tuned, N, m, n) * std::polar(1.0, theta * (n - 1));
      const std::complex<double> t = transit(B.p, theta), V1 = V * t;
      V *= t * radial;
      const double ff = TAU * (M.f / c.fpi) * P[p::bunch];
      // in units where a point bunch through the matched π mode leaves √N (a field of 1 in every cell)
      M.kick = std::conj(V) * (std::numbers::pi / 2) / std::sqrt(u) * std::exp(-0.5 * ff * ff);
      M.kick1 = std::conj(V1) * (std::numbers::pi / 2) / std::sqrt(u) * std::exp(-0.5 * ff * ff);
      M.x1 = modeShape(tuned, N, m, 1);
      M.xN = modeShape(tuned, N, m, N);
      const double fp = physicalFrequency(M.f, c.fpi);
      M.invQ0 = 1 / wallQ(fp, T);
      M.invQn = 1 / wallQ(fp, TC + 1);
      M.wIn = N * M.x1 * M.x1;
      M.wHom = tuned ? 0 : 0.5 * N * (M.x1 * M.x1 + M.xN * M.xN);
      if (tuned) for (int n = 1; n <= N; n++) c.x[(m - 1) * N + (n - 1)] = modeShape(true, N, m, n);
    }
  }
  return c;
}

// The input coupler draws on the accelerating passband only, each mode by its field in the end cell.
// Pushed in (Q_rel > 0), it damps every mode at least as hard as the π mode: a real antenna would
// reach each by its end cell too, and the modes with little field there would ring on after the
// key is up. The HOM couplers notch out the accelerating passband.
double decayRate(const Mode &m, double Qin, double Qhom, double Qrel, bool quenched) {
  double invQ = (quenched ? m.invQn : m.invQ0) + m.wHom / Qhom;
  if (Qrel > 0) invQ += std::max(m.wIn, 1.0) / Qrel;
  else if (m.band == 0) invQ += m.wIn / Qin;
  return (std::numbers::pi * m.f * invQ) / QSCALE;
}

} // namespace forte::cavity
