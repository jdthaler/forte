# the site goes live before the plugins finish building

### Forte (minor)
- **A release puts the site up in minutes:** its pull request into `live` builds the plugins on
  Linux only, like any other, and the macOS and Windows builds, auval and the release archives
  run on `live` after the merge. The plugin release follows when that run is green.
- **The downloads say which plugin release they are:** under the downloads, All Plugins and each
  instrument's Plugin dialog name the latest plugin release, and say so when this version of the
  site or the instrument is newer and its plugins are still to come. An instrument not in a plugin
  release yet shows no downloads until it is.
