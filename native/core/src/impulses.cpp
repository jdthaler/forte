// impulses.cpp — shared/impulses.js in C++, operation for operation.

#include "forte/impulses.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte {

void soundboardIR(double fs, double seconds, std::vector<float> (&out)[2]) {
  const int n = (int)std::floor(seconds * fs);
  for (int ch = 0; ch < 2; ch++) {
    Mulberry32 r(11 + 7 * ch);
    std::vector<float> &o = out[ch];
    o.assign(n, 0.0f);
    const int nModes = 700;
    const double fLo = 40, fHi = std::min(12000.0, 0.45 * fs);
    for (int i = 0; i < nModes; i++) {
      const double f = fLo + ((fHi - fLo) * (i + r())) / nModes;
      const double sig = 9 + 0.011 * f;
      const double q = f / 150, hp = (q * q) / (1 + q * q);
      const double u = f / 7000, lp = 1 / std::sqrt(1 + u * u);
      const double amp = std::sqrt(sig) * hp * lp * std::sqrt(-2 * std::log(1 - r() * 0.999));
      const double w = (2 * std::numbers::pi * f) / fs, rr = std::exp(-sig / fs);
      const double c = 2 * rr * std::cos(w), r2 = rr * rr;
      const double ph = 2 * std::numbers::pi * r();
      double y1 = amp * std::sin(ph), y2 = amp * std::sin(ph - w) / rr;
      const int len = std::min(n, (int)std::ceil((9 / sig) * fs));
      for (int t = 0; t < len; t++) {
        const double y = c * y1 - r2 * y2;
        o[t] = (float)((double)o[t] + y1); // a Float32Array's +=
        y2 = y1; y1 = y;
      }
    }
  }
}

void roomIR(double fs, double seconds, std::vector<float> (&out)[2]) {
  const int n = (int)std::floor(seconds * fs);
  const int pre = (int)std::floor(0.014 * fs);
  for (int ch = 0; ch < 2; ch++) {
    Mulberry32 r(101 + ch);
    std::vector<float> &o = out[ch];
    o.assign(n, 0.0f);
    double lp = 0, lp2 = 0;
    for (int t = pre; t < n; t++) {
      const double tt = (t - pre) / fs;
      const double x = r() * 2 - 1;
      lp += 0.12 * (x - lp);
      lp2 += 0.03 * (x - lp2);
      const double fade = std::min(1.0, tt / 0.006);
      o[t] = (float)(fade * (0.55 * x * std::exp((-6.9 * tt) / 0.9) + 1.6 * lp * std::exp((-6.9 * tt) / 1.6) + 2.5 * lp2 * std::exp((-6.9 * tt) / 2.0)));
    }
  }
}

namespace {
constexpr double kSound = 343, kMicGap = 0.6;
constexpr double kAir[kBandCount] = {0.44, 1.31, 2.73, 4.66, 9.86, 32.8, 117}; // dB/km
// A Butterworth low-pass or high-pass (Q 1/√2): b0, b1, b2, a1, a2
struct Coef { double b0, b1, b2, a1, a2; };
Coef butterworth(bool high, double f, double fs) {
  const double w = (2 * std::numbers::pi * f) / fs, al = std::sin(w) / std::numbers::sqrt2, c = std::cos(w), a0 = 1 + al;
  const double b0 = (high ? 1 + c : 1 - c) / 2 / a0;
  return {b0, (high ? -2 : 2) * b0, b0, (-2 * c) / a0, (1 - al) / a0};
}
void filter(const Coef &k, std::vector<double> &x) {
  double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (double &v : x) {
    const double y = k.b0 * v + k.b1 * x1 + k.b2 * x2 - k.a1 * y1 - k.a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; v = y;
  }
}
} // namespace

void reverbTimes(const Venue &v, double (&T)[kBandCount]) {
  const double W = v.size[0], L = v.size[1], H = v.size[2], V = W * L * H, S = 2 * (W * L + L * H + W * H);
  for (int b = 0; b < kBandCount; b++)
    T[b] = (24 * std::log(10.0) * V) / kSound / (-S * std::log(1 - v.alpha[b]) + 4 * (kAir[b] / 4343) * V);
}

double venueSeconds(const Venue &v) {
  double T[kBandCount];
  reverbTimes(v, T);
  return 1.1 * *std::max_element(T, T + kBandCount);
}

