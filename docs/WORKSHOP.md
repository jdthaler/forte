# The workshop: instruments waiting to be built

These instruments are listed in `shared/registry.js` with `ready: false`, so
they show on the landing page and in the menus as "in the workshop". Each
section below is a build brief: the physics, the effects that should be
playable, suggested controls and views, what the tests should check against,
and the traps.

To build one, follow [INSTRUMENT_GUIDE.md](INSTRUMENT_GUIDE.md):

```bash
node tools/new-instrument.mjs <slug> <EngineName> "<Name>"
```

Use the slug and name from the registry. Lessons from the first fourteen
instruments:

* **Test combinations of extreme settings at 44.1 and 48 kHz**, not one
  knob at a time. Most NaNs and blow-ups the review found needed two knobs
  at their limits.
* **Smooth every live control per sample** (gains, pans, cutoffs), or it
  zippers.
* **Re-striking a sounding key must not create a second voice** for the
  same string, reed or bar.
* **Voice stealing must fade**, and must never take a voice that hasn't
  sounded yet.
* **Self-oscillating instruments must speak on every key at the default
  touch.** Measure their onset times.
* **Check every README number against the code** before committing.
* **Going live:**
  - set `ready: true, version: '0.1.0'`;
  - run `node tools/loudness.mjs` and set the suggested `trim`;
  - add a `CHANGELOG.md` entry;
  - `npm test` (the site and level tests check all of this);
  - browser-check the page at desktop and iPad sizes.

---

## Harpsichord (`harpsichord`)

*After the Flemish double-manual harpsichord (Ruckers, 1600s).*

**Physics.**
- **Strings:** stiff, in modal form, with brass in the bass and iron above.
  Reuse the approach in `piano/src/physics.js`.
- **The pluck:** each key lifts a jack whose quill (a plectrum: an elastic
  cantilever of bird quill or Delrin) catches the string, bends, slides
  along it and slips off. Model it as a contact with friction between a
  cantilever tip and the string: the string is displaced until the
  plectrum's tip slides past. Release point, plectrum stiffness and pluck
  position set the spectrum. The comb filter from the pluck point is a
  defining sound.
- **On release:** the jack falls back. The plectrum's tongue pivots so it
  passes the string, which gives a small "re-pluck" scrape. Then the felt
  damper lands.

**Playable effects.**
- Registration: 8′ and 4′ choirs, and the two manuals coupled.
- The **buff (lute) stop:** leather pads touching the strings near the nut
  damp the high partials.
- The **lute stop:** a row of jacks plucking very near the nut, which is
  nasal.
- Plectrum material (quill versus Delrin) and voicing (stiffness).
- Velocity barely matters: a real harpsichord has almost no dynamics. Say
  so on the page, and let the release thump depend on how fast the key
  comes up.

**Views.**
- Slow motion of the jack, plectrum and string at the pluck.
- The comb-filter spectrum for the current pluck point.

**Tests.**
- Plucked-string Fourier amplitudes ∝ sin(nπx_p/L)/n² for an ideal pluck
  (the limit of an infinitely stiff, frictionless plectrum).
- Inharmonicity B against the string's diameter and tension.
- Energy given to the string equals the plectrum's work.
- The release time scales with plectrum stiffness.

**Sources.**
- N. H. Fletcher, "Analysis of the design and performance of
  harpsichords", *Acustica* 37 (1977).
- Griffel, "The harpsichord plectrum: a model" (1994).
- Penttinen et al., harpsichord modelling (2006).

**Traps.** The slip is a discontinuity: solve the contact implicitly, as
the clavier's contacts do (`clavier/src/clavier-engine.js`).

---

## Pipe Organ (`pipes`)

*After the Baroque pipe organ.*

**Physics.**
- **Flue pipes:** a planar air jet from the flue crosses the mouth and hits
  the labium (upper lip). The pipe's acoustic flow deflects the jet, and the
  jet drives the pipe. The jet-drive model (Fletcher; Verge; Fabre &
  Hirschberg) is a delayed nonlinear feedback loop:
  - jet transit delay τ ≈ W/(0.4 U_j);
  - tanh deflection;
  - pipe resonator as modes or a waveguide.
- **The chiff:** while the jet is establishing itself, edge tones and upper
  modes sound first.
- **Overblowing:** too much wind pressure jumps the pipe to its octave (open
  pipes) or twelfth (stopped pipes).
- **Shared wind:** the wind chest and reservoir have finite volume and a
  regulator. Big chords make the pressure sag and the pitch drop slightly:
  "wind sag", which organists know as a living wind.

**Playable effects.**
- Stops: Principal 8′ and 4′, Gedackt 8′ (stopped), Mixture (several ranks
  at octaves and fifths).
