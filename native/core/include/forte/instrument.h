// instrument.h — everything a host needs to play an instrument, as its JavaScript descriptor
// (<slug>/src/<slug>-instrument.js) has it: identity, parameters and presets, keys, the Space
// pedal, the mod wheel, the output chain, and its engine.
#pragma once

#include <cstdint>

#include "forte/engine.h"
#include "forte/params.h"

namespace forte {

// Space and CC64: a damper pedal sent to the engine, or a latch that holds the keys down
enum class Space : uint8_t { none, sustain, hold };

// The output chain after the engine (shared/chain.js). Parameters are indices, −1 for none.
struct Chain {
  int volume = -1;         // master gain = P[volume] × the trim
  int room = -1;           // room reverb at roomGain × P[room]
  double roomSeconds = 2.0, roomGain = 0.6;
  int tone = -1;           // low-pass at P[tone] Hz, Q 0.6 dB
  int body = -1;           // soundboard or body: dry × (1 − bodyDry·x) + convolved × bodyWet·x
  double bodySeconds = 0.4, bodyDry = 0, bodyWet = 0;
  double limiterThreshold = -3, limiterKnee = 3, limiterRatio = 12, limiterAttack = 0.002, limiterRelease = 0.15;
  double trimDb = 0;       // the registry's trim
};

struct InstrumentInfo {
  const char *slug;
  const char *name;        // the plugin's name: the instrument's ("Gong Keyboard")
  const char *version;     // the instrument's version
  const char *description;
  const char *auSubtype;   // four characters, unique (the registry's plugin.code)
  uint8_t vst3Id[16];      // the VST3 class id (native/ids.json), never changed

  const ParamInfo *params;
  int paramCount;
  const Preset *presets;
  int presetCount;
  const uint16_t *keep;    // kept when a preset is chosen
  int keepCount;

  int keyLo, keyHi;        // the keys it plays
  Space space;
  int modWheel = -1;       // CC1 drives this parameter: at rest its default, fully up modWheelMax
  double modWheelMax = 0;
  Chain chain;
  double (*midiVelocity)(double v) = nullptr; // MIDI velocity/127 → the engine's, if not the same

  Engine *(*create)(double fs);
};

} // namespace forte
