// springs-views.cpp — what the plugin window's views read from the engine beyond its messages
// (plugin/site.h): with msg::echo, the strike's first moments from the engine's capture, which the
// page's translator reads from the engine's memory (springs/src/springs-wasm.js) and the plugin
// copies out on the audio thread. The plugins' only, not the WebAssembly's.

#include <algorithm>

#include "site.h"
#include "springs-engine.h"

using forte::springs::SpringEngine;

namespace {
int attach(const forte::Engine &e, const forte::Message &m, double *out, int cap) {
  if (m.type != forte::springs::msg::echo) return 0;
  const SpringEngine &s = static_cast<const SpringEngine &>(e);
  const int n = std::min({(int)m.values[0], (int)s.capture.size(), cap});
  if (n <= 0) return 0;
  std::copy(s.capture.begin(), s.capture.begin() + n, out);
  return n;
}
} // namespace

extern const forte::Views forte_views;
const forte::Views forte_views{nullptr, attach};
