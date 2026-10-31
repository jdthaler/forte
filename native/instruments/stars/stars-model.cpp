// stars-model.cpp — the Star Keyboard's physics (stars-model.h; stars/README.md, "The physics",
// gives the sources and the model's choices).

#include "stars-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::stars {

namespace fd = forte::fdlibm;
using std::numbers::pi;

const Sun SUN = {3090, 135.1, 5777, 1e6 / (25.4 * 86400)};

double jsRound(double x) { const double c = std::ceil(x); return c - 0.5 > x ? c - 1 : c; }
double keyFreq(double m) { return 440 * fd::pow(2, (m - 69) / 12); }
double cents(double a, double b) { return 1200 * fd::log2(a / b); }
static double clamp(double x, double a, double b) { return jsMin(b, jsMax(a, x)); }
static double smooth(double x) { const double t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }

Rng::Rng(double seed) {
  // (seed * 2654435761) >>> 0 || 1, the product in double precision
  double t = std::trunc(seed * 2654435761.0);
  t = std::fmod(t, 4294967296.0);
  if (t < 0) t += 4294967296.0;
  s = (uint32_t)t;
  if (!s) s = 1;
}

// ---- the Sun and the scaling relations -----------------------------------------------------------
static double deltaNu(double M, double R) { return SUN.dnu * std::sqrt(M / (R * R * R)); }
static double nuMax(double M, double R, double T) { return (SUN.numax * M) / (R * R) / std::sqrt(T / SUN.teff); }
static double envWidth(double numax) { return 0.66 * fd::pow(numax, 0.88); }
static double linewidth(double T) { return 0.05 + 0.95 * fd::pow(jsMin(T, 6600) / SUN.teff, 13); }
double linewidthSlope(double T, double numax) { return jsMax(0, jsMin(5, -3.710 + 1.073e-3 * T + 1.883e-4 * numax)); }

// ---- the zero-age main sequence: Tout, Pols, Eggleton & Han (1996) --------------------------------
StarState zams(double M) {
  constexpr double a = 0.39704170, b = 8.52762600, g = 0.00025546, d = 5.43288900, e = 5.56357900, z = 0.78866060, h = 0.00586685;
  constexpr double th = 1.71535900, io = 6.59778800, ka = 10.08855000, la = 1.01249500, mu = 0.07490166, nu = 0.01077422, xi = 3.08223400,
                   om = 17.84778000, pi_ = 0.00022582;
  const auto p = [M](double x) { return fd::pow(M, x); };
  const double L = (a * p(5.5) + b * p(11)) / (g + p(3) + d * p(5) + e * p(7) + z * p(8) + h * p(9.5));
  const double R = (th * p(2.5) + io * p(6.5) + ka * p(11) + la * p(19) + mu * p(19.5)) / (nu + xi * p(2) + om * p(8.5) + p(18.5) + pi_ * p(19.5));
  StarState s;
  s.M = M; s.R = R; s.L = L; s.T = SUN.teff * fd::pow(L / (R * R), 0.25);
  return s;
}

// ---- the evolutionary track -------------------------------------------------------------------------
constexpr double TAU_MS = 0.09, HAYASHI = 4800;
static double fT(double M) { return 1.52 + 0.35 * (M - 1); }
static double dtSun() { const StarState z = zams(1); return (SUN.teff - z.T) / (1 - fd::exp(-fd::log(1 / z.R) / TAU_MS)); }
static double dT(double M) { static const double DT_SUN = dtSun(); return DT_SUN - 1900 * (M - 1); }
static double bOf(double M) { return clamp(0.26 + 0.4 * (M - 1), 0.26, 0.5); }
static double hayashiT(double M, double R) {
  static const double HC = HAYASHI / fd::pow(10, 1.0 / 102);
  return fd::pow(HC * fd::pow(M, 7.0 / 51) * fd::pow(R, 1.0 / 51) * fd::pow(SUN.teff, -2.0 / 51), 51.0 / 49);
}

