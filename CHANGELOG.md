# Changelog

Forte and each instrument have their own [semantic version](https://semver.org).
Forte's version covers the site and the shared code (`shared/`, the
landing page and the tools). An instrument's version covers its folder,
its tests and its demos. Everything is pre-release (0.x) for now, so any
release may change the sound or the parameters.

Each release is tagged in git as `forte-vX.Y.Z` or `<instrument>-vX.Y.Z`,
for example `piano-v0.1.0`.

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
