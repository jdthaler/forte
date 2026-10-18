// blackhole-engine.h — plays black-hole ringdowns, and optional inspirals, on the engine
// contract (forte/engine.h).
//
//   each mode a decaying phasor ζ(t) = e^{−γt} e^{−2πift}; h₊ = Re(C₊ζ) and h× = −Im(C×ζ),
//   summed over modes; left = h₊, right = h× (or mono)
//   with an inspiral, the note opens with the quadrupole chirp f(t) = f₀(1 − t/τ_c)^(−3/8),
//   rises through a short merger bridge, and hands over to the ringdown with the same phase and
//   amplitude
//   voices over the limit: the quietest fades out in ~10 ms
//
// With V8's fdlibm, so it plays the same samples in the WebAssembly and the plugins. A
// key's voice (blackhole-model.h) is cheap to build from the table (no solving), so it is built in
// noteOn, as the page's noteData builds it, and kept per key while the model's parameters stay
// the same. Voices live in a fixed pool; nothing is allocated after construction.
#pragma once

#include <cstdint>

#include "blackhole-model.h"
#include "blackhole-params.h"
#include "forte/engine.h"

namespace forte::blackhole {

// What the engine posts (blackhole/src/blackhole-wasm.js turns it into the page's message):
// the number of voices ringing, { type: 'voices', voices }, every 48 blocks of 128 samples.
namespace msg {
enum : uint16_t { voices = 1 };
}

constexpr int MAX_VOICES = 48;

class RingdownEngine;

struct Voice {
  int key = 0;
  double vel = 0;
  bool keyDown = true;
  int n = 0;
  double zr[MAX_MODES], zi[MAX_MODES], rr[MAX_MODES], ri[MAX_MODES];
  double cpr[MAX_MODES], cpi[MAX_MODES], cxr[MAX_MODES], cxi[MAX_MODES];
  bool ring = false, stolen = false, dead = false;
  double fade = 1, level = 0, rise = 0, riseStep = 0;
  // the inspiral (hasChirp): the model's chirp, and its state
  bool hasChirp = false;
  Chirp c;
  double t = 0, phi = 0, f = 0, A = 0, xfade = 1, bridge = 0;
  int stage = 1;

  void start(const RingdownEngine &eng, int key, const KeyVoice &d, double vel);
  void startRing(double phase);
  void render(float *L, float *R, int n, const RingdownEngine &eng);
};

class RingdownEngine : public Engine {
 public:
  static constexpr int kPool = 2 * MAX_VOICES + 1; // the hard limit, and the newest
  explicit RingdownEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  int voiceCount() const override { return nv; }
  void process(float *L, float *R, int n) override;

  // The page's note data for the next noteOn (a key's voice, as keyVoice builds it); without it
  // a note builds its own from the parameters.
  void offer(const KeyVoice &v);
  KeyVoice &offered() { return offer_; }
  void offerReady() { hasOffer = true; }
  void setMaxVoices(int n) { maxVoices = n < 1 ? 1 : n > MAX_VOICES ? MAX_VOICES : n; }

  // read by the voices
  double k, stealStep, muteStep;
  bool stereo = true, releaseMute = false;
  double master = 1;

  // the voices playing, oldest first (read by the tests through the WebAssembly's hooks)
  Voice *voices[kPool] = {};
  int nv = 0;

 private:
  Voice *slot();
  const KeyVoice &voiceFor(int key);

  Voice pool[kPool];
  Voice *free_[kPool] = {};
  int nfree = 0;
  int maxVoices = MAX_VOICES;
  ModelParams model;
  // each key's voice at the current model parameters
  KeyVoice cache[KEY_HI - KEY_LO + 1];
  bool cached[KEY_HI - KEY_LO + 1] = {};
  KeyVoice other;               // a key outside the range
  KeyVoice offer_;
  bool hasOffer = false;
  int sinceVoices = 0;
};

} // namespace forte::blackhole
