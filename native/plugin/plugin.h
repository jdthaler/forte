// plugin.h — the CLAP plugin every instrument shares (plugin.cpp).
#pragma once

#include <string>

#include <clap/clap.h>

#include "forte/instrument.h"
#include "site.h"

namespace forte {

// accent: the window's colour, "#rrggbb" (the instrument's page's), or "" for Forte's; site: its
// page, for the window's views (site.h), or null for none
bool entryInit(const InstrumentInfo &info, const char *accent = "", const Site *site = nullptr);
const void *entryFactory(const char *id);

// The Forte app: every instrument in one plugin (net.jthaler.forte.suite), switched from the
// Instrument menu in its window. forte_add_suite() (cmake/forte.cmake) lists them; version is
// Forte's.
struct SuiteEntry {
  const InstrumentInfo &(*info)();
  const char *accent;
  const Site *site; // its page (site.h), or null
};
bool entrySuite(const SuiteEntry *instruments, int count, const char *version);

// The editor's calls (plugin.cpp), as JSON, without a window: an extension of the plugin's for
// the tests. call(plugin, "[\"set\", 0, 0.5]") returns the reply as JSON.
constexpr const char *kEditorBridge = "net.jthaler.forte.editor-bridge";
struct EditorBridge {
  std::string (*call)(const clap_plugin_t *plugin, const char *json);
};

} // namespace forte
