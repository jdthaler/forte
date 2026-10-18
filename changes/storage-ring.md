# storage ring

### Storage Ring (new)
- New instrument: a particle accelerator's storage ring for every key, C2–C7, heard through a
  beam pickup. The bunch passes the pickup once a turn, so the revolution frequency is the
  note, and its Gaussian length sets the harmonics' roll-off, exp(−(2πnσ)²/2).
- **Betatron oscillation:** injection kicks the bunch off orbit, and the pickup hears its
  oscillation as sidebands at (n ± Q)·f_rev. It decoheres through the chromaticity and recoheres
  every synchrotron period, exp(−2(Q′σδ/Qs)² sin²(πQsN)), and through the octupoles' amplitude
  detuning, which never comes back (Meller, Chao, Peterson, Peggs & Furman 1987); the tests
  check both formulas against particles tracked turn by turn.
- **RF:** an injection phase error is a vibrato at the synchrotron frequency; key pressure
  raises the RF voltage (fs ∝ √V, the bunch shortens as V^(−¼)); radiation damps it all.
- Two buttons on the two channels, one button, or their difference; the mod wheel turns up the
  chromaticity; the pedal keeps released beams stored. Views: the bunch in phase space and the
  pickup's reading turn by turn. Plugins and WebAssembly from the start.
