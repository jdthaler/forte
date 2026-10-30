# CUORE

Every key is one of the crystals of CUORE, the Cryogenic Underground
Observatory for Rare Events: a 5 cm cube of tellurium dioxide, 750 g of it,
held about ten thousandths of a degree above absolute zero in a copper frame
under the Gran Sasso mountain. CUORE has 988 of them, and each is a
calorimeter so cold that one particle stopping in it warms it measurably. It
is waiting for two electrons from a neutrinoless double beta decay of ¹³⁰Te,
which would leave exactly 2,528 keV in one crystal and show that the
neutrino is its own antiparticle.

A thermistor of germanium glued to each crystal turns the warming into a
voltage, and a heater glued beside it fires a known pulse of heat every few
minutes so the experiment can follow each crystal's gain. Here the heater is
the note. Each key's heater fires at the key's rate, and the crystal is
played sped up (1,320 times at the defaults), so each pulse of heat is one
cycle of the waveform: a sharp rise as the heat reaches the thermistor's
electrons, and a fall as it leaves through the Teflon clips. Every key's
pulses pass through the same bolometer, so its rise and fall are a filter
that sits in one band on every key, like a voice's formant: the low keys'
pulses stand apart and buzz, and the high keys' pile up and round off. The
mod wheel warms the copper; velocity is the pulse's energy, and big pulses
warm the crystal so far that the thermistor no longer answers in proportion.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/cuore/>
(or locally, see the [main README](../README.md)).

## The physics

### 1. A crystal at ten millikelvin

The crystal's heat capacity is Debye's law, the lattice's vibrations frozen
out:

  C_c = (12π⁴/5) N k_B (T/Θ_D)³

with N its atoms (three a molecule of TeO₂, 159.6 g/mol, 6.02 g/cm³) and
Θ_D = 232 K. For a 5 cm cube, 752 g, that is 2.2 nJ/K at 10 mK, the value
the CUORE collaboration quotes. So 2,528 keV (4 × 10⁻¹³ J) warms it by
0.18 mK. Energy goes in exactly: the crystal's heat content is ∫C dT =
cc T⁴/4, so a pulse E takes it from T to (T⁴ + 4E/cc)^¼.

### 2. The thermistor

The neutron-transmutation-doped (NTD) germanium chip conducts by electrons
hopping between impurities, Efros and Shklovskii's variable-range hopping:

  R(T) = R₀ exp(√(T₀/T))

with R₀ = 1.1 Ω and T₀ = 3.4 K (the values of CUORE's simulation,
Carrettoni & Vignati 2011): 71 MΩ at the default's working point, and
falling by about 9 % for every 1 % its electrons warm. The chip's electrons
are a node of their own, with a heat capacity γT (8.6 × 10⁻¹¹ J/K at
10 mK), joined to the crystal by the electron–phonon coupling
g(T_e⁵ − T_c⁵).

### 3. The network

The CUORE collaboration's model of its calorimeters (2022) has four nodes,
the bias circuit and three thermal links:

  C_p dV/dt = (V_b − V)/R_L − V/R(T_e)

  C_e dT_e/dt = V²/R(T_e) − g (T_e⁵ − T_c⁵)

  C_c dT_c/dt = g (T_e⁵ − T_c⁵) − G (T_c − T_t)

  C_t dT_t/dt = G (T_c − T_t) − G (T_t − T_s)

The bias V_b (5 V) drives a current through the 60 GΩ load resistors and the
thermistor; the wires' capacitance C_p (500 pF) has to be charged through
the thermistor's tens of megohms. The current warms the electrons (half a
picowatt), and as they warm their resistance falls and the heating with it:
electrothermal feedback, which speeds the pulses and keeps a hot thermistor
stable. The Teflon clips (C_t = 2.1 × 10⁻⁶ T J/K) and their link to the copper
(G = 10 nW/K each way) carry the heat away to the sink at T_s = 10 mK.

With these numbers, a 2,528 keV pulse is 370 μV (146 μV per MeV), rising in
76 ms (10 to 90 %) and falling in 316 ms (90 to 30 %), against CUORE's
measured 55 ms and 220 ms (Carrettoni & Vignati 2011): the published model
with its published constants, not fitted to the pulse.

