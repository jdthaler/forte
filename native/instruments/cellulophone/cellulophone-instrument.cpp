// cellulophone-instrument.cpp — the Cellulophone as the plugins and the WebAssembly build see it: its
// generated description (cellulophone-params.h) with its engine.

#include "cellulophone-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::cellulophone::info([](double fs) -> forte::Engine * { return new forte::cellulophone::CellulophoneEngine(fs); });
  return info;
}
