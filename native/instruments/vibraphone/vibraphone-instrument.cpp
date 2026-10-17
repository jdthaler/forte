// vibraphone-instrument.cpp — the vibraphone as the plugins and the WebAssembly build see it: its
// generated description (vibraphone-params.h) with its engine.

#include "vibraphone-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::vibraphone::info([](double fs) -> forte::Engine * { return new forte::vibraphone::VibraphoneEngine(fs); });
  return info;
}