| | at rest | 2,528 keV pulse |
|---|---|---|
| sink (copper) | 10.000 mK | |
| Teflon clips | 10.049 mK | |
| crystal | 10.098 mK | +0.18 mK at once |
| electrons | 10.515 mK | |
| thermistor | 71 MΩ, 5.90 mV | −370 μV at the peak |

### 4. The sound

The thermistor's voltage below its rest, times the amplifier's gain (5,000),
over the digitiser's ±10.5 V, is the output, clipped there as the digitiser
would. Each key's heater fires every

  period = (heater period at A4) × 440 Hz / f

of the crystal's time, and the crystal is played that much faster: a speed-up
of 3 s × 440 = 1,320 at the defaults, so its 76 ms rise takes 58 μs. The note's
harmonics are the pulse's spectrum at multiples of the heater's rate: below
its fall's corner they grow with frequency, above its rise's they fall, so
the band they swell in (within 6 dB of its top from about 450 Hz to 6.5 kHz, highest near 1.9 kHz, at the defaults) is the same on every key,
and the note's own harmonics walk through it. The pulses' average, the heat
the heater puts in, warms the crystal a little more on the high keys, which
fire more often: their pulses are a little smaller and quicker.

The network is stepped at the sped-up time for every sample, in steps of at
most 15 ms of the crystal's time, by ROS2, a second-order L-stable Rosenbrock
method (Verwer et al. 1999) whose Jacobian is tridiagonal (each node touches
only its neighbours), and a pulse lands between samples where it falls.

### 5. Playing

- **Velocity** is the pulse's energy, the Pulse energy control (2,528 keV at
  full velocity) times the velocity; **aftertouch** adds up to as much again.
- **The mod wheel** warms the heat sink from its setting up to 14 mK.
- **Pitch bend** and MPE bend change the heater's rate (its pulser fires at
  any rate), up to 48 semitones a note.
- **Space**, or the sustain pedal, keeps the heaters firing after the keys
  come up; a crystal whose heater has stopped sounds until its last pulse has
  drained away.

## What to listen for

- **The formant**: play a scale. The note moves while the band its harmonics
  are loud in stays put; the low keys buzz, the high keys are round.
- **The heat sink**: the mod wheel, from 10 to 14 mK. The crystal's heat
  capacity grows as T³ and the thermistor's resistance falls steeply: the
  note gets twenty times quieter, and the pulses linger (316 to 944 ms), so it
  darkens.
- **Colder**: at 8 mK the thermistor's electrons sit 1.7 mK above the
  crystal, its resistance is 148 MΩ, and the feedback makes the pulses fall in
  92 ms: brighter, and nearly twice as loud.
- **Saturation**: at 50 MeV a pulse is 83 μV per MeV against 149 at 1 MeV;
  play hard, then soft, and the hard notes are mellower as well as louder.
- **A smaller crystal**: Cuoricino's 3 cm cube has a fifth of the heat
  capacity: more than twice the signal, and pulses that fall in 108 ms.
- **The real heater**: CUORE fires its heaters every 300 s; on A4 the
  speed-up is 132,000, the pulses are a few samples long, and the notes are
  clicks.

## Files

```
cuore/index.html, style.css               page
cuore/src/cuore-params.js                 parameters and presets
cuore/src/cuore-instrument.js             the descriptor: everything but the page
cuore/src/cuore-main.js                   page wiring and views
cuore/src/cuore-wasm.js                   the engine and model, the C++ as WebAssembly (cuore/wasm/cuore.wasm)
native/instruments/cuore/                 the physics in C++: model, engine, reference (plugins and WebAssembly)
test/cuore-tests.mjs                      node test/cuore-tests.mjs
tools/render-cuore.mjs                    node tools/render-cuore.mjs → examples/cuore/
```

## Simplifications

* **One electron–phonon exponent.** The collaboration fits 5.05 ± 0.07 for
  the NTD batch used here; this model takes 5 and keeps the fit's
  conductance at 10 mK.
