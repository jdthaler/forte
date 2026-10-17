// entry-impl.cpp — the CLAP entry's functions for one instrument: its InstrumentInfo (from the
// instrument's library, forte_instrument()) and its colour (FORTE_ACCENT_RGB,
// from forte_add_plugin) handed to the shared plugin (plugin.cpp).

#include "plugin.h"

const forte::InstrumentInfo &forte_instrument();

#ifdef FORTE_ACCENT_RGB
#define FORTE_ACCENT "#" FORTE_ACCENT_RGB
#else
#define FORTE_ACCENT ""
#endif

bool forte_entry_init(const char *) { return forte::entryInit(forte_instrument(), FORTE_ACCENT); }
void forte_entry_deinit() {}
const void *forte_entry_get_factory(const char *id) { return forte::entryFactory(id); }
