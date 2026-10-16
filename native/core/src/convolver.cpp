// convolver.cpp — zero-latency partitioned convolution (convolver.h).

#include "forte/convolver.h"

#include <algorithm>
#include <cstring>

namespace forte {

void Convolver::setIR(const float *ir, size_t length, double gain, size_t headSize) {
  headSize = std::clamp<size_t>(headSize, 1, kMaxBlock);
  len = length;
  headLen = std::min(headSize, length);
  head.assign(headLen, 0.0);
  for (size_t i = 0; i < headLen; i++) head[i] = gain * ir[i];
  hist.assign(2 * std::max<size_t>(headLen, 1), 0.0);
  hpos = 0;
  stages.clear();
  // Stage k has block B_k = head·8^k, at most kMaxBlock, and covers taps [start_k, end_k); its
  // output is one block late, so it must start at a tap ≥ B_k. The first starts after the head.
  size_t start = headLen, B = headSize;
  while (start < length) {
    const size_t next = std::min(B * 8, kMaxBlock);
    // this stage goes until the next one can take over (a multiple of `next`, at least 2·next), or the end
    size_t end = length;
    if (next > B && length > 2 * next) end = std::max(2 * next, ((start + next - 1) / next) * next);
    end = std::min(end, length);
    Stage s;
    s.B = B;
    s.start = start;
    // the stage convolves with g[n] = ir[B + n] (its block delay B is the shift); taps before
    // `start` are zero partitions, skipped
    s.skip = (start - B) / B;
    s.parts = end / B; // g[0, end − B) in blocks of B: end is a multiple of B, or the IR's end
    if (s.parts * B < end) s.parts++;
    s.parts -= 1;
    s.fft = std::make_unique<FFT>(2 * B);
    s.H.assign(s.parts * (B + 1), {0, 0});
    std::vector<std::complex<double>> tmp(2 * B);
    for (size_t p = s.skip; p < s.parts; p++) {
      std::fill(tmp.begin(), tmp.end(), std::complex<double>(0, 0));
      for (size_t i = 0; i < B; i++) {
        const size_t t = B + p * B + i;
        if (t >= start && t < end) tmp[i] = gain * ir[t];
      }
      s.fft->forward(tmp.data());
      std::copy(tmp.begin(), tmp.begin() + B + 1, s.H.begin() + p * (B + 1));
    }
    s.X.assign(s.parts * (B + 1), {0, 0});
    s.acc.assign(B + 1, {0, 0});
    s.buf.assign(2 * B, {0, 0});
    s.in.assign(2 * B, 0.0);
    s.out.assign(B, 0.0);
    stages.push_back(std::move(s));
    start = end;
    B = next;
  }
}

void Convolver::reset() {
  std::fill(hist.begin(), hist.end(), 0.0);
  for (Stage &s : stages) {
    std::fill(s.X.begin(), s.X.end(), std::complex<double>(0, 0));
    std::fill(s.in.begin(), s.in.end(), 0.0);
    std::fill(s.out.begin(), s.out.end(), 0.0);
    std::fill(s.acc.begin(), s.acc.end(), std::complex<double>(0, 0));
    s.fill = s.ring = s.outPos = s.done = 0;
  }
}

// Sum the partitions p ≥ 1 (the older input spectra, X_{k−p} at ring + p − 1) up to `upTo`, into
// the next output's spectrum; partition 0 waits for this block's own spectrum.
void Convolver::accumulate(Stage &s, size_t upTo) {
  const size_t bins = s.B + 1;
  for (size_t p = std::max(s.done, std::max<size_t>(s.skip, 1)); p < upTo; p++) {
    const std::complex<double> *X = s.X.data() + ((s.ring + p - 1) % s.parts) * bins, *H = s.H.data() + p * bins;
    double *acc = reinterpret_cast<double *>(s.acc.data());
    const double *x = reinterpret_cast<const double *>(X), *h = reinterpret_cast<const double *>(H);
    for (size_t k = 0; k < bins; k++) {
      acc[2 * k] += x[2 * k] * h[2 * k] - x[2 * k + 1] * h[2 * k + 1];
      acc[2 * k + 1] += x[2 * k] * h[2 * k + 1] + x[2 * k + 1] * h[2 * k];
    }
  }
  s.done = std::max(s.done, upTo);
}

// A full input block: its spectrum into the ring, partition 0, the rest not yet summed, and the
// next block's output.
void Convolver::runStage(Stage &s) {
  const size_t B = s.B, bins = B + 1;
  accumulate(s, s.parts);
  for (size_t i = 0; i < 2 * B; i++) s.buf[i] = s.in[i];
  s.fft->forward(s.buf.data());
  s.ring = (s.ring + s.parts - 1) % s.parts;
  std::copy(s.buf.begin(), s.buf.begin() + bins, s.X.begin() + s.ring * bins);
  if (s.skip == 0) {
    const std::complex<double> *X = s.X.data() + s.ring * bins, *H = s.H.data();
    for (size_t k = 0; k < bins; k++)
      s.acc[k] += std::complex<double>(X[k].real() * H[k].real() - X[k].imag() * H[k].imag(), X[k].real() * H[k].imag() + X[k].imag() * H[k].real());
  }
  for (size_t k = 0; k < bins; k++) s.buf[k] = s.acc[k];
  for (size_t k = 1; k < B; k++) s.buf[2 * B - k] = std::conj(s.acc[k]); // a real signal's spectrum
  s.fft->inverse(s.buf.data());
  for (size_t i = 0; i < B; i++) s.out[i] = s.buf[B + i].real(); // overlap-save: the second half
  std::copy(s.in.begin() + B, s.in.end(), s.in.begin());         // this block becomes the previous one
  std::fill(s.acc.begin(), s.acc.end(), std::complex<double>(0, 0));
  s.done = 0;
}

void Convolver::process(const float *x, float *y, int n) {
  for (int i = 0; i < n; i++) {
    const double v = x[i];
    double acc = 0;
    if (headLen) {
      hist[hpos] = hist[hpos + headLen] = v;
      const double *h = hist.data() + hpos + headLen; // h[-j] is the input j samples ago
      for (size_t j = 0; j < headLen; j++) acc += head[j] * h[-(ptrdiff_t)j];
      hpos = (hpos + 1) % headLen;
    }
    for (Stage &s : stages) {
      acc += s.out[s.outPos];
      s.in[s.B + s.fill] = v;
      if (++s.fill == s.B) { s.fill = 0; runStage(s); }
      else if ((s.fill & 63) == 0 && s.parts > 2) accumulate(s, 1 + (s.parts - 1) * s.fill / s.B); // a share of the older partitions
      s.outPos = s.fill;
    }
    y[i] += (float)acc;
  }
}

} // namespace forte
