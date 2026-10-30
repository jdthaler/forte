// clavicylinder-instrument.cpp — the Clavicylinder as the plugins and the WebAssembly build see it: its
// generated description (clavicylinder-params.h) with its engine.

#include "clavicylinder-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::clavicylinder::info([](double fs) -> forte::Engine * { return new forte::clavicylinder::ClavicylinderEngine(fs); });
  return info;
}
