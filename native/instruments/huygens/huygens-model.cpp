// huygens-model.cpp — the keys' tuning and the pulse coupling's exact results (huygens-model.h).

#include "huygens-model.h"

#include <cmath>
#include <cstring>

#include "forte/fdlibm.h"

namespace forte::huygens {

// log(1 + f) − f + f²/2 for f in [√2/2 − 1, √2 − 1] (FreeBSD's k_log.h)
static double k_log1p(double f) {
  static const double Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
                      Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
                      Lg7 = 1.479819860511658591e-01;
  const double s = f / (2.0 + f), z = s * s, w = z * z;
  const double t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const double t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  const double R = t2 + t1, hfsq = 0.5 * f * f;
  return s * (hfsq + R);
}

static void words(double x, int32_t &hi, uint32_t &lo) { uint64_t b; std::memcpy(&b, &x, 8); hi = (int32_t)(b >> 32); lo = (uint32_t)b; }
static double fromWords(int32_t hi, uint32_t lo) { const uint64_t b = ((uint64_t)(uint32_t)hi << 32) | lo; double x; std::memcpy(&x, &b, 8); return x; }

double log2(double x) {
  static const double two54 = 1.80143985094819840000e+16, ivln2hi = 1.44269504072144627571e+00, ivln2lo = 1.67517131648865118353e-10;
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
  hx &= 0x000fffff;
  const int32_t i = (hx + 0x95f64) & 0x100000;
  x = fromWords(hx | (i ^ 0x3ff00000), lx); // normalise x or x/2
  k += (i >> 20);
  const double y = k, f = x - 1.0, hfsq = 0.5 * f * f, r = k_log1p(f);
  int32_t hh;
  uint32_t hl;
  double hi = f - hfsq;
  words(hi, hh, hl);
  hi = fromWords(hh, 0);
  const double lo = (f - hi) - hfsq + r;
  double val_hi = hi * ivln2hi, val_lo = (lo + hi) * ivln2lo + lo * ivln2hi;
  const double w = y + val_hi;
  val_lo += (y - w) + val_hi;
  val_hi = w;
  return val_lo + val_hi;
}

// 5-limit just scale above a tonic
static const double JUST[12] = {1, 16.0 / 15, 9.0 / 8, 6.0 / 5, 5.0 / 4, 4.0 / 3, 45.0 / 32, 3.0 / 2, 8.0 / 5, 5.0 / 3, 9.0 / 5, 15.0 / 8};

double keyFreq(double m) { return 440 * fdlibm::pow(2, (m - 69) / 12); }

double keyNoise(int m) {
  uint32_t t = (uint32_t)((uint64_t)(uint32_t)m * 2654435761u);
  t ^= t >> 15;
  t *= 2246822519u;
  t ^= t >> 13;
  return (t / 4294967296.0) * 2 - 1;
}

double tunedFreq(int m, int tuning, int tonic, double mistune) {
  double f;
  if (tuning == 1) {
    const int deg = (((m - tonic) % 12) + 12) % 12;
    f = keyFreq(m - deg) * JUST[deg];
  } else f = keyFreq(m);
  if (mistune > 0) f *= fdlibm::pow(2, (mistune * keyNoise(m)) / 1200);
  return f;
}

double deltaOf(double kick, double vNom, double vStrike, double vExt) {
  if (!(kick > 0)) return 0;
  const double a = vNom - vStrike, K = kick * (vStrike - vExt);
  return fdlibm::log((a + K) / a) / fdlibm::log((vNom - vExt) / a);
}

bool lockRatio(double r, double delta, Lock &out, int maxFirings) {
  const double TB = 1 / r;
  double tA = 1, tB = TB;
  int nA = 0, nB = 0;
  for (int i = 0; i < maxFirings; i++) {
    if (tA <= tB) { // low lamp fires
      nA++;
      if (tB - tA <= delta * TB) { out = {nB + 1, nA}; return true; }
      tA = nA + 1;
    } else {        // high lamp fires
      nB++;
      if (tA - tB <= delta) { out = {nB, nA + 1}; return true; }
      tB = (nB + 1) * TB;
    }
  }
  return false;
}

} // namespace forte::huygens
