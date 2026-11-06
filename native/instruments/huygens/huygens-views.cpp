// huygens-views.cpp — what the plugin window's views read from the engine beyond its messages
// (plugin/site.h): with msg::state, the lamps' firings since the last and each oscillator's
// summary, which the page's translator reads from the engine's memory (huygens/src/huygens-wasm.js)
// and the plugin copies out on the audio thread. The plugins' only, not the WebAssembly's.

#include <algorithm>

#include "huygens-engine.h"
#include "site.h"

using forte::huygens::NeonEngine;

namespace {
void listen(forte::Engine &e, bool on) { static_cast<NeonEngine &>(e).listening = on; }
// [firings, oscillators, t, hold, the firings…, the oscillators…], as huygens_state lays them out
int attach(const forte::Engine &e, const forte::Message &m, double *out, int cap) {
  if (m.type != forte::huygens::msg::state) return 0;
  const NeonEngine &h = static_cast<const NeonEngine &>(e);
  const int n = 4 + h.stateFires + h.stateOsc;
  if (n > cap) return 0;
  out[0] = h.stateFires; out[1] = h.stateOsc; out[2] = (double)h.stateT; out[3] = h.stateHold;
  std::copy(h.fireBuf, h.fireBuf + h.stateFires, out + 4);
  std::copy(h.oscBuf, h.oscBuf + h.stateOsc, out + 4 + h.stateFires);
  return n;
}
} // namespace

extern const forte::Views forte_views;
const forte::Views forte_views{listen, attach};
