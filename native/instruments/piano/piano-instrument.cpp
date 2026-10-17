// piano-instrument.cpp — the Ribbon Piano as the plugins and the WebAssembly build see it: its
// generated description (piano-params.h) with its engine, and MIDI velocity as the hammer's
// speed (the descriptor's midiVelocity: velocity / 127 → 0.25 … 6 m/s).

#include <cmath>

#include "piano-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::piano::info([](double fs) -> forte::Engine * { return new forte::piano::PianoEngine(fs); },
                                                               [](double v) { return 0.25 * std::pow(24.0, v); });
  return info;
}
