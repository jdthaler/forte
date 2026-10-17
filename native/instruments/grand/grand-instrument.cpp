// grand-instrument.cpp — the electric grand as the plugins and the WebAssembly build see it: its
// generated description (grand-params.h) with its engine.

#include "grand-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::grand::info([](double fs) -> forte::Engine * { return new forte::grand::GrandEngine(fs); });
  return info;
}
