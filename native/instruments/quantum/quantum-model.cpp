// quantum-model.cpp — the Quantum Keyboard's physics (quantum-model.h).

#include "quantum-model.h"

#include <algorithm>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::quantum {

namespace fd = forte::fdlibm;
using std::numbers::pi;
constexpr double PI = pi;

double jsRound(double x) { return std::floor(x + 0.5); }
double keyFreq(double m) { return 440 * fd::pow(2.0, (m - 69) / 12); }
static double sq(double x) { return x * x; } // x ** 2 (V8's pow gives x·x)
// Math.max and Math.min: NaN wins
static double jsMax(double a, double b) { return std::isnan(a) || std::isnan(b) ? NAN : a > b ? a : b; }
static double jsMin(double a, double b) { return std::isnan(a) || std::isnan(b) ? NAN : a < b ? a : b; }

// |aₙ|, zeros of Ai: Abramowitz & Stegun Table 10.13 for n ≤ 10, asymptotic series
// 10.4.94/10.4.105 above (error < 1e-10 there).
static const double AIRY[] = {2.338107410459767, 4.087949444130970, 5.520559828095551, 6.786708090071759, 7.944133587120853,
                              9.022650853340980, 10.04017434155809, 11.00852430373326, 11.93601556323626, 12.82877675286576};
double airyZeroC(double nu) {
  const double t = (3 * PI * (4 * nu - 1)) / 8, t2 = 1 / (t * t);
  return fd::pow(t, 2.0 / 3) * (1 + t2 * (5.0 / 48 + t2 * (-5.0 / 36 + t2 * (77125.0 / 82944 + t2 * (-108056875.0 / 6967296 + t2 * (162375596875.0 / 334430208))))));
}
double airyZero(int n) { return n <= 10 ? AIRY[n - 1] : airyZeroC(n); }

// (1/π)∫₀^π sin τ sin(kτ − x sin τ) dτ: smooth and periodic, so the midpoint rule converges
// exponentially.
double besselJp(int k, double x) {
  const int M = 2 * (int)std::ceil(k + x) + 64;
  double s = 0;
  for (int i = 0; i < M; i++) { const double t = ((i + 0.5) * PI) / M, st = fd::sin(t); s += st * fd::sin(k * t - x * st); }
  return s / M;
}

// Morse: κ from the packet's height in the well, η = E(n̄)/D = 1 − (1 − (n̄+½)/λ)².
double morseKappa(double nbar, double eta) { return (2 * (nbar + 0.5)) / (1 - std::sqrt(1 - eta)); }
// ⟨m|x|n⟩, m ≠ n (Vasan & Cross 1983), units of 1/a.
double morseX(int m, int n, double kap) {
  if (n < m) std::swap(m, n);
  double ratio = 1;
  for (int j = m + 1; j <= n; j++) ratio *= j / (kap - j);
  return -std::sqrt((kap - 2 * n - 1) * (kap - 2 * m - 1) * ratio) / ((n - m) * (kap - n - m - 1));
}

// ⟨n l|r|n' l⟩ from the Fourier series of a Kepler orbit (Naccache 1972), with the Langer
// eccentricity e = √(1 − (l+½)²/n_c²).
double kepler(double nc, int l) { return std::sqrt(1 - sq((l + 0.5) / nc)); }

double WellModel::E(int n) const {
  switch (id) {
    case box: return (double)n * n;
    case morse: return (n + 0.5) - sq(n + 0.5) / kap;
    case hydrogen: return -0.5 / ((double)n * n);
    case bouncer: return airyZero(n);
    default: return n + 0.5;
  }
}
double WellModel::Ec(double nu) const {
  switch (id) {
    case box: return nu * nu;
    case morse: return (nu + 0.5) - sq(nu + 0.5) / kap;
    case hydrogen: return -0.5 / (nu * nu);
    case bouncer: return airyZeroC(nu);
    default: return nu + 0.5;
  }
}
double WellModel::x(int m, int n) const {
  switch (id) {
    case box: return (m + n) % 2 ? (-8.0 * m * n) / (PI * PI * sq((double)m * m - (double)n * n)) : 0;
    case morse: return morseX(m, n, kap);
    case hydrogen: {
      const int k = std::abs(n - m);
      const double nc = (m + n) / 2.0, ec = kepler(nc, HYDROGEN_L);
      if ((int)jps.size() <= k) jps.resize(k + 1, NAN);
      if (std::isnan(jps[k])) jps[k] = besselJp(k, k * e);
      return -((nc * nc * ec) / k) * jps[k];
    }
    case bouncer: return -2 / sq(airyZero(m) - airyZero(n));
    default: return std::abs(m - n) == 1 ? -std::sqrt(std::max(m, n) / 2.0) : 0;
  }
}