StarState starAt(double s, double M) {
  if (s < 0) { StarState z = zams(M * fd::exp(s)); z.s = s; z.stage = Stage::dwarf; z.track = M; return z; }
  const StarState z = zams(M);
  const double R = z.R * fd::exp(s), sT = fd::log(fT(M)), dt = dT(M);
  double T;
  Stage stage;
  if (s <= sT) { T = z.T + dt * (1 - fd::exp(-s / TAU_MS)); stage = Stage::dwarf; }
  else {
    const double tT = z.T + dt * (1 - fd::exp(-sT / TAU_MS)), tSg = tT * fd::exp(-(s - sT) * bOf(M)), tH = hayashiT(M, R);
    const double w = 0.01, x = (fd::log(tSg) - fd::log(tH)) / w;
    T = tH * fd::exp(w * (x > 30 ? x : fd::log1p(fd::exp(x))));
    stage = tSg > tH * 1.005 ? Stage::subgiant : Stage::giant;
  }
  StarState st;
  st.M = M; st.R = R; st.T = T; st.L = R * R * fd::pow(T / SUN.teff, 4); st.s = s; st.stage = stage; st.track = M;
  return st;
}

// ---- the oscillation pattern --------------------------------------------------------------------------
static double epsilonOf(double dnu) { return 1.457 + 0.2273 * fd::log10(dnu / SUN.dnu); }
static double d02Of(double dnu) { return 0.12 - 0.056 * clamp(fd::log(dnu / 15) / fd::log(100.0 / 15), 0, 1); }
static double alphaOf(double dnu) { return 0.015 * fd::pow(dnu, -0.32); }
static double dPiOf(double dnu) { return dnu <= 20 ? 60 * fd::pow(dnu / 4, 0.22) : 60 * fd::pow(5, 0.22) * fd::pow(dnu / 20, 1.3); }
static double qOf(double dnu) { return 0.10 + 0.15 * smooth(fd::log(dnu / 8) / fd::log(30.0 / 8)); }

Seismic seismic(const StarState &st) {
  const double dnu = deltaNu(st.M, st.R), numax = nuMax(st.M, st.R, st.T);
  const double sT = fd::log(fT(st.track));
  const double evolved = st.s > sT ? smooth((st.s - sT) / 0.25) : 0;
  Seismic sz;
  sz.dnu = dnu; sz.numax = numax; sz.eps = epsilonOf(dnu); sz.d02 = d02Of(dnu); sz.alpha = alphaOf(dnu); sz.fwhm = envWidth(numax);
  sz.gamma = linewidth(st.T); sz.dPi = dPiOf(dnu); sz.q = qOf(dnu) * evolved;
  return sz;
}

struct PMode { int n, l; double nu; };
static std::vector<PMode> pModes(const Seismic &sz, double span) {
  const double sig = sz.fwhm / (2 * std::sqrt(2 * fd::log(2))), nmax = sz.numax / sz.dnu - sz.eps, D = sz.d02 / 6;
  std::vector<PMode> out;
  const int n0 = (int)jsMax(1, std::floor((sz.numax - span * sig) / sz.dnu - sz.eps - 2)), n1 = (int)std::ceil((sz.numax + span * sig) / sz.dnu - sz.eps + 1);
  for (int n = n0; n <= n1; n++) {
    for (int l = 0; l <= 3; l++) {
      const double nu = sz.dnu * (n + l / 2.0 + sz.eps - l * (l + 1) * D + (sz.alpha / 2) * fd::pow(n - nmax, 2));
      if (std::fabs(nu - sz.numax) <= span * sig) out.push_back({n, l, nu});
    }
  }
  return out;
}

