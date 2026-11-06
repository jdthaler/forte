// gamelan-instrument.cpp — the Gamelan as the plugins and the WebAssembly build see it: its
// generated description (gamelan-params.h) with its engine.

#include "gamelan-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::gamelan::info([](double fs) -> forte::Engine * { return new forte::gamelan::GamelanEngine(fs); });
  return info;
}
