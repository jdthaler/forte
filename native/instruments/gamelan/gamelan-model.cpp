// gamelan-model.cpp — the Gamelan's physics (gamelan-model.h).

#include "gamelan-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "gamelan-params.h"

namespace forte::gamelan {

using std::numbers::pi;

Register registerOf(int key, int instrument) {
  if (instrument != instrument_::ensemble) {
    const int f = std::clamp(instrument, 0, 3);
    static const char *const NAMES[] = {"Gangsa", "Saron", "Bonang", "Kempul"};
    return {f, 0, f == gong && key < 36 ? "Gong ageng" : NAMES[f]};
  }
  // the ensemble, an octave each: gong ageng, kempul, slenthem, demung, saron, peking (carried on up)
  if (key < 36) return {gong, 0, "Gong ageng"};
  if (key < 48) return {gong, 1, "Kempul"};
  if (key < 60) return {gangsa, 2, "Slenthem"};
  if (key < 72) return {saron, 3, "Demung"};
  if (key < 84) return {saron, 4, "Saron"};
  return {saron, 5, "Peking"};
}

// ---- the laras ------------------------------------------------------------------------------
// Each pitch class's cents above C in the gamelan's tuning: pélog's seven on the white keys
// (ninths of an octave: 0 1 2 4 5 6 7), sléndro's five on the black (240 ¢ apart, sléndro 6 on
// pélog 6 at 800 ¢: 2 on C♯ at 80, 3 on D♯ at 320, 5 on F♯ at 560, 6 on G♯ at 800, 1 on A♯ at 1040).
static constexpr double LARAS[12] = {0, 80, 1200.0 / 9, 320, 2400.0 / 9, 4800.0 / 9, 560, 6000.0 / 9, 800, 800, 1040, 8400.0 / 9};
static constexpr int DEGREE[12] = {1, -2, 2, -3, 3, 4, -5, 5, -6, 6, -1, 7};

double larasCents(int key, int laras) {
  if (laras != laras_::gamelan) return 0;
  const int pc = ((key % 12) + 12) % 12;
  return LARAS[pc] - 100 * pc;
}
int larasDegree(int key, int laras) { return laras == laras_::gamelan ? DEGREE[((key % 12) + 12) % 12] : 0; }

double noteFreq(int key, const double *P) {
  const int laras = (int)P[p::laras];
  return keyFreq(key) * std::pow(2.0, larasCents(key, laras) / 1200) * tuningOf(P).ratio(key);
}

// ---- bars -----------------------------------------------------------------------------------
double huangDet(double b, double r, double s) {
  const double q = std::sqrt((r * r - s * s) * (r * r - s * s) + 4 / (b * b));
  const double al = std::sqrt(std::max(0.0, (q - (r * r + s * s)) / 2)), be = std::sqrt((q + (r * r + s * s)) / 2);
  const double c = b * b * r * r * (r * r - s * s) * (r * r - s * s) + 3 * r * r - s * s;
  // scaled by e^(−bα) so that it stays finite on long, thin bars
  const double e = std::exp(-b * al), ch = (1 + e * e) / 2, sh = (1 - e * e) / 2;
  return 2 * e - 2 * ch * std::cos(b * be) + (b * c * sh * std::sin(b * be)) / std::sqrt(std::max(1e-12, 1 - b * b * r * r * s * s));
}

int timoshenkoRoots(double hL, int n, double *out) {
  const double r = hL / std::sqrt(12.0), s = r * std::sqrt(kE / (kKappa * kG));
  const double bmax = r > 0 ? 0.999 / (r * s) : 1e9;
  int found = 0;
  // scan in √b (≈ βL, about π apart), then bisect
  double x0 = 3, f0 = huangDet(x0 * x0, r, s);
  for (double x = 3.02; found < n && x * x < bmax && x < 60; x += 0.02) {
    const double f = huangDet(x * x, r, s);
    if (f0 * f < 0) {
      double lo = x - 0.02, hi = x, flo = f0;
      for (int i = 0; i < 50; i++) {
        const double mid = 0.5 * (lo + hi), fm = huangDet(mid * mid, r, s);
        if ((flo < 0) == (fm < 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      const double xr = 0.5 * (lo + hi);
      out[found++] = xr * xr;
    }
    x0 = x; f0 = f;
  }
  return found;
}

static constexpr double BETA[kBend] = {4.730040745, 7.853204624, 10.99560784, 14.13716549, 17.27875966, 20.42035225};
double betaL(int n) { return BETA[std::clamp(n, 0, kBend - 1)]; }
double bendShape(int n, double u) {
  const double b = betaL(n), sg = (std::cosh(b) - std::cos(b)) / (std::sinh(b) - std::sin(b));
  return std::cosh(b * u) + std::cos(b * u) - sg * (std::sinh(b * u) + std::sin(b * u));
}

double torsionK(double w, double h) {
  if (h > w) std::swap(w, h);
  const double q = h / w;
  return w * h * h * h * (1.0 / 3 - 0.21 * q * (1 - q * q * q * q / 12));
}
double torsionFreq(double L, double w, double h, int n) {
  const double Jp = (w * h * (w * w + h * h)) / 12;
  return (n / (2 * L)) * std::sqrt((kG * torsionK(w, h)) / (kRho * Jp));
}

Bar barFor(int family, double f1, double thick) {
  const double h = (family == saron ? 0.012 : 0.007) * thick;
  const double c = std::sqrt(kE / kRho) * h / std::sqrt(12.0); // √(EI/ρA)
  // ω₁ = b₁(h/L) c / L²: start from Euler–Bernoulli's b₁, then let the length and b₁ agree
  double L = std::sqrt((betaL(0) * betaL(0) * c) / (TAU * f1));
  for (int it = 0; it < 6; it++) {
    double b[1];
    if (timoshenkoRoots(h / L, 1, b) < 1) break;
    L = std::sqrt((b[0] * c) / (TAU * f1));
  }
  const double w = std::clamp(0.064 * std::pow(L / 0.17, 0.45), 0.02, 0.16);
  return {L, std::max(w, 1.2 * h), h};
}

Tube tubeFor(const Bar &bar, double fT) {
  const double w = TAU * fT, k = w / kCAir;
  // as wide as the bar allows, but narrow beside a wavelength (ka ≤ 0.3), as the high tubes are
  const double a = std::clamp(std::min(0.4 * bar.w, 0.3 / k), 0.004, 0.06);
  const double nuAir = 1.5e-5, delta = std::sqrt(2 * nuAir / w) * 1.47; // viscous + thermal (γ − 1)/√Pr
  return {fT, fT * (k * a) * (k * a) + (w * delta) / (2 * a), a};
}

// ---- gongs ----------------------------------------------------------------------------------
const GongMode BONANG[kBonangModes] = {
  {1.0, 0, round},                         // (0,1) 458 Hz: the note
  {240.0 / 458, 2, rim}, {244.0 / 458, 2, rim}, // (2,0)
  {527.0 / 458, 3, rim}, {556.0 / 458, 3, rim}, // (3,0)
  {697.0 / 458, 1, diameters}, {734.0 / 458, 1, diameters}, // (1,1)
  {1284.0 / 458, 0, round},                // (0,2)
  {2005.0 / 458, 2, diameters}, {2093.0 / 458, 2, diameters}, // (2,1)
  {2529.0 / 458, 3, diameters}, {2606.0 / 458, 3, diameters}, // (3,1)
  {3044.0 / 458, 4, diameters}, {3089.0 / 458, 4, diameters}, // (4,1)
  {3726.0 / 458, 5, diameters}, {3748.0 / 458, 5, diameters}, // (5,1)
};
const GongMode GONG[kGongModes] = {
  {1.0, 0, round},
  {92.0 / 61.75, 1, diameters}, {101.75 / 61.75, 1, diameters},
  {121.25 / 61.75, 0, round},
  {150.25 / 61.75, 2, diameters}, {153.25 / 61.75, 2, diameters},
  {160.0 / 61.75, 2, diameters}, {162.5 / 61.75, 2, diameters},
  {236.0 / 61.75, 3, diameters},
};

// ---- a key ----------------------------------------------------------------------------------
double pulseSpectrum(double f, double tau) {
  const double u = 2 * f * tau;
  return std::fabs(u - 1) < 1e-6 ? pi / 4 : std::fabs(std::cos((pi * u) / 2) / (1 - u * u));
}

double contactTime(int family, double softness, double f, double v) {
  static constexpr double AT_C4[] = {0.3e-3, 0.3e-3, 1.0e-3, 2.5e-3}; // gangsa, saron, bonang, gong
  // a bar's or a kettle's own stiffness: ∝ f^(−1/2); the gongs hang in sizes, each with a beater to match: ∝ 1/f
  const double size = family == gong ? 261.6256 / f : std::sqrt(261.6256 / f);
  return AT_C4[std::clamp(family, 0, 3)] * softness * std::pow(std::max(v, 0.02), -0.2) * size;
}

double ringTime(int family, double t60C4, double f) {
  static constexpr double FACTOR[] = {1.0, 0.8, 0.5, 1.5};
  return std::min(60.0, t60C4 * FACTOR[std::clamp(family, 0, 3)] * std::sqrt(261.6256 / f));
}

KeyDesign keyDesign(int key, const double *P, double v, double f1) {
  KeyDesign d;
  d.reg = registerOf(key, (int)P[p::instrument]);
  d.f1 = f1;
  const int fam = d.reg.family;
  d.pairs = fam != gong;
  d.tau = contactTime(fam, P[p::mallet], f1, v);
  const double sigma1 = std::log(1000.0) / ringTime(fam, P[p::t60], f1), roll = P[p::rolloff];
  const double fmax = 18000;
  auto add = [&](double f, double amp, double out, int kind, int order) {
    if (d.count >= kModes || f > fmax) return;
    const double sigma = sigma1 * std::pow(f / f1, roll);
    d.m[d.count++] = {f, sigma, amp * pulseSpectrum(f, d.tau), out, kind, order};
  };
  if (fam == gangsa || fam == saron) {
    const Bar bar = d.bar = barFor(fam, f1, P[p::thick]);
    double b[kBend];
    const int nb = timoshenkoRoots(bar.h / bar.L, kBend, b);
    const double u = 0.5 + 0.5 * std::clamp(P[p::along], 0.0, 1.0); // from the end
    const double y = std::clamp(P[p::across], 0.0, 1.0);           // off the centre line, × half-width
    for (int n = 0; n < nb; n++) add(f1 * b[n] / b[0], bendShape(n, u) / 2, 1, bend, n + 1);
    // torsion: rotation × the strike's offset, over the section's inertia (its displacement at the
    // strike against a bending mode's, ±1 at the ends), radiating poorly (a twisting bar's two
    // edges move in opposite directions)
    const double tw = (3 * y * bar.w * bar.w) / (bar.w * bar.w + bar.h * bar.h);
    for (int n = 1; n <= kTors; n++) add(torsionFreq(bar.L, bar.w, bar.h, n), tw * std::cos(n * pi * u), 0.3, torsion, n);
    // by frequency, the note first
    std::sort(d.m.begin() + 1, d.m.begin() + d.count, [](const Mode &a, const Mode &b) { return a.f < b.f; });
    if (fam == gangsa && P[p::tubes] > 0) {
      d.hasTube = true;
      d.tube = tubeFor(bar, f1 * std::pow(2.0, P[p::tubeTune] / 1200));
      d.tubeK = 0.003 * P[p::tubes] * TAU * f1; // the coupling through the air between them
      d.tubeOut = 2.5;                          // the tube's open end, a monopole, against the bar's edges
    }
    d.m[0].out = 0.5; // a bar radiates its note poorly: the air slips round its edges
  } else {
    const bool big = fam == gong;
    const GongMode *T = big ? GONG : BONANG;
    const int N = big ? kGongModes : kBonangModes;
    const double s = std::clamp(P[p::gongStrike], 0.0, 1.0);
    for (int i = 0; i < N; i++) {
      double ratio = T[i].ratio;
      if (big && i == kGongRound2) ratio = 2 - P[p::gongBeat] / kGongF1; // the smith's ombak
      double amp;
      if (T[i].kind == round) amp = i == 0 ? 1 - 0.4 * s * s : 0.4 + 0.3 * s;
      else if (T[i].kind == rim) amp = 0.04;
      else amp = 0.03 + 0.9 * std::pow(s, T[i].m) / std::sqrt((double)T[i].m); // J_m(kr) ∝ r^m near the boss
      add(f1 * ratio, amp, T[i].kind == rim ? 0.3 : 1, T[i].kind, T[i].m);
    }
    // the round modes, in the table's order: the note first, its partner where the table has it
    d.round2 = -1;
    for (int i = 1; i < d.count; i++) if (d.m[i].kind == round) { d.round2 = i; break; }
    d.G = kCurve * P[p::curvature];
    d.Gamma = kHarden + d.G * d.G;
    if (d.round2 < 0) d.G = 0;
  }
  return d;
}

} // namespace forte::gamelan
