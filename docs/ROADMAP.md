# Roadmap to Forte 1.0

Forte is in beta: every version is 0.x, and any release may still change an instrument's sound
or parameters. This page says what 1.0 will mean, what is done towards it, and the features
wanted before and after it. It was last revised on 2026-10-18.

## What 1.0 means

From 1.0 on, an instrument's major version changes only when songs saved with its plugins, or
the sound of its presets, break (README, *Versions*). So 1.0 is mostly a promise of stability,
not a feature milestone. Forte 1.0.0 and every instrument's 1.0.0 will be released together.

Before then, Forte stays in beta, so that features can be added and the instruments retuned
while that is still free.

## Done

- **The guard against breaking saved songs** (ships with the next release). Each instrument's parameters
  and presets are listed in `native/instruments/<slug>/<slug>-contract.json`, which is
  generated from its descriptor. `tools/contract.mjs` says what a change breaks. The `tests`
  workflow warns about a break while an instrument is below 1.0, and from 1.0 on it asks for a
  `major` release note. Every release keeps the state its plugins save in
  `native/tests/states/`, and the plugin tests load all of these states into today's plugins.
  `reference.json` keeps each preset's sound.
- **Windows downloads that install themselves** (`install.cmd`, `install.ps1`), matching
  `make install` on macOS and Linux.

## Decided

- **No notarisation.** The macOS downloads stay unsigned, and a Mac needs the `xattr` or
  `make unquarantine` step before it opens them. Notarising would need a paid Apple Developer
  Program membership, which would also be needed for an iPad AUv3.
- **No Windows code signing**, for the same reason: it needs a paid certificate.

## Before 1.0

1. Features from the wishlist below, chosen as the beta goes on.
2. **A freeze review.** Go through each instrument's parameters and presets, and retune,
   rename or drop what should change. After 1.0, each such change costs a major version.
3. **A release candidate.** Release `main` to `live`, then test it on real devices:
   - iPhone and iPad in Safari: audio start, text size, zoom on focus, safe areas;
   - Logic or MainStage on a Mac: some AUs, the organ's Leslie button in the plugin window,
     and saving, closing and reopening a project;
   - the Forte app with a MIDI keyboard;
   - a Windows PC: `install.cmd`, one VST3 in a DAW, and the app.
4. Fix what the release candidate turns up, update the docs for a 1.0 reader (README's
   *Versions*, `native/INSTALL.md`), then release 1.0.0 with no new features in it.

## Wishlist

Size is a rough guess: S is one pull request, M is a few, L is a project. **Before 1.0** marks
an idea that would change an existing sound or parameter, which gets expensive after 1.0.
Every other idea only adds, and can come before or after 1.0.

### Playing

| Idea | Size | Notes |
|------|------|-------|
| Velocity curve (soft, normal, hard) | S | Done, for the next release. |
| Sostenuto (CC66) and soft pedal (CC67) | S–M | Done, for the next release. |
| Pitch bend on more instruments | S each | Done: thirteen instruments bend by something physical (the clavier, the two organs, the free reeds, the tines, both reed pianos, the Viola Organista, the Glass Armonica, the Wind Harp, the bubbles, the arc and the pyrophone). The struck strings, bars, bells, plates and the phenomena keep their pitch, as the real ones do. Adding a bend to one of them after 1.0 would change songs that send pitch bend. |
| MPE (per-note pitch bend and slide) | M | Done, for the next release: an MPE menu (Auto, On, Off) on every page and an MPE plugin parameter; CLAP note expressions too. Fourteen instruments bend one note by something physical (a reed, a pipe, a string, a bowl, a lamp, a cavity), and eleven slide (CC74) what their mod wheel moves for one note. The struck strings, bars and bells keep their pitch, as the real ones do, and the tonewheel organ turns every wheel on one shaft; the vibraphone (one motor) and kalimba (one hand on the hole) have no per-note slide. Not yet tried on a real MPE controller. |
| Alternative tunings and temperaments | M | Done, for the next release: a Tuning group on every page and plugin: nine pitch standards (A = 392 to 466 Hz), equal, meantone (¼ and ⅙ comma), Werckmeister III, Kirnberger III, Vallotti, Young, Pythagorean and just on any root, and a custom temperament a Scala file can fill. Equal at 440 Hz, the default, sounds as before. |
| Transpose and octave controls on every page and plugin | S | |
| Split and layer two instruments | M | Most useful in the Forte app and on the site. |

