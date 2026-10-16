// chain.h — the output chain after the engine (shared/chain.js), for the plugins:
//   engine → [tone low-pass] → [body: dry + soundboard] → bus → master (+ room) → limiter
// Gains follow their parameters with Web Audio's setTargetAtTime(…, 0.02): a 20 ms one-pole.
#pragma once

#include <vector>

#include "forte/biquad.h"
#include "forte/convolver.h"
#include "forte/instrument.h"
#include "forte/limiter.h"

namespace forte {

class OutputChain {
 public:
  // Builds the impulse responses (allocates: call it on activation, not in process).
  void configure(const Chain &chain, double fs);
  // The targets from the parameters (any thread that processes; cheap).
  void setParams(const double *P);
  void reset();
  // In place, any n.
  void process(float *L, float *R, int n);

 private:
  static constexpr int kBlock = 128;
  struct Ramp { double value = 0, target = 0; };
  Chain c;
  double fs = 48000, coef = 0;
  Ramp tone, dry, body, room, master;
  bool first = true;
  WebAudioLowpass toneL, toneR;
  double toneAt = -1;
  Convolver bodyL, bodyR, roomL, roomR;
  Limiter limiter;
  std::vector<float> tmpL, tmpR, wetL, wetR;
  void run(float *L, float *R, int n);
};

} // namespace forte
