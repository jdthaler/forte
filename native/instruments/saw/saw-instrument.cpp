// saw-instrument.cpp — the Musical Saw as the plugins and the WebAssembly build see it: its
// generated description (saw-params.h) with its engine.

#include "saw-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::saw::info([](double fs) -> forte::Engine * { return new forte::saw::SawEngine(fs); });
  return info;
}
