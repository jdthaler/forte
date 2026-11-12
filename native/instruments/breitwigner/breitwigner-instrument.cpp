// breitwigner-instrument.cpp — the Breit-Wigner Keyboard as the plugins and the WebAssembly build see it: its
// generated description (breitwigner-params.h) with its engine.

#include "breitwigner-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::breitwigner::info([](double fs) -> forte::Engine * { return new forte::breitwigner::BreitWignerEngine(fs); });
  return info;
}
