// carillon-model.cpp — the carillon's physics (carillon-model.h).

#include "carillon-model.h"

#include <algorithm>

#include "carillon-params.h"

namespace forte::carillon {

const double cBronze = std::sqrt(BRONZE.E / BRONZE.rho);
static constexpr double PI = std::numbers::pi;

// Math.hypot as V8 computes it (scaled by the largest, Kahan-compensated sum), so that a historic
// bell's orientations are the same to the last bit everywhere.
static double jsHypot(double a, double b) {
  const double x = std::fabs(a), y = std::fabs(b), mx = std::max(x, y);
  if (mx == 0) return 0;
  if (std::isinf(mx)) return INFINITY;
  double sum = 0, comp = 0;
  for (double v : {x, y}) {
    const double n = v / mx, summand = n * n - comp, prelim = sum + summand;
    comp = (prelim - sum) - summand;
    sum = prelim;
  }
  return std::sqrt(sum) * mx;
}

const Rib &ribFor(int profile, int key) {
  const int k = std::min(KEY_HI, std::max(KEY_LO, key));
  for (const Rib &r : RIBS) if (r.profile == profile && k >= r.lo && k <= r.hi) return r;
  for (const Rib &r : RIBS) if (r.profile == profile) return r;
  return RIBS[0];
}

double winAt(const TableMode &mode, double h) {
  const double *g = STRIKE_GRID;
  const int n = STRIKE_N;
  const double x = std::min(g[n - 1], std::max(g[0], h));
  int i = 0;
  while (i < n - 2 && g[i + 1] < x) i++;
  const double f = (x - g[i]) / (g[i + 1] - g[i]);
  return mode.w[i] * (1 - f) + mode.w[i + 1] * f;
}

double soundbowHeight(const Rib &rib) {
  double best = 0, h = 0;
  for (const auto &st : rib.stations) if (st[2] > best) { best = st[2]; h = st[1] / rib.H; }
  return h;
}

// rng(seed): s = (seed · 2654435761) mod 2³² (or 1), then xorshift32
Rng::Rng(double seed) : s((uint32_t)((uint64_t)seed * 2654435761ull)) { if (!s) s = 1; }
double Rng::operator()() {
  s ^= s << 13; s ^= s >> 17; s ^= s << 5;
  return s / 4294967296.0;
}
static double gauss(Rng &r) {
  const double a = std::sqrt(-2 * std::log(1 - r()));
  return a * std::cos(TAU * r());
}

static int nominalOf(const Rib &rib) {
  for (int j = 0; j < rib.modeCount; j++) if (rib.modes[j].name == nominal) return j;
  return 0;
}

void historic(int key, const Rib &rib, double amount, Historic &out) {
  Rng r(1009.0 * key + (rib.profile == majorThird ? 7 : 3));
  for (double &d : out.d) d = HISTORIC_SIGMA * amount * gauss(r);
  auto shift = [&](const TableMode &m) { double a = 0; for (int g = 0; g < SENS_N; g++) a = a + m.s[g] * out.d[g]; return a; };
  const double s0 = shift(rib.modes[nominalOf(rib)]);
  for (int j = 0; j < rib.modeCount; j++) out.lnf[j] = shift(rib.modes[j]) - s0;
  for (int m = 0; m < HIST_M; m++) {
    out.asym[m].e = HISTORIC_ASYM * amount * std::fabs(gauss(r));
    out.asym[m].psi = (TAU * r()) / (2 * std::max(1, m));
  }
}

void bellSize(int key, int profile, double &D, double &mass) {
  const Rib &rib = ribFor(profile, key);
  const TableMode &nom = rib.modes[nominalOf(rib)];
  const double fNom = 2 * keyFreq(key), lamNom = rib.lamPrime * nom.r * nom.r;
  D = (std::sqrt(lamNom) / TAU) * cBronze / fNom;
  mass = BRONZE.rho * rib.volume * std::pow(D, 3);
}

void bellOf(int key, int profile, double historicAmount, Bell &b) {
  const Rib &rib = ribFor(profile, key);
  const TableMode &nom = rib.modes[nominalOf(rib)];
  b.key = key; b.profile = profile; b.rib = &rib;
  b.fNom = 2 * keyFreq(key);
  const double lamNom = rib.lamPrime * nom.r * nom.r;
  b.D = (std::sqrt(lamNom) / TAU) * cBronze / b.fNom;
  b.fPrime = b.fNom / nom.r;
  b.hasHist = historicAmount > 0;
  if (b.hasHist) historic(key, rib, historicAmount, b.hist);
  for (int j = 0; j < rib.modeCount; j++) b.f[j] = b.fPrime * rib.modes[j].r * (b.hasHist ? std::exp(b.hist.lnf[j]) : 1);
  b.H = rib.H * b.D;
  b.mass = BRONZE.rho * rib.volume * std::pow(b.D, 3);
  b.strikeHeight = soundbowHeight(rib);
}

// ---- losses ---------------------------------------------------------------------------------------------
// |h_ℓ′(x)|², the spherical Hankel function's derivative, by upward recurrence.
static double hankelPrime2(int l, double x) {
  const double j0 = std::sin(x) / x, y0 = -std::cos(x) / x;
  if (l == 0) {
    const double dj = -(std::sin(x) / x - std::cos(x)) / x, dy = (std::cos(x) / x + std::sin(x)) / x;
    return dj * dj + dy * dy;
  }
  const double j1 = j0 / x - std::cos(x) / x, y1 = y0 / x - std::sin(x) / x;
  double jm = j0, ym = y0, jn = j1, yn = y1;
  for (int k = 1; k < l; k++) {
    const double jp = ((2 * k + 1) / x) * jn - jm, yp = ((2 * k + 1) / x) * yn - ym;
    jm = jn; ym = yn; jn = jp; yn = yp;
  }
  const double dj = jm - ((l + 1) / x) * jn, dy = ym - ((l + 1) / x) * yn;
  return dj * dj + dy * dy;
}
double radiationEfficiency(int l, double ka) { return 1 / (ka * ka * hankelPrime2(l, ka)); }

double horizonGain(int m) {
  double a = 1;
  for (int k = 1; k <= m; k++) a *= (2.0 * k) / (2 * k + 1);
  return m == 0 ? 1 : 2 / a;
}

double airAbsorption(double f, double T, double hr, double pa) {
  const double TK = T + 273.15, T0 = 293.15, T01 = 273.16, pr = 101.325;
  const double C = -6.8346 * std::pow(T01 / TK, 1.261) + 4.6151, h = (hr * std::pow(10.0, C)) / (pa / pr);
  const double frO = (pa / pr) * (24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h));
  const double frN = (pa / pr) * std::pow(TK / T0, -0.5) * (9 + 280 * h * std::exp(-4.17 * (std::pow(TK / T0, -1.0 / 3) - 1)));
  return 8.686 * f * f * (1.84e-11 * (pr / pa) * std::sqrt(TK / T0)
    + std::pow(TK / T0, -2.5) * ((0.01275 * std::exp(-2239.1 / TK)) / (frO + (f * f) / frO) + (0.1068 * std::exp(-3352 / TK)) / (frN + (f * f) / frN)));
}

