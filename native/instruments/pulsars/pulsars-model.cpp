// pulsars-model.cpp — the Pulsars' physics (pulsars-model.h).

#include "pulsars-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "pulsars-params.h"

namespace forte::pulsars {

using cd = std::complex<double>;
constexpr double PI = std::numbers::pi;

double lightCylinder(double f) { return C_KM / (TAU * f); }
double breakUp() { return 1045 * std::sqrt(M_SUN) * std::pow(RIM_KM / 10, -1.5); }

double beamRadius(double r, double rlc) {
  const double s = std::sqrt(std::min(r, LC_SHARE * rlc) / rlc), th = std::asin(s);
  return th + std::atan(0.5 * std::tan(th));
}

double beam(double x, double core) {
  const double u = x / CORE_W, v = (x - CONE_AT) / CONE_W;
  return core * std::exp(-0.5 * u * u) + (1 - core) * std::exp(-0.5 * v * v);
}

double dmDelay(double dm, double fMHz) { return (K_DM * dm) / (fMHz * fMHz); }

double scatterTime(double dm, double fMHz, double scale) {
  if (!(scale > 0) || !(dm > 0)) return 0;
  const double l = std::log10(dm);
  return scale * 1e-3 * std::pow(10.0, BHAT_A + BHAT_B * l + BHAT_C * l * l + BHAT_X * std::log10(fMHz / 1000));
}

double smearAcross(double dm, double f1, double f2) { return std::fabs(dmDelay(dm, f1) - dmDelay(dm, f2)); }

Setup setupOf(int key, const double *P, double dm) {
  Setup s;
  // the spin: the note, equal temperament × the keyboard's tuning (forte/tuning.h; exactly 1 at its defaults)
  s.f = keyFreq(key) * tuningOf(P).ratio(key);
  s.alpha = P[p::alpha] * PI / 180;
  s.q = P[p::sightline];
  s.height = P[p::height];
  s.core = P[p::core];
  s.dm = dm;
  s.scatter = P[p::scatter];
  s.fc = P[p::freq];
  s.bw = P[p::bandwidth];
  s.dedisp = std::clamp((int)P[p::dedisp], 0, 2);
  s.channels = std::max(2, (int)std::lround(P[p::channels]));
  return s;
}

Geometry geometryOf(const Setup &s) {
  Geometry g;
  g.f = s.f;
  g.alpha = s.alpha;
  g.rlc = lightCylinder(s.f);
  g.rem = std::min(s.height, LC_SHARE * g.rlc);
  g.rho = beamRadius(s.height, g.rlc);
  g.beta = s.q * g.rho;
  g.zeta = s.alpha + g.beta;
  return g;
}

double intensity(const Geometry &g, double core, double phi) {
  const double c = std::cos(g.alpha) * std::cos(g.zeta) + std::sin(g.alpha) * std::sin(g.zeta) * std::cos(phi);
  const double th = std::acos(std::clamp(c, -1.0, 1.0));
  return beam(th / g.rho, core) + beam((PI - th) / g.rho, core);
}

Band bandOf(const Setup &s) { return {s.fc * (1 - s.bw / 2), s.fc * (1 + s.bw / 2)}; }
Band subBand(const Setup &s, int b) {
  const Band a = bandOf(s);
  return b == 0 ? Band{s.fc, a.hi} : Band{a.lo, s.fc};
}

namespace {
// How the band is summed: `count` pieces of sub-band b, each with its centre's delay as the
// dedispersion leaves it, the spread of delays across it, and its scattering time.
struct Piece { double t, d, tau; };
int piecesOf(const Setup &s, int b, int pieces, Piece *out) {
  const Band all = bandOf(s), sb = subBand(s, b);
  int m;
  double w;
  if (s.dedisp == kNone) { m = pieces; w = (sb.hi - sb.lo) / m; }
  else if (s.dedisp == kFilterbank) { m = std::min(std::max(1, s.channels / 2), 16); w = (all.hi - all.lo) / s.channels; }
  else { m = 16; w = 0; }
  for (int i = 0; i < m; i++) {
    const double f = sb.lo + (i + 0.5) * (sb.hi - sb.lo) / m;
    Piece &q = out[i];
    q.t = s.dedisp == kNone ? dmDelay(s.dm, f) - dmDelay(s.dm, all.hi) : 0;
    q.d = s.dedisp == kCoherent ? 0 : smearAcross(s.dm, f - w / 2, f + w / 2);
    q.tau = scatterTime(s.dm, f, s.scatter);
  }
  return m;
}
constexpr int MAX_PIECES = 1024;
double sinc(double x) { return std::fabs(x) < 1e-8 ? 1 : std::sin(x) / x; }
} // namespace

cd transfer(const Setup &s, int b, double w, int pieces) {
  Piece q[MAX_PIECES];
  const int m = piecesOf(s, b, std::clamp(pieces, 1, MAX_PIECES), q);
  cd h = 0;
  for (int i = 0; i < m; i++) h += std::exp(cd(0, -w * q[i].t)) * sinc(w * q[i].d / 2) / cd(1, w * q[i].tau);
  return h / (double)m;
}

double smearLeft(const Setup &s, int b) {
  const Band all = bandOf(s), sb = subBand(s, b);
  if (s.dedisp == kNone) return smearAcross(s.dm, sb.lo, sb.hi);
  if (s.dedisp == kFilterbank) {
    const double w = (all.hi - all.lo) / s.channels, f = (sb.lo + sb.hi) / 2;
    return smearAcross(s.dm, f - w / 2, f + w / 2);
  }
  return 0;
}

double arrived(const Setup &s, int b, double t) {
  if (t < 0) return 0;
  if (s.dedisp != kNone || !(s.dm > 0)) return 1;
  const Band all = bandOf(s), sb = subBand(s, b);
  // the lowest frequency whose first pulse is in by t: t = K DM (f⁻² − f_top⁻²)
  const double f = 1 / std::sqrt(t / (K_DM * s.dm) + 1 / (all.hi * all.hi));
  return (sb.hi - std::clamp(f, sb.lo, sb.hi)) / (sb.hi - sb.lo);
}

// ---- the tables ---------------------------------------------------------------------------------

Builder::Builder(int n) : n(n), fft(n), c(n), z(n) {}

void Builder::intrinsic(const Setup &s, const Geometry &g) {
  // a turn of the sightline's brightness, the main pulse at phase 0, and its harmonics
  double m1 = 0, m2 = 0;
  peakI = 0;
  for (int j = 0; j < n; j++) {
    const double phi = (TAU * j) / n;
    c[j] = intensity(g, s.core, phi);
    peakI = std::max(peakI, c[j].real());
    // the reference: a cut through the middle of one pole's beam (Θ = |φ|)
    const double r = beam(std::fabs(j <= n / 2 ? phi : phi - TAU) / g.rho, s.core);
    m1 += r; m2 += r * r;
  }
  m1 /= n; m2 /= n;
  norm = std::sqrt(std::max(m2 - m1 * m1, 1e-30));
  fft.forward(c.data());
}

void Builder::build(const Setup &s, Tables &t, double topHz, int pieces) {
  const Geometry g = geometryOf(s);
  intrinsic(s, g);
  const int K = std::clamp((int)std::floor(topHz / s.f), 0, n / 2 - 1);
  // keep the harmonics the profile has (past a millionth of its strongest, nothing is heard)
  double big = 0;
  for (int k = 1; k <= K; k++) big = std::max(big, std::abs(c[k]));
  int top = 0;
  for (int k = 1; k <= K; k++) if (std::abs(c[k]) > 1e-6 * big) top = k;
  for (int k = 0; k < n; k++) z[k] = 0;
  const double w1 = TAU * s.f;
  Piece q[MAX_PIECES];
  for (int b = 0; b < SUBBANDS; b++) {
    const int m = piecesOf(s, b, std::clamp(pieces, 1, MAX_PIECES), q);
    // each piece's response, harmonic by harmonic: e^(−ikω t) sinc(kω d / 2) / (1 + ikω τ), by
    // rotations from one harmonic to the next
    const cd unit = b == 0 ? cd(1, 0) : cd(0, 1); // the left table is z's real part, the right its imaginary
    for (int i = 0; i < m; i++) {
      const cd rot = std::exp(cd(0, -w1 * q[i].t)), spin = std::exp(cd(0, w1 * q[i].d / 2));
      const double x1 = w1 * q[i].d / 2, a1 = w1 * q[i].tau;
      cd zr = 1, ze = 1;
      for (int k = 1; k <= top; k++) {
        zr *= rot; ze *= spin;
        const double x = k * x1, sc = x < 1e-8 ? 1 : ze.imag() / x;
        const cd h = zr * sc / cd(1, k * a1);
        // the real signal's two sides: c_k h at k, conj(c_k h) at n − k
        const cd v = c[k] * h / (double)m;
        z[k] += unit * v;
        z[n - k] += unit * std::conj(v);
      }
    }
  }
  // a gentle edge to the harmonics kept, so the table rings no more than its band does
  for (int k = 1; k <= top; k++) {
    const double e = 0.75 * K, wk = k <= e ? 1 : 0.5 * (1 + std::cos(PI * (k - e) / (K - e + 1)));
    z[k] *= wk; z[n - k] *= wk;
  }
  fft.inverse(z.data());
  const double scale = 1 / norm;
  for (int j = 0; j < n; j++) { t.L[j] = (float)(z[j].real() * scale); t.R[j] = (float)(z[j].imag() * scale); }
  t.L[n] = t.L[0]; t.R[n] = t.R[0];
  t.n = n;
  t.dcL = t.dcR = c[0].real() / n * scale;
  t.harmonics = top;
  t.peak = peakI * scale;
  t.smear = 0.5 * (smearLeft(s, 0) + smearLeft(s, 1)) + scatterTime(s.dm, s.fc, s.scatter);
}

void Builder::profile(const Setup &s, double *out, int m) {
  const Geometry g = geometryOf(s);
  double peak = 0;
  for (int j = 0; j < n; j++) peak = std::max(peak, intensity(g, s.core, (TAU * j) / n));
  for (int i = 0; i < m; i++) out[i] = intensity(g, s.core, TAU * ((double)i / (m - 1) - 0.5)) / std::max(peak, 1e-30);
}

void Builder::channel(const Setup &s, double fMHz, double w, double *out, int m) {
  const Geometry g = geometryOf(s);
  intrinsic(s, g);
  const double peak = peakI;
  const Band all = bandOf(s);
  const double t = s.dedisp == kNone ? dmDelay(s.dm, fMHz) - dmDelay(s.dm, all.hi) : 0;
  const double d = s.dedisp == kCoherent ? 0 : smearAcross(s.dm, fMHz - w / 2, fMHz + w / 2);
  const double tau = scatterTime(s.dm, fMHz, s.scatter), w1 = TAU * s.f;
  z[0] = c[0];
  for (int k = 1; k < n / 2; k++) {
    const cd h = std::exp(cd(0, -k * w1 * t)) * sinc(k * w1 * d / 2) / cd(1, k * w1 * tau);
    z[k] = c[k] * h; z[n - k] = std::conj(z[k]);
  }
  z[n / 2] = 0;
  fft.inverse(z.data());
  for (int i = 0; i < m; i++) {
    const double x = ((double)i / (m - 1) + 0.5) * n; // −½ … ½ turn
    const int j = (int)std::floor(x);
    const double fr = x - j;
    out[i] = ((1 - fr) * z[j % n].real() + fr * z[(j + 1) % n].real()) / std::max(peak, 1e-30);
  }
}

// ---- noise ----------------------------------------------------------------------------------------

double Rng::uniform() {
  s += 0x6d2b79f5u;
  uint32_t t = s;
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  return ((t ^ (t >> 14)) >> 0) / 4294967296.0;
}
double Rng::gauss() {
  const double u = std::max(uniform(), 1e-12), v = uniform();
  return std::sqrt(-2 * std::log(u)) * std::cos(TAU * v);
}

} // namespace forte::pulsars
