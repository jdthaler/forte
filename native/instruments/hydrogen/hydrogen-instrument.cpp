// hydrogen-instrument.cpp — the Hydrogen Lamp as the plugins and the WebAssembly build see it: its
// generated description (hydrogen-params.h) with its engine.

#include "hydrogen-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::hydrogen::info([](double fs) -> forte::Engine * { return new forte::hydrogen::HydrogenEngine(fs); });
  return info;
}
