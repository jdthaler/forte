// plugin.h — the CLAP plugin every instrument shares (plugin.cpp).
#pragma once

#include <string>

#include <clap/clap.h>

#include "forte/instrument.h"

namespace forte {

// accent: the window's colour, "#rrggbb" (the instrument's page's), or "" for Forte's
bool entryInit(const InstrumentInfo &info, const char *accent = "");
const void *entryFactory(const char *id);

// The editor's calls (plugin.cpp), as JSON, without a window: an extension of the plugin's for
// the tests. call(plugin, "[\"set\", 0, 0.5]") returns the reply as JSON.
constexpr const char *kEditorBridge = "net.jthaler.forte.editor-bridge";
struct EditorBridge {
  std::string (*call)(const clap_plugin_t *plugin, const char *json);
};

} // namespace forte
