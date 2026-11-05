// site.h — the site's files a plugin's window serves (editor.h), for the views above its controls:
// the instrument's page (its folder: the page, its styles and scripts, its WebAssembly and data)
// and shared/, each packed as a gzipped tar archive (cmake/site.cmake, forte_site() in
// cmake/forte.cmake) and built into the plugin, so the window needs no network and shows the
// page as it was when the plugin was built.
#pragma once

#include <cstddef>

namespace forte {

struct Site {
  const unsigned char *data; // the archive
  size_t size;
};

} // namespace forte