- Wind pressure, mouth cut-up, and chiff (jet delay).
- Wind-system stiffness from stable to "breathing".
- Optional tremulant (a valve modulating the wind).

**Views.**
- The jet waving in the mouth.
- Pressure and flow phase portrait.
- Wind-chest pressure over time.

**Tests.**
- Open versus stopped pipe mode ratios (1:2:3 versus 1:3:5) and end
  corrections (0.6 a + 0.85 a).
- The jet-delay condition for speaking: Strouhal-number range.
- Overblowing threshold rises with jet velocity.
- The wind-sag pitch drop matches the pressure drop through
  f ∝ √(p) (approximately, for the jet).

**Sources.**
- Fletcher & Rossing, *The Physics of Musical Instruments*, ch. 16–17.
- Verge et al. 1997 (JASA).
- Fabre, Gilbert, Hirschberg & Pelorson, "Aeroacoustics of musical
  instruments", *Annu. Rev. Fluid Mech.* 44 (2012).

**Traps.** Jet models self-oscillate only in a window. Test speaking and
onset on every key at the default wind.

---

## Carillon (`carillon`)

*After the Flemish carillon (Hemony bells, 1650s).*

**Physics.**
- **Bell modes:** an axisymmetric shell of a real bell profile, solved by FEM
  (axisymmetric shell elements, Fourier index m). It gives the named
  partials: hum, prime (fundamental), tierce (minor third), quint,
  nominal, and so on.
- **The strike note:** the perceived pitch comes from the nominal group
  (partials near 2:3:4 relative to it) and lies about an octave below the
  nominal. It is a virtual pitch that isn't in the spectrum.
- **Asymmetry:** small departures from perfect symmetry split each (m ≥ 2)
  pair into doublets, which beat (warble).
- **The clapper:** Hertz contact with the soundbow, played by batons on a
  carillon console.

**Playable effects.**
- **Bell profile:** minor-third (traditional) versus major-third (Eijsbouts
  1999, designed by FEM).
- Doublet split, clapper hardness, strike point.
- Tuning by the profile, versus "out of tune" historic bells.

**Views.**
- The bell profile with the shape of the mode under the cursor.
- The partial table with names and cents against ideal.
- A strike-note readout from a virtual-pitch estimator (Terhardt /
  subharmonic sieve).

**Tests.**
- FEM convergence.
- Published partial ratios for a minor-third bell: hum 0.5, prime 1, tierce
  1.2, quint 1.5, nominal 2 (Hemony tuning targets).
- Doublet splitting ∝ the asymmetry.
- The virtual-pitch estimator finds the strike note on standard bells.

**Sources.**
- Rossing, *Science of Percussion Instruments*.
- Perrin, Charnley & DePont, "Normal modes of the modern English church
  bell", *J. Sound Vib.* 90 (1983).
- Lehr, the major-third bell (Eijsbouts).

**Traps.** Shell FEM needs care with shear locking. Use a validated
element, or Rayleigh–Ritz with the profile as a thin shell.

---

## Vibraphone (`vibraphone`)

*After the Deagan vibraharp (1927).*

**Physics.**
- **Bars:** aluminium bars undercut so modes 1, 2 and 3 sit at 1 : 4 : 10.
  Optimise the undercut shape with an Euler–Bernoulli or Timoshenko FEM.
- **Resonators:** a closed quarter-wave tube under each bar, coupled to the
  bar through the air gap (a two-oscillator model: bar mode plus tube
  mode). Energy beats between bar and tube. The tube lengthens the radiated
  tone and shortens the bar's ring.
- **The motor:** rotating butterfly discs at the tube mouths periodically
  open and close the coupling. That is the vibraphone tremolo, with both
  amplitude and a little frequency modulation, and a phase that differs bar
  to bar along the shaft.
- **Damper pedal:** a felt bar.
- **Celesta variant (optional):** steel bars over wooden Helmholtz
  resonators, struck by a piano action.

