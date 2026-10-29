// tess-instrument.cpp — the TESS as the plugins and the WebAssembly build see it: its
// generated description (tess-params.h) with its engine.

#include "tess-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::tess::info([](double fs) -> forte::Engine * { return new forte::tess::TessEngine(fs); });
  return info;
}
