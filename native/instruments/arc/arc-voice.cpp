// arc-voice.cpp — the talking arc's singer (arc/src/arc-voice.js), operation for operation.

#include "arc-voice.h"

#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::arc {

static constexpr double PI = std::numbers::pi, TWO_PI = 2 * PI;
static constexpr double BW[3] = {80, 100, 140};       // formant bandwidths (Hz)
static constexpr double HOLD = 0.42, GLIDE = 0.16;    // s per vowel, of which the glide to the next
static constexpr double OPEN = 0.4, CLOSE = 0.2;      // Rosenberg pulse: opening and closing phases (of the period)
static constexpr int NV = (int)VOWELS.size();

Singer::Singer(double fs, int32_t seed_)
    : fs(fs), seed((uint32_t)(seed_ | 1)), kAtt(1 - fdlibm::exp(-1 / (0.03 * fs))), kRel(1 - fdlibm::exp(-1 / (0.08 * fs))),
      kGl(1 - fdlibm::exp(-1 / (0.04 * fs))) {
  setFormants(VOWELS[0].F);
}

void Singer::setFormants(const double F[3]) {
  for (int k = 0; k < 3; k++) {
    const double r = fdlibm::exp((-PI * BW[k]) / fs), th = (TWO_PI * F[k]) / fs;
    c1[k] = 2 * r * fdlibm::cos(th); c2[k] = -r * r; g[k] = 1 - c1[k] - c2[k]; // unity gain at DC
  }
}

void Singer::formantsAt(double tt, double out[3]) const {
  const double kf = std::floor(tt / HOLD), x = tt / HOLD - kf;
  const int k = (int)kf;
  const double *a = VOWELS[k % NV].F, *b = VOWELS[(k + 1) % NV].F;
  const double m = x < 1 - GLIDE / HOLD ? 0 : 0.5 - 0.5 * fdlibm::cos((PI * (x - (1 - GLIDE / HOLD))) / (GLIDE / HOLD));
  for (int j = 0; j < 3; j++) out[j] = a[j] + m * (b[j] - a[j]);
}

int Singer::vowel() const { return (int)std::floor(t / HOLD) % NV; }

double Singer::source(double p) {
  if (p < OPEN) return (PI / (2 * OPEN)) * fdlibm::sin((PI * p) / OPEN);
  if (p < OPEN + CLOSE) return (-PI / (2 * CLOSE)) * fdlibm::sin((PI * (p - OPEN)) / (2 * CLOSE));
  return 0;
}

double Singer::next() {
  env += (on ? kAtt : kRel) * ((on ? 1 : 0) - env);
  f0 += kGl * (f0t - f0);
  if (env < 1e-5 && !on) { prev = 0; return 0; }
  t += 1 / fs;
  if (std::fmod(t * fs, 64) < 1) { double F[3]; formantsAt(t, F); setFormants(F); } // every 64 samples
  vib += (TWO_PI * 5.5) / fs;
  const double f = f0 * (1 + 0.006 * fdlibm::sin(vib));
  const double dp = f / fs;
  ph += dp;
  if (ph >= 1) ph -= 1;
  double s = source(ph);
  // polyBLEP: the flow derivative jumps back to 0 at closure (phase OPEN + CLOSE)
  const double jump = PI / (2 * CLOSE), pc = OPEN + CLOSE, d = (ph - pc) / dp;
  if (d >= 0 && d < 1) s += jump * (d - 1) * (d - 1) * 0.5; else if (d >= -1 && d < 0) s -= jump * (d + 1) * (d + 1) * 0.5;
  // a little breath
  seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
  s += 0.04 * ((int32_t)seed / 2147483648.0);
  // formant cascade
  double x = s;
  for (int k = 0; k < 3; k++) { const double y = g[k] * x + c1[k] * y1[k] + c2[k] * y2[k]; y2[k] = y1[k]; y1[k] = y; x = y; }
  return 0.5 * env * x;
}

} // namespace forte::arc
