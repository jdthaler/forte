# view toggles that turn their views on and off

### Forte (patch)
- **Every view's toggle works:** on thirteen instrument pages some toggles did nothing (the RF
  Cavity Bells' passband among them). A view named by its title was looked up under a name that
  changed once its ⓘ was added.
- `tools/check-pages.mjs` turns every view's toggle off and on at every size, and on the desktop
  checks that the views turned on are still on after a reload and all show in Perform.

### Star Keyboard (patch)
- **No error when the spectrogram is on as the page loads:** it could draw before the page had
  set up the star it labels its axis from.
