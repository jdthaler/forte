# Changelog

Forte and each instrument have their own [semantic version](https://semver.org).
Forte's version covers the site and the shared code (`shared/`, the
landing page and the tools). An instrument's version covers its folder,
its tests and its demos. Everything is pre-release (0.x) for now, so any
release may change the sound or the parameters.

Releases up to Forte 0.3.0 are tagged in git as `forte-vX.Y.Z` or
`<instrument>-vX.Y.Z`, for example `piano-v0.1.0`. Later releases are not
tagged; this changelog and the commit titles record them.

## 2026-10-17 — the tonewheel organ in C++ (step 4, last batch)

### Tonewheel Organ 0.5.0
- **Ported to C++** (`native/instruments/organ`): the tone generator and the engine (the motor,
  91 wheels, the key contacts with their seeded bounce, the busbars, percussion, the scanner's LC
  line, the tube drive and the Leslie), operation for operation, with V8's fdlibm.
  - **Plugins:** Tonewheel Organ as CLAP, VST3, AU v2 and a standalone app. The console is
    parameters of its own: nine drawbars, percussion on, soft, fast and third, vibrato and chorus,
    the Leslie bypassed, slow, fast or stopped, and the motor; the nine presets set all of it. The
    mod wheel puts the Leslie on fast, each press of a sustain pedal or the window's Space bar
    flips it, and CC11 is the expression pedal. The generator's tables are rebuilt in place
    without allocating. Ten keys with every drawbar, chorus, drive and the Leslie take 2.5 % of a
    core.
  - **WebAssembly:** 61 KB in `organ/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**, falling back to the JavaScript (`?engine=js` forces it); the header has
    the C++ | JS switch, and the analysis table, generator map and Leslie view call its model.

### Forte 0.28.0
- A descriptor's `console` (state the page keeps beside its parameter groups) becomes plugin
  parameters, set by the presets and passed to a WebAssembly engine (`tools/gen-native-params.mjs`,
  `shared/wasm.js`, `tools/headless.mjs`).
- `controllers` can switch a choice between two values, by level (`values`) or flipped by each
  press (`toggle`); the plugin window's Space bar plays a CC64 toggle, and CC1 reaches
  `controllers` when an instrument has no mod-wheel parameter.
- `forte/fdlibm.h`: V8's `tanh`, `expm1` and `Math.hypot`.
- Every instrument's committed WebAssembly is rebuilt, because the shared controller table grew;
  the sound and the parameters are unchanged.

## 2026-10-17 — clear the quarantine where the plugins are

### Forte 0.27.0
- **`make unquarantine`** in the downloads' Makefile clears macOS's download quarantine on the
  plugins in the unpacked folder, where they are, so the standalone opens from there without
  being moved or installed. `make unquarantine-app` (or `-au`, `-vst3`, `-clap`) does one
  format, and naming a folder clears the copies there instead, e.g.
  `make unquarantine-app APP_DIR=/Applications`. On Linux there is nothing to clear and it says
  so. `make check` and `make verify` now point at it when they find a quarantined plugin.
- The `native` workflow quarantines the standalones, unpacked and installed, and checks that
  `make unquarantine-app` clears them; the site test covers the Linux path.

## 2026-10-17 — one plugin format at a time, and the standalone checked where it is

### Forte 0.25.0
- **One format at a time** in the downloads' Makefile: `make install-au`, `install-vst3`,
  `install-clap` and `install-app` (the standalone), and the same for `verify-` and
  `uninstall-`.
- **`make check`** checks the plugins in the unpacked folder without installing anything: the
  signature and the download quarantine on a Mac, the libraries they need on Linux, and
  clap-validator for the CLAPs when it is installed. `make check-app` checks just the
  standalone, which runs from the folder.
- The `native` workflow also runs `make check`, a format alone, and `make check-app` on a
  quarantined copy of the standalones (which it must refuse) on macOS and Linux; the site test
  covers them on a stand-in download. `install.sh` keeps to macOS's bash 3.2.

## 2026-10-17 — the table-driven instruments in C++ (step 4, fifth batch)

### Black-Hole Keyboard 0.4.0
- **Ported to C++** (`native/instruments/blackhole`): the quasinormal-mode bank with its cubic
  Hermite interpolation, the spherical harmonics, the merger's excitation, each key's voice, the
  inspiral's chirp and the strain curve, and the ringdown engine, operation for operation, with V8's
  fdlibm, `Math.log10` and `Math.hypot`. Leaver's table is converted number for number to
  `qnm-table.h` (`node tools/blackhole-native-table.mjs`, also written by `tools/qnm-table.mjs`),
  and a test keeps it fresh.
  - **Plugins:** Black-Hole Keyboard as CLAP, VST3, AU v2 and a standalone app: velocity^1.5 as on
    the page, the spin on the mod wheel, the ten presets. A key's voice is built from the table in
    microseconds as the note starts. Ten voices take about 1.5 % of a core.
  - **WebAssembly:** 159 KB in `blackhole/wasm/` (mostly the table). The test suite passes on it,
    and it plays what the JavaScript plays bit for bit, inspirals included.
  - **The page runs it**: the QNM plane, the strain plot and the mode table call the WebAssembly
    model and each note plays the voice they show, falling back to the JavaScript; the header has
    the C++ | JS switch.
- **Cheaper:** a mode that has died away goes to zero instead of decaying into denormals beside
  a long fundamental, which made the JavaScript engine four times costlier on near-extremal
  rings. The sound is unchanged.

### Quantum Keyboard 0.4.0
- **Ported to C++** (`native/instruments/quantum`): the five wells' spectra and matrix elements,
  the tempo lock, each key's wavepacket, the exact phasor sum with T₁, dephasing, the pump's ramp,
  voice stealing and the 3000-pair budget, and the views' eigenfunctions, operation for operation,
  with V8's fdlibm.
  - **Plugins:** Quantum Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 the damper, the
    mod wheel the dephasing rate, the nine presets. Each key's packet is built on a worker thread
    for the knobs as they are. Ten voices take about 4 % of a core (12 % with hydrogen at σ = 4 on
    the antenna).
  - **WebAssembly:** 76 KB in `quantum/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**, and computes its packets and eigenfunctions with the WebAssembly model,
    falling back to the JavaScript.

### Star Keyboard 0.2.0
- **Ported to C++** (`native/instruments/stars`): the model (the scaling relations, the track, the
  asymptotic and mixed modes, the tuning of every key, the δ Scuti stars) and the engine (the
  stochastically driven modes, the flare, the Landau growth), operation for operation, with V8's
  fdlibm and the JavaScript's seeded generators, its warm-up included.
  - **Plugins:** Star Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 the sustain pedal,
    the mod wheel spins the stars up, aftertouch drives the convection harder, the eleven presets.
    Each key's star is built on a worker thread when the kind, mass or speed-up changes. Ten stars
    take about 12 % of a core.
  - **WebAssembly:** 86 KB in `stars/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit, its random convection and flares included.
  - **The page runs it**: it builds each key's star with the WebAssembly model and sends it with
    the note, and its views use that model, falling back to the JavaScript.

### Spring Keyboard 0.2.0
- **Ported to C++** (`native/instruments/springs`): the helical springs' rods (the same Jacobi
  rotations, and the same solver cache, so neighbouring keys share a solver as in the JavaScript),
  the tuning by ear, the dispersion and the engine, operation for operation, with V8's fdlibm.
  - **Plugins:** Spring Keyboard as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the
    damper pedal, the mod wheel the hand on the springs, the eleven presets. Each key's springs
    (about 3 ms) are built on a worker thread as soon as the geometry settles. Ten keys take about
    8–10 % of a core.
  - **WebAssembly:** 88 KB in `springs/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**: it builds each key's springs with the WebAssembly model and sends them
    with the note, and the echo and dispersion views draw from the WebAssembly, falling back to the
    JavaScript.

### Forte 0.24.0
- **The plugins' tone low-pass** passes everything at or above Nyquist, as Web Audio's does,
  instead of going unstable (clap-validator's 8 kHz run gave NaN with the black hole's 14 kHz
  tone). Below Nyquist it computes what it did; no WebAssembly changed.
- **`forte/fdlibm.h`** gains V8's `tan`, `log1p`, `log2` and `log10` (the star keyboard's tuning).
- **Tools:** `tools/blackhole-native-table.mjs` (new) writes the QNM table's C++ copy.
- **`plugin.ready`** for the four, so they are on the front page's Plugins section and in the next
  release; the template's generated files and WebAssembly carry Forte 0.24.0.

## 2026-10-17 — the self-oscillators in C++ (step 4, fourth batch)

### Huygens Keyboard 0.4.0
- **Ported to C++** (`native/instruments/huygens`): the tuning and the theory of synchronisation
  (δ, the lock ratio), and the neon engine (the analytic firing times, the kick cascade, polyBLEP,
  the keyer, the coupling capacitor, rail sag, drift and the pitch-hold servo), operation for
  operation, with V8's fdlibm and its `Math.log2`.
  - **Plugins:** Huygens Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel the pulse coupling, the ten presets. The engine retunes held keys itself when the
    tuning changes. Ten coupled keys take about 2 % of a core.
  - **WebAssembly:** 35 KB in `huygens/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**: its notes' tunings and the lock map (its worker included) come from the
    WebAssembly model, falling back to the JavaScript, and the header has the C++ | JS switch.
- **Repeatable:** each key's starting phase and the lamps' drift come from a seeded generator, not
  `Math.random()`, so renders and tests repeat exactly.

### Singing Arc 0.2.0
- **Ported to C++** (`native/instruments/arc`): Ayrton's curve and the Mayr column with its
  hot-carbon floor, the circuit's linear analysis, the steady note and each key's capacitor, the
  engine (Duddell's circuit at four times the sample rate, the contacts, the seeded flicker and
  hiss, the thermophone) and Simon's talking arc, operation for operation, with V8's fdlibm.
  - **Plugins:** Singing Arc as CLAP, VST3, AU v2 and a standalone app: CC64 latches the keys, the
    mod wheel raises the arc current, the eleven presets. Each key's capacitor is cut on a worker
    thread when a knob it depends on settles; until then a key plays its last one. Six singing
    lamps (the most there are) take about 20 % of a core.
  - **WebAssembly:** 73 KB in `arc/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit and cuts the same capacitors to the last bit.
  - **The page runs it**: it sends the capacitor bank it has cut with each note, so the audio
    thread never cuts one, and its views use the WebAssembly model, falling back to the JavaScript.

### Pyrophone 0.4.0
- **Ported to C++** (`native/instruments/pyrophone`): the Rijke tube (modes, losses, King's law,
  linear stability, Hopf points, harmonic balance, the branches and the tuning table) and the
  engine with its seeded turbulence, operation for operation, with V8's fdlibm and `Math.hypot`.
  - **Plugins:** Pyrophone as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 holds the
    keys, the mod wheel the flame's power, aftertouch parts the flames, the eight presets. The
    tuning table (harmonic balance) is built on a worker thread; while a tube knob moves, the tubes
    are cut from the last one. Ten tubes take 2–3 % of a core.
  - **WebAssembly:** 78 KB in `pyrophone/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit, turbulence included.
  - **The page runs it**: it builds the tuning table with its WebAssembly model and sends it to the
    worklet, and the bifurcation diagram and orbits come from the same model, falling back to the
    JavaScript.

### Wind Harp 0.2.0
- **Ported to C++** (`native/instruments/windharp`): the model (the Strouhal–Reynolds fit and the
  onset, the strings and their courses, de Langre's linear analysis, the harmonic balance and the
  locked range) and the engine (the van der Pol wake stations, the strings' modes, the low strings
  at a half or a quarter of the rate, the seeded gusts and turbulence, the soundbox, the
  shutters), operation for operation, with V8's fdlibm.
  - **Plugins:** Wind Harp as CLAP, VST3, AU v2 and a standalone app: velocity sets the shutter's
    speed and release velocity how fast it shuts, CC64 keeps the shutters open, the mod wheel blows
    the wind up to 8 m/s, aftertouch (channel or per key) blows harder, the tuning as a dropdown,
    the seven presets. Ten keys (15 strings) take about 10 % of a core.
  - **WebAssembly:** 72 KB in `windharp/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit, gusts included: blocks longer than 128 samples are played whole,
    as the JavaScript plays them, since the wind changes once a block.
  - **The page runs it**, and its lock-in map and string table come from the WebAssembly model,
    falling back to the JavaScript.

### Ribbon Piano 0.4.1
- Its "real-time budget" timing test is skipped on CI like every other suite's timing tests: the
  hyphen had kept it out of the skip, so it failed on loaded machines.

### Tonewheel Organ 0.4.4
- Its "real-time budget" timing test is skipped on CI, as the Ribbon Piano's is.

### Forte 0.23.0
- **No fused multiply-adds in the plugins** (`-ffp-contract=off` on `forte_core` and every
  instrument): on Apple silicon clang fused them, so the macOS plugins differed from the
  JavaScript in the last bit (the wind harp's native test caught it). The WebAssembly is unchanged.
- **Native parameters:** a default that sits off its parameter's step (the pyrophone's flame at ⅓
  on a 0.001 step) reads back as itself, so a saved state reloads exactly (clap-validator's state
  reproducibility test).
- **`plugin.ready`** for the four, so they are on the front page's Plugins section and in the next
  release, each with the plugin window (controls and keyboard) in its page's colour; the
  template's generated files and WebAssembly carry Forte 0.23.0.
## 2026-10-17 — make install and make verify in the plugin downloads

### Forte 0.22.0
- **A Makefile in each macOS and Linux download**, one instrument's or all of them:
  `make install` copies the plugins to the plugin folders (the standalones to `~/Applications`
  or `~/.local/bin`) and, on a Mac, clears the download quarantine and makes Logic, MainStage
  and GarageBand look again; `make verify` checks each one is installed, unquarantined and
  correctly signed, and loads (auval for the Audio Units, missing libraries on Linux,
  clap-validator for the CLAPs when it is installed); `make uninstall` removes them. The work
  is in `install.sh` next to it (`native/install.sh`, `native/install.mk`), so macOS's old make
  3.81 runs it, and it works without make. Nothing needs sudo.
- The `native` workflow runs `make install`, `make verify` and `make uninstall` on the
  all-instruments archive on macOS and Linux before keeping it, and a site test runs
  `install.sh` on a stand-in download. Windows has no make, so its archives keep INSTALL.md's
  steps.

