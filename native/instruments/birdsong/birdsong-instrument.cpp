// birdsong-instrument.cpp — the Birdsong as the plugins and the WebAssembly build see it: its
// generated description (birdsong-params.h) with its engine.

#include "birdsong-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::birdsong::info([](double fs) -> forte::Engine * { return new forte::birdsong::BirdsongEngine(fs); });
  return info;
}
