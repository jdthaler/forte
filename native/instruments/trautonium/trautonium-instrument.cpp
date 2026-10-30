// trautonium-instrument.cpp — the Trautonium as the plugins and the WebAssembly build see it: its
// generated description (trautonium-params.h) with its engine.

#include "trautonium-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::trautonium::info([](double fs) -> forte::Engine * { return new forte::trautonium::TrautoniumEngine(fs); });
  return info;
}
