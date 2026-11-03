// pulsars-instrument.cpp — the Pulsars as the plugins and the WebAssembly build see it: its
// generated description (pulsars-params.h) with its engine.

#include "pulsars-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::pulsars::info([](double fs) -> forte::Engine * { return new forte::pulsars::PulsarsEngine(fs); });
  return info;
}
