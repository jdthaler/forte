# Building a Forte instrument

Every instrument in Forte has the same anatomy, so a new one is mostly
physics. Start from the template:

```bash
node tools/new-instrument.mjs <slug> <EngineName> "<Display Name>"
```

Build briefs for new instruments (the physics, the effects, the tests and
the prior art) go in [WORKSHOP.md](WORKSHOP.md).

This creates a working (if simple) instrument: struck free–free bars,
with a page, an engine, tests, a render tool, a README skeleton and its
native port (C++ for the plugins and the WebAssembly; see "The native port"). It
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
* **Credit prior art.** End the README with `## Prior art and references`
  (`test/site-tests.mjs` checks for it), covering:
  - the original instrument and its inventors (with patents);
  - the physics, credited to the people who worked it out;
  - earlier models and syntheses of the instrument, academic and
    commercial, each with a link and one neutral line.
  Verify every citation against a real source (a DOI, the publisher, a
  patent record or the product's own page), and leave out what you can't
  verify. Project-wide credits are in [PRIOR_ART.md](PRIOR_ART.md), shown
  at `/credits/`.

## Anatomy

```
<slug>/index.html             page (DOM ids the shell expects; see docs/template/index.html)
<slug>/style.css              palette: --accent, --accent-2, --accent-ink (+ any extra layout)
<slug>/src/<slug>-params.js   GROUPS, DEFAULTS, PRESETS
<slug>/src/<slug>-instrument.js  the descriptor: everything but the page (below)
<slug>/src/<slug>-wasm.js     the engine and model, built from the C++ as WebAssembly (below)
<slug>/src/<slug>-main.js     createShell({ ...INSTRUMENT, … }) + views
<slug>/src/<slug>-tour.js     the guided tour of its physics (below)
<slug>/wasm/<slug>.wasm       the C++ built as WebAssembly (committed)
native/instruments/<slug>/    the physics, in C++: the model and the real-time engine
<slug>/README.md
test/<slug>-tests.mjs         run by CI (any test/*-tests.mjs)
tools/render-<slug>.mjs       demos → examples/<slug>/NN-name.wav
```

The physics is C++, in `native/instruments/<slug>/` (see The native port, below): the plugins
and the page play the same engine. JavaScript beside the page is for the page (constants, labels,
what a view draws) and for tools that make the C++'s data tables (`tools/*-native-table.mjs`).

### Shared code (`shared/`)

| file | what |
|---|---|
| `shell.js` | everything common to instrument pages: audio graph (room, volume, tone, limiter, analyser), computer keyboard and on-screen keys, MIDI (notes, velocity through the touch curve, CC64, CC66 sostenuto, CC67 soft pedal, CC1, pitch bend), parameter sidebar with presets and local storage, octave shift, toasts. See the header for the config. |
| `worklet.js` | the generic AudioWorklet processor. It runs your engine's WebAssembly from the bytes the page sends, through its class's `globalThis` name. It also registers `forte-limiter`, the chain's limiter, so a page adds it before building the chain. |
| `wasm.js` | loads an instrument's WebAssembly in a page, the worklet or Node, and wraps it in a class with the engine contract (`wasmEngine`) |
| `chain.js` | the output chain after the engine, built from the descriptor's `chain`: tone low-pass, body or soundboard, room, volume × trim, limiter. Every page uses it; the plugins rebuild it in C++. |
| `limiter.js` | the limiter at the end of the chain: Web Audio's compressor curve and makeup gain without its 6 ms look-ahead, as the plugins' `limiter.cpp`, so a page adds no delay to a key |
| `dsp.js` | `modeCoeffs` (exact two-pole modal resonator), `Biquad`, `OnePole`, `DCBlock`, `Delay` (fractional), `keyPan`, `keyFreq`, `sigmaFromT60` |
| `linalg.js` | `symEig`, `genEig` (generalised symmetric), `cholesky` |
| `views.js` | `fit`, `css`, `animate`, `SpectrumView` (live spectrum + model markers), `SpectrogramView` (scrolling spectrogram, the markers as ticks), `ScopeView` |
| `impulses.js` | the rooms: `roomIR` (the pages' original synthetic room) and the venues (`VENUES`: a studio and three halls built from their size, walls and air: image sources, then a tail decaying in each octave in Eyring's time) |
| `tuning.js`, `tuning-ui.js` | the keyboard's tuning, the same on every instrument and in the plugins (`native/core` `tuning.h`): the pitch standard (A4), the temperament (equal, meantone, the well temperaments, Pythagorean, just, custom) on a root key, and a custom temperament's cents; `readScala` reads a Scala file (`.scl`) into them. `tuning-ui.js` is the pages' *Load a Scala file* button, which `user-presets.js` adds under Temperament. |
| `quality.js` | the Quality setting (High, Medium, Low): how much of its physics the engine plays, for phones and older computers. One choice per browser, for every page, shown in the header beside the CPU readout (`qualityControl()`, one pill with it once the audio plays) and in no preset or link; `connectQuality(node)` sends it to the page's engine and suggests a lower setting when the audio drops out. |
| `registry.js`, `search.js` | the instrument list behind the landing page and the menus, with the sections and the front page's filters (`FILTERS`); `search.js` is the front page's search over it (word starts, without case or accents) |
| `presets.js`, `user-presets.js` | your own presets and shared links. `presets.js` is the format, the same in the plugins (`native/plugin/presets.cpp`): every parameter of the contract by id, in a versioned file or in a link's fragment. `user-presets.js` adds them to the Presets menu (save, link, a sheet to play, link, save to a file, delete and open files); the shell attaches it, and a page with its own state calls `attachPresets` with how to get and set its parameters by contract id (the organ's console is `CONSOLE.get` and `CONSOLE.put`). |
| `midi.js` | Web MIDI for every page (the shell and the five older pages): `startMIDI` listens to every input and cleans each one's notes (a re-strike lets the note go first, a stray note-off is dropped, an unplugged device lets go of its notes and pedal); `resumeMIDI` turns MIDI back on, without a click, on the next page; `wheelValue` puts the mod wheel at rest on a parameter's default; `touched` applies the Soft/Normal/Hard velocity curve chosen next to Enable MIDI, `SOFT_PEDAL` is CC67's velocity scale and `createSostenuto` keeps the keys CC66 holds, for pages with their own MIDI handling; `pageMpe` decodes MPE for a page (below) and turns it into the engine's `noteBend`, `slide` and `pressure` messages. A foot controller is `startMIDI`'s too, so every page has it: `SWITCHES` turns CC80, 81 and 82 into CC64, 66 and 67, the volume (CC7) and expression (CC11) pedals set `pedalGain`, which `chain.js` applies after the limiter, and a program change plays a preset from `#preset` (`choosePreset`); a page passes its `controllers` (`controllersOf`) so that a CC its instrument maps (an organ's CC11) stays the instrument's. The plugins do the same (`native/plugin/plugin.cpp`). |
| `mpe.js` | MPE (MIDI Polyphonic Expression), message for message as the plugins' `forte/mpe.h`: zones from the MPE Configuration Message, member channels' bend (±48 semitones unless RPN 0 says otherwise), pressure and CC74, the Auto/On/Off mode, and `bendRatio`, a note's bend along the keyboard's tuning. |
| `focus.js` | who gets a key press: a control reached with Tab keeps the keys it uses (Space ticks a stop, arrows move a slider); one last touched with the mouse or a finger hands them back to the instrument. Every page's key handler asks `controlOwns(e)` first. |
| `tour.js` | the guided tour of an instrument's physics: *Tour* in the header, before How it works, and the card that steps through `<slug>-tour.js` ("The guided tour", below) |
| `notes.js`, `markdown.js` | **How it works**: the page's README in a dialog (button by the title, or a link to `…/#about`) |
| `instrument.css`, `forte.css` | page layout; Forte nav and notes |

