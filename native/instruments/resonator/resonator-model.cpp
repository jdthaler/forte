// resonator-model.cpp — the Magnetic Resonator Piano's strings and coils (resonator-model.h).

#include "resonator-model.h"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <utility>

#include "forte/dsp.h"
#include "resonator-params.h"

namespace forte::resonator {

static double clamp(double x, double a, double b) { return x < a ? a : x > b ? b : x; }

// ---- the scale: the Ribbon Piano's smoothed concert-grand layout (piano-model.cpp) -------------

double scaleLength(double m) {
  const double Lf = 0.62 * std::pow(2.0, (-0.88 * (m - 60)) / 12); // ~ f^-0.88 in the treble
  return Lf / std::pow(1 + std::pow(Lf / 2.0, 6), 1.0 / 6);       // foreshortened bass, ≤ 2 m
}

double scaleDiameter(double m) { return 1.065e-3 * std::pow(2.0, (-0.12 * (m - 60)) / 12); }

double windingMass(double m) {
  const double L = scaleLength(m), f = keyFreq(m), d = scaleDiameter(m);
  const double mu = (RHO_STEEL * PI * d * d) / 4;
  const double Tplain = 4 * L * L * f * f * mu;
  const double Ttarget = 735 * (1 + 1.2 * clamp((48 - m) / 27, 0, 1));
  if (Tplain >= 0.85 * Ttarget) return 0;
  return mu * (Ttarget / Tplain - 1);
}

int unisonsOf(int key) { return key < 32 ? 1 : key < 50 ? 2 : 3; }

static double interp(double m, std::initializer_list<std::pair<double, double>> list) {
  const std::pair<double, double> *pts = list.begin();
  const int n = (int)list.size();
  int i = 1;
  while (i < n - 1 && m > pts[i].first) i++;
  const auto [x0, y0] = pts[i - 1];
  const auto [x1, y1] = pts[i];
  return y0 + ((y1 - y0) * (m - x0)) / (x1 - x0);
}

Hammer pianoHammer(double m) {
  const double mass = clamp(interp(m, {{36, 4.9e-3}, {60, 2.97e-3}, {96, 2.2e-3}, {108, 1.9e-3}}), 1.8e-3, 7e-3);
  const double K = std::exp(interp(m, {{36, std::log(4e8)}, {60, std::log(4.5e9)}, {84, std::log(8e10)}, {96, std::log(3e12)}, {108, std::log(8e12)}}));
  const double p = clamp(interp(m, {{36, 2.3}, {60, 2.5}, {96, 3.0}, {108, 3.0}}), 2.1, 3.0);
  return {mass, K, p};
}

// ---- the coil ---------------------------------------------------------------------------------

double coilPlace(int key) { return clamp(interp(key, {{48, 0.2}, {60, 0.25}, {72, 1.0 / 3}}), 0.2, 1.0 / 3); }

double gapScale(int key) { return clamp(interp(key, {{36, 1.8}, {60, 1.2}, {72, 1}}), 1, 1.8); }

double bridgeScale(int key) { return clamp(interp(key, {{36, 0.5}, {60, 1}}), 0.5, 1); }

double coilWeight(int n, double x, double w) {
  const double a = (n * PI * w) / 2;
  return std::sin(n * PI * x) * (a < 1e-9 ? 1 : std::sin(a) / a);
}

// ---- a key's strings ----------------------------------------------------------------------------

Strings strings(int key, const double *P, double fs, int most, double fmax, int maxUni) {
  Strings s;
  key = std::clamp(key, KEY_LO, KEY_HI);
  s.key = key;
  // the note: equal temperament × the keyboard's tuning (forte/tuning.h; exactly 1 at its defaults)
  s.f1 = keyFreq(key) * tuningOf(P).ratio(key);
  s.L = scaleLength(key);
  s.d = scaleDiameter(key);
  s.mu = (RHO_STEEL * PI * s.d * s.d) / 4 + windingMass(key);
  const double k1 = PI / s.L, I = (PI * std::pow(s.d, 4)) / 64;
  s.T = (std::pow(TAU * s.f1, 2) * s.mu) / (k1 * k1) - E_STEEL * I * k1 * k1; // the stiff string's first partial on the note
  s.B = (PI * PI * E_STEEL * I) / (s.T * s.L * s.L);
  s.nuFull = unisonsOf(key);
  s.nu = std::min(s.nuFull, std::max(1, maxUni));
  const double det[MAX_UNI] = {0, 1, -0.75}; // the unisons' spread, in units of the detune
  for (int u = 0; u < s.nu; u++) s.cents[u] = det[u] * P[p::unison] * (s.nu == 2 ? 0.5 : 1);
  if (s.nu == 2) { s.cents[0] = -0.5 * P[p::unison]; s.cents[1] = 0.5 * P[p::unison]; }
  s.xa = clamp(coilPlace(key) * P[p::coil], 0.03, 0.5);
  s.gap = gapScale(key);
  s.damper = key <= 88;
  s.hammer = pianoHammer(key);
  const double losses = P[p::losses];
  s.G = BRIDGE_G * bridgeScale(key) * losses;
  s.sigmaBridge = (s.G * s.T) / s.L;
  const double norm = std::sqrt(2 / (s.mu * s.L)), w = COIL_W / s.L, sG = std::sqrt(s.G);
  const double top = std::min(fmax, 0.45 * fs);
  for (int n = 1; n <= std::min(most, MAX_PARTIALS); n++) {
    const double f = s.partial(n);
    if (f > top && n > 1) break;
    Partial &q = s.p[n - 1];
    for (int u = 0; u < s.nu; u++) q.f[u] = f * std::pow(2.0, s.cents[u] / 1200);
    const double om = TAU * f;
    // the wire's own losses: air at low frequencies, its internal friction rising as f² (the Ribbon Piano's b₁ + b₃ω²)
    q.sigma = losses * (0.1 + 2.5e-9 * om * om);
    q.psiA = norm * coilWeight(n, s.xa, w);
    q.psiH = norm * std::sin(n * PI * s.xh);
    q.beta = (sG * s.T * norm * n * k1 * (n % 2 ? -1 : 1)) / om;
    s.n = n;
  }
  return s;
}

double voicing(int key) { // dB, then as a ratio
  return std::pow(10.0, interp(clamp(key, KEY_LO, KEY_HI), {{21, 10}, {24, 9.4}, {36, 7.5}, {48, 2.5}, {60, 0}, {72, -4.3}, {84, -2.2}, {96, 0.5}, {108, 8.5}}) / 20);
}

Loops loopsOf(int choice) {
  Loops l;
  if (choice <= 7) { l.n = 1; l.h[0] = choice + 1; }
  else if (choice == 8) { l.n = 2; l.h[0] = 1; l.h[1] = 2; }
  else { l.n = 3; l.h[0] = 1; l.h[1] = 2; l.h[2] = 3; }
  return l;
}

void driveHarmonics(int wave, double bright, double *g) {
  const double e = 2 - 1.6 * clamp(bright, 0, 1);
  double sum = 0;
  for (int n = 1; n <= DRIVE_HARMONICS; n++) {
    double a = n == 1 ? 1 : 0;
    if (n > 1 && (wave == wave_::rich || (wave == wave_::odd && n % 2))) a = std::pow((double)n, -e);
    g[n - 1] = a; sum += a * a;
  }
  for (int n = 0; n < DRIVE_HARMONICS; n++) g[n] /= std::sqrt(sum); // the power of a sine of the same peak
}

} // namespace forte::resonator
