// chain.h — the output chain after the engine (shared/chain.js), for the plugins:
//   engine → [tone low-pass] → [body: dry + soundboard] → bus → master (+ room) → limiter
// Gains follow their parameters with Web Audio's setTargetAtTime(…, 0.02): a 20 ms one-pole.
// The room is one of the venues (impulses.h): a venue first chosen while playing is built on a
// worker thread, and the room it replaces stops hearing the bus but rings out its tail, as on
// the pages.
#pragma once

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <vector>

#include "forte/biquad.h"
#include "forte/convolver.h"
#include "forte/impulses.h"
#include "forte/instrument.h"
#include "forte/limiter.h"

#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
#define FORTE_CHAIN_THREADS 0 // no threads: a venue is built in place
#else
#define FORTE_CHAIN_THREADS 1
#endif

namespace forte {

class OutputChain {
 public:
  OutputChain() = default;
  ~OutputChain();
  OutputChain(const OutputChain &) = delete;
  OutputChain &operator=(const OutputChain &) = delete;
  // Builds the impulse responses, the room for P's venue among them (allocates: call it on
  // activation, not in process).
  void configure(const Chain &chain, double fs, const double *P = nullptr);
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
  Convolver bodyL, bodyR;
  Limiter limiter;
  std::vector<float> tmpL, tmpR, wetL, wetR, zeros;
  void run(float *L, float *R, int n);

  // The venues' rooms: built once each (by configure, or the worker), freed by the next configure
  struct Room {
    Convolver L, R;
    size_t length = 0;
    size_t ringing = 0; // samples of tail left since it stopped hearing the bus
  };
  std::atomic<Room *> rooms[kVenueCount] = {};
  int playing = -1, chosen = -1;   // the audio thread's: the room that hears the bus, the one wanted
  std::atomic<int> wanted{-1};     // what the worker builds
  Room *build(int venue) const;
  void stop();                     // the worker, and the rooms
#if FORTE_CHAIN_THREADS
  std::thread worker;
  std::mutex m;
  std::condition_variable cv;
  bool quit = false;
#endif
};

} // namespace forte
