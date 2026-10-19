// engine.h — the engine contract, as in shared/worklet.js: the methods the worklet calls, so
// the plugins, the WebAssembly build and the Node tests drive an engine alike.
#pragma once

#include <cstdint>

#include "forte/queue.h"

namespace forte {

// Pitch bend's range: the wheel's ends bend an instrument that bends by this much, as most
// keyboards and hosts expect.
constexpr double kBendSemitones = 2;

// What an engine tells its page or editor while it plays (the page reads it through
// shared/wasm.js's `messages`):
// a type its own wrapper names, a key, and up to 30 numbers. Posting never waits: when nobody
// reads, messages are dropped.
struct Message {
  uint16_t type = 0;
  int16_t key = -1;
  uint16_t count = 0;
  float values[30] = {};
};

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
  virtual void bend(double /*value*/) {}                  // pitch bend −1..1 (±kBendSemitones, where it bends pitch)
  // One note's own expression (MPE, or a host's per-note expressions: forte/mpe.h). Either may come
  // before the key's noteOn: the engine keeps it per key, and the key's next note starts with it.
  //   noteBend(r, key)  the note's pitch × r on top of its tuned pitch and the wheel's bend (1: none)
  //   slide(x, key)     the note's own value of the mod wheel's parameter (NaN: the parameter's)
  virtual void noteBend(double /*ratio*/, int /*key*/) {}
  virtual void slide(double /*value*/, int /*key*/) {}
  virtual int voiceCount() const { return 0; }
  // Fill n samples (any n ≥ 1; the hosts call it with at most 128). Never allocates.
  virtual void process(float *L, float *R, int n) = 0;

  // The messages a page or editor reads (set by the host; null: nobody listens).
  SpscQueue<Message> *messages = nullptr;
  void post(const Message &m) { if (messages) messages->push(m); }

  const double fs;
};

} // namespace forte
