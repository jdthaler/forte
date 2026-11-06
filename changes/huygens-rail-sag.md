# Huygens keeps playing under heavy rail sag

### Huygens Keyboard (minor)
- **Rail-sag coupling no longer goes silent under a big chord:** with the sag on, a chord with many high keys, or keys bent far up by MPE (a Seaboard RISE's ±48 semitones), drew more current than the rail's explicit step could follow, and the rail overshot further each sample until the output was NaN and the keyboard fell silent. The rail is now solved each sample with its load (every key's resistor), so it settles where source and keys balance however heavy the load.
- **The regulator follows the load:** it raises the source by the sag the averaged load would cause, so the rail averages the supply's setpoint at any load. Before, under a heavy load it caught up over seconds and the pitch hold swung the pitch by an octave or more meanwhile. The pitch hold is now bounded to an octave either way.
- The Rail sag only preset's release is about 1 dB different; the other presets are unchanged.
