// huygens-instrument.cpp — the Huygens keyboard as the plugins and the WebAssembly build see it:
// its generated description (huygens-params.h) with its engine.

#include "huygens-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::huygens::info([](double fs) -> forte::Engine * { return new forte::huygens::NeonEngine(fs); });
  return info;
}
