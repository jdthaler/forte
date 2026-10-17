// blackhole-model.cpp — ringdown-model.js in C++ (blackhole-model.h).

#include "blackhole-model.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

#include "forte/fdlibm.h"
#include "qnm-table.h"

namespace forte::blackhole {

namespace fd = forte::fdlibm;
static constexpr double PI = 3.141592653589793, TAU = 2 * PI;

static void words(double x, int32_t &hi, uint32_t &lo) { uint64_t b; std::memcpy(&b, &x, 8); hi = (int32_t)(b >> 32); lo = (uint32_t)b; }
static double fromWords(int32_t hi, uint32_t lo) { const uint64_t b = ((uint64_t)(uint32_t)hi << 32) | lo; double x; std::memcpy(&x, &b, 8); return x; }

// V8's ieee754::log10 (fdlibm's e_log10.c): n·log10(2) + log(x / 2ⁿ)/ln 10
double log10(double x) {
  static const double two54 = 1.80143985094819840000e+16, ivln10 = 4.34294481903251816668e-01,
                      log10_2hi = 3.01029995663611771306e-01, log10_2lo = 3.69423907715893078616e-13;
  int32_t hx;
  uint32_t lx;
  words(x, hx, lx);
  int32_t k = 0;
  if (hx < 0x00100000) { // x < 2^−1022
    if (((hx & 0x7fffffff) | lx) == 0) return -INFINITY;
    if (hx < 0) return NAN;
    k -= 54;
    x *= two54; // subnormal: scale up
    words(x, hx, lx);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx == 0x3ff00000 && lx == 0) return 0;
  k += (hx >> 20) - 1023;
  const int32_t i = (int32_t)(((uint32_t)k & 0x80000000u) >> 31);
  hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
  const double y = k + i;
  x = fromWords(hx, lx);
  const double z = y * log10_2lo + ivln10 * fd::log(x);
  return z + y * log10_2hi;
}

// Math.hypot as V8 computes it (scaled, with Kahan summation), for two arguments
double hypot2(double a, double b) {
  a = std::fabs(a); b = std::fabs(b);
  const double max = std::max(a, b);
  if (max == INFINITY) return INFINITY;
  if (std::isnan(a) || std::isnan(b)) return NAN;
  if (max == 0) return 0;
  double sum = 0, comp = 0;
  for (double v : {a, b}) {
    const double n = v / max, summand = n * n - comp, pre = sum + summand;
    comp = (pre - sum) - summand;
    sum = pre;
  }
  return std::sqrt(sum) * max;
}

double keyFreq(double m) { return 440 * fd::pow(2, (m - 69) / 12); }
// spin slider: u = −log10(1 − a), from 0 (Schwarzschild) to 6 (a = 1 − 10⁻⁶)
double spinFromU(double u) { return 1 - fd::pow(10, -u); }
double uFromSpin(double a) { return -log10(1 - a); }

// ---- QNM bank: interpolate the precomputed Leaver table ----
namespace {
struct Bank {
  double lim[table::NMODES][table::NU]; // log damping: ~linear in u near extremal
  int8_t index[5][9][3];                // (l, m + 4, n) → mode, −1 for none
  Bank() {
    std::memset(index, -1, sizeof index);
    for (int i = 0; i < table::NMODES; i++) {
      const table::Mode &md = table::kModes[i];
      for (int j = 0; j < table::NU; j++) lim[i][j] = fd::log(-md.im[j]);
      if (md.l >= 0 && md.l < 5 && md.m >= -4 && md.m <= 4 && md.n >= 0 && md.n < 3) index[md.l][md.m + 4][md.n] = (int8_t)i;
    }
  }
};
const Bank &bank() {
  static const Bank b;
  return b;
}
} // namespace

int tableSize() { return table::NU; }
int tableModes() { return table::NMODES; }
const double *tableU() { return table::kU; }
void tableMode(int i, int &l, int &m, int &n, const double *&re, const double *&lim) {
  const table::Mode &md = table::kModes[i];
  l = md.l; m = md.m; n = md.n; re = md.re; lim = bank().lim[i];
}

// dy/du at node j from the parabola through three neighbouring nodes
static double slope(const double *U, const double *y, int j) {
  const int c = std::min(table::NU - 2, std::max(1, j)); // centre of the three nodes
  const double x0 = U[c - 1], x1 = U[c], x2 = U[c + 1], x = U[j];
  // derivative of the Lagrange parabola at x
  return y[c - 1] * ((2 * x - x1 - x2) / ((x0 - x1) * (x0 - x2)))
    + y[c] * ((2 * x - x0 - x2) / ((x1 - x0) * (x1 - x2)))
    + y[c + 1] * ((2 * x - x0 - x1) / ((x2 - x0) * (x2 - x1)));
}

// Cubic Hermite in u on (Re ω, log −Im ω). The slope at each node is the derivative of the
// parabola through it and its two neighbours (one-sided at the ends of the table).
bool omega(int l, int m, int n, double a, Omega &out) {
  if (l < 0 || l > 4 || m < -4 || m > 4 || n < 0 || n > 2) return false;
  const Bank &B = bank();
  const int k = B.index[l][m + 4][n];
  if (k < 0) return false;
  const double *U = table::kU;
  const int last = table::NU - 1;
  const double u = std::min(U[last], std::max(0.0, uFromSpin(a)));
  int i = 0;
  while (i < last - 1 && U[i + 1] < u) i++;
  const double h1 = U[i + 1] - U[i], t = (u - U[i]) / h1;
  const auto cr = [&](const double *y) {
    const double m1 = slope(U, y, i) * h1, m2 = slope(U, y, i + 1) * h1;
    const double t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * m2;
  };
  out.re = cr(table::kModes[k].re);
  out.im = -fd::exp(cr(B.lim[k]));
  return true;
}

// ---- spin-weighted spherical harmonics ₛY_lm(θ, φ = 0), real ----
static double fact(int n) { double r = 1; for (int i = 2; i <= n; i++) r *= i; return r; }
static double binom(int n, int k) { return k < 0 || k > n ? 0 : fact(n) / (fact(k) * fact(n - k)); }
double swsh(int s, int l, int m, double theta) {
  if (std::abs(m) > l || std::abs(s) > l) return 0;
  const double pre = fd::pow(-1, m) * std::sqrt((fact(l + m) * fact(l - m) * (2 * l + 1)) / (4 * PI * fact(l + s) * fact(l - s)));
  const double sh = fd::sin(theta / 2), ch = fd::cos(theta / 2);
  double sum = 0;
  for (int r = 0; r <= l - s; r++) {
    const double c = binom(l - s, r) * binom(l + s, r + s - m);
    if (!c) continue;
    const int pc = 2 * r + s - m, ps = 2 * l - pc; // cot^pc · sin^2l
    sum += c * fd::pow(-1, l - r - s) * (pc ? fd::pow(ch, pc) : 1) * (ps ? fd::pow(sh, ps) : 1);
  }
  return pre * sum;
}

// ---- excitation ----
// Overtone amplitudes at the strain peak, relative to the fundamental (illustrative).
static const double OVERTONE[3][2] = {{1, 0}, {2.0, PI}, {2.5, 0}};

void keyVoice(int key, const ModelParams &P, double fs, KeyVoice &v) {
  const double a = spinFromU(P.spinU);
  Omega w220;
  omega(2, 2, 0, a, w220);
  const double f0 = keyFreq(key);
  const double M = w220.re / (TAU * f0); // seconds (G M / c³)
  const double iota = (P.inclination * PI) / 180;
  // excitation(P): Kamaretsos et al.'s fits in the symmetric mass ratio ν
  const double q = std::max(1.0, P.massRatio), nu = q / fd::pow(1 + q, 2);
  const double d = std::max(0.0, 1 - 4 * nu);
  const double A22 = 0.864 * nu;
  const struct { int l, m; double amp; } base[4] = {
    {2, 2, A22},
    {2, 1, 0.52 * fd::pow(d, 0.71) * A22},
    {3, 3, 0.44 * fd::pow(d, 0.45) * A22},
    {4, 4, (5.4 * fd::pow(nu - 0.22, 2) + 0.04) * A22},
  };
  v.key = key;
  v.count = 0;
  const auto add = [&](int l, int m, int n, double amp, double phase) {
    Omega w;
    if (!omega(l, m, n, a, w)) return;
    const double f = w.re / (TAU * M), gamma = -w.im / M;
    if (f <= 20 || f >= 0.45 * fs || amp == 0 || v.count >= MAX_MODES) return;
    // amplitude at the ringdown start time t0 (in units of M) after the peak
    const double Are = amp * fd::cos(phase), Aim = amp * fd::sin(phase);
    const double Y = swsh(-2, l, m, iota), Ym = swsh(-2, l, -m, iota), sgn = l % 2 ? -1 : 1;
    // P = A·Y_lm, Q = (−1)^l A*·Y_l,−m ; h₊ = Re((P + Q*)ζ), h× = −Im((P − Q*)ζ)
    const double Pr = Are * Y, Pi = Aim * Y, Qr = sgn * Are * Ym, Qi = -sgn * Aim * Ym;
    Mode &md = v.modes[v.count++];
    md.l = l; md.m = m; md.n = n; md.f = f; md.gamma = gamma; md.tau = 1 / gamma; md.Q = w.re / (2 * -w.im); md.amp = amp;
    md.cpr = Pr + Qr; md.cpi = Pi - Qi; md.cxr = Pr - Qr; md.cxi = Pi + Qi;
  };
  const double t0 = P.t0;
  for (const auto &b : base) {
    const int l = b.l, m = b.m;
    Omega o;
    omega(l, m, 0, a, o);
    const double wl = -o.im;
    const int nMax = l == 2 && m == 2 ? 2 : 0;
    for (int n = 0; n <= nMax; n++) {
      const double ratio = OVERTONE[n][0], ph = OVERTONE[n][1];
      omega(l, m, n, a, o);
      const double wn = -o.im;
      const double ov = n == 0 ? 1 : P.overtones * ratio * fd::exp(-(wn - wl) * t0);
      add(l, m, n, b.amp * ov, ph);
      if (P.retrograde > 0) add(l, -m, n, b.amp * ov * P.retrograde, ph);
    }
  }
  // overall level: normalise to an equal-mass, face-on (2,2,0) of unit size
  const double norm = 1 / (0.864 * 0.25 * swsh(-2, 2, 2, 0));
  for (int i = 0; i < v.count; i++) { Mode &md = v.modes[i]; md.cpr *= norm; md.cpi *= norm; md.cxr *= norm; md.cxi *= norm; }

  // optional inspiral: leading-order (quadrupole) chirp into the merger
  v.hasChirp = P.inspiral;
  v.chirp = Chirp{};
  if (P.inspiral) {
    const double Erad = 0.048 * fd::pow(4 * nu, 2); // radiated fraction
    const double Mtot = M / (1 - Erad), Mc = Mtot * fd::pow(nu, 0.6);
    const double fIsco = 1 / (fd::pow(6, 1.5) * PI * Mtot);
    // start inspiralOct octaves below the ISCO frequency, but last at most TC_MAX
    const double k5 = (5.0 / 256) * fd::pow(Mc, -5.0 / 3);
    const auto tcOf = [&](double f) { return k5 * fd::pow(PI * f, -8.0 / 3); };
    double fStart = fIsco * fd::pow(2, -P.inspiralOct);
    if (tcOf(fStart) > TC_MAX) fStart = fd::pow(k5 / TC_MAX, 3.0 / 8) / PI;
    // The strain is continuous through the handover: the chirp ends with the amplitude and
    // phase of the ringdown it hands over to, S = Σ C₊.
    double sr = 0, si = 0;
    for (int i = 0; i < v.count; i++) { sr += v.modes[i].cpr; si += v.modes[i].cpi; }
    const double cp = (1 + fd::pow(fd::cos(iota), 2)) / 2, cx = fd::cos(iota);
    Chirp &c = v.chirp;
    c.Mc = Mc; c.fStart = fStart; c.fIsco = fIsco; c.f220 = f0; c.tc = tcOf(fStart); c.cp = cp; c.cx = cx;
    c.amp = hypot2(sr, si) / cp; c.psi = fd::atan2(si, sr);
    c.fPk = 1.233 * fIsco;                        // amplitude grows as f^(2/3) up to here
    c.tauB = 1.5 / f0;                            // merger bridge: f → f₂₂₀ with this time constant
    c.fadeT = std::min(0.03, 0.3 * tcOf(fStart)); // fade-in (the inspiral was already under way)
  }
  Info &i = v.info;
  i.key = key; i.f0 = f0; i.a = a; i.M = M; i.Msun = M / MSUN_S; i.nu = nu;
  i.rPlusKm = (1 + std::sqrt(1 - a * a)) * (M / MSUN_S) * MSUN_KM;
  i.OmegaH = a / (2 * (1 + std::sqrt(1 - a * a))) / M / TAU; // Hz
  i.hawkingK = 6.169e-8 / (M / MSUN_S) * (2 * std::sqrt(1 - a * a)) / (1 + std::sqrt(1 - a * a));
}

// ---- the chirp's schedule in closed form ----
// Stage 1, t < t₁: f = f_s(1 − t/τ_c)^(−3/8) up to f_ISCO. Stage 2, the merger bridge: f relaxes
// to f₂₂₀ with time constant τ_B; at 0.97 f₂₂₀ (time t₂) the ringdown takes over.
Schedule chirpSchedule(const Chirp &ch) {
  const double f1 = std::max(ch.fStart, std::min(ch.fIsco, ch.f220));
  const double t1 = ch.fStart < f1 ? ch.tc * (1 - fd::pow(ch.fStart / f1, 8.0 / 3)) : 0;
  const double t2 = t1 + (f1 < 0.97 * ch.f220 ? ch.tauB * fd::log((ch.f220 - f1) / (0.03 * ch.f220)) : 0);
  return {f1, t1, t2};
}
// frequency (Hz) and phase (rad) of the chirp at time t ≤ t₂
ChirpPoint chirpAt(const Chirp &ch, const Schedule &s, double t) {
  if (t < s.t1) {
    const double x = 1 - t / ch.tc;
    return {ch.fStart * fd::pow(x, -3.0 / 8), TAU * ch.fStart * ch.tc * 1.6 * (1 - fd::pow(x, 5.0 / 8))};
  }
  const double x1 = 1 - s.t1 / ch.tc, phi1 = s.t1 > 0 ? TAU * ch.fStart * ch.tc * 1.6 * (1 - fd::pow(x1, 5.0 / 8)) : 0;
  const double d = t - s.t1, e = fd::exp(-d / ch.tauB);
  return {ch.f220 - (ch.f220 - s.f1) * e, phi1 + TAU * (ch.f220 * d - (ch.f220 - s.f1) * ch.tauB * (1 - e))};
}
double chirpAmp(const Chirp &ch, double f, double t) {
  return ch.amp * std::min(1.0, fd::pow(f / ch.fPk, 2.0 / 3)) * (t < ch.fadeT ? 0.5 - 0.5 * fd::cos((PI * t) / ch.fadeT) : 1);
}

// The closed-form sum over modes (and the chirp), in the engine's units at velocity 1 before its
// output gain.
double strainCurve(const KeyVoice &v, int n, float *hp, float *hx) {
  const Chirp *ch = v.hasChirp ? &v.chirp : nullptr;
  const Schedule s = ch ? chirpSchedule(*ch) : Schedule{0, 0, 0};
  const double tH = ch ? s.t2 : 0;
  const double f0 = v.info.f0, half = 1 / (2 * f0);
  double tau = 0;
  for (int i = 0; i < v.count; i++) if (v.modes[i].n == 0) tau = std::max(tau, v.modes[i].tau);
  if (!tau) tau = 0.01;
  const double dur = std::min(2.5, tH + 6 * tau);
  const ChirpPoint end = ch ? chirpAt(*ch, s, tH) : ChirpPoint{0, 0};
  const double aEnd = ch ? chirpAmp(*ch, end.f, tH) : 0;
  const double psi0 = ch ? end.phi + ch->psi : 0;
  for (int i = 0; i < n; i++) {
    const double t = (dur * i) / (n - 1);
    double p = 0, x = 0;
    if (ch && t < tH + half) { // inspiral, then fading out
      double phi, A, w = 1;
      if (t < tH) { const ChirpPoint c = chirpAt(*ch, s, t); phi = c.phi; A = chirpAmp(*ch, c.f, t); }
      else { phi = end.phi + TAU * ch->f220 * (t - tH); A = aEnd; w = 0.5 + 0.5 * fd::cos(PI * (t - tH) / half); }
      p = w * A * ch->cp * fd::cos(phi); x = w * A * ch->cx * fd::sin(phi);
    }
    if (t >= tH) { // ringdown, rising over half a cycle
      const double d = t - tH, env = d < half ? 0.5 - 0.5 * fd::cos(PI * d / half) : 1;
      double rp = 0, rx = 0;
      for (int k = 0; k < v.count; k++) {
        const Mode &md = v.modes[k];
        const double e = fd::exp(-md.gamma * d), th = TAU * md.f * d + psi0;
        const double zr = e * fd::cos(th), zi = -e * fd::sin(th);
        rp += md.cpr * zr - md.cpi * zi;
        rx -= md.cxr * zi + md.cxi * zr;
      }
      p += env * rp; x += env * rx;
    }
    hp[i] = (float)p; hx[i] = (float)x;
  }
  return dur;
}

} // namespace forte::blackhole
