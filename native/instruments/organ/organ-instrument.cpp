// organ-instrument.cpp — the tonewheel organ as the plugins and the WebAssembly build see it: its
// generated description (organ-params.h) with its engine.

#include "organ-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::organ::info([](double fs) -> forte::Engine * { return new forte::organ::OrganEngine(fs); });
  return info;
}
