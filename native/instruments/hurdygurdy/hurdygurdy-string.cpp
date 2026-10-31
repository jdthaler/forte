// hurdygurdy-string.cpp — a string on the wheel (hurdygurdy-string.h).

#include "hurdygurdy-string.h"

#include <algorithm>
#include <cmath>

namespace forte::hurdygurdy {

namespace {
// Catmull–Rom read of the value written d samples before index w (d ≥ 1), as bowed-string.cpp's
inline double tap(const double *buf, int m, int w, double d) {
  const int i = (int)d;
  const double f = d - i;
  const int p = w - i;
  const double x0 = buf[(p + 1) & m], x1 = buf[p & m], x2 = buf[(p - 1) & m], x3 = buf[(p - 2) & m];
  const double c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * f + c2) * f + c1) * f + x1;
}
int ringSize(double fs, double fLow) { return 1 << (int)std::ceil(std::log2(fs / fLow + 16)); }
} // namespace

HurdyString::HurdyString(double fsBase, int os, double fLow)
    : os(os), fs(fsBase * os), fsBase(fsBase), mask(ringSize(fsBase * os, fLow) - 1), fb(mask + 1), nl(mask + 1),
      rng((uint32_t)((uint64_t)(fLow * 1000) * 2654435761u)) {
  setOversample(os);
}

void HurdyString::setOversample(int n) {
  os = n; fs = fsBase * n;
  bowed::setFilter(aa[0], Biquad::lp, 0.38 * fsBase, 0.5412, fs);
  bowed::setFilter(aa[1], Biquad::lp, 0.38 * fsBase, 1.3066, fs);
  ga = 1 - fdlibm::exp((-2 * PI * 2000) / fs); gs = std::sqrt((3 * (2 - ga)) / ga); // unit-rms grain
  ftau = 0;
}

// A new length takes effect at once: the far side's delay and both loss filters change, and the
// waves already on the string carry on (a tangent landing).
void HurdyString::design(const StringDesign &s, const Loop &l) {
  S = s; L = l;
  Z = s.Z0;
  Dfb = std::max(1.0, 2 * L.Db - 1); Dnl = std::max(1.0, 2 * L.Dn - 1);
  gb = L.gb * (1 - L.pb); pb = L.pb;
  gn = L.gn * (1 - L.pn); pn = L.pn;
  T0 = L.N0;
}

void HurdyString::clear() {
  std::fill(fb.begin(), fb.end(), 0.0); std::fill(nl.begin(), nl.end(), 0.0);
  ob = 0; lb = 0; ln = 0; v = 0; F = 0; damp = dampT; st.s = -1; st.u = 0; nSlip = 0; e = 0;
  for (auto &b : aa) b.reset();
}

// The wheel: incoming waves, friction, outgoing waves.
void HurdyString::bow(double vB, double FN, const bowed::Friction &Fr) {
  const int m = mask;
  lb = gb * tap(fb.data(), m, w, Dfb) + pb * lb;
  damp += 0.004 * (dampT - damp);
  ln = gn * damp * tap(nl.data(), m, wn, Dnl) + pn * ln;
  const double bin = lb, nin = -ln, vh = bin + nin, Y = 1 / (2 * Z);
  double f = 0;
  if (FN > 0) {
    const int was = st.s;
    if (Fr.grain > 0) { // the grip is not uniform: band-limited noise on μ (≈ 2 kHz)
      rng = rng * 1664525u + 1013904223u;
      grain += ga * (rng / 2147483648.0 - 1 - grain);
      FN *= 1 + Fr.grain * gs * grain;
    }
    if (Fr.tau > 0) {
      if (Fr.tau != ftau) { ftau = Fr.tau; fa = 1 - fdlibm::exp(-1 / (fs * Fr.tau)); }
      f = bowed::frictionForceMem(vh, vB, FN, Y, Fr, st, fa);
    } else f = bowed::frictionForce(vh, vB, FN, Y, Fr, st);
    if (was != 0 && st.s == 0) stuck = t;
    else if (was == 0 && st.s != 0 && (double)(t - stuck) > 0.03 * T0) nSlip++; // (a stick of ≥ 3 % of a period)
  } else st.s = vh > vB ? 1 : -1;
  const double yf = Y * f;
  ob = nin + yf;
  wn = (wn + 1) & m;
  nl[wn] = bin + yf;
  v = vh + yf; F = f;
  e += lb * lb + ln * ln; // (the waves arriving: a string stuck on a stopped wheel still rings either side of it)
  t++;
}

} // namespace forte::hurdygurdy
