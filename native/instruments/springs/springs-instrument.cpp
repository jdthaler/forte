// springs-instrument.cpp — the Spring Keyboard as the plugins and the WebAssembly build see it: its
// generated description (springs-params.h) with its engine.

#include "springs-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::springs::info([](double fs) -> forte::Engine * { return new forte::springs::SpringEngine(fs); });
  return info;
}
