// ondes-instrument.cpp — the Ondes Martenot as the plugins and the WebAssembly build see it: its
// generated description (ondes-params.h) with its engine.

#include "ondes-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::ondes::info([](double fs) -> forte::Engine * { return new forte::ondes::OndesEngine(fs); });
  return info;
}
