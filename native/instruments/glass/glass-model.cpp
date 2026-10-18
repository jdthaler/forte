// glass-model.cpp — the armonica's physics (glass-model.h).

#include "glass-model.h"

#include <algorithm>
#include <cstdint>
#include <limits>

#include "forte/dsp.h"

namespace forte::glass {

constexpr double PI = std::numbers::pi;
constexpr double INCH = 0.0254;

// Simpson's rule on [a, b] with m (even) intervals.
template <class F>
static double simpson(F f, double a, double b, int m = 96) {
  const double h = (b - a) / m;
  double s = f(a) + f(b);
  for (int i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

// Rayleigh's integrals, written in t = tan(θ/2) (dθ = 2 dt/(1+t²)), so they are smooth rational
// integrands on [0, t_max]; t_max = 1 at the rim of a hemisphere.
//   I₁ = ¼ [1/(2n−2) + 1/n + 1/(2n+2)]                              (closed form)
//   I₂ = ∫ 4t²ⁿ⁺¹ [8t² + ((n+1) + (n−1)t²)²] / (1+t²)⁴ dt
//   I₃ = ∫ sin³θ t²ⁿ dθ = ∫ 16 t²ⁿ⁺³ / (1+t²)⁴ dt                    (Coriolis)
//   J(θ_d) = ∫ sin⁵θ t²ⁿ dθ = ∫ 64 t²ⁿ⁺⁵ / (1+t²)⁶ dt               (liquid, to depth θ_d)
Rayleigh rayleighOf(int n) {
  const double I1 = 0.25 * (1.0 / (2 * n - 2) + 1.0 / n + 1.0 / (2 * n + 2));
  const double I2 = simpson([n](double t) {
    const double q = (n + 1) + (n - 1) * t * t;
    return (4 * std::pow(t, 2 * n + 1) * (8 * t * t + q * q)) / std::pow(1 + t * t, 4);
  }, 0, 1);
  const double I3 = simpson([n](double t) { return (16 * std::pow(t, 2 * n + 3)) / std::pow(1 + t * t, 4); }, 0, 1);
  const double nu = GLASS.nu, n2 = (double)n * n;
  return {I1, I2, I3,
          std::sqrt((n2 * (n2 - 1) * (n2 - 1) * I1) / (3 * (1 + nu) * I2)), // ω = λ (h/a²) √(E/ρ)
          (2 * I3) / I2};
}
const Rayleigh &rayleigh(int n) {
  static const std::array<Rayleigh, N_MAX + 1> table = [] {
    std::array<Rayleigh, N_MAX + 1> t{};
    for (int k = 2; k <= N_MAX; k++) t[k] = rayleighOf(k);
    return t;
  }();
  return table[std::max(2, std::min(N_MAX, n))];
}

void rayleighField(int n, double th, double ph, double out[3]) {
  const double t = std::pow(std::tan(th / 2), n);
  out[0] = std::sin(th) * t * std::cos(n * ph);
  out[1] = std::sin(th) * t * std::sin(n * ph);
  out[2] = -(n + std::cos(th)) * t * std::cos(n * ph);
}

double liquidJ(int n, double thetaD) {
  if (thetaD <= 0) return 0;
  return simpson([n](double t) { return (64 * std::pow(t, 2 * n + 5)) / std::pow(1 + t * t, 6); }, 0, std::tan(std::min(thetaD, PI / 2) / 2), 64);
}

// Bowl size (Franklin to Beccaria, 1762): 9 in across for G3 to 3 in for G6, linear in key, and
// so on down past F3. Above A6 the line would reach zero at key 109: there the bowls shrink as
// Franklin's do over his three octaves overall, a third of the size for an eighth of the pitch
// (D ∝ f^−0.528), from A6's 2.67 in to 1.69 in at C8.
double bowlRadius(double key) {
  if (key <= KEY_HI) return 0.5 * INCH * (9 - (6 * (key - 55)) / 36);
  static const double top = 0.5 * INCH * (9 - (6 * (KEY_HI - 55)) / 36.0), slope = std::log(3.0) / std::log(8.0);
  return top * std::pow(2.0, (-slope * (key - KEY_HI)) / 12);
}

// Wall thickness that puts the (empty, perfect) n = 2 mode on the key's pitch.
double bowlThickness(double key) {
  const double a = bowlRadius(key), f = keyFreq(key);
  return (2 * PI * f * a * a) / (rayleigh(2).lambda * std::sqrt(GLASS.E / GLASS.rho));
}

// Radiation efficiency of the order-n harmonic of a sphere, ε_n = 1/(ka |h_n′(ka)|).
double radiationEff(int n, double ka) {
  // spherical Bessel j, y by upward recurrence (y dominates |h| at small ka)
  const double j0 = std::sin(ka) / ka, y0 = -std::cos(ka) / ka;
  const double j1 = j0 / ka - std::cos(ka) / ka, y1 = y0 / ka - std::sin(ka) / ka;
  double jm = j0, ym = y0, jn = j1, yn = y1;
  for (int l = 1; l < n; l++) {
    const double jp = ((2 * l + 1) / ka) * jn - jm, yp = ((2 * l + 1) / ka) * yn - ym;
    jm = jn; ym = yn; jn = jp; yn = yp;
  }
  // h_n′ = h_{n−1} − (n+1)/x h_n
  const double dj = jm - ((n + 1) / ka) * jn, dy = ym - ((n + 1) / ka) * yn;
  return 1 / (ka * std::hypot(dj, dy));
}

// Deterministic per-key pseudo-random number in [−1, 1] (bowls are individuals).
double keyNoise(int m, int salt) {
  uint32_t t = (uint32_t)(int64_t)((m + 977.0 * salt) * 2654435761.0); // JavaScript's >>> 0 of an exact product
  t ^= t >> 15; t = t * 2246822519u; t ^= t >> 13;
  return (t / 4294967296.0) * 2 - 1;
}

// Liquid loading (French 1983; Jundt et al. 2006): added kinetic energy over the glass's,
//   Λ_n = (ρ_l a / ρ_g h) · n J_n(θ_d) / I₂,  fill depth d = a(1 − cos θ_d).
double waterLoad(int n, double a, double h, double fill) {
  if (!(fill > 0)) return 0;
  const double thetaD = std::acos(1 - std::min(1.0, fill));
  return ((RHO_WATER * a) / (GLASS.rho * h)) * n * liquidJ(n, thetaD) / rayleigh(n).I2;
}

Bowl bowl(int key, const BowlParams &P) {
  Bowl b;
  const double a = bowlRadius(key), h = bowlThickness(key), f0 = keyFreq(key);
  const double cE = std::sqrt(GLASS.E / GLASS.rho);
  b.key = key; b.a = a; b.h = h; b.f0 = f0; b.mass = 2 * PI * a * a * h * GLASS.rho;
  for (int n = 2; n <= N_MAX; n++) {
    const Rayleigh &r = rayleigh(n);
    const double fEmpty = (r.lambda * (h / (a * a)) * cE) / (2 * PI);
    const double load = waterLoad(n, a, h, P.water);
    const double f = fEmpty / std::sqrt(1 + load);
    if (f > 16000 && n > 2) break;
    // The irregularity is a mass irregularity (uneven wall), so liquid, which loads every part
    // of the wall equally, dilutes it.
    const double split = (P.split / 1200) * std::numbers::ln2 * (n == 2 ? 1 : 0.6 + 0.4 * std::fabs(keyNoise(key, n))) / (1 + load);
    const double M = PI * GLASS.rho * h * a * a * r.I2 * (1 + load);
    Mode &m = b.modes[b.count++];
    m.n = n; m.f = f; m.fEmpty = fEmpty; m.load = load;
    m.f1 = f * (1 - split / 2); m.f2 = f * (1 + split / 2);
    m.sigma = PI * f * P.loss + 0.15;
    m.M = M; m.bryan = r.bryan;
    m.rad = radiationEff(n, (2 * PI * f * a) / C_AIR);
    m.psi = (PI / (2 * n)) * keyNoise(key, 10 + n);
  }
  return b;
}

// The lab-frame lines of a free rotating bowl: λ² = ω̄² + 2g² ± √((ω₁² − ω₂²)²/4 + 4g²ω̄² + 4g⁴),
// each heard as λ ∓ nΩ in the proportion |1 ∓ r|.
void freeLines(const Mode &m, double rot, Line out[4]) {
  const double W = 2 * PI * rot, g = m.n * m.bryan * W, w1 = 2 * PI * m.f1, w2 = 2 * PI * m.f2;
  const double dd = w1 * w1 - w2 * w2;
  const double wb2 = 0.5 * (w1 * w1 + w2 * w2), d = std::sqrt(0.25 * (dd * dd) + 4 * g * g * wb2 + 4 * std::pow(g, 4));
  const double lams[2] = {std::sqrt(wb2 + 2 * g * g - d), std::sqrt(wb2 + 2 * g * g + d)};
  for (int i = 0; i < 2; i++) {
    const double lam = lams[i];
    const double r = g > 0 ? (w1 * w1 - lam * lam) / (2 * g * lam) : std::numeric_limits<double>::infinity();
    const double wp = std::isfinite(r) ? std::fabs(1 + r) / (std::fabs(1 + r) + std::fabs(1 - r)) : 0.5;
    out[2 * i] = {(lam - m.n * W) / (2 * PI), 1 - wp};
    out[2 * i + 1] = {(lam + m.n * W) / (2 * PI), wp};
  }
}

// Wet skin grabs (Δμ large, falling steeply); dry skin barely weakens with speed, but its ridges
// catch: the friction noise grows up to 6× when quite dry.
Friction friction(double wet, double v0, double rough) {
  const double w = std::min(1.0, std::max(0.0, wet)), dry = std::min(1.0, std::max(0.0, (0.6 - w) / 0.6));
  return {0.3 + 0.1 * w, 0.03 + 0.8 * w * w, v0, 0.02, rough * (1 + 5 * dry)};
}

// Speaking threshold: onset at σ_neg = σ + γ²/σ_C, σ_neg = Re[g/(1 − g Y_p(ω))]/(2M),
// g = N·(−μ′(V)), Y_p = 1/(c + i(ωm − k/ω)); bisection on N.
double speakingThreshold(int key, const TouchParams &T, const Bowl &b) {
  const Mode &m = b.modes[0];
  const Friction fr = friction(T.wet, T.v0, T.rough);
  const double sl = frictionSlope(rimSpeed(key, T.speed), fr);
  if (!(sl > 0)) return std::numeric_limits<double>::infinity();
  const double w = 2 * PI * m.f, yr = SKIN.c, yi = w * SKIN.m - SKIN.k / w, y2 = yr * yr + yi * yi;
  const double Yr = yr / y2, Yi = -yi / y2; // Y_p = 1/(yr + i yi)
  const double gam = transport(m, T.speed);
  auto excess = [&](double N) { // σ_neg − σ − γ²/σ_C at normal force N
    const double g = N * sl, dr = 1 - g * Yr, di = -g * Yi, sC = m.sigma + (pulpDamping(N) * m.n * m.n) / (2 * m.M);
    return (g * dr) / (dr * dr + di * di) / (2 * m.M) - m.sigma - (gam * gam) / sC;
  };
  double lo = 0, hi = 1;
  while (excess(hi) < 0 && hi < 1e4) hi *= 2;
  if (excess(hi) < 0) return std::numeric_limits<double>::infinity();
  for (int i = 0; i < 60; i++) { const double mid = 0.5 * (lo + hi); if (excess(mid) < 0) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

// The reference a technician regulates to.
static constexpr BowlParams REF_BOWL = {0, 4e-4, 0};
static constexpr TouchParams REF_TOUCH = {0.85, 0.5, 0, 0.5};

double regulation(int key) {
  static const std::array<double, NK> table = [] {
    std::array<double, NK> t{};
    for (int k = KEY_MIN; k <= KEY_MAX; k++) t[k - KEY_MIN] = speakingThreshold(k, REF_TOUCH, bowl(k, REF_BOWL));
    return t;
  }();
  if (key >= KEY_MIN && key <= KEY_MAX) return table[key - KEY_MIN];
  return speakingThreshold(key, REF_TOUCH, bowl(key, REF_BOWL));
}

} // namespace forte::glass
