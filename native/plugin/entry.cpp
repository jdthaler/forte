// entry.cpp — the exported clap_entry, compiled into each format (clap-wrapper's clap-first build).

#include <clap/clap.h>

bool forte_entry_init(const char *path);
void forte_entry_deinit();
const void *forte_entry_get_factory(const char *id);

extern "C" {
#ifdef __GNUC__
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wattributes"
#endif
CLAP_EXPORT const clap_plugin_entry_t clap_entry = {CLAP_VERSION, forte_entry_init, forte_entry_deinit, forte_entry_get_factory};
#ifdef __GNUC__
#pragma GCC diagnostic pop
#endif
}
