// project8-instrument.cpp — the Project 8 as the plugins and the WebAssembly build see it: its
// generated description (project8-params.h) with its engine.

#include "project8-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::project8::info([](double fs) -> forte::Engine * { return new forte::project8::Project8Engine(fs); });
  return info;
}
