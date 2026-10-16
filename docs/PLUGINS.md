# Native plugins and WebAssembly

The plan for turning Forte's instruments into plugins (VST3, AU, CLAP) that run
in a DAW, built from the same C++ physics that the website will run as
WebAssembly. One source of physics, two homes:

```
native/core + native/instruments/<slug>   C++: engines and models
        ├── plugins   VST3 + CLAP (macOS, Windows, Linux), AU (macOS), standalone
        └── WebAssembly   loaded by the site's AudioWorklet, and called by its views
```

Status: **step 0 done** (the native setup; see [native/README.md](../native/README.md));
steps 1–3 for the template under way. The decisions below were made by the owner on
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
| Plugin UI | **The DAW's generic panel** in phase 1 | No custom window to build or maintain while the physics is ported. A web-based editor reusing the site's views can come later. |

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

### 1. Make each instrument headless in JavaScript first
This is a refactor that leaves the sound unchanged; it is useful even before
any C++ exists.
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

### 2. The shared native core
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
   the guide. In the pull request, ask the owner to listen in a DAW.

The template goes first, so that `tools/new-instrument.mjs` can create new
instruments natively. Update `docs/INSTRUMENT_GUIDE.md` to match.

### 4. Port the rest, in batches
Port by shared machinery, simplest first, one pull request per instrument.
Separate sessions can work in parallel once step 3 is done.
1. Modal bars, bells and plates: vibraphone, carillon, glass, gongs.
2. Strings: piano, grand, harpsichord, clavier, bowed.
3. Reeds and pickups: tines, reeds, pianet, harmonium, pipes.
4. Self-oscillators: Huygens, arc, pyrophone, wind harp.
5. Table-driven: black hole, quantum, stars, springs.
6. The organ.

Chaotic instruments (gong crashes, bowed friction, flames, wind) can't match
the JavaScript sample for sample; their tests are statistical already, and
the reference comparison uses statistics too.

After an instrument has run from WebAssembly for a while without
regressions, remove its JavaScript engine and model in a separate pull
request.

### 5. Distribution
1. Add a `release-plugins` workflow, which the owner starts from GitHub's
   Actions tab. It builds every plugin on all three platforms and attaches
   them to a GitHub Release, creating the tag itself, since sessions don't
   push tags.
   - macOS: ad-hoc signed, with install instructions and the `xattr` command.
   - Windows and Linux: VST3 and CLAP.
2. Give each plugin's version its instrument's version.
3. Add a "Plugins" section to the front page and the README.

### 6. Later
- A custom plugin editor: a web view reusing the site's controls and views,
  fed from the engine.
- MIDI Polyphonic Expression (the engines already take per-key pressure).
- iPad AUv3 inside a container app (needs the Apple Developer Program to
  share), and notarised macOS builds.