WellModel well(int id, const PacketParams &P, double nbar) {
  WellModel W;
  W.id = id;
  switch (id) {
    case box: W.nMin = 1; break;
    case morse:
      W.kap = morseKappa(nbar, P.eta);
      W.nMin = 0; W.nMax = std::ceil((W.kap - 1) / 2) - 1;
      break;
    case hydrogen:
      W.nMin = HYDROGEN_L + 1;
      W.e = kepler(jsMax(nbar, HYDROGEN_L + 1));
      break;
    case bouncer: W.nMin = 1; break;
    default: W.nMin = 0; break;
  }
  return W;
}

// Derivatives of the smooth spectrum: E′ sets the classical period, E″ the revival time, E‴ the
// super-revival time. Analytic where the spectrum is; 5-point stencils for the Airy zeros.
Derivs derivs(const WellModel &W, double nu) {
  switch (W.id) {
    case box: return {2 * nu, 2, 0};
    case morse: return {1 - (2 * nu + 1) / W.kap, -2 / W.kap, 0};
    case hydrogen: return {fd::pow(nu, -3), -3 * fd::pow(nu, -4), 12 * fd::pow(nu, -5)};
    case harmonic: return {1, 0, 0};
    default: break;
  }
  const double h = 0.05;
  auto f = [&](double v) { return W.Ec(v); };
  const double a = f(nu - 2 * h), b = f(nu - h), c = f(nu), d = f(nu + h), e = f(nu + 2 * h);
  const double H = 0.25, A = f(nu - 2 * H), B = f(nu - H), D = f(nu + H), E = f(nu + 2 * H);
  return {(a - 8 * b + 8 * d - e) / (12 * h), (-a + 16 * b - 30 * c + 16 * d - e) / (12 * h * h), (E - 2 * D + 2 * B - A) / (2 * fd::pow(H, 3))};
}

States packetStates(const WellModel &W, bool outer, double nbar, double sigma) {
  const double lo = jsMax(W.nMin, std::ceil(nbar - 6 * sigma)), hi = jsMin(W.nMax, std::floor(nbar + 6 * sigma));
  States S;
  double norm = 0;
  for (double nd = lo; nd <= hi; nd++) {
    const int n = (int)nd;
    const double a = fd::exp(-sq(n - nbar) / (4 * sigma * sigma));
    S.ns.push_back(n); S.c.push_back(outer && n % 2 ? -a : a); S.E.push_back(W.E(n)); norm += a * a;
  }
  norm = std::sqrt(norm);
  if (!(norm != 0) || std::isnan(norm)) norm = 1; // || 1
  for (double &v : S.c) v = v / norm;
  return S;
}

// The pitch: the amplitude-weighted mean of the Δn = 1 Bohr frequencies, as the detector sees them.
static double meanBohr(const WellModel &W, const States &S, int d) {
  double num = 0, den = 0;
  for (size_t i = 0; i + 1 < S.ns.size(); i++) {
    const double w = S.E[i + 1] - S.E[i], a = std::fabs(S.c[i] * S.c[i + 1] * W.x(S.ns[i], S.ns[i + 1])) * fd::pow(w, d);
    num += a * w; den += a;
  }
  if (den > 0) return num / den;
  return S.ns.empty() ? NAN : W.Ec(S.ns[0] + 1) - W.Ec(S.ns[0]);
}

struct Limits { double lo, hi; };
static Limits nbarLimits(int id, double sigma) { return {id == hydrogen ? 12 : id == morse ? 1 : jsMax(1, 0.5 * sigma), 6000}; }