### Sound

| Idea | Size | Notes |
|------|------|-------|
| Save your own presets | M | Done, for the next release: in the Presets menu on every page (kept in the browser, saved to and opened from a file) and in the plugins' window (files in a presets folder per instrument, the same format). |
| A choice of rooms (reverb) | M | Done, for the next release: a Venue choice on every page and plugin (Studio, Room, Recital hall, Concert hall, Cathedral), Room, the original, the default. |
| Morph between two presets | S–M | |
| Quality or CPU setting | S–M | Done, for the next release: a Quality choice (High, Medium, Low) on every page and plugin. High sounds exactly as before; Medium and Low play fewer voices, partials or modes and lighten or drop the sympathetic strings, at about 60 % and a third of High's cost on the heavy instruments. A device's setting: in no preset or link, and the page suggests it when the audio drops out. |

### The site

| Idea | Size | Notes |
|------|------|-------|
| Record and download what you play (WAV) | S–M | Decided against (2026-10-19): not wanted. |
| Share a link with your settings | S | Done, for the next release: *Copy a link to these settings* in the Presets menu; the link carries the parameters that differ from the defaults. |
| Works offline, installable on phones | S–M | A service worker; the manifest already exists. |
| Demo songs played from MIDI files | M | A listen button per instrument, and drag and drop a `.mid` to play it. |
| A guided tour of each instrument's physics | M | Steps through the views while it plays. |
| Accessibility pass | M | Keyboard focus, screen-reader labels, reduced motion. |
| Search and filter on the front page | S | |

### The plugins and the app

| Idea | Size | Notes |
|------|------|-------|
| The site's views in the plugin window | M | `docs/PLUGINS.md`, step 6. |
| Each page's own control layout in the plugin window | S–M | Hints, `showIf`, grouping. |
| MIDI device picker in the Mac app | S | A clap-wrapper patch. |
| Windows installer (.msi or Inno Setup) | M | |
| Linux packages (Flatpak or .deb) | M | |
| iPad AUv3 | L | Needs the Apple Developer Program. |

### Physics

From each instrument's *How it works* notes (their *Simplifications*). Almost any physics can be
added after 1.0 behind a switch that starts off; **Before 1.0** marks what would belong on by
default in the existing presets, or would change what an existing knob means.

