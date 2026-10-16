// entry-impl.cpp — the CLAP entry's functions for one instrument: its InstrumentInfo (from the
// instrument's library, forte_instrument()) handed to the shared plugin (plugin.cpp).

#include "plugin.h"

const forte::InstrumentInfo &forte_instrument();

bool forte_entry_init(const char *) { return forte::entryInit(forte_instrument()); }
void forte_entry_deinit() {}
const void *forte_entry_get_factory(const char *id) { return forte::entryFactory(id); }
