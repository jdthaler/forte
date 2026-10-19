// celesta-instrument.cpp — the Celesta as the plugins and the WebAssembly build see it: its
// generated description (celesta-params.h) with its engine.

#include "celesta-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::celesta::info([](double fs) -> forte::Engine * { return new forte::celesta::CelestaEngine(fs); });
  return info;
}
