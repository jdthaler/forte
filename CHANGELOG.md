# Changelog

Forte and each instrument have their own [semantic version](https://semver.org).
Forte's version covers the site and the shared code (`shared/`, the
landing page and the tools). An instrument's version covers its folder,
its tests and its demos. Everything is pre-release (0.x) for now, so any
release may change the sound or the parameters.

Releases up to Forte 0.3.0 are tagged in git as `forte-vX.Y.Z` or
`<instrument>-vX.Y.Z`, for example `piano-v0.1.0`. Later releases are not
tagged; this changelog and the commit titles record them.

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