// Initial guess for n̄ from R = T_rev/T_cl: 2n̄ (box), κ − 2n̄ − 1 (Morse), 2n̄/3 (hydrogen), 6n̄ (bouncer).
static double nbarGuess(int id, double R, const PacketParams &P) {
  if (id == box) return R / 2;
  if (id == hydrogen) return 1.5 * R;
  if (id == bouncer) return R / 6;
  if (id == morse) { const double u = 1 / (1 - std::sqrt(1 - P.eta)); return R / (2 * (u - 1)) - 0.5; }
  return P.nbar;
}

double solveNbar(int key, const PacketParams &P, bool *locked) {
  const int id = P.potential, d = P.detector;
  const Limits lim = nbarLimits(id, P.sigma);
  if (locked) *locked = false;
  auto clamp = [&](double v) { return jsMin(lim.hi, jsMax(lim.lo, v)); };
  if (!P.lock || id == harmonic) return clamp(P.nbar);
  const double f0 = keyFreq(key), T = (P.beats * 60) / P.bpm, R = f0 * T;
  const bool outer = id == bouncer;
  // g(n̄) = pitch(n̄) − f0 with the time scale fixed by T_rev = T
  auto g = [&](double nb) {
    const WellModel W = well(id, P, nb);
    const States S = packetStates(W, outer, nb, P.sigma);
    return (2 * meanBohr(W, S, d)) / (std::fabs(derivs(W, nb).d2) * T) - f0;
  };
  double x0 = clamp(nbarGuess(id, R, P)), g0 = g(x0);
  double x1 = clamp(x0 * (1 + 1e-3) + 1e-3), g1 = g(x1);
  for (int it = 0; it < 30 && std::fabs(g1) > 1e-10 * f0 && g1 != g0; it++) {
    const double x2 = clamp(x1 - (g1 * (x1 - x0)) / (g1 - g0));
    x0 = x1; g0 = g1; x1 = x2; g1 = g(x1);
  }
  if (locked) *locked = std::fabs(g1) < 1e-6 * f0;
  return x1;
}

