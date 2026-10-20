# the controls no longer show above their toggles as they scroll

### Forte (patch)
- **Scrolled, the controls pass under their row of toggles:** they showed in a strip above it,
  in the panel's top padding, both below the views and beside them.
- `tools/check-pages.mjs` scrolls the Controls panel in both arrangements and fails if anything
  shows above its toggles.
