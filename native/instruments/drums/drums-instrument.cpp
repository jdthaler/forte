// drums-instrument.cpp — the Timpani and Tabla as the plugins and the WebAssembly build see it: its
// generated description (drums-params.h) with its engine.

#include "drums-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::drums::info([](double fs) -> forte::Engine * { return new forte::drums::DrumEngine(fs); });
  return info;
}