The older five instruments predate the shell and have their own page code
(keys, MIDI, controls), though they share the descriptor, `worklet.js` and
`chain.js`. New instruments should use the shell.

### The descriptor

`<slug>/src/<slug>-instrument.js` exports `INSTRUMENT`: everything a host needs to play the
instrument without its page. The page spreads it into `createShell`; the Node tools and tests
play the instrument from it (`tools/headless.mjs`); `tools/gen-native-params.mjs` turns it into
the C++ tables of the native plugins (docs/PLUGINS.md). It must not touch the DOM, Web Audio or
browser globals when it is imported.

```js
export const INSTRUMENT = {
  id: 'gongs',
  groups: GROUPS, presets: PRESETS,
  keep: ['volume', 'room', 'venue', 'velocity'], // kept when a preset is chosen
  range: [21, 108],                     // the MIDI keys it plays: all 88 (A0–C8), unless the physics stops short
  compass: { keys: [36, 84], param: 'fullRange' }, // a historical compass: only these play until the checkbox opens the range
  space: 'sustain',                     // Space and CC64: 'sustain' (a damper, sent to the engine), 'hold' (keys latch) or null
  modWheel: 'strike',                   // CC1 (or { param, max })
  mpe: { bend: 48, slide: true },       // MPE: how far one note bends (semitones, up to 96; 0: none), and
                                        // whether CC74 slides the mod wheel's parameter for that note alone;
                                        // press: true when a bend presses the key as the wheel does (the clavier)
  controllers: { 67: 'unaCorda' },      // other MIDI controllers → parameters (a toggle is on at 64);
                                        // { param, values: [a, b] } picks b from 64 up, { param, toggle: [a, b] } flips on each press
  faders: ['hardness', 'mass', 'listen', 'strikeAngle', 'strike'], // a Seaboard RISE's faders 1–3 (CC 107, 109, 111), then
                                        // its XY pad's X and Y (113, 114): five controls a player moves (shared/midi.js FADERS)
  console: { groups, defaults, get },   // state the page keeps beside its groups (the organ's drawbars): plugin parameters too
  wasm: { name: 'GongWasmEngine', module: new URL('./gongs-wasm.js', import.meta.url).href,
          binary: new URL('../wasm/gongs.wasm', import.meta.url).href }, // the engine (below)
  midiVelocity: (v) => …,               // MIDI velocity / 127 → the engine's (default: the same)
  keyVelocity: 1,                       // what the computer keys play when there is no `velocity` parameter
  chain: { volume: 'volume', room: 'room', venue: 'venue' }, // shared/chain.js: also roomSeconds, roomGain, tone, body, limiter
  load: async () => …,                  // data to load before the first note (default: none)
};
```