// ---- mixed modes ----------------------------------------------------------------------------------------
static double hBranch(double y, double q) { return fd::atan(fd::tan(y) / q) + pi * jsRound(y / pi); }
struct Mixed { double nu, zeta, j; };
static std::vector<Mixed> mixedModes(const Seismic &sz, const std::vector<PMode> &p1, double lo, double hi) {
  std::vector<Mixed> out;
  if (p1.size() < 2 || !(sz.q > 0)) return out;
  std::vector<double> P;
  for (const PMode &m : p1) P.push_back(m.nu);
  std::stable_sort(P.begin(), P.end());
  const int np = (int)P.size();
  const auto thetaP = [&](double nu) {
    int j = 0;
    if (nu >= P[np - 1]) j = np - 2; else while (j < np - 2 && nu >= P[j + 1]) j++;
    return pi * (j + (nu - P[j]) / (P[j + 1] - P[j]));
  };
  const double dPi = sz.dPi, q = sz.q;
  const auto J = [&](double nu) { return 1 / (nu * 1e-6 * dPi) - hBranch(thetaP(nu), q) / pi; };
  const double k0 = std::ceil(J(hi)), k1 = std::floor(J(lo));
  for (double k = k0; k <= k1; k++) {
    double a = lo, b = hi; // J(a) ≥ k ≥ J(b)
    for (int it = 0; it < 64; it++) { const double m = 0.5 * (a + b); if (J(m) > k) a = m; else b = m; if (b - a < 1e-14 * m) break; }
    const double nu = 0.5 * (a + b), tp = thetaP(nu), N = (sz.dnu * 1e-6) / (fd::pow(nu * 1e-6, 2) * dPi);
    const double c = fd::cos(tp), s = fd::sin(tp);
    const double zeta = 1 / (1 + (q / N) / (q * q * c * c + s * s));
    out.push_back({nu, zeta, jsRound(tp / pi)});
  }
  return out;
}

// ---- the star's modes -------------------------------------------------------------------------------------
constexpr double GFLOOR = 1.0 / 30;
std::vector<Multiplet> multiplets(const Seismic &sz, double span) {
  const double sig = sz.fwhm / (2 * std::sqrt(2 * fd::log(2)));
  const auto env = [&](double nu) { return fd::exp(-fd::pow(nu - sz.numax, 2) / (2 * sig * sig)); };
  const std::vector<PMode> pm = pModes(sz, span + 1);
  std::vector<Multiplet> out;
  for (const PMode &m : pm) if (m.l != 1 || !(sz.q > 0)) {
    if (std::fabs(m.nu - sz.numax) > span * sig) continue;
    out.push_back({m.l, (double)m.n, m.nu, 0, VIS[m.l] * env(m.nu), sz.gamma});
  }
  if (sz.q > 0) {
    std::vector<PMode> p1;
    for (const PMode &m : pm) if (m.l == 1) p1.push_back(m);
    const double lo = jsMax(1, sz.numax - span * sig), hi = sz.numax + span * sig;
    for (const Mixed &x : mixedModes(sz, p1, lo, hi))
      out.push_back({1, x.j, x.nu, x.zeta, VIS[1] * env(x.nu) * (1 - x.zeta), sz.gamma * jsMax(1 - x.zeta, GFLOOR)});
  }
  std::stable_sort(out.begin(), out.end(), [](const Multiplet &a, const Multiplet &b) { return a.nu < b.nu; });
  return out;
}

double heardPitch(const std::vector<Multiplet> &ms) {
  double w = 0, s = 0;
  for (const Multiplet &m : ms) { w += m.power; s += m.power * fd::log(m.nu); }
  return fd::exp(s / w);
}

// ---- tuning: which star sits on each key ----------------------------------------------------------------------
StarState starForPitch(double nuTarget, double M) {
  const auto pitchAt = [M](double s) { return heardPitch(multiplets(seismic(starAt(s, M)))); };
  double a = -2.5, b = 3.4;
  double lo = a, hi = b;
  for (int it = 0; it < 40; it++) { const double m = 0.5 * (lo + hi); if (seismic(starAt(m, M)).numax > nuTarget) lo = m; else hi = m; }
  a = jsMax(-2.5, lo - 0.05); b = jsMin(3.4, lo + 0.05);
  double fa = pitchAt(a) - nuTarget, fb = pitchAt(b) - nuTarget;
  for (int g = 0; fa < 0 && g < 20; g++) { a -= 0.05; fa = pitchAt(a) - nuTarget; }
  for (int g = 0; fb > 0 && g < 20; g++) { b += 0.05; fb = pitchAt(b) - nuTarget; }
  int side = 0;
  for (int it = 0; it < 60; it++) {
    const double m = (a * fb - b * fa) / (fb - fa), fm = pitchAt(m) - nuTarget;
    if (std::fabs(fm) < 1e-7 * nuTarget || std::fabs(b - a) < 1e-12) { a = b = m; break; }
    if (fm * fb > 0) { b = m; fb = fm; if (side == -1) fa /= 2; side = -1; } else { a = m; fa = fm; if (side == 1) fb /= 2; side = 1; }
  }
  return starAt(0.5 * (a + b), M);
}

