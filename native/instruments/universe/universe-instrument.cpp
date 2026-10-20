// universe-instrument.cpp — the Early Universe as the plugins and the WebAssembly build see it: its
// generated description (universe-params.h) with its engine.

#include "universe-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::universe::info([](double fs) -> forte::Engine * { return new forte::universe::EarlyUniverseEngine(fs); });
  return info;
}
