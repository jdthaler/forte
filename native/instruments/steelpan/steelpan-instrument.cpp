// steelpan-instrument.cpp — the Steel Pan as the plugins and the WebAssembly build see it: its
// generated description (steelpan-params.h) with its engine.

#include "steelpan-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::steelpan::info([](double fs) -> forte::Engine * { return new forte::steelpan::SteelPanEngine(fs); });
  return info;
}
