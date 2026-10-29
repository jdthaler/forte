// tess-model.cpp — a planet crossing its star, as TESS sees it (tess-model.h).

#include "tess-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "tess-params.h"

namespace forte::tess {

constexpr double PI = std::numbers::pi;

// Claret (2017), PHOENIX models by the r method, in TESS's band, for TOI-540, WASP-156, HAT-P-42 and
// WASP-62 (Patel & Espinoza 2022, Tables 3 and 4).
constexpr struct { double teff, u1, u2; } LIMB[] = {{3216, 0.12, 0.53}, {4910, 0.43, 0.21}, {5743, 0.34, 0.24}, {6230, 0.31, 0.25}};

LimbDarkening limbDarkening(double teff) {
  constexpr int n = sizeof LIMB / sizeof LIMB[0];
  if (teff <= LIMB[0].teff) return {LIMB[0].u1, LIMB[0].u2};
  if (teff >= LIMB[n - 1].teff) return {LIMB[n - 1].u1, LIMB[n - 1].u2};
  int i = 0;
  while (teff > LIMB[i + 1].teff) i++;
  const double t = (teff - LIMB[i].teff) / (LIMB[i + 1].teff - LIMB[i].teff);
  return {LIMB[i].u1 + t * (LIMB[i + 1].u1 - LIMB[i].u1), LIMB[i].u2 + t * (LIMB[i + 1].u2 - LIMB[i].u2)};
}

double intensity(double r, LimbDarkening ld) {
  if (r >= 1) return 0;
  const double m = 1 - std::sqrt(1 - r * r);
  return 1 - ld.u1 * m - ld.u2 * m * m;
}

double discFlux(LimbDarkening ld) { return PI * (1 - ld.u1 / 3 - ld.u2 / 6); }

// ∫ g(r) dr from a to b with r = c − h cos t, which tames the square-root ends (the circles'
// tangencies and the limb): the midpoint rule in t.
template <class G> static double ringIntegral(double a, double b, G g, int m = 48) {
  if (!(b > a)) return 0;
  const double c = (a + b) / 2, h = (b - a) / 2, dt = PI / m;
  double s = 0;
  for (int i = 0; i < m; i++) {
    const double t = (i + 0.5) * dt;
    s += g(c - h * std::cos(t)) * std::sin(t);
  }
  return s * h * dt;
}

double blocked(double z, double k, LimbDarkening ld) {
  z = std::fabs(z);
  if (k <= 0 || z >= 1 + k) return 0;
  const double r0 = std::max(0.0, z - k), r1 = std::min(1.0, z + k);
  // rings wholly inside the planet's disc (when it covers the star's centre), then the rings it crosses
  const double inner = std::clamp(k - z, r0, r1);
  double s = ringIntegral(r0, inner, [&](double r) { return 2 * PI * r * intensity(r, ld); });
  s += ringIntegral(inner, r1, [&](double r) {
    if (z == 0) return r < k ? 2 * PI * r * intensity(r, ld) : 0.0;
    const double c = std::clamp((r * r + z * z - k * k) / (2 * r * z), -1.0, 1.0);
    return 2 * r * std::acos(c) * intensity(r, ld); // the arc of the ring inside the planet: 2 r acos(…)
  });
  return s / discFlux(ld);
}

void Occultation::build(double kk, LimbDarkening l) {
  k = kk; ld = l;
  table.resize(kPoints + 1);
  dz = (1 + k) / kPoints;
  for (int i = 0; i <= kPoints; i++) table[i] = blocked(i * dz, k, ld);
}

double Occultation::at(double z) const {
  const double x = std::fabs(z) / dz;
  if (!(x < kPoints)) return 0;
  const int i = (int)x;
  const double f = x - i;
  return table[i] + f * (table[i + 1] - table[i]);
}

Orbit orbitOf(int key, const double *P) {
  Orbit o;
  o.freq = keyFreq(key) * tuningOf(P).ratio(key);
  o.speedup = P[p::periodA4] * DAY * SPEEDUP_REF;
  o.period = o.speedup / o.freq;
  const double Rs = P[p::starRadius] * R_SUN;
  o.k = P[p::planetRadius] * R_EARTH / Rs;
  // Kepler's third law (the planet's mass neglected), but never inside the star
  const double a = std::cbrt(GM_SUN * P[p::starMass] * o.period * o.period / (4 * PI * PI));
  o.aR = std::max(a / Rs, 1.0001 * (1 + o.k));
  o.b = std::min(P[p::impact] * (1 + o.k), o.aR);
  o.cosi = o.b / o.aR;
  o.ld = limbDarkening(P[p::teff]);
  // contacts: z² = aR² (cos²i + sin²θ sin²i) = (1 + k)²
  const double si2 = 1 - o.cosi * o.cosi, s2 = si2 > 0 ? ((1 + o.k) * (1 + o.k) / (o.aR * o.aR) - o.cosi * o.cosi) / si2 : -1;
  o.phiT = s2 <= 0 ? 0 : s2 >= 1 ? 0.25 : std::asin(std::sqrt(s2)) / (2 * PI);
  o.depth = o.phiT > 0 ? blocked(o.b, o.k, o.ld) : 0;
  return o;
}

double separation(const Orbit &o, double phase) {
  const double th = 2 * PI * phase, c = std::cos(th), s = std::sin(th);
  if (c <= 0) return 1e9; // behind the star
  return o.aR * std::sqrt(s * s + o.cosi * o.cosi * c * c);
}

void harmonics(const Orbit &o, const Occultation &occ, int H, double *c) {
  for (int n = 0; n <= H; n++) c[n] = 0;
  if (o.phiT <= 0) return;
  // c_n = 2 ∫₀^φT δ(φ) cos 2πnφ dφ (the dip is even about mid-transit; zero outside it), by the
  // trapezoid rule on J points, the cosines by Chebyshev's recurrence
  const int J = std::clamp((int)std::ceil(16 * H * o.phiT) + 256, 256, 2048);
  const double h = o.phiT / J;
  for (int j = 0; j <= J; j++) {
    const double phi = j * h, d = occ.at(separation(o, phi));
    if (d == 0) continue;
    const double w = 2 * h * d * (j == 0 || j == J ? 0.5 : 1), x = std::cos(2 * PI * phi);
    double t0 = 1, t1 = x;
    c[0] += w;
    for (int n = 1; n <= H; n++) {
      c[n] += w * t1;
      const double t2 = 2 * x * t1 - t0;
      t0 = t1; t1 = t2;
    }
  }
}

double photons(double T) { return ZERO_POINT * AREA * std::pow(10.0, -0.4 * T); }

double noise(double T, double dt) {
  const double g = photons(T);
  const double background = APERTURE * (READ_NOISE * READ_NOISE + ZODIACAL) / EXPOSURE; // e⁻² per second
  const double var = (g + background) / (g * g * dt) + NOISE_FLOOR * NOISE_FLOOR * 3600 / dt;
  return std::sqrt(var);
}

double Rng::uniform() {
  uint32_t t = (s += 0x6D2B79F5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return ((t ^ (t >> 14)) >> 8) / 16777216.0;
}
double Rng::gauss() { return (uniform() + uniform() + uniform() + uniform() - 2) * std::sqrt(3.0); }

} // namespace forte::tess
