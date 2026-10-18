// ring-instrument.cpp — the Storage Ring as the plugins and the WebAssembly build see it: its
// generated description (ring-params.h) with its engine.

#include "ring-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::ring::info([](double fs) -> forte::Engine * { return new forte::ring::StorageRingEngine(fs); });
  return info;
}
