// carillon-instrument.cpp — the carillon as the plugins and the WebAssembly build see it: its
// generated description (carillon-params.h) with its engine.

#include "carillon-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::carillon::info([](double fs) -> forte::Engine * { return new forte::carillon::CarillonEngine(fs); });
  return info;
}
