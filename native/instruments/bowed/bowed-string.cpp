// bowed-string.cpp — the bowed string (bowed-string.h).

#include "bowed-string.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace forte::bowed {

namespace {
constexpr double PI = std::numbers::pi;
// Catmull–Rom read of the value written d samples before index w (d ≥ 1)
inline double tap(const double *buf, int m, int w, double d) {
  const int i = (int)d;
  const double f = d - i;
  const int p = w - i;
  const double x0 = buf[(p + 1) & m], x1 = buf[p & m], x2 = buf[(p - 1) & m], x3 = buf[(p - 2) & m];
  const double c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * f + c2) * f + c1) * f + x1;
}
// the same read with its weights worked out beforehand (BowedString::frac)
template <class F> inline double read(const double *buf, int m, int w, const F &k) {
  const int p = w - k.i;
  return k.w0 * buf[(p + 1) & m] + k.w1 * buf[p & m] + k.w2 * buf[(p - 1) & m] + k.w3 * buf[(p - 2) & m];
}
// C2 bent down 2 semitones fits (C2–C6 keep that); the keys past them hold their own string bent
// down so far; and every string holds itself bent down by that and its own bend (MPE_BEND) too
int ringSize(double fs, int key) {
  const double own = fdlibm::pow(2.0, -MPE_BEND / 12);
  const double lo = key >= KEY_LO && key <= KEY_HI ? std::min(50.0, (50 / keyFreq(KEY_LO)) * keyFreq(key) * own) : 0.89 * keyFreq(key) * own;
  return 1 << (int)std::ceil(std::log2(fs / lo + 16));
}
} // namespace

BowedString::BowedString(int key, double fsBase)
    : key(key), os(oversample(key, fsBase)), fs(fsBase * os), fsBase(fsBase), mask(ringSize(fsBase * os, key) - 1),
      fb(mask + 1), nl(mask + 1), hb(mask + 1), tb(mask + 1), tn(mask + 1), rng((uint32_t)((uint64_t)key * 2654435761u)) {
  setFilter(aa[0], Biquad::lp, 0.38 * fsBase, 0.5412, fs);
  setFilter(aa[1], Biquad::lp, 0.38 * fsBase, 1.3066, fs);
}

void BowedString::design(const Loop &l) {
  L = l;
  ga = 1 - fdlibm::exp((-2 * PI * 2000) / fs); gs = std::sqrt((3 * (2 - ga)) / ga); // unit-rms grain
  kself = (2 * L.G * L.Z0) / (1 + L.G * L.Zall); // own share of the bridge velocity
  Z = L.Z0; Y = 1 / (2 * L.Z0);
  Yt = L.Zt > 0 ? 1 / (2 * L.Zt) : 0; Dtb = L.Dtb - 1; Dtn = L.Dtn - 1; rtb = L.rtb; rtn = L.rtn;
  Dfb = 2 * L.Db - 1; Dnl = 2 * L.Dn - 1;
  gb = L.gb * (1 - L.pb); pb = L.pb;
  gn = L.gn * (1 - L.pn); pn = L.pn;
  T0 = L.N0; bent = 1;
  wheel = L.wheel; // this string's wheel turns this much faster than the treadle setting
  weigh();
}

// tap()'s cubic, gathered by sample: x1 + f c1 + f² c2 + f³ c3 with c1…c3 as there
BowedString::Frac BowedString::frac(double d) {
  const int i = (int)d;
  const double f = d - i, f2 = f * f, f3 = f2 * f;
  return {i, -0.5 * f + f2 - 0.5 * f3, 1 - 2.5 * f2 + 1.5 * f3, 0.5 * f + 2 * f2 - 1.5 * f3, 0.5 * (f3 - f2)};
}

// Pitch bend: the bridge slides, the sounding string ÷ r long, so its bending and its twisting
// waves both take 1/r of the time to cross it (the twist's resonance keeps its place under the
// note). The bow stays at the same fraction of the string, the loss filters keep their delays,
// and the impedance (μc) is the same string's, so the touch stays where it was voiced.
void BowedString::bend(double r) {
  const double k = 1 - 1 / r;
  Dfb = std::max(1.0, 2 * L.Db - 1 - L.beta * L.N0 * k); Dnl = std::max(1.0, 2 * L.Dn - 1 - (1 - L.beta) * L.N0 * k);
  Dtb = std::max(1.0, L.Dtb / r - 1); Dtn = std::max(1.0, L.Dtn / r - 1);
  T0 = L.N0 / r; bent = r;
  weigh();
}

