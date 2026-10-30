// hydraulis-instrument.cpp — the water organ as the plugins and the WebAssembly build see it: its
// generated description (hydraulis-params.h) with its engine.

#include "hydraulis-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::hydraulis::info([](double fs) -> forte::Engine * { return new forte::hydraulis::HydraulisEngine(fs); });
  return info;
}