Packet makePacket(int key, const PacketParams &P, double fMax, int maxPairs, double rel) {
  const int id = P.potential, d = P.detector;
  const double sigma = P.sigma;
  bool locked = false;
  const double f0 = keyFreq(key), nbar = solveNbar(key, P, &locked);
  const WellModel W = well(id, P, nbar);
  const States S = packetStates(W, id == bouncer, nbar, sigma);
  const int N = (int)S.ns.size();
  const Derivs dv = derivs(W, nbar);
  const double wbar = meanBohr(W, S, d);
  // Time scale s: Hz per natural frequency unit (f = s·ΔE): T_rev exact with the lock, else the pitch
  const double s = locked ? 2 / (std::fabs(dv.d2) * ((P.beats * 60) / P.bpm)) : f0 / wbar;
  double cmax = 0;
  for (double v : S.c) cmax = jsMax(cmax, std::fabs(v));
  std::vector<Pair> all;
  for (int i = 0; i < N; i++) for (int j = i + 1; j < N; j++) {
    const double cc = 2 * S.c[i] * S.c[j];
    if (std::fabs(cc) < 1e-7 * cmax * cmax) continue;
    const double f = s * (S.E[j] - S.E[i]);
    if (f > fMax || f <= 0) continue;
    const double x = W.x(S.ns[i], S.ns[j]);
    if (!(x != 0) || std::isnan(x)) continue; // !x
    const double amp = cc * x, r = f / f0;
    all.push_back({i, j, S.ns[j] - S.ns[i], f, d == electrode ? amp : d == coil ? amp * r : -amp * r * r});
  }
  std::stable_sort(all.begin(), all.end(), [](const Pair &a, const Pair &b) { return std::fabs(b.w) - std::fabs(a.w) < 0; });
  const double wmax = all.empty() ? 1 : std::fabs(all[0].w);
  std::vector<Pair> pairs;
  for (const Pair &p : all) if (std::fabs(p.w) >= rel * wmax && (int)pairs.size() < maxPairs) pairs.push_back(p);
  // Detector gain: over the first period after launch, the peak is ≤ 1 and the rms ≤ 0.4; for the
  // electrode the peak is of what it reads, the dipole less its fading Franck–Condon reference.
  const double fp = s * wbar;
  const int M = 128;
  double dc0 = 0;
  if (d == electrode) for (const Pair &p : pairs) dc0 += p.w;
  double peak = 1e-30, ss = 0;
  for (int q = 0; q < 1.5 * M; q++) {
    const double t = q / (M * fp);
    double y = 0;
    for (const Pair &p : pairs) y += p.w * (d == coil ? -fd::sin(2 * PI * p.f * t) : fd::cos(2 * PI * p.f * t));
    if (q < M) ss += y * y;
    peak = jsMax(peak, std::fabs(y - (t < DC_FADE ? 0.5 * dc0 * (1 + fd::cos((PI * t) / DC_FADE)) : 0)));
  }
  const double pk = jsMax(peak, 2.5 * std::sqrt(ss / M));
  for (Pair &p : pairs) p.w = p.w / pk;
  std::stable_sort(pairs.begin(), pairs.end(), [](const Pair &a, const Pair &b) { return a.k != b.k ? a.k < b.k : a.i < b.i; });
  const bool harm = id == harmonic;
  const double Trev = harm ? INFINITY : 2 / (s * std::fabs(dv.d2));
  const double Tsr = harm || std::fabs(dv.d3) <= 1e-9 * std::fabs(dv.d1 * dv.d2) ? INFINITY : 6 / (s * std::fabs(dv.d3));
  Packet out;
  out.key = key; out.id = id; out.d = d; out.f0 = f0; out.pitch = fp; out.nbar = nbar; out.sigma = sigma;
  out.ns = S.ns; out.c = S.c; out.E = S.E; out.scale = s; out.pairs = std::move(pairs);
  // the tempo lock asked for an n̄ beyond the well's range: the pitch is kept, the revival is off the beat
  out.offBeat = P.lock && id != harmonic && !locked;
  out.Tcl = 1 / fp; out.Trev = Trev; out.Tsr = Tsr; out.tColl = Trev / (2 * std::numbers::sqrt2 * PI * sigma); out.kap = W.kap;
  // dc = ⟨x⟩(0) − x̄, which the electrode's AC coupling removes (the engine fades it out over 60 ms)
  if (d == electrode) for (const Pair &p : out.pairs) out.dc += p.w;
  return out;
}

double autocorr(const Packet &pk, double t, double Tphi) {
  const double w = 2 * PI * pk.scale;
  const int N = (int)pk.ns.size();
  if (!(Tphi < 1e6)) {
    double re = 0, im = 0;
    for (int i = 0; i < N; i++) { const double p = pk.c[i] * pk.c[i], ph = w * (pk.E[i] - pk.E[0]) * t; re += p * fd::cos(ph); im -= p * fd::sin(ph); }
    return re * re + im * im;
  }
  double s = 0;
  for (int i = 0; i < N; i++) for (int j = 0; j < N; j++) {
    const int k = pk.ns[j] - pk.ns[i];
    s += sq(pk.c[i]) * sq(pk.c[j]) * fd::cos(w * (pk.E[j] - pk.E[i]) * t) * fd::exp((-k * k * t) / Tphi);
  }
  return s;
}

double signalAt(const Packet &pk, double t, double T1, double Tphi, double dcFade) {
  double y = t <= 0 ? -pk.dc : t < dcFade ? -0.5 * pk.dc * (1 + fd::cos((PI * t) / dcFade)) * fd::exp(-t / T1) : 0;
  for (const Pair &p : pk.pairs) {
    const double ph = 2 * PI * p.f * t, dec = fd::exp(-t / T1 - (p.k * p.k * t) / Tphi);
    y += p.w * dec * (pk.d == coil ? -fd::sin(ph) : fd::cos(ph));
  }
  return y;
}

// ---- the views' eigenfunctions (waveGrid) --------------------------------------------------------

