// brass-instrument.cpp — the Brass as the plugins and the WebAssembly build see it: its
// generated description (brass-params.h) with its engine.

#include "brass-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::brass::info([](double fs) -> forte::Engine * { return new forte::brass::BrassEngine(fs); });
  return info;
}
