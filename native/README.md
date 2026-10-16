# native/

Forte's instruments in C++: one source of physics for the plugins (CLAP, VST3, AU v2 and a
standalone app, on macOS, Windows and Linux) and for the website, which will run it as
WebAssembly. The plan, its decisions and its progress are in
[docs/PLUGINS.md](../docs/PLUGINS.md).

```
CMakeLists.txt, CMakePresets.json   the build; one preset per platform, and wasm
cmake/dependencies.cmake            every dependency, pinned to a commit
cmake/forte.cmake                   forte_add_plugin(): an instrument's plugins
emscripten-version                  the Emscripten the WebAssembly is built with
ids.json                            each instrument's VST3 class id: generated once, never changed
core/                               the engine contract (engine.h), parameters (params.h),
                                    the instrument description (instrument.h), shared DSP
plugin/                             the CLAP plugin every instrument shares
instruments/<slug>/                 a ported instrument: engine, model, generated tables
tests/                              native unit tests (CTest); tests/smoke, a CI-only plugin
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

The plugins land in `build/<preset>/plugins/`. On Linux, the standalone needs ALSA and JACK
headers (`libasound2-dev libjack-jackd2-dev`) and X11 (`libx11-dev`).

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

The built WebAssembly is committed next to each instrument's page, so the site still needs no
build step; CI rebuilds it and fails if the committed files are stale.

## The plugins

Every instrument is the same CLAP plugin (`plugin/plugin.cpp`) around its own engine and its
description (`InstrumentInfo`, from the JavaScript descriptor by `tools/gen-native-params.mjs`).
clap-wrapper builds the VST3, AU v2 and standalone from the CLAP. Each plugin:

- takes notes and MIDI as the pages do: velocity, the sustain pedal or Hold (CC64), the mod
  wheel (CC1), aftertouch (channel, polyphonic, and CLAP's pressure expression), pitch bend,
  and All Notes Off (CC120, CC123);
- has the instrument's parameters, with stable ids hashed from the JavaScript ids, and a
  Preset parameter that applies a factory preset (the defaults, then the kept parameters,
  then the preset's values, as the pages do);
- saves its state as text (`forte <slug> <version>`, then `<id> <value>` per line), so a
  project survives parameters being added;
- has no latency, and no window of its own: the DAW shows its generic panel.

Identifiers: CLAP `net.jthaler.forte.<slug>`, vendor Forte, AU manufacturer `Frte` with the
instrument's subtype from the registry (`plugin.code`), VST3 class id from `ids.json`.
