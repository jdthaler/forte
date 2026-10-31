// hurdygurdy-instrument.cpp — the Hurdy-Gurdy as the plugins and the WebAssembly build see it: its
// generated description (hurdygurdy-params.h) with its engine.

#include "hurdygurdy-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::hurdygurdy::info([](double fs) -> forte::Engine * { return new forte::hurdygurdy::HurdyGurdyEngine(fs); });
  return info;
}
