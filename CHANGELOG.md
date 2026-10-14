# Changelog

Forte and each instrument have their own [semantic version](https://semver.org).
Forte's version covers the site and the shared code (`shared/`, the
landing page and the tools). An instrument's version covers its folder,
its tests and its demos. Everything is pre-release (0.x) for now, so any
release may change the sound or the parameters.

Each release is tagged in git as `forte-vX.Y.Z` or `<instrument>-vX.Y.Z`,
for example `piano-v0.1.0`.

## 2026-10-13 — review fixes

An adversarial review of the whole project (six reviewers, one per area)
found the bugs and inaccuracies below; each fix has a regression test.

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