// Numerov for φ″ = Q(y)φ on y = y0 + i·h, i = 0…N−1, from both ends, matched near iMatch.
template <class F>
static std::vector<double> numerov(F Q, double y0, double h, int N, int iMatch, double startL0 = 0, double startL1 = 1e-12) {
  std::vector<double> q(N), L(N), R(N);
  for (int i = 0; i < N; i++) q[i] = 1 - (h * h * Q(y0 + i * h)) / 12;
  auto step = [&](double a, double b, int i1, int i0, int ip) { return (2 * (6 - 5 * q[i1]) * b - q[i0] * a) / q[ip]; };
  L[0] = startL0; L[1] = startL1;
  for (int i = 1; i < iMatch + 40 && i + 1 < N; i++) {
    L[i + 1] = step(L[i - 1], L[i], i, i - 1, i + 1);
    if (std::fabs(L[i + 1]) > 1e150) for (int j = 0; j <= i + 1; j++) L[j] *= 1e-150;
  }
  R[N - 1] = 0; R[N - 2] = 1e-12;
  for (int i = N - 2; i > iMatch - 40 && i > 0; i--) {
    R[i - 1] = step(R[i + 1], R[i], i, i + 1, i - 1);
    if (std::fabs(R[i - 1]) > 1e150) for (int j = i - 1; j < N; j++) R[j] *= 1e-150;
  }
  double num = 0, den = 0;
  for (int i = std::max(0, iMatch - 40); i < std::min(N, iMatch + 40); i++) { num += L[i] * R[i]; den += R[i] * R[i]; }
  const double sc = den > 0 ? num / den : 1;
  for (int i = std::max(iMatch, 0); i < N; i++) L[i] = sc * R[i];
  return L;
}

// a fine-grid function at the display points (linear interpolation)
static void sample(const std::vector<double> &f, double y0, double h, const std::vector<double> &ys, double *out) {
  for (size_t r = 0; r < ys.size(); r++) {
    const double u = (ys[r] - y0) / h, i = std::floor(u);
    out[r] = std::isnan(i) ? NAN : i < 0 || i + 1 >= (double)f.size() ? 0 : f[(size_t)i] + (u - i) * (f[(size_t)i + 1] - f[(size_t)i]);
  }
}
template <class Wt>
static void normalise(std::vector<double> &f, double h, Wt w) {
  double s = 0;
  for (size_t i = 0; i < f.size(); i++) s += f[i] * f[i] * w((int)i) * h;
  const double k = 1 / std::sqrt(s != 0 && !std::isnan(s) ? s : 1);
  for (double &v : f) v *= k;
}
static void firstLobePositive(double *f, size_t n) {
  double m = 0;
  for (size_t i = 0; i < n; i++) m = jsMax(m, std::fabs(f[i]));
  for (size_t i = 0; i < n; i++) if (std::fabs(f[i]) > 0.05 * m) {
    if (f[i] < 0) for (size_t j = 0; j < n; j++) f[j] = -f[j];
    break;
  }
}

