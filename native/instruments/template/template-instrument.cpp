// template-instrument.cpp — the template as the plugins and the WebAssembly build see it: its
// generated description (template-params.h) with its engine.

#include "template-engine.h"

const forte::InstrumentInfo &forte_instrument() {
  static const forte::InstrumentInfo info = forte::template_::info([](double fs) -> forte::Engine * { return new forte::template_::TemplateEngine(fs); });
  return info;
}
