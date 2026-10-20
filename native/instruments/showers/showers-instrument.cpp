// showers-instrument.cpp — the Collider Showers as the plugins and the WebAssembly build see it: its
// generated description (showers-params.h) with its engine.

#include "showers-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::showers::info([](double fs) -> forte::Engine * { return new forte::showers::ColliderShowersEngine(fs); });
  return info;
}
