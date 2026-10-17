// windharp-instrument.cpp — the wind harp as the plugins and the WebAssembly build see it: its
// generated description (windharp-params.h) with its engine.

#include "windharp-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::windharp::info([](double fs) -> forte::Engine * { return new forte::windharp::WindHarpEngine(fs); });
  return info;
}
