# native/

Forte's instruments in C++: one source of physics for the plugins (CLAP, VST3, AU v2 and a
standalone app, on macOS, Windows and Linux) and for the website, which will run it as
WebAssembly. The plan, its decisions and its progress are in
[docs/PLUGINS.md](../docs/PLUGINS.md).

```
CMakeLists.txt, CMakePresets.json   the build; one preset per platform, and wasm
cmake/dependencies.cmake            every dependency, pinned to a commit
cmake/patches/                      our changes to clap-wrapper (the Mac standalone's MIDI inputs)
cmake/forte.cmake                   forte_add_plugin(): an instrument's plugins
emscripten-version                  the Emscripten the WebAssembly is built with
ids.json                            each instrument's VST3 class id: generated once, never changed
core/                               the engine contract (engine.h), parameters (params.h), the
                                    instrument description (instrument.h), and what the engines
                                    share: dsp.h, impulses.h, linalg.h (Eigen), the output chain
                                    (chain.h: tone, body, room, volume, limiter), background.h
plugin/                             the CLAP plugin every instrument shares
web/engine-api.cpp                  the engine contract as C functions, for the WebAssembly
instruments/<slug>/                 a ported instrument: engine, model, generated tables (the
                                    template, bubbles, vibraphone, carillon, glass, gongs, piano,
                                    harpsichord, grand, clavier, bowed, tines, reeds,
                                    pianet, harmonium, pipes, huygens, arc, pyrophone,
                                    windharp, blackhole, quantum, stars, springs, organ, ring, celesta, cavity, showers,
                                    whistlers, universe, project8, abracadabra and tess;
                                    docs/INSTRUMENT_GUIDE.md,
                                    "The native port")
tests/                              native unit tests (CTest); tests/smoke, a test instrument
```

## Building

You need CMake 3.25 or later, Ninja and a C++20 compiler (Xcode's on macOS, Visual Studio 2022
on Windows). The first configure downloads the dependencies into the build folder.

```bash
cd native
cmake --preset linux        # or macos, windows
cmake --build --preset linux
ctest --preset linux
```

If git can't reach gitlab.com (some sandboxes), fetch Eigen's archive at the pinned commit
(`https://gitlab.com/libeigen/eigen/-/archive/<commit>/eigen.tar.gz`), unpack it and configure
with `-DFETCHCONTENT_SOURCE_DIR_EIGEN=<that folder>`.

The plugins land in `build/<preset>/plugins/`. On Linux, the standalone needs ALSA and JACK
headers (`libasound2-dev libjack-jackd2-dev`) and X11 (`libx11-dev`), and the window's web
view needs GTK and WebKitGTK (`libgtk-3-dev libwebkit2gtk-4.1-dev`).

To validate them as CI does:

```bash
cmake --build build/linux --target vst3_validator   # Steinberg's validator, from the pinned SDK
build/linux/validator-build/bin/Debug/validator "build/linux/plugins/<Name>.vst3"
cargo install --locked --git https://github.com/free-audio/clap-validator --tag 0.4.1 clap-validator
clap-validator validate "build/linux/plugins/<Name>.clap"
```

and on macOS `auval -strict -v aumu <code> Frte`, after copying the `.component` into
`~/Library/Audio/Plug-Ins/Components` (the codes are in `shared/registry.js`).

### WebAssembly

With the Emscripten in `emscripten-version`:

```bash
git clone https://github.com/emscripten-core/emsdk && cd emsdk
./emsdk install "$(cat ../forte/native/emscripten-version)" && ./emsdk activate "$(cat ../forte/native/emscripten-version)"
source ./emsdk_env.sh
cd ../forte/native && cmake --preset wasm && cmake --build --preset wasm && ctest --preset wasm
```

Each ported instrument's build lands next to its page (`<slug>/wasm/<slug>.wasm`, the template's
in `docs/template/wasm/`) and is committed, so the site still needs no build step; CI rebuilds
it and fails if the committed file is stale. The versions are not in it (the plugins' build
passes them from `<slug>-info.cmake`), so a release's version bumps leave it alone. It is a standalone module with no JavaScript glue:
`shared/wasm.js` loads it in the page, the AudioWorklet and Node, and wraps the C functions of
`web/engine-api.cpp` in a class with the engine contract. The pages, the Node tests and the
tools all play it.

## The shared core

`core/` is `shared/` in C++, checked against it: `tools/gen-native-vectors.mjs` writes what the
JavaScript computes (`tests/js-vectors.h`) and `tests/shared-tests.cpp` compares.

- `dsp.h`: `modeCoeffs`, `Biquad`, `OnePole`, `DCBlock`, `Delay`, `keyPan`, … operation for
  operation, in double precision, as `shared/dsp.js`.
- `impulses.h`: the soundboard, the room and the venues' responses from the same seeded
  Mulberry32 as `shared/impulses.js`: the random sequence is bit for bit the same, the responses equal to the
  last bit of float32 but where `exp`, `sin` or `cos` round differently from V8's.
- `linalg.h`: `symEig`, `genEig` and `cholesky` on Eigen. Eigenvalues ascending as in
  `shared/linalg.js`; an eigenvector's sign is arbitrary in both, so a model must not depend on
  it. Where JavaScript throws, these return nothing (the engines have no exceptions).
