# a Windows installer and Linux packages

### Forte (minor)
- **A Windows installer:** All Plugins' Windows box has *Installer*,
  `Forte-plugins-windows-setup.exe`, with every instrument in every format. Its Components page
  installs everything, the Forte app alone, or the formats and instruments you tick; the VST3s
  and CLAPs go where every DAW looks, the apps in `C:\Program Files\Forte` with Start menu
  shortcuts, and it uninstalls from Settings. Unsigned, so SmartScreen asks once.
- **Linux packages:** All Plugins' Linux box has *.deb* (Debian 13, Ubuntu 24.04, Mint 22 and
  later) and *.rpm* (Fedora 40 and later), with every instrument in `/usr/lib/vst3`,
  `/usr/lib/clap` and `/usr/lib/forte`, the Forte app in the app menu and as `forte`, and the
  libraries they need. A newer package upgrades the one before.
- The `native` workflow builds both on its full runs and installs, verifies and uninstalls each
  on a clean system (Windows; Debian, Ubuntu and Fedora containers) before a release keeps them.
- The download boxes wrap between their groups (All, the formats, the Forte app, the
  installers), never in the middle of one, so a phone no longer leaves a bar at a line's end.
