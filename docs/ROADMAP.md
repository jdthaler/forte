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
| MPE (per-note pitch bend and slide) | M | The engines already take per-key pressure. |
| Alternative tunings and temperaments | M | Equal, well-tempered, meantone, just intonation; Scala files; A4 other than 440 Hz. |
| Transpose and octave controls on every page and plugin | S | |
| Split and layer two instruments | M | Most useful in the Forte app and on the site. |

### Sound

| Idea | Size | Notes |
|------|------|-------|
| Save your own presets | M | Done, for the next release: in the Presets menu on every page (kept in the browser, saved to and opened from a file) and in the plugins' window (files in a presets folder per instrument, the same format). |
| A choice of rooms (reverb) | M | Done, for the next release: a Venue choice on every page and plugin (Studio, Room, Recital hall, Concert hall, Cathedral), Room, the original, the default. |
| Morph between two presets | S–M | |
| Quality or CPU setting | S–M | Fewer modes or voices, for phones and old laptops. |

### The site

| Idea | Size | Notes |
|------|------|-------|
| Record and download what you play (WAV) | S–M | |
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
| Sympathetic resonance on the Ribbon Piano, Electric Grand and Harpsichord | M | **Before 1.0.** Undamped strings ring along through the bridge. Costs CPU. |
| The Tonewheel Organ's key scaling, preamp response and computed tonewheel waveform | S–M | Done, for the next release: the B-3's resistance wires, wheel levels and filters, the swell pedal's shut plate, and a waveform from the tooth and pickup (*Tooth relief* replaces *Wheel harmonics*). |
| Companion modes on the Gong Keyboard | M | **Before 1.0.** Beating, drifting nodal lines and travelling waves. Doubles the modes. |
| Resonator tube losses on the Vibraphone | S | Done, for the next release: boundary-layer losses on the shaft, the disc (growing as it closes) and the bottom plug, 14 % more than the walls alone at F3. The bass's pitch wobble moved by under 2 ¢, so a leaking plug or the tube's wall vibrating would have to be what makes real tubes broader, if they are. |
| Spheroidal harmonics on the Black-Hole Keyboard | S–M | **Before 1.0.** Mode mixing at high spin. |
| The Harpsichord's second polarisation after release | S–M | **Before 1.0** if wanted: the two-stage decay of a plucked string. |
| An immovable clamped rim on the Gong Keyboard | L | **Before 1.0** if wanted: the clamped plate's nonlinearity is about 3× too weak. Needs a new Airy basis. |
| The Tonewheel Organ's lower manual and pedals | M | A MIDI channel or a split each. |
| A pedal division on the Pipe Organ | M | |
| The Electric Grand's tremolo | S | |

### New instruments

| Idea | Size | Notes |
|------|------|-------|
| RF Cavity Bells, Collider Showers | M each | RF Cavity Bells: done, for the next release. Collider Showers is the accelerator idea still left over from the Storage Ring. |
| Celesta | M | Done, for the next release: Timoshenko steel bars over tuned wooden boxes, felt hammers and dampers. |
| Steel pan | M | Coupled notes on one shell. |
| Hammered dulcimer or cimbalom | M | |
| Theremin or ondes Martenot | M | Continuous pitch suits MPE. |
| Kalimba (mbira) | S–M | Close to the tine piano. |
| Cristal Baschet or waterphone | M | Friction-driven rods, close to the glass armonica's bowing. |

New ideas go in these tables, with a line in the pull request that adds them.
