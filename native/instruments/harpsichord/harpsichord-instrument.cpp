// harpsichord-instrument.cpp — the harpsichord as the plugins and the WebAssembly build see it: its
// generated description (harpsichord-params.h) with its engine.

#include "harpsichord-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::harpsichord::info([](double fs) -> forte::Engine * { return new forte::harpsichord::HarpsichordEngine(fs); });
  return info;
}
