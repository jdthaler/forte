// clavichord-instrument.cpp — the Clavichord as the plugins and the WebAssembly build see it: its
// generated description (clavichord-params.h) with its engine.

#include "clavichord-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::clavichord::info([](double fs) -> forte::Engine * { return new forte::clavichord::ClavichordEngine(fs); });
  return info;
}