WaveGrid waveGrid(int id, const std::vector<int> &ns, const std::vector<double> &E, double kap, double nbar, double eta, int rows) {
  WaveGrid G;
  const int N = (int)ns.size();
  if (!N || rows <= 0) return G;
  const int nHi = ns[N - 1], nLo = ns[0];
  const double Ehi = E[N - 1];
  G.ys.resize(rows); G.phi.assign((size_t)N * rows, 0.0);
  auto span = [&](double a, double b) { for (int r = 0; r < rows; r++) G.ys[r] = a + ((b - a) * (r + 0.5)) / rows; };
  auto one = [](int) { return 1.0; };
  if (id == box) {
    span(0, 1);
    for (int i = 0; i < N; i++) for (int r = 0; r < rows; r++) G.phi[(size_t)i * rows + r] = std::numbers::sqrt2 * fd::sin(ns[i] * PI * G.ys[r]);
    return G;
  }
  if (id == harmonic) {
    const double X = 1.15 * std::sqrt(2.0 * nHi + 1);
    span(-X, X);
    for (int r = 0; r < rows; r++) { // normalised Hermite functions, log-scaled recurrence, times (−1)ⁿ
      const double x = G.ys[r];
      double a = 0, b = 1, lg = -0.5 * x * x - 0.25 * fd::log(PI);
      for (int n = 0; n <= nHi; n++) {
        if (n >= nLo) G.phi[(size_t)(n - nLo) * rows + r] = (n % 2 ? -1 : 1) * b * fd::exp(lg);
        const double c = std::sqrt(2.0 / (n + 1)) * x * b - std::sqrt((double)n / (n + 1)) * a;
        a = b; b = c;
        const double m = std::fabs(b);
        if (m > 1e100 || (m < 1e-100 && m > 0)) { const double s = fd::log(m); a /= m; b /= m; lg += s; }
      }
    }
    return G;
  }
  if (id == morse) {
    const double k = std::isnan(kap) ? morseKappa(nbar, eta) : kap, D = k / 4, mu = k / 2;
    auto V = [&](double x) { return D * sq(1 - fd::exp(-x)); };
    const double st = std::sqrt(jsMin(Ehi / D, 0.999999)), a = -fd::log(1 + st), b = -fd::log(1 - st), pad = 0.12 * (b - a);
    span(a - pad, b + pad);
    const double kmax = std::sqrt(2 * mu * Ehi), h = (2 * PI) / kmax / 20;
    const double y0 = a - pad - 12 / std::sqrt(2 * mu * D), y1 = b + pad + 12 / std::sqrt(2 * mu * jsMax(D - Ehi, 1e-3));
    const int Nf = (int)jsMin(400000, std::ceil((jsMin(y1, b + 40) - y0) / h));
    for (int i = 0; i < N; i++) {
      const double En = E[i];
      std::vector<double> f = numerov([&](double x) { return 2 * mu * (V(x) - En); }, y0, h, Nf, (int)jsRound(-y0 / h));
      normalise(f, h, one);
      firstLobePositive(f.data(), f.size());
      sample(f, y0, h, G.ys, &G.phi[(size_t)i * rows]);
    }
    return G;
  }
  if (id == bouncer) {
    const double zt = Ehi, zmax = zt + 12 / std::sqrt(1.0) + 4 * fd::pow(zt, -1.0 / 3);
    span(0, 1.12 * zt);
    const double h = (2 * PI) / std::sqrt(zt) / 24;
    const int Nf = (int)std::ceil(zmax / h) + 2;
    for (int i = 0; i < N; i++) {
      const double En = E[i];
      std::vector<double> f = numerov([&](double z) { return z - En; }, 0, h, Nf, (int)jsRound((0.5 * En) / h));
      normalise(f, h, one);
      firstLobePositive(f.data(), f.size());
      sample(f, 0, h, G.ys, &G.phi[(size_t)i * rows]);
    }
    return G;
  }
  if (id == hydrogen) {
    const int l = HYDROGEN_L;
    const double c2 = (2 * l + 1) * (2 * l + 1) - 0.25;
    auto rOut = [&](double n) { return n * n * (1 + std::sqrt(1 - sq((l + 0.5) / n))); };
    span(0, 1.08 * rOut(nHi));
    const double sMax = std::sqrt(rOut(nHi)) + 14, h = 0.11;
    const int Nf = (int)std::ceil(sMax / h) + 2;
    for (int i = 0; i < N; i++) {
      const int n = ns[i];
      const double En = E[i];
      auto Q = [&](double s) { return s < 1e-9 ? 1e18 : c2 / (s * s) - 8 - 8 * En * s * s; };
      std::vector<double> w = numerov(Q, 0, h, Nf, (int)jsRound((0.6 * n) / h), 0, fd::pow(h, 2 * l + 1.5));
      // u(r) = √(2s) w(s); ∫u² dr = ∫ 4s² w² ds
      normalise(w, h, [&](int j) { return 4 * sq(j * h); });
      double *u = &G.phi[(size_t)i * rows];
      for (int r = 0; r < rows; r++) {
        const double s = std::sqrt(G.ys[r]), x = s / h, j = std::floor(x);
        u[r] = j + 1 < Nf ? std::sqrt(2 * s) * (w[(size_t)j] + (x - j) * (w[(size_t)j + 1] - w[(size_t)j])) : 0;
      }
      firstLobePositive(u, rows);
    }
    return G;
  }
  return G;
}

} // namespace forte::quantum