## 2026-10-17 — 6 ms less between a key and its sound

### Forte 0.21.1
- **The pages' limiter no longer delays the sound:** Web Audio's DynamicsCompressorNode looks
  6 ms ahead, so every note on every page came out 6 ms late, whatever played it (computer
  keys, on-screen keys or MIDI). The pages now limit with `shared/limiter.js`, the plugins'
  limiter (`native/core/src/limiter.cpp`) in JavaScript, run as the `forte-limiter` processor
  in `shared/worklet.js`: the same curve and makeup gain, so levels below the threshold are
  unchanged, and no look-ahead, so a loud chord's first 2 ms may overshoot the threshold as in
  the plugins. A browser that can't make the processor falls back to the old node.
- **Output latency on the Audio on button:** its tooltip gives the browser's audio buffer plus
  the audio device's latency, as the browser reports them, to tell a slow setup (Bluetooth
  headphones, a large system buffer) from the page.
- **A Bluetooth warning:** when the browser reports 80 ms or more between the page and the
  speakers (Bluetooth headphones and speakers add 100–200 ms), a page says so once per visit
  and suggests wired ones. The front page's About Forte and the README's Playing section say
  the same.

### Huygens Keyboard 0.3.4
- Its worklet test picks the instrument's processor by name now that `shared/worklet.js`
  registers two.


## 2026-10-17 — a window for the plugins: controls and a keyboard

### Forte 0.21.0
- **The plugins have a window**: every format (CLAP, VST3, AU and the standalone app) shows the
  instrument's controls in their groups, the presets, the controls a player reaches for above
  the keys, and a keyboard to play with the mouse, a finger or the computer's keys (Z…/ and
  Q…], ◀ ▶ or ← → for the octave, Space for the pedal), as on the instrument's page and in its
  colour. Keys played by MIDI light up, and the host's automation moves the sliders. The
  standalone apps no longer need a MIDI keyboard. Moving a slider records automation in a DAW
  (gesture begin and end); double-clicking one sets its default.
- It is a web view (choc, ISC): WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux
  (the Linux plugins now need WebKitGTK 4.1, `native/INSTALL.md`). The page is
  `native/plugin/editor.html`, built into each plugin; `tests/plugin-tests.cpp` drives its calls.
- `<slug>-info.cmake` carries the page's colour (`FORTE_ACCENT`) for the window.
## 2026-10-17 — the front page's overlays, and each plugin in its own dialog

### Forte 0.20.0
- **Plugin and How it works are separate**: an instrument's ↓ Plugin button (and `…/#plugin`)
  opens a dialog of its own with the downloads, and How it works holds just the notes. On
  phones, where the ↓ Plugin button doesn't fit, a line at the top of How it works opens it.
- **The front page offers every instrument's plugins together only**: the per-instrument rows
  are gone (each instrument's download is on its page), and the downloads move from the bottom
  of the page into an **All Plugins** overlay (also at `#plugins`).
- **Credits is an overlay** on the front page too (also at `#credits`), rendering
  `docs/PRIOR_ART.md` as `credits/` does; `credits/` stays for links from elsewhere.
- **About Forte shows the app's icon**, and the cards' **Play** buttons light up, lift and nudge
  their arrow forward under the pointer.

## 2026-10-17 — the reeds and pickups in C++ (step 4, third batch)

### Tine Piano 0.4.0
- **Ported to C++** (`native/instruments/tines`): the finite-element tine with its tuning spring,
  the coupled tine, tone bar and block, the hammer tips and pickups, and the engine (the implicit
  hysteretic hammer, the nonlinear pickup, the harp's resonance, the stereo vibrato, the amp's
  drive, the half-band decimation, the speaker), operation for operation.
  - **Plugins:** Tine Piano as CLAP, VST3, AU v2 and a standalone app: velocity as the hammer's
    speed (0.25–5 m/s), CC64 the damper pedal, the ten presets, the room in the output chain. Each
    key's modes are built on a worker thread. Ten notes take about 13 % of a core.
  - **WebAssembly:** 118 KB in `tines/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays to within 4 × 10⁻⁶ of the peak: the tine's eigenproblem is badly
    conditioned, so Eigen and `linalg.js` round it differently.
  - **The page runs it**: it builds each key's modes with its WebAssembly model and sends them with
    the note, and the info panel, mode table, spectrum and slow motion call that model, all falling
    back to the JavaScript.

### Reed Piano 0.4.0
- **Ported to C++** (`native/instruments/reeds`): the reed's finite elements, tuning, losses and
  felt hammers, the slot's C(y) (`slot-table.h`, converted from `slot-table.js` by
  `node tools/reeds-native-table.mjs`), and the engine with its implicit felt contact, frame stop,
  gliding slot, comb node, photocell tremolo, preamp, decimator and speakers.
  - **Plugins:** Reed Piano as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the damper
    pedal, the nine presets. Every reed is built on a worker thread when Solder mass, Strike point
    or Hammer felt hardness settles. Ten voices take about 5 % of a core.
  - **WebAssembly:** 138 KB in `reeds/wasm/`. The test suite passes on it; on the same reed it
    plays what the JavaScript plays to float32 rounding (5 × 10⁻⁸ of the peak), with its own reeds
    to 5 × 10⁻⁶ (the eigensolver).
  - **The page runs it**: it builds each key's reed with the WebAssembly model and sends it with the
    note, and its views call that model, falling back to the JavaScript.

### Sticky-Pad Piano 0.4.0
- **Ported to C++** (`native/instruments/pianet`): the reeds, the pad's bond and its peel, and the
  pickups, with V8's fdlibm for their sines and exponentials.
  - **Plugins:** Sticky-Pad Piano as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the
    sustain pedal, the ten presets, the pickup and amplifier as dropdowns. Each key's reed is built
    on a worker thread for the tip mass and loss. Ten voices take about 1 % of a core.
  - **WebAssembly:** 116 KB in `pianet/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays to float32 rounding (within 6 × 10⁻⁸ of the peak).
  - **The page runs it**; its slow motion, mode table and release plot use the WebAssembly model,
    falling back to the JavaScript.
- **Fixed:** Panic, voice stealing past 40 voices and re-pressing a key after a new tip mass or
  loss made the engine throw (a retired voice's fade was read out of scope), and a retired voice
  that had gone to sleep never faded out.
- **Cheaper:** the free pad face no longer decays into denormals, which made every voice ten times
  as costly on the page.

### Free-Reed Organ 0.3.0
- **Ported to C++** (`native/instruments/harmonium`): the tip-weighted tongue, the slot's area, the
  voicer's design and the threshold analysis, the implicit reed step with 2× oversampling, the wind
  and the cassotto. `tuning-table.h` is the C++ copy of the tuning table
  (`node tools/harmonium-tuning.mjs --native`), and a test keeps it fresh.
  - **Plugins:** Free-Reed Organ as CLAP, VST3, AU v2 and a standalone app: velocity opens the
    pallet, CC64 holds the keys, the mod wheel raises the bellows' pressure (to 2500 Pa),
    aftertouch blows harder, the fifteen presets. Each key's reeds are designed on a worker thread
    when the voicing knobs change. Ten keys take about 7 % of a core, 20 % with the three-reed
    musette.
  - **WebAssembly:** 69 KB in `harmonium/wasm/`. The test suite passes on it, and it plays what
    the JavaScript plays to within 1.2 × 10⁻⁸ of the peak.
  - **The page runs it**, and its views use the WebAssembly model, falling back to the JavaScript.

### Pipe Organ 0.3.0
- **Ported to C++** (`native/instruments/pipes`): the pipes' scale, end corrections and losses, the
  voicing and the jet's linear analysis, and the engine (the jet's delay and low-pass, the
  labium, the pipes' modes, 2× oversampling, pallets, sliders, the wind and the tremulant, the
  same seeded turbulence). `tuning-table.h` is the C++ copy of the tuning table
  (`node tools/pipes-tuning.mjs --native`), and a test keeps it fresh.
  - **Plugins:** Pipe Organ as CLAP, VST3, AU v2 and a standalone app: velocity sets the pallet's
    speed (the chiff), CC64 holds the keys, the mod wheel raises the wind (to 3000 Pa), the
    seventeen presets. The worker voices every key ahead; the 40 voices and their delay lines are
    set aside in advance (about 7 MB an instance). Ten keys of three stops take about 15 % of a
    core.
  - **WebAssembly:** 71 KB in `pipes/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays to within 2 × 10⁻⁸ of the peak (most reference scripts bit for bit).
  - **The page runs it**: it voices each key's pipes with its WebAssembly model and sends them with
    the note, and its views call that model, falling back to the JavaScript.

### Viola Organista 0.4.1
- `bowed.wasm` rebuilt now that V8's fdlibm lives in `native/core`: it plays the same, sample for
  sample.

### Forte 0.19.0
- **V8's fdlibm moves to `native/core`** (`forte/fdlibm.h`), now that the Viola Organista and the
  Sticky-Pad Piano both use it.
- **Notes wait for the engine:** when a page has a C++ build, starting audio waits (up to a
  second) for the worklet to say which engine it runs, so the first note's page-built data is
  never sent to an engine that cannot read it.
- **Native tests as WebAssembly see `CI`** (`native/tests/node-env.js`), so they skip the CPU
  timing tests on GitHub as the Linux ones do.
- **Tools** write the new ports' C++ tables: `tools/reeds-native-table.mjs` (new),
  `tools/harmonium-tuning.mjs --native` and `tools/pipes-tuning.mjs --native`.
- **`plugin.ready`** for the five, so they are on the front page's Plugins section and in the
  next release; the template's generated files and WebAssembly carry Forte 0.19.0.

## 2026-10-17 — the presets above the keys

### Forte 0.18.0
- **The presets move above the keys:** into the keyboard bar, beside the range overview, on a
  tablet or a computer, and on a phone (where that bar is full) the first control in the strip
  above the keys. No more opening More controls to change preset. "Default settings" works as
  before, and no page's layout grows (phones scroll that strip as before).

## 2026-10-17 — each instrument's plugins on its page, released by themselves

### Forte 0.17.0
- **Each instrument's plugins alone**: a release now holds `Forte-<slug>-macos.zip`,
  `-windows.zip` and `-linux.tar.gz` for each instrument with plugins, next to every instrument
  together (`Forte-plugins-…`). `tools/package-plugins.sh` makes them all in the `native`
  workflow; `shared/plugins.js` names them for the pages.
- **On each instrument's page**: a ↓ Plugin button next to How it works opens the notes at the
  instrument's downloads (also at `…/#plugin`), and the front page's Plugins section lists each
  instrument with its macOS, Windows and Linux downloads under the downloads of all of them.
  The cards' *Plugin* links go to the instrument's downloads.
- **Releases publish themselves**: `release-plugins` runs after every green `native` run on
  main, and releases when an instrument's version or anything under `native/` changed since the
  latest release (its `manifest.txt`), so a newly ported instrument is downloadable once it is
  merged. The batch 1 instruments were missing from the downloads because a release had to be
  started by hand. Tags are `plugins-v<Forte version>`, then `-2`, `-3`… within one version.

## 2026-10-17 — the strings in C++ (step 4, second batch)

### Ribbon Piano 0.4.0
- **Ported to C++** (`native/instruments/piano`): the string model (closed form, and Rayleigh–Ritz
  for tapered members, on Eigen) and the modal engine with its felt hammers, shared bridge,
  dampers and una corda, operation for operation.
  - **Plugins:** Ribbon Piano as CLAP, VST3, AU v2 and a standalone app: velocity as the hammer's
    speed, CC64 the damper pedal, CC67 una corda, the thirteen presets, the soundboard and room in
    the output chain. Each key's modes are built on a worker thread. Ten notes take about 4 % of a
    core.
  - **WebAssembly:** 134 KB in `piano/wasm/`. The test suite and the reference pass on it, and it
    plays what the JavaScript plays to within 2 × 10⁻⁹ of the peak.
  - **The page runs it**: it builds each key's modes with its own WebAssembly model and sends them
    with the note, and the info panel, cross-section, partials and slow motion use that model, all
    falling back to the JavaScript (`?engine=js` forces it).

### Harpsichord 0.3.0
- **Ported to C++** (`native/instruments/harpsichord`): the strings (modal partials with implicit
  contacts for the plectra, the damper felt and the buff), the plectra (the cantilever, friction,
  the slip off the tip) and the soundboard, operation for operation.
  - **Plugins:** Harpsichord as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys down
    as Space does, a note-off's release velocity sets how fast the jacks fall, the thirteen
    presets. Each key's strings are built on a worker thread when a physics knob changes. Ten keys
    of 8′ 8′ 4′ take about 5 % of a core.
  - **WebAssembly:** 92 KB in `harpsichord/wasm/`. The 21-test suite passes on it, and it plays
    what the JavaScript plays to within 10⁻⁸ of the peak (most presets bit for bit).
  - **The page runs it**, and its views (the slow-motion pluck, the scale, the comb) call the
    WebAssembly model, falling back to the JavaScript.

### Electric Grand 0.4.0
- **Ported to C++** (`native/instruments/grand`): the stretch tuning, the soundboard's modes and
  residual path, each key's partials, the implicit bridge and the felt hammer, the piezo's RC and
  the preamp's EQ, operation for operation.
  - **Plugins:** Electric Grand as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the
    damper pedal, the ten presets, the scale, stringing and mount as dropdowns. Keys and the
    soundboard are built on a worker thread. Ten voices take about 5 % of a core.
  - **WebAssembly:** 103 KB in `grand/wasm/`. The 31-test suite passes on it, and it plays what the
    JavaScript plays to within 4 × 10⁻⁹ of the peak.
  - **The page runs it**; the slow motion and the mode table re-run the strike with the
    WebAssembly engine and model, falling back to the JavaScript.

### Tangent Clavier 0.4.0
- **Ported to C++** (`native/instruments/clavier`): the model (the scale and the wound strings'
  cores, the rubber tip and its wrap, the speaking and yarn modes, the pickups and the tone tabs,
  the released string's modes) and the engine (the tangent, the anvil and the felt solved together
  every sample, the tension following the stretch and the wrap, the amplifier).
  - **Plugins:** Tangent Clavier as CLAP, VST3, AU v2 and a standalone app: velocity as the
    tangent's speed, CC64 the mute bar, aftertouch and the pitch wheel pressing held keys harder,
    the nine presets. Ten bass voices take about 14 % of a core.
  - **WebAssembly:** 106 KB in `clavier/wasm/`. The 23-test suite passes on it, and it plays what
    the JavaScript plays to float32 rounding (10⁻⁷ of the peak).
  - **The page runs it**; its views, the slow motion included, draw from the WebAssembly model and
    engine, falling back to the JavaScript.

### Viola Organista 0.4.0
- **Ported to C++** (`native/instruments/bowed`): the strings' waveguides with their friction,
  rosin and torsion, the shared bridge, the soundboard and the treadle. `bowed-tuning.h` is the
  C++ copy of the tuning table (`node tools/bowed-tuning.mjs --native`), and a test keeps it fresh.
  - **Bit for bit:** the friction is chaotic, so the last bit matters: the port uses the same seeded
    grain noise and V8's own fdlibm (`fdlibm.cpp`, from V8's `ieee754.cc`, Sun's and V8's notices
    kept) for every sin, cos, exp, log and pow. The WebAssembly plays exactly what the JavaScript
    plays on every reference script.
  - **Plugins:** Viola Organista as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel is the treadle (the swell), aftertouch presses harder, the nine presets. Ten voices take about
    6 % of a core, 18 % with the dampers lifted.
  - **WebAssembly** in `bowed/wasm/`; the 29-test suite passes on it. **The page runs it**, and
    the loop design, voicing and attack map use the same C++, falling back to the JavaScript.

