// resonator-instrument.cpp — the Magnetic Resonator Piano as the plugins and the WebAssembly build see it: its
// generated description (resonator-params.h) with its engine.

#include "resonator-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::resonator::info([](double fs) -> forte::Engine * { return new forte::resonator::ResonatorEngine(fs); });
  return info;
}