**Playable effects.**
- Motor speed (and off).
- Disc phase.
- Mallet hardness.
- Undercut voicing (pure 1:4:10 versus a plain bar's 1 : 2.76 : 5.40).
- Damper pedal.

**Views.**
- The bar's mode shapes and undercut profile.
- The tube's standing wave.
- Disc angle against coupling.

**Tests.**
- A plain bar reproduces free–free beam ratios (the template already
  does).
- The undercut optimiser reaches 1 : 4 : 10 within 1 ¢.
- Coupled bar–tube mode splitting matches the two-oscillator formula.
- The tremolo rate equals the motor's revolutions times the discs per
  revolution.

**Sources.**
- Rossing, *Science of Percussion Instruments*.
- Bork, "Practical tuning of xylophone bars and resonators", *Applied
  Acoustics* 46 (1995).

---

## Free-Reed Organ (`harmonium`)

*After the harmonium and the accordion.*

**Physics.**
- **The reed:** a brass reed (a cantilever) swings through a close-fitting
  slot. Air from the bellows flows through the gap, and the flow and
  pressure difference drive the reed: a self-excited valve, "blown-closed"
  or "blown-open" in the Fletcher classification.
- **What sets the pitch:** the reed alone, with slight pressure dependence.
  This is unlike the clarinet, where the pipe controls the pitch.
- The slot-gap function (overlap area against displacement) sets the
  timbre. The bellows reservoir has finite volume.
- `huygens/experiments/reed-pipe-engine.js` has a starting point: a reed
  coupled to a pipe.

**Playable effects.**
- **Musette:** two or three reeds per key tuned ±5–20 ¢ apart, which beat.
- Bellows pressure as live expression, on the mod wheel or aftertouch, with
  pitch rising slightly at high pressure.
- **Expression stop:** the harmonium's direct bellows connection.
- Reed-chamber resonance (cassotto in accordions).

**Views.**
- Reed motion in the slot.
- Flow against displacement.
- The beating between the musette reeds.

**Tests.**
- The threshold blowing pressure for oscillation.
- Frequency against pressure (a slight rise).
- Beat rate equals the frequency difference.
- Onset time against pressure.

**Sources.**
- Millot & Cottingham, "Phase-plane analysis of free reeds".
- Cottingham, free-reed papers (JASA, 1990s–2010s).
- Fletcher, "Autonomous vibration of simple pressure-controlled valves in
  gas flows", JASA 93 (1993).

---

## Singing Arc (`arc`)

*After William Duddell's singing arc (1900), which he played from a
keyboard.*

**Physics.**
- **The circuit:** a carbon arc lamp has a negative differential resistance
  (its V–I characteristic falls). A series LC circuit across it oscillates
  at f ≈ 1/(2π√LC), with amplitude set by the arc's nonlinearity. Duddell
  switched capacitors from a keyboard.
- **The sound:** the arc's current modulates its temperature and plasma
  column size. The column's thermal expansion radiates sound directly, so
  the arc is its own loudspeaker. Model it as heat input ∝ i² through a
  thermal time constant, with radiated pressure ∝ d²(volume)/dt².
- **The arc:** use a dynamic arc model with thermal memory (the Mayr or
  Cassie model). It gives hysteresis and the hiss.

**Playable effects.**
- Arc current (bias), L/C ratio (timbre), and electrode gap.
- Hysteresis and "singing" versus "hissing" regimes.
- **The "talking arc":** modulating the supply. This is the historical
  arc-telephony demo.

**Views.**
- The arc's V–I curve with the operating point moving around its loop.
- The circuit with current flow.
- The plasma column's glow brightness ∝ power.

**Tests.**
- Small-signal oscillation condition |R_neg| > circuit loss.
- Frequency against the LC formula, including the shift from arc
  capacitance.
- The Mayr model's hysteresis loop.

**Sources.**
- W. Duddell, "On rapid variations in the current through the direct-current
  arc", *J. IEE* 30 (1900).
- O. Mayr, "Beiträge zur Theorie des statischen und des dynamischen
  Lichtbogens" (1943).

---

## Star Keyboard (`stars`)

*A companion to the black hole.*

**Physics.**
- **Oscillations:** solar-like stars oscillate in p-modes that are
  stochastically excited and damped by near-surface convection. They are
  never struck: each mode is a damped oscillator driven by noise, so
  notes breathe.
- **Frequencies:** asymptotic relation ν_{n,l} ≈ Δν (n + l/2 + ε) − δν_{0l}.
  The large separation Δν ∝ √(mean density), and ν_max ∝ g/√T_eff.
- **Visibility:** l = 0, 1, 2 (and 3), with visibilities depending on
  inclination.
- **Rotation:** splitting into m-multiplets.
- **Red giants:** mixed modes (p–g coupling) with period spacing ΔΠ.
- **Keys:** each key is a star whose mean density puts ν_max (scaled) on
  the note. Mapping real μHz to audio is a fixed speed-up factor; state
  it.

**Playable effects.**
- Star type: main-sequence Sun-like star, subgiant, red giant (mixed
  modes), δ Scuti (driven by the κ-mechanism: coherent, not stochastic).
- Rotation rate.
- Inclination.
- Convective noise level (mode linewidths).
- Pressing a key rather than holding: a "flare" kick.

**Views.**
- The échelle diagram (frequency mod Δν against frequency), live.
- The power spectrum with the Gaussian ν_max envelope.
- A sphere showing the (l, m) pattern.

**Tests.**
- The solar Δν = 135.1 μHz and ν_max ≈ 3090 μHz from the scaling relations
  for solar parameters.
- Stochastic driving: a Lorentzian line with the set linewidth.
- Rotational splitting ∝ Ω(1 − C_nl).
- Échelle ridges are vertical.

**Sources.**
- Aerts, Christensen-Dalsgaard & Kurtz, *Asteroseismology* (2010).
- Chaplin & Miglio, *Annu. Rev. Astron. Astrophys.* 51 (2013).

**Traps.** Notes don't decay while held, so give release a physical
meaning: switching off convective driving lets the modes ring down at their
linewidths.

---

## Wind Harp (`windharp`)

*The Aeolian harp, made playable.*

**Physics.**
- **Excitation:** wind over a string sheds a von Kármán vortex street at
  the Strouhal frequency f_s = St·U/d (St ≈ 0.2). When f_s nears one of the
  string's harmonics, the wake locks onto it (lock-in), and the string sings
  that harmonic, not the fundamental.
- **Model:** the wake-oscillator model (a van der Pol wake variable coupled
  to the string's modes; Facchinetti, de Langre & Biolley, *J. Fluids
  Struct.* 19, 2004) captures lock-in and its hysteresis.

**Playable effects.**
- Each key is a string, or a set of strings tuned in unison.
- Wind speed is the global expression (mod wheel or aftertouch), with gusts
  (filtered noise).
- Raising the wind hops the sounding harmonic up (2nd, 3rd, 4th, …), with
  hysteresis on the way back down.
- String diameter, tension and damping.

**Views.**
- A lock-in map: Strouhal frequency against wind speed over the string's
  harmonics, with the current operating point.
- The vortex street (schematic) and the string shape.

**Tests.**
- The Strouhal relation.
- The lock-in range against the wake-oscillator coupling constants.
- Hysteresis width.
- Harmonic jumps at the predicted wind speeds.

---

## Bubble Organ (`bubbles`)

**Physics.**
- **Pitch:** a gas bubble in a liquid rings at its Minnaert frequency,
  f₀ = (1/2πR)·√(3γp₀/ρ) (≈ 3.3 kHz·mm / R in water). Corrections for
  surface tension and thermal effects follow Devin (1959). Damping is
  thermal, viscous and radiative.
- **Each note:** a bubble pinches off a nozzle and is shock-excited at
  release (Longuet-Higgins), giving a damped chirp. As it rises its depth
  falls, so p₀ and the pitch fall slightly: the "bloop" glide.
- **Keys:** pressing a key releases bubbles of the radius tuned to the
  note. Holding it keeps releasing them at a set rate, with a little
  randomness (the "brook").

**Playable effects.**
- Water depth, tank pressure, gas (air, helium or SF₆ through γ), liquid
  (water or glycerol through ρ and viscosity), release rate, and bubble
  size spread.

**Views.**
- Bubbles rising in a tank, coloured by pitch.
- The damped pressure waveform of the latest bubble.

**Tests.**
- Minnaert's formula.
- Devin's damping constants against published values for air in water.
- Pitch ∝ √p₀ with depth.
- A γ change (helium) shifts pitch by √(γ ratio).

**Sources.**
- Minnaert, *Phil. Mag.* 16 (1933).
- Devin, JASA 31 (1959).
- Leighton, *The Acoustic Bubble* (1994).

---

## Spring Keyboard (`springs`)

**Physics.**
- Waves on a helical spring are strongly dispersive: the flexural, torsional
  and axial families couple. Struck at one end, a pulse disperses into
  chirps that arrive and re-arrive after reflections. That is the "pew" of
  spring reverbs and slinkies.
- **Model:** a helical spring as a thin curved rod (Wittrick's equations), or
  the reduced dispersion relation used in spring-reverb modelling (Parker
  & Bilbao). Use a modal or finite-difference model with the correct
  dispersion.

**Playable effects.**
- Each key is a spring whose coil radius, wire diameter and length set the
  chirp's timing and pitch range, scaled so each key's lowest echo pitch
  or repetition rate lands on the note.
- Damping and coupling of the spring's ends.
- Several springs in parallel, as in spring reverbs.

**Views.**
- A spectrogram of the chirp echoes, live.
- The spring's dispersion curve with group-delay markers.

**Tests.**
- The dispersion relation against Wittrick's.
- Group delay against frequency measured from the engine's impulse
  response.
- Echo spacing equals the round-trip group delay.

**Sources.**
- W. H. Wittrick, "On elastic wave propagation in helical springs", *Int. J.
  Mech. Sci.* 8 (1966).
- J. Parker & S. Bilbao, "Spring reverberation: a physical perspective",
  DAFx (2009).
- S. Bilbao & J. Parker, "A virtual model of spring reverberation", *IEEE
  Trans. ASLP* (2010).
