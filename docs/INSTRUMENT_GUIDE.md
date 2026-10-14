# Building a Forte instrument

Every instrument in Forte has the same anatomy, so a new one is mostly
physics. Start from the template:

```bash
node tools/new-instrument.mjs <slug> <EngineName> "<Display Name>"
```

This creates a working (if simple) instrument: struck free–free bars,
with a page, an engine, tests, a render tool and a README skeleton. It
lives at `docs/template/` and is playable at `/docs/template/`. Then
replace the bar physics with yours.

## Principles

* **Physics, not samples.** The sound comes from integrating a model of the
  mechanism. There are no recorded waveforms and no ADSR envelopes. An
  attack is a hammer, pluck, bow or flame, and a release is a damper,
  friction or radiation. Tables computed from physics (eigenmodes, QNM
  frequencies) are fine.
* **Knobs are physical.** Each parameter has a unit and a meaning: a
  length, a stiffness, a gap, a temperature. Its hint says what it does
  to the sound. Expose the things the real instrument hides (where the
  hammer lands, the pickup's offset) and let them go beyond the real
  instrument's range.
* **Tested against something independent.** That means a textbook result
  (cantilever ratios, Bessel zeros), a published number (QNM tables,
  measured decay times), a conservation law, or a limit in which the
  model has a closed form. Then test that the engine produces what the
  model predicts (pitch, decay, spectrum).
* **Honest README.** Give the equations, the numbers and their sources,
  what you can hear, and what is simplified. The README is also the
  page's **How it works** notes, so write it for players as well as for
  developers.

## Anatomy

```
<slug>/index.html             page (DOM ids the shell expects; see docs/template/index.html)
<slug>/style.css              palette: --accent, --accent-2, --accent-ink (+ any extra layout)
<slug>/src/<slug>-model.js    the physics: pure functions, no DOM, no audio
<slug>/src/<slug>-engine.js   real-time engine class (AudioWorklet and Node)
<slug>/src/<slug>-params.js   GROUPS, DEFAULTS, PRESETS
<slug>/src/<slug>-main.js     createShell(…) + views
<slug>/README.md
test/<slug>-tests.mjs         run by CI (any test/*-tests.mjs)
tools/render-<slug>.mjs       demos → examples/<slug>/NN-name.wav
```

Split the model across more files when it grows (`<slug>/src/plate.js`,
`<slug>/src/flame.js`, …).

### Shared code (`shared/`)

| file | what |
|---|---|
| `shell.js` | everything common to instrument pages: audio graph (room, volume, tone, limiter, analyser), computer keyboard and on-screen keys, MIDI (notes, velocity, CC64, CC1), parameter sidebar with presets and local storage, octave shift, toasts. See the header for the config. |
| `worklet.js` | the generic AudioWorklet processor. It loads your engine by its `globalThis` name. |
| `dsp.js` | `modeCoeffs` (exact two-pole modal resonator), `Biquad`, `OnePole`, `DCBlock`, `Delay` (fractional), `keyPan`, `keyFreq`, `sigmaFromT60` |
| `linalg.js` | `symEig`, `genEig` (generalised symmetric), `cholesky` |
| `views.js` | `fit`, `css`, `animate`, `SpectrumView` (live spectrum + model markers), `ScopeView` |
| `impulses.js` | `roomIR` (the synthetic room the shell uses) |
| `registry.js` | the instrument list behind the landing page and the menus |
| `notes.js`, `markdown.js` | **How it works**: the page's README in a dialog (button by the title, or a link to `…/#about`) |
| `instrument.css`, `forte.css` | page layout; Forte nav and notes |

The older five instruments predate the shell and have their own page code.
New instruments should use the shell.

### Engine contract

The class runs unchanged in the AudioWorklet and in Node:

```js
export class GongEngine {
  constructor(fs) { … }
  setParams(P) { … }               // the whole parameter object (or the page's engineParams(P))
  noteOn(key, velocity, data) { … } // velocity 0..1; data from the page's noteData(key, vel), if any
  noteOff(key) { … }
  setSustain(on) { … }             // optional
  allNotesOff() { … }              // optional (Panic)
  handle(msg) { … }                // optional: other messages, incl. MIDI { type: 'pressure', value, key } and { type: 'bend', value }
  voiceCount() { … }               // optional, shown in the CPU pill
  process(L, R, n) { … }           // fill n samples (n = 128 in the browser)
}
globalThis.GongEngine = GongEngine;
```

`this.post(msg)` (set by the worklet wrapper) sends data back to the page,
for example to drive a live view. Check `if (this.post)` first, because it
is absent in Node.

Rules of thumb:

* **Budget:** ≤ 30 % of one core with 10 voices at 48 kHz on a laptop. Watch
  the CPU pill.
* **No allocation in `process`.** Allocate per voice, at note-on.
* **Expensive setup** (eigen-solves, tables) belongs in the model. Cache it
  per key and parameter version. If it is slow (> 5 ms), compute it on the
  page and send it with `noteData`.
* **Numerical stability.** Prefer exact discretisations (`modeCoeffs`) or
  implicit/symplectic schemes. Solve nonlinear contacts implicitly
  (Newton), and oversample nonlinear stages when they alias.
* **Level:** a single forte note peaks around 0.1–0.5, so a chord fits under
  the shell's limiter. Test it. Loudness across instruments is matched
  afterwards with the registry's `trim` (dB): run `node tools/loudness.mjs`,
  set the trim it suggests, and `test/level-tests.mjs` keeps it there.
* **Stereo** only for a physical reason: two pickups, two mics, the pan
  of the key across the instrument, or h₊/h×.

### Parameters

```js
{ id: 'gap', label: 'Pickup gap', min: 0.1, max: 3, def: 0.8, log: true,
  fmt: (v) => `${v.toFixed(2)} mm`, hint: 'Closer = louder and more distorted.' }
```

`type: 'select'` with `options: [[value, label], …]`, or `type: 'checkbox'`.
`showIf: (P) => …` hides a control when it is irrelevant. Keep `volume`
(0–2, def ≈ 0.8) and `room` (0–1) in an *Output* group. Keep `velocity`
(the computer keyboard's strike velocity) if the instrument is
velocity-sensitive. Presets override defaults. Make each preset show one
physical idea and give it a descriptive name.

### Page and views

Copy the template's DOM. The sidebar, header, keyboard and footer are
standard. The views are yours: show the physics *while it plays* (mode
shapes, a slow-motion mechanism, phase portraits, the field, the
spectrum with the model's predicted lines). Use `SpectrumView` for the
live spectrum. Every view gets a one-line caption that says what to look
at.

Space is `sustain` (a damper pedal sent to the engine) or `hold` (the shell
latches keys while Space is down). Pick whichever makes physical sense,
and say which in the footer help.

**Tablets, phones and layout.** `shared/layout.js` and `shared/layout.css`
(loaded last in `<head>`) give every page the same touch-friendly
layout:
- a Controls toggle (a column on wide screens, a slide-over panel on
  narrow ones);
- a Views ▾ menu that shows or hides each `#views .card`;
- a multi-touch keyboard (`shared/keyboard.js`: chords, glissando, Pencil
  pressure, a 2–5-octave window with ◀ ▶);
- an on-screen pedal button that presses Space;
- on phones, a page that scrolls above a keyboard stuck to the bottom,
  with Controls in place of the views.

To fit in:
- Give a card whose `<h2>` changes at runtime a stable name with
  `data-view="…"`.
- Start every animation loop with `requestAnimationFrame` and skip
  hidden canvases. `animate(draw, canvas)` does both.
- Make drawing code survive a tiny canvas.
- Write the README in the Markdown that `shared/markdown.js` renders for
  the notes: headings, paragraphs, lists, pipe tables, fenced code, inline
  code, bold, italics and links. A paragraph indented by two spaces is
  shown as a display equation, exactly as written. The `## Files` section
  is left out of the notes. `test/notes-tests.mjs` renders every README.
- Keep the header to the standard buttons and pills: on a phone it has
  to fit two rows (one in landscape). Wide tables scroll inside their card.
- Pages that don't use the shell set `data-space="Sustain"` on `<body>`
  (`data-space-mode="tap"` when Space toggles something) for the pedal
  button. The shell sets it from `space`.

### Tests

Copy the pattern in `test/template-tests.mjs`. Each file is a plain Node
script that prints `ok`/`FAIL` lines and exits non-zero on failure. Keep
the whole file under ~30 s. Aim for 10–25 tests that cover:

1. the model against independent physics;
2. tuning: every key within a few cents of its target (or, if the
   instrument is deliberately inharmonic, its intended frequencies);
3. the engine against the model (pitch, decay, spectral content);
4. each advertised effect (the hint text should be true);
5. sane output level, no NaNs, no denormal blow-ups, and silence after
   release;
6. CPU: a rough timing check that 10 voices render faster than real time
   by a healthy margin. Name it `CPU: …`: timing tests are skipped on CI
   (`process.env.CI`), whose shared machines are too slow and noisy to
   hold a desktop budget.

`npm test` runs every suite in parallel (`tools/test-all.mjs`) and
reports all failures; `node tools/test-all.mjs <name>` runs a subset.

### Demos

`tools/render-<slug>.mjs` renders 4–8 short demos (3–10 s each) to
`examples/<slug>/NN-what-you-hear.wav`. Make each one isolate one effect,
A/B style. Make the first one the most musical: the landing page's
"Listen" button plays it. Then:

```bash
node tools/encode-examples.mjs <slug>     # → .m4a + examples/index.json
```

WAVs are git-ignored. Commit the `.m4a` files.

### Going live

Add the instrument to `shared/registry.js` with `ready: true, version: '0.1.0'`
and add a `### <Name> 0.1.0` entry to `CHANGELOG.md`. The landing page and
every menu pick it up, and `test/site-tests.mjs` checks that all of this
agrees.

### Versions

Each instrument has its own semantic version, kept in the registry.
While it is 0.x, bump MINOR for new features or changes to the sound or
parameters, and PATCH for fixes that leave the intended sound alone. Bump
Forte's version (`FORTE_VERSION` and `package.json`) for changes to
`shared/`, the landing page or the tools. Log every bump in `CHANGELOG.md`
under the date, then tag the release commit (`git tag <slug>-vX.Y.Z`)
and push the tags. Run every test file, check the page in a
browser (audio, MIDI, presets, views, narrow-screen layout), and push.