void BowedString::setDamper(bool on, double sigma) { dampT = on ? fdlibm::exp(-sigma / L.f0) : 1; }

void BowedString::clear() {
  for (auto *b : {&fb, &nl, &hb, &tb, &tn}) std::fill(b->begin(), b->end(), 0.0);
  ob = 0; lb = 0; ln = 0; v = 0; vs = 0; F = 0; st.s = -1; st.u = 0; tIdle = 0; nSlip = 0; e = 0;
  for (auto &b : aa) b.reset();
}

// Bow end: incoming waves, friction, outgoing waves. Returns the string's velocity at the bow.
double BowedString::bow(double vB, double FN, const Friction &Fr) {
  const int m = mask;
  const double *FB = fb.data(), *NL = nl.data(), *TB = tb.data(), *TN = tn.data();
  lb = gb * (fast ? read(FB, m, w, kfb) : tap(FB, m, w, Dfb)) + pb * lb;
  damp += 0.004 * (dampT - damp);
  ln = gn * damp * (fast ? read(NL, m, wn, knl) : tap(NL, m, wn, Dnl)) + pn * ln;
  const double bin = lb, nin = -ln, vh = bin + nin;
  // torsion: the string's surface under the bow also moves by rolling (only friction drives it,
  // so off the wheel it soon dies and is skipped)
  const bool tLive = FN > 0 || tIdle < Dtn + 4;
  const double tbi = tLive ? -rtb * (fast ? read(TB, m, wn, ktb) : tap(TB, m, wn, Dtb)) : 0, tni = tLive ? -rtn * (fast ? read(TN, m, wn, ktn) : tap(TN, m, wn, Dtn)) : 0;
  const double vsh = vh + tbi + tni;
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
      f = frictionForceMem(vsh, vB, FN, Y + Yt, Fr, st, fa);
    } else f = frictionForce(vsh, vB, FN, Y + Yt, Fr, st);
    if (was != 0 && st.s == 0) stuck = t;
    // a slip counts if the stick before it lasted ≥ 3 % of a period (shorter re-captures are
    // ripple at the end of the same slip)
    else if (was == 0 && st.s != 0 && (double)(t - stuck) > 0.03 * T0) { slipT[nSlip % SLIPS] = (double)t; nSlip++; }
  } else st.s = vsh > vB ? 1 : -1;
  const double yf = Y * f, ytf = Yt * f;
  ob = nin + yf;
  wn = (wn + 1) & m;
  nl[wn] = bin + yf;
  if (tLive) {
    tb[wn] = tni + ytf; tn[wn] = tbi + ytf;
    tIdle = std::fabs(tbi) + std::fabs(tni) + std::fabs(ytf) < 1e-12 ? tIdle + 1 : 0;
  } else { tb[wn] = 0; tn[wn] = 0; } // keep the ring clean for when it wakes
  hb[wn] = ob;
  v = vh + yf; vs = vsh + yf + ytf; F = f;
  e += v * v;
  t++;
  return v;
}

