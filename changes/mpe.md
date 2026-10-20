# MPE: each note bends and slides on its own

### Forte (minor)
- **MPE (MIDI Polyphonic Expression)** on every page and in every plugin: a controller that gives
  each note a channel of its own (a ROLI Seaboard, a LinnStrument, an Expressive E Osmose) bends,
  slides (CC74) and presses each note alone, wherever the instrument can. Lower and upper zones,
  the MPE Configuration Message, ±48 semitones per note until RPN 0 sets another range; a bend
  follows the keyboard's tuning, so a slide onto the next key lands on its tuned pitch.
- **An MPE menu** beside Enable MIDI (Auto, On, Off; not on phones) and an *MPE* plugin parameter
  (the same three, saved with the song). Auto, the default, turns MPE on only when the controller
  announces it, so an ordinary keyboard and saved songs play as before; a toast says when it
  turns on.
- **The plugins take CLAP's per-note expressions** (tuning, brightness, pressure), and the VST3
  asks for 16 MIDI channels and those note expressions.
- **Pitch bend and channel pressure reach the AU plugins:** clap-wrapper hands them on as
  expressions for every note, which the plugins used to drop, so the wheel did nothing in Logic
  or MainStage.
- **The engine contract** gains `noteBend(ratio, key)` and `slide(value, key)`
  (`forte/expression.h` keeps them per key), and each descriptor says what its notes do with
  them (`mpe: { bend, slide }`); `test/mpe-tests.mjs` checks every instrument against it.

### Tine Piano (minor)
- **Per-note bend, ±4 octaves:** a key's tuning spring slides alone, as the wheel slides them all.
- **The page passes the pitch wheel on**, which it used to drop.

### Reed Piano (minor)
- **Per-note bend, ±4 octaves:** one reed stiffens or softens alone, as the wheel does them all.

### Sticky-Pad Piano (minor)
- **Per-note bend, an octave either way:** one reed alone; further down it would swing into the
  pickup's pole piece.

### Tangent Clavier (minor)
- **Per-note bend presses that key harder**, as the wheel presses them all: up only, as far as
  the wheel at full.

### Free-Reed Organ (minor)
- **Per-note bend, an octave either way:** one key's tongues stiffen or soften alone. Further, its
  throat and cell no longer drive the reed.

### Pipe Organ (minor)
- **Per-note bend, an octave either way:** the air in one key's pipes warms or cools alone.

### Viola Organista (minor)
- **Per-note bend, an octave either way:** one key's bridge slides alone, its string staying in
  Helmholtz motion.

### Glass Armonica (minor)
- **Per-note bend, ±4 octaves:** one bowl's glass stiffens or softens alone.

### Wind Harp (minor)
- **Per-note bend, an octave either way:** one key's strings tighten or slacken alone; a string
  bent out of its band moves to the harmonic the wake picks.

### Bubble Organ (minor)
- **Per-note bend, ±2 octaves, from the next bubble on**, and **per-note slide: each nozzle's own
  bubble rate.**

### Singing Arc (minor)
- **Per-note bend, an octave either way:** one coil's iron core slides alone. With one arc it
  follows its newest key, as it plays.

### Pyrophone (minor)
- **Per-note bend, ±4 octaves** (one tube's gas heats or cools alone) and **per-note slide: each
  tube's own flame power.**

### RF Cavity Bells (minor)
- **Per-note bend, ±4 octaves** (one cavity squeezed alone, its bunch train keeping step) and
  **per-note slide: each cavity's own beam offset.** A mode bent past the Nyquist frequency takes
  no kick.

### Celesta (minor)
- **Per-note slide: each key's own hammer felt**, taken as the hammer is thrown.

### Gong Keyboard (minor)
- **Per-note slide: where each key's mallet lands**, taken as it strikes.

### Steel Pan (minor)
- **Per-note slide: each note's own roll.**

### Huygens Keyboard (minor)
- **Per-note bend, ±4 octaves:** one lamp's timing resistor turns alone; the pitch servo holds a
  bent lamp at its bent pitch.

### Storage Ring (minor)
- **Per-note slide: each key's own ring's chromaticity.**

### Star Keyboard (minor)
- **Per-note slide: each key's own star's spin.**

### Quantum Keyboard (minor)
- **Per-note slide: each key's own well's dephasing.**

### Black-Hole Keyboard (minor)
- **Per-note slide: each key's own black hole's spin**, taken at the strike.

### Spring Keyboard (minor)
- **Per-note slide: a hand on each key's own springs.**

### Tonewheel Organ (patch)
- **An MPE controller's member channels no longer bend the whole organ**: one generator shaft
  turns every wheel, so its notes cannot bend alone.
