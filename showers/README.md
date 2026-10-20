# Collider Showers

A collider's calorimeter as a keyboard. Every key is a crystal of lead
tungstate (PbWO₄), like the 75,848 crystals of the CMS experiment's
electromagnetic calorimeter at CERN, and pressing it sends a particle into
the crystal's front face. The particle **showers**: an electron radiates
photons, each photon turns into an electron and a positron, and the cascade
multiplies until its energy is spread over thousands of particles, all of it
left in the crystal within a few centimetres of where the shower peaked. That
energy heats the crystal at once, and the heat's thermal expansion rings it:
the **thermo-acoustic effect**, the sound a particle beam makes in a block of
metal or a bar of water, and the reason gravitational-wave bar detectors are
rung by cosmic rays. The crystal's **stretching modes** are a harmonic series,
and how much the shower rings each depends on where along the crystal it left
its heat; its **bending modes**, inharmonic, ring when the particle lands off
the crystal's axis. A shower also spreads sideways into the crystals a
semitone either side. Nothing is sampled: the showers come from the Particle
Data Group's profiles of electromagnetic and hadronic showers in lead
tungstate, the crystals' modes from the theory of rods and beams, and the
tests check them against the incomplete gamma function, the wave equation
solved by finite differences, numerically integrated beams, and the
calorimetry textbooks' containment numbers.

The crystals are scaled to sound. A CMS crystal, 23 cm long, rings at about
8 kHz; a key's crystal is that crystal with its sound slowed so that its first
stretching mode is the note. Its depth and width stay counted in the shower's
own units, radiation lengths X₀ and Molière radii R_M, so every key's crystal
is the same crystal as far as the shower can tell, and only the note changes.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/showers/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): send a particle into that key's crystal; held, pile-up keeps landing when Pile-up is up |
| `←` `→` | octave |
| `↑` `↓` | velocity: the share of the particle energy the keys send |
| `Space` | keep the dampers off, so crystals ring on after the keys come up |
| MIDI | notes, velocity (energy), sustain pedal (CC64), **mod wheel = impact point**, **aftertouch = pile-up** (channel for every crystal, polyphonic for its own) |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch: more pile-up on that crystal |

## The physics

### 1. The crystal: lead tungstate

PbWO₄ is dense (8.30 g/cm³) and heavy (lead and tungsten), so a shower is
short and narrow in it. Its properties, from the PDG's table of atomic and
nuclear properties:

| | |
|---|---|
| radiation length X₀ | 7.39 g/cm², 0.89 cm |
| Molière radius R_M | 16.26 g/cm², 1.96 cm |
| critical energy E_c (electrons) | 9.64 MeV |
| nuclear interaction length λ_I | 168.3 g/cm², 22.8 X₀ |
| pion interaction length λ_π | 199.3 g/cm², 27.0 X₀ |
| a minimum-ionising particle's loss | 10.1 MeV/cm, 8.99 MeV per X₀ |

CMS's barrel crystals are 230 mm long, **25.8 X₀** (**Crystal depth**), with
a front face 22 mm square, **1.12 R_M** (**Crystal width**). Depth over width
is the crystal's slenderness s = L/w, 10.5 for CMS's.

### 2. Electromagnetic showers along the crystal

An electron or photon of energy E leaves, on average, an energy per unit depth
t (in X₀) of

  dE/dt = E b (bt)^(a−1) e^(−bt) / Γ(a)

with b = 0.5 and the peak at t_max = (a − 1)/b = ln(E/E_c) + C, C = −0.5 for
electrons and +0.5 for photons (PDG, *Passage of particles through matter*,
eq. 34.35–34.36, from Longo & Sestili 1975). The peak moves deeper by the
logarithm of the energy: 4.8 X₀ at 2 GeV, 8.1 X₀ at 50 GeV, 12.2 X₀ at
3 TeV. The share a crystal T X₀ deep holds is the regularised incomplete gamma
function P(a, bT): all of a 2 GeV shower in CMS's crystal, 97 % of a 3 TeV
one, and 27 % of a 500 GeV one in a crystal only 9 X₀ deep, whose shower
leaks out of the back.

**Electrons** (**Particle**) shower from the front face, and the model uses the
mean profile, so every note is the same. **Photons** first travel a random
distance before they convert into a pair, exponentially distributed with a
mean of 9/7 X₀ (the Bethe–Heitler mean free path; PDG), and shower from there,
so each note starts somewhere new.

### 3. Hadronic showers: pions

A charged pion crosses the crystal as a minimum-ionising track until it hits a
nucleus, at a depth drawn from an exponential with the pion interaction
length. There it splits into neutral pions, whose photons shower
electromagnetically, and hadrons, which shower over interaction lengths and
mostly leak out of the back. The electromagnetic fraction f_em is drawn from
shower to shower around Groom's mean

  ⟨f_em⟩ = 1 − (E/E₀)^(m−1),  E₀ = 1 GeV, m = 0.83

