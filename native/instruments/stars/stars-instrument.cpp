// stars-instrument.cpp — the Star Keyboard as the plugins and the WebAssembly build see it: its
// generated description (stars-params.h) with its engine.

#include "stars-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::stars::info([](double fs) -> forte::Engine * { return new forte::stars::StarEngine(fs); });
  return info;
}
