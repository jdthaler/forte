// tines-instrument.cpp — the Tine Piano as the plugins and the WebAssembly build see it: its
// generated description (tines-params.h) with its engine, and MIDI velocity as the hammer's speed
// (the descriptor's midiVelocity: velocity / 127 → 0.25 … 5 m/s).

#include <cmath>

#include "tines-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::tines::info([](double fs) -> forte::Engine * { return new forte::tines::TinesEngine(fs); },
                                                               [](double v) { return 0.25 * std::pow(20.0, v); });
  return info;
}
