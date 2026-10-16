// fft.h — a radix-2 complex FFT (in place), for the convolvers.
#pragma once

#include <complex>
#include <vector>

namespace forte {

class FFT {
 public:
  explicit FFT(size_t n);
  size_t size() const { return n; }
  void forward(std::complex<double> *x) const { run(x, false); }
  void inverse(std::complex<double> *x) const { run(x, true); } // scaled by 1/n

 private:
  void run(std::complex<double> *x, bool inverse) const;
  size_t n;
  std::vector<size_t> rev;
  std::vector<std::complex<double>> tw; // e^(−2πik/n), k < n/2
};

} // namespace forte
