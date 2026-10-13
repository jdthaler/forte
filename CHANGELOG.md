# Changelog

Forte and each instrument have their own [semantic version](https://semver.org).
Forte's version covers the site and the shared code (`shared/`, the
landing page and the tools). An instrument's version covers its folder,
its tests and its demos. Everything is pre-release (0.x) for now, so any
release may change the sound or the parameters.

Each release is tagged in git as `forte-vX.Y.Z` or `<instrument>-vX.Y.Z`,
for example `piano-v0.1.0`.

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
