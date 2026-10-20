// whistlers-instrument.cpp — the Whistlers as the plugins and the WebAssembly build see it: its
// generated description (whistlers-params.h) with its engine.

#include "whistlers-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::whistlers::info([](double fs) -> forte::Engine * { return new forte::whistlers::WhistlersEngine(fs); });
  return info;
}
