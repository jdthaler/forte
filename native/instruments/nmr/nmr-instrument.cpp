// nmr-instrument.cpp — the NMR Spin Echo as the plugins and the WebAssembly build see it: its
// generated description (nmr-params.h) with its engine.

#include "nmr-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::nmr::info([](double fs) -> forte::Engine * { return new forte::nmr::NmrEngine(fs); });
  return info;
}