### Forte 0.16.0
- **`forte/background.h`**: without threads (WebAssembly), per-key data an engine replaced is
  freed once no voice holds it, instead of kept until the engine goes (memory grew each time a
  physics knob moved). The vibraphone's and glass armonica's WebAssembly are rebuilt.
- **Native tests** run as WebAssembly with the 256 KB stack the instruments' modules have:
  Eigen keeps blocks of up to 128 KB on it.
- **The engine switch** (C++ | JS) on the Ribbon Piano's page too, which has its own page code:
  `shared/shell.js` exports `engineSwitch()`.
- **`plugin.ready`** for the five, so the front page's Plugins section lists them; the template's
  generated files and WebAssembly carry Forte 0.16.0.

## 2026-10-17 — an engine switch on the ported pages, the presets in Controls

### Forte 0.15.0
- **Engine switch:** every page with a C++ build (Bubble Organ, Vibraphone, Carillon, Glass
  Armonica, Gong Keyboard, and each port to come) has a **C++ | JS** switch in its header,
  beside Discover | Perform. Picking the other engine reloads the page with it, views included,
  and every page remembers the choice. If the C++ fails to load, the switch shows JS in amber.
  `?engine=js` or `?engine=wasm` in the address still overrides it. It is for the beta, and goes
  when the JavaScript engines do.
- **The presets move to the top of the Controls panel** (under More controls on a phone), with
  "Default settings" as before, to make room for it in the header.

## 2026-10-17 — modal bars, bells and plates in C++ (step 4, first batch)

### Vibraphone 0.3.0
- **Ported to C++** (`native/instruments/vibraphone`): the bar's finite elements (Timoshenko
  bending and torsion, the banded Sturm-bisection eigensolver, the undercut optimiser), the
  losses, tubes, discs and mallet, and the engine, operation for operation. `bar-table.h` is the
  C++ copy of the tuned bars (`node tools/vibraphone-bars.mjs --native`), and a test keeps it
  fresh.
  - **Plugins:** Vibraphone as CLAP, VST3, AU v2 and a standalone app: CC64 is the damper pedal,
    the mod wheel the motor's speed, the eleven presets on the Preset parameter. Each bar's modes
    are built on a worker thread for the undercut the knob is at; a note whose bar isn't ready
    waits a few milliseconds for it. Ten bars take about 2 % of a core.
  - **WebAssembly:** 85 KB in `vibraphone/wasm/`. The 24-test suite passes on it, and it plays
    what the JavaScript plays to within 10⁻⁷ of the peak.
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript (`?engine=js` forces it). The page builds each bar with the WebAssembly model and
    sends it with the note, so the audio thread never solves a bar.

### Carillon 0.2.0
- **Ported to C++** (`native/instruments/carillon`): the model (ribs and bell sizes, bronze's and
  radiation's losses, doublets, the historic bell's seeded casting, the clapper's Hertz contact,
  air absorption, the strike-note estimator) and the engine (the clapper solved against every
  mode, doublet resonators, pruning, voice stealing, gliding knobs). The finite-element ribs and
  modes are converted number for number to `bell-table.h` (`tools/carillon-native-table.mjs`,
  which `tools/carillon-profile.mjs` now also runs); the finite elements only design the bells,
  so nothing solves an eigenproblem while they play.
  - **Plugins:** Carillon as CLAP, VST3, AU v2 and a standalone app: velocity is the baton
    stroke, CC64 the (dampless) pedal, the profile a dropdown, the ten presets on the Preset
    parameter. Ten bells ringing take about 4 % of a core.
  - **WebAssembly:** 175 KB in `carillon/wasm/` (the bell table is most of it). The 26-test
    suite passes on it, and it plays what the JavaScript plays to within 4 × 10⁻⁸ of the peak.
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript. The ribs' outline, which only the drawing uses, stays JavaScript.

