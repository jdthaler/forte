// pianet-instrument.cpp — the Sticky-Pad Piano as the plugins and the WebAssembly build see it: its
// generated description (pianet-params.h) with its engine.

#include "pianet-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::pianet::info([](double fs) -> forte::Engine * { return new forte::pianet::PianetEngine(fs); });
  return info;
}
