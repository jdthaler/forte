// regal-instrument.cpp — the Regal as the plugins and the WebAssembly build see it: its
// generated description (regal-params.h) with its engine.

#include "regal-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::regal::info([](double fs) -> forte::Engine * { return new forte::regal::RegalEngine(fs); });
  return info;
}
