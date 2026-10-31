# the Telharmonium

### Telharmonium (new)
- **Thaddeus Cahill's Telharmonium (1906), the electric music plant on Broadway**, in the electric section: alternators on twelve pitch-shafts geared to one motor (or the eight built in 1906, whose missing keys played the just thirds of A, D, E and G), each key's harmonics the alternators with two to eight times its teeth on its own shaft, so keys that share an alternator share its wave, in phase.
- **The circuits:** every winding is a circuit of one time constant L/R, so each relay's closing leaves an offset that decays (the thump that began every note), and its contacts slide home over a few milliseconds while the current follows them. Each manual's eight harmonic buses carry stops of induction coils, and the notes on a bus share its load: a chord robs its own notes, more so on soft stops.
- **The motor** sags flat under the load with the flywheel's time constant and comes back as the notes let go; pitch bend turns its field rheostat.
- **Down the line:** each manual's music goes out on its own telephone line, the telegrapher's line solved exactly (city cable or open wire on poles, up to 250 km), to a receiver whose magnet pulls a clamped soft-iron diaphragm (Cahill's thin one near 1 kHz, or Arthur Cahill's near 300 Hz) with the square of the flux, so loud bass growls and harmonics without their ground tone bring it back, through a paper horn that resonates on every c/2L.
- Pierce's intonation takes thirds and sevenths just from a held key's shaft; key touch, aftertouch and the swell pedal (CC11, the mod wheel).
- The page draws the shafts and their alternators in use, every bus's current against a lone note's, the line's and the receiver's response under the focused key's harmonics, the key's alternator and harmonics, the spectrum and the spectrogram. Seventeen presets, eight demos, the plugin (AU code Telh).

### Forte (patch)
- `tools/gen-native-params.mjs` refuses an instrument parameter named `preset`, `touch`, `quality` or `mpe`, the ids the plugins save their own parameters under.