double distanceGain(double f, double r) {
  return (REF_DISTANCE / std::max(10.0, r)) * std::pow(10.0, (-airAbsorption(f, WEATHER_T, WEATHER_HR) * r) / 20);
}

// ---- every mode of one bell, ready to play ----------------------------------------------------------------
int bellModes(const Bell &b, const double *P, BellMode *out) {
  const Rib &rib = *b.rib;
  const double D = b.D, rhoB = BRONZE.rho, sw = 1 / std::sqrt(rhoB * std::pow(D, 3));
  const double h = P[p::strikeHeight];
  int n = 0;
  for (int j = 0; j < rib.modeCount; j++) {
    const TableMode &m = rib.modes[j];
    if (isMounting(m)) continue;
    const double f = b.f[j], k = (TAU * f) / AIR.c, ka = k * m.a * D;
    const int l = std::max(1, m.m);
    const double eff = radiationEfficiency(l, ka), Iphys = m.I / (rhoB * D);
    const double sigRad = (AIR.rho * AIR.c * eff * Iphys) / 2, sigInt = PI * f * P[p::eta];
    BellMode &o = out[n++];
    o.j = j; o.m = m.m; o.k = m.k; o.name = m.name; o.f = f;
    o.sigma = sigInt + sigRad; o.sigRad = sigRad; o.sigInt = sigInt; o.eff = eff;
    o.reach = winAt(m, h) * sw;
    o.rad = AIR.rho * AIR.c * std::sqrt((eff * Iphys * horizonGain(m.m)) / (4 * PI));
    o.kappa = m.kap;
  }
  return n;
}

Asymmetry asymmetryOf(int m, double eps, const Historic *hist) {
  double re = eps, im = 0;
  if (hist) {
    const auto &a = hist->asym[std::min(m, HIST_M - 1)];
    re += a.e * std::cos(2 * m * a.psi); im += a.e * std::sin(2 * m * a.psi);
  }
  const double e = jsHypot(re, im);
  return {e, e > 0 ? std::atan2(im, re) / (2 * std::max(1, m)) : 0};
}