// v(x, t) = Σ (2J/nπ) sin(nπx/L) cos nωt and y'(x, t) = Σ (2J/nωL) cos(nπx/L) sin nωt with
// J = −vB/β, split into the travelling waves v_R = (v − c y')/2, v_L = (v + c y')/2.
void BowedString::initHelmholtz(double vB) {
  clear();
  const double J = -vB / L.beta, wf = 2 * PI * L.f0, xb = L.beta * L.L, dx = L.c / fs;
  const int N = (int)std::floor(L.N0 / 6);
  auto field = [&](double x, double tt, double out[2]) {
    double vv = 0, sl = 0;
    for (int n = 1; n <= N; n++) {
      const double k = (n * PI) / L.L, sig = fdlibm::sin((n * PI) / (N + 1)) / ((n * PI) / (N + 1)); // Lanczos σ
      vv += ((sig * 2 * J) / (n * PI)) * fdlibm::sin(k * x) * fdlibm::cos(n * wf * tt);
      sl += ((sig * 2 * J) / (n * wf * L.L)) * fdlibm::cos(k * x) * fdlibm::sin(n * wf * tt);
    }
    out[0] = 0.5 * (vv - L.c * sl); out[1] = 0.5 * (vv + L.c * sl); // v_R, v_L
  };
  double t0 = 0;
  int best = -1;
  for (int j = 0, run = 0; j < 128; j++) { // the middle of the longest stick at the bow
    double r[2];
    field(xb, j / 64.0 / L.f0, r);
    run = std::fabs(r[0] + r[1] - vB) < 0.15 * vB ? run + 1 : 0;
    if (run > best) { best = run; t0 = (j - run / 2.0) / 64 / L.f0; }
  }
  const int m = mask;
  double r[2];
  for (int d = 0; d < 2 * L.Db + 2; d++) {
    const double x = d + 1 < L.Db ? xb - (d + 1) * dx : (d + 1 - L.Db) * dx;
    field(std::max(0.0, x), t0, r);
    fb[(w - d) & m] = d + 1 < L.Db ? -r[1] : r[0];
    if (d < L.Db) { field(xb - d * dx, t0, r); hb[(wn - d) & m] = r[1]; }
  }
  for (int d = 0; d < 2 * L.Dn + 2; d++) {
    const double x = d < L.Dn ? xb + d * dx : L.L - (d - L.Dn) * dx;
    field(std::min(L.L, x), t0, r);
    nl[(wn - d) & m] = d < L.Dn ? r[0] : -r[1];
  }
  field(xb, t0, r);
  ob = r[1]; lb = r[0]; ln = -r[1]; v = vB; st.s = 0;
}

Motion BowedString::motion(int win) {
  const int n = (int)std::min<int64_t>(std::min<int64_t>(win, nSlip - 1), SLIPS - 1);
  if (n < 4 || (double)t - slipT[(nSlip - 1) % SLIPS] > 3 * T0) return {};
  for (int j = 0; j < n; j++) iv[j] = (slipT[(nSlip - 1 - j) % SLIPS] - slipT[(nSlip - 2 - j) % SLIPS]) / T0;
  return classifyMotion(iv.data(), n);
}

// From the travelling waves: slope y' = (v_left − v_right)/c, integrated from the bridge, the nut
// pinned.
void BowedString::shape(float *out, int nP) const {
  const int m = mask;
  const double dx = L.c / fs, xb = L.beta * L.L;
  double y = 0, prev = 0;
  for (int j = 0; j < nP; j++) {
    const double x = ((double)j / (nP - 1)) * L.L;
    double vl, vr;
    if (x < xb) {
      vl = tap(hb.data(), m, wn, std::max(1.0, (xb - x) / dx));
      vr = tap(fb.data(), m, w, std::max(1.0, L.Db - 1 + x / dx));
    } else {
      vr = tap(nl.data(), m, wn, std::max(1.0, (x - xb) / dx));
      vl = -tap(nl.data(), m, wn, std::max(1.0, L.Dn + (L.L - x) / dx));
    }
    const double s = (vl - vr) / L.c;
    if (j) y += (0.5 * (s + prev) * L.L) / (nP - 1);
    prev = s; out[j] = (float)y;
  }
  for (int j = 0; j < nP; j++) out[j] = (float)(out[j] - ((double)out[nP - 1] * j) / (nP - 1)); // pin the nut
}

double settleTime(BowedString &s, const Friction &Fr, double vB, double FN, double rise, double sec) {
  s.clear();
  const int64_t n = (int64_t)std::llround(sec * s.fsBase), t0 = s.t;
  const double T0 = s.T0;
  int64_t n0 = 0, last = -1, start = 0;
  int run = 0;
  for (int64_t i = 0; i < n; i++) {
    s.tick(0, vB, FN * std::min(1.0, i / (rise * s.fsBase)), Fr);
    if (s.nSlip == n0) continue;
    n0 = s.nSlip;
    if (last >= 0) {
      run = std::fabs((double)(s.t - last) - T0) < 0.08 * T0 ? run + 1 : 0;
      if (run == 1) start = last;
      if (run >= 15) return (double)(start - t0) / s.fs;
    }
    last = s.t;
  }
  return std::numeric_limits<double>::infinity();
}

} // namespace forte::bowed
