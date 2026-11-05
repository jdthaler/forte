// entry-impl.cpp — the CLAP entry's functions for one instrument: its InstrumentInfo (from the
// instrument's library, forte_instrument()), its colour (FORTE_ACCENT_RGB, from forte_add_plugin)
// and its page for the window's views (FORTE_SITE, site.h) handed to the shared plugin (plugin.cpp).

#include "plugin.h"

const forte::InstrumentInfo &forte_instrument();

#ifdef FORTE_ACCENT_RGB
#define FORTE_ACCENT "#" FORTE_ACCENT_RGB
#else
#define FORTE_ACCENT ""
#endif

#ifdef FORTE_SITE
extern const forte::Site FORTE_SITE;
#define FORTE_SITE_PTR &FORTE_SITE
#else
#define FORTE_SITE_PTR nullptr
#endif

bool forte_entry_init(const char *) { return forte::entryInit(forte_instrument(), FORTE_ACCENT, FORTE_SITE_PTR); }
void forte_entry_deinit() {}
const void *forte_entry_get_factory(const char *id) { return forte::entryFactory(id); }
