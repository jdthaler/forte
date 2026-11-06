# a hung page view fails the page check by name

### Forte (patch)
- `tools/check-pages.mjs` gives each page view 300 s (`--timeout` changes it). A view that hangs, as a few did on GitHub's runners and held the `pages` job for hours, is listed by name (`HUNG  kalimba/ phone: timed out after 300 s while opening the instrument menu (running …)`) with the step it was at and the JavaScript the page was running, paused in the debugger. Its browser context is closed, the other views carry on, and the view is opened once more in a new context: a page that hangs twice fails.
- A click in the page check waits up to 10 s for its target, not 2 s, so a busy runner no longer fails a toggle that works. Each pass also says how long its slowest page view took.