// ---- inclination and the spherical harmonics ---------------------------------------------------------------------
double legendre(int l, int m, double x) {
  const double s = std::sqrt(jsMax(0, 1 - x * x));
  switch (l * 4 + m) {
    case 0: return 1;
    case 4: return x; case 5: return s;
    case 8: return 0.5 * (3 * x * x - 1); case 9: return 3 * x * s; case 10: return 3 * s * s;
    case 12: return 0.5 * x * (5 * x * x - 3); case 13: return 1.5 * (5 * x * x - 1) * s; case 14: return 15 * x * s * s; case 15: return 15 * s * s * s;
    default: return 0;
  }
}
constexpr double FACT[] = {1, 1, 2, 6, 24, 120, 720};
double Elm(int l, int m, double incl) {
  const int a = m < 0 ? -m : m;
  const double p = legendre(l, a, fd::cos(incl));
  return (FACT[l - a] / FACT[l + a]) * p * p;
}

// ---- rotation ---------------------------------------------------------------------------------------------------------
static void splitWeights(int l, double zeta, double C, double &we, double &wc) {
  if (l == 0) { we = 0; wc = 0; return; }
  we = (1 - zeta) * (1 - C); wc = zeta * (1 - 1.0 / (l * (l + 1)));
}

// ---- the played star ----------------------------------------------------------------------------------------------------
constexpr double DB_KEEP = -27;
struct DScuti { double ratio1, ratio2, Q, C, teff, mass; };
constexpr DScuti DS = {0.773, 0.802, 0.033, 0.05, 7500, 1.8};

void Star::resize(int n) {
  N = n;
  for (auto *v : {&f, &zeta, &p, &gamma, &wEnv, &wCore, &asat}) v->assign(n, 0.0);
  l.assign(n, 0); m.assign(n, 0); mult.assign(n, 0);
}

static Star dScutiStar(int key, double K, double target, double pitch) {
  Rng r(key * 7919 + 17);
  struct Entry { int l; double nu, a; };
  std::vector<Entry> list;
  list.push_back({0, target, 1});
  list.push_back({0, target / DS.ratio1, 0.42});
  list.push_back({0, target / DS.ratio1 / DS.ratio2, 0.22});
  const double radial[3] = {list[0].nu, list[1].nu, list[2].nu};
  const auto isFree = [&](double nu) { for (double x : radial) if (!(std::fabs(cents(nu, x)) > 60)) return false; return true; };
  const std::pair<int, double> extra[] = {{1, 0.36}, {1, 0.22}, {2, 0.18}, {1, 0.12}};
  for (const auto &[l, a] : extra) {
    double nu = 0;
    for (int g = 0; g < 50; g++) { nu = target * (1.06 + 0.6 * r()); if (isFree(nu)) break; }
    list.push_back({l, nu, a * (0.8 + 0.4 * r())});
  }
  const double PF = 1 / (target * 1e-6) / 86400, rho = fd::pow(DS.Q / PF, 2), M = DS.mass, R = fd::pow(M / rho, 1.0 / 3), T = DS.teff;
  Star d;
  d.key = key; d.K = K; d.dscuti = true;
  d.star.M = M; d.star.R = R; d.star.T = T; d.star.L = R * R * fd::pow(T / SUN.teff, 4); d.star.s = 0; d.star.stage = Stage::dscuti; d.star.track = M;
  d.sz.dnu = SUN.dnu * std::sqrt(rho); d.sz.numax = target;
  int N = 0;
  for (const Entry &x : list) N += 2 * x.l + 1;
  d.resize(N);
  int i = 0;
  double norm = 0;
  for (int j = 0; j < (int)list.size(); j++) {
    const Entry &x = list[j];
    for (int m = -x.l; m <= x.l; m++, i++) {
      d.f[i] = x.nu * 1e-6 * K; d.l[i] = (int8_t)x.l; d.m[i] = (int8_t)m; d.wEnv[i] = x.l ? 1 - DS.C : 0; d.asat[i] = x.a; d.mult[i] = j;
    }
    norm += VIS[x.l] * x.a * x.a;
  }
  const double s = 1 / std::sqrt(norm);
  for (int k = 0; k < N; k++) { d.asat[k] *= s; d.p[k] = d.asat[k] * d.asat[k]; }
  for (const Entry &x : list) { d.keptAt.push_back((int)d.kept.size()); d.kept.push_back({x.l, 0, x.nu, 0, VIS[x.l] * x.a * x.a, 0}); }
  d.all = d.kept;
  d.pitch = pitch; d.target = pitch;
  return d;
}

