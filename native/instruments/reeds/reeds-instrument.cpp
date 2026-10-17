// reeds-instrument.cpp — the reed piano as the plugins and the WebAssembly build see it: its
// generated description (reeds-params.h) with its engine.

#include "reeds-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::reeds::info([](double fs) -> forte::Engine * { return new forte::reeds::ReedEngine(fs); });
  return info;
}
