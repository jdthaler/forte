# Notes for the next release

A pull request into `main` bumps no version. It adds one note here instead, a Markdown file with
any name (say, the branch's topic: `black-hole-spin.md`), saying what it changes and how much:

```markdown
# the black hole's spin reads as itself in the plugins

### Forte (minor)
- A plugin parameter's text can be scale·10^(−v) + offset, …

### Black-Hole Keyboard (patch)
- **The plugins show the spin as the page does:** …
```

- The first line, `# <topic>`, is a few words on the change; the release's `CHANGELOG.md` heading
  joins the topics of every note it gathers.
- Each `### <name> (<kind>)` section is Forte (`shared/`, the landing page, `tools/`, the docs'
  template) or an instrument, by its name in `shared/registry.js` (an instrument covers its folder,
  its tests, its demos and its port in `native/instruments/<id>/`). Its lines go under that name's
  new version in `CHANGELOG.md`, as they are.
- The kind is `minor` (something new, or a change to the sound or the parameters), `patch` (a fix
  that changes neither), `major` (a change that breaks songs saved with the plugins: see below) or
  `new` (an instrument's first release: give it `ready: true` and its first version, usually
  `0.1.0`, in `shared/registry.js`). `major` takes 0.x to 1.0.0.
- From 1.0 on, an instrument whose contract breaks needs `major`: removing, renaming or rescaling
  a parameter, changing its default, moving or removing a choice's option or a preset, or changing
  a preset's values (`tools/contract.mjs`, `node tools/contract.mjs` lists them). Below 1.0 the
  `tests` workflow only warns.
- Changes to the documentation (Markdown at the top level, in `docs/` and in `native/`) and to CI
  need no note.

`npm test` checks the notes (`test/site-tests.mjs`), and the `tests` workflow checks that a pull
request into `main` adds one when it changes the site or the plugins and changes no version.

Releasing `main` to `live` (`CLAUDE.md`) runs `node tools/release.mjs`, which gathers the notes
into one `CHANGELOG.md` entry, bumps each version once by the largest kind its notes give,
regenerates the plugins' `<slug>-info.cmake`, saves each new version's plugin state in
`native/tests/states/` and deletes the notes. `--dry-run` shows it first.
