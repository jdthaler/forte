# Forte

Keyboard instruments synthesised in the browser from their physics: plain
JavaScript, no build step, no dependencies. The site is
<https://forte.jthaler.net>, served by GitHub Pages from the `live` branch.
`main` is where work lands; `live` moves only when `main` is released
(below).

Read first:
- `README.md`: what the project is and how to play it.
- `docs/INSTRUMENT_GUIDE.md`: the anatomy of an instrument, the shared code
  in `shared/`, the engine contract, parameters and tests. Read it before
  changing an instrument or `shared/`.
- `CHANGELOG.md` and `changes/README.md`: versions, and the notes that
  become them.
- `docs/ROADMAP.md`: what 1.0 means, what is left before it, and the
  feature wishlist. Update it when a wishlist item lands or is decided.
- `docs/PLUGINS.md`: the plan (and its decisions) for native plugins and
  the move of the physics to C++ and WebAssembly. Read it before working on
  `native/` or an instrument's port.

## Commands

- `npm run serve` serves the site at <http://localhost:8765> (AudioWorklets
  need HTTP).
- `npm test` runs every `test/*-tests.mjs` in parallel; `npm test gongs`
  runs one suite.
- `cd native && cmake --preset linux && cmake --build --preset linux &&
  ctest --preset linux` builds the plugins and the native tests
  (`native/README.md`; the `wasm` preset needs Emscripten).
- `node tools/release.mjs --dry-run` shows what the next release would
  bump and the changelog entry it would write.
- `CI=1 npm test` is what GitHub Actions runs: it skips the CPU-timing
  tests. They are calibrated on a desktop machine and fail on slow or
  shared ones, so when one fails, run the same test on `main` before
  blaming the change.

## Making a change

1. **Branch.** Work on a branch off `main`, never directly on `main` or
   `live`. Behaviour that
   every page shares belongs in `shared/`.
2. **Verify.**
   - `CI=1 npm test` passes.
   - `node tools/check-pages.mjs --base origin/main` passes when the change
     touches a page or `shared/`. It opens every page at the sizes below
     (with the menus, Controls and the views open, and audio started) and
     fails on console errors, sideways scrolling, perform controls, ⓘ
     buttons, "Default settings" or keys gone missing, or front-page Listen
     buttons that are missing or don't play; it lists every
     count that differs from `main`, and each one should be one the change
     meant. The `pages` job in CI runs the same against the pull request's
     base. A filter checks fewer pages: `node tools/check-pages.mjs gongs`.
   - Look at anything visible in a browser (headless Playwright and
     Chromium will do), on every page it touches:
     - phone, portrait 390×664 and landscape 750×340, emulating an iPhone
       with touch and with Web MIDI removed (no iOS browser has it:
       `delete Navigator.prototype.requestMIDIAccess` in an init script);
     - tablet (iPad, both orientations) and desktop (1440×900, and a
       narrow window around 900px).
   - When a change should leave some sizes alone, compare screenshots with
     `main` (a `git worktree` of `main`, served on a second port). Only
     animations should differ.
   - Emulation is not Safari. Say in the pull request what still needs a
     real iPhone or iPad (text inflation, zoom on focus, safe areas,
     Safari's toolbars).
3. **Release note, not a version.** A pull request into `main` bumps no
   version (semver, all 0.x). It adds one note to `changes/`
   (`changes/README.md`): a `# <topic>` line, then a
   `### Forte (minor|patch)` or `### <Instrument name> (major|minor|patch|new)`
   section for each part it changes, with the lines for the changelog.
   An instrument at 1.0 or later whose contract breaks (parameters or presets
   that saved songs rely on, `tools/contract.mjs`) needs `major`.
   - Forte covers `shared/`, the landing page and `tools/`; an instrument
     covers its folder, its tests, its demos and its port.
   - Changes to docs alone (README, guides, this file) and to CI need no
     note. The `tests` workflow checks a pull request for both rules.
   - Update `README.md` and `docs/INSTRUMENT_GUIDE.md` when what they
     describe changes.
4. **Commit.** The title says what changed, e.g.
   `Lay out instrument pages properly on phones`; no version, since none
   is bumped. The body says why, what changed and how it was checked.
5. **Pull request** into `main`, with *Why*, *What changed* and *Testing*
   sections.
6. **CI.** `tests` (the JavaScript suites, the release-note rules and
   `pages`, every page in Chromium) and `native` (the WebAssembly, and the plugins on Linux) run on the
   pull request, once per push to it, and again on `main` after the merge. `native` builds nothing when a green run on
   the branch or on `main` already built the same sources (`native/`,
   `package.json`, the committed `.wasm`), so a site or docs change passes
   it at once. Fix a failure at its root; never skip or weaken a test to
   get green.
7. **Before the merge**, if `main` has moved since CI ran, merge it into
   the branch and let CI run again, so what was checked is what lands
   (two threads changing `shared/` can each pass alone and break
   together).
8. **Merge** with a merge commit (not squash or rebase) once CI is green
   on the pull request's latest commit and nothing conflicts, without
   waiting to be asked: merging into `main` publishes nothing, and the
   owner hears and sees `main` before each release. A release into
   `live` waits for the owner (below).

## Releasing `main` to `live`

Only when the owner asks for a release:

1. On a branch off the latest `main`, run `node tools/release.mjs`. It
   gathers the notes in `changes/` into one `## YYYY-MM-DD — <topics>`
   entry at the top of `CHANGELOG.md`, bumps each version named once by
   the largest kind its notes give (Forte in `package.json` and
   `FORTE_VERSION` together), regenerates the plugins'
   `<slug>-info.cmake`, and deletes the notes. Nothing else needs
   rebuilding: the `.wasm` files carry no version.
2. Commit with every version bumped in the title, e.g.
   `Release Forte 0.31.0, Gong Keyboard 0.4.1`, and open a pull request
   into `live` whose body is the new changelog entry.
3. CI runs on it as on any pull request (`native` builds the plugins on
   Linux only), and `tests` also checks that no notes are left. So it is
   green in minutes, and the site waits on nothing slower. Whatever fails
   is fixed on `main` first, then the release branch merges `main` in.
4. Merge it with a merge commit when the owner asks. GitHub Pages
   publishes `live` at once. The plugins follow: the push to `live` runs
   `native` in full (macOS, Windows, auval and the release archives, the
   downloads' Makefile and `install.cmd` tried on each), and when it is
   green `release-plugins` publishes them if they changed. Until then the
   downloads stay the latest plugin release's, and each Plugin dialog says
   which release that is and which instruments or versions are still to
   come (`shared/plugins.js`). If that run fails, the site stays up with the
   older plugins: fix it on `main` and release again (a run that failed
   for no reason of the code's can be re-run on `live` instead). A newer
   release pushed while it builds replaces it.
5. Then bring `live` back into `main` with a pull request: a branch at
   `live` into `main`, merged with a merge commit once green (the
   release-note check looks only at what it adds beyond `live`). No workflow
   does this: `main`'s ruleset refuses a push that hasn't passed its required
   checks, and a pull request opened by a workflow runs none.

Releases are not tagged any more (Claude Code cloud sessions cannot push
tags). The changelog and the commit titles record each version.