### Glass Armonica 0.4.0
- **Ported to C++** (`native/instruments/glass`): the model (Rayleigh's shell modes, Bryan's
  factor, water loading, radiation, the Stribeck friction, the speaking threshold and the
  regulation) and the engine (the turning spindle, the doublets with their implicit Coriolis
  step, the skin's stick–slip contact solved every sample, the two microphones).
  - **Plugins:** Glass Armonica as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel the treadle's speed, aftertouch presses the finger harder, the nine presets on
    the Preset parameter. Each bowl's modes are rebuilt on a worker thread when the split, loss or
    water change. Ten bowls take about 5 % of a core.
  - **WebAssembly:** 47 KB in `glass/wasm/`. The 24-test suite passes on it, and it plays what
    the JavaScript plays to float32 rounding, the stick–slip included (the same seeded friction
    noise).
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript.

### Gong Keyboard 0.4.0
- **Ported to C++** (`native/instruments/gongs`): the von Kármán shell model and its eigenmodes
  (Eigen), and the engine (the SAV integrator, projection, adaptive substeps, the passivity guard,
  the linear tail, the polyphase buses). `gong-modes.h` is generated from
  `gongs/data/gong-modes.js` (`tools/gongs-native-table.mjs`), and a test keeps it fresh.
  - **Plugins:** Gong Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 is the damper
    pedal, the mod wheel the strike point, the eight presets on the Preset parameter. The coupling
    tables are built on a worker thread when Dome rise, Coupling terms or Rim change; a note waits
    for its tables. Ten gongs take about 17 % of a core, 37 % when all ten crash.
  - **WebAssembly:** 304 KB in `gongs/wasm/`. The test suite passes on it. Wherever the plate
    doesn't crash it plays what the JavaScript plays to within 5 × 10⁻⁸ of the peak; hard strikes
    are chaotic (the JavaScript drifts as far from itself when the velocity changes by 10⁻¹²), so
    those reference scripts are compared within that spread.
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript.

### Forte 0.14.0
- **Plugins' parameters read back as written:** a value already on its step stays as it is
  (`native/core/src/params.cpp`; the vibraphone's disc size of 0.7, step 0.01, read back as
  0.7000000000000001 and failed clap-validator's state reproducibility).
- **`tools/render-reference.mjs`**: an instrument's `reference` tolerance may be a function of
  the script (`toleranceFor`), for instruments that are chaotic in some scripts only (the gongs).
- **Tools** that write the C++ copies of generated data: `tools/vibraphone-bars.mjs --native`,
  `tools/carillon-native-table.mjs`, `tools/gongs-native-table.mjs`.
- **`plugin.ready`** for the vibraphone, carillon, glass armonica and gongs, so the front page's
  Plugins section lists them. The template's generated files and WebAssembly carry Forte 0.14.0.

## 2026-10-17 — the Windows plugin download, flattened

### Forte 0.13.1
- **`Forte-plugins-windows.zip` holds just the instrument's plugins**, like the other two: the
  `native` workflow's packaging now finds the bundles wherever the build put them. Visual
  Studio nests them (`CLAP/Release/`, `VST3/`, `Standalone-…/Release/`), so the first release
  (`plugins-v0.13.0`) had those folders in its Windows zip, with the template's plugins inside.

## 2026-10-17 — plugin downloads

### Forte 0.13.0
- **Plugins on the front page** (step 5 of docs/PLUGINS.md): a Plugins section, under the
  instruments whatever the tab (and at `#plugins`, from a button at the top and a *Plugin*
  link on each ported instrument's card), names the instruments that have plugins and links
  the macOS, Windows and Linux downloads of the latest GitHub Release, with how to install
  them (`native/INSTALL.md`, which also gives the `xattr` command the unnotarised Mac builds
  need).
- **`release-plugins` workflow**, started by hand from GitHub's Actions tab on main: it takes
  the archives that the `native` run of main's latest commit built and validated, and
  publishes them as a release tagged `plugins-v<Forte version>`, with notes from
  `tools/plugin-release.mjs` (the instruments and their versions, then the install steps) and
  their SHA-256 sums.
- **The `native` workflow packages each system's plugins** as `Forte-plugins-macos.zip`,
  `Forte-plugins-windows.zip` and `Forte-plugins-linux.tar.gz` (without the template, with
  `INSTALL.md`), kept 30 days as `release-<preset>` artifacts. Unlike the plain artifacts they
  keep the executable bits and the Mac bundles' ad-hoc signatures.
- **`plugin.ready`** in `shared/registry.js` marks an instrument whose port is built as plugins;
  `test/site-tests.mjs` checks it against `native/instruments/` and checks that the archive
  names agree across CI, the release and the page.

## 2026-10-17 — the Bubble Organ in C++, as plugins and on its page

### Bubble Organ 0.3.0
- **Ported to C++** (`native/instruments/bubbles`, step 3 of docs/PLUGINS.md): the model (heat
  flow, losses, the surface's image, rise and glide) and the engine (nozzles, seeded brooks, the
  bubble pool), operation for operation.
  - **Plugins:** Bubble Organ as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel raises the rate, aftertouch releases more bubbles, the gas and the liquid are
    dropdowns, and the twelve presets are on the Preset parameter. Ten keys at 40 bubbles/s take
    about 5 % of a core.
  - **WebAssembly:** 51 KB, committed in `bubbles/wasm/`. The test suite passes on it
    (`FORTE_ENGINE=wasm`), and it plays what the JavaScript plays to within 10⁻¹⁰: the same
    seeded random numbers, so the same brooks.
  - **The page runs it**: its worklet plays the WebAssembly engine and its views call the
    WebAssembly model, both falling back to the JavaScript (`?engine=js` forces it). The tank
    and the latest bubble's waveform look the same with either (the tank now compares a
    bubble's depth with the knob's to a tolerance, since the WebAssembly's messages are float32).

### Forte 0.12.0
- **`shared/wasm.js`**: an instrument's `messages(m, engine)` may gather several of its C++
  engine's messages into one for its page (returning null until it has one).
- **`native/web/engine-api.cpp`**: `forte_engine(handle)`, so an instrument's own exports can
  reach its engine (the bubble organ's test hooks). The template's WebAssembly is rebuilt.
- **Plugins' parameter text reads back as it was written** (clap-validator's round trip failed
  on the bubble organ's rate: "10.0 /s" just below 10 read back as 10, "10 /s"):
  `tools/gen-native-params.mjs` finds where each text format ends by bisection, to the last
  double, rather than halfway between samples; `parseValue` first looks for the segment that
  writes the text exactly (suffix, decimals, a "+"), then for one whose edge it rounds to, then
  reads typed text as before. A new native test checks the round trip on either side of every
  boundary of every instrument's parameters.
- The native tests build `<slug>-tests.cpp` for each ported instrument; native/README says how
  to build where gitlab.com can't be reached.

## 2026-10-16 — the template in C++, as plugins and on its page

### Forte 0.11.0
- **The template is the first instrument with a native port** (step 3 of docs/PLUGINS.md): its
  model and engine in C++ (`native/instruments/template`), with tables generated from its
  descriptor and a reference rendered from its JavaScript.
  - **Plugins:** Template Bars as CLAP, VST3, AU v2 and a standalone app, built and validated in
    CI on macOS, Windows and Linux (the smoke-test plugin is retired). 10 voices take under
    1 % of a core at 48 kHz.
  - **WebAssembly:** 32 KB, committed in `docs/template/wasm/`. Its test suite passes on it
    (`FORTE_ENGINE=wasm`), and it plays what the JavaScript plays to float32 rounding.
  - **The page runs it**: its worklet plays the WebAssembly engine and its views call the
    WebAssembly model, both falling back to the JavaScript if they cannot load
    (`?engine=js` in the address forces the JavaScript). The CPU pill's tooltip says which.
- **`shared/wasm.js`**: an instrument's WebAssembly loaded in a page, an AudioWorklet or Node, as
  a class with the engine contract. `shared/worklet.js` runs it when a page sends one, and the
  shell sends it when the descriptor names one (`wasm`).
- **`tools/new-instrument.mjs` starts the native port too**: the C++ engine and model, the
  generated tables and reference, a VST3 class id and an AU code. docs/INSTRUMENT_GUIDE.md has a
  new section, "The native port".

## 2026-10-16 — the shared native core

### Forte 0.10.0
- **`native/core`: what the engines share, in C++** (step 2 of docs/PLUGINS.md), checked against
  the JavaScript it ports (`tools/gen-native-vectors.mjs` writes what the JavaScript computes;
  the native tests compare, natively and as WebAssembly):
  - `shared/dsp.js` operation for operation; `shared/impulses.js` from the same seeded random
    sequence, bit for bit; `shared/linalg.js` on Eigen; `shared/guard.js`.
  - The output chain of `shared/chain.js` (tone, soundboard or body, room, volume and trim)
    and a limiter with Web Audio's compressor curve and makeup gain. The convolutions have no
    latency and spread their work: about 3 % of a core for the room at 48 kHz.
  - Real-time plumbing: a lock-free queue for what an engine posts, flush-to-zero, and
    per-key data (a page's `noteData`) built on a worker thread and handed to the audio thread
    without locks, freed when no voice holds it.
- **The plugins play through the output chain**, take MIDI controllers mapped to parameters
  (the piano's soft pedal), and are tested as a host drives them: 44.1 to 192 kHz, blocks of
  1 to 4096 samples (the same sound), notes and the pedal, presets, the mod wheel, state.

## 2026-10-16 — instruments without their pages

### Forte 0.9.0
- **Every instrument has a headless descriptor** (step 1 of docs/PLUGINS.md):
  `<slug>/src/<slug>-instrument.js` holds its parameters and presets, keys, pedal, mod
  wheel and other controllers, MIDI velocity curve, engine, `engineParams`, `noteData` and
  output chain. Pages spread it into the shell; Node plays any instrument from it
  (`tools/headless.mjs`). The sound is unchanged: every demo renders byte for byte as before,
  and every instrument measures as loud as before.
- **One engine contract and one worklet for all.** The five older pages' engines (Ribbon
  Piano, Tonewheel Organ, Tine Piano, Huygens and Black-Hole Keyboards) now have the shared
  methods and run in `shared/worklet.js`; their own worklets are gone. Engines may add
  `stats()` to the CPU pill's message.
- **`shared/chain.js`**: the output chain after the engine (tone, body or soundboard, room,
  volume × trim, limiter), built from the descriptor's `chain`. The shell and the older pages
  use it, and `tools/loudness.mjs` measures every instrument through it.
- **Tools for the native ports:**
  - `tools/gen-native-params.mjs` writes an instrument's C++ parameter and preset tables from
    its descriptor. The JavaScript `fmt` of each parameter is turned into piecewise text
    formats that match the page's text over 95–100 % of nearly every parameter's travel (10
    of 440 fall back to a plain number); `native/core` formats them exactly as JavaScript does.
  - `tools/render-reference.mjs` plays fixed scripts (notes, velocities, chords, the pedal,
    the mod wheel, aftertouch, bend, each preset) and summarises them for a port to match.
  - `tools/engine.mjs`: the test suites get their engine through `loadEngine`, so
    `FORTE_ENGINE=wasm` will run them on an instrument's WebAssembly build.
  - `test/native-tests.mjs` checks every descriptor converts and the generated files are
    fresh; `test/site-tests.mjs` checks every instrument has a descriptor its page uses.

### Ribbon Piano 0.3.3
- A descriptor, `piano/src/piano-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared engine contract and runs in `shared/worklet.js`, and the page
  builds its output chain (soundboard, room, limiter) with `shared/chain.js`. The descriptor
  has the MIDI velocity curve and the soft pedal (CC67). A key still ringing and struck again
  after a change that leaves the strings alone (a preset that changes only the mix, say) is
  struck again rather than doubled.

### Harpsichord 0.2.1
- A descriptor, `harpsichord/src/harpsichord-instrument.js`, holds everything but the page
  (step 1 of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every
  demo renders byte for byte as before.

### Pipe Organ 0.2.1
- A descriptor, `pipes/src/pipes-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Free-Reed Organ 0.2.1
- A descriptor, `harmonium/src/harmonium-instrument.js`, holds everything but the page (step 1
  of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.

### Vibraphone 0.2.2
- A descriptor, `vibraphone/src/vibraphone-instrument.js`, holds everything but the page (step
  1 of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.

### Carillon 0.1.1
- A descriptor, `carillon/src/carillon-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Electric Grand 0.3.1
- A descriptor, `grand/src/grand-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Tonewheel Organ 0.4.3
- A descriptor, `organ/src/organ-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared contract (`noteOn`, `noteOff`, `allNotesOff`) and runs in
  `shared/worklet.js`; it builds its tonewheel generator itself when the tuning, mains,
  harmonics, crosstalk or leakage change, rather than being sent one. The page builds its
  output chain with `shared/chain.js`. Choosing a preset no longer redraws the key contacts'
  random bounce.

### Tine Piano 0.3.3
- A descriptor, `tines/src/tines-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared contract and runs in `shared/worklet.js`; the page builds its
  output chain with `shared/chain.js`. The descriptor has the MIDI velocity curve. A key still
  ringing and struck again after a preset that leaves the tines alone is struck again rather
  than doubled.

### Reed Piano 0.3.1
- A descriptor, `reeds/src/reeds-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- Each reed's model is computed at the engine's own rate (it was fixed at 48 kHz; the same at
  every rate above 10 kHz). A key still ringing and struck again after a preset that leaves
  solder, strike and hardness alone is struck again rather than faded out and restarted.

### Tangent Clavier 0.3.1
- A descriptor, `clavier/src/clavier-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Sticky-Pad Piano 0.3.1
- A descriptor, `pianet/src/pianet-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Viola Organista 0.3.1
- A descriptor, `bowed/src/bowed-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Glass Armonica 0.3.2
- A descriptor, `glass/src/glass-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Pyrophone 0.3.2
- A descriptor, `pyrophone/src/pyrophone-instrument.js`, holds everything but the page (step 1
  of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.

### Singing Arc 0.1.1
- A descriptor, `arc/src/arc-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- Fixed: opening the page in talk mode, or moving the current, gap, τ or re-strike there (the
  mod wheel moves the current), cut the capacitor bank with the talk circuit, and switching
  back to the arcs kept it: C4 played at 83 Hz. The bank is now always cut for the arcs.

### Huygens Keyboard 0.3.3
- A descriptor, `huygens/src/huygens-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared contract and runs in `shared/worklet.js` (retuning arrives as a
  message); the page builds its output chain (tone, body, room) with `shared/chain.js`.

### Gong Keyboard 0.3.1
- A descriptor, `gongs/src/gongs-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The plate's coupling tables are part of the descriptor's engine parameters; the page still
  sends them only when they change.

### Black-Hole Keyboard 0.3.3
- A descriptor, `blackhole/src/blackhole-instrument.js`, holds everything but the page (step 1
  of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.
- The engine is on the shared contract and runs in `shared/worklet.js`; the QNM table loads
  through the descriptor. The page builds its output chain with `shared/chain.js`; the
  descriptor has the MIDI velocity curve.

### Quantum Keyboard 0.3.1
- A descriptor, `quantum/src/quantum-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Bubble Organ 0.2.1
- A descriptor, `bubbles/src/bubbles-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Spring Keyboard 0.1.1
- A descriptor, `springs/src/springs-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Star Keyboard 0.1.1
- A descriptor, `stars/src/stars-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Wind Harp 0.1.2
- A descriptor, `windharp/src/windharp-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

## 2026-10-16 — the native setup

### Forte 0.8.0
- **`native/`: the instruments' physics will be C++, built as plugins and as WebAssembly**
  (docs/PLUGINS.md, step 0). There is no instrument in it yet: this sets up the build, the
  shared plugin and CI.
  - One CLAP plugin serves every instrument (`native/plugin`). clap-wrapper makes its VST3, AU v2
    and standalone app, on macOS, Windows and Linux. It takes notes and MIDI as the pages do
    (velocity, the pedal or Hold, the mod wheel, aftertouch, pitch bend), has the instrument's
    parameters and a Preset parameter for its presets, saves its state, and has no latency.
  - The plan's framework, iPlug2, has no Linux support; the CLAP SDK with clap-wrapper (MIT)
    replaces it, with the same formats.
  - Every dependency is pinned to a commit, Emscripten to a version (6.0.10).
  - A new workflow, `native`, builds the plugins on all three platforms, runs the unit tests,
    clap-validator, Steinberg's VST3 validator and `auval -strict`, and keeps the plugins for
    14 days. Until the template is ported, a CI-only smoke-test plugin goes through it.
- **Plugin identities.** Each instrument has a four-character Audio Unit code in the registry
  (`plugin.code`), and a VST3 class id in `native/ids.json`; `test/site-tests.mjs` checks both
  are unique. Neither may ever change.

## 2026-10-16 — controls you can read, and room on a sideways phone

### Forte 0.7.3
- **The controls above the keys say what they are.** The value took the
  line first, so most labels were cut to a few letters ("As…", "Clap…",
  "Dome ri…"): 44 of 161 on a desktop, 66 at 900 px, 70 on an iPad. Now
  the label comes first, without its explanation ("Dome rise (curvature)"
  shows as "Dome rise"; the whole name stays in the tooltip, the ⓘ and the
  control's accessible name). The value shows beside it when both fit,
  and always while the control moves (a drag, the arrows, the mod wheel, a
  preset) and for a moment after. The tooltip has both. Cut labels: 3 on
  a desktop, 4 at 900 px, 6 on an iPad, 2 on an upright phone (18 on a
  sideways one, whose tiles are narrower).
- **A sideways phone has room for the views.** The controls, the keyboard
  bar and the keys took 261 of 340 px, leaving the views a 24 px sliver,
  and on 11 pages not one control was wholly in sight. Now the controls
  share a row with the keyboard bar (whose overview shrinks to a
  thumbnail), show one row of whole tiles and scroll a row at a time, and
  the keys take at most 36 % of the height: 207 px, and the views get
  three times the room. On phones a scroll of the controls comes to rest
  on whole tiles.
- **A second finger works the controls.** While one finger held a key, a
  tap with another on a stop, Latch, ◀ ▶, − + or a tab did nothing (the
  browser sees a two-finger gesture and sends no click). Now it clicks.
- **Aftertouch by touch.** Leaning (sliding a held finger along the key)
  counted only toward you, so a loud strike near the front edge had
  nowhere to go, and on a black key the lean slid onto the next note as a
  glissando. Now a lean either way counts, a third of the key's length
  for full pressure, past a few pixels of wobble; it stays on its key, and
  only a slide across the keys is a glissando. The nine instruments with
  aftertouch say so under *Touch* in How it works.
- **No velocity slider on touch screens.** "Velocity (computer keys)" took
  the first place above the keys on 12 pages, and a touch sets velocity by
  where it strikes. It is left out on touch screens (↑ ↓ still set it).
- **Bigger keyboard-bar buttons on touch screens** (44 px: the pedal,
  Latch, ◀ ▶, − +), and the Tangent Clavier's pickup selector fits its
  tile on a phone.

### Forte 0.7.2
- **MIDI stays on from page to page.** Each instrument is its own page, so
  moving to another one meant clicking Enable MIDI again, and a keyboard
  played on the new page made no sound until then. Now, once MIDI has been
  turned on, every page turns it on by itself while the browser still
  grants it (`shared/midi.js`). Until it has been, no page asks.
- **No stuck notes from MIDI.** Each device's notes are tracked per
  channel. A note struck again before its note-off lets the old one go
  first, so one note-off always silences it (two note-ons and one note-off
  used to leave it sounding for good). A note-off for a note that isn't
  down on that channel is dropped, so two channels holding one key keep it
  sounding until both let go. A keyboard unplugged mid-phrase lets go of
  its notes and of its sustain pedal instead of leaving them on.
- **Panic lets go of the pedal and Latch too.** It silenced the notes but
  left sustain (or Latch) on, so the next notes rang on. The on-screen
  pedal and Latch now follow Space, a MIDI pedal and Panic, and Latch goes
  off whenever sustain does.
- **A mod wheel at rest leaves the instrument at its default.** The wheel
  rests at 0, which now gives the parameter's default exactly (not a value
  rounded to its step), with the maximum fully up.
- **The octave never moves a whole row of computer keys off the
  instrument.** `←` went one octave further than any key could sound,
  leaving the bottom row dead.

### Ribbon Piano 0.3.2
- MIDI through `shared/midi.js`: on again on the next page, notes tracked
  per channel and device. Panic lets go of the pedal.

### Tine Piano 0.3.2
- MIDI through `shared/midi.js`. Panic lets go of the pedal. `←` stops
  before the bottom row of computer keys falls off the instrument.

### Tonewheel Organ 0.4.2
- MIDI through `shared/midi.js`. `←` stops before the bottom row of
  computer keys falls below the manual. It used to fold up an octave there,
  so both rows played the same notes.

### Huygens Keyboard 0.3.2
- MIDI through `shared/midi.js`. Panic lets go of Hold. `←` stops before
  the bottom row of computer keys falls off the instrument.
- **The mod wheel at rest gives the default coupling (0.055).** It gave 0,
  so a nudge of the wheel and back turned the coupling off and the clocks
  stopped locking.

### Black-Hole Keyboard 0.3.2
- MIDI through `shared/midi.js`. `←` stops before the bottom row of
  computer keys falls off the instrument.
- **The mod wheel at rest gives the default spin (a = 0.69).** It gave
  a = 0, a non-spinning hole.

### Vibraphone 0.2.1
- **`Z` plays C4.** The bars start at F3, and the keys started at C3, so
  `Z` to `E` (five keys of the bottom row) made no sound.

## 2026-10-16 — keys for the keyboard, and hold to sound

### Forte 0.7.1
- **Keyboard-only players can set stops and switches.** Space was always
  the pedal, so a stop, view toggle or checkbox reached with Tab could not
  be ticked. Now a control reached with Tab keeps the keys it uses: Space
  ticks a checkbox or presses a button, and the arrows move a slider or step
  a list (`shared/focus.js`). It keeps the focus after a change, so the next
  Space or arrow works it again.
- **A control touched with the mouse or a finger hands the keys back.**
  After dragging a slider, the arrows moved that slider instead of the
  octave and velocity. After the presets menu was opened and dismissed, the
  next ↓ silently picked "Default settings" and threw away every change.
  Now the arrows go to the instrument, and Space stays the pedal.
- **`holdHint`** (shell config): for an instrument that speaks only while
  a key is held, a toast says so the first time a key is let go too soon.
  On a phone or tablet, which hide the hints behind ⌨, nothing said so before.

### Ribbon Piano 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Tine Piano 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Huygens Keyboard 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Black-Hole Keyboard 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Tonewheel Organ 0.4.1
- The same key rules. A drawbar or the swell pedal dragged with the mouse
  no longer takes the arrows; reached with Tab, it still moves with them.

### Glass Armonica 0.3.1
- A first very short press shows a hint: hold the key. A tap is 25–45 dB
  quieter than a held note, because the finger takes about half a second
  to set the glass singing.

### Wind Harp 0.1.1
- A first very short press shows a hint: hold the key. The wind takes up
  to a second, in the bass, to set a string singing, so a tap is close to
  silent.

### Pyrophone 0.3.1
- A first very short press shows a hint: hold the key. The flame takes a
  moment to set the tube singing; a tap on the lowest keys is about 20 dB
  quieter than a held note.

## 2026-10-15 — a compact page: controls, views and keys

### Forte 0.7.0
- **Controls and views apart.** The middle of every page is pictures only;
  every control sits at the edges. The main views (the ones Perform shows)
  are large, side by side or stacked; the others are tabs underneath, in
  a panel that folds away. Right above the keys are the controls you play
  with: the performance controls and any control surface a page marks
  `data-control` (the organ's drawbars and switches, which were a view),
  then **More controls**, which opens the rest (a column on wide screens,
  a panel over the views on narrow ones). A handle on the footer's edge
  folds the controls away.
- **The keys fill the width** at the key size you pick (− +), as in
  GarageBand: an octave or so on a phone, most of the range on a laptop.
  ◀ ▶ move an octave, and an overview of the whole range, with the keys on
  screen framed and the keys you hold lit, drags anywhere. This replaces
  the octave count and the separate key height. The keyboard's tools fit
  one row on a phone.
- **Fewer, merged buttons.** The instrument's name is now the menu of
  every instrument, with Forte's home page first (it was three things:
  the Forte link, Instruments ▾ and the title). Reset is "Default
  settings" in the presets menu. The Controls button became More
  controls, above the keys, and Views ▾ became the tabs. The footer's
  hints for the computer keyboard and MIDI, with their readouts, wait
  behind ⌨. The phone header is two rows.
- **Explanations behind ⓘ.** A view's caption opens from an ⓘ in its
  title; a parameter's hint in the Controls panel slides open from an ⓘ
  by its name.
- **More direct controls.** Above the keys, a dropdown with a few short
  choices is a row of buttons, one tap each (the harpsichord's manual,
  the vibraphone's motor, the bubble organ's gas, the clavier's pickups).
- Site test: a control surface is never marked as a Perform view. The
  guide and the README describe the new layout.

### Tonewheel Organ 0.4.0
- The console (drawbars, swell, percussion, vibrato and chorus, Leslie,
  generator motor) is a control surface above the keys, as on the real
  instrument, rather than a view. The tone generator and the Leslie are
  the main views; the output spectrum and "what a key really plays" are
  tabs.

## 2026-10-15 — views on tablets

### Forte 0.6.1
- Views no longer spill out of their cards on tablets and in narrow
  windows. Between 601 and 1050 px wide the views stack in one column
  inside a screen-high, scrolling panel, but the rows kept their
  wide-screen sizing and were squeezed to fit the screen: every page's
  230 px canvases overlapped the cards below them, at 900 px, at
  1024 × 768 and on an iPad in portrait. There, each row is now as tall as
  its content and the column scrolls.
- On every screen, a row of views directly in `#views` is never squeezed
  below its own content; its canvases still flex. This shows the
  Tonewheel Organ's whole console (the drawbars' footages, the swell and
  the vibrato and Leslie switches) and the Glass Armonica's mode table at
  1440 × 900, where they were cut off; their views now scroll a little.
- Phones and Perform are unchanged.

## 2026-10-15 — singing arc

### Singing Arc 0.1.0
- New instrument: William Duddell's singing arc (1900), C3–C6, played as he
  played it. Each key switches a capacitor across a fixed coil (20 mH) in
  parallel with a carbon arc that burns on 220 V DC through a rheostat and a
  0.5 H choke. Velocity does nothing: a key only closes a contact.
- **The arc:** Ayrton's falling characteristic for solid carbons,
  V = a + b·l + (c + d·l)/I (38.88 V, 2.074 V/mm, 11.66 W, 10.54 W/mm), is
  the static limit of a Mayr-type column whose heat loss is chosen to
  reproduce it, with a thermal time constant τ (5–300 µs, default 26 µs).
  Its small-signal impedance, derived analytically and checked against a
  numerical linearisation, has three regimes. It is negative at low
  frequency (−B/I², −4.8 Ω at 3 A), and inductive (0.40 mH: the hysteresis
  loop, and the note's flattening). It turns positive above
  ωτ = 2w√(K/R₀ − 1) (4.8 kHz): the arc's ceiling.
- **Linear analysis:** the whole circuit's quartic (musical mode, column,
  choke) gives each note's growth rate (110 /s at the defaults) and starting
  frequency (1.0–2.0 % below Kelvin's formula). The engine matches both
  within 0.11 % and 0.07 ¢, and matches the thresholds in coil resistance
  and in τ.
- **Large signal:** Ayrton's hyperbola alone is subcritical and puts the arc
  out. The white-hot carbons give the column a floor, set by a re-strike
  voltage (1.1–2.5 × the burning voltage), which holds the oscillation in
  the first kind. A high re-strike voltage gives the second kind, where the
  arc goes out and re-strikes every cycle. The arc is bistable between the
  threshold current (12 A) and the fold (about 17 A).
- **The keyboard:** each key's capacitor is cut so that its steady note is in
  tune (worst 0.08 ¢), by integrating the circuit to its cycle. A preset cuts
  them by Kelvin's formula instead: 1–5.7 % flat.
  - One arc: held keys put their capacitors in parallel and the pitch drops.
  - Several arcs: 2–6 lamps, a key each; a note can be stolen only after
    40 ms, and it fades first.
  - Contacts close in 0.5 ms. They open with a spark that fades the note in
    about 10 ms and goes out at a current zero.
- **Hiss** above a hissing current that grows with the gap (7 A at 3 mm),
  as conductance noise.
- **The sound:** the column is its own loudspeaker, radiating the
  thermophone's pressure (γ − 1)/(4π c² r)·dP/dt at a listening distance.
- **Simon's talking arc:** a synthesised singer at a microphone (a Rosenberg
  pulse, Peterson & Barney's formants), coupled into the arc through a
  transformer.
- Implicit integration (trapezoidal circuit, θ-method column, Newton) at 4×
  the sample rate: six singing arcs take about 19 % of one core.
- Views: the V–I plane with the operating point's loop drawn live, the arc's
  glow strobed into slow motion, Duddell's circuit, and a spectrum. Eight
  demos and 30 tests.

## 2026-10-15 — wind harp

### Wind Harp 0.1.0
- New instrument: the Aeolian harp made playable, G3–C7. Every key is a
  nylon string behind a shutter; pressing the key slides the shutter open
  (velocity sets how fast, 300 ms to 10 ms) and the wind sets it singing.
- **The wake:** van der Pol wake oscillators at stations along each string
  (Facchinetti, de Langre & Biolley 2004), driven by the string's local
  acceleration and loading it with their lift, with the published ε = 0.3,
  A = 12, C_L0 = 0.3 and γ = 0.8; shedding at St(Re)·U/D from Williamson &
  Brown's two-term fit, none below Re = 47 (a Landau-like onset), and Ω set
  so that a fixed cylinder's wake sheds exactly at f_s (κ = 0.99442).
- **The strings:** stiff, in modal form, one wake station per mode (8–16),
  cut so that at the reference wind of 4 m/s each sheds at its key's note
  and locks onto its 3rd harmonic (the sounding harmonic n₀ is a knob, 2–6):
  diameters 0.29–4.9 mm, lengths 30–100 cm, tensions 14–360 N, Re 77–1300.
  The treble keys have courses in unison, as fine top strings often are:
  one string to a key to B4, two from C5 to C7 (67 strings), tuned 1.2 ¢
  apart with gauges 0.5 % apart (seeded), each locking on its own, so a
  course shimmers. Every key sounds its note within 0.5 ¢.
- **The linear analysis:** de Langre's coupled-mode flutter gives each
  harmonic's lock-in band, |δ − 1| < √(AM) (about ±2.2 % in wind), and its
  growth rate; a harmonic balance of the distributed wake gives the locked
  swing and how far the lock holds beyond the band (the hysteresis). The
  engine matches both: growth within 2 % with the wake's own growth turned
  down, lock-in where the bands begin and end, the hysteresis folds within
  2 %, the locked swing within 1.5 %.
- **Wind:** a slider (and the mod wheel and aftertouch) from 1 to 8 m/s
  hops every sounding string up or down its own harmonic series; seeded
  gusts with a von Kármán-like spectrum make strings flicker between
  harmonics; the string's Q and a metal winding set the mass–damping, and
  with it the swing (which follows m*ζ alone) and the band (∝ 1/√m*).
- **Kircher's harp:** every string tuned to one note, only the gauge
  differing, so each key sounds the harmonic of the unison its gauge locks
  onto, and the wind makes chords of harmonics.
- **The sound:** the bridge force through a tapered, mass-like top with
  five broad box resonances and a first-order shelf for the top's radiation
  efficiency (rising 6 dB an octave from 500 Hz to 4 kHz), heard by two
  microphones, plus the wake's lift radiated as a dipole (the aeolian tone,
  34–42 dB under a locked key). With the courses and the tapered top this
  voices the compass evenly: a forte note peaks at 0.14–0.35 on every key.
- Low strings step at a half or a quarter of the sample rate (ωh ≤ 0.4),
  their force interpolated back: ten keys across the compass take about
  20 % of one core.
- Views: a lock-in map (the Strouhal frequency against the wind across the
  string's harmonics, with the linear bands, the hysteresis and the wind
  now), the string and its vortex street in slow motion, a spectrogram, and
  the last key's string. Six demos.
- Performance controls: wind speed, gustiness, velocity (shutter speed),
  room and volume. Perform shows the lock-in map and the vortex street.

## 2026-10-15 — star keyboard

### Star Keyboard 0.1.0
- New instrument: every key a star, C2–C7, sped up a fixed K = 510,800 times
  (μHz to Hz), chosen so that the Sun itself sounds on G6.
- **The keyboard is an evolutionary track** (0.9–1.8 M☉, 1 M☉ by default):
  dwarfs on the top keys, subgiants in the middle, red giants below (ν_max
  4123 μHz on C7 to 130 μHz on C2 at 1 M☉). The zero-age main sequence from
  Tout et al. (1996), a main sequence through the Sun, subgiants, and the
  red-giant branch on the Hayashi line; above the track's own start the path
  continues down the zero-age main sequence.
- **The modes:** Δν ∝ √(mean density) and ν_max ∝ g/√T_eff with Huber et
  al.'s solar values (135.1 and 3090 μHz); the asymptotic relation to second
  order with small separations and a curvature, under a Gaussian envelope of
  width 0.66 ν_max^0.88; visibilities 1 : 1.5 : 0.6 : 0.05 for l = 0–3;
  linewidths a power law in T_eff over a floor (1 μHz for the Sun, 0.13 μHz
  for red giants). Up to 340 m components per star.
- **Mixed modes** in subgiants and red giants from tan θ_p = q tan θ_g, every
  root found by bisection; each mode's core inertia ζ sets its period
  spacing, its share of the p mode's power (1 − ζ) and its linewidth.
- **Rotation** splits every multiplet by m(Ω/2π)(1 − C_nl), mixed modes by
  their core and envelope rates weighted by ζ; **inclination** shares each
  multiplet's power among its m components as E_lm(i) (Gizon & Solanki 2003).
- **The sound:** every mode an exact two-pole oscillator pushed once a block
  by Gaussian random forces while the key is down (convective driving), so
  each line is a Lorentzian of its own width with a set mean power; key-up
  stops the driving and every mode rings down at its linewidth; the pedal
  keeps the convection on; a flare at a random point on the star kicks every
  mode at key-down, coherently across orders, so its wave packet echoes
  every 1/Δν.
- **Tuning:** each key's star is the one on the track whose heard pitch, the
  power-weighted mean log frequency of its modes, lands on the note (within
  0.02 ¢ on every key; ν_max then sits 10–24 ¢ above it).
- **δ Scuti stars** as a second family: three radial modes at P₁/P₀ = 0.773
  and P₂/P₁ = 0.802 and a few nonradial ones, each growing by the Landau
  equation dA/dt = (γ − βA²)A to a steady amplitude, with compressed growth
  times.
- Views: the échelle diagram and the power spectrum of the focus star, its
  modes sized by their power now; the star, showing one mode's pattern
  turning at the set inclination; and a Hertzsprung–Russell diagram with
  the star on every key. Seven demos.
- Performance controls: rotation, inclination, convective driving, flare
  kick, room and volume. Perform shows the échelle diagram and the star.
  The mod wheel spins the stars up; aftertouch drives them harder.

## 2026-10-14 — spring keyboard

### Spring Keyboard 0.1.0
- New instrument: a keyboard of struck steel springs, C2–C6, each a helical
  spring with a magnetic bead at each end, as in a spring-reverb tank. A
  mallet taps one bead; the other bead is the pickup.
- **The waves:** Wittrick's helical rod (bending, twist, stretch and shear,
  with shear and rotary inertia) solved for every wavenumber as a 6 × 6
  symmetric eigenproblem, with exact group velocities. Checked against
  Hoppe's and Michell's ring modes, rigid-body motion and the slinky line
  (the open-coiled spring's compliance, both low-frequency speeds within
  10⁻⁵); the reduced thin-spring model agrees at small helix angle (low
  branch within 0.02 %, F_C within 0.3 %).
- **F_C and T_D:** the transition frequency where the slow branch ends
  (0.4 % above Parker & Bilbao's formula in the reduced model) and the echo time
  T_D = 2L/c₀; below F_C every echo is a rising chirp, above it a falling
  one, as the spring-reverb measurements describe.
- **Tuning:** every key is the C4 spring (5.4 mm coil, 0.45 mm wire, 3°,
  23.6 turns) scaled to its note, its lowest mode first put on the note,
  then the whole spring rescaled until a virtual-pitch estimate of what is
  heard (subharmonic summation, Hermes 1988, on the first 0.4 s after an mf
  strike) lands on it. That corrects a drift of −21 ¢ (C2) to −9 ¢ (C6): the
  lowest mode now sits 21 ¢ to 5 ¢ sharp. It is recomputed whenever the
  knobs that shape the sound change. F_C ≈ 16 f₀: 1.07 kHz on C2 to
  17.0 kHz on C6.
- **Sound:** modes at k = nπ/L on both acoustic sheets (101–243 per spring
  below 18 kHz), each weighted by how much it turns (or slides) the beads
  at both ends; damping from the mounts (a loss per reflection, so the band
  below F_C rings longest), the steel's loss factor, an oil bath, a hand on
  the coils (mod wheel) and a felt damper that falls on key-up (sustain
  holds it off; release velocity sets how fast).
- **Playable:** one to three springs a key cut a little apart, centred on
  the note (their echoes blur), coil radius, wire diameter and helix angle (F_C moves; the
  turning and stretching waves mix), beads driven in rotation or along the
  axis, bead inertia, mallet contact time, and a Slinky family whose F_C is
  below hearing, so every echo is a falling whistle.
- The page solves each key's springs and sends them with the note, so the
  audio thread never solves an eigenproblem.
- Views: the echoes of the last strike (a short-window spectrogram from the
  engine, with the model's arrival times), the dispersion and the round
  trip's group delay with T_D and F_C, the struck spring slowed down, and a
  live spectrogram. Seven demos.
- Performance controls: springs per key, mount loss, hand, mallet, room
  and volume. Perform shows the echoes and the spectrogram.

## 2026-10-14 — carillon

### Carillon 0.1.0
- New instrument, after the Low Countries carillon (Hemony): 49 bronze
  bells, C3–C7 at sounding pitch, each tuned by its nominal an octave
  above its key, in three registers with their own ribs, heavier towards
  the treble (wall thickness × 0.5, 0.72 and 1).
- **The bell:** axisymmetric solid finite elements (eight-node
  quadrilaterals on the rib's cross-section, one cos mθ / sin mθ family at a
  time, banded subspace iteration), checked against Hoppe's and Rayleigh's
  ring, Rayleigh's inextensional cylinder modes and the dense eigensolver,
  and converged under refinement. A thick ring shows how far thin-shell
  formulas go wrong.
- **The founder's tuning:** a Levenberg–Marquardt search moves each rib's
  thickness, radius and height at ten stations until hum, prime, tierce,
  quint and nominal sit at 0.5 : 1 : 1.2 : 1.5 : 2 (minor-third bells) or
  with the tierce at 1.25 (major-third bells, from a different starting rib,
  aiming more softly at the deciem, superquint and octave nominal too),
  moving the rib no further than it must.
  `tools/carillon-profile.mjs` writes the six ribs and their modes to
  `bell-table.js`.
- **Sound:** every mode below 8–12 × the prime as an exact two-pole
  recursion, a doublet for each m ≥ 1; damping from bronze's loss and
  multipole radiation (the hum rings longest); a radiation-weighted sum at
  the listener, with spreading and ISO 9613-1 air absorption over the
  distance from the tower.
- **Doublets:** an asymmetry ε cos 2mθ splits each pair by Δf/f = εκ/2
  (degenerate perturbation theory, κ from the FEM); the strike angle shares
  the strike between the pair as cos and sin mα, so bells warble unless
  struck on an axis.
- **The clapper:** Hertz contact solved implicitly every sample against
  every mode of the bell where it is; about 1 ms on C4; iron or a softer
  insert, its mass, the strike height and an even touch across the
  keyboard.
- **The strike note:** subharmonic summation finds it an octave below the
  nominal, live, on the partials as heard; given only the nominal,
  superquint and octave nominal it still finds it, where no partial lies.
  In the top bells it names the hum.
- **Historic bells:** untuned castings, each partial moved by the FEM's
  sensitivities to random wall errors, seeded per bell.
- Views: the bell's section and a partial's shape, from the side and from
  below, with its live level; the partial table; the strike note; the
  spectrum. Seven demos.
- Performance controls: bell profile, asymmetry, clapper face, strike
  angle, distance, room and volume. Perform shows the bell and its mode,
  and the spectrum.

## 2026-10-14 — front page by kind of instrument; Discover and Perform

### Forte 0.6.0
- **Front page:** choosing an instrument comes first. A short title with
  **About Forte** (a dialog with the introduction and the notes that were
  on the page), **Credits** and **GitHub**, then tabs for four kinds of
  instrument that stay at the top as the cards scroll: *Traditional*,
  *Electric*, *Experimental* (experiments from history) and *Phenomena*
  (instruments only physics can build), or *All*. Each tab has its own
  link (`#electric`). A whole card opens its instrument; the instruments
  in the workshop are listed by name under their kind.
- **Registry:** four sections (`traditional`, `electric`, `experimental`,
  `phenomena`) replace the two ("from history", "only physics can build"),
  with the ready instruments first in each. Every page's Instruments menu
  follows.
- **Performance controls:** each instrument's parameters marked
  `perform: true` sit in a strip above the keys, in both modes, so they
  never move; a checkbox there becomes a stop that lights up. In
  Discover, a control with a hint has an ⓘ button that opens the hint in
  a bubble above it (a tap, so it works on a tablet). The Controls panel
  keeps the rest.
- **Discover | Perform** on every instrument page. Discover is the page as
  it was. Perform shows only the one or two views each instrument marks
  `data-perform`, side by side (stacked on a tall screen) and filling it,
  with no text: no titles, readouts, captions, legends or tables, and no
  text drawn on their canvases (`fillText` is silenced there; a card with
  `data-keep-text` keeps its own). It hides How it works, starts with the
  Controls column closed, and offers **Full screen** for a projector. The
  mode is the same on every page; each page remembers its views and
  Controls in each mode.
- **Presets** and **Reset** move from the Controls panel to the header, so
  they are always in view.
- Header: once the audio is on, the CPU meter takes the place of "Start
  audio" (as it did on phones); the MIDI status shows once MIDI is asked
  for; the subtitle shows only on screens wider than 1700 px; the layout
  and audio buttons sit on the right on whichever row they land.
- The shell gives `perform: true` parameters `data-perform`; the template
  marks four, and two views. The guide and the README describe the modes.
- Site tests: four sections, ready instruments first; presets where the
  header can take them; the front page's tabs and About; 3–10 performance
  controls per instrument, volume among them; one or two views marked for
  Perform on every page.

### Ribbon Piano 0.3.0
- Performance controls: felt hardness, velocity, una corda, soundboard,
  room and volume.
- Perform shows the string in slow motion and its partials.

### Harpsichord 0.2.0
- Performance controls: the registration (manual, coupler, front and back
  8′, 4′, lute, buff), room and volume.
- Perform shows the pluck in slow motion and the comb and spectrum.

### Pipe Organ 0.2.0
- Performance controls: the stops (Principal 8′, Octave 4′, Gedackt 8′,
  Mixture III), tremulant, wind pressure, room and volume.
- Perform shows the jet in the mouth and the spectrum.

### Free-Reed Organ 0.2.0
- Performance controls: the stops (8′, musette, 16′, 4′, percussion),
  bellows pressure, expression stop, room and volume.
- Perform shows the reed in its slot and the flow loop.

### Vibraphone 0.2.0
- Performance controls: motor and shaft speed, mallet hardness, velocity,
  pedal lock, room and volume.
- Perform shows the bar and its modes, and the tube and disc.

### Electric Grand 0.3.0
- Performance controls: velocity, felt hardness, piezo ↔ microphone, the
  preamp's bass, middle and treble, room and volume.
- Perform shows the slow-motion hammer and string, and the spectrum.

### Tonewheel Organ 0.3.0
- Performance controls: tube drive, room and volume, under the console
  (drawbars, percussion, vibrato, Leslie and swell), which stays in view.
- Perform shows the console and the Leslie.

### Tine Piano 0.3.0
- Performance controls: velocity, the suitcase's vibrato depth and rate,
  amp drive, speaker top end, room and volume.
- Perform shows the tine in slow motion and the spectrum.

### Reed Piano 0.3.0
- Performance controls: velocity, preamp drive, tremolo depth and rate,
  output, room and volume.
- Perform shows the reed in slow motion and the spectrum.

### Tangent Clavier 0.3.0
- Performance controls: velocity, the pickup selector, the four tone tabs,
  the mute, room and volume.
- Perform shows the string in slow motion and the spectrum.

### Sticky-Pad Piano 0.3.0
- Performance controls: velocity, tone, amplifier and its drive, room and
  volume.
- Perform shows the pad and reed in slow motion, and the spectrum.

### Viola Organista 0.3.0
- Performance controls: wheel speed, bow position, key pressure and travel
  time, dampers lifted, room and volume.
- Perform shows the string on the wheel and its stick–slip velocity.

### Glass Armonica 0.3.0
- Performance controls: finger pressure, skin moisture, treadle speed,
  room and volume.
- Perform shows the bowl and the spectrum.

### Pyrophone 0.3.0
- Performance controls: flame power, velocity, key-up flame, flame
  turbulence, room and volume.
- Perform shows the tube and the phase portrait.

### Huygens Keyboard 0.3.0
- Performance controls: pulse coupling, tuning (and just tonic), key
  attack and release, tone, room and volume.
- Perform shows the lamp firings and the locking map.

### Gong Keyboard 0.3.0
- Performance controls: dome rise, mallet stiffness, strike point,
  velocity, hand damping, room and volume.
- Perform shows the gong and the spectrogram.

### Black-Hole Keyboard 0.3.0
- Performance controls: spin, mass ratio, inclination, the inspiral, tone,
  room and volume.
- Perform shows the black hole and its gravitational waves.

### Quantum Keyboard 0.3.0
- Performance controls: potential, tempo, revival time, dephasing,
  velocity, room and volume.
- Perform shows the quantum carpet and the wavepacket.

### Bubble Organ 0.2.0
- Performance controls: nozzle depth, gas, bubbles per second,
  irregularity, velocity, room and volume.
- Perform shows the tank and the latest bubble.

## 2026-10-14 — pipe organ

### Pipe Organ 0.1.0
- New instrument, after the Baroque pipe organ: one manual, C–f³ (54
  keys), with Principal 8′, Octave 4′, Gedackt 8′ (stopped) and a Mixture
  III of octaves and pure fifths that breaks back at each c. Six pipes a
  key on Töpfer's normal scale, each a tube in modal form (open 1 : 2 : 3,
  stopped 1 : 3 : 5) with Levine & Schwinger's open-end correction, a mouth
  correction from Rayleigh's conductivity of the mouth (1.58 D for a
  diapason mouth), and wall and radiation losses (Q₁ from 127 to 24).
- **The jet:** the jet-drive model of Verge et al. and Fabre & Hirschberg.
  The jet leaves the flue at √(2p/ρ), is bent by the flow through the
  mouth, carries the bend across the cut-up at 0.4 × its speed (through a
  low-pass), splits on the labium as a tanh, and drives the pipe with the
  rate of change of the flow it puts in, less the vortex shedding at the
  labium. A linear analysis gives every pipe's speaking window in
  U_j/(fW) and its growth, which the engine matches (10 %, 3 ¢).
- **Playing:** every key on every stop speaks its fundamental at the
  default 700 Pa (half level within 410 ms, the bass slowest), tuned to
  ±0.4 ¢ in the engine. Velocity sets how fast the pallet opens: a fast
  one brings the upper modes in first, the chiff. More wind (or a lower
  cut-up) overblows the pipes to the octave (open) or twelfth (stopped),
  and they come back only far lower, at a fixed U_j/(fW).
- **The wind:** a reservoir, a trunk with air mass and a chest that every
  pipe drains, from steady (a Schwimmer) to flexible: big chords sag the
  wind and a flexible one rings at 5.5 Hz. The pitch hardly follows (5 %
  less wind: 0.35–2.2 ¢, least for high-Q pipes). A tremulant valve.
  Stereo from the C and C♯ sides of the chest.
- Views: the jet in the mouth in slow motion, pressure against flow at the
  mouth, the chest's wind, and the spectrum with the pipe's modes. Seven
  demos.

## 2026-10-14 — free-reed organ

### Free-Reed Organ 0.1.0
- New instrument, after the harmonium and the accordion: 61 keys (C2–C7),
  each with a reed in five ranks: 8′, the musette's two 8′s tuned sharp and
  flat (±12 ¢ by default), 16′ and 4′, each opened by its stop.
- **The reed:** a brass cantilever with a tuning weight at its tip below
  G3, in two bending modes, swinging through a close-fitting slot. The
  open area follows the tongue's height along its edges: the clearance
  while it overlaps the slot, the perimeter times the distance clear of it
  outside.
- **The air:** a jet through the gap with its own air mass (unsteady
  Bernoulli), a small cell fed through a throat from the reservoir, and the
  volume the tongue sweeps. The reed is a blown-closed valve driven by the
  inertia of the air that feeds it. A linear analysis gives every reed's
  threshold (22 Pa at C1 to 258 Pa at C8) and its growth rate, which the
  engine matches.
- **Playing:** every key speaks at the default 800 Pa within 90–260 ms,
  sooner with more wind, with a fast key (the pallet opens in 3–30 ms) or
  with Martin's percussion. The pitch falls slightly as the wind rises
  (−6 ¢ from 800 to 2500 Pa). Reeds are tuned at the playing wind to ±3 ¢
  across the keyboard.
- **The wind:** feeders into a spring-loaded reservoir (a ten-key chord
  sags it 3 %), the expression stop that bypasses it, foot pumping, and the
  bellows pressure on the mod wheel and aftertouch. An accordion's
  cassotto can be put round the reeds: a Helmholtz chamber that softens
  the upper harmonics.
- Integrated per sample with an implicit (Newton, BDF2) step for the air,
  reeds above 440 Hz at twice the sample rate. Views: the reed in its slot
  in slow motion, flow against displacement, the musette's beats, and the
  wind. Eight demos.

## 2026-10-14 — harpsichord

### Harpsichord 0.1.0
- New instrument, after a Flemish Ruckers double as rebuilt in France with
  a five-octave compass (FF–f³, 61 keys): three choirs of strings (front
  8′, back 8′ and 4′), iron from B♭ up and brass below, on a Ruckers-like
  scale (c² = 355 mm, Pythagorean in the treble, foreshortened to 1.65 m
  in the bass). Each string is a stiff string in modal form (up to 90
  partials, B from 6×10⁻⁶ to 8×10⁻⁴), tuned exactly through its
  inharmonicity at A = 440 or 415 Hz, in equal temperament, ¼-comma
  meantone or Werckmeister III.
- **The pluck:** each plectrum (Delrin or quill) is a tapered cantilever
  under the string. It catches the string, bends, and the string slides out
  along it against friction and its own sideways stiffness until it slips
  off the tip. The contacts (plectra, damper felts, buff pads) are solved
  implicitly every sample. Voicing (tip stiffness and overlap), friction,
  the plucking point of each row and the stagger between rows all change
  the release, and the comb filter of the plucking point.
- **Registration as on a French double:** upper manual (front 8′, and a
  lute row plucking the back 8′ strings by the nut), lower manual (back 8′
  and 4′), and a shove coupler; the buff stop presses leather pads on the
  back 8′ strings by the nut.
- **Key up:** the jacks fall; the plectra brush past on their tongues and
  the damper felts land, more gently the slower the key comes up (MIDI
  release velocity, sent by the page; other keys use a free drop). Key and
  jack knocks reach the board. Velocity barely matters, as on a real
  harpsichord: about 1 dB and a slightly brighter pluck on one choir.
- **The soundboard:** an equivalent orthotropic plate (77 modes) driven along
  the 8′ and 4′ bridges, draining each partial at its conductance there,
  and heard by two microphones (bass end left, treble end right); it can be
  switched off to hear the bridge force alone.
- Views: the pluck in slow motion (jack, bending plectrum, string and the
  force); the scale across the compass with every row's plucking point and
  the inharmonicity; the pluck's comb over the live spectrum. Eight demos.

### Forte 0.5.2
- MIDI release velocity reaches the engines: the shell's note-off carries
  it and `shared/worklet.js` passes it on as `noteOff(key, velocity)`
  (undefined when the keyboard sends none); `tools/audio-util.mjs`
  renders can give one too. The Harpsichord uses it for how fast the
  jacks fall.
- The root README lists the Vibraphone, Bubble Organ and Harpsichord as
  playable, and `docs/WORKSHOP.md` points their briefs at the instruments.

## 2026-10-14 — bubble organ

### Bubble Organ 0.1.0
- New instrument: a row of 52 nozzles (A3–C8) on the floor of a tank.
  Each key releases a gas bubble that rings at its Minnaert frequency;
  holding a key keeps the nozzle bubbling (a brook), at a set rate with
  seeded random gaps and a size spread.
- **Each bubble** is a linearised Rayleigh–Plesset oscillator with
  Prosperetti's complex polytropic index for heat flow in the gas (checked
  against Devin's 1959 real form and both asymptotes), surface tension,
  and Devin's thermal, viscous and radiation damping. The free surface
  above acts as an inverted image source: it raises the pitch of the big
  bubbles and stops them radiating, so the bass rings for a second.
- **The tank retunes the keyboard:** nozzle depth (p₀ = p_air + ρgh, pitch
  ∝ √p₀), the air pressure above the water (a partial vacuum takes it
  about an octave down, and ringing bubbles follow), the gas (air, helium,
  argon, SF₆: helium falls short of √γ in small bubbles, which lose heat)
  and the liquid (water, 90 % glycerol, glycerol, whose viscosity kills
  the treble but not the bass). **Keep in tune** re-sizes the bubbles
  instead.
- **The kick at pinch-off** is a pressure step, a share of the Laplace
  pressure 2σ/R, ramped over the neck's snap time and integrated exactly:
  every bubble starts at the same pressure, and a slow snap barely rings
  the small ones.
- Bubbles rise at their terminal speed, swell and glide in pitch as they
  go: a few cents down when deep, up as they near the surface, where they
  burst. Two hydrophones place each nozzle in stereo.
- Views: the tank with the bubbles rising to scale, coloured by pitch; the
  latest bubble's waveform against the model's envelope; Devin's damping
  constants and κ across the keyboard; the live spectrum. Seven demos.

### Forte 0.5.1
- `tools/loudness.mjs` finds every ready shell-based instrument from the
  registry, so a new instrument no longer needs a line there.

## 2026-10-14 — prior art and credits

### Forte 0.5.0
- **Prior art and credits.** A new page at `/credits/` (from
  `docs/PRIOR_ART.md`) credits the field Forte builds on:
  - the history of physical-modelling synthesis, from Kelly & Lochbaum
    (1962) and Hiller & Ruiz (1971) to today;
  - where each technique Forte uses comes from;
  - the algorithms and data in its shared code (with licences);
  - about 45 physical-modelling instruments and projects, commercial and
    open source;
  - earlier sonifications.
  About 90 references and 180 links, each checked against a DOI record,
  publisher, patent or official page. The landing page links to it.
- Every instrument's README, which is also its **How it works** notes, now
  ends with **Prior art and references**: the original instrument and its
  patents, the physics credited to its originators, and earlier models and
  syntheses (academic and commercial), all verified. Along the way:
  - several citations were corrected (titles, pages, years and
    attributions);
  - the viola organista's "first built in 2013" now credits the bowed
    keyboards built since Haiden's Geigenwerk (c. 1575);
  - the "new physics" section no longer implies its phenomena were never
    used for sound before.
- `test/site-tests.mjs` checks that each ready instrument's README ends with
  its prior art, and that the credits page is linked. The instrument guide
  and template ask for it.
- The How it works renderer accepts link targets with parentheses, as many
  DOIs have.

### Glass Armonica 0.2.1
- The model's comment cites Rayleigh's spherical-shell pages (vol. 1,
  pp. 395–420), not the sections on bells.

### Black-Hole Keyboard 0.2.1
- The model's comment credits the amplitude fits in the form used here to
  Gossan, Veitch & Sathyaprakash (2012).

## 2026-10-14 — vibraphone

### Vibraphone 0.1.0
- New instrument, after the Deagan vibraharp (1927): 37 aluminium bars,
  F3–F6, over stopped resonator tubes, with a motor turning a butterfly
  disc in every tube's mouth.
- **Bars:** each bar's arch-shaped undercut is shaped by a Timoshenko
  beam finite-element model so that its first three bending modes sit at
  1 : 4 : 10 (every key within 0.01 ¢ in the model; a plain bar rings at
  1 : 2.76 : 5.40). Bending modes 4 and 5 and two torsional modes come
  along untuned. Losses from the aluminium, heat flow across the bar
  (Zener), the cords at mode 1's nodes, and the bar's own radiation.
- **Resonators:** bar mode 1 and the tube's quarter-wave mode are two
  oscillators sharing the air in the gap. Pressed close they split and
  trade energy (beats); at the default gap the tube draws the bar's energy
  out as sound: the fundamental is 12–34 dB louder, swells for up to
  0.35 s after the strike, and the bar's ring drops from a minute or less
  (13 s at F6) to a few seconds.
- **Motor:** a disc closing the mouth adds end correction, which detunes
  the tube and weakens its coupling. The tremolo runs at twice the shaft
  speed (1–12 Hz), the shaft spins up and parks open or closed, and the
  discs' phase can step along the shaft and between the naturals' and
  accidentals' shafts.
- **Mallets:** a yarn head on the bar as an implicit, energy-consistent
  Hertz-type contact (F = Kδ^2.3): hardness, mass, speed, and where it
  lands along and across the bar.
- **Damper:** a felt bar on every bar unless the pedal (Space, CC64) is
  down or the key is held; also a pedal lock. Air temperature detunes
  tubes and bars.
- Views: the bar to scale with its undercut and live mode shapes; the
  tube's standing wave, the disc and the coupling over one turn, with the
  energy in bar and tube; the live spectrum with the model's lines; and a
  mode table. Eight demos.

### Forte 0.4.1
- `tools/encode-examples.mjs` encodes demos with ffmpeg where macOS
  `afconvert` is missing (Linux, cloud sessions).
- `tools/loudness.mjs` measures the Vibraphone.
- The instrument guide no longer says to tag releases.

## 2026-10-14 — how it works

### Forte 0.4.0
- Every instrument page has **How it works** next to its name: the
  instrument's README (its physics, equations, numbers, sources and
  simplifications) in a dialog, without leaving the page. On a phone it
  fills the screen, and the button is an ⓘ.
  - Contents chips jump to each section. Equations are shown as display
    lines, tables scroll sideways when they are wide, and links to the
    source go to GitHub. The README's *Files* section, for developers, is
    left out.
  - Keys pressed while reading scroll the notes instead of playing the
    instrument; Escape, **Close** or a click outside closes them.
  - A link to `…/#about` opens an instrument with its notes showing. Each
    card on the landing page has a **How it works** link.
  - The instrument's version (and its changelog link) moved from the
    header into the notes, which makes room for the button: no header
    gains a row, and on an iPad the organ's and the Pianet's lose one.
    Below 1250px wide the button is just its ⓘ.
- `shared/markdown.js` renders the READMEs: a small Markdown renderer with
  no dependencies. Its output matches the `marked` library's text and
  inline markup for every README. `test/notes-tests.mjs` checks the
  renderer and renders every README.
- Tests: the Tine Piano's 20-voice timing test is now named like the other
  timing tests (`CPU: …`), so CI skips it too. It had failed once on a
  slow shared runner.

## 2026-10-14 — the workshop

### Forte 0.3.2
- Ten instruments added to the workshop (shown on the landing page and in
  the menus), each with a build brief in `docs/WORKSHOP.md`:
  - from history: Harpsichord, Pipe Organ, Carillon, Vibraphone,
    Free-Reed Organ and Duddell's Singing Arc;
  - new: Star Keyboard, Wind Harp, Bubble Organ and Spring Keyboard.

## 2026-10-14 — phones

### Forte 0.3.1
- Instrument pages lay out properly on an iPhone. In portrait they
  squeezed every view into a sliver between a three-row header and the
  keyboard; in landscape the views got no room at all.
  - On phones the page scrolls, so Safari can tuck its toolbars away, and
    the keyboard sticks to the bottom. Views keep their full size (two to
    a row in landscape), and wide tables scroll inside their card.
  - The header is two rows in portrait and one in landscape: the
    instrument's name shortens to fit, and the CPU meter takes the place
    of **Start audio** once the audio is on.
  - **Controls** replaces the views instead of sliding over a sliver of
    them, with **Close** kept in reach while you scroll.
  - The **Instruments** and **Views ▾** menus open inside the screen.
  - Keys are at most 38 % of the screen's height, and a phone starts with
    two octaves, not three.
- iPhone and iPad have no Web MIDI in any browser, so the MIDI button,
  status and hints are hidden there.
- iOS: no text inflation in landscape, no zoom when a dropdown is tapped,
  no pull-to-refresh mid-phrase on a phone, and the landing page and
  instrument pages keep clear of the notch in landscape.
- Toasts sit just above the keyboard and its tools, however they wrap.

## 2026-10-13 — review fixes

An adversarial review of the whole project (six reviewers, one per area)
found the bugs and inaccuracies below; each fix has a regression test.

### Forte 0.3.0
- **Level matching:** every instrument is trimmed (registry `trim`) to about
  −23 LUFS for one default note. The spread was 22 LU. The black hole stays
  a little quieter so its short chirps keep their headroom.
  `tools/loudness.mjs` measures this, and `test/level-tests.mjs` enforces it.
- **Start-up ordering:** messages queue in order until the audio context has
  resumed, so a quick first note-off can't overtake its note-on (shell and
  the five older pages).
- **Engine failures:** an exception or a non-finite sample in any engine
  zeroes the block, stops the voices and shows a message
  (`shared/guard.js`), instead of silencing the page or poisoning the reverb.
- **Touch aftertouch:** pressure from a held key (Apple Pencil, or sliding
  the finger toward you) reaches the engines as polyphonic aftertouch.
- **Stale caches:** a page that loads a mix of cached old and new files right
  after an update offers a reload that refreshes them (`shared/boot.js`).
- **Demos match the live mix:** render tools scale impulse responses as the
  browser's ConvolverNode does. Demos were about 9 dB too wet, and the piano
  soundboard 16 dB too strong.
- **Keyboard and pedal:** releasing a held Space bar when the window loses
  focus. Dropdowns no longer swallow note keys. Checkboxes no longer disable
  the arrow keys.
- **MIDI mod wheel:** rest is the parameter's default (with an optional
  range); it used to pull some instruments to the bottom of their range.
- **Saved state:** stored settings and layout preferences are validated.
- **Smaller fixes:** canvases no longer reset every frame at fractional
  pixel ratios; the CPU pill shows the worst block where the audio thread
  has a fine clock; screen-reader values on sliders; toasts stay clear of
  the keys.
- **Tests:** `npm test` runs every suite in parallel and reports all
  failures. A site test checks presets against their parameters. Timing
  tests skip on CI, where they had been failing on slower shared machines
  since 0.2.

### Pyrophone 0.2.0
- No NaN at maximum bore and damping: overdamped tube modes now take an
  exact cosh/sinh step.
- Flame power is set as a multiple of each tube's threshold, with a ceiling
  below the scream. A wide bore or heavy damping no longer silences every
  key, and low damping no longer screams. Presets keep their sound. The
  stored setting was renamed, so old saved values are discarded rather than
  misread.
- Released tubes that keep singing no longer drift flat: warm-up follows the
  singing, not the key.

### Gong Keyboard 0.2.0
- No energy runaway: the reviewer's settings peaked at 34× full scale, now
  about 1.1. Forcing is weighted so the scheme conserves the physical
  energy, substep changes are energy-neutral, and passivity is checked every
  step.
- When the nonlinear-voice cap demotes a gong it keeps its pitch, instead of
  snapping from a +180–570 ¢ glide back to 0.
- Physical energy is now conserved within a few percent (it grew 1.7–2.6×).
- Coupling tables are built on the page, not on the audio thread (a slider
  tick cost up to 4.9 ms there).
- The "Clamped" rim is relabelled: it is free to slide in its plane, which
  is why it isn't less nonlinear.

### Quantum Keyboard 0.2.0
- Always in tune: when the tempo lock would need an impossible n̄, the pitch
  stays exact and the revival is flagged as off the beat. Some keys were
  more than an octave out.
- No DC thump at the start of Electrode notes.
- A pair budget across voices: 24 hydrogen voices took 66 % of a core, now
  32 %.
- README: the fractional-revival harmonics for even q, and revival rates
  versus times, corrected.

### Electric Grand 0.2.0
- New **stretch tuning** (on by default): each octave's 2:1 partials
  coincide, as a tuner would set them (−12 ¢ at E1, +25 ¢ at E7). Unstretched,
  the C6–C7 octave beat at 15 Hz.
- High partials drain into the bridge at the right rate (an implicit
  bridge solve; it was 31 % slow at 15 kHz).
- Above 6 kHz the soundboard radiates through a residual path, instead of
  draining the strings silently.
- The microphones no longer cancel in mono: a phase-convention error put the
  mic path 12 dB down; it now matches the README's −4 dB.
- Re-striking a ringing note no longer doubles its voice.
- A 60 ms hammer repetition limit.
- CPU roughly halved: dead partials stop being computed, and the voice
  budget adapts to measured load, with a lower ceiling on tablets.

### Reed Piano 0.2.0
- The C(y) table now covers ±5.8 mm, with the frame as an end stop: a light
  reed at ff swung off the table and through the frame.
- No clicks when the gap, reed height or output is changed while notes
  sound.
- Re-striking a ringing note no longer doubles its voice.

### Sticky-Pad Piano 0.2.0
- Re-pressing a key with the sustain pedal down plays again: the pad
  drops, re-tacks and plucks. It used to be silent.
- The magnetic pickup's level no longer depends on the sample rate.
- Its pole-gap law corrected to a fixed magnet MMF (Φ₀ ∝ 1/(ℓ+g)), with the
  gaps re-voiced.
- No clicks when knobs move.
- Preset levels evened out.

### Tangent Clavier 0.2.0
- The rubber-tip and tip-width sliders no longer detune held notes (+32 ¢ at
  the "Soft tips" setting).
- Pickup flux is bounded beyond one field depth, and output scales with the
  gap, so a 2 mm gap no longer peaks at 1.4.
- No main-thread hitch after bass notes: released frequencies are cached,
  and the slow-motion simulation runs only while its view is visible.
- The release-pitch readout shows the coupled eigenvalue (−307 to −320 ¢,
  not the ideal −300).
- README glide figures corrected (touch matters about 4× at F1).
- Gain smoothed per sample; the mute felt is drawn when Space engages it.

### Viola Organista 0.2.0
- No more NaN: a string whose loop filter would have gone non-passive
  (β at its minimum, low losses) took the whole instrument down until Panic.
  Now it gets a flat gain, plus a per-string guard. Tested on all 49 keys
  at every extreme, at 44.1, 48 and 96 kHz.
- No DC offset or thump at key down and up: plate radiation now uses −a/ω,
  which is zero for static deflection.
- In tune at 44.1 kHz as well as 48 kHz (worst 0.89 ¢).
- Four wheels (per-register speed and bow position), and the strings damp
  the board: the keyboard's level span narrows from 19 dB to 12 dB.
- The mod wheel now drives treadle speed, the instrument's real swell, with
  a 0.5 s flywheel.

### Glass Armonica 0.2.0
- "Dry fingers" now gives a faint rubbing whisper instead of near silence.
- The "Pressing hard" preset is re-voiced (it was 16–19 dB louder than the
  defaults).
- Mod wheel: treadle 0.5–1 rev/s (beyond about 1.2 rev/s the big bowls stop
  speaking).
- README speaking times corrected.

### Ribbon Piano 0.2.0
- The top octave and a half is now audible: a refit treble hammer, with
  felt no longer extrapolated past C7. C6–C8 is within 7 dB of C4 at mf
  (it was 16–34 dB down).
- High partials now decay at the model's rate: they were damped too little,
  by 9 % at 5.7 kHz and 35 % at 12 kHz. The test now measures the engine's
  decay rates instead of checking the formula against itself.
- New chords no longer lose notes to voice stealing.
- Strike offset on tapered ribbons uses the width under the hammer.
- "Ribbon, edge-on" no longer computes an inaudible mode family (CPU
  20 % → 5 %).
- No zipper noise on bridge force or stereo spread.
- Next-note controls say so.
- New **una corda** (MIDI CC67 or a checkbox): the hammers strike 2 of 3
  strings, bringing out Weinreich's aftersound.

### Tonewheel Organ 0.2.0
- The tube drive no longer turns into a high-gain half-wave rectifier (a
  10-key chord at full drive peaked at 13; now 0.37).
- The Leslie horn can no longer sweep through the microphones.
- No zipper noise on expression.
- New on-screen **swell pedal** in the console, for tablets.
- No allocation on the audio thread.
- README: the vibrato's extra swing comes from per-tap phase ripple at the
  terminations, not ladder dispersion (the test now checks the median
  swing); busbar-loading label and gear-beat numbers corrected.

### Tine Piano 0.2.0
- The pickup controls (gap, vertical voicing, pole radius) act on sounding
  notes.
- The pickup-waveform view is no longer NaN for E1–C♯2.
- New chords no longer lose notes to voice stealing.
- No zipper noise on speaker, drive or vibrato.

### Huygens Keyboard 0.2.0
- Default coupling raised to 5.5 %: at 4.5 % no coupling could lock the
  minor sixth, so C–E–G–C′ and its inversions never went just. Now all
  nine tested voicings lock at C2–C5. The trade-off is documented: a bare
  semitone pair merges into a unison from 4.6 %. A "Weaker (4.5 %)" preset
  keeps the old behaviour.
- The Arnold-tongue staircase is now the exact, deterministic lock map
  (tongue edges (p−δ)/q ≤ r ≤ p/(q−δ)) instead of a random 0.5 s
  simulation that under-reported the fifth and fourth.
- README corrected: kicks below threshold leave no trace, there is no chaos
  between tongues, and supply voltages only rescale δ. Capture times are now
  bounded and documented.
- No more low thump on release (keyed output with a 15 Hz coupling
  capacitor).
- Lock detection from shared firings (no flicker in the bass).
- Stereo width updates sounding notes.
- The worklet posts state at ≤ 30 Hz (it took 25 % of DSP time), and views
  redraw only on change.

### Black-Hole Keyboard 0.2.0
- No notch at the chirp→ringdown handover (phase and amplitude matched).
- The inspiral control is now "octaves below ISCO" (part of the old range
  did nothing), and inspirals last at most 2 s.
- QNM table regenerated with deeper continued fractions: (2,−2,2) at
  a = 1 − 10⁻⁶ was 14 ¢ off. Interpolation uses one-sided end slopes, so
  errors are ≤ 0.021 ¢ almost everywhere, against up to 3.5 ¢ near a = 0.
- Voice stealing fades the quietest voice instead of cutting the oldest.
- The strain view is evaluated in closed form once per frame, with no
  2.5 s offline render on every key.
- README corrected: GW150914's remnant (62 M☉, ≈ 250–270 Hz, near middle C),
  the range of the excitation model, and the l ≠ m quality factors.
- New m < 0 reference values (Berti, Cardoso & Will 2006).

## 2026-10-13 — gong performance

### Gong Keyboard 0.1.1
- Performance pass for tablets. The worst 128-sample block in a loud
  pedalled melody fell from 77–213 % of its time budget to under 50 %.
  Average load roughly halved, and the first strike no longer stalls.
- The hot paths are warmed up and the buffers allocated before audio
  starts; voice fields keep fixed types, so the JIT doesn't de-optimise
  mid-note.
- New *Nonlinear voices* control (default 4). Gongs past the cap keep
  ringing linearly instead of being cut.
- A more robust switch to the linear fast path, and quiet tails use only
  their strongest couplings.
- Substeps capped. New `tools/bench-gongs.mjs` and a worst-block test.

## 2026-10-13 — new instruments

### Gong Keyboard 0.1.0
- Every key a free or clamped circular plate: 41 Bessel modes with sparse
  von Kármán coupling (angular selection rules).
- Optional shallow-shell dome, so flat gongs glide down and domed ones
  glide up.
- Exact modal recursion with an energy-stable scalar-auxiliary-variable
  nonlinearity.
- Hertz mallet, thermoelastic, internal and radiation losses.
- Views: gong surface, spectrogram, energy cascade.
- Known: heavy on CPU when many loud gongs ring at once.

### Viola Organista 0.1.0
- After Leonardo's design: steel strings bowed by a rosined wheel. Each
  string is a lossy waveguide with torsion, driven by the hyperbolic
  friction curve solved implicitly, with rosin lag and grain noise.
- A shared bridge and spruce soundboard (sympathetic strings, radiation).
- Schelleng bounds measured against theory.
- Strings tuned so the *bowed* pitch is in tune.
- Treadle speed, key pressure and aftertouch on bow force; dampers-lifted
  switch.
- Views: travelling Helmholtz corner, live Schelleng diagram, attack map.

### Forte 0.2.1
- ↑/↓ step a log-scale parameter by a fixed fraction of its range, instead
  of a fixed amount (finer control of key pressure at the low end).

### Glass Armonica 0.1.0
- After Franklin's armonica: hemispherical bowls with Rayleigh's
  inextensional shell modes (n = 2–6). Wall thickness solved for pitch
  comes out at Franklin's "tenth of an inch".
- Mode doublets integrated in the rotating bowl's frame, with Coriolis
  coupling (Bryan effect) and an adjustable split.
- A wet-skin finger pad with Stribeck friction, solved implicitly.
- Treadle speed, water loading (French), and sphere-harmonic radiation to
  two microphones.

### Tangent Clavier 0.1.0
- After the Hohner Clavinet D6: the rubber tangent strikes the string and
  clamps it on the anvil (coupled Hertzian contacts, Newton-solved).
- Speaking and yarn-damped segments of the string; release thunk.
- Key pressure / aftertouch raises the tension (ΔT = EA·ΔL/L).
- Kirchhoff–Carrier pitch glide in the bass.
- Upper and lower pickups (A, B, A+B, A−B), the four tone tabs, and the
  felt mute bar on Space.

### Quantum Keyboard 0.1.0
- Each key launches a Gaussian wavepacket, summed exactly over eigenstates
  with exact dipole matrix elements.
- Five wells: infinite square, Morse, hydrogen Rydberg, quantum bouncer and
  harmonic oscillator.
- What you hear is the electrode, coil or antenna signal (⟨x⟩, ⟨ẋ⟩, ⟨ẍ⟩).
- Revivals land on the beat (n̄ solved per key) and are sample-accurate.
- T₁ decay and pure dephasing.
- Quantum carpet, packet, return-probability and spectrum views.

### Pyrophone 0.1.0
- After Kastner's flame organ: each key is a Galerkin Rijke tube (10
  open–open modes) driven by a lagged King's-law heat source.
- A subcritical Hopf bifurcation, so tubes are bistable and notes
  "remember having sung"; the hysteresis thresholds match harmonic balance.
- Slow self-excited onsets and warm-up pitch drift (c ∝ √T).
- Bifurcation diagram, tube and phase-portrait views.

### Reed Piano 0.1.0
- After the Wurlitzer 200A: solder-tuned steel reeds (finite elements with
  tip mass and rotary inertia) and an energy-conserving felt hammer.
- An electrostatic pickup whose C(y) comes from solving Laplace's equation
  in the comb slot, with the RC feed network (constant charge to constant
  voltage) and the field's pull on the reed.
- Preamp clipping, LED/photocell tremolo, built-in speakers or direct out.

### Electric Grand 0.1.0
- After the Yamaha CP-70: stiff strings scaled to the CP-70 (one string per
  note in the bass, two above), each in two polarisations with Weinreich
  double decay.
- Felt hammers with nonlinear contact.
- A piezo pickup that senses the bridge force, with the preamp's
  high-pass and EQ, or, for comparison, a modal soundboard radiating to two
  microphones.

### Sticky-Pad Piano 0.1.0
- After the Hohner Pianet: reeds plucked by tacky pads, with release set
  by rate-dependent adhesion (Kendall flat-punch fracture).
- The pad chokes the reed when it lands again.
- Solder-tuned reeds solved by finite elements.
- Magnetic (Pianet T) or electrostatic (Pianet N) pickup.

## 2026-10-13 — tablets

### Forte 0.2.0
- Tablet-friendly layout on every instrument page:
  - the page fills the screen, with the keyboard pinned to the bottom;
  - a **Controls** toggle: a column on wide screens, a slide-over panel on
    narrow ones;
  - a **Views ▾** menu to show or hide each visualisation;
  - hiding everything leaves a full-screen keyboard;
  - choices are remembered per instrument.
- A shared on-screen keyboard (`shared/keyboard.js`):
  - multi-touch chords and glissando;
  - velocity from where you strike the key, or from Apple Pencil pressure;
  - a 2–5-octave window with ◀ ▶, and four key sizes.
- An on-screen pedal button for whatever Space does (sustain, hold,
  Leslie speed), with a latch.
- iOS:
  - an AudioContext created on a touch is resumed;
  - audio plays through the silent switch;
  - bigger touch targets, no long-press callouts, and safe areas for the
    notch and home bar.
- An app icon and web manifest, so Forte can be added to the home screen
  and run full-screen.
- Hidden views are no longer drawn, which saves battery.
- A drawing error can no longer stop a page's animation.

### Ribbon Piano 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

### Tonewheel Organ 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.
- The Leslie view no longer throws when its canvas is very small.

### Tine Piano 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

### Huygens Keyboard 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

### Black-Hole Keyboard 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

## 2026-10-13 — first release

### Forte 0.1.0
- Landing page, one page per instrument, instrument menu, and a version
  on every page.
- Shared page shell (keyboard, MIDI with velocity, sustain, aftertouch and
  pitch bend, parameter sidebar, presets), a generic AudioWorklet, DSP and
  view helpers, a template instrument and `tools/new-instrument.mjs`.
- Compressed audio demos, `npm test`, CI on every push, MIT license.

### Ribbon Piano 0.1.0
- Stiff strings in modal form with a nonlinear felt hammer and a shared
  bridge.
- String cross-sections: round, square, triangular, flat ribbon and
  tapered ribbon, with torsion.

### Tonewheel Organ 0.1.0
- Hammond B-3 generator with gear ratios and shared wheels.
- Contact bounce and busbar loading; single-trigger percussion.
- LC-ladder scanner vibrato, tube drive, and a Leslie 122 with Doppler
  horn and drum.

### Tine Piano 0.1.0
- Rhodes-style tine and tone bar as a finite-element asymmetric tuning
  fork.
- Neoprene and felt hammers, nonlinear electromagnetic pickup.
- Suitcase tremolo and amp.

### Huygens Keyboard 0.1.0
- Pulse-coupled neon relaxation oscillators that lock chords into just
  intonation.
- Live Arnold-tongue and devil's-staircase views.

### Black-Hole Keyboard 0.1.0
- Kerr quasinormal modes from Leaver's continued fractions.
- Spin-weighted spherical-harmonic radiation pattern, merger chirp, and
  h₊/h× in stereo.
