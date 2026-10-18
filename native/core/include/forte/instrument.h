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
  int venue = -1;          // a choice of kVenues (impulses.h) the room is; none: the room ('room')
  int tone = -1;           // low-pass at P[tone] Hz, Q 0.6 dB
  int body = -1;           // soundboard or body: dry × (1 − bodyDry·x) + convolved × bodyWet·x
  double bodySeconds = 0.4, bodyDry = 0, bodyWet = 0;
  double limiterThreshold = -3, limiterKnee = 3, limiterRatio = 12, limiterAttack = 0.002, limiterRelease = 0.15;
  double trimDb = 0;       // the registry's trim
};

// Another MIDI controller that moves a parameter (the descriptor's controllers): a toggle is on
// at 64 and above; any other parameter moves across its range. Or it switches a choice between
// two of its values (indices a and b): `values` puts it on a below 64 and on b at 64 and above,
// `toggle` flips it from one to the other each time the controller goes to 64 or above (a
// pedal's press). A choice on another value is left alone (the organ's Leslie, bypassed).
struct Controller {
  uint8_t cc;
  int16_t param;
  enum Mode : uint8_t { range, values, toggle } mode = range;
  int16_t a = -1, b = -1;
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
  int compassLo = 0, compassHi = 127; // a historical compass inside them: the keys that play until
  int compass = -1;        // this toggle opens the whole range (-1: no compass, every key plays)
  Space space;
  int modWheel = -1;       // CC1 drives this parameter: at rest its default, fully up modWheelMax
  double modWheelMax = 0;
  const Controller *controllers = nullptr;
  int controllerCount = 0;
  Chain chain;
  double (*midiVelocity)(double v) = nullptr; // MIDI velocity/127 → the engine's, if not the same

  Engine *(*create)(double fs);
};

} // namespace forte
