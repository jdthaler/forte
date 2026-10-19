# sympathetic strings: undamped strings ring along

### Ribbon Piano (minor)
- **Sympathetic resonance:** every key whose damper is up (the pedal down, the key held, the
  undamped treble) rings along through the bridge with whatever sounds, and gives back what it
  takes. Each key is its unison's lowest 16 partials below 4 kHz, driven by every other string's
  bridge velocity and never by its own voice. Hold C4 and strike C3: C4 rings along about a
  thousand times as strongly as C♯4 would, about 30 dB under the attack. With the pedal down it
  costs about one and a half times what four sustained notes cost; with it up, almost nothing.
- New slider *Sympathetic resonance* under *Damping & bridge*, 25 % by default (parameter
  `sympathy`): the share of the bridge's motion one string feels from another. 0 turns it off.
- The page hands every key's strings to the engine in the background, so they are ready before
  the pedal goes down.

### Electric Grand (minor)
- **Sympathetic resonance:** every key whose damper is up (the pedal down, the key held, the keys
  above E6) rings along through the bridge, heard by the piezo and the soundboard alike. On the
  iron frame it is faint, as on a real CP-70; on the soundboard it is about 14 times stronger.
  Coincident partials ring along about 90 times as strongly as others. With the pedal down it
  costs about twice what four sustained notes cost.
- New slider *Sympathetic resonance* under *Action*, 25 % by default (parameter `sympathy`).

### Harpsichord (minor)
- **Sympathetic resonance:** while a key is held, its strings whose jacks have risen ring along
  with the strings that sound, whether their row plucks or not: on the lower manual with the 4′
  off, a held key's 4′ string still sounds an octave up. A key's two 8′ strings drive each other
  too, so a held note's fundamental decays a little faster (Weinreich's coupled unison).
- New slider *Sympathetic resonance* under *Strings and tuning*, 25 % by default (parameter
  `sympathy`).
- Fixed: once a bridge segment fell silent (the 4′'s, after its strings stopped), the soundboard's
  filters there decayed into subnormal numbers and the page's CPU climbed several times over.
