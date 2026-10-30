# Hydraulis

### Hydraulis (new)
- New instrument, in the traditional section: the water organ of Ctesibius (3rd century BC), as
  Hero and Vitruvius describe it and the organs of Dion and Aquincum show it. Two octaves, G3–G5,
  with Full range for A0–C8.
- **The wind:** pumpers push air through their pistons' valves into a bronze bowl standing upside
  down in a cistern. The head of water between inside and outside is the wind, p = ρg·ΔV(1/A_in +
  1/A_out), capped where the water inside reaches the rim and the air bubbles out, each bubble
  ringing at its Minnaert frequency. The water under the rim bounces on the air shut in the bowl
  and chest (about 2.6 Hz) when a key opens or a stroke starts. A pump gives more as the wind
  sags, no faster than the pumpers' pace; tired pumpers let it sag under chords and the pipes
  droop, eager ones overfill the bowl and it gurgles.
- **The slides:** each key pushes a perforated slide whose holes open as two overlapping circles,
  as fast as the velocity says, and a preloaded spring pulls it back.
- **The pipes:** the Pipe Organ's flue pipes on an ancient, nearly constant bore, in four ranks
  as at Aquincum: open, stopped, stopped an octave below and stopped an octave above, each with
  its stopcock. Each pipe is cut to sound its note (tools/hydraulis-tuning.mjs).
- Playing: the mod wheel and key pressure make the pumpers work harder; MPE bends; pumping effort
  on the hardware strip.
- Views: the cistern and the pumps as they move, the wind over the last eight seconds, the four
  ranks lighting on their slides, the spectrum and the spectrogram.
- Sixteen presets, six demos, and the plugins (AU code `Hdls`).

### Pipe Organ (patch)
- The flue pipe moves to its own files (native/instruments/pipes/pipes-flue.h), shared with the
  Hydraulis. The sound is the same, to the bit.

### Forte (patch)
- tools/pipes-tuning.mjs exports its pitch measurement for tools/hydraulis-tuning.mjs.
