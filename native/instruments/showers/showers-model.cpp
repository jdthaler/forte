// showers-model.cpp — the Collider Showers' physics (showers-model.h).

#include "showers-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "showers-params.h"

namespace forte::showers {

constexpr double PI = std::numbers::pi;
constexpr double X0_CM = 7.39 / 8.30;   // lead tungstate's radiation length (g cm⁻² over g cm⁻³)
constexpr double RM_CM = 16.26 / 8.30;  // and its Molière radius

double Deposit::total() const {
  double s = 0;
  for (double v : q) s += v;
  return s / NZ;
}

double Rng::uniform() {
  uint32_t t = (s += 0x6d2b79f5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}
double Rng::exponential(double mean) { return -mean * std::log(1 - uniform()); }
double Rng::gamma(double shape) {
  if (shape < 1) return gamma(shape + 1) * std::pow(std::max(uniform(), 1e-300), 1 / shape);
  const double d = shape - 1.0 / 3, c = 1 / std::sqrt(9 * d);
  for (;;) {
    double x, v;
    do {
      const double u1 = std::max(uniform(), 1e-300), u2 = uniform();
      x = std::sqrt(-2 * std::log(u1)) * std::cos(2 * PI * u2); // a normal deviate (Box–Muller)
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const double u = uniform();
    if (u < 1 - 0.0331 * x * x * x * x || std::log(std::max(u, 1e-300)) < 0.5 * x * x + d * (1 - v + std::log(v))) return d * v;
  }
}
double Rng::beta(double mean, double sd) {
  const double m = std::clamp(mean, 0.02, 0.98), k = std::max(1.0, (m * (1 - m)) / (sd * sd) - 1);
  const double x = gamma(m * k), y = gamma((1 - m) * k);
  return x / (x + y);
}

double emTmax(double E, double C) { return std::max(0.0, std::log((E * 1000) / EC_MEV) + C); }
double emProfile(double t, double tmax) {
  if (t <= 0) return 0;
  const double a = 1 + B_EM * tmax;
  return B_EM * std::exp((a - 1) * std::log(B_EM * t) - B_EM * t - std::lgamma(a));
}

// The regularised lower incomplete gamma P(a, x): its series below a + 1, its continued fraction
// above (Numerical Recipes' gser and gcf).
double gammaShare(double a, double b, double t) {
  const double x = b * t;
  if (x <= 0) return 0;
  const double lg = std::lgamma(a);
  if (x < a + 1) {
    double ap = a, sum = 1 / a, del = sum;
    for (int i = 0; i < 300; i++) {
      ap += 1; del *= x / ap; sum += del;
      if (std::fabs(del) < std::fabs(sum) * 1e-14) break;
    }
    return std::min(1.0, sum * std::exp(-x + a * std::log(x) - lg));
  }
  double bb = x + 1 - a, c = 1e300, d = 1 / bb, h = d;
  for (int i = 1; i < 300; i++) {
    const double an = -i * (i - a);
    bb += 2;
    d = an * d + bb; if (std::fabs(d) < 1e-300) d = 1e-300;
    c = bb + an / c; if (std::fabs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const double del = d * c;
    h *= del;
    if (std::fabs(del - 1) < 1e-14) break;
  }
  return std::max(0.0, 1 - std::exp(-x + a * std::log(x) - lg) * h);
}

double meanFem(double E) { return E > FEM_E0 ? 1 - std::pow(E / FEM_E0, FEM_M - 1) : 0; }

void addGamma(Deposit &d, double share, double a, double b, double t0, double T) {
  if (share <= 0 || t0 >= T) return;
  // each slice holds the profile's integral over it, exactly
  double prev = 0;
  const int i0 = std::max(0, (int)std::floor((t0 / T) * NZ));
  for (int i = i0; i < NZ; i++) {
    const double hi = ((i + 1.0) / NZ) * T, F = gammaShare(a, b, hi - t0);
    d.q[i] += share * NZ * (F - prev);
    prev = F;
    if (F > 1 - 1e-12) break;
  }
}

void addTrack(Deposit &d, double share, double t0, double t1, double T) {
  t1 = std::min(t1, T);
  if (share <= 0 || t1 <= t0) return;
  const double per = share / (t1 - t0); // per X0
  for (int i = 0; i < NZ; i++) {
    const double lo = (i * T) / NZ, hi = ((i + 1) * T) / NZ, o = std::min(hi, t1) - std::max(lo, t0);
    if (o > 0) d.q[i] += per * o * NZ;
  }
}

// A photon of E GeV entering at depth t (X0): it converts after a Bethe–Heitler mean free path
// (9/7 X0) on average, and its pair showers from there. Its profile's maximum, from the conversion,
// is put BH earlier than PDG's photon profile's, so that the average is PDG's.
static void photonFrom(Deposit &d, double share, double E, double t, double T, Rng &rng) {
  const double s = t + rng.exponential(BH);
  addGamma(d, share, 1 + B_EM * std::max(0.0, emTmax(E, C_G) - BH), B_EM, s, T);
}

void shower(Deposit &d, Particle kind, double E, double T, Rng &rng) {
  d.q.fill(0);
  d.start = 0;
  E = std::max(E, 1e-3);
  if (kind == electron) {
    addGamma(d, 1, 1 + B_EM * emTmax(E, C_E), B_EM, 0, T);
  } else if (kind == photon) {
    const double s = rng.exponential(BH);
    d.start = s;
    addGamma(d, 1, 1 + B_EM * std::max(0.0, emTmax(E, C_G) - BH), B_EM, s, T);
  } else {
    // the trigger keeps a pion whose shower leaves at least TRIGGER of its energy in the crystal
    for (int tries = 0; tries < 50; tries++) {
      pionShower(d, E, T, rng);
      if (d.total() >= TRIGGER) break;
    }
  }
}

void pionShower(Deposit &d, double E, double T, Rng &rng) {
  d.q.fill(0);
  {
    // the first inelastic interaction, somewhere in the crystal
    const double u = rng.uniform(), t1 = -LAMBDA_PI * std::log(1 - u * (1 - std::exp(-T / LAMBDA_PI)));
    d.start = t1;
    const double mip = (MIP_MEV / 1000) / E; // the share a minimum-ionising track leaves per X0
    addTrack(d, mip * t1, 0, t1, T);
    // its π⁰s' photons, two to four of them, sharing the electromagnetic fraction at random
    const double fem = rng.beta(meanFem(E), FEM_SPREAD);
    const int n = 2 + (int)std::floor(3 * rng.uniform());
    double w[4], sum = 0;
    for (int k = 0; k < n; k++) sum += (w[k] = rng.exponential(1));
    for (int k = 0; k < n; k++) photonFrom(d, (fem * w[k]) / sum, (fem * E * w[k]) / sum, t1, T, rng);
    // and the hadrons, which carry the rest deeper, on the interaction length's scale
    const double a = std::max(1.0, HAD_A0 + HAD_A1 * std::log(E));
    addGamma(d, (1 - fem) * (1 - INVISIBLE), a, HAD_D / LAMBDA_I, t1, T);
  }
}

// Gauss–Legendre nodes and weights on [−1, 1], by Newton's method on P_n.
template <int N> struct Legendre {
  double x[N], w[N];
  Legendre() {
    for (int i = 0; i < N; i++) {
      double z = std::cos((PI * (i + 0.75)) / (N + 0.5)), dp = 0;
      for (int it = 0; it < 100; it++) {
        double p0 = 1, p1 = 0;
        for (int k = 1; k <= N; k++) { const double p2 = p1; p1 = p0; p0 = ((2 * k - 1) * z * p1 - (k - 1) * p2) / k; }
        dp = (N * (z * p0 - p1)) / (z * z - 1);
        const double dz = p0 / dp;
        z -= dz;
        if (std::fabs(dz) < 1e-15) break;
      }
      x[i] = z; w[i] = 2 / ((1 - z * z) * dp * dp);
    }
  }
};

Share crystalShare(double x0, double width, int j) {
  static const Legendre<48> gl;
  // in Molière radii, from the shower's centre: the crystal spans x in [lo, hi], y in [−h, h]
  const double h = width / 2, lo = (j - x0) * width - h, hi = lo + width, R2 = R_LAT * R_LAT;
  double e = 0, ex = 0;
  // the density R²/(π (r² + R²)²), integrated over y in closed form, then over x by quadrature
  // (in two halves about the centre, where it peaks, if the crystal straddles it)
  const double cuts[3] = {lo, std::clamp(0.0, lo, hi), hi};
  for (int s = 0; s < 2; s++) {
    const double a = cuts[s], b = cuts[s + 1];
    if (b <= a) continue;
    for (int i = 0; i < 48; i++) {
      const double xm = 0.5 * (a + b) + 0.5 * (b - a) * gl.x[i], ww = 0.5 * (b - a) * gl.w[i];
      const double s2 = xm * xm + R2, sq = std::sqrt(s2);
      const double fy = (R2 / PI) * (h / (s2 * (h * h + s2)) + std::atan(h / sq) / (s2 * sq));
      e += ww * fy;
      ex += ww * fy * xm;
    }
  }
  const double xbar = e > 0 ? ex / e / width - (j - x0) : 0;
  return {e, xbar};
}

double flexShape(int m, double z) {
  const double b = BETA_L[m], x = b * z, sh = std::sinh(b) - std::sin(b);
  const double oms = (std::cos(b) - std::sin(b) - std::exp(-b)) / sh, ops = 2 - oms; // 1 − σ, 1 + σ
  const double s = 1 - oms;
  return 0.5 * (oms * std::exp(x) + ops * std::exp(-x)) + std::cos(x) - s * std::sin(x);
}
double flexCurvature(int m, double z) {
  const double b = BETA_L[m], x = b * z, sh = std::sinh(b) - std::sin(b);
  const double oms = (std::cos(b) - std::sin(b) - std::exp(-b)) / sh, ops = 2 - oms;
  const double s = 1 - oms;
  return b * b * (0.5 * (oms * std::exp(x) + ops * std::exp(-x)) - std::cos(x) + s * std::sin(x));
}

double slenderness(double depth, double width) { return (depth * X0_CM) / (width * RM_CM); }
static double loveG(double slender) { return (POISSON * POISSON * PI * PI) / (6 * slender * slender); }
double longRatio(int n, double slender) {
  const double g = loveG(slender);
  return n * std::sqrt((1 + g) / (1 + g * n * n));
}
int loveModes(double slender) { return (int)std::floor((slender * std::sqrt(6.0)) / PI); }
double flexRatio(int m, double slender) {
  return ((BETA_L[m] * BETA_L[m]) / (PI * std::sqrt(12.0) * slender)) * std::sqrt(1 + loveG(slender));
}

Crystal crystalOf(int key, const double *P, double fmax) {
  Crystal c;
  // the note: equal temperament × the keyboard's tuning (forte/tuning.h; exactly 1 at its defaults)
  c.f1 = keyFreq(key) * tuningOf(P).ratio(key);
  c.slender = slenderness(P[p::depth], P[p::width]);
  const bool piezo = (int)P[p::sensor] == sensor_::piezo;
  const double zp = P[p::piezo], Q = P[p::q];
  for (int n = 1; n <= MAX_LONG; n++) {
    const double r = longRatio(n, c.slender), f = c.f1 * r;
    if ((f > fmax || n > loveModes(c.slender)) && n > 1) break;
    // the strain u_z where the piezo sits, or the back face's acceleration (over ω₁² L)
    const double hear = piezo ? -n * PI * std::sin(n * PI * zp) : -r * r * (n % 2 ? -1 : 1);
    c.modes[c.count++] = {false, n, f, (PI * f) / Q, hear};
    c.nl++;
  }
  for (int m = 0; m < MAX_FLEX; m++) {
    const double f = c.f1 * flexRatio(m, c.slender);
    if (f > fmax) break;
    if (f < 20) continue; // below hearing (and the crystal's mounting holds it there)
    // the strain on the side face toward the next key, −(w/2) y''; an accelerometer on the axis
    // feels no bending
    const double hear = piezo ? -flexCurvature(m, zp) / (2 * c.slender) : 0;
    c.modes[c.count++] = {true, m + 1, f, (PI * f) / Q, hear};
    c.nf++;
  }
  return c;
}

// sin(nπζ) and φ''_m(ζ) at the slices' midpoints, built once.
struct Tables {
  double s[MAX_LONG][NZ], k[MAX_FLEX][NZ];
  Tables() {
    for (int i = 0; i < NZ; i++) {
      const double z = (i + 0.5) / NZ;
      for (int n = 0; n < MAX_LONG; n++) s[n][i] = std::sin((n + 1) * PI * z);
      for (int m = 0; m < MAX_FLEX; m++) k[m][i] = flexCurvature(m, z);
    }
  }
};

Kicks kicksOf(const Deposit &d, double slender) {
  static const Tables t;
  Kicks out;
  for (int n = 0; n < MAX_LONG; n++) {
    double s = 0;
    for (int i = 0; i < NZ; i++) s += d.q[i] * t.s[n][i];
    // the cosine series of −u_eq, whose slope u_eq' is the thermal strain
    out.a[n] = (2 / ((n + 1) * PI)) * (s / NZ);
  }
  for (int m = 0; m < MAX_FLEX; m++) {
    double s = 0;
    for (int i = 0; i < NZ; i++) s += d.q[i] * t.k[m][i];
    // −y_eq on the beam's modes: ∫ y φ = ∫ y'' φ'' / β⁴, and y_eq'' = −12 x̄ (L/w) q per unit length
    const double b4 = BETA_L[m] * BETA_L[m] * BETA_L[m] * BETA_L[m];
    out.b[m] = ((12 * slender) / b4) * (s / NZ);
  }
  return out;
}

} // namespace forte::showers
