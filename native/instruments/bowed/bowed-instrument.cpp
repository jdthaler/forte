// bowed-instrument.cpp — the viola organista as the plugins and the WebAssembly build see it: its
// generated description (bowed-params.h) with its engine.

#include "bowed-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::bowed::info([](double fs) -> forte::Engine * { return new forte::bowed::OrganistaEngine(fs); });
  return info;
}
