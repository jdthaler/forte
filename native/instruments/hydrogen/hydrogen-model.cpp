// hydrogen-model.cpp — a hydrogen atom's lines and a gas of them glowing (hydrogen-model.h).

#include "hydrogen-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"
#include "hydrogen-params.h"
#include "hydrogen-recombination.h"

namespace forte::hydrogen {

constexpr double PI = std::numbers::pi;

Level levelOf(int s) {
  int n = 1;
  while (stateOf(n + 1, 0) <= s) n++;
  return {n, s - stateOf(n, 0)};
}
Pair lineLevels(int line) {
  int n = 2;
  while (lineOf(n + 1, 1) <= line) n++;
  return {n, line - lineOf(n, 1) + 1};
}

double lineHz(int n, int m) { return MU * RYDBERG_HZ * (1.0 / (m * m) - 1.0 / (n * n)); }
double wavelengthNm(int n, int m) { return C_LIGHT / lineHz(n, m) * 1e9; }

// ln k!, for k up to the largest the radial functions and 6-j symbols need
static double lnFact(int k) {
  static const auto table = [] {
    std::array<double, 4 * NMAX + 8> t{};
    for (int i = 2; i < (int)t.size(); i++) t[i] = t[i - 1] + std::log((double)i);
    return t;
  }();
  return table[k];
}

// Gauss–Laguerre nodes and weights (weight e^(−x)) with K points, by Newton's method on L_K
// (Numerical Recipes' gaulag), cached for every K the radial integrals use.
struct Quadrature { std::vector<double> x, w; };
static const Quadrature &laguerre(int K) {
  static std::vector<Quadrature> cache(NMAX + 4);
  Quadrature &q = cache[K];
  if (!q.x.empty()) return q;
  q.x.resize(K); q.w.resize(K);
  double z = 0;
  for (int i = 0; i < K; i++) {
    if (i == 0) z = 3.0 / (1 + 2.4 * K);
    else if (i == 1) z += 15.0 / (1 + 2.5 * K);
    else { const double ai = i - 1; z += ((1 + 2.55 * ai) / (1.9 * ai)) * (z - q.x[i - 2]); }
    double p1 = 1, p2 = 0, pp = 1;
    for (int it = 0; it < 100; it++) {
      p1 = 1; p2 = 0;
      for (int j = 0; j < K; j++) { const double p3 = p2; p2 = p1; p1 = ((2 * j + 1 - z) * p2 - j * p3) / (j + 1); }
      pp = K * (p1 - p2) / z;
      const double z1 = z;
      z = z1 - p1 / pp;
      if (std::fabs(z - z1) <= 1e-15 * std::fabs(z)) break;
    }
    q.x[i] = z;
    q.w[i] = -1 / (pp * K * p2);
  }
  return q;
}

// The radial function R_nl(r) without its e^(−r/n): N (2r/n)^l L_{n−l−1}^{(2l+1)}(2r/n).
static double radialPoly(int n, int l, double r) {
  const double lnN = 0.5 * (3 * std::log(2.0 / n) + lnFact(n - l - 1) - std::log(2.0 * n) - lnFact(n + l));
  const double y = 2 * r / n, a = 2 * l + 1;
  const int k = n - l - 1;
  double l0 = 1, l1 = k == 0 ? 1 : 1 + a - y;
  for (int i = 1; i < k; i++) { const double l2 = ((2 * i + 1 + a - y) * l1 - (i + a) * l0) / (i + 1); l0 = l1; l1 = l2; }
  return std::exp(lnN + l * std::log(y)) * l1;
}

// ∫ R_nl R_mk r³ dr: e^(−βr), β = 1/n + 1/m, times a polynomial of degree n + m + 1, so
// K = ⌈(n + m + 2)/2⌉ + 1 points of Gauss–Laguerre in x = βr integrate it exactly.
double radial(int n, int l, int m, int k) {
  const double beta = 1.0 / n + 1.0 / m;
  const int K = (n + m + 3) / 2 + 1;
  const Quadrature &q = laguerre(K);
  double s = 0;
  for (int i = 0; i < K; i++) {
    const double r = q.x[i] / beta;
    s += q.w[i] * radialPoly(n, l, r) * radialPoly(m, k, r) * r * r * r;
  }
  return s / beta;
}

// A = (4/3) α³ ω³ (l_max / (2l + 1)) |⟨r⟩|² in atomic units; the reduced mass scales ω³ by μ³ and
// ⟨r⟩² by 1/μ², so A by μ.
double einsteinA(int n, int l, int m, int k) {
  const double w = 0.5 * (1.0 / (m * m) - 1.0 / (n * n)), R = radial(n, l, m, k);
  return MU * (4.0 / 3) * ALPHA * ALPHA * ALPHA * w * w * w * (std::max(l, k) / (2.0 * l + 1)) * R * R / AU_TIME;
}

double oscillator1s(int n) {
  const double w = 0.5 * (1 - 1.0 / (n * n)), R = radial(n, 1, 1, 0);
  return (2.0 / 3) * w * R * R;
}

double recombination(int n, int l, double T) {
  // 4-point Lagrange interpolation of log α in log T
  const double x = std::clamp((std::log10(T) - RECOMB_LOG_T0) / RECOMB_DLOG_T, 0.0, RECOMB_T - 1.0);
  const int i0 = std::clamp((int)x - 1, 0, RECOMB_T - 4);
  const float *a = kRecombination[stateOf(n, l)];
  double y = 0;
  for (int i = i0; i < i0 + 4; i++) {
    double c = 1;
    for (int j = i0; j < i0 + 4; j++) if (j != i) c *= (x - j) / (double)(i - j);
    y += c * a[i];
  }
  return std::pow(10.0, y);
}

// Racah's formula, in logarithms. Arguments doubled.
static double triangle(int a, int b, int c) { // ln Δ(abc)
  return 0.5 * (lnFact((a + b - c) / 2) + lnFact((a - b + c) / 2) + lnFact((-a + b + c) / 2) - lnFact((a + b + c) / 2 + 1));
}
static bool coupled(int a, int b, int c) { return c >= std::abs(a - b) && c <= a + b && (a + b + c) % 2 == 0; }
double sixj(int j1, int j2, int j3, int j4, int j5, int j6) {
  if (!coupled(j1, j2, j3) || !coupled(j1, j5, j6) || !coupled(j4, j2, j6) || !coupled(j4, j5, j3)) return 0;
  const int a1 = (j1 + j2 + j3) / 2, a2 = (j1 + j5 + j6) / 2, a3 = (j4 + j2 + j6) / 2, a4 = (j4 + j5 + j3) / 2;
  const int b1 = (j1 + j2 + j4 + j5) / 2, b2 = (j2 + j3 + j5 + j6) / 2, b3 = (j3 + j1 + j6 + j4) / 2;
  const double lnD = triangle(j1, j2, j3) + triangle(j1, j5, j6) + triangle(j4, j2, j6) + triangle(j4, j5, j3);
  double s = 0;
  for (int t = std::max({a1, a2, a3, a4}); t <= std::min({b1, b2, b3}); t++) {
    const double ln = lnD + lnFact(t + 1) - lnFact(t - a1) - lnFact(t - a2) - lnFact(t - a3) - lnFact(t - a4) - lnFact(b1 - t) - lnFact(b2 - t) - lnFact(b3 - t);
    s += (t % 2 ? -1 : 1) * std::exp(ln);
  }
  return s;
}

// E_nj = mc² [(1 + (α/(n − δ))²)^(−1/2) − 1], δ = j + ½ − √((j + ½)² − α²), in hartree (mc² = 1/α²);
// written with expm1 and log1p, since the shift is α² of the level.
double diracShift(int n, double j, double alphaScale) {
  const double a = ALPHA * alphaScale, kappa = j + 0.5;
  const double delta = a * a / (kappa + std::sqrt(kappa * kappa - a * a)); // κ − √(κ² − α²), without cancelling
  const double x = a / (n - delta);
  const double E = std::expm1(-0.5 * std::log1p(x * x)) / (a * a);
  return MU * (E + 0.5 / (n * n));
}

// The quasi-static Stark effect: the ions' fields split level n into components (3/2) n (n₁ − n₂)
// e a₀ F, and in a plasma of ion density N the typical field is Holtsmark's normal field
// F₀ = 2.603 e N^(2/3) / 4πε₀. The line's components spread over (3/2) F₀ [n(n − 1) + m(m − 1)]
// either side; its FWHM is STARK × F₀ [n(n − 1) + m(m − 1)], with STARK = 4.25 set by Hβ's measured
// width (4.8 nm at 10¹⁷ cm⁻³: Gigosos, González & Cardeñoso 2003), which then also gives Inglis
// and Teller's limit (the tests check both).
double starkWidth(int n, int m, double N) {
  const double F0 = 2.603 * std::pow(N * A0_CM * A0_CM * A0_CM, 2.0 / 3); // atomic units
  return STARK * F0 * (n * (n - 1) + m * (m - 1)) / (0.5 * (1.0 / (m * m) - 1.0 / (n * n)));
}

double dopplerWidth(double T) { return std::sqrt(8 * std::log(2.0) * KB_HARTREE * T / MH_C2); }

// Every A at once: for each pair of shells n > m the quadrature's nodes are shared, so the radial
// functions of every l are evaluated once a node (y^l by multiplication, the normalisations once).
static void shellRates(int n, int m, std::vector<Transition> &out) {
  static const auto norm = [] { // N_nl
    std::array<std::array<double, NMAX>, NMAX + 1> t{};
    for (int n = 1; n <= NMAX; n++) for (int l = 0; l < n; l++) t[n][l] = std::exp(0.5 * (3 * std::log(2.0 / n) + lnFact(n - l - 1) - std::log(2.0 * n) - lnFact(n + l)));
    return t;
  }();
  const double beta = 1.0 / n + 1.0 / m;
  const int K = (n + m + 3) / 2 + 1;
  const Quadrature &q = laguerre(K);
  std::array<double, NMAX> In{}, Ip{};      // ∫ for k = l − 1 and k = l + 1
  std::array<double, NMAX> Rn{}, Rm{};
  auto fill = [](int n, double y, std::array<double, NMAX> &R) {
    // R[l] = N_nl y^l L_{n−l−1}^{(2l+1)}(y), without e^(−r/n), which the quadrature's weight holds
    static const auto inv = [] { std::array<double, NMAX + 2> t{}; for (int i = 1; i < (int)t.size(); i++) t[i] = 1.0 / i; return t; }();
    double pw = 1;
    for (int l = 0; l < n; l++) {
      const int k = n - l - 1;
      const double a = 2 * l + 1;
      double l0 = 1, l1 = k == 0 ? 1 : 1 + a - y;
      for (int i = 1; i < k; i++) { const double l2 = ((2 * i + 1 + a - y) * l1 - (i + a) * l0) * inv[i + 1]; l0 = l1; l1 = l2; }
      R[l] = norm[n][l] * pw * l1;
      pw *= y;
    }
  };
  for (int i = 0; i < K; i++) {
    const double r = q.x[i] / beta;
    fill(n, 2 * r / n, Rn);
    fill(m, 2 * r / m, Rm);
    const double w = q.w[i] * r * r * r;
    for (int l = 0; l < n; l++) {
      if (l >= 1 && l - 1 < m) In[l] += w * Rn[l] * Rm[l - 1];
      if (l + 1 < m) Ip[l] += w * Rn[l] * Rm[l + 1];
    }
  }
  const double wm = 0.5 * (1.0 / (m * m) - 1.0 / (n * n));
  const double c = MU * (4.0 / 3) * ALPHA * ALPHA * ALPHA * wm * wm * wm / AU_TIME;
  for (int l = 0; l < n; l++) {
    for (int k : {l - 1, l + 1}) {
      if (k < 0 || k >= m) continue;
      const double R = (k < l ? In[l] : Ip[l]) / beta;
      out.push_back({(uint16_t)stateOf(n, l), (uint16_t)stateOf(m, k), (uint16_t)lineOf(n, m), (uint8_t)n, (uint8_t)l, (uint8_t)m, (uint8_t)k,
                     c * (std::max(l, k) / (2.0 * l + 1)) * R * R, 1.0 / (m * m) - 1.0 / (n * n)});
    }
  }
}

const Atom &atom() {
  static const Atom a = [] {
    Atom a;
    std::vector<Transition> all;
    for (int n = 2; n <= NMAX; n++) for (int m = 1; m < n; m++) shellRates(n, m, all);
    // grouped by the state they feed, from the ground state up
    a.into.assign(STATES + 1, 0);
    for (const Transition &t : all) a.into[t.to + 1]++;
    for (int i = 0; i < STATES; i++) a.into[i + 1] += a.into[i];
    a.tr.resize(all.size());
    std::vector<int> fill(a.into.begin(), a.into.end() - 1);
    for (const Transition &t : all) a.tr[fill[t.to]++] = t;
    for (const Transition &t : a.tr) {
      a.gamma[t.from] += t.A;
      if (t.m > 1) a.gammaB[t.from] += t.A;
    }
    a.gamma[stateOf(2, 0)] += A_2S;
    a.gammaB[stateOf(2, 0)] += A_2S;
    a.lineStart.assign(LINES + 1, 0);
    for (const Transition &t : a.tr) a.lineStart[t.line + 1]++;
    for (int k = 0; k < LINES; k++) a.lineStart[k + 1] += a.lineStart[k];
    a.byLine.resize(a.tr.size());
    std::vector<int> at(a.lineStart.begin(), a.lineStart.end() - 1);
    for (int i = 0; i < (int)a.tr.size(); i++) a.byLine[at[a.tr[i].line]++] = i;
    return a;
  }();
  return a;
}

Lamp lampOf(const double *P) {
  Lamp L;
  L.excitation = (Excitation)(int)P[p::excitation];
  L.T = P[p::temperature];
  L.laserN = std::clamp((int)std::lround(P[p::laserLevel]), 2, NMAX);
  L.caseB = P[p::caseB] > 0.5;
  L.glow = P[p::glow] * 1e-9;
  return L;
}

void pump(const Lamp &lamp, double *p) {
  for (int i = 0; i < STATES; i++) p[i] = 0;
  switch (lamp.excitation) {
    case Excitation::discharge: {
      // van Regemorter (1962): C(1s → np) ∝ f (E_H / ΔE) e^(−ΔE/kT), the dipole-allowed excitations
      // (taken relative to n = 2's Boltzmann factor, which only scales them all)
      const double kT = KB_HARTREE * lamp.T, dE2 = MU * 0.375;
      for (int n = 2; n <= NMAX; n++) {
        const double dE = MU * 0.5 * (1 - 1.0 / (n * n));
        p[stateOf(n, 1)] = oscillator1s(n) * (0.5 / dE) * std::exp(-(dE - dE2) / kT);
      }
      break;
    }
    case Excitation::recombination:
      for (int n = 2; n <= NMAX; n++) for (int l = 0; l < n; l++) p[stateOf(n, l)] = recombination(n, l, lamp.T) * 1e13;
      break;
    case Excitation::laser:
      p[stateOf(lamp.laserN, 1)] = 1;
      break;
  }
}

void drain(const Lamp &lamp, double *gamma) {
  const Atom &a = atom();
  for (int i = 0; i < STATES; i++) gamma[i] = (lamp.caseB ? a.gammaB[i] : a.gamma[i]) + 1 / lamp.glow;
}

void steady(const Lamp &lamp, double *N) {
  const Atom &a = atom();
  std::array<double, STATES> p, G;
  pump(lamp, p.data());
  drain(lamp, G.data());
  for (int i = STATES - 1; i >= 0; i--) {
    double s = p[i];
    for (int t = a.into[i]; t < a.into[i + 1]; t++) s += a.tr[t].A * N[a.tr[t].from];
    N[i] = s / G[i];
  }
}

void linePowers(const Lamp &lamp, const double *N, double *L) {
  const Atom &a = atom();
  for (int k = 0; k < LINES; k++) L[k] = 0;
  for (const Transition &t : a.tr) {
    if (lamp.caseB && t.m == 1) continue;
    L[t.line] += t.A * N[t.from] * t.e;
  }
}

// The angular factor of nlj → mkj′ within nl → mk: the share (2j + 1)/2(2l + 1) of nl in j, times
// (2j′ + 1)(2l + 1) {k ½ j′; j 1 l}², which sums to 1 over j′ for each j (so the rates add up to A).
// It depends on l, k = l ± 1, j = l ± ½ and j′ = k ± ½ alone: a table.
static double angular(int l, int k, int tj, int tk) {
  static const auto table = [] {
    std::array<std::array<double, 8>, NMAX> t{};
    for (int l = 0; l < NMAX; l++)
      for (int d = 0; d < 2; d++)
        for (int a = 0; a < 2; a++)
          for (int b = 0; b < 2; b++) {
            const int k = l + (d ? 1 : -1), tj = 2 * l + (a ? 1 : -1), tk = 2 * k + (b ? 1 : -1);
            if (k < 0 || tj < 1 || tk < 1) continue;
            const double s6 = sixj(2 * k, 1, tk, tj, 2, 2 * l);
            t[l][4 * d + 2 * a + b] = (tj + 1) / (2.0 * (2 * l + 1)) * (tk + 1) * (2 * l + 1) * s6 * s6;
          }
    return t;
  }();
  return table[l][4 * (k > l) + 2 * (tj > 2 * l) + (tk > 2 * k)];
}

// Components by (j, j′), j′ = j or j ± 1: slot 3(j − ½) + (j′ − j + 1).
int components(int line, const double *N, double alphaScale, Component *out) {
  const Atom &a = atom();
  const Pair pr = lineLevels(line);
  double w[3 * NMAX] = {};
  for (int x = a.lineStart[line]; x < a.lineStart[line + 1]; x++) {
    const Transition &t = a.tr[a.byLine[x]];
    const double rate = t.A * N[t.from];
    if (!(rate > 0)) continue;
    for (int tj : {2 * t.l - 1, 2 * t.l + 1}) {
      if (tj < 1) continue;
      for (int tk : {2 * t.k - 1, 2 * t.k + 1}) {
        if (tk < 1 || std::abs(tj - tk) > 2) continue;
        w[3 * ((tj - 1) / 2) + (tk - tj + 2) / 2] += rate * angular(t.l, t.k, tj, tk);
      }
    }
  }
  double total = 0;
  for (int i = 0; i < 3 * pr.n; i++) total += w[i];
  // Dirac's shifts for this α, every n and j (cached: the engine asks for every line at once)
  static double cachedScale = -1;
  static std::array<std::array<double, NMAX>, NMAX + 1> shift;
  if (alphaScale != cachedScale) {
    for (int n = 1; n <= NMAX; n++) for (int i = 0; i < n; i++) shift[n][i] = diracShift(n, i + 0.5, alphaScale);
    cachedScale = alphaScale;
  }
  int count = 0;
  const double bohr = 0.5 * MU * (1.0 / (pr.m * pr.m) - 1.0 / (pr.n * pr.n));
  for (int i = 0; i < 3 * pr.n; i++) {
    if (!(w[i] > 0)) continue;
    const int tj = 2 * (i / 3) + 1, tk = tj + 2 * (i % 3) - 2;
    const double dE = bohr + shift[pr.n][(tj - 1) / 2] - shift[pr.m][(tk - 1) / 2];
    out[count++] = {tj, tk, dE / (0.5 * MU * HALPHA), w[i] / total};
  }
  return count;
}

// The step response.

Glow::Glow() {
  table.reserve((size_t)ROWS * LINES);
  pops.reserve((size_t)ROWS * DISPLAY);
  kept.reserve(LINES); steadyPower.reserve(LINES); width.reserve(LINES); keptOf.reserve(LINES);
  acc.reserve(LINES); compStart.reserve(LINES + 1); comps.reserve((size_t)LINES * 8);
}

void Glow::build(const Lamp &L) {
  lamp = L;
  const Atom &a = atom();
  pump(lamp, p.data());
  drain(lamp, G.data());
  steady(lamp, Nss.data());
  acc.assign(LINES, 0);
  linePowers(lamp, Nss.data(), acc.data());
  const double top = *std::max_element(acc.begin(), acc.end());
  kept.clear(); steadyPower.clear(); width.clear();
  keptOf.assign(LINES, -1);
  total = 0;
  for (int k = 0; k < LINES; k++) {
    if (!(acc[k] > 1e-10 * top)) continue;
    keptOf[k] = (int)kept.size();
    kept.push_back(k);
    steadyPower.push_back(acc[k]);
    total += acc[k];
  }
  // natural widths from the levels' radiative rates, weighted by each transition's steady power
  // (the glow's drain carries atoms away without broadening them)
  for (size_t j = 0; j < kept.size(); j++) {
    double w = 0, s = 0;
    for (int x = a.lineStart[kept[j]]; x < a.lineStart[kept[j] + 1]; x++) {
      const Transition &t = a.tr[a.byLine[x]];
      const double r = t.A * Nss[t.from];
      w += r * (a.gamma[t.from] + a.gamma[t.to]);
      s += r;
    }
    width.push_back(s > 0 ? w / s / (2 * PI) : 0);
  }
  alphaScale = -1;
  // the grid: linear over the fastest level's first four lives (a row every 0.06 of one), then
  // geometric out to 25 lives of the slowest
  double gmax = 0, gmin = INFINITY;
  for (int i = 1; i < STATES; i++) { gmax = std::max(gmax, G[i]); gmin = std::min(gmin, G[i]); }
  tauS = 4 / gmax;
  h = std::log(1 + 25 / gmin / tauS) / (ROWS - 1);
  table.assign((size_t)ROWS * kept.size(), 0.0f);
  pops.assign((size_t)ROWS * DISPLAY, 0.0f);
  N.fill(0);
  t = 0;
  computed = 1; // row 0: t = 0, nothing lit yet
  built = true;
}

void Glow::tune(double scale) {
  if (scale == alphaScale) return;
  alphaScale = scale;
  comps.clear(); compStart.clear();
  Component c[MAX_COMPONENTS];
  for (size_t j = 0; j < kept.size(); j++) {
    compStart.push_back((int)comps.size());
    const int n = components(kept[j], Nss.data(), scale, c);
    for (int i = 0; i < n; i++) comps.push_back(c[i]);
  }
  compStart.push_back((int)comps.size());
}

double Glow::timeOf(int row) const { return tauS * std::expm1(h * row); }

// One step of the cascade, from the top state down: each level relaxes exactly toward its pump and
// feed, with the feed averaged over the step from the levels above, which have already stepped.
void Glow::step(double dt) {
  const Atom &a = atom();
  Nold = N;
  for (int i = STATES - 1; i >= 1; i--) {
    double feed = p[i];
    for (int k = a.into[i]; k < a.into[i + 1]; k++) {
      const Transition &x = a.tr[k];
      feed += x.A * 0.5 * (Nold[x.from] + N[x.from]);
    }
    const double e = std::exp(-G[i] * dt);
    N[i] = N[i] * e + feed * (1 - e) / G[i];
  }
}

void Glow::record(int row) {
  const Atom &a = atom();
  for (size_t j = 0; j < kept.size(); j++) acc[j] = 0;
  for (const Transition &x : a.tr) {
    const int j = keptOf[x.line];
    if (j >= 0) acc[j] += x.A * N[x.from] * x.e;
  }
  float *r = &table[(size_t)row * kept.size()];
  for (size_t j = 0; j < kept.size(); j++) r[j] = (float)acc[j];
  float *q = &pops[(size_t)row * DISPLAY];
  for (int i = 0; i < DISPLAY; i++) q[i] = (float)N[i];
}

bool Glow::ensure(double time, int maxRows) {
  if (!built) return false;
  while (computed < ROWS && timeOf(computed - 1) < time && maxRows-- > 0) {
    const double t1 = timeOf(computed);
    const double dt = (t1 - t) / 2;
    step(dt); step(dt);
    t = t1;
    record(computed);
    computed++;
  }
  return computed == ROWS || timeOf(computed - 1) >= time;
}

// a row's value at time t, linear between the rows (the last computed row past them)
static double lerpRows(const std::vector<float> &v, size_t width, int computed, double x, size_t j) {
  const int i = (int)x;
  if (i >= computed - 1) return v[(size_t)(computed - 1) * width + j];
  const double f = x - i;
  const float *r = &v[(size_t)i * width + j];
  return r[0] + f * (r[width] - r[0]);
}
double Glow::powerAt(int j, double time) const {
  if (!(time > 0)) return 0;
  return lerpRows(table, kept.size(), computed, std::log1p(time / tauS) / h, j);
}
double Glow::powerAtRow(int j, double row) const {
  if (!(row >= 0)) return 0;
  return lerpRows(table, kept.size(), computed, row, j);
}
double Glow::popAt(int s, double time) const {
  if (!(time > 0)) return 0;
  return lerpRows(pops, DISPLAY, computed, std::log1p(time / tauS) / h, s);
}

double Rng::uniform() {
  uint32_t t = (s += 0x6D2B79F5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return ((t ^ (t >> 14)) >> 8) / 16777216.0;
}
double Rng::gauss() { return (uniform() + uniform() - 1) * 2.449489742783178; } // √6

} // namespace forte::hydrogen
