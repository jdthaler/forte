// cristal-instrument.cpp — the Cristal Baschet as the plugins and the WebAssembly build see it: its
// generated description (cristal-params.h) with its engine.

#include "cristal-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::cristal::info([](double fs) -> forte::Engine * { return new forte::cristal::CristalEngine(fs); });
  return info;
}