Every instrument plays the 88 keys of a piano keyboard, A0–C8, unless its physics stops short
(`test/site-tests.mjs` lists those, and each README says why). Keys past the real instrument's
compass are made by carrying its design on (the same scale of strings, bars or bowls); keep the
formulas that design the keys drawn on the compass, so the keys inside it sound as they did. An
instrument with a historical compass (the harpsichord's FF–f³) names it in `compass`, with a
checkbox parameter (`fullRange`, off) that opens the whole range: the page's keys, the computer
keys and MIDI follow it, and so do the plugins' note filter and window. The engine plays every
key in `range` and never reads the checkbox.

A `console` holds controls the page draws itself rather than as sliders: its `groups` are
parameters as `GROUPS` are, `defaults` the page's state and `get(P)` maps the plugin's
parameters back to that state (the organ's nine drawbars to one array). The plugins list them
after the groups' parameters and every preset sets all of them. A CC64 `toggle` controller on
an instrument with no Space mode is played by the plugin window's Space bar.

The `faders` are five controls worth moving while playing, the first three on a controller's
faders and the last two on its XY pad (sliders, so the pad sweeps them; Y is the mod wheel's
parameter when there is one): never `volume` (a fader touched at the bottom would silence the
instrument), `room` or `velocity` (`test/site-tests.mjs` checks). Each moves its control across
the slider's whole range, in log(value) for a log one; a checkbox is on from halfway up. The
pages (`shared/shell.js`), the plugins (as more `controllers`) and `tools/headless.mjs` all
take them from `controllersOf` in `shared/midi.js`; README.md lists them, so update its table.

Page-only settings (`base`, `arrows`, `holdHint`, `noteData` and the `on…` hooks) stay in the
page.

### Engine contract

The engine is the C++ (`forte::Engine`, native/README.md), built as WebAssembly and wrapped by
`<slug>-wasm.js` in a class (`shared/wasm.js`) that runs unchanged in the AudioWorklet and in
Node:

```js
export class GongWasmEngine {
  constructor(fs) { … }
  setParams(P) { … }               // the whole parameter object
  noteOn(key, velocity, data) { … } // velocity 0..1; data: what the page offers with the note (its noteData), if anything
  noteOff(key, velocity) { … }      // velocity: MIDI release velocity 0..1, or undefined
  setSustain(on) { … }             // optional
  allNotesOff() { … }              // optional (Panic)
  handle(msg) { … }                // optional: other messages, incl. MIDI { type: 'pressure', value, key } and { type: 'bend', value },
                                   // and MPE's { type: 'noteBend', key, value } and { type: 'slide', key, value } (below)
  setQuality(level) { … }          // 'high', 'medium' or 'low' (shared/quality.js; the C++'s Engine::quality)
  voiceCount() { … }               // optional, shown in the CPU pill
  stats() { … }                    // optional: more fields for the page's stats message
  process(L, R, n) { … }           // fill n samples (n = 128 in the browser)
}
globalThis.GongWasmEngine = GongWasmEngine;
```

`this.post(msg)` (set by the worklet wrapper) sends data back to the page,
for example to drive a live view: the C++ engine posts `Message`s, which the wrapper turns
into the page's (see The native port).

**MPE.** A controller that gives every note a channel of its own (a Seaboard, a LinnStrument,
an Osmose) bends, slides and presses each note alone. `shared/mpe.js` and the plugins' decoder
(`forte/mpe.h`) turn that into three per-note messages, the C++ `Engine`'s virtuals:

* `noteBend(ratio, key)`: the note's frequency × `ratio`, already along the keyboard's tuning
  (`bendRatio`, so a slide onto the next key lands on its tuned pitch), on top of the
  instrument's wheel bend;
* `slide(value, key)`: the note's own value of the mod wheel's parameter, in its units, as the
  wheel would set it (NaN: the parameter's own again);
* `pressure(value, key)`, which per-key pressure already was.

Either may come before the key's `noteOn`: keep them per key (`forte/expression.h`
`NoteExpression`) and start the note there; glide a sounding note toward them as the wheel
glides (`glideTo`). Bend only what the physics can bend (a string's tension, a reed's or
pipe's pitch, a bow's speed): a struck bar or a bell rings at its own pitch, so its descriptor
says `bend: 0`. A plain note on a key that had its own expression starts without it. Ordinary
MIDI never sends these, so an instrument without them plays as before; `test/mpe-tests.mjs`
checks every instrument against its descriptor.

Rules of thumb:

* **Budget:** ≤ 30 % of one core with 10 voices at 48 kHz on a laptop. Watch
  the CPU pill, and `node tools/bench.mjs <slug>`.
* **Quality:** High plays everything. At Medium and Low the engine trims what
  costs the most and is heard the least (see The native port), so a phone keeps
  up.
* **No allocation in `process`.** Allocate per voice, at note-on.
* **Expensive setup** (eigen-solves, tables) belongs in the model. Cache it
  per key and parameter version. If it is slow (> 5 ms), build it on the
  page with the WebAssembly model and send it with the page's `noteData`.
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
`showIf: (P) => …` hides a control when it is irrelevant. End `GROUPS` with `TUNING_GROUP`
(`shared/tuning.js`: pitch, temperament, its root and the custom cents) and keep its ids
(`...TUNING_KEEP` in `keep`), and make the model's pitch target each key's equal-tempered
frequency times `tuningOf(P).ratio(key)` (the generated `<slug>-params.h`; see The native port).
Keep `volume`
(0–2, def ≈ 0.8) and `room` (0–1) in an *Output* group, with `VENUE`
(`shared/chain.js`, the room's space) right after `room`, in `keep` and
as the chain's `venue`. Keep `velocity`
(the computer keyboard's strike velocity) if the instrument is
velocity-sensitive. Presets override defaults. Make each preset show one
physical idea and give it a descriptive name.

Mark only the controls a player changes *while playing* with
`perform: true`: stops and registrations, pedals and mutes, tremolo and
vibrato, where the mallet strikes or the bow sits, the main physical knob
(the black hole's spin), and `volume`. The instrument's build (sizes,
materials, losses), its voicing (felt hardness) and `room` are set once,
so they stay in the Controls panel. The same flag fills the row above the
plugin window's keyboard.

The page's strip is smaller: only what matters mid-phrase, marked
`strip: true` as well, and small enough to sit in the keyboard bar, right
above the keys. That is `volume`, `velocity` (the
computer keys') and a pedal or what stands in for one (the vibraphone's and
celesta's held pedal, the piano's una corda, the clavier's mute, the viola
organista's lifted dampers, the kalimba's and steel pan's let-ring);
`test/site-tests.mjs` allows three at most, `volume` among them. Every other
control stays in its group in the Controls panel, which is never far from the
keys. The strip's controls sit there in both modes, so they never
move; a checkbox there becomes a stop that lights up, and in Discover a
control with a `hint` gets an ⓘ button that opens it (a tap, not a
tooltip, so it works on a tablet). A tile shows its label, the
slider and the value on one line. The
strip drops a label's explanation, a trailing "(…)" or "= …", so put the
name first: "Dome rise (curvature)" shows as "Dome rise" (the whole label
stays in the tooltip, the ⓘ and the control's accessible name). On a touch
screen the `velocity` parameter, which only the computer keys use, leaves
the strip. Mark 3–10 of them,
`volume` among them (`test/site-tests.mjs` checks). Leave the physics you
set once (materials, dimensions, voicing) to the Controls panel and the
presets.

A control the real instrument has in a shape of its own can wear it: give
the parameter `face` (`shared/faces.js`, styled in `shared/layout.css`), and
the Controls panel draws it so. A checkbox can be a `'drawknob'` (an organ's
or harmonium's stop: an ivory face that stands out when drawn), a `'lever'`
(a harpsichord's hand stop, slid across), a `'tab'` (a Clavinet's rocker) or
a `'toggle'` (an apparatus's bat-handle switch, its pilot lamp lit when on);
a slider can be a `'knob'` (an amp's or a preamp's: drag up or right to turn
it, Shift for fine, two taps for the default) or a `'dial'` (a supply's or
a generator's knurled knob over a printed scale, its value in a readout); a
dropdown can be a `'selector'` (a pointer knob over engraved positions: click
a legend, click the knob to step, or drag it) or `'rockers'` (a bank of
rocker tabs, one down at a time). A dropdown's legends are its options' names
up to their explanation, or `shortLabels`, one to an option. The faces of a
group come first, side by side; the input stays, out of sight, for the
keyboard and screen readers. A face drops a label's trailing "(…)" as the
strip does, or shows `faceLabel` instead (the harmonium's "8′" is "Principal
8′" on its stop). Every page gives Output's `room` a knob and its `venue` a
selector without being asked; every other slider is a fader lit up to its
value and every other checkbox a lamp button. A checkbox in the strip that
is a pedal (the vibraphone's, Una corda) takes `pedal: true` and is drawn as
one. A page that builds its own controls calls `dress()` on each and its
`show()` when the value changes. Faces change the page only: the plugins'
windows and the native tables ignore them.
Keep faces to what the instrument really has, a few to a group.

### Page and views

Copy the template's DOM. The sidebar, header, keyboard and footer are
standard. The views are yours: show the physics *while it plays* (mode
shapes, a slow-motion mechanism, phase portraits, the field, the
spectrum with the model's predicted lines). Every instrument has a
spectrum and a spectrogram of its live output: `SpectrumView` and
`SpectrogramView`, which follows a spectrum (`{ spectrum }`) for its
analyser, range and markers, or takes its own (a narrow band can be
linear, as the Star Keyboard's is). Mark them with what the model
predicts, and say in their captions what to watch for in this
instrument. Every view gets a one-line caption that says what to look
at.

Space is `sustain` (a damper pedal sent to the engine) or `hold` (the shell
latches keys while Space is down). Pick whichever makes physical sense,
and say which in the footer help.

**Tablets, phones and layout.** `shared/layout.js` and `shared/layout.css`
(loaded last in `<head>`) give every page the same layout, top to bottom:
- **The header.** The instrument's name is also the menu (Forte's home
  page and every instrument, from `shared/nav.js`; the page's `<h1>`
  moves into it). Then How it works, audio, MIDI and Panic.
- **The views and the Controls panel**, one above the other, each headed
  by a bar. A bar has its toggles, then its tools, then a button (a
  chevron) that folds its panel away. The views' bar has a toggle for
  each view, named by its `data-view` (or its `<h2>`), and **Discover |
  Perform**; the controls' bar has a toggle for each group of controls
  (each `details.group`, named by its `<summary>`; a group whose
  parameters have all moved to the keyboard bar has none, and a group the
  page adds later gets one) and the presets (`.preset-row`, moved here
  from `#controls`), whose menu gains "Default settings", which presses
  the page's `#reset`. A tap on a toggle turns that view or group on or
  off, and the page remembers which are on. Every group is on at first;
  with every group off, the panel keeps its toggles. Other code can add
  its own tools to either bar: `barTools('views')` or
  `barTools('controls')` from `layout.js` is the element to append to.
- **Sharing the height.** The handle on the controls' bar's top edge (or
  the bar itself, where it has nothing to tap) drags the line between the
  views and the controls, down to nothing for either: a panel dragged
  under 56px, or folded by its chevron, folds away and leaves its bar,
  and its chevron brings it back at the share it had. Arrows, Home and End
  move the handle from the keyboard, and two taps on it go back to the
  usual share (60 % for the views). The share is the same on every page.
- **The views: pictures only.** The views that are
  on share their panel in rows, as many abreast (up to four) as gives
  each the most room, so a short panel puts them side by side and a tall
  one stacks them; a short last row stretches across. At first only the cards
  marked `data-perform` (one or two: `test/site-tests.mjs` checks) are on,
  and their toggles come first. A card's `.caption` waits behind an ⓘ in
  its title.
- **The Controls panel**, `#controls`. A card marked `data-control` is a
  control surface, not a view (the organ's drawbars and switches): it
  heads the panel, with a toggle of its own named by its `data-view`.
  Then the parameters, grouped (the groups side by side), where each hint
  waits behind an ⓘ.
- **The keyboard bar and the keys** (`shared/keyboard.js`: multi-touch,
  glissando across the keys, aftertouch from leaning on a held key along
  its length or from Pencil pressure). As many keys as fit the width at the
  chosen key size (− +), like GarageBand: ◀ ▶ move an octave, and an
  overview of the whole range, with the keys on screen framed, drags
  anywhere. Then the `strip: true` parameters, each a small tile (a
  dropdown with a few short choices becomes a row of buttons), the key
  size and the pedal button, which presses Space. Where they don't fit on
  one line (a phone held upright, a tablet, a narrow window) the strip
  takes a line of its own above the rest. The page's footer hints
  (`.kb-help`: computer keys, MIDI, readouts) go behind ⌨.
- **Perform** is for playing and for a projector: the views that are on,
  filling the screen, with no toggles and no text in them. The views' bar
  is just Discover | Perform, over their corner, and the controls' bar
  goes: the presets and its chevron, "More controls", move to the end of
  the keyboard bar (not on a phone held sideways, where the bar has no
  room). The Controls panel waits behind that chevron (at the share last
  chosen; on a phone, in place of the views). The card's `.card-head`,
  `.caption`, `.legend`, `.readout`, `<dl>` and `<table>` are hidden, and
  `fillText` draws nothing on their canvases (a card with
  `data-keep-text` keeps its text). Full screen appears, and while an
  AudioContext runs the page holds a screen wake lock. The mode is the
  same on every page; the rest is remembered per page.
- On phones there is no room to share: the page scrolls between the
  header and the controls and keys, which stay put, and the Controls
  panel follows the views; each bar's toggles slide sideways when they don't fit. Upright,
  the controls' bar (with the presets) sticks just above the controls and
  keys until it heads the Controls panel, below the header, as it
  scrolls by. Turned
  sideways, it scrolls with the panel, and the keyboard bar keeps to one
  line, its overview of the range shrunk to a thumbnail. Either way, while
  the controls are out of sight below, the bar's chevron points up and
  scrolls them into view (opening them does too); once they show, it
  folds them away.
- While one finger holds a key, a tap with another finger works any
  button, stop or tab (browsers give such a tap no click; `layout.js`
  clicks for it).

To fit in:
- Give a card whose `<h2>` changes at runtime a stable name with
  `data-view="…"`.
- Mark the one or two views that best show the instrument playing with
  `data-perform` on their `.card`: they are the ones on at first. In
  Perform the views lose their titles,
  captions and canvas text and grow to fill the screen, so draw them to
  read as pictures, and let their canvases stretch (Perform sizes them
  with flex, overriding a fixed height).
- Keep controls out of the views. A custom control surface (drawbars, a
  console) is a `.card` with `data-control`; it heads the Controls
  panel. Only small things fit the keyboard bar.
- Start every animation loop with `requestAnimationFrame` and skip
  hidden canvases. `animate(draw, canvas)` does both.
- Make drawing code survive a tiny canvas.
- Write the README in the Markdown that `shared/markdown.js` renders for
  the notes: headings, paragraphs, lists, pipe tables, fenced code, inline
  code, bold, italics and links. A paragraph indented by two spaces is
  shown as a display equation, exactly as written. The `## Files` section
  is left out of the notes. `test/notes-tests.mjs` renders every README.
- Keep the header to the standard buttons and pills: on a phone it has
  to fit two rows. Wide tables scroll inside their card.
- Pages that don't use the shell set `data-space="Sustain"` on `<body>`
  (`data-space-mode="tap"` when Space toggles something) for the pedal
  button. The shell sets it from `space`.

### The guided tour

Every instrument has a tour of its physics: *Tour*, in the header just before How it works, opens a
card that goes through it in a few steps. Each step shows the views it is about, sets the
instrument up, plays a short phrase on the keys and says what to listen and look for, and why.
Ending the tour (✕, *Done*, Escape or leaving the page) puts back the views, the preset and every
setting the player had; the volume is never touched.

The tour is `<slug>/src/<slug>-tour.js`, loaded by the page after its main script
(`<script type="module" src="src/<slug>-tour.js"></script>`), and written with
`shared/tour.js`, whose header lists a step's fields:

```js
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('gongs', [
  {
    title: 'Harder: the crash',
    views: ['Spectrogram', 'Energy cascade'],
    preset: 'Tam-tam: thin, big soft beater, off centre',
    set: { strike: 0.3 },
    play: [note('A3', { dur: 3, vel: 0.1 }), note('A3', { at: 3, dur: 5, vel: 1 }), { at: 8, set: { thick: 0.004 } }],
    text: `What to listen for, in the notes' Markdown…`,
  },
]);
```

- Write three to eight steps, from the README's "What to listen for": one idea each, the first
  the instrument at its plainest, then one effect at a time, each heard by contrast (soft then
  hard, off then on: a `{ at, set }` partway through a step). End on something worth playing.
- Keep the text to two short paragraphs (900 characters at most): the card is small, and on a
  phone it pushes the views down. Name what to look for in which view.
- A step starts from its `preset` (or the defaults) plus its `set`, by contract id
  (`shared/presets.js`), so a page with its own controls (the organ's console) is set up the
  same way. The controls in `set` are outlined while the step lasts.
- Play within the keys the instrument has (a historical compass unless its checkbox is in
  `set`), for 20 s at most a step; `{ at, pedal: true }` holds Space, on instruments with a pedal.

`test/tour-tests.mjs` checks every tour against its instrument and page: the views, presets,
parameters and their ranges, the keys and the lengths. `tools/new-instrument.mjs` copies the
template's, which is to be rewritten for the new instrument.

### Tests

Copy the pattern in `test/template-tests.mjs`. Each file is a plain Node
script that prints `ok`/`FAIL` lines and exits non-zero on failure. Get the
engine class with `await loadEngine(INSTRUMENT)` (`tools/engine.mjs`) and the
model with the `wasmModel()` of `<slug>-wasm.js`: both are the C++, built as
WebAssembly. Check them against independent physics, written in the test
(a textbook formula, a first-principles solution), never against a JavaScript
copy of the same computation. Keep
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
   hold a desktop budget;
7. Quality: what Medium and Low trim (fewer voices, modes or partials,
   counted rather than timed), with the pitch and level kept.

`npm test` runs every suite in parallel (`tools/test-all.mjs`) and
reports all failures; `node tools/test-all.mjs <name>` runs a subset.

The page itself is checked by `node tools/check-pages.mjs <slug>`: in
headless Chromium at phone, tablet and desktop sizes, no console errors, no
sideways scrolling, and the perform controls, ⓘ buttons, "Default settings",
Tour and keys in place, and each tour taken from start to end on a computer and a phone (CI's
`pages` job runs it on every page).

### The picture a shared link shows

A link to the page shows a picture of it in Messages, Slack and social sites,
with the instrument's name and tagline. Once the instrument is ready (and
again when its page's look changes much):

```bash
node tools/make-previews.mjs <slug>      # → <slug>/preview.jpg + the tags in <slug>/index.html
```

It plays a chord on the page in Perform, at 1200×630, with the buttons hidden.
`node tools/make-previews.mjs --tags` rewrites only the tags (after a tagline
changes); `test/site-tests.mjs` checks both. Then run it for `index` too: the
front page's picture is made of sixteen instruments' pictures.

### Demos

`tools/render-<slug>.mjs` renders 4–8 short demos (3–10 s each) to
`examples/<slug>/NN-what-you-hear.wav`. Make each one isolate one effect,
A/B style. Make the first one the most musical: the landing page's
"Listen" button plays it. Then:

```bash
node tools/encode-examples.mjs <slug>     # → .m4a + examples/index.json
```

WAVs are git-ignored. Commit the `.m4a` files.

### The native port

Each instrument's physics is C++ (docs/PLUGINS.md), built as plugins (CLAP, VST3, AU,
standalone) and as WebAssembly, which the page, the tests and the tools play.
`tools/new-instrument.mjs` starts one from the template's:

```
native/instruments/<slug>/<slug>-model.*, <slug>-engine.*   the model and the engine
native/instruments/<slug>/<slug>-instrument.cpp              its InstrumentInfo: the tables with its engine
native/instruments/<slug>/<slug>-web.cpp                     the model functions the views and tests call
native/instruments/<slug>/<slug>-params.h, -info.cmake       generated from the descriptor (tools/gen-native-params.mjs)
native/instruments/<slug>/<slug>-contract.json               generated too: what saved songs rely on (tools/contract.mjs)
native/tests/states/<slug>-<version>.state                   what each release's plugin saved; never rewritten
native/instruments/<slug>/reference.json                     its sound, summarised (tools/render-reference.mjs)
<slug>/wasm/<slug>.wasm                                      built by the wasm preset; committed
<slug>/src/<slug>-wasm.js                                    the WebAssembly as an engine class, and the model for the views
```

The contract lists each parameter's id, kind, range, step, scaling and default, the options of
a choice and the presets, in order: what a song saved in a DAW and its automation rely on.
Removing, renaming or changing any of those, or a preset's values, breaks such songs; adding
parameters, options at the end and presets at the end does not. `node tools/contract.mjs` lists
what a branch breaks and adds since `main`; the `tests` workflow warns about breaks while an
instrument is below 1.0 and, from 1.0 on, asks for a `major` release note. Your own presets and
shared links (`shared/presets.js`) name the same parameters, ranges and options, so the contract
keeps them working too; `native/tests/presets/` holds files as the site writes them, which the
plugin tests open and write byte for byte. The plugin tests load
every state in `native/tests/states/` into today's plugins; one that no longer loads is a break
(before 1.0, delete it and say so in the note).

The descriptor's `wasm` field names the build; the shell fetches it and sends its bytes to the
worklet, which runs it. The engine takes all the parameters and computes its own per-note data
(`forte/background.h`). WebAssembly has no threads, so that data is built in place on a key's
first note; where that takes milliseconds, the page builds it with its own WebAssembly model and
sends it with the note (its `noteData`), as the vibraphone's bars and the piano's strings
(`vibraphone/src/vibraphone-wasm.js`; the piano also offers every key's ahead of its notes, for its
sympathetic strings). The views call the WebAssembly model, which the page awaits before drawing
(`const model = await wasmModel()`).

Every instrument follows the keyboard's tuning (`forte/tuning.h`): its `<slug>-params.h` has
`tuningOf(P)`, whose `ratio(key)` is the key's frequency over equal temperament's at A = 440 Hz,
exactly 1 at the defaults. Multiply the key's pitch target by it (a string's tension, a bar's cut,
a bell's profile then follow as they do for its note), leave what designs the instrument from the
key number alone, and rebuild the per-key data when the tuning changes. `test/tuning-tests.mjs`
plays every instrument retuned (A = 415 Hz, and a custom temperament) and checks it moves by the
cents its tuning gives, and not at all at the defaults.

Every engine follows the Quality setting (`forte::Quality` in `engine.h`): the page's choice or
the plugin's parameter, a device's and not the sound's, so it is no parameter of the instrument
and no preset carries it. High is the instrument as it always was, to the bit. Medium and Low
play less, least audible first: work nobody hears (partials past hearing or far under the
loudest, voices decayed to nothing), fewer partials or modes a voice, fewer voices at once (the
engine's own stealing, at `pick(MAX_VOICES, …, …)`), and optional physics lighter or off (the
sympathetic strings). Aim for Medium at about 60 % of High's cost in `node tools/bench.mjs <slug>`
and Low at about a third, and keep the pitch and a note's level. Read `quality` where a voice is
built, so a change applies to the notes that follow, and build per-key data in full, trimming it
for the voice. Say what each level trims in the README's `## Quality` section, and test it in
the suite (a `Quality: …` test that counts the voices or modes, not the time); `test/quality-tests.mjs`
checks every instrument's High is unchanged and its Medium and Low still play.

Strings that share a bridge can ring along with one another through `forte/sympathetic.h`: each
key's (or string's) lowest partials as a group, driven by the bridge signal of every voice and
group but its own, with its damper on or off. The piano, the electric grand and the harpsichord
use it; their engines say where their voices' bridge signals come from.

An engine that posts to its page posts `Message`s in C++ (`Engine::post`: a type, a key and up
to 30 float32 values); its `<slug>-wasm.js` turns them back into the page's messages, gathering
several into one where a message is bigger (`wasmEngine(I, { messages(m, engine) })`, which
returns null until it has one). A test suite that reaches into its engine (the bubble organ's
log, pool and constructor options) gets that through exports that take
`forte_engine(handle)`: see `bubbles/src/bubbles-wasm.js`. Messages carry float32, so a page
that compares a value from one with its own parameter maps it back (the carillon's wrapper
does). An instrument chaotic in some scripts only (the gongs' crashes) gives its descriptor a
`reference` that is a function of the script, with looser tolerances there.

When you change the physics:

```bash
node tools/gen-native-params.mjs <slug>        # after changing parameters or presets
cd native && cmake --build --preset wasm       # after changing the C++ (needs Emscripten, native/README.md)
node test/<slug>-tests.mjs                     # the tests, on the new build
node tools/render-reference.mjs <slug>         # when the sound is meant to change: save the new reference
```

`test/native-tests.mjs` (in `npm test`) fails if the generated files are stale; CI also fails
if the committed WebAssembly isn't what the source builds, and validates the plugins. Once the
port is done, set `plugin: { code, ready: true }` in `shared/registry.js`: the front page then
names it under All Plugins, its page gets a ↓ Plugin button, and the next plugin release (the `release-plugins` workflow) ships it.

### Going live

Add the instrument to `shared/registry.js` with `ready: true, version: '0.1.0'` and the
AU code from its descriptor (`plugin: { code }`, which then leaves the descriptor)
in one of the five sections (`traditional`, `electric`, `experimental`,
`phenomena` for physical phenomena, or `devices` for the apparatus physicists
build to study them), after the other
ready ones in it, with `version: '0.1.0'`, and with one option of each of the front page's
filters (`FILTERS` in the registry): `vibrates` (what sounds: `strings`, `solids`, `air`,
`circuits`, `space` or `matter`) and `notes` (`ring` if a held middle C at the defaults is more
than 10 dB down after five seconds, `hold` if it lasts as long as the key). Then add a note to `changes/` with a
`### <Name> (new)` section, which becomes its `CHANGELOG.md` entry when it is released. The landing page (its tabs, search and filters) and
every menu pick it up, and `test/site-tests.mjs` checks that all of this
agrees. Then make its picture and tags for shared links (`node tools/make-previews.mjs <slug>`,
then `index`; see "The picture a shared link shows").

### Versions

Each instrument has its own semantic version, kept in the registry, and
Forte has one (`FORTE_VERSION` and `package.json`) for `shared/`, the
landing page and the tools. Versions change only when `main` is released
to `live`, the branch the site is published from (`CLAUDE.md`). A change
adds a note to `changes/` instead (`changes/README.md`): MINOR for new
features or changes to the sound or parameters, PATCH for fixes that leave
the intended sound alone. `tools/release.mjs` turns the notes into
`CHANGELOG.md` entries and bumps the versions. Run every test file, check
the page in a browser (audio, MIDI, presets, views, narrow-screen layout),
and push.
