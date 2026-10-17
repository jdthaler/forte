// harmonium-instrument.cpp — the free-reed organ as the plugins and the WebAssembly build see it:
// its generated description (harmonium-params.h) with its engine.

#include "harmonium-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::harmonium::info([](double fs) -> forte::Engine * { return new forte::harmonium::HarmoniumEngine(fs); });
  return info;
}
