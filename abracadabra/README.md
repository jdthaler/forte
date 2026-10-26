# ABRACADABRA

A dark-matter search as a keyboard. If the dark matter of our Galaxy is an
**axion**, a very light particle first proposed to explain why the strong force
keeps time reversal, then it fills the room you are in as a classical field
oscillating at its mass, m c²/h: a few hundred kilohertz for an axion of a
nano-electronvolt. Through its tiny coupling to photons it turns a magnet's
field into an oscillating **effective current**. ABRACADABRA (A Broadband/
Resonant Approach to Cosmic Axion Detection with an Amplifying B-field Ring
Apparatus; Kahn, Safdi and Thaler, 2016) puts that current where it can be
seen: in a **toroidal magnet** it circles the hole in the middle, as the field
does, and so threads an oscillating magnetic flux through a **pickup loop** in
the hole, where the magnet itself has no field at all. A **SQUID** reads that
flux. ABRACADABRA-10 cm, the prototype at MIT, ran in 2018 and 2020 and found
no axion between 0.31 and 8.3 neV.

Here every key is that experiment in a universe whose axion has the **key's
mass**: its frequency in kilohertz is the note's in hertz (A4 is an axion of
1.82 neV, at 440 kHz). Only the frequency is moved. The axion is not one wave
but a sum of many, one for every speed of the dark matter in the Galaxy's halo,
each a little sharp by v²/2c², so its line is about a millionth of its
frequency wide: in real hertz, the same in the note. So the tone is not steady:
its **amplitude wanders**, Rayleigh-distributed, swelling and fading over the
axion's coherence time, a second at A4, a quarter of a minute at A0, a tenth of
a second at C8. A key charges its toroid (the velocity is how far); the
SQUID's **noise** hisses around each note, per hertz as in the experiment; and
the axion's **coupling** decides whether you hear it or only the hiss. Nothing
is sampled: the flux is ABRACADABRA-10 cm's own formula and numbers, the halo
is the Standard Halo Model, and the tests check them against Ampère's law,
the experiment's own reach and the halo's statistics.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/abracadabra/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): charge that key's toroid and listen to its axion |
| `←` `→` | octave |
| `↑` `↓` | velocity: how far the computer keys charge the magnet |
| `Space` | keep the magnets charged after the keys come up |
| MIDI | notes, velocity (the magnet's charge), sustain pedal (CC64), **mod wheel = the halo's speed**, MPE (each key's own halo, by CC74) |
| Touch | as the keys |

## The physics

### 1. The axion and the effective current

An axion field a couples to photons through the term g a E·B, with g, the
coupling, in GeV⁻¹. As dark matter of density ρ it is a field oscillating at its
mass, a(t) = (√2ρ / m) cos(m t) (natural units, ħ = c = 1), and in a static
magnetic field B the coupling acts as a current,

  J_eff = g √2ρ cos(m t) B

which Maxwell's equations treat like any other (Sikivie 1983; Kahn, Safdi and
Thaler 2016). With the Standard Halo Model's ρ = 0.4 GeV/cm³, g √ρ is
8.9×10⁻¹⁶ m⁻¹ for g = 10⁻¹⁰ GeV⁻¹ (in SI, √ρ g ÷ ħc): the induced field is
that times the magnet's, times a length of the size of the magnet. It does not
depend on the axion's mass, which is what makes a broadband search possible.

An axion of mass m oscillates at

  f = m c² / h = 241.8 kHz × (m / 1 neV)

and the keyboard puts each key's axion at 1000 times the key's frequency: A0
is 27.5 kHz (0.114 neV), A4 440 kHz (1.82 neV), C8 4.19 MHz (17.3 neV).
ABRACADABRA-10 cm searched 75 kHz to 2 MHz, D2 to B6.

### 2. The toroid and the pickup

The toroid's field circles inside it, B = B_max R / r between its inner radius
R and outer radius R_o, and nowhere else. The effective current circles with
it: an azimuthal current filling the toroid, like a thick, short solenoid, whose
own field threads the hole. The flux through a loop of radius a in the hole is
the effective current times the mutual inductance M(a; r, z) of the loop and
each circle of it (Maxwell's, by elliptic integrals),

  Φ = g √2ρ cos(m t) B_max ∫∫ M(a; r, z) (R / r) dr dz ≡ g √2ρ cos(m t) B_max 𝒢 V

and ABRACADABRA-10 cm (Ouellet et al. 2019) gives it as Φ_rms = g √ρ 𝒢 V B_max:
its toroid runs from R = 3 cm to 6 cm and is 12 cm tall, with a field volume
V = 890 cm³ and B_max = 1 T at its inner radius; its pickup is a loop 2.01 cm in
radius in the middle of the hole, and COMSOL gives 𝒢 = 0.027. For
g = 1.4×10⁻¹⁰ GeV⁻¹, its best limit in 2019, that is 1.4×10⁻⁵ Φ₀ through the
pickup. The model computes the same integral for a toroid of rectangular cross
section (Gauss–Legendre over r and z, K and E by the arithmetic–geometric mean):
it gives 0.021 for ABRACADABRA-10 cm's dimensions (the real windings are
rounded, and its shield changes the field a little, both in COMSOL's number),
and for a tall toroid exactly what Ampère's law gives, π a² R ln(R_o / R).
The engine uses the experiment's 𝒢 V, and scales it as the volume for a toroid
of another size (pickup and all scaled alike).

The pickup feeds the SQUID through a transformer: the flux at the SQUID is
M_in / L_T of the pickup's, with M_in = 2.52 nH the SQUID's input coupling and
L_T = 3.3 μH the pickup circuit's measured inductance, so 1/1300 of it: 0.011
μΦ₀ for that limit coupling.

### 3. The halo, the line and the coherence time

The dark matter is not still: in the Standard Halo Model (Drukier, Freese and
Spergel 1986) its velocities are a Maxwellian with speed parameter v₀ =
220 km/s, through which the lab moves at v_lab = 232 km/s, so the speeds seen in
the lab follow

  f(v) = v [exp(−(v − v_lab)²/v₀²) − exp(−(v + v_lab)²/v₀²)] / (√π v₀ v_lab)

Each speed is an axion of energy m c² (1 + v²/2c²), so the field is a sum of
waves, each sharp of m c²/h by f v²/2c²: a one-sided line whose mean is
f (v_lab² + 3/2 v₀²)/2c², 7×10⁻⁷ of the frequency (0.31 Hz at A4), and whose
spread is f √(2 v_lab² v₀² + 3/2 v₀⁴)/2c².

The waves' phases are random, so the field is Gaussian (Foster, Rodd and Safdi
2018): its amplitude is Rayleigh-distributed and its power exponential, and it
holds its phase and amplitude only for a **coherence time**, which the readout
gives as 1/(√2 π σ) for a line of spread σ, where its autocorrelation falls to
1/e: 0.98 s at A4 (about 430 000 cycles), 16 s at A0, 0.1 s at C8. Each key's
field is 64 waves, each a speed drawn from the halo (three Gaussian velocities
about the lab's) with a complex Gaussian amplitude, so their sum is Gaussian
whatever their number; the tests check the speeds' moments, the power's
exponential law and the autocorrelation against the line's characteristic
function. The field lives on while the key is up: each key's waves keep their
phases, carried on to the moment it is struck again.

A **stream** is dark matter that has not mixed into the halo yet, the debris of
a small galaxy ours has torn apart, crossing the lab together. O'Hare and Green
(2017) take one at 400 km/s in the Galaxy, 20 km/s across and 5 % of the
density, which crosses the lab at 420 km/s: 16 more waves, from 20 km/s about
the stream's speed, give it a second line, narrower (so steadier) than the
halo's, which beats against it.

### 4. The SQUID and the noise

ABRACADABRA-10 cm's noise between 100 and 850 kHz was the SQUID's own flux
noise, about 1 μΦ₀/√Hz. Here each key has a listening channel around its note, a
band-pass of Q 8 (an eighth of the note wide), fed white noise of that density:
its noise bandwidth is π f / 16, so the noise in it is noise × √(π f / 16), 9.3
μΦ₀ at A4, wider and louder for higher notes. Since the note's hertz are the
axion's hertz moved, not scaled, the signal-to-noise ratio you hear in a band
is the one the experiment would have in a band as wide around the axion's
frequency.

The readout's gain puts the louder of the axion's flux (at full charge) and
the channel's noise at the same level, so a strongly coupled axion is a tone
over a faint hiss and a weakly coupled one a faint tone in the hiss: at the
default, g = 5×10⁻⁷ GeV⁻¹, the axion's flux at the SQUID is 39 μΦ₀ against the
noise's 9.3 at A4. At the CAST limit, 6.6×10⁻¹¹, it is 0.005 μΦ₀ and lost;
ABRACADABRA-10 cm found its limits by averaging spectra for 28 days (2.45×10⁶
s), as the search view does for as long as a key is held: by the radiometer
equation, SNR = (Φ² / S) √(T / Δf), its numbers reach 3.8×10⁻¹⁰ GeV⁻¹ at 750 kHz (the tests
check this is within three times its published 1.4×10⁻¹⁰, whose analysis was a
full likelihood).

### 5. The magnet, and playing

A key charges its toroid to its velocity's share of the field at a steady rate
(a superconducting magnet charges at a fixed dI/dt), over the ramp time, and
discharges it when the key and the pedal let go. The axion was there all
along: the magnet makes it heard, so a note starts at whatever its field is
doing then, loud or nearly silent, and a key struck again within its coherence
time finds the field where it left it.

The mod wheel heats the halo, up to 2000 km/s, and an MPE controller's slide
heats each key's own. The axion's mass does not bend, so there is no pitch bend.

## What to listen for

- **Swells.** Hold a chord: each note grows and fades on its own, about once
  a second in the middle of the keyboard, as its waves drift in and out of
  step. Low notes hold still for many seconds; high ones flicker.
- **Into the noise.** Turn the coupling down: the tone stays put and the hiss
  rises over it until, past about 10⁻⁸ GeV⁻¹, it is gone. Then make the
  toroid a meter across and give it 5 T: an axion at the CAST limit comes
  back.
- **The search.** In the search view, hold a key with a faint axion: the
  averaged spectrum's noise calms as the square root of the time, and a line
  rises out of it just above the axion's rest frequency.
- **Hot and cold halos.** A cold halo (40 km/s) is a steady tone; a galaxy
  cluster's (1200 km/s) blurs it into a band of noise.
- **A stream** beats against the halo's line: a slow, steady wobble.
- **A slow magnet** makes every note charge up, its timbre the field's of the
  moment.

## Files

```
abracadabra/index.html, style.css            page
abracadabra/src/abracadabra-params.js        parameters and presets
abracadabra/src/abracadabra-instrument.js    the descriptor: everything but the page
abracadabra/src/abracadabra-main.js          page wiring and views
abracadabra/src/abracadabra-wasm.js          the engine and model, the C++ as WebAssembly (abracadabra/wasm/abracadabra.wasm)
native/instruments/abracadabra/              the physics in C++: model, engine, reference (plugins and WebAssembly)
test/abracadabra-tests.mjs                   node test/abracadabra-tests.mjs (22 tests, about 2 s)
tools/render-abracadabra.mjs                 node tools/render-abracadabra.mjs → examples/abracadabra/
```

## Simplifications

- The axion's frequency is moved down a thousandfold to the keyboard; its
  line, the SQUID's noise and every time are left in real hertz and seconds.
  Moving it down is a heterodyne per key (what a receiver's mixer does), not a
  recording slowed down: that would stretch the coherence time a thousandfold
  too.
- The flux and the coupling to the SQUID are ABRACADABRA-10 cm's Run 1
  (𝒢 = 0.027, L_T = 3.3 μH). A larger toroid keeps the same readout circuit;
  a real one would match its pickup's inductance to the SQUID.
- The noise is the SQUID's white floor alone: no vibration below 100 kHz, no
  narrow interference lines above 1 MHz as the experiment saw, no thermal noise
  of the magnet.
- The field is 64 waves (and 16 for a stream) per key, not infinitely many:
  enough for its statistics, and redrawn for each key once, when the engine
  starts. The halo has no escape speed and no annual modulation.
- Broadband readout only: no resonant LC circuit, which Kahn, Safdi and Thaler
  also proposed and DMRadio is building.
- Each listening channel is a second-order band-pass: its skirts let a little
  hiss through far from the note.

## Quality

High plays 64 halo waves and 16 stream waves per key, and up to 24 keys at
once. Medium plays 32 and 8, and 16 keys; Low 16 and 4, and 10 keys (the
let-go key with the least field goes first). The field stays Gaussian at every
level (its waves' amplitudes are Gaussian), so a note's level and its line are
the same; only how finely its swells are drawn changes.

## Prior art and references

**The experiment**

* Y. Kahn, B. R. Safdi and J. Thaler, "Broadband and Resonant Approaches to
  Axion Dark Matter Detection", *Phys. Rev. Lett.* 117, 141801 (2016),
  [doi:10.1103/PhysRevLett.117.141801](https://doi.org/10.1103/PhysRevLett.117.141801):
  the toroid, the pickup in its hole, and the broadband and resonant readouts.
* J. L. Ouellet et al., "First Results from ABRACADABRA-10 cm: A Search for
  Sub-μeV Axion Dark Matter", *Phys. Rev. Lett.* 122, 121802 (2019),
  [doi:10.1103/PhysRevLett.122.121802](https://doi.org/10.1103/PhysRevLett.122.121802):
  the flux formula, the halo, the search and its limits.
* J. L. Ouellet et al., "Design and implementation of the ABRACADABRA-10 cm
  axion dark matter search", *Phys. Rev. D* 99, 052012 (2019),
  [doi:10.1103/PhysRevD.99.052012](https://doi.org/10.1103/PhysRevD.99.052012):
  the toroid, V, 𝒢, the pickup, M_in, L_T and the noise floor.
* C. P. Salemi et al., "Search for Low-Mass Axion Dark Matter with
  ABRACADABRA-10 cm", *Phys. Rev. Lett.* 127, 081801 (2021),
  [doi:10.1103/PhysRevLett.127.081801](https://doi.org/10.1103/PhysRevLett.127.081801):
  the second run's limit, 3.2×10⁻¹¹ GeV⁻¹ near 3 neV.

**The physics**

* R. D. Peccei and H. R. Quinn, "CP Conservation in the Presence of
  Pseudoparticles", *Phys. Rev. Lett.* 38, 1440 (1977),
  [doi:10.1103/PhysRevLett.38.1440](https://doi.org/10.1103/PhysRevLett.38.1440);
  S. Weinberg, "A New Light Boson?", *Phys. Rev. Lett.* 40, 223 (1978),
  [doi:10.1103/PhysRevLett.40.223](https://doi.org/10.1103/PhysRevLett.40.223);
  F. Wilczek, "Problem of Strong P and T Invariance in the Presence of
  Instantons", *Phys. Rev. Lett.* 40, 279 (1978),
  [doi:10.1103/PhysRevLett.40.279](https://doi.org/10.1103/PhysRevLett.40.279):
  the axion.
* P. Sikivie, "Experimental Tests of the 'Invisible' Axion", *Phys. Rev.
  Lett.* 51, 1415 (1983),
  [doi:10.1103/PhysRevLett.51.1415](https://doi.org/10.1103/PhysRevLett.51.1415):
  turning dark-matter axions into photons in a magnet.
* A. K. Drukier, K. Freese and D. N. Spergel, "Detecting cold dark-matter
  candidates", *Phys. Rev. D* 33, 3495 (1986),
  [doi:10.1103/PhysRevD.33.3495](https://doi.org/10.1103/PhysRevD.33.3495):
  the Standard Halo Model.
* C. A. J. O'Hare and A. M. Green, "Axion astronomy with microwave cavity
  experiments", *Phys. Rev. D* 95, 063017 (2017),
  [doi:10.1103/PhysRevD.95.063017](https://doi.org/10.1103/PhysRevD.95.063017):
  the lab-frame speed distribution and the benchmark stream.
* J. W. Foster, N. L. Rodd and B. R. Safdi, "Revealing the Dark Matter Halo
  with Axion Direct Detection", *Phys. Rev. D* 97, 123006 (2018),
  [doi:10.1103/PhysRevD.97.123006](https://doi.org/10.1103/PhysRevD.97.123006):
  the axion field as a Gaussian random field, its Rayleigh amplitudes.
* V. Anastassopoulos et al. (CAST), "New CAST limit on the axion–photon
  interaction", *Nature Physics* 13, 584 (2017),
  [doi:10.1038/nphys4109](https://doi.org/10.1038/nphys4109): g < 6.6×10⁻¹¹
  GeV⁻¹.
* G. Grilli di Cortona, E. Hardy, J. Pardo Vega and G. Villadoro, "The QCD
  axion, precisely", *JHEP* 01 (2016) 034,
  [doi:10.1007/JHEP01(2016)034](https://doi.org/10.1007/JHEP01(2016)034): the
  QCD axion's mass and coupling, for the KSVZ and DFSZ lines.
* J. C. Maxwell, *A Treatise on Electricity and Magnetism* (1873), §701: the
  mutual inductance of two coaxial circles.

**Other broadband and lumped-element searches**

* P. Sikivie, N. Sullivan and D. B. Tanner, "Proposal for Axion Dark Matter
  Detection Using an LC Circuit", *Phys. Rev. Lett.* 112, 131301 (2014),
  [doi:10.1103/PhysRevLett.112.131301](https://doi.org/10.1103/PhysRevLett.112.131301).
* N. Crisosto et al. (ADMX SLIC), "ADMX SLIC: Results from a Superconducting LC
  Circuit Investigating Cold Axions", *Phys. Rev. Lett.* 124, 241101 (2020),
  [doi:10.1103/PhysRevLett.124.241101](https://doi.org/10.1103/PhysRevLett.124.241101).
* A. V. Gramolin et al. (SHAFT), "Search for axion-like dark matter with
  ferromagnets", *Nature Physics* 17, 79 (2021),
  [arXiv:2003.03348](https://arxiv.org/abs/2003.03348): a toroid of
  ferromagnet.

**Earlier syntheses**

* We found no earlier musical instrument or sonification built on an axion
  search's signal. The search view follows how ABRACADABRA-10 cm averaged its
  spectra.
