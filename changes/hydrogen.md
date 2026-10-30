# Hydrogen Lamp

### Hydrogen Lamp (new)
- New instrument: a tube of glowing hydrogen as a keyboard. Every key plays the tube's spectrum,
  each line at its exact frequency ratio to Hα, with Hα on the key's note: Hβ 27/20 above it, the
  Balmer series crowding up to a just minor seventh, the Lyman series two octaves and a fourth up,
  the infrared series below.
- **The atom:** every level to n = 50 and every l (1275 states, 40 425 dipole transitions), with
  Einstein coefficients from the exact radial integrals (NIST's to the digits it gives), the 2s
  level's two-photon decay, and the radiative cascade from level to level down to 1s.
- **The excitation:** a discharge (van Regemorter's electron collisions from the ground state), a
  nebula's recombination (coefficients computed from Coulomb functions in
  `tools/hydrogen-native-table.mjs`, matching Storey & Hummer's; Case B's Balmer decrement 2.83
  against their 2.86), or a laser into one np level. Case A or B: the Lyman lines escaping or
  trapped.
- **The cascade in slow motion:** a key switches the excitation on and its release off; the
  atoms' time runs 3 × 10⁷ times slower (a knob), so the low lines light first and the high ones
  after, and the light fades as the levels empty. A *Time in the glow* drains every level.
- **The widths:** each line a Lorentzian as wide as its levels' lifetimes in slow motion (the
  atoms' light as a random process), plus Doppler widths from the temperature and Stark widths
  from the density (Holtsmark's field, set by Hβ's measured width and checked against Inglis and
  Teller's limit); the mod wheel is the density.
- **The spectrometer:** a window (visible, ultraviolet, infrared or every line), pitch bend as a
  redshift (MPE: each lamp's own, and with CC74 its own density), and a what-if fine-structure
  constant up to 40 times the real one, which splits each line into Dirac's components.
- Views: a spectroscope (the lines at their wavelengths, in their colours, lit as they sound) and
  the energy levels, lit by their populations, with the lines heard between them; the spectrum and
  the spectrogram.
- Eleven presets, eight demos, and the plugins (AU code `Hydr`).
