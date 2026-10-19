// kalimba-instrument.cpp — the Kalimba as the plugins and the WebAssembly build see it: its
// generated description (kalimba-params.h) with its engine.

#include "kalimba-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::kalimba::info([](double fs) -> forte::Engine * { return new forte::kalimba::KalimbaEngine(fs); });
  return info;
}
