# the Forte app on its own, and app icons

### Forte (minor)
- **The Forte app on its own:** each system's box under All Plugins has a **Forte app** link,
  `Forte-app-<system>`, with just the one app that plays every instrument, and its Makefile
  (`make install-app`). It is in the release beside the other archives.
- **Icons for the standalone apps:** on macOS and Windows the Forte app has the site's icon and
  each instrument's app the same drawing in its instrument's colour (`native/icons/`, drawn by
  `tools/make-icons.py`). Linux's apps are plain executables and have none.
