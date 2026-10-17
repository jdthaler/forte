// gongs-instrument.cpp — the gong keyboard as the plugins and the WebAssembly build see it: its
// generated description (gongs-params.h) with its engine.

#include "gongs-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::gongs::info([](double fs) -> forte::Engine * { return new forte::gongs::GongEngine(fs); });
  return info;
}
