# Forte

Keyboard instruments synthesised in the browser from their physics: plain
JavaScript, no build step, no dependencies. The site is
<https://forte.jthaler.net>, served by GitHub Pages from `main`.

Read first:
- `README.md`: what the project is and how to play it.
- `docs/INSTRUMENT_GUIDE.md`: the anatomy of an instrument, the shared code
  in `shared/`, the engine contract, parameters and tests. Read it before
  changing an instrument or `shared/`.
- `CHANGELOG.md`: the versioning rules are at the top.

## Commands

- `npm run serve` serves the site at <http://localhost:8765> (AudioWorklets
  need HTTP).
- `npm test` runs every `test/*-tests.mjs` in parallel; `npm test gongs`
  runs one suite.
- `CI=1 npm test` is what GitHub Actions runs: it skips the CPU-timing
  tests. They are calibrated on a desktop machine and fail on slow or
  shared ones, so when one fails, run the same test on `main` before
  blaming the change.

## Making a change

1. **Branch.** Work on a branch, never directly on `main`. Behaviour that
   every page shares belongs in `shared/`.
2. **Verify.**
   - `CI=1 npm test` passes.
   - Look at anything visible in a browser (headless Playwright and
     Chromium will do), on every page it touches:
     - phone, portrait 390×664 and landscape 750×340, emulating an iPhone
       with touch and with Web MIDI removed (no iOS browser has it:
       `delete Navigator.prototype.requestMIDIAccess` in an init script);
     - tablet (iPad, both orientations) and desktop (1440×900, and a
       narrow window around 900px).
   - Check that nothing scrolls sideways
     (`document.documentElement.scrollWidth` wider than the viewport),
     with the menus, Controls and Views ▾ open and with audio started.
   - When a change should leave some sizes alone, compare screenshots with
     `main` (a `git worktree` of `main`, served on a second port). Only
     animations should differ.
   - Emulation is not Safari. Say in the pull request what still needs a
     real iPhone or iPad (text inflation, zoom on focus, safe areas,
     Safari's toolbars).
3. **Version and changelog.** Every change to the site bumps a version
   (semver, all 0.x):
   - Forte covers `shared/`, the landing page and `tools/`: bump `version`
     in `package.json` and `FORTE_VERSION` in `shared/registry.js`
     together.
   - An instrument covers its folder, its tests and its demos: bump its
     `version` in `shared/registry.js`.
   - Add `### Forte X.Y.Z` or `### <Instrument name> X.Y.Z` under a new
     `## YYYY-MM-DD — <topic>` heading at the top of `CHANGELOG.md`.
     `test/site-tests.mjs` checks that versions agree and have entries.
   - Update `README.md` and `docs/INSTRUMENT_GUIDE.md` when what they
     describe changes. Changes to docs alone (README, guides, this file)
     need no version.
4. **Commit.** Name every version bumped in the title, e.g.
   `Forte 0.3.1: lay out instrument pages properly on phones`. The body
   says why, what changed and how it was checked.
5. **Pull request** into `main`, with *Why*, *What changed* and *Testing*
   sections.
6. **CI.** The `physics` workflow runs on the push and on the pull request.
   Fix a failure at its root; never skip or weaken a test to get green.
7. **Merge** with a merge commit (not squash or rebase) once `physics` is
   green on the pull request's latest commit and nothing conflicts, and
   only when the owner has asked for the merge.
8. **Tag** the merge commit on `main`, one annotated tag per version
   bumped, then push it:

   ```bash
   git tag -a forte-v0.3.1 -m "forte 0.3.1" <merge commit>
   git push origin forte-v0.3.1
   ```

   An instrument's tag is its id: `gongs-v0.1.1`, with message
   `gongs 0.1.1`. Claude Code cloud sessions can push branches but not
   tags (GitHub answers 403), so there the owner pushes the tag.
