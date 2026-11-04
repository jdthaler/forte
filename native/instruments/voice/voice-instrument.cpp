// voice-instrument.cpp — the Singing Voice as the plugins and the WebAssembly build see it: its
// generated description (voice-params.h) with its engine.

#include "voice-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::voice::info([](double fs) -> forte::Engine * { return new forte::voice::VoiceEngine(fs); });
  return info;
}