(54 % at 100 GeV) with a spread of 0.12, and split into two to four photons.
The hadronic part's profile is Bock et al.'s gamma in interaction lengths from
the first interaction, with Hughes's parameters (a = 0.786 + 0.427 ln E,
d = 0.978 per λ_I), and 30 % of it is invisible: it goes into breaking up
nuclei and is never seen (20–40 %, PDG). A pion that leaves less than 20 % of
its energy in the crystal is not kept, as a calorimeter's trigger would not
keep it, and another is drawn. At 100 GeV the pions kept leave about half
their energy, and no two notes are alike.

### 4. Sideways: the neighbours

A shower spreads across the crystal too. The model's radial profile is
Grindhammer & Peters's

  f(r) = 2 r R² / (r² + R²)²,  R = R_M / 3,

which keeps 90 % of the energy within one Molière radius and 99 % within 3.5,
as PDG gives. The keys are a row of square crystals, each key's crystal with
the crystals a semitone and a tone either side, and the model integrates the
profile over each: on the axis of a CMS crystal its own takes 78 % and each
neighbour 4 %. **Impact point** (the mod wheel) moves the particle toward the
next key up; on the crack between two crystals they share it, 42 % each. A
narrow crystal (**Crystal width**) holds less of a shower and passes more to its
neighbours, which ring softly a semitone either side.

### 5. Heat into sound: the thermo-acoustic effect

The shower is over in a nanosecond and the heat it leaves stays put for
seconds, so for the crystal's modes the heating is instant and the heat
fixed. The heated slice wants to expand by α ΔT; a free crystal answers by
ringing about its new length. In the Grüneisen picture (Beron & Hofstadter
1969; Grassi Strini, Strini & Tagliaferri 1980), worked out for the RAP
experiment's aluminium bars rung by an electron beam (Buonomo et al. 2005),
a deposit W at the middle of a free bar of mass M and length L sets its
first stretching mode moving with an end displacement of

  B₀ = 2 α L W / (π c_v M),

and a deposit along the bar rings each stretching mode n by the overlap of
the heat with the mode's strain, sin(nπz/L):

  a_n = (2/(nπ)) ∫₀¹ q(ζ) sin(nπζ) dζ.

So where the shower lies sets the tone. A shallow shower near the front face
rings many harmonics, bright; a deep one peaking near the middle, where the
even modes have a node of strain, rings the odd harmonics and hardly the even
ones, a darker, hollow note. Velocity is the particle's energy (Velocity
times **Particle energy**): harder is louder, and deeper, so darker too.

Off the axis, the heat is lopsided: its centroid x̄ from the axis bends the
crystal with a thermal curvature κ = −12 x̄ ε / w², ε the thermal strain,
and that rings the crystal's bending modes by the overlap of κ with each
mode's curvature. The tests check both overlaps against the wave equation
and the beam equation solved numerically.

### 6. The crystal's modes

