# RF Cavity Bells

### RF Cavity Bells (new)
- New instrument: a superconducting accelerator cavity for every key, A0–C8, rung by the bunch
  that crosses it. Nine coupled pillbox cells (TESLA's cavity) make a passband of nine modes,
  ω = ω_c/√(1 + k cos φ) (Nagle, Knapp & Knapp 1967), whose accelerating π mode is the note; the
  higher-order modes (TM011, TM110, TM111, TM012, TM020, TM120) stand at the pillbox's
  Bessel-zero ratios, a bell's inharmonic partials. The tests check the Bessel zeros, the coupled
  cells' eigenproblem solved as a matrix, the transit-time integral and the stored energy
  integrated over the cell.
- **The bunch:** velocity is its charge; its speed against the cells' design speed keeps it in
  step with the π mode or rings the rest of the passband, which beats; its length weighs the
  modes by the Gaussian form factor; off the axis (the mod wheel) it rings the dipole modes.
- **Losses:** the input coupler on the first cell, HOM couplers at both ends notched at the
  accelerating passband (trapped modes ring on), and the niobium's BCS surface resistance at the
  helium bath's temperature, fitted to TESLA's 15 nΩ at 2 K and 800 nΩ at 4.2 K; above 9.25 K
  the cavity is a normal metal and only clicks. Letting go pushes the coupler in; the pedal keeps
  it back.
- **Beam loading:** held keys send a bunch train (key pressure adds current) that builds the field
  up to where the losses take what the beam gives; Lorentz-force detuning pulls hard strikes
  flat through the walls' mechanical mode; past the quench field the cavity goes normal, the
  field collapses, and it recovers. Pitch bend is the tuner (±2 semitones).
- Views: the cells in section with their field, the bunch, the Lorentz squeeze and a quench; the
  passband's dispersion curve with every mode's level; spectrum, spectrogram and a table of the
  strongest modes. Nine demos. Plugins and WebAssembly from the start.
