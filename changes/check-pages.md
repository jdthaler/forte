# every page checked in a browser on every pull request

### Forte (minor)
- **`tools/check-pages.mjs` opens every page in headless Chromium** at the phone, tablet and desktop sizes, with the menus, Controls and views open and audio started, and fails on console errors, sideways scrolling, or perform controls, ⓘ buttons, "Default settings" or keys gone missing; `--base main` lists every count that differs from main. CI's new `pages` job runs it on every push and pull request.
