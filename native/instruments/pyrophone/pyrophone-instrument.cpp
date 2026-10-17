// pyrophone-instrument.cpp — the pyrophone as the plugins and the WebAssembly build see it: its
// generated description (pyrophone-params.h) with its engine.

#include "pyrophone-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::pyrophone::info([](double fs) -> forte::Engine * { return new forte::pyrophone::PyrophoneEngine(fs); });
  return info;
}