* **The thermistor's constants** come from two papers: R₀ and T₀ from
  CUORE's 2011 simulation, the network from the 2022 model, which fits a
  higher T₀ with a field-dependent resistance (the electrons hop more easily
  in the bias field). That correction, and the 2022 fit's empirical one at
  large pulses, are left out, as is the NTD chip's own lattice (10⁻¹⁴ J/K).
* **The heater** puts its heat into the crystal at once, as a particle does.
  CUORE measures its heater pulses as slightly slower than a particle's
  (a fall of 187 ms against 158 in Carrettoni & Vignati's fit); here the two
  are one.
* **No noise.** The thermistor's and load resistors' Johnson noise, the
  thermal fluctuations of the links, and the cryostat's vibrations (the
  pulse tubes, the earth: CUORE has heard the sea's microseisms) are left
  out, as are the real particles that stop in the crystals between the
  heater's pulses.
* **The front end** is a gain and the digitiser's full scale. The
  anti-aliasing Bessel filter (120 Hz in CUORE) is far above the sound's
  band at any speed-up here, and is left out.
* **Every crystal is the same**, and none touches another: in CUORE each
  has its own thermistor batch, gain and pulse shape.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims how many
crystals sound and how finely they are stepped: 48 crystals at High, 24 at
Medium and 12 at Low (past that, the oldest's heater stops), and at most 8
steps a sample at High, 2 at Medium and 1 at Low. At the defaults a sample
takes two steps, so Medium sounds as High does; Low takes one step of 27.5 ms
of the crystal's time and its pulses come out a few per cent off.

## Prior art and references

**The experiment.**
* CUORE Collaboration, "Search for Majorana neutrinos exploiting millikelvin
  cryogenics with CUORE", *Nature* 604, 53 (2022),
  [doi:10.1038/s41586-022-04497-4](https://doi.org/10.1038/s41586-022-04497-4):
  988 crystals of 750 g at about 10 mK, more than a tonne-year of exposure,
  T½ > 2.2 × 10²⁵ yr.
* E. Fiorini & T. O. Niinikoski, "Low-temperature calorimetry for rare
  decays", *Nucl. Instrum. Meth. A* 224, 83 (1984): the proposal to search
  for rare decays with crystals read as calorimeters at low temperature.
* C. Brofferio & S. Dell'Oro, "The saga of neutrinoless double beta decay
  search with TeO₂ thermal detectors" (2018),
  [doi:10.1063/1.5031485](https://doi.org/10.1063/1.5031485),
  [arXiv:1801.03580](https://arxiv.org/abs/1801.03580): the history from the
  first TeO₂ bolometers to CUORE, and Θ_D = 232 ± 7 K.

**The bolometer's physics.**
* CUORE Collaboration, "An Energy-dependent Electro-thermal Response Model
  of CUORE Cryogenic Calorimeter",
  [arXiv:2205.04549](https://arxiv.org/abs/2205.04549) (2022): the network
  and its constants (the heat capacities, the electron–phonon coupling of
  NTD batch 39C, the 60 GΩ loads and 500 pF wires).
* M. Carrettoni & M. Vignati, "Signal and noise simulation of CUORE
  bolometric detectors", *JINST* 6, P08007 (2011),
  [doi:10.1088/1748-0221/6/08/P08007](https://doi.org/10.1088/1748-0221/6/08/P08007):
  the thermistor's R₀ and T₀, the heater's pulses, and the measured rise and
  fall times the model is compared with.
* M. Barucci, C. Brofferio, A. Giuliani, E. Gottardi, I. Peroni & G.
  Ventura, "Measurement of Low Temperature Specific Heat of Crystalline TeO₂
  for the Optimization of Bolometric Detectors", *J. Low Temp. Phys.* 123,
  303 (2001), [doi:10.1023/A:1017555615150](https://doi.org/10.1023/A:1017555615150):
  the crystal's heat capacity.

**The method.**
* J. G. Verwer, E. J. Spee, J. G. Blom & W. Hundsdorfer, "A Second-Order
  Rosenbrock Method Applied to Photochemical Dispersion Problems", *SIAM J.
  Sci. Comput.* 20, 1456 (1999): ROS2, the stepper.

No earlier sonification of CUORE's pulses as a keyboard instrument is known
to us.
