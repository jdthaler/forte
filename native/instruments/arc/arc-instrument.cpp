// arc-instrument.cpp — the singing arc as the plugins and the WebAssembly build see it: its
// generated description (arc-params.h) with its engine.

#include "arc-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::arc::info([](double fs) -> forte::Engine * { return new forte::arc::ArcEngine(fs); });
  return info;
}
