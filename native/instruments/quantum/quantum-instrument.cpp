// quantum-instrument.cpp — the Quantum Keyboard as the plugins and the WebAssembly build see it: its
// generated description (quantum-params.h) with its engine.

#include "quantum-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::quantum::info([](double fs) -> forte::Engine * { return new forte::quantum::QuantumEngine(fs); });
  return info;
}
