// regal-model.cpp — the regal's physics (regal-model.h).

#include "regal-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "regal-tuning.h"

namespace forte::regal {

using cd = std::complex<double>;
constexpr double F_REF = 261.6256;   // C4: where the voicing knobs are quoted
constexpr double F_WEIGHT = 65.406;  // C2: below it the tongues carry a tip weight

double tongueThickness(double f0, double thick) { return thick * 0.45e-3 * std::pow(f0 / F_REF, -0.45); }
double tongueWidth(double f0) { return std::clamp(7e-3 * std::pow(f0 / F_REF, -0.3), 2.5e-3, 16e-3); }

// Rayleigh's one-term length: ω² = k/m = 3EI/L³ / (PSI_MASS ρ b h L), no tip weight.
static double bareLength(double f, double h) {
  const double w = TAU * f;
  return std::pow((BRASS_E * h * h) / (4 * PSI_MASS * BRASS_RHO * w * w), 0.25);
}

double cantileverFreq(double L, double h, double b, double M) {
  // 1 + cos λ cosh λ + μλ (cos λ sinh λ − sin λ cosh λ) = 0, μ = M / (ρ b h L)
  const double mu = M / (BRASS_RHO * b * h * L);
  const auto F = [mu](double l) { return 1 + std::cos(l) * std::cosh(l) + mu * l * (std::cos(l) * std::sinh(l) - std::sin(l) * std::cosh(l)); };
  double lo = 0.3, hi = 1.8752;
  for (int i = 0; i < 200; i++) { const double mid = 0.5 * (lo + hi); (F(lo) * F(mid) <= 0 ? hi : lo) = mid; }
  const double lam = 0.5 * (lo + hi);
  const double I = (b * h * h * h) / 12, A = b * h;
  return (lam * lam / TAU) * std::sqrt((BRASS_E * I) / (BRASS_RHO * A)) / (L * L);
}

double endCorrection(const Tube &t) { return t.n ? 0.61 * std::sqrt(t.area[t.n - 1] / PI) : 0; }

// The resonator for each shape, after the shallot (length ls, bore ds), for a reed sounding f0.
static void resonator(Tube &t, int shape, double f0, double ds, double resLen) {
  const double lam = Air::c / f0, As = PI * ds * ds / 4;
  const auto cone = [&](double l, double d0, double d1, int steps) {
    for (int i = 0; i < steps; i++) { const double d = d0 + (d1 - d0) * (i + 0.5) / steps; t.add(l / steps, PI * d * d / 4); }
  };
  switch (shape) {
    case REGAL: t.add(lam / 16 * resLen, 2.56 * As); break;                       // a cylinder 1.6 × the shallot's bore
    case FUNNEL: cone(lam / 10 * resLen, 1.3 * ds, 4.5 * ds, 6); break; // a short, flaring cone
    case APPLE: {                                                       // a neck, a ball and a cap with holes
      const double D = 4.2 * ds;
      t.add(lam / 40 * resLen, 1.2 * As);
      t.add(0.667 * D * resLen, PI * D * D / 4);                        // the ball, as a cylinder of its volume
      t.add(std::max(3e-3, 0.4 * ds), 0.3 * PI * D * D / 4);           // the cap's holes, 30 % of its area
      break;
    }
    default: break;
  }
}

// Scale the tube past the shallot (all of it, with no resonator) so that its first impedance peak
// sits a quarter of a harmonic below one of the note's harmonics: the voicer cuts each resonator to
// its note. A peak on a harmonic grabs it, and the tongue's pitch jumps from one harmonic's lock to
// the next as it is tuned; a quarter below, the note sits inside one lock, the tongue speaks
// steadily on it and recutting it moves the pitch smoothly.
static void cutToHarmonic(Tube &t, double f0, double off) {
  const int from = t.n > 1 ? 1 : 0;
  for (int it = 0; it < 12; it++) {
    const double fp = firstPeak(t, 0.5 * f0, 40 * f0);
    if (!(fp > 0)) return;
    const double N = std::max(1.0, std::round(fp / f0 - off)) + off, r = fp / (N * f0);
    if (std::fabs(r - 1) < 1e-6) return;
    // the peak moves as the inverse of the whole length (with its end correction)
    const double Ltot = t.total() + endCorrection(t);
    double Lfix = 0;
    for (int i = 0; i < from; i++) Lfix += t.len[i];
    const double sc = (Ltot * r - Lfix) / (Ltot - Lfix);
    for (int i = from; i < t.n; i++) t.len[i] *= sc;
  }
}

void design(double f0, double tune, const Voicing &v, Reed &R, double off) {
  R = Reed{};
  R.f0 = f0;
  R.fNat = f0 / tune;
  const double w = TAU * R.fNat;
  R.h = tongueThickness(f0, v.thick);
  R.b = tongueWidth(f0);
  double L = bareLength(R.fNat, R.h);
  if (R.fNat < F_WEIGHT) L = std::min(L, bareLength(F_WEIGHT, tongueThickness(F_WEIGHT, v.thick)) * std::pow(F_WEIGHT / R.fNat, 0.3));
  R.L = L;
  const double I = (R.b * R.h * R.h * R.h) / 12, mt = BRASS_RHO * R.b * R.h * L;
  R.k = (3 * BRASS_E * I) / (L * L * L);
  R.M = std::max(0.0, R.k / (w * w) - PSI_MASS * mt);
  R.m = PSI_MASS * mt + R.M;
  R.c = (R.m * w) / (v.q * std::pow(f0 / F_REF, 0.75)); // brass loses less, and the air drags less, on a short treble tongue
  const double Lref = bareLength(F_REF, tongueThickness(F_REF, 1));
  R.h0 = v.curve * 1e-3 * (L / Lref);
  R.bs = 0.75 * R.b;
  R.Ls = 0.9 * L;
  R.S = PSI_AREA * R.b * L * 0.8;
  R.Ks = (v.leather ? 150 : 3000) * R.k;
  R.zc = v.leather ? 0.9 : 0.15;
  R.Vb = std::clamp(20e-6 * (F_REF / f0), 0.5e-6, 400e-6);
  R.ds = R.b;
  Tube &t = R.tube;
  t.add(1.2 * L, PI * R.ds * R.ds / 4); // the shallot
  resonator(t, v.shape, f0, R.ds, 1);
  cutToHarmonic(t, f0, off);
  for (int i = t.n > 1 ? 1 : 0; i < t.n; i++) t.len[i] *= v.resLen;
}

double tuneRatio(double f0, int shape) {
  const double n = 69 + 12 * std::log2(f0 / 440) - TUNE_LO;
  const int s = std::clamp(shape, 0, NSHAPES - 1);
  if (n <= 0) return TUNE[s][0];
  if (n >= TUNE_N - 1) return TUNE[s][TUNE_N - 1];
  const int i = (int)n;
  const double t = n - i;
  // between two notes cut with different resonators, the nearer's cut
  if (TUNE_OFF[s][i] != TUNE_OFF[s][i + 1]) return TUNE[s][t < 0.5 ? i : i + 1];
  return TUNE[s][i] * (1 - t) + TUNE[s][i + 1] * t;
}

double tuneOffset(double f0, int shape) {
  const int n = std::clamp((int)std::lround(69 + 12 * std::log2(f0 / 440)) - TUNE_LO, 0, TUNE_N - 1);
  return TUNE_OFF[std::clamp(shape, 0, NSHAPES - 1)][n];
}

double rankFreq(int key, int rank, const Tuning &tuning) {
  // the 4′ breaks back an octave where its reeds would sound past C8 (its top keys with the full range)
  const double oct = rank == 2 && key + 12 > 108 ? 0 : RANK_OCT[rank];
  return keyFreq(key) * tuning.ratio(key) * std::exp2(oct);
}

void designKey(int key, int rank, const Voicing &v, const Tuning &tuning, Reed &out) {
  const double f0 = rankFreq(key, rank, tuning);
  design(f0, tuneRatio(f0, v.shape), v, out, tuneOffset(f0, v.shape));
}

void contact(double q, double h0, double &I, double &dI) {
  const double a = 1.5 * q - h0;
  if (a <= 0) { I = dI = 0; return; }
  const double be = 0.5 * q, c = std::min(1.0, a / be);
  const double c2 = c * c, c5 = c2 * c2 * c, c6 = c5 * c, c7 = c6 * c;
  I = 0.5 * ((3 * a * c5) / 5 - ((a + 3 * be) * c6) / 6 + (be * c7) / 7);
  dI = 0.5 * (0.9 * c5 - 0.5 * c6 + c7 / 14);
}

double gapArea(double q, double h0, double bs, double Ls) {
  const double c0 = h0 - 1.5 * q, c1 = 0.5 * q;
  double lo = 0;
  if (c1 > 0) lo = std::clamp(-c0 / c1, 0.0, 1.0);
  const double lo3 = lo * lo * lo, side = (c0 * (1 - lo3)) / 3 + (c1 * (1 - lo3 * lo)) / 4;
  return bs * std::max(0.0, h0 - q) + 2 * Ls * std::max(0.0, side);
}

cd inputImpedance(const Tube &t, double f, bool lossless) {
  const double w = TAU * f;
  // Z at the open end: the unflanged pipe's radiation (low ka), then back through each segment
  const double aEnd = std::sqrt(t.area[t.n - 1] / PI), ka = (w / Air::c) * aEnd, ZcEnd = (Air::rho * Air::c) / t.area[t.n - 1];
  cd Z = lossless ? cd(0, ZcEnd * std::tan(ka * 0.61)) : ZcEnd * cd(0.25 * ka * ka, 0.61 * ka);
  for (int i = t.n - 1; i >= 0; i--) {
    const double a = std::sqrt(t.area[i] / PI), Zc = (Air::rho * Air::c) / t.area[i];
    const double alpha = lossless ? 0 : (3e-5 * std::sqrt(f)) / a;
    const cd k(w / Air::c, -alpha), j(0, 1), tn = std::tan(k * t.len[i]);
    Z = Zc * (Z + j * Zc * tn) / (Zc + j * Z * tn);
  }
  return Z;
}

// D(f) of the lossless chain closed by p = 0 at the corrected open end: Z_in = B/D, a peak where D = 0.
static double chainD(const Tube &t, double f) {
  const double k = (TAU * f) / Air::c, ec = endCorrection(t);
  double A = 1, B = 0, C = 0, D = 1; // [[A, jB], [jC, D]]
  for (int i = 0; i < t.n; i++) {
    const double l = t.len[i] + (i == t.n - 1 ? ec : 0), Zc = (Air::rho * Air::c) / t.area[i];
    const double cs = std::cos(k * l), sn = std::sin(k * l);
    const double a2 = cs, b2 = Zc * sn, c2 = sn / Zc, d2 = cs;
    const double nA = A * a2 - B * c2, nB = A * b2 + B * d2, nC = C * a2 + D * c2, nD = -C * b2 + D * d2;
    A = nA; B = nB; C = nC; D = nD;
  }
  return D;
}

double firstPeak(const Tube &t, double fLo, double fHi) {
  double f = fLo, d = chainD(t, f);
  while (f < fHi) {
    const double g = f * 1.01, e = chainD(t, g);
    if ((d > 0) != (e > 0)) {
      double lo = f, hi = g, dl = d;
      for (int i = 0; i < 50; i++) { const double mid = 0.5 * (lo + hi), dm = chainD(t, mid); if ((dm > 0) == (dl > 0)) { lo = mid; dl = dm; } else hi = mid; }
      return 0.5 * (lo + hi);
    }
    f = g; d = e;
  }
  return 0;
}

double bellowsPressure(double P0, double fill) {
  const double th = std::asin(std::clamp(fill, 0.0, 1.0) * std::sin(THETA_MAX));
  return (P0 * std::cos(th)) / std::cos(THETA_MAX);
}

} // namespace forte::regal
