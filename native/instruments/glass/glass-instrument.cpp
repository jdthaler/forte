// glass-instrument.cpp — the armonica as the plugins and the WebAssembly build see it: its
// generated description (glass-params.h) with its engine.

#include "glass-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::glass::info([](double fs) -> forte::Engine * { return new forte::glass::ArmonicaEngine(fs); });
  return info;
}