- `chain.h`: the output chain the pages build with `shared/chain.js` (Web Audio's low-pass and
  its convolver's normalisation, the room and soundboard), plus `limiter.h`, the compressor
  curve and makeup gain of Web Audio's DynamicsCompressorNode without its 6 ms look-ahead (the
  pages run the same limiter, `shared/limiter.js`).
  The convolutions have no latency (direct taps, then partitioned FFT stages that spread
  their work): about 3 % of a core for the room at 48 kHz, 4.5 % for the cathedral's 6 s, 5 %
  with a soundboard. A venue first chosen while playing is built on a worker thread (up to
  0.1 s for the cathedral); until it is ready the old room plays on, and then it rings out.
- Real-time plumbing: `queue.h` (lock-free single-producer, single-consumer), `Message` and
  `Engine::post` for what an engine tells a page, `denormals.h` (flush to zero while
  processing), `guard.h` (shared/guard.js), and `background.h`: per-key data built on a worker
  thread (a page's `noteData`) and handed to the audio thread without locks or allocation,
  freed once no voice holds it. Without threads (WebAssembly) it builds in place.

## The plugins

Every instrument is the same CLAP plugin (`plugin/plugin.cpp`) around its own engine and its
description (`InstrumentInfo`, from the JavaScript descriptor by `tools/gen-native-params.mjs`).
clap-wrapper builds the VST3, AU v2 and standalone from the CLAP. Each plugin:

- takes notes and MIDI as the pages do: velocity through a *Velocity curve* parameter (Soft,
  Normal, Hard), the sustain pedal or Hold (CC64), sostenuto (CC66) and the soft pedal (CC67)
  where the instrument maps neither, the mod wheel (CC1), aftertouch (channel, polyphonic, and
  CLAP's pressure expression), pitch bend (±2 semitones where the instrument bends), and All
  Notes Off (CC120, CC123);
- has the instrument's parameters, with stable ids hashed from the JavaScript ids, and a
  Preset parameter that applies a factory preset (the defaults, then the kept parameters,
  then the preset's values, as the pages do);
- has a Quality choice (High, Medium, Low; `forte::Quality` in `engine.h`) after the velocity
  curve: the engine plays less physics at Medium and Low for a slow computer. The project keeps
  it, presets don't, and a host rendering offline (CLAP's render extension, which clap-wrapper's
  VST3 passes on and its AU v2 does not) gets High;
- saves its state as text (`forte <slug> <version>`, then `<id> <value>` per line), so a
  project survives parameters being added;
- plays through the output chain, with flush-to-zero, a NaN guard, and engine blocks of at
  most 128 samples split at each event, whatever the host's block; a new sample rate makes a
  new engine and new impulse responses (tested at 44.1 to 192 kHz and blocks of 1 to 4096);
- has no latency;
- has a window (`editor.h`, `editor.cpp`, `editor.html`): the instrument's controls in their
  groups, the presets, the controls a player reaches for above the keys, and a keyboard played
  with the mouse, a finger or the computer's keys (as on the pages), lit by the notes that come
  in by MIDI. It is a web view from [choc](https://github.com/Tracktion/choc): WKWebView on
  macOS, WebView2 on Windows (part of Windows 10 and 11), WebKitGTK in an X11 window on Linux.
  The page calls the plugin through `window.forte(method, …)`; the tests make the same calls
  without a window. Open `editor.html` in a browser to work on it: it plays a made-up
  instrument there. `-DFORTE_EDITOR=OFF` builds the plugins without it.

Identifiers: CLAP `net.jthaler.forte.<slug>`, vendor Forte, AU manufacturer `Frte` with the
instrument's subtype from the registry (`plugin.code`), VST3 class id from `ids.json`.

### The Forte app

`Forte` (target `forte_suite_standalone`) is one standalone with every ported instrument but
the template, picked from the Instrument menu at the top of its window (`editor.html?suite`
shows the menu in a browser). `forte_add_suite()` (`cmake/forte.cmake`) builds it after the
instruments from what `forte_add_plugin()` recorded, so a new port joins it with no change: each
instrument's `<slug>-instrument.cpp` is compiled again with `forte_instrument` renamed
`forte_instrument_<slug>`, and a generated table lists them. In `plugin.cpp` a `Suite` holds one
instrument's `Plugin` at a time and passes the host's calls to it: a new one is made and
activated on the main thread and handed to the audio thread, which takes it at its next block,
and the one before is deleted once it has. Its id is `net.jthaler.forte.suite`, its version
Forte's, and its state `forte-suite <slug>` then the instrument's own, so the app reopens on
the last instrument. It is only a standalone: a DAW keeps a plugin's parameters while it is
active, and these change with the instrument. The release ships it in the archives with every
instrument (`Forte-plugins-<system>` and `Forte-plugins-app-<system>`), and alone in
`Forte-app-<system>`.

### Icons

`icons/` holds each standalone app's icon: `forte.icns`/`.ico` for the Forte app, in the site's
colours, and `<slug>.icns`/`.ico` for each instrument, in its `FORTE_ACCENT`.
`python3 tools/make-icons.py` (numpy and Pillow) draws them with the site's own icons; run it
again after adding an instrument. `forte.cmake` hands them to clap-wrapper for the macOS and
Windows standalones (`cmake/patches/clap-wrapper-mac-app-icon.patch` names the icon in the Mac
app's `Info.plist`, which clap-wrapper leaves empty). Linux's standalones are bare executables,
so they have none.
