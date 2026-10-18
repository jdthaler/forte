# the JavaScript engines are retired

### Forte (minor)
- **The C++ plays everywhere:** every page runs its instrument's C++ engine, built as
  WebAssembly, and its views draw the C++ model. The header's **C++ | JS** switch is gone, and
  so are `?engine=js`, the worklet's fallback to JavaScript and the views' JavaScript models.
  A page now waits for its WebAssembly model before it draws.
- `shared/shell.js` takes the descriptor's `wasm` and no longer `engine`, `worklet` or
  `engineParams`; the worklet runs only WebAssembly, and parameters go to it whole
  (`{ type: 'params', P }`).
- The tests, `tools/headless.mjs` and the render tools play the C++ (`tools/engine.mjs` has no
  `FORTE_ENGINE` any more), and check it against independent physics written in the tests.
  `tools/render-reference.mjs` saves the C++'s sound when a change to it is meant.
- The template has no JavaScript engine or model: `tools/new-instrument.mjs` starts an
  instrument whose physics is C++ only, and says to build its WebAssembly first.

### Ribbon Piano (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and each note still brings the strings its key's WebAssembly model built on the page.

### Harpsichord (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the plectrum and string views draw the C++ model.
- The WebAssembly's slow-motion pluck takes the tests' plectrum friction and bridge scale and reports the string's modes, and it exports the board's admittance and bridge points, so the ideal-pluck, 192 kHz energy, frictionless-release and σ_b = Re Y checks run on the C++.

### Pipe Organ (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the jet, spectrum and pipe readouts use the C++ model.
- The WebAssembly exports the linear analysis (`linearRoot`, `loopGain`, `speakingWindow`), `chestPan`, the wind system and `modeFreq`, so the tests run them on the C++. `tools/pipes-tuning.mjs` measures the build and has a `--check` mode.

### Free-Reed Organ (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The WebAssembly exports the reed's steady state and linear root, the cassotto and the slot's gap, so the tests run them on the C++. `tools/harmonium-tuning.mjs` measures the build, writes the recut table (which takes effect once the WebAssembly is rebuilt) and has a `--check` mode.

### Vibraphone (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the page sends each note its bar from the WebAssembly model. `bar.js` keeps only what designs the bars' table.

### Carillon (minor)
- **The JavaScript engine is gone:** the C++ engine and model always play and draw. The bell FEM stays in JavaScript, where it designs the ribs and the table.

### Electric Grand (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The WebAssembly exports the board's modes, `sinFT` and a widened modal band (defaults unchanged), so the Rayleigh-integral board test and the residual-path test run on the C++.

### Tonewheel Organ (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the generator map, the key analysis and the Leslie view come from the C++ model.

### Tine Piano (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the tone-bar and pickup views draw from its model.
- The tests check the tine's participation Γ₁²/mt = 0.6131 on the C++ (`tines_gamma`).

### Reed Piano (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views draw the C++'s reeds, pickup and hammer.
- The tests check the hammer's energy conservation and the reed's independence of width on the C++ (`reeds_lossless_strike`, `reeds_fem`).

### Tangent Clavier (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model. A new test measures the tone tabs in the output against the analogue networks.

### Sticky-Pad Piano (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The tests check the unit reed (point tip mass, 30-mode static compliance), the pickups' closed forms, the plate rail's high-pass and the T's end stop on the C++, through new test-only exports; the unit reed can hold every mode of its mesh.

### Viola Organista (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The string-alone tests and `tools/bowed-tuning.mjs` bow the C++ string, exported alone (`bowed_string_*`), and the board's tests (Weyl count, Wallace radiation, the strings' load) run on the C++; `bowed-tuning.mjs --check` measures the build.

### Glass Armonica (minor)
- **The JavaScript engine is gone:** the C++ engine and model always play and draw. The tests check the C++'s bowls against Rayleigh's integrals and a closed-form radiation efficiency.

### Pyrophone (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the page hands it each tube's tuning from the C++ model.
- `pyrophone_root` can Taylor-expand the delay as Magri & Juniper do, so the tests hold their published eigenvalues to 5×10⁻⁵ on the C++.

### Singing Arc (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views and the capacitor bank come from the C++ model.
- `arc_linear` returns all four roots and `arc_steady` takes its starting kick, so the tests check every root against the state matrix and the bistable cycle from a 0.8 I kick.

### Huygens Keyboard (minor)
- **The JavaScript engine is gone:** the C++ engine and model play the page and its lock map.

### Gong Keyboard (minor)
- **The JavaScript engine is gone:** the C++ engine always plays and builds its own coupling tables; the page no longer builds or sends them.

### Black-Hole Keyboard (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, building each key's voice from the QNM table as the note starts; the views use the same C++ model. The Leaver solver stays in JavaScript, to make the table and check the C++.

### Quantum Keyboard (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the wavefunctions come from the C++ model.

### Bubble Organ (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the tank, the latest-bubble readout and the damping plot come from the C++ model.
- The glide is one C++ function (`glideRing`) that the engine and a test-only export share, and a liquid and gas of the test's own bring back the exact √p₀, Minnaert and √γ limits.

### Spring Keyboard (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the views come from the C++ model.
- The WebAssembly solves the rod at any shape and wavenumber (`springs_rod`), so the tests check the closed ring against Hoppe and Michell and the rigid-body motion at k = cos α/R.

### Star Keyboard (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the page builds each star with the C++ model.

### Wind Harp (minor)
- **The JavaScript engine is gone:** the C++ engine always plays, and the lock-in map and table come from the C++ model.
- The WebAssembly exports the single-mode harmonic balance and its locked state, so the test that the locked state solves its equations runs on the C++.
