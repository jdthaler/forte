# a hung page view fails the page check by name

### Forte (patch)
- `tools/check-pages.mjs` gives each page view 300 s (`--timeout` changes it). A view that hangs, as a few did under load in CI and held the `pages` job for hours, now fails by name with the step it was at (`HUNG  ondes/ phone: timed out after 300 s while …`), its browser context is closed, and the other views carry on. Each pass also says how long its slowest page view took.
