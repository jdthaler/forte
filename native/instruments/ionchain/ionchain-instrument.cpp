// ionchain-instrument.cpp — the Ion Chain as the plugins and the WebAssembly build see it: its
// generated description (ionchain-params.h) with its engine.

#include "ionchain-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::ionchain::info([](double fs) -> forte::Engine * { return new forte::ionchain::IonChainEngine(fs); });
  return info;
}