**Stretching modes.** A free rod's are a harmonic series, f_n = n c/(2L).
A real crystal is not thin, and its cross-section breathes in and out as it
stretches (Love's rod theory), which flattens the higher modes:

  f_n / f₁ = n √((1 + g) / (1 + g n²)),  g = (νπ)² / (6 s²),

with ν = 0.3, Poisson's ratio. In CMS's crystal the 4th harmonic is 1.0 %
flat, the 8th 4 %. Love's theory holds while the wavelength is longer than
the crystal is wide (k r_p ≤ 1), up to the 8th mode for CMS's crystal, and
the model keeps the modes up to there.

**Bending modes.** A free–free Euler–Bernoulli beam's, at the roots of
cos βL cosh βL = 1 (βL = 4.730, 7.853, 10.996, …):

  f_m / f₁ = (β_m L)² / (π s √12),

0.196, 0.542, 1.062, 1.755 and 2.62 times the note in CMS's crystal: not
harmonic, and the first of them nearly two and a half octaves below the note.
A slender crystal's bending modes fall low; a stubby one's rise among the
harmonics.

**Losses.** Every mode rings for **Crystal Q** periods of its own (its
amplitude decays at πf/Q), about 13 s for C4 at the default 1500. Letting go
of a key presses a damper on the crystal (**Damper on release**, a Q of 25,
0.2 s at C4); the pedal keeps the dampers off. The neighbours rung by a
shower are not held, so the dampers stop them unless the pedal is down.

### 7. Pile-up

At the LHC, dozens of proton–proton collisions happen in every bunch
crossing, and the soft photons from the others land in the same crystals.
While a key is held, **Pile-up** sends soft photons into its crystal at
random times (a Poisson process at that rate, a second), each with a share u
of the particle energy drawn from dN/du ∝ 1/u² between 0.3 % and 10 %, and
landing anywhere on the face. Key pressure adds up to 300 a second. Each
rings the crystal again, a crackle at its harmonics that keeps a held note
alive.

### 8. What you hear

**Sensor** picks how the crystal is heard. A piezoelectric sensor glued to
the crystal's side (**Piezo position**, 30 % of the way from the front face)
reads the strain where it sits, from the stretching modes and the bending
ones; a mode with a node of strain there is silent, so in the middle the even
harmonics are. The heat's own strain, which a real piezo would read as a
step, fades through the preamp's 20 Hz high-pass, so a note starts from
silence rather than with a click. An accelerometer on the back face, on the
axis, feels only the stretching modes, by their acceleration, so the higher
harmonics are louder and the bending modes are gone.

## What to listen for

The demos in `examples/showers/`:

* **CMS crystals with the pedal** (default): 50 GeV electrons in CMS's
  crystals, chords held with the pedal: a glassy harmonic tone, its upper
  harmonics a touch flat (Love), with the neighbours a semitone either side
  faintly ringing along.
* **Shallow showers, then deep ones**: the same phrase at 2 GeV, peaking near
  the front face and bright, then at 3 TeV, peaking near the middle: the even
  harmonics drop out and the note goes hollow, like a clarinet.
* **Harder is deeper**: one key, harder each time at 400 GeV: louder, and
  darker as the shower moves in.
* **Electrons, photons, pions**: the same note repeated. Electrons are
  identical; photons each convert somewhere new and vary a little; pions vary
  a lot, in level and colour.
* **On the axis, off it, and on the crack**: off the axis the bending modes
  come in, low and inharmonic under the note; on the crack, two crystals a
  semitone apart share each shower.
* **Pile-up, held chords**: the chord rings on with a crackle of soft photons,
  and pressing the held top note harder brings more.
* **Narrow crystals, the shower spreads**: a scale in CMS's crystals, then in
  crystals half a Molière radius wide, where every note rings its neighbours.
* **Piezo, then accelerometer**: off the axis, through the piezo with the
  bending modes, then the accelerometer: the harmonics alone, brighter.

On the page, **The event** shows the row of crystals, the particle coming in
and the cascade, the heat it leaves glowing, and the crystals stretching and
bending in slow motion; **The shower** shows the last shower's deposit along
the crystal against the mean profile, the stretching modes' strain shapes,
and each mode's level.

## Files

```
showers/index.html, style.css          page
showers/src/showers-params.js          parameters and presets
showers/src/showers-instrument.js      the descriptor: everything but the page
showers/src/showers-main.js            page wiring and views
showers/src/showers-wasm.js            the engine and model, the C++ as WebAssembly (showers/wasm/showers.wasm)
native/instruments/showers/            the physics in C++: model, engine, generated tables, reference (plugins and WebAssembly)
test/showers-tests.mjs                 node test/showers-tests.mjs (21 tests, about 11 s)
tools/render-showers.mjs               node tools/render-showers.mjs → examples/showers/
```

## Simplifications

* **Scaled crystals.** The sound speed is scaled so the first stretching
  mode is the note; the shower does not know, and the Q is a choice rather
  than PbWO₄'s, which is not well measured at these frequencies.
* Poisson's ratio is assumed (0.3): PbWO₄'s is not well measured.
* Love's correction is kept only where it holds (k r_p ≤ 1); higher modes,
  where the crystal is wider than the wavelength, are left out, and the
  bending modes are Euler–Bernoulli's, which come out sharp at the top modes
  of a stubby crystal (no shear or rotary inertia).
* Electrons follow the mean profile with no fluctuations; photons fluctuate
  only in where they convert. Pions' f_em spread (0.12) and the trigger's 20 %
  are our choices, and their hadronic part has no lateral spread of its own.
* The lateral profile is the same at every depth; real showers are narrow at
  first and widen past the peak.
* CMS's crystals taper, and sit in a two-dimensional grid; the keys are a row
  of square, straight crystals.
* The heat does not diffuse, and the crystal's temperature does not change
  its sound speed; a real crystal's heat spreads out over seconds.
* Each crystal is free: no glue, wrapping or support couples it to its
  neighbours, and the damper is a Q, not a felt.

## Prior art and references

**The physics**

* Particle Data Group, S. Navas et al., "Review of Particle Physics",
  *Phys. Rev. D* 110, 030001 (2024),
  [doi:10.1103/PhysRevD.110.030001](https://doi.org/10.1103/PhysRevD.110.030001):
  *Passage of particles through matter* (the longitudinal profile,
  eq. 34.35–34.36; the Bethe–Heitler 9/7 X₀; 90 % and 99 % lateral
  containment), *Particle detectors at accelerators* (the PbWO₄ table,
  CMS's 25.8 X₀ crystals, hadronic showers' invisible energy and f_em's
  fluctuations) and *Atomic and nuclear properties of materials* (lead
  tungstate: X₀, E_c, R_M, λ_I, λ_π, dE/dx),
  <https://pdg.lbl.gov/2024/AtomicNuclearProperties/>.
* E. Longo and I. Sestili, "Monte Carlo calculation of photon-initiated
  electromagnetic showers in lead glass", *Nucl. Instrum. Meth.* 128, 283
  (1975): the gamma-function profile.
* D. E. Groom, "Energy flow in a hadronic cascade: application to hadron
  calorimetry", *Nucl. Instrum. Meth. A* 572, 633–653 (2007),
  [arXiv:physics/0605164](https://arxiv.org/abs/physics/0605164): ⟨f_em⟩.
* R. K. Bock, T. Hansl-Kozanecka and T. P. Shah, "Parametrization of the
  longitudinal development of hadronic showers in sampling calorimeters",
  *Nucl. Instrum. Meth.* 186, 533 (1981),
  [doi:10.1016/0029-554X(81)90232-9](https://doi.org/10.1016/0029-554X(81)90232-9),
  with Hughes's parameters as given by Y. A. Kulchitsky and V. B. Vinogradov,
  *Nucl. Instrum. Meth. A* 413, 484 (1998),
  [arXiv:hep-ex/9903019](https://arxiv.org/abs/hep-ex/9903019).
* G. Grindhammer and S. Peters, "The parameterized simulation of
  electromagnetic showers in homogeneous and sampling calorimeters",
  [arXiv:hep-ex/0001020](https://arxiv.org/abs/hep-ex/0001020): the radial
  profile.
* CMS Collaboration, *The Electromagnetic Calorimeter Technical Design
  Report*, CERN/LHCC 97-33 (1997), and "The CMS experiment at the CERN LHC",
  *JINST* 3, S08004 (2008),
  [doi:10.1088/1748-0221/3/08/S08004](https://doi.org/10.1088/1748-0221/3/08/S08004):
  the crystals, 230 mm long with a 22 mm face.
* L. Montalto et al., "PbWO₄ acoustic properties measurement by laser
  ultrasonics with the aim of optical damage recovery", *Crystals* 13, 556
  (2023): PbWO₄'s sound speed, 3667 m/s along the axis.
* A. E. H. Love, *A Treatise on the Mathematical Theory of Elasticity*
  (4th ed., Cambridge, 1927): a rod's lateral inertia.

**Particles that make sound**

* G. A. Askaryan, "Hydrodynamic radiation from the tracks of ionizing
  particles in stable liquids", *Sov. J. At. Energy* 3, 921 (1957): the idea
  that a particle's track is heard.
* R. M. Sulak et al., "Experimental studies of the acoustic signature of
  proton beams traversing fluid media", *Nucl. Instrum. Meth.* 161, 203–217
  (1979).
* B. L. Beron and R. Hofstadter, "Generation of mechanical vibrations by
  penetrating particles", *Phys. Rev. Lett.* 23, 184 (1969),
  [doi:10.1103/PhysRevLett.23.184](https://doi.org/10.1103/PhysRevLett.23.184),
  and A. M. Grassi Strini, G. Strini and G. Tagliaferri, "A theory of the
  acoustic generation by particles in solids", *J. Appl. Phys.* 51, 948
  (1980): the thermo-acoustic effect in a solid bar.
* B. Buonomo et al. (RAP), "Particle acoustic detection in gravitational
  wave aluminum resonant antennas", *Astropart. Phys.* 24, 65 (2005), [arXiv:gr-qc/0505009](https://arxiv.org/abs/gr-qc/0505009):
  B₀ = 2αLW/(π c_v M), measured.
* "Detection of high energy cosmic rays with the resonant gravitational
  wave detectors NAUTILUS and EXPLORER", *Astropart. Phys.* 30, 200 (2008),
  [arXiv:0806.1335](https://arxiv.org/abs/0806.1335): bars rung by cosmic-ray
  showers.

**Sonification of collisions**

* *LHCsound* (L. Asquith and others, ATLAS, 2010) turned ATLAS events into
  sound, and *Quantizer* (see [docs/PRIOR_ART.md](../docs/PRIOR_ART.md#5-sonification-and-science-outreach-precedents))
  turns live ATLAS collisions into music. Both map data to sound; here a
  shower makes its own, by heating the crystal it lands in. The Storage Ring
  ([ring/README.md](../ring/README.md)) and RF Cavity Bells
  ([cavity/README.md](../cavity/README.md)) play the accelerator that makes
  the collisions.
