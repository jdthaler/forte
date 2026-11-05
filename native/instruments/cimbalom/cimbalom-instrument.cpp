// cimbalom-instrument.cpp — the Cimbalom as the plugins and the WebAssembly build see it: its
// generated description (cimbalom-params.h) with its engine.

#include "cimbalom-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::cimbalom::info([](double fs) -> forte::Engine * { return new forte::cimbalom::CimbalomEngine(fs); });
  return info;
}
