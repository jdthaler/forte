// planets-instrument.cpp — the Ringing Planets as the plugins and the WebAssembly build see it: its
// generated description (planets-params.h) with its engine.

#include "planets-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::planets::info([](double fs) -> forte::Engine * { return new forte::planets::PlanetEngine(fs); });
  return info;
}
