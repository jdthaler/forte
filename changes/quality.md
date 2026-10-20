# a Quality setting for phones and older computers

### Forte (minor)
- **Quality** (High, Medium, Low) on every instrument page and in every plugin, for phones and
  older computers: High plays all the physics, exactly as before; Medium and Low play less of
  what costs the most and is heard the least (fewer voices at once, fewer partials or modes,
  the sympathetic strings lighter or off). On the pages it is the CPU group at the end of the
  controls: one choice for every instrument in the browser, which presets and links leave
  alone. When the audio starts to drop out, the page suggests a lower setting.
- In the plugins Quality is a parameter of its own after the velocity curve, kept with the
  project and in no preset; the Forte app keeps it when you change instrument. A VST3 or CLAP
  host that renders offline (a bounce, a freeze) gets High whatever it is set to.
- `node tools/bench.mjs [slug…]` measures each instrument's engine at each Quality;
  `test/quality-tests.mjs` checks every instrument's High is unchanged to the bit and its Medium
  and Low still play the passage; `tools/check-pages.mjs` checks every page has the choice and
  can change it while the audio plays. The template's engine plays fewer bars at once at Low,
  as an example for new instruments.

### Ribbon Piano (minor)
- **Quality:** Medium builds each voice with fewer modes (none above 7 kHz but each family's
  first eight, none past the 80th partial), lowers the oscillator budget to 60 %, lets an
  undamped voice go a little sooner and keeps three partials on each sympathetic string; Low
  stops at 5 kHz, a 35 % budget, and turns the sympathetic strings off. About 60 % and 30 % of
  High's work.

### Electric Grand (minor)
- **Quality:** Medium strikes fewer partials (none above 6 kHz but the first eight, none past the
  80th), lets fading ones go sooner, caps the oscillators at 2400 (the page's own adaptive budget
  still works under it) and keeps three partials on each sympathetic string; Low stops at
  4.5 kHz, caps at 1400 and turns the sympathetic strings off. About 55 % and 27 % of High's work.

### Harpsichord (minor)
- **Quality:** Medium plays 12 released and 16 sounding keys at most (High 16 and 24), fewer
  partials (none above 7 kHz but the first sixteen, none past the 64th) and three partials on
  each sympathetic string; Low 8 and 10 keys, 5 kHz, and no sympathetic strings. About 60 % and
  30 % of High's work.

### Tangent Clavier (minor)
- **Quality:** at most 16 voices at Medium and 10 at Low (24 at High); a single note sounds the
  same at every quality.

### Gong Keyboard (minor)
- **Quality:** at most two gongs on the nonlinear coupling at Medium and one at Low (never more
  than *Nonlinear voices*), 12 and 8 gongs at once (16 at High), a gong let go 60 dB under the
  loudest, and at Low one gong at a time taking extra substeps. About 57 % and 36 % of High's work.

### Star Keyboard (minor)
- **Quality:** Medium plays each star's strongest 60 % of modes and Low its strongest 40 %, as
  the observer hears them, raised to keep the note's level; 11 and 8 stars at once (14 at High).
  About 48 % and 25 % of High's work.

### Spring Keyboard (minor)
- **Quality:** a mode is let go 65 dB (Medium) or 60 dB (Low) under the voice's loudest (90 at
  High), and a strike doesn't start modes it would leave below that; 10 and 6 keys at once (16 at
  High). About 55 % and 36 % of High's work.

### Quantum Keyboard (minor)
- **Quality:** a pair budget of 1500 at Medium and 800 at Low (3000 at High), 14 and 9 voices
  (24), and a new note's pairs 50 or 40 dB under its strongest left out. About 61 % and 35 % of
  High's work.

### Black-Hole Keyboard (minor)
- **Quality:** at most 24 ringdowns at Medium and 12 at Low (48 at High); a note alone sounds
  the same at every quality.

### Bubble Organ (minor)
- **Quality:** at most 80 bubbles ringing at Medium and 50 at Low (160 at High), each freed 70 or
  60 dB under its peak (80 at High).

### Viola Organista (minor)
- **Quality:** with the dampers lifted the sympathetic strings ring from C2 to B3 at Medium and
  not at all at Low (C2–C6 at High); the soundboard runs at half rate and released strings stop
  sooner. A held note bows as at High, in pitch and in kind.

### Glass Armonica (minor)
- **Quality:** three mode families a bowl at Medium and two at Low, 24 and 16 bowls at once (only
  released ones are let go, never a touched one), quiet bowls stopped sooner, and a leaner
  friction solver.

### Wind Harp (minor)
- **Quality:** 8 strings at Medium and 6 at Low ring once released (held and pedalled strings
  always sound), and released strings stop sooner. A held string sounds as at High.

### Tine Piano (minor)
- **Quality:** a mode 60 dB under its voice's strongest stops being worked out, a voice ends 60 dB
  under its loudest, and 16 voices (Medium) or 10 (Low) sound at once (40 at High); at Low the
  keys below C6 run at the output rate. About 65 % and 38 % of High's work, and far less with
  long pedalled notes.
- Its output stage works out the drive and decimation once instead of twice when the vibrato is
  off: the same samples, a little cheaper.

### Sticky-Pad Piano (minor)
- **Quality:** 16 voices at Medium and 10 at Low (40 at High), a reed rested 70 or 60 dB under its
  loudest, and at Low no reed modes above 12 kHz.

### Reed Piano (minor)
- **Quality:** the reeds run at the output rate instead of twice it, without modes above 16 kHz,
  pruned as they decay (80 dB down at Medium, 60 at Low); 20 and 10 voices (32 at High). About
  40 % and 28 % of High's work.

### Free-Reed Organ (minor)
- **Quality:** 8 keys at once at Medium and 5 at Low (16 at High); every reed that sounds is
  played in full.

### Pipe Organ (minor)
- **Quality:** each pipe keeps at most eight modes up to 10 kHz at Medium and five up to 7 kHz at
  Low (ten up to 15 kHz at High), and 12 and 8 keys sound at once (20). About 66 % and 44 % of
  High's work.

### Carillon (minor)
- **Quality:** a bell leaves out its modes above 16 kHz (Medium) or 12 kHz (Low), lets a mode go
  70 or 60 dB under its loudest, and 24 or 12 bells ring at once (36 at High). About 55 % and
  34 % of High's work.

### RF Cavity Bells (minor)
- **Quality:** a bunch rings only the modes heard within 40 dB (Medium) or 30 dB (Low) of the
  cavity's loudest, modes and keys are let go sooner, and 16 or 8 keys sound at once (24 at
  High). About 51 % and 27 % of High's work.

### Vibraphone (minor)
- **Quality:** modes above 16 kHz (Medium) or 12 kHz (Low) are left out, a bar is let go at −70 or
  −60 dB, and 12 or 8 bars ring at once (16 at High).

### Celesta (minor)
- **Quality:** modes above 16 kHz (Medium) or 12 kHz (Low) are left out, a bar is let go at −70 or
  −60 dB, and 16 or 10 bars ring at once (24 at High).

### Steel Pan (minor)
- **Quality:** a stroke rings at most eight modes at Medium and six at Low (twelve at High), the
  three tuned ones always among them, and notes go quiet sooner.

### Kalimba (minor)
- **Quality:** a tine is let go at −80 dB (Medium) or −60 dB (Low), and past 32 or 16 ringing
  tines the oldest is stilled.

### Storage Ring (minor)
- **Quality:** past 24 (Medium) or 12 (Low) beams stored under the pedal, the oldest is scraped
  away; a single beam sounds the same at every quality.
