// limiter.h — the pages' limiter, a Web Audio DynamicsCompressorNode (threshold −3 dB, knee 3 dB,
// ratio 12, attack 2 ms, release 150 ms), for the plugins. Its static curve and its makeup gain
// are the Web Audio specification's (the knee k found from the ratio; makeup = (1 / curve(1))^0.6),
// so levels below the threshold come out as on the page. It has no look-ahead (Web Audio delays
// the signal 6 ms to look ahead): the plugins have no latency, and a fast transient may overshoot
// the threshold for the attack time.
#pragma once

namespace forte {

class Limiter {
 public:
  void set(double thresholdDb, double kneeDb, double ratio, double attack, double release, double fs);
  void reset() { gain = 1; }
  void process(float *L, float *R, int n);
  // the static curve, for tests: input amplitude → output amplitude (before the makeup gain)
  double curve(double x) const;
  double makeup = 1;

 private:
  double linearThreshold = 1, kneeEnd = 1, kneeEndOut = 1, k = 1, ratio = 12;
  double attackCoef = 0, releaseCoef = 0, gain = 1;
  double kneeCurve(double x) const;
};

} // namespace forte
