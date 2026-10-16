// fft.cpp — iterative radix-2 FFT with precomputed bit reversal and twiddles.

#include "forte/fft.h"

#include <cmath>
#include <numbers>

namespace forte {

FFT::FFT(size_t n) : n(n), rev(n), tw(n / 2) {
  int bits = 0;
  while ((size_t(1) << bits) < n) bits++;
  for (size_t i = 0; i < n; i++) {
    size_t r = 0;
    for (int b = 0; b < bits; b++) if (i & (size_t(1) << b)) r |= size_t(1) << (bits - 1 - b);
    rev[i] = r;
  }
  for (size_t k = 0; k < n / 2; k++) tw[k] = std::polar(1.0, -2 * std::numbers::pi * k / n);
}

void FFT::run(std::complex<double> *x, bool inverse) const {
  for (size_t i = 0; i < n; i++) if (i < rev[i]) std::swap(x[i], x[rev[i]]);
  for (size_t len = 2; len <= n; len <<= 1) {
    const size_t half = len / 2, step = n / len;
    for (size_t i = 0; i < n; i += len) {
      for (size_t k = 0; k < half; k++) { // (written out: std::complex's * checks for infinities)
        const double wr = tw[k * step].real(), wi = inverse ? -tw[k * step].imag() : tw[k * step].imag();
        const double ur = x[i + k + half].real(), ui = x[i + k + half].imag();
        const double br = ur * wr - ui * wi, bi = ur * wi + ui * wr, ar = x[i + k].real(), ai = x[i + k].imag();
        x[i + k] = {ar + br, ai + bi};
        x[i + k + half] = {ar - br, ai - bi};
      }
    }
  }
  if (inverse) { const double s = 1.0 / n; for (size_t i = 0; i < n; i++) x[i] *= s; }
}

} // namespace forte
