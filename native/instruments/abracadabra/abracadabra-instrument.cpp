// abracadabra-instrument.cpp — the ABRACADABRA as the plugins and the WebAssembly build see it: its
// generated description (abracadabra-params.h) with its engine.

#include "abracadabra-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::abracadabra::info([](double fs) -> forte::Engine * { return new forte::abracadabra::AbracadabraEngine(fs); });
  return info;
}
