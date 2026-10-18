# the tonewheel organ's B-3 levels, filters, waveform and swell

### Tonewheel Organ (minor)
- **Key scaling:** every key's nine contacts feed their busbars through the B-3's resistance
  wires (six gauges, 10.5–103.5 Ω, from a measured B-3), so the upper drawbars are loud in the bass
  and taper off by 10–20 dB in the treble while the 8′ stays even. The 16′ folds back in the
  bottom octave, as on a B-3.
- **Wheel levels and filters:** each wheel's output follows measured B-3 and C-3 levels (about
  18 dB from the bottom wheel to the top), and wheels 44–91 pass through their reactor or tuned
  filter, which strips their harmonics and most of the crosstalk. *Filter capacitor drift*
  detunes the filters as aged capacitors do.
- **A computed waveform:** the tooth and pickup give each wheel its 2nd and 3rd harmonics
  (*Tooth relief*), strongest on the coarse bass wheels. It replaces *Wheel harmonics*.
- **The swell pedal keeps the bass:** shut, it lets through a low-passed share of the signal, as the
  AO-28's vane does, so the treble falls by up to 40 dB and the bass by about 25.
- *Levels* (B-3 or Flat) turns the levels, filters and wiring off, for an even keyboard.
- The parameter `wheelHarm` is gone, so songs saved with earlier organ plugins lose that one
  value. The tests' saved 0.6.0 state is removed and the 0.7.0 one saved again with today's
  parameters, since neither loads in full any more.
- The views' table shows each tone's level through its wire.