Star keyStar(int key, const StarParams &P) {
  const double K = P.speedup, pitch = keyFreq(key) * P.tuning.ratio(key), target = pitch / K * 1e6; // (the tuned target, Hz and μHz)
  if (P.family == 1) return dScutiStar(key, K, target, pitch);
  Star d;
  d.key = key; d.K = K;
  d.star = starForPitch(target, P.mass); d.sz = seismic(d.star); d.all = multiplets(d.sz);
  double pmax = 0;
  for (const Multiplet &m : d.all) pmax = jsMax(pmax, m.power);
  const double floor = pmax * fd::pow(10, DB_KEEP / 10);
  std::vector<Multiplet> keep;
  std::vector<int> at;
  for (int i = 0; i < (int)d.all.size(); i++) if (d.all[i].power >= floor) { keep.push_back(d.all[i]); at.push_back(i); }
  int count = 0;
  for (const Multiplet &m : keep) count += 2 * m.l + 1;
  if (count > MAX_MODES) { // drop the weakest multiplets
    std::vector<int> order(keep.size());
    for (int i = 0; i < (int)keep.size(); i++) order[i] = i;
    std::stable_sort(order.begin(), order.end(), [&](int a, int b) { return keep[a].power > keep[b].power; });
    std::vector<bool> kept(keep.size(), false);
    int c = 0;
    for (int i : order) { if (c + 2 * keep[i].l + 1 > MAX_MODES) continue; kept[i] = true; c += 2 * keep[i].l + 1; }
    std::vector<Multiplet> k2;
    std::vector<int> at2;
    for (int i = 0; i < (int)keep.size(); i++) if (kept[i]) { k2.push_back(keep[i]); at2.push_back(at[i]); }
    keep.swap(k2); at.swap(at2); count = c;
  }
  d.resize(count);
  int i = 0;
  double norm = 0;
  for (int j = 0; j < (int)keep.size(); j++) {
    const Multiplet &x = keep[j];
    double we, wc;
    splitWeights(x.l, x.zeta, 0, we, wc);
    for (int m = -x.l; m <= x.l; m++, i++) {
      d.f[i] = x.nu * 1e-6 * K; d.l[i] = (int8_t)x.l; d.m[i] = (int8_t)m; d.zeta[i] = x.zeta; d.p[i] = x.power / VIS[x.l];
      d.gamma[i] = x.gamma * 1e-6 * K; d.wEnv[i] = we; d.wCore[i] = wc; d.mult[i] = j;
    }
    norm += x.power;
  }
  for (int k = 0; k < count; k++) d.p[k] /= norm;
  d.kept = std::move(keep);
  d.keptAt = std::move(at);
  d.norm = norm;
  d.pitch = heardPitch(d.all) * 1e-6 * K; d.target = pitch;
  return d;
}

} // namespace forte::stars