// ---- the clapper ------------------------------------------------------------------------------------------
Clapper clapperOf(const Bell &b, const double *P) {
  const double Ec = P[p::hardness] * 1e9, Es = 1 / ((1 - std::pow(CLAPPER_NU, 2)) / Ec + (1 - std::pow(BRONZE.nu, 2)) / BRONZE.E);
  const double R = CLAPPER_BALL * b.D, m = (P[p::clapMass] / 100) * b.mass;
  return {m, R, (4.0 / 3) * Es * std::sqrt(R), Es};
}

// The console's even touch: every clapper gets C4's kinetic energy at P.speedMax × velocity.
double clapperSpeed(const Bell &b, const double *P, double velocity) {
  double D60, mass60;
  bellSize(60, b.profile, D60, mass60);
  const double ref = (P[p::clapMass] / 100) * mass60;
  const double v = P[p::speedMax] * std::max(0.0, std::min(1.0, velocity)) * std::sqrt(ref / clapperOf(b, P).m);
  return std::min(SPEED_CAP, v);
}

// ---- the strike note: a virtual pitch -------------------------------------------------------------------
StrikeNote strikeNote(const Heard *partials, int count, double *curve) {
  const double lo = std::log2(SHS_F_LO);
  const int n = (int)std::round((std::log2(SHS_F_HI * SHS_HARMONICS * 2) - lo) * SHS_PPO);
  double amax = 0;
  for (int q = 0; q < count; q++) if (partials[q].a > amax) amax = partials[q].a;
  if (!(amax > 0)) return {NAN, 0, 0};
  double axis[SHS_AXIS_MAX] = {};
  for (int q = 0; q < count; q++) {
    const Heard &p = partials[q];
    if (!(p.f > 0) || p.a < amax * std::pow(10.0, SHS_FLOOR_DB / 20)) continue;
    const double E = pitchWeight(p.f) * std::pow(p.a / amax, 0.6), x = (std::log2(p.f) - lo) * SHS_PPO;
    const int i0 = (int)std::floor(x);
    for (int i = i0 - SHS_WIDTH; i <= i0 + SHS_WIDTH + 1; i++) { // a triangle of half-width SHS_WIDTH points
      if (i < 0 || i >= n) continue;
      const double w = 1 - std::fabs(i - x) / (SHS_WIDTH + 1);
      if (w > 0) axis[i] += E * w;
    }
  }
  const int m = (int)std::round((std::log2(SHS_F_HI) - lo) * SHS_PPO);
  double c[SHS_CURVE_MAX];
  auto read = [&](double x) { const double i = std::floor(x), f = x - i; return i >= 0 && i + 1 < n ? axis[(int)i] * (1 - f) + axis[(int)i + 1] * f : 0; };
  double best = 0;
  int bi = 0;
  for (int i = 0; i <= m; i++) {
    double s = 0, w = 1;
    for (int k = 1; k <= SHS_HARMONICS; k++) { s += w * read(i + std::log2(k) * SHS_PPO); w *= SHS_COMPRESSION; }
    c[i] = s;
    if (s > best) { best = s; bi = i; }
  }
  // parabolic refinement of the peak
  double x = bi;
  if (bi > 0 && bi < m) { const double a = c[bi - 1], b = c[bi], cc = c[bi + 1], d = a - 2 * b + cc; if (d < 0) x = bi + (0.5 * (a - cc)) / d; }
  if (curve) std::copy(c, c + m + 1, curve);
  return {std::pow(2.0, lo + x / SHS_PPO), best, m + 1};
}

int struckPartials(const Bell &b, const double *P, double velocity, Heard *out) {
  const Clapper c = clapperOf(b, P);
  const double v = std::max(0.05, clapperSpeed(b, P, velocity)), tau = hertzTime(c.m, c.K, v);
  auto pulse = [&](double f) { const double u = 2 * f * tau; return std::fabs(u - 1) < 1e-6 ? PI / 4 : std::fabs(std::cos((PI * u) / 2) / (1 - u * u)); };
  BellMode md[MODES_MAX];
  const int n = bellModes(b, P, md);
  for (int i = 0; i < n; i++) out[i] = {md[i].f, std::fabs(md[i].reach * md[i].rad) * pulse(md[i].f) * distanceGain(md[i].f, P[p::distance])};
  return n;
}

} // namespace forte::carillon
