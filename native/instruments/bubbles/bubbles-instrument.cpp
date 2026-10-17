// bubbles-instrument.cpp — the bubble organ as the plugins and the WebAssembly build see it: its
// generated description (bubbles-params.h) with its engine.

#include "bubbles-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::bubbles::info([](double fs) -> forte::Engine * { return new forte::bubbles::BubbleEngine(fs); });
  return info;
}
