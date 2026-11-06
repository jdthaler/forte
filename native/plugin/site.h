// site.h — the site's files a plugin's window serves (editor.h), for the views above its controls:
// the instrument's page (its folder: the page, its styles and scripts, its WebAssembly and data)
// and shared/, each packed as a gzipped tar archive (cmake/site.cmake, forte_site() in
// cmake/forte.cmake) and built into the plugin, so the window needs no network and shows the
// page as it was when the plugin was built.
#pragma once

#include <cstddef>

namespace forte {

class Engine;
struct Message;

struct Site {
  const unsigned char *data; // the archive
  size_t size;
};

// What an instrument's views read beyond its messages, where its page's translator reads the
// engine's memory (<slug>-wasm.js): the window has no such memory, so the plugin copies the data
// out on the audio thread, with the message it goes with, and the page's translator finds it in
// the message (shared/in-plugin.js). An instrument that needs it gives forte_add_plugin a VIEWS
// source (<slug>-views.cpp) that defines `const forte::Views forte_views`.
struct Views {
  void (*listen)(Engine &, bool on); // the engine keeps what its views read while on (or null)
  // a message's data: how many numbers it wrote to out (at most cap; 0: none)
  int (*attach)(const Engine &, const Message &, double *out, int cap);
};

} // namespace forte
