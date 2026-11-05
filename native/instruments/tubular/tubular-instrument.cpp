// tubular-instrument.cpp — the Tubular Bells as the plugins and the WebAssembly build see it: its
// generated description (tubular-params.h) with its engine.

#include "tubular-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::tubular::info([](double fs) -> forte::Engine * { return new forte::tubular::TubularEngine(fs); });
  return info;
}
