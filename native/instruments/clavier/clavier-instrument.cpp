// clavier-instrument.cpp — the tangent clavier as the plugins and the WebAssembly build see it: its
// generated description (clavier-params.h) with its engine.

#include "clavier-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::clavier::info([](double fs) -> forte::Engine * { return new forte::clavier::ClavierEngine(fs); });
  return info;
}
