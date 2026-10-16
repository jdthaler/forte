// engine.h — the engine contract, as in shared/worklet.js: the C++ engines have the same
// methods as the JavaScript ones, so the plugins, the WebAssembly build and the Node tests
// drive both alike.
#pragma once

namespace forte {

class Engine {
 public:
  explicit Engine(double fs) : fs(fs) {}
  virtual ~Engine() = default;
  Engine(const Engine &) = delete;
  Engine &operator=(const Engine &) = delete;

  // Every parameter, indexed as in the instrument's ParamInfo table (params.h): a choice is
  // its index, a toggle 0 or 1. Called before the first note and after any change.
  virtual void setParams(const double *P) = 0;
  virtual void noteOn(int key, double velocity) = 0;  // velocity 0..1 (or the descriptor's midiVelocity)
  virtual void noteOff(int key, double velocity) = 0; // release velocity 0..1, or −1 if none
  virtual void setSustain(bool) {}
  virtual void allNotesOff() {}
  virtual void pressure(double /*value*/, int /*key*/) {} // aftertouch 0..1; key −1 for the channel
  virtual void bend(double /*value*/) {}                  // pitch bend −1..1
  virtual int voiceCount() const { return 0; }
  // Fill n samples (any n ≥ 1; the hosts call it with at most 128). Never allocates.
  virtual void process(float *L, float *R, int n) = 0;

  const double fs;
};

} // namespace forte
