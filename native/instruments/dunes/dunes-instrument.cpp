// dunes-instrument.cpp — the Singing Dunes as the plugins and the WebAssembly build see it: its
// generated description (dunes-params.h) with its engine.

#include "dunes-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::dunes::info([](double fs) -> forte::Engine * { return new forte::dunes::DunesEngine(fs); });
  return info;
}
