// telharmonium-instrument.cpp — the Telharmonium as the plugins and the WebAssembly build see it: its
// generated description (telharmonium-params.h) with its engine.

#include "telharmonium-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::telharmonium::info([](double fs) -> forte::Engine * { return new forte::telharmonium::TelharmoniumEngine(fs); });
  return info;
}
