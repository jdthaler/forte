// marimba-instrument.cpp — the Marimba and Xylophone as the plugins and the WebAssembly build see it: its
// generated description (marimba-params.h) with its engine.

#include "marimba-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::marimba::info([](double fs) -> forte::Engine * { return new forte::marimba::MarimbaEngine(fs); });
  return info;
}
