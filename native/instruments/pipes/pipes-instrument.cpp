// pipes-instrument.cpp — the pipe organ as the plugins and the WebAssembly build see it: its
// generated description (pipes-params.h) with its engine.

#include "pipes-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::pipes::info([](double fs) -> forte::Engine * { return new forte::pipes::PipeEngine(fs); });
  return info;
}
