# the site works offline

### Forte (minor)
- **Forte works offline:** on the first visit the browser keeps a copy of the whole site in the background (about 5 MB), so every instrument then opens and plays without a network, the iPhone's home-screen app above all. A service worker (`sw.js`) serves each page and everything it loads (scripts, styles, WebAssembly, READMEs, icons) from the copy, online or not, so a page never mixes files from two releases; the front page's demos and the link pictures stay online only.
- A new release downloads in the background, only the files that changed, each checked against the release's list, and takes over on the way to the next page when no other Forte tab shows the old one (or once every Forte page is closed). A home-screen app left open looks for one when it comes back after an hour.
- Offline, an address the site doesn't have shows the site's 404 page, and a demo's ▶ Listen button goes back when it can't play.
- `tools/release.mjs` writes the service worker's list (`tools/offline.mjs`) as the release's last step, and a pull request into `live` fails when it isn't the site's; `tools/check-offline.mjs` (in the `pages` job) opens every page offline, starts its audio and tries a release.
