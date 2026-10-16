// convolver.h — convolution with a long impulse response (a room, a soundboard) and no latency:
// the first taps directly, then uniformly partitioned FFT stages of growing blocks, each
// starting where its own block delay is hidden (Gardner, J. Audio Eng. Soc. 43, 1995). A stage
// sums its older partitions while its block fills, so no single call does a whole block's work.
// Allocates only in setIR; process never does.
#pragma once

#include <complex>
#include <memory>
#include <vector>

#include "forte/fft.h"

namespace forte {

class Convolver {
 public:
  // The impulse response, scaled by `gain`. head: the taps done directly; then stages of
  // block sizes head, 8·head, … up to kMaxBlock (the largest block is the largest burst of work).
  static constexpr size_t kMaxBlock = 4096;
  void setIR(const float *ir, size_t length, double gain = 1, size_t head = 64);
  void reset();
  // y[i] += (x ∗ ir)[i]
  void process(const float *x, float *y, int n);
  size_t length() const { return len; }

 private:
  struct Stage {
    size_t B = 0, start = 0, parts = 0, skip = 0; // block, first tap, partitions, leading zero partitions
    std::unique_ptr<FFT> fft;
    std::vector<std::complex<double>> H;   // parts × (B + 1) spectra of the IR
    std::vector<std::complex<double>> X;   // the last `parts` input spectra (a ring)
    std::vector<std::complex<double>> acc, buf;
    std::vector<double> in, out;           // the current input block (2B: previous + current), the output to play
    size_t fill = 0, ring = 0, outPos = 0;
    size_t done = 0; // partitions (from skip + 1) already summed for the next output
  };
  void accumulate(Stage &s, size_t upTo);
  void runStage(Stage &s);
  size_t len = 0, headLen = 0;
  std::vector<double> head;                // the direct taps
  std::vector<double> hist;                // the last headLen inputs (a ring, doubled for contiguous reads)
  size_t hpos = 0;
  std::vector<Stage> stages;
};

} // namespace forte
