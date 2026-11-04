// brass-model.cpp — the brass physics (brass-model.h).

#include "brass-model.h"
#include "brass-levels.h"

#include <algorithm>
#include <cmath>
#include <vector>

#include "forte/dsp.h"

namespace forte::brass {

using cd = std::complex<double>;

// The horns, as built. Bores and bells from published measurements of typical instruments: a
// tenor trombone of 0.500″ (12.7 mm) bore and 8½″ bell, a B♭ trumpet of 0.459″ (11.65 mm) bore and
// 4.85″ bell, a flugelhorn of 0.413″ bore and 6″ bell; mouthpieces of their usual sizes. The lips
// after Adachi & Sato (1996) and Bilbao (2009), at the horn's middle register.
// The lips sit this far below the note: an outward-striking valve plays above its own resonance,
// on the horn's, and a player tunes them so (cents).
constexpr double LIP_CENTS = -600;

static const HornDesign HORNS[NHORNS] = {
  // cupV     throatR  throatL  bbL    bbR      leadL  cylR      cylL  coneL  coneR   flareL mouthR  gamma  fTune      nTune pLo pHi extMax keyLo keyHi lipMass  lipArea  lipWidth habit lipCents
  {1.6e-6,  3.40e-3, 6e-3,  0.075, 4.6e-3, 0.27, 6.35e-3,  1.35, 0.62, 10e-3,  0.48, 108e-3, 0.70, 233.0819, 4,    2,  8,  0.42,  40,   72,   1.2e-4,  3.0e-5,  1.4e-2, 0,    0},
  {0.45e-6, 1.82e-3, 5e-3,  0.065, 4.3e-3, 0.24, 5.825e-3, 0.50, 0.30, 8e-3,   0.32, 61.5e-3, 0.75, 466.1638, 4,    2,  9,  0.42,  54,   84,   5.0e-5,  1.6e-5,  1.0e-2, 0,  120},
  {0.80e-6, 2.10e-3, 5e-3,  0.060, 4.3e-3, 0.10, 5.45e-3,  0.35, 0.70, 17e-3,  0.30, 76e-3,   0.60, 466.1638, 4,    2,  8,  0.42,  52,   79,   5.5e-5,  1.7e-5,  1.0e-2, 0,  150},
};

const HornDesign &hornDesign(int horn) { return HORNS[std::clamp(horn, 0, NHORNS - 1)]; }

double hornLength(int horn) {
  const HornDesign &h = hornDesign(horn);
  return h.throatL + h.bbL + h.leadL + h.cylL + h.coneL + h.flareL;
}

double profile(int horn, double bellSize, double x) {
  const HornDesign &h = hornDesign(horn);
  const auto cone = [](double u, double L, double r0, double r1) { return r0 + (r1 - r0) * std::clamp(u / L, 0.0, 1.0); };
  if (x < h.throatL) return h.throatR;
  x -= h.throatL;
  if (x < h.bbL) return cone(x, h.bbL, h.throatR, h.bbR);
  x -= h.bbL;
  if (x < h.leadL) return cone(x, h.leadL, h.bbR, h.cylR);
  x -= h.leadL;
  if (x < h.cylL) return h.cylR;
  x -= h.cylL;
  if (x < h.coneL) return cone(x, h.coneL, h.cylR, h.coneR);
  x -= h.coneL;
  const double Rm = h.mouthR * bellSize, r0 = std::min(h.coneR, 0.9 * Rm);
  const double q = std::pow(r0 / Rm, 1 / h.gamma), x0 = q * h.flareL / (1 - q);
  return Rm * std::pow(x0 / (x0 + h.flareL - std::clamp(x, 0.0, h.flareL)), h.gamma);
}

void buildBore(int horn, double scale, double bellSize, double fs, Bore &b, double dCyl) {
  const HornDesign &h = hornDesign(horn);
  b = Bore{};
  const double dx = Air::c / fs;
  const double cylL = std::max(0.05, h.cylL + dCyl);
  double x0 = 0; // where the section starts along the design (size 1, slide in)
  // a section of length L (size 1) from x0, in N pieces, each a cylinder of its middle's radius
  const auto add = [&](double L, int N, bool cyl) {
    N = std::max(1, std::min(N, (int)std::floor(L * scale / dx)));
    for (int i = 0; i < N && b.n < MAX_SEG - 1; i++) {
      const double xm = x0 + L * (i + 0.5) / N;
      // (the cylinder's own length may differ from the design's: sample its radius in the design's)
      const double r = cyl ? h.cylR : profile(horn, bellSize, xm);
      b.len[b.n] = L / N * scale;
      b.rad[b.n] = r * scale;
      b.hot[b.n] = cyl || b.len[b.n] >= 4 * dx;
      b.n++;
    }
  };
  add(h.throatL, 1, false); x0 += h.throatL;
  add(h.bbL, (int)std::ceil(h.bbL / 0.04), false); x0 += h.bbL;
  add(h.leadL, std::max((int)std::ceil(h.leadL / 0.12), (int)std::ceil(std::log(h.cylR / h.bbR) / std::log(1.12))), false); x0 += h.leadL;
  b.cyl0 = b.n;
  // the cylinder: in pieces of about 0.45 m at size 1, each long enough to slide (a fractional delay)
  {
    const int N = std::clamp((int)std::lround(cylL / 0.45), 1, 3);
    for (int i = 0; i < N; i++) { b.len[b.n] = cylL / N * scale; b.rad[b.n] = h.cylR * scale; b.hot[b.n] = true; b.n++; }
  }
  b.cyl1 = b.n;
  x0 += h.cylL;
  add(h.coneL, std::max((int)std::ceil(h.coneL / 0.25), (int)std::ceil(std::log(h.coneR / h.cylR) / std::log(1.25))), false); x0 += h.coneL;
  // the flare: pieces of equal steps in log radius (22 % each), merged until each is a sample long
  {
    const double Rm = h.mouthR * bellSize, r0 = profile(horn, bellSize, x0), q = std::pow(std::min(h.coneR, 0.9 * Rm) / Rm, 1 / h.gamma);
    const double xq = q * h.flareL / (1 - q);
    const auto at = [&](double r) { return xq + h.flareL - xq * std::pow(Rm / r, 1 / h.gamma); }; // where the flare reaches r
    const int steps = (int)std::ceil(std::log(Rm / r0) / std::log(1.22));
    double u0 = 0;
    for (int i = 1; i <= steps && b.n < MAX_SEG - 1; i++) {
      const double u1 = i == steps ? h.flareL : std::clamp(at(r0 * std::pow(Rm / r0, (double)i / steps)), 0.0, h.flareL);
      if ((u1 - u0) * scale < dx && i < steps) continue;
      const double L = (u1 - u0) * scale;
      if (L < 0.5 * dx && b.n > b.cyl1) { b.len[b.n - 1] += L; b.rad[b.n - 1] = profile(horn, bellSize, x0 + u1) * scale; u0 = u1; continue; }
      b.len[b.n] = L;
      b.rad[b.n] = profile(horn, bellSize, x0 + 0.5 * (u0 + u1)) * scale;
      b.hot[b.n] = false; // short: a whole number of samples, its losses lumped into the last long segment's
      b.n++;
      u0 = u1;
    }
  }
  b.cupV = h.cupV * scale * scale * scale;
  b.scale = scale;
  b.mouthR = h.mouthR * bellSize * scale;
}

double plungerOpen(double plunger) { return 1 - 0.97 * std::clamp(plunger, 0.0, 1.0); }

void lossFilter(double lambda, double fs, double scale, double &g, double &p) {
  // e^(−LOSS √f Λ), Λ = Σ l / a, matched at 100 Hz and 4 kHz on the horn at its own size. A horn
  // built bigger or smaller keeps its losses per wavelength (LOSS × √scale), so that it plays as
  // the horn does, an octave down or up: the walls of a real one twice the size lose a little less.
  const double f1 = 100 / scale, f2 = std::min(4000.0 / scale, 0.3 * fs), k = LOSS * std::sqrt(scale);
  const double G1 = std::exp(-k * std::sqrt(f1) * lambda), G2 = std::exp(-k * std::sqrt(f2) * lambda);
  const double c1 = std::cos(TAU * f1 / fs), c2 = std::cos(TAU * f2 / fs), want = (G2 / G1) * (G2 / G1);
  const auto F = [&](double q) { return (1 - 2 * q * c1 + q * q) / (1 - 2 * q * c2 + q * q); };
  double lo = 0, hi = 0.995;
  if (F(0) <= want) { p = 0; g = G1; return; }
  for (int i = 0; i < 60; i++) { const double m = 0.5 * (lo + hi); (F(m) > want ? lo : hi) = m; }
  p = 0.5 * (lo + hi);
  g = G1 * std::sqrt(1 - 2 * p * c1 + p * p) / (1 - p);
}

void lagrange(double D, int &base, double h[4]) {
  base = (int)std::floor(D) - 1;
  const double d = D - base;
  h[0] = -(d - 1) * (d - 2) * (d - 3) / 6;
  h[1] = d * (d - 2) * (d - 3) / 2;
  h[2] = -d * (d - 1) * (d - 3) / 2;
  h[3] = d * (d - 1) * (d - 2) / 6;
}

void realize(const Bore &b, double fs, double ext, double plunger, Digital &d) {
  d = Digital{};
  d.n = b.n + 1; // and the plunger's opening at the mouth, one sample long
  d.cyl0 = b.cyl0; d.cyl1 = b.cyl1;
  const int nc = std::max(1, b.cyl1 - b.cyl0);
  double pending = 0; // Σ l / a of short segments, lumped into the next long one's losses
  int lastHot = -1;
  for (int i = 0; i < b.n; i++) {
    double L = b.len[i];
    if (i >= b.cyl0 && i < b.cyl1) L = std::max(0.25 * L, L + ext / nc);
    d.Y[i] = PI * b.rad[i] * b.rad[i] / (Air::rho * Air::c);
    d.hot[i] = b.hot[i];
    d.nl[i] = b.hot[i] && b.rad[i] <= 1.25 * b.rad[b.cyl0];
    const double D = L * fs / Air::c;
    if (d.hot[i]) {
      d.D[i] = std::max(3.0, D);
      lossFilter(pending + L / b.rad[i], fs, b.scale, d.lg[i], d.lp[i]);
      pending = 0;
      lastHot = i;
    } else {
      d.D[i] = std::max(1.0, std::round(D));
      d.lg[i] = 1; d.lp[i] = 0;
      pending += L / b.rad[i];
    }
  }
  if (lastHot >= 0 && pending > 0) {
    double l0 = -std::log(d.lg[lastHot]); (void)l0;
    // the flare's own losses on the last long segment's filter (its Λ plus theirs)
    double lam = 0;
    for (int i = lastHot; i < b.n; i++) lam += (i == lastHot ? b.len[i] + (i >= b.cyl0 && i < b.cyl1 ? ext / nc : 0) : b.len[i]) / b.rad[i];
    lossFilter(lam, fs, b.scale, d.lg[lastHot], d.lp[lastHot]);
  }
  // the plunger's opening takes the bore's last sample: the bell's mouth stays where it is
  for (int i = b.n - 1; i >= 0; i--) {
    if (d.D[i] >= (d.hot[i] ? 4.0 : 2.0)) { d.D[i] -= 1; break; }
  }
  const double ao = b.mouthR * std::sqrt(plungerOpen(plunger));
  d.Y[b.n] = PI * ao * ao / (Air::rho * Air::c);
  d.D[b.n] = 1; d.lg[b.n] = 1; d.lp[b.n] = 0; d.hot[b.n] = false;
  d.tauR = 1.22 * ao / Air::c;
  d.cupC = b.cupV / Air::rhoc2;
}

cd inputImpedance(const Digital &d, double f, double fs) {
  const double w = TAU * f / fs;
  const cd zi = std::polar(1.0, -w); // z⁻¹
  const double K = 2 * fs * d.tauR;
  cd R = -(1.0 + zi) / ((1 + K) + (1 - K) * zi);
  for (int i = d.n - 1; i >= 0; i--) {
    cd G;
    if (d.hot[i]) {
      int base; double h[4];
      lagrange(d.D[i], base, h);
      cd s = 0;
      for (int k = 0; k < 4; k++) s += h[k] * std::polar(1.0, -w * (base + k));
      G = s * (d.lg[i] * (1 - d.lp[i])) / (1.0 - d.lp[i] * zi);
    } else G = std::polar(1.0, -w * d.D[i]);
    R = G * G * R;
    if (i > 0) {
      const double Y1 = d.Y[i - 1], Y2 = d.Y[i], s = Y1 + Y2;
      const double r12 = (Y1 - Y2) / s, r21 = -r12, t12 = 2 * Y1 / s, t21 = 2 * Y2 / s;
      R = r12 + t12 * t21 * R / (1.0 - r21 * R);
    }
  }
  const cd Yb = d.Y[0] * (1.0 - R) / (1.0 + R);
  const cd Yc = d.cupC * fs * (1.0 - zi);
  return 1.0 / (Yb + Yc);
}

double peakNear(const Digital &d, double fs, double fG, double span) {
  constexpr int N = 33;
  const double lo = fG / (1 + span), hi = std::min(fG * (1 + span), 0.45 * fs);
  if (!(hi > lo)) return 0;
  double best = -1; int bi = 0;
  double F[N];
  for (int i = 0; i < N; i++) {
    F[i] = lo * std::pow(hi / lo, (double)i / (N - 1));
    const double z = std::abs(inputImpedance(d, F[i], fs));
    if (z > best) { best = z; bi = i; }
  }
  double a = F[std::max(0, bi - 1)], b = F[std::min(N - 1, bi + 1)];
  const double gr = 0.6180339887498949;
  double x1 = b - gr * (b - a), x2 = a + gr * (b - a);
  double z1 = std::abs(inputImpedance(d, x1, fs)), z2 = std::abs(inputImpedance(d, x2, fs));
  for (int it = 0; it < 28; it++) {
    if (z1 > z2) { b = x2; x2 = x1; z2 = z1; x1 = b - gr * (b - a); z1 = std::abs(inputImpedance(d, x1, fs)); }
    else { a = x1; x1 = x2; z1 = z2; x2 = a + gr * (b - a); z2 = std::abs(inputImpedance(d, x2, fs)); }
  }
  return 0.5 * (a + b);
}

HornCut cutHorn(int horn, double bellSize, double fs) {
  HornCut c;
  c.horn = std::clamp(horn, 0, NHORNS - 1); c.bellSize = bellSize; c.fs = fs;
  const HornDesign &h = hornDesign(c.horn);
  Bore b; Digital d;
  // cut the slide's (or tuning slide's) length so that partial nTune, slide in, is the horn's B♭
  for (int it = 0; it < 4; it++) {
    buildBore(c.horn, 1, bellSize, fs, b, c.dCyl);
    realize(b, fs, 0, 0, d);
    const double fp = peakNear(d, fs, h.fTune, 0.08);
    if (!(fp > 0)) break;
    const double Le = h.nTune * Air::c / (2 * fp);
    c.dCyl += Le * (fp / h.fTune - 1);
  }
  buildBore(c.horn, 1, bellSize, fs, b, c.dCyl);
  realize(b, fs, 0, 0, d);
  for (int n = 1; n < 16; n++) {
    c.fn[n] = n < h.pLo || n > h.pHi ? 0 : peakNear(d, fs, n * h.fTune / h.nTune, 0.1);
    c.Le[n] = c.fn[n] > 0 ? n * Air::c / (2 * c.fn[n]) : 0;
  }
  return c;
}

Plan planKey(const HornCut &c, double f, double fs, bool tune) {
  const HornDesign &h = hornDesign(c.horn);
  Plan best;
  double bestCost = INFINITY;
  for (int oct = -6; oct <= 5; oct++) {
    const double s = std::pow(2.0, oct);
    for (int n = h.pLo; n <= h.pHi; n++) {
      if (!(c.fn[n] > 0)) continue;
      // (a horn built bigger or smaller plays only its middle partials, where it speaks surely)
      if (oct != 0 && (n < 3 || n > 6)) continue;
      // (a trumpeter, or a flugelhorn player, avoids the seventh partial: weak and far out of tune)
      if (n == 7 && c.horn != TROMBONE) continue;
      const double fn = c.fn[n] / s, Le = c.Le[n] * s;
      const double ext = Le * (fn / f - 1);
      if (ext < -0.06 * Le || ext > h.extMax * Le) continue;
      // a player picks the horn they have, then the shortest slide (or fewest valves)
      const double cost = std::abs(oct) * 10 + std::abs(ext / Le) + 0.01 * n;
      if (cost < bestCost) {
        bestCost = cost;
        best.octave = oct; best.scale = s; best.partial = n; best.ext = ext; best.Le = Le;
      }
    }
  }
  best.horn = c.horn; best.f = f;
  // tune the slide on the digital bore: its peak on the note
  Bore b; Digital d;
  buildBore(c.horn, best.scale, c.bellSize, fs, b, c.dCyl);
  for (int it = 0; tune && it < 6; it++) {
    realize(b, fs, best.ext, 0, d);
    const double fp = peakNear(d, fs, f, 0.05);
    if (!(fp > 0)) break;
    best.fPeak = fp;
    best.ext += (best.Le + best.ext) * (fp / f - 1);
    if (std::abs(fp / f - 1) < 2e-5) break;
  }
  // the position (or valves) as a player names it: the semitones below the partial's nominal note
  // n × B♭ (the slide itself goes where the bore's real peak puts it)
  const double semis = 12 * std::log2(best.partial * h.fTune / h.nTune / best.scale / f);
  best.position = 1 + std::max(0.0, semis);
  static constexpr int VALVES[7] = {0, 2, 1, 3, 6, 5, 7}; // 0, 2, 1, 1+2, 2+3, 1+3, 1+2+3
  best.valves = VALVES[std::clamp((int)std::lround(semis), 0, 6)];
  return best;
}

Lips lipsFor(int horn, double f, double scale, int partial, double cents, double q, double &r) {
  const HornDesign &h = hornDesign(horn);
  // the player sets the lips below the note: by LIP_CENTS up to the fourth partial, less above it,
  // where the partials crowd together
  double lc = LIP_CENTS * std::min(1.0, std::sqrt(4.0 / std::max(1, partial)));
  if (partial == 3) lc = -500; // (between: the third partial speaks best with the lips a little closer)
  const double fl = f * std::pow(2.0, (cents + lc + h.lipCents) / 1200);
  // the lips of the same note on the horn at its own size (f × scale), then scaled with the horn:
  // a horn and its lips all twice the size play the same an octave down
  const double ratio = 2 * h.fTune / h.nTune / (fl * scale); // the lips of the note an octave over the horn's B♭ are the reference
  Lips L;
  L.m = h.lipMass * std::pow(ratio, 1.2) * scale * scale * scale;
  L.k = L.m * (TAU * fl) * (TAU * fl);
  L.S = h.lipArea * std::pow(ratio, 0.25) * scale * scale;
  L.w = h.lipWidth * std::pow(ratio, 0.3) * scale;
  L.H0 = 0.05e-3 * std::pow(ratio, 0.5) * scale;
  r = L.m * TAU * fl / std::max(0.3, q);
  return L;
}

double mouthPressure(double velocity, double f, double breath) {
  const double v = std::clamp(velocity, 0.0, 1.0);
  return breath * 450 * std::pow(12.0, std::pow(v, 1.3)) * std::pow(std::clamp(f, 30.0, 2000.0) / 261.6256, 0.35);
}

double regulation(int horn, int key) {
  // measured at the defaults, mezzo-forte (tools/brass-levels.mjs: brass-levels.h)
  const int k = std::clamp(key - LEVELS_LO, 0, LEVELS_N - 1);
  return std::pow(10.0, LEVELS[std::clamp(horn, 0, NHORNS - 1)][k] / 20);
}

void propagate(double L, int pieces, double p, double f, double fs, int iters, int nh, double *out) {
  const int N = (int)std::lround(fs / f) * (int)std::ceil(0.25 * f) ; // a whole number of periods, about a quarter second
  const double D = L / pieces * fs / Air::c, k = Air::beta / Air::rhoc2;
  int size = 8;
  while (size < 2 * D + 16) size <<= 1;
  std::vector<float> buf((size_t)size * pieces, 0.0f);
  std::vector<double> last(pieces, 0.0), last2(pieces, 0.0), y((size_t)N);
  const double settle = (D * pieces) + 4 * fs / f; // let the line fill
  const int total = N + (int)settle;
  for (int n = 0; n < total; n++) {
    double in = p * std::sin(TAU * f * n / fs);
    for (int i = 0; i < pieces; i++) {
      float *b = buf.data() + (size_t)i * size;
      const double o = nlRead(b, size - 1, (uint32_t)n, D, k, 2 * last[i] - last2[i], iters);
      last2[i] = last[i]; last[i] = o;
      b[n & (size - 1)] = (float)in;
      in = o;
    }
    if (n >= (int)settle) y[n - (int)settle] = in;
  }
  for (int h = 1; h <= nh; h++) {
    double re = 0, im = 0;
    for (int n = 0; n < N; n++) { re += y[n] * std::cos(TAU * h * f * n / fs); im += y[n] * std::sin(TAU * h * f * n / fs); }
    out[h - 1] = 2 * std::sqrt(re * re + im * im) / N;
  }
}

double shockDistance(double p, double f) { return Air::rho * Air::c * Air::c * Air::c / (Air::beta * TAU * f * p); }

} // namespace forte::brass
