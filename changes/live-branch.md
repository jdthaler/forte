# a live branch, and versions bumped only when it is released

### Forte (minor)
- **Releases:** the site is published from a `live` branch, and `main` is where pull requests
  land. A pull request bumps no version: it adds a note to `changes/` (`changes/README.md`), and
  releasing `main` to `live` (`node tools/release.mjs`) gathers the notes into the changelog and
  bumps each version once. The `tests` workflow checks both rules on every pull request.
- **CI:** pull requests into `main` build and validate the plugins on Linux only, without packaging
  them; macOS, Windows, auval and the release archives run on a pull request into `live`, on
  `live` itself, or when started by hand. The plugin release follows a green `native` run on
  `live` instead of `main`.
- An instrument's version reaches its plugins from `<slug>-info.cmake` when they are built, not
  through `<slug>-params.h`, so the WebAssembly no longer carries it and a version bump leaves the
  committed `.wasm` files alone. Every `.wasm` is rebuilt once for this; the sound and the
  parameters are unchanged.
