# ready for 1.0: saved songs kept, and Windows downloads that install themselves

### Forte (minor)
- **Saved songs are watched:** each instrument's parameters and presets, as songs saved with its
  plugins rely on them, are listed in `native/instruments/<slug>/<slug>-contract.json`. A pull
  request that removes, renames or rescales a parameter, or moves, renames or changes a preset, is
  warned about now and will need a major version from 1.0 on (`tools/contract.mjs`). Release notes
  take a `major` kind, which takes 0.x to 1.0.0.
- Every release keeps the state its plugins save (`native/tests/states/`), and the plugin tests
  load every one into today's plugins with its values.
- **The Windows downloads install themselves:** double-click `install.cmd` to put the VST3s and
  CLAPs where every DAW looks (Windows asks once for administrator rights) and the apps in your
  own Programs folder with Start menu shortcuts, and to clear the download mark SmartScreen warns
  about. `install.cmd verify`, `uninstall`, `check` and `unblock` work as the Makefile's do on
  macOS and Linux, one format at a time too.