| Idea | Size | Notes |
|------|------|-------|
| Tension modulation on the Ribbon Piano, Electric Grand and Harpsichord | M | Done, for the next release: the pitch glide (Kirchhoff–Carrier) on all three, with a *Tension modulation* switch. Still open: the longitudinal modes and phantom partials it would drive in the piano bass. |
| Sympathetic resonance on the Ribbon Piano, Electric Grand and Harpsichord | M | Done, for the next release: every string whose damper is up rings along through the bridge (*Sympathetic resonance*, 25 %), as each key's lowest 16 partials below 4 kHz, driven by every other string. With the pedal down it costs about as much as four voices. |
| The Tonewheel Organ's key scaling, preamp response and computed tonewheel waveform | S–M | Done, for the next release: the B-3's resistance wires, wheel levels and filters, the swell pedal's shut plate, and a waveform from the tooth and pickup (*Tooth relief* replaces *Wheel harmonics*). |
| Companion modes on the Gong Keyboard | M | Done, for the next release: every asymmetric mode has its sin twin, split by a mass asymmetry (*Asymmetry ε*, 0.5 %) and struck off the heavy axis (*Strike angle*, 20°), so gongs beat and their nodal lines wander. The engine runs each pair as one complex amplitude; *Coupling terms* went from 600 to 300 so the page's CPU stays where it was. |
| Resonator tube losses on the Vibraphone | S | Done, for the next release: boundary-layer losses on the shaft, the disc (growing as it closes) and the bottom plug, 14 % more than the walls alone at F3. The bass's pitch wobble moved by under 2 ¢, so a leaking plug or the tube's wall vibrating would have to be what makes real tubes broader, if they are. |
| Spheroidal harmonics on the Black-Hole Keyboard | S–M | Done, for the next release: each mode is seen through its spin-weighted spheroidal harmonic (the spectral method, checked against Leaver's separation constants), so at high spin the higher l = m modes grow by up to half and the l ≠ m ones change. |
| The Harpsichord's second polarisation after release | S–M | **Before 1.0** if wanted: the two-stage decay of a plucked string. |
| An immovable clamped rim on the Gong Keyboard | L | **Before 1.0** if wanted: the clamped plate's nonlinearity is about 3× too weak. Needs a new Airy basis. |
| The Tonewheel Organ's lower manual and pedals | M | A MIDI channel or a split each. |
| A pedal division on the Pipe Organ | M | |
| The Electric Grand's tremolo | S | Done, for the next release: the CP-70/CP-80 preamp's stereo tremolo, an oscillator lighting a photocell on each output in turn (*Tremolo depth*, off by default, and *Tremolo rate*), and a *Stereo tremolo* preset. |

### New instruments

| Idea | Size | Notes |
|------|------|-------|
| RF Cavity Bells, Collider Showers | M each | Both done: RF Cavity Bells in 0.35.0; Collider Showers, a calorimeter's crystals rung by the heat of particle showers, for the next release. |
| Whistlers | M | Done, for the next release: lightning's crack dispersed along the Earth's field lines into falling tones, each key the field line whose nose is the note, with ducts, echoes, tweeks and dawn chorus. |
| Celesta | M | Done, for the next release: Timoshenko steel bars over tuned wooden boxes, felt hammers and dampers. |
| Steel pan | M | Done, for the next release: the Steel Pan, note areas tuned to octave and twelfth whose domes couple their modes, ringing along with their neighbours in a fourths-and-fifths layout. |
| Early Universe | M | Done, for the next release: the photon–baryon plasma's sound waves, the CMB's acoustic peaks, as each key's harmonics, with a knob per cosmological parameter. |
| Project 8 | M | Done, for the next release: an electron in a magnetic trap heard by its cyclotron radiation, as the Project 8 experiment hears it, chirping sharp as it radiates until it escapes, with the bounce, the gas, krypton and tritium. |
| ABRACADABRA | M | Done, for the next release: the axion dark-matter search as a keyboard, each key a universe whose axion has its mass, heard through ABRACADABRA-10 cm's toroid, pickup and SQUID, the halo's waves swelling and fading over the coherence time. |
| TESS | M | Done, for the next release: exoplanet transits as NASA's TESS sees them, every key a planet whose year is its note and the star's light its waveform, with limb darkening, Kepler's law, the impact parameter and TESS's photon noise. |
| Hydrogen Lamp | M | Done, for the next release: hydrogen's spectrum as a keyboard, every line at its exact ratio to Hα on the key's note, with the radiative cascade in slow motion, a discharge, a nebula or a laser, Stark and Doppler widths, a redshift on the pitch bend and a what-if fine-structure constant. |
| Clavicylinder | M | Done, for the next release: Chladni's iron bars pressed against a turning wet glass cylinder (1800), from his *Beyträge* (1821), with the cloth's stick–slip, regulation to the speaking threshold, and his faults and remedies as presets. |
| Trautonium | M | Done, for the next release: Trautwein's neon-lamp relaxation oscillator on a resistance wire (1930), Sala's four dividers locked by the master's sync pulse (the Mixtur-Trautonium), fixed resonant circuits rung by every flash, one wire with slides or a manual per key, pressure, pitch bend and MPE. |
| Hydraulis | M | Done, for the next release: Ctesibius's water organ, its wind the head of water under a bowl standing in a cistern, capped at the rim where the air bubbles out, filled by pumpers whose effort the mod wheel sets; slides with springs; the Pipe Organ's flue pipes on an ancient bore in four ranks as at Aquincum. |
| Hurdy-Gurdy | M | Done, for the next release: the vielle à roue's rosined wheel bowing two tangent-stopped chanterelles and four drones, the trompette's chien lifting off the soundboard once the wheel's drag beats the tirant (a buzz from a threshold worked out from the string), coups of the wrist on the crank from Space, the pedal, aftertouch, hard keys or a rhythm a turn. |
| Hammered dulcimer or cimbalom | M | |
| Theremin or ondes Martenot | M | Continuous pitch suits MPE. |
| Kalimba (mbira) | S–M | Close to the tine piano. |
| Cristal Baschet or waterphone | M | Friction-driven rods, close to the glass armonica's bowing. |

New ideas go in these tables, with a line in the pull request that adds them.
