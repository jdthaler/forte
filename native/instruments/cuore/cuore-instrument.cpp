// cuore-instrument.cpp — the CUORE as the plugins and the WebAssembly build see it: its
// generated description (cuore-params.h) with its engine.

#include "cuore-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::cuore::info([](double fs) -> forte::Engine * { return new forte::cuore::CuoreEngine(fs); });
  return info;
}
