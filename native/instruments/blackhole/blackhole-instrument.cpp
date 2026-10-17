// blackhole-instrument.cpp — the Black-Hole Keyboard as the plugins and the WebAssembly build see
// it: its generated description (blackhole-params.h) with its engine, and MIDI velocity as the
// descriptor maps it (velocity / 127, to the power 1.5).

#include "blackhole-engine.h"
#include "forte/fdlibm.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::blackhole::info([](double fs) -> forte::Engine * { return new forte::blackhole::RingdownEngine(fs); },
                                                                   [](double v) { return forte::fdlibm::pow(v, 1.5); });
  return info;
}
