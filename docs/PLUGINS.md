# Native plugins and WebAssembly

The plan for turning Forte's instruments into plugins (VST3, AU, CLAP) that run
in a DAW, built from the same C++ physics that the website will run as
WebAssembly. One source of physics, two homes:

```
native/core + native/instruments/<slug>   C++: engines and models
        ├── plugins   VST3 + CLAP (macOS, Windows, Linux), AU (macOS), standalone
        └── WebAssembly   loaded by the site's AudioWorklet, and called by its views
```

Status: **steps 0–3 and 5 done** (the native setup, see [native/README.md](../native/README.md); every
instrument headless in JavaScript; the shared native core; the template and the Bubble Organ
ported, their pages running the WebAssembly; the plugins released from GitHub and linked from the
front page; step 4, every instrument in six batches: the modal bars, bells and plates, the
strings, the reeds and pickups, the self-oscillators, the table-driven instruments and the
tonewheel organ). Next: let the WebAssembly engines run for a while, then remove the JavaScript
ones; step 6 is unscheduled. The decisions below were made by the owner on
2026-10-16. Follow [CLAUDE.md](../CLAUDE.md) for the workflow (branch, test,
version, pull request, merge only when asked) and update this file as steps
land.

## Decisions

| | Decision | Why |
|---|---|---|
| Language | **C++** (C++20) | Every plugin format is first-class, including AU and later AUv3; Emscripten compiles it to WebAssembly. |
| Framework | **The [CLAP SDK](https://github.com/free-audio/clap) and [clap-wrapper](https://github.com/free-audio/clap-wrapper)** (changed 2026-10-16, see below) | Each plugin is written once as a CLAP; clap-wrapper builds its VST3, AU v2 and standalone, on all three platforms. Everything is MIT (the VST3 SDK since 3.8), so the repo stays MIT. |
| Packaging | **One plugin per instrument** | Each has a fixed parameter list, which DAWs need for automation and saved projects. All are built from one codebase and shipped together. |
| Names | Vendor **Forte**; each plugin is the instrument's name ("Gong Keyboard") | IDs `net.jthaler.forte.<slug>`; AU manufacturer code `Frte`. |
| Website | **Switches to the WebAssembly**, instrument by instrument | Once an instrument's existing tests pass on its WebAssembly build. Its JavaScript engine stays as a fallback until the port has proved itself, then is retired. |
| Views | **Call the WebAssembly models** | The views draw exactly what the engine plays; the JavaScript models are retired with the engines. |
| Phase 1 formats | **VST3 + CLAP on macOS, Windows and Linux; AU on macOS; standalone apps** | Built and validated by CI. AUv3 for iPad is a later phase. |
| Mac signing | **Ad-hoc**, no Apple Developer Program | Release notes give the one-line `xattr` command for downloads. Notarisation can be added later without other changes. |
| Repository | **This repo, under `native/`** | The C++ sits next to the site it feeds; one CI, one changelog, one pull request per port. Dependencies pinned. |
| Built WebAssembly | **Committed**, like the demo `.m4a` files | The site keeps needing no build step to serve or to run locally. CI rebuilds with a pinned Emscripten and fails if the committed files are stale. |
| Pilot | **The template, then the Bubble Organ** | The template proves the pipeline on trivial physics and becomes the native starting point for new instruments; the bubble organ exercises dropdowns, presets, the hold pedal and the mod wheel. |
| Plugin UI | **The DAW's generic panel** in phase 1, then **a web view** (Forte 0.21.0) | No custom window to build or maintain while the physics is ported. Since Forte 0.21.0 every format has a window: the instrument's controls and a playable keyboard in a web view (`native/plugin/editor.html`), so the standalone apps can be played without a MIDI keyboard. The site's views can join it later. |

**The framework, changed.** The plan first chose iPlug2. Checked at the start (iPlug2 master,
August 2026), it has no Linux support at all: its README lists macOS, iOS, Windows and the web,
and its CMake stops with "Linux not yet supported" for the core and "not yet implemented" for
VST3 and CLAP. The owner chose the CLAP SDK with clap-wrapper instead (over keeping iPlug2
without Linux plugins, a second plugin layer for Linux, or DPF). Phase 1 uses the DAW's generic
panel anyway, so iPlug2's UI toolkit wasn't needed. Formats, identifiers and CI are as planned.
clap-wrapper doesn't map CLAP's preset discovery to VST3 program lists or AU factory presets,
so the factory presets are a Preset parameter in every format.

## What exists to build on

- **Engines** are plain JavaScript classes with no browser dependencies (the
  contract is in `shared/worklet.js` and `docs/INSTRUMENT_GUIDE.md`):
  `new Engine(fs)`, `setParams(P)`, `noteOn(key, velocity, data)`,
  `noteOff(key, velocity)`, `setSustain?(on)`, `allNotesOff?()`,
  `handle?(msg)` (pressure, bend), `voiceCount?()`, `process(L, R, n)`.
  They don't allocate in `process`.
- **About 20,500 lines** of portable code (engines, models, parameters) across
  24 instruments; engines are 150–760 lines each (the gong's is the largest).
  The pages and views (about 9,100 lines) stay JavaScript.
- **Shared code:** `shared/dsp.js` (modal resonators, filters, delays),
  `shared/linalg.js` (`symEig`, `genEig`, `cholesky`: use Eigen),
  `shared/impulses.js` (room and soundboard impulse responses, from a seeded
  Mulberry32 generator, which the C++ must reproduce exactly), `shared/guard.js`.
- **Generated data:** some models load tables that `tools/` scripts generate
  (`gongs/data/gong-modes.js`, `blackhole/data/qnm-table.json`, and the tuning
  and profile tables of the vibraphone, reeds, carillon, pipes, harmonium and
  bowed). Convert them to C++ (generated headers) rather than re-deriving
  them.
- **The audio chain** after the engine is Web Audio today
  (`shared/shell.js`). It has:
  - an optional tone low-pass (Q 0.6);
  - volume × the registry's `trim`;
  - an optional room convolution (`roomIR`, 2 s, gain 0.6 × room);
  - a limiter: Web Audio's DynamicsCompressor at −3 dB threshold, 3 dB knee,
    ratio 12, 2 ms attack, 150 ms release.

  The piano and Huygens pages add a soundboard or body convolution, scaled as
  a ConvolverNode scales it (`webAudioIR` in `tools/audio-util.mjs`). On the
  website that chain stays Web Audio; only the engine moves to WebAssembly.
  The plugins need it in C++, with levels matched by measurement
  (`tools/loudness.mjs`).
- **Per-note precomputation on the page** (`noteData` in the shell config, or
  the page's own code). Instruments that do it: piano, tines, reeds,
  vibraphone, quantum, springs and stars. In a plugin it runs on a background
  thread.
- **The tests.** 28 Node suites (`npm test`) check the models against
  independent physics and the engines against the models. They become the port's
  acceptance tests. The demo renderers (`tools/render-<slug>.mjs`) give
  musical scripts to compare by ear and by measurement.

## Steps

### 0. Set up — done (Forte 0.8.0)
What landed: `native/` as below, with `plugin/` a CLAP plugin shared by every instrument and
`forte_add_plugin()` (`native/cmake/forte.cmake`) making its CLAP, VST3, AU v2 and standalone
through clap-wrapper's clap-first build; dependencies pinned by commit in
`native/cmake/dependencies.cmake` (CLAP 1.2.10, clap-wrapper 0.16.0, VST3 SDK 3.8.0, AudioUnitSDK
1.1.0, RtAudio 6.0.1, RtMidi 6.0.0, WIL, Eigen 3.4.1) and Emscripten in
`native/emscripten-version` (6.0.10); presets `linux`, `macos` (universal), `windows`, `wasm`;
the `native` workflow (`.github/workflows/native.yml`) building, unit-testing and validating on
all three platforms (clap-validator 0.4.1, Steinberg's validator, `auval -strict`), keeping the
built plugins as artifacts for 14 days, and rebuilding the WebAssembly. Until the template is
ported, a CI-only plugin (`native/tests/smoke`) proves the pipeline. The registry has each
instrument's AU subtype (`plugin.code`) and a `TEMPLATE` entry; `native/ids.json` the VST3 class
ids. The plan as it was:

1. Create `native/`:
   - `core/`: engine base class, DSP, linear algebra (Eigen), impulses,
     the output chain, parameter metadata, NaN guard;
   - `instruments/<slug>/`: each instrument's engine, model and data;
   - `plugin/`: one plugin project, instantiated per instrument by CMake;
   - `web/`: the Emscripten bindings;
   - `tests/`: native unit tests (CTest).
2. Pin the dependencies: the plugin framework (with the VST3 and CLAP SDKs it uses),
   Eigen, and an Emscripten version. Write CMake presets for macOS, Windows,
   Linux and WebAssembly.
3. Add CI jobs (GitHub Actions):
   - build the plugins on macOS, Windows and Linux;
   - run `auval` (macOS), Steinberg's VST3 validator and `clap-validator`;
   - rebuild the WebAssembly and fail if the committed files differ;
   - run `npm test` against the WebAssembly engines.
4. Add a unique four-character AU subtype per instrument to the registry
   (`plugin: { code: 'Gong' }`; a site test checks uniqueness). Generate the
   VST3 class IDs once, store them in `native/ids.json`, and never change them.
5. Note for cloud sessions: they run on Linux. They can build the Linux plugins
   and the WebAssembly and run the tests; the macOS and Windows builds and
   validators run in CI. Listening in a DAW is the owner's job, noted in each
   pull request.

### 1. Make each instrument headless in JavaScript first — done (Forte 0.9.0)
What landed:
- Every instrument and the template has `<slug>/src/<slug>-instrument.js`, exporting
  `INSTRUMENT` (the fields are in docs/INSTRUMENT_GUIDE.md, "The descriptor"). Besides the
  plan's list it has `controllers` (other MIDI CCs, e.g. the piano's soft pedal),
  `midiVelocity` (the piano, tines and black hole map velocity themselves), `keyVelocity` and
  `load` (the black hole's QNM table). Every demo renders byte for byte as before.
- The five older pages keep their own keys, MIDI and controls (moving them onto the shell is
  left for their ports), but their engines are on the shared contract, they run in
  `shared/worklet.js`, and every page builds its output chain with `shared/chain.js`.
- `tools/headless.mjs` plays any instrument from its descriptor in Node, as its page does.
- `tools/gen-native-params.mjs` writes `native/instruments/<slug>/<slug>-params.h` and
  `<slug>-info.cmake` for ported instruments (`--report` for any). Units come from sampling
  each `fmt`: 430 of 440 parameters get a text matching the page's over 95–100 % of their
  travel, 10 fall back to a plain number (`--report` lists them; a descriptor could carry an
  explicit unit for them). `native/tests/format-vectors.h` checks the C++ formats as the
  JavaScript does.
- `tools/render-reference.mjs` writes `native/instruments/<slug>/reference.json`.
- `tools/engine.mjs` (`loadEngine`) gives every test suite its engine.
- The organ's console (drawbars, percussion, vibrato and Leslie switches, the motor) lives
  outside `GROUPS`: the descriptor's `console` makes it plugin parameters, and `controllers`'
  `values` and `toggle` forms switch the Leslie from CC1 and CC64 (Forte 0.26.0).

The plan as it was:
1. Give each instrument a descriptor module (`<slug>/src/<slug>-instrument.js`)
   holding everything that isn't the page:
   - `GROUPS` and `PRESETS`;
   - range and Space mode;
   - the engine's name and `engineParams(P)`;
   - `noteData(key, vel, P)`, the per-note precomputation;
   - the chain: volume, room, tone, soundboard and trim.

   The page imports it. The five older pages (piano, organ, tines, Huygens,
   black hole) need the most untangling; their keyboard handling and
   parameter UI can move to the shell where it fits.
2. Write `tools/gen-native-params.mjs`, which emits C++ parameter and preset
   tables from the descriptors: ids, labels, ranges, log scaling, steps, choices,
   defaults and units. The JavaScript stays the single source of this
   metadata.
3. Write `tools/render-reference.mjs <slug>`. It plays fixed note scripts
   (chords, velocities, pedal, mod wheel, each preset) through the JavaScript
   engine in Node and saves a summary (pitch, level, decay, spectral centroid
   per script) for the C++ to match.
4. Make the test suites engine-agnostic: they get their engine through a small
   loader that returns the JavaScript class, or the WebAssembly one when
   `FORTE_ENGINE=wasm`.

### 2. The shared native core — done (Forte 0.10.0)
What landed (`native/core`, described in native/README.md): the ports of `dsp.js`,
`impulses.js` and `guard.js` and Eigen for `linalg.js`, checked against the JavaScript
(`tools/gen-native-vectors.mjs`); the output chain with a zero-latency convolver and a limiter
after Web Audio's; a message queue for `Engine::post`; flush-to-zero; and `KeyData`, which
builds per-key data on a worker thread and hands it over without locks. The shared plugin uses
the chain, splits the engine's blocks at events, and handles MIDI controllers; it is tested as
a host drives it at 44.1–192 kHz and any block size (`native/tests/plugin-tests.cpp`).
How an engine uses `KeyData`: it owns one, calls `prepare(version, lo, hi)` when the parameters
its notes depend on change, `get(key, version)` in `noteOn` (a note whose data isn't ready
waits for it, a few milliseconds), `acquire`/`release` for a voice that keeps it, and
`audioCycle()` after each block. The plan as it was:

1. The engine base class mirroring the JavaScript contract, plus a way to post
   messages to the page or UI (a lock-free queue).
2. Ports of `dsp.js`, `impulses.js` (bit-exact, same seeds) and `guard.js`;
   `linalg.js` becomes Eigen.
3. The output chain (tone, room and soundboard convolution, limiter, trim) for
   the plugins.
4. Real-time plumbing:
   - parameter smoothing;
   - model rebuilds and per-note precomputation on a worker thread, handed to
     the audio thread without locks;
   - flush-to-zero for denormals;
   - re-initialising on sample-rate changes (44.1–192 kHz) and any block size.

### 3. The pilot: the template, then the Bubble Organ
**The template: done (Forte 0.11.0).** `native/instruments/template` has its model and engine in
C++, its generated tables and its reference; its WebAssembly (32 KB) is committed in
`docs/template/wasm/`; `FORTE_ENGINE=wasm` runs its test suite and the reference comparison
(the WebAssembly matches the JavaScript to float32 rounding); its plugins (CLAP, VST3, AU v2,
standalone) are built and validated in CI on all three platforms and kept as artifacts; 10 voices
take under 1 % of a core at 48 kHz in C++. The page runs the WebAssembly in its worklet and its
views call the WebAssembly model, both falling back to the JavaScript. `tools/new-instrument.mjs`
starts new instruments with this port. Learned on the way:
- An AudioWorklet has no `URL` and no `TextDecoder`, and Chrome resolves `addModule` even when
  the module throws: a module the worklet loads must not build URLs at import (the descriptor
  does), so `<slug>-wasm.js` takes the parameter groups, not the descriptor.
- A WebAssembly engine takes all the parameters (`fullParams`), not the page's
  `engineParams(P)`, and computes its per-note data itself; the shell sends both.
- The engine switch in a ported page's header (C++ | JS) picks the C++ or the JavaScript, for
  comparing by ear (remembered for every page; `?engine=js` or `?engine=wasm` in the address
  overrides it). It goes when the JavaScript engines do.
- The smoke-test plugin is retired; its instrument stays as the plugin tests' test instrument.

**The Bubble Organ: done (Bubble Organ 0.3.0, Forte 0.12.0).** `native/instruments/bubbles` has
its model (heat flow, losses, the surface's image, rise and glide) and engine (nozzles, seeded
brooks, the bubble pool) in C++; its WebAssembly (51 KB) is in `bubbles/wasm/`; its 24-test suite
passes on it, which plays what the JavaScript plays to within 10⁻¹⁰ (the same seeded random
numbers, so the brooks are the same bubbles); its plugins have the hold pedal (CC64), the rate on
the mod wheel, aftertouch for more bubbles, the twelve presets and the gas and liquid as
dropdowns; ten brooks at 40 bubbles/s take about 5 % of a core in C++. Learned on the way:
- An engine that tells its page more than a `Message` holds (30 floats) posts several, and its
  `<slug>-wasm.js` gathers them: `wasmEngine(I, { messages })` gets `messages(m, engine)`, which
  returns the page's message or null. The bubble organ posts each release, a summary per block
  and its latest bubble's waveform in pieces.
- Messages carry float32: a page must not compare their values exactly with its parameters (the
  bubbles' depth did).
- A test suite that reaches into its engine (a log of releases, the pool, constructor options)
  gets the same hooks from the WebAssembly class: `forte_engine(handle)` gives the engine to the
  instrument's own exports.

Each instrument goes through this checklist, which is its definition of
done:
1. Port the engine and model to C++, with generated parameters and converted
   data.
2. Build its WebAssembly and commit it. Its JavaScript wrapper exposes:
   - the engine contract (so `shared/worklet.js` and the Node tests use it
     unchanged);
   - the model functions the views call.
3. Run its test suite on the WebAssembly (`FORTE_ENGINE=wasm npm test <slug>`),
   and compare the reference renders.
4. Build its plugins (VST3, CLAP, AU, standalone):
   - MIDI notes and velocity, sustain or hold (CC64), mod wheel (CC1),
     aftertouch and pitch bend;
   - parameters, factory presets, and state saved and restored;
   - zero latency.
5. Validators pass in CI. CPU is measured: 10 voices at 48 kHz well inside a
   core, as on the site.
6. Switch the website: the worklet loads the WebAssembly, falling back to the
   JavaScript engine if it fails, and the views call the WebAssembly models.
   Check it in Chrome, Firefox and Safari, including on iPad.
7. Bump the instrument's MINOR version and Forte's for `native/core` and
   `tools/`, log both in the changelog, and update the instrument's README and
   the guide. Set `plugin.ready` in the registry (step 5). In the pull request, ask the owner
   to listen in a DAW.

The template went first, so that `tools/new-instrument.mjs` can create new
instruments natively. Update `docs/INSTRUMENT_GUIDE.md` to match.

### 4. Port the rest, in batches
Port by shared machinery, simplest first, one pull request per instrument.
Separate sessions can work in parallel once step 3 is done.
1. Modal bars, bells and plates: vibraphone, carillon, glass, gongs. **Done** (Vibraphone 0.3.0,
   Carillon 0.2.0, Glass Armonica 0.4.0, Gong Keyboard 0.4.0, Forte 0.14.0), in one pull
   request with a commit per instrument, the four ported in parallel. All four play what the
   JavaScript plays to float32 rounding, but for the gongs' crashes, compared within the spread
   the JavaScript shows against itself (`reference` may be a function of the script). In C++, ten
   voices take 2 % of a core (vibraphone), 4 % (carillon), 5 % (glass) and 17 % (gongs; 37 % with
   all ten crashing). Learned on the way:
   - Per-note data that WebAssembly would build in place (no threads) costs the audio thread on a
     key's first note. The vibraphone's page builds each bar with its main-thread WebAssembly
     model and sends it packed with the note (`offer()`); the piano, tines and reeds can do the
     same. A `KeyData` version made from the parameters' values, not a counter, keeps the
     JavaScript's key-and-parameter identity.
   - An instrument whose notes only look up tables (the carillon) needs no `KeyData`.
   - Engines with per-key arrays reach 100 KB: native tests make them with `make_unique`, since
     WebAssembly's stack is 64 KB.
   - A native test that depends on the worker having built something waits for it (the glass's
     `ready(key)`), rather than for a number of samples: under load the worker lags the render.
   - A test hook can hand back `Float64Array` views into the engine's memory, so a test that
     writes the engine's state works unchanged.
2. Strings: piano, grand, harpsichord, clavier, bowed. **Done** (Ribbon Piano 0.4.0, Harpsichord
   0.3.0, Electric Grand 0.4.0, Tangent Clavier 0.4.0, Viola Organista 0.4.0, Forte 0.16.0), again
   in one pull request with a commit per instrument. All five play what the JavaScript plays to
   float32 rounding or better; the viola organista's chaotic friction matches bit for bit. In C++,
   ten voices take 4 % of a core (piano), 5 % (harpsichord, grand), 6 % (bowed; 18 % with the
   dampers lifted) and 14 % (clavier). Learned on the way:
   - The system's `sin`, `exp`, `pow`… differ from V8's in the last bit for a few percent of
     inputs, which a chaotic instrument amplifies. `forte/fdlibm.h` (in `native/core` since Forte
     0.19.0) is V8's own fdlibm; a port that must match the JavaScript exactly through chaos can
     use it.
   - Without threads, `KeyData` must free what it replaced as blocks go by (Forte 0.16.0), or the
     WebAssembly's memory grows each time a knob moves. A page view that runs a WebAssembly engine
     on the main thread (a slow motion) calls `destroy()` afterwards.
   - A shared object that every key's data depends on (the grand's soundboard) can live in an
     unused `KeyData` slot (key 0) with its own version.
   - Eigen keeps blocks of up to 128 KB on the stack: native tests run as WebAssembly with the
     modules' 256 KB stack.
   - Don't name an instrument's files after system headers (`string.h`): the folder is on the
     include path.
   - After a call that may grow the WebAssembly's memory, take `memory.buffer` again before writing.
3. Reeds and pickups: tines, reeds, pianet, harmonium, pipes. **Done** (Tine Piano 0.4.0, Reed
   Piano 0.4.0, Sticky-Pad Piano 0.4.0, Free-Reed Organ 0.3.0, Pipe Organ 0.3.0, Forte 0.19.0), in
   one pull request with a commit per instrument. The sticky-pad piano, free-reed organ and pipe
   organ play what the JavaScript plays to float32 rounding or better (the pipes mostly bit for
   bit); the tine piano to 4 × 10⁻⁶ and the reed piano's own reeds to 5 × 10⁻⁶ (below). In C++,
   ten voices take 1 % of a core (pianet), 5 % (reeds), 7 % (harmonium; 20 % with the musette),
   13 % (tines) and 15 % (pipes, three stops). Learned on the way:
   - A stiff finite-element eigenproblem (the tine, the reed) is badly conditioned: Eigen and
     `linalg.js` round it differently, so a port matches to 10⁻⁶ rather than float rounding. Its
     tests compare the engines on the same per-key data, which the page builds with the
     WebAssembly model anyway.
   - A page engine can decay into denormals that the native build flushes (the pianet's pad face
     made every voice ten times as costly in the JavaScript): flush small state by hand.
   - Large per-voice buffers (the pipes' delay lines) are reserved up front in the plugin but grown
     on demand in the WebAssembly, where the Node tests make hundreds of engines.
   - A page that sends page-built data with a note must know which engine plays it: the shell
     waits for the worklet's engine message before the first note (Forte 0.19.0).
   - Native tests run as WebAssembly see `CI` through `native/tests/node-env.js`.
4. Self-oscillators: Huygens, arc, pyrophone, wind harp. **Done** (Huygens Keyboard 0.4.0,
   Singing Arc 0.2.0, Pyrophone 0.4.0, Wind Harp 0.2.0, Forte 0.23.0), in one pull request with a
   commit per instrument. All four play what the JavaScript plays bit for bit, their seeded noise,
   turbulence and gusts included, so no reference needed statistics. In C++, ten voices take 2 %
   of a core (Huygens), 2–3 % (pyrophone) and 10 % (wind harp); the arc's six lamps 20 %.
   Learned on the way:
   - Chaotic or noisy is not a reason to give up on matching: with V8's fdlibm for every
     transcendental (and ports of `Math.hypot` and `Math.log2`, which fdlibm lacks) and the
     JavaScript's own seeded generators, even self-oscillators match bit for bit. An engine that
     used `Math.random()` (Huygens) gets a seeded generator first.
   - A table the page already builds (the arc's capacitors, the pyrophone's tuning) goes to the
     worklet with the note (`noteData`) or in its own message posted before the parameters
     (`fullParams` hands a WebAssembly engine only `m.P`); in the plugin it is `KeyData` slot 0
     with a version, and a note plays the last table until the new one is ready.
   - An engine whose physics depends on the block length (the wind harp's wind) needs long blocks
     passed whole: `shared/wasm.js` splits blocks into 128s.
   - Test hooks that hold a voice across `process()` need live getters over a stable pointer, and
     engines the Node tests drop can be freed with a `FinalizationRegistry`.
   - A parameter whose default sits off its step must read back as itself (Forte 0.23.0).
5. Table-driven: black hole, quantum, stars, springs. **Done** (Black-Hole Keyboard 0.4.0,
   Quantum Keyboard 0.4.0, Star Keyboard 0.2.0, Spring Keyboard 0.2.0, Forte 0.24.0), in one pull
   request with a commit per instrument. All four play what the JavaScript plays bit for bit. In
   C++, ten voices take 1.5 % of a core (black hole), 4 % (quantum), 8–10 % (springs) and 12 %
   (stars). Learned on the way:
   - "Table-driven" turned out to mean one real table (the black hole's, converted by a
     `--native` writer); the stars and springs are closed forms and solves, the quantum keyboard's
     table ten Airy zeros copied as literals.
   - Anything the JavaScript does that touches shared random state (the stars' JIT warm-up) or
     depends on call order (the springs' solver cache keyed by `toFixed`) must be ported
     literally, or the bits part.
   - Page-built per-note data can be larger than the 64 KB scratch area (the springs'): give it
     its own buffers. A wrapper can take the JavaScript's own shape and pack it, so the page's data
     and a test's made-up data go through one path.
   - A suite that compares Float64 renders to 10⁻⁹ needs a double-precision render hook in the
     WebAssembly (`render<T>()`).
   - A web filter default can sit above a plugin host's Nyquist (8 kHz): the chain's low-pass now
     passes everything at or above it, as Web Audio's (Forte 0.24.0).
   - `Math.log2` has copies in huygens and springs; `forte/fdlibm.h` now has V8's own, for the
     next port that needs it.
6. The organ. **Done** (Tonewheel Organ 0.5.0, Forte 0.26.0). It plays what the JavaScript plays
   bit for bit; ten keys with every drawbar, chorus, drive and the Leslie take 2.5 % of a core in
   C++. Learned on the way:
   - State a page keeps beside its parameter groups becomes plugin parameters through the
     descriptor's `console`, with `get(P)` mapping them back to the page's shape; presets set all
     of it, so a host recalls the whole registration.
   - A choice switched by a controller (the Leslie on CC1 and CC64) is a `controllers` entry with
     `values` or `toggle`; the plugin tells the host of each change, and the window's Space bar
     plays a CC64 toggle.
   - Tables that depend on the sample rate and the parameters (the tone generator) can be fixed
     size and rebuilt in place on the audio thread when they are cheap (3 µs here).
   - `forte/fdlibm.h` gains V8's `tanh`, `expm1` and `Math.hypot`; glibc's tanh differs from V8's
     in the last bit for about one argument in 2000.
   - Growing a shared struct (`forte::Controller`) changes every committed `.wasm` by its layout
     alone: rebuild them all in the same pull request, or the `wasm` job fails.

Chaotic instruments (gong crashes, bowed friction, flames, wind) can't match
the JavaScript sample for sample; their tests are statistical already, and
the reference comparison uses statistics too.

After an instrument has run from WebAssembly for a while without
regressions, remove its JavaScript engine and model in a separate pull
request.

### 5. Distribution
Done (Forte 0.13.0; per instrument and automatic in 0.17.0):
1. The `native` workflow packages each system's plugins with `tools/package-plugins.sh`: every
   instrument's together (`Forte-plugins-macos.zip`, `-windows.zip`, `-linux.tar.gz`) and each
   one's alone (`Forte-<slug>-macos.zip`…), all but the template's, with
   [native/INSTALL.md](../native/INSTALL.md): the `release-<preset>` artifacts. The macOS bundles
   are ad-hoc signed; INSTALL.md gives the `xattr` command. The macOS and Linux archives also
   hold [native/install.sh](../native/install.sh) and, as their `Makefile`,
   [native/install.mk](../native/install.mk): `make install`, `make verify` (auval on macOS,
   missing libraries on Linux, clap-validator if present), `make uninstall` and `make check`
   (the download in place, nothing installed), each also for one format (`make install-au`,
   `make check-app`…), which the workflow runs on every instrument's archive before keeping it.
2. The `release-plugins` workflow runs after every green `native` run on main and attaches its
   archives to a GitHub Release when what they're built from changed since the latest release
   (`tools/plugin-release.mjs --manifest`: each instrument's version and the `native/` tree). It
   creates the tag itself (`plugins-v<Forte version>`, then `-2`, `-3`…), since sessions don't
   push tags, and writes the notes. It can also be started from the Actions tab.
3. Each plugin's version is its instrument's (`<slug>-info.cmake`, generated).
4. `shared/plugins.js` names the archives. The front page's All Plugins overlay links every
   instrument's together; an instrument's page has its own under ↓ Plugin, in a dialog of its
   own (`…/#plugin`; on phones, a line at the top of How it works opens it).

A port sets `plugin: { code, ready: true }` in `shared/registry.js` (`test/site-tests.mjs`
checks it against `native/instruments/`), and its plugins are released when it is merged.

**Notarised macOS builds** would remove the `xattr` step. They need the owner's Apple
Developer Program membership (99 USD a year), a *Developer ID Application* certificate and an
app-specific password or App Store Connect API key, stored as repository secrets; the release
would then sign with `codesign --options runtime --timestamp` and submit with
`xcrun notarytool submit --wait` and `xcrun stapler staple`. Windows code signing likewise
needs a certificate the owner buys.

### 6. Later
- The plugin window (Forte 0.21.0: `native/plugin/editor.h`, `editor.html`) shows the controls
  and a keyboard. Still to come: the site's views (the modes, the waveforms), fed from the
  engine's messages, and each page's own layout of its controls (`showIf`, hints).
- MIDI Polyphonic Expression (the engines already take per-key pressure).
- iPad AUv3 inside a container app (needs the Apple Developer Program to
  share), and notarised macOS builds (step 5 says what they need).