void venueIR(double fs, int venue, double roomSeconds, std::vector<float> (&out)[2]) {
  if (venue < 0 || venue >= kVenueCount || kVenues[venue].size[0] == 0) { roomIR(fs, roomSeconds, out); return; }
  const Venue &v = kVenues[venue];
  const int n = (int)std::floor(venueSeconds(v) * fs);
  const double W = v.size[0], L = v.size[1], H = v.size[2], V = W * L * H, mix = 0.001 * std::sqrt(V);
  double T[kBandCount], decay[kBandCount];
  reverbTimes(v, T);
  for (int b = 0; b < kBandCount; b++) decay[b] = std::exp(-6.9 / (T[b] * fs));
  const double beta = std::sqrt(1 - (v.alpha[2] + v.alpha[3]) / 2), g = std::sqrt((4 * std::numbers::pi * kSound) / V / fs);
  auto share = [&](double t) { // the diffuse tail's share of the energy at emission time t
    const double u = std::min(1.0, std::max(0.0, (2 * t) / mix - 1)), s = std::sin(0.5 * std::numbers::pi * u);
    return s * s;
  };
  const double lpA = 1 - std::exp((-2 * std::numbers::pi * 5000) / fs);
  const int fade0 = (int)std::floor(0.9 * n);
  const double reach = kSound * mix;
  const int N[3] = {(int)std::ceil(reach / (2 * W)) + 1, (int)std::ceil(reach / (2 * L)) + 1, (int)std::ceil(reach / (2 * H)) + 1};
  const double *s = v.src;
  // relative to the direct sound at the pair (Web Audio would floor a quieter response's RMS)
  const double cx = v.mic[0] - v.src[0], cy = v.mic[1] - v.src[1], cz = v.mic[2] - v.src[2], rc = std::sqrt(cx * cx + cy * cy + cz * cz);
  for (int ch = 0; ch < 2; ch++) {
    std::vector<double> early(n + 1, 0.0), noise(n), y(n, 0.0);
    const double m[3] = {v.mic[0] + (ch ? 0.5 : -0.5) * kMicGap, v.mic[1], v.mic[2]};
    const double ex = m[0] - s[0], ey = m[1] - s[1], ez = m[2] - s[2], r0 = std::sqrt(ex * ex + ey * ey + ez * ez);
    for (int nx = -N[0]; nx <= N[0]; nx++) for (int ux = 0; ux < 2; ux++)
      for (int ny = -N[1]; ny <= N[1]; ny++) for (int uy = 0; uy < 2; uy++)
        for (int nz = -N[2]; nz <= N[2]; nz++) for (int uz = 0; uz < 2; uz++) {
          const int order = std::abs(2 * nx - ux) + std::abs(2 * ny - uy) + std::abs(2 * nz - uz);
          if (order == 0) continue; // the direct sound
          const double dx = (1 - 2 * ux) * s[0] + 2 * nx * W - m[0], dy = (1 - 2 * uy) * s[1] + 2 * ny * L - m[1], dz = (1 - 2 * uz) * s[2] + 2 * nz * H - m[2];
          const double d = std::sqrt(dx * dx + dy * dy + dz * dz);
          if (d >= reach) continue;
          const double at = ((d - r0) / kSound) * fs, fi = std::floor(at), fr = at - fi;
          if (fi >= n) continue;
          const int i = (int)fi;
          const double a = (std::pow(beta, order) / d) * std::sqrt(1 - share(d / kSound));
          early[i] += a * (1 - fr); early[i + 1] += a * fr;
        }
    Mulberry32 r(211 + 2 * venue + ch);
    for (double &x : noise) x = (r() * 2 - 1) * std::sqrt(3.0);
    // the octave bands: Linkwitz–Riley crossovers between each two
    std::vector<double> rest = noise, band;
    for (int b = 0; b < kBandCount; b++) {
      if (b < kBandCount - 1) {
        const double f = std::sqrt(kBands[b] * kBands[b + 1]);
        const Coef lo = butterworth(false, f, fs), hi = butterworth(true, f, fs);
        band = rest;
        filter(lo, band); filter(lo, band);
        filter(hi, rest); filter(hi, rest);
      } else band = rest;
      double e = std::exp((-6.9 * r0) / kSound / T[b]); // what the band has lost since emission
      for (int t = 0; t < n; t++) { y[t] += band[t] * e; e *= decay[b]; }
    }
    const int full = (int)std::ceil((mix - r0 / kSound) * fs);
    double lp = 0;
    std::vector<float> &o = out[ch];
    o.assign(n, 0.0f);
    for (int t = 0; t < n; t++) {
      lp += lpA * (early[t] - lp);
      const double tail = t < full ? g * std::sqrt(share(t / fs + r0 / kSound)) : g;
      const double fade = t < fade0 ? 1 : 0.5 + 0.5 * std::cos((std::numbers::pi * (t - fade0)) / (n - fade0));
      o[t] = (float)(fade * rc * (lp + tail * y[t]));
    }
  }
}

double venueGain(int venue, size_t length, double fs) {
  if (venue < 0 || venue >= kVenueCount || kVenues[venue].size[0] == 0) return 1;
  return std::sqrt(std::floor(2.0 * fs) / (double)length);
}

double webAudioScale(const std::vector<float> (&ir)[2], double fs) {
  double p = 0;
  for (const auto &ch : ir) for (float v : ch) p += (double)v * v;
  double rms = std::sqrt(p / (2.0 * ir[0].size()));
  if (!(rms >= 0.000125)) rms = 0.000125;
  return (0.00125 / rms) * (44100 / fs);
}

} // namespace forte
