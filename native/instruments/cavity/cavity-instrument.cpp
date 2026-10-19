// cavity-instrument.cpp — the RF Cavity Bells as the plugins and the WebAssembly build see it: its
// generated description (cavity-params.h) with its engine.

#include "cavity-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::cavity::info([](double fs) -> forte::Engine * { return new forte::cavity::CavityBellsEngine(fs); });
  return info;
}
