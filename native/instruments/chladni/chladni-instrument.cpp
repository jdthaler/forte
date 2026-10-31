// chladni-instrument.cpp — the Chladni Plate as the plugins and the WebAssembly build see it: its
// generated description (chladni-params.h) with its engine.

#include "chladni-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::chladni::info([](double fs) -> forte::Engine * { return new forte::chladni::ChladniPlateEngine(fs); });
  return info;
}
