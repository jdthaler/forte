# NMR Spin Echo

Every key is a tube of liquid in the magnet of an NMR spectrometer, the instrument chemists use
to see molecules. A radio pulse tips the protons' spins over, and they precess about the field;
a coil hears them, and the spectrometer mixes their radio signal down against a reference, as
every spectrometer does. What comes out is in the audio range: each chemical group of protons
rings at its own **chemical shift** times the magnet's frequency, so a molecule plays as a
chord. Ethanol's CH₃, CH₂ and OH lines stand 1 : 3.25 : 4.37 apart.

The key sets the magnet: its field puts the sample's lowest line on the note. A4 needs 9.75 T,
a 415 MHz spectrometer, close to the commonest kind there is; C8 would need 3.9 GHz, more than
any magnet built (30.5 T, 1.3 GHz: ethanol's E6).

Each note fades as the spins drift out of step in a field that is never quite even. Nothing is
lost yet: the pedal fires a **π pulse** that flips them over, the fast ones fall behind and
catch up, and the note swells back as an **echo**, as Erwin Hahn found in 1950. Hold the pedal
with the echo train on, and the pulses repeat, as Carr, Purcell, Meiboom and Gill made them.

Nothing is slowed down or sped up: the notes fade, beat, echo and recover when the spins would.
The physics is the spins' quantum mechanics, solved exactly for each key's magnet.

## The physics

### 1. The magnet and the key

A proton in a field B₀ precesses at the Larmor frequency f₀ = γB₀/2π, with γ/2π = 42.577 MHz/T
(CODATA 2018). The electrons around it shield it a little, by a few parts per million that depend
on its chemical surroundings: its chemical shift δ, measured from the protons of TMS. A
spectrometer mixes the coil's signal down against a reference at 0 ppm, so a group of protons
at δ sounds at

    f = δ · f₀

which is audio for any magnet. A key's magnet is the one that puts the sample's lowest shift on
the key's note in the keyboard's tuning: f₀ = f_note / δ_lowest. Every other line then follows
at its shift's ratio, so the chord moves with the key.

### 2. Shifts and couplings: the spins' Hamiltonian

Protons also feel each other through the bonds, by the J coupling, a few hertz whatever the
field. In the frame turning at the reference, the protons' Hamiltonian is

    H = Σ_g 2π δ_g f₀ F_zg + 2π Σ_{g<h} J_gh F_g · F_h

where F_g is the total spin of group g, a set of equivalent protons (a CH₃, a CH₂). Equivalent
protons couple equally to the rest, so each group's total spin S is conserved: a group of n
protons is a sum of spins S = n/2, n/2 − 1, … with known multiplicities (two ways to make ½ from
three spins ½, five ways to make 2 from six). For each choice of the groups' S, the instrument
builds H in the product basis and diagonalises it, block by block of total F_z, which H
conserves. That is exact at any field, so nothing is assumed about the multiplets.

| sample | groups (δ, ppm; protons) | J (Hz) |
|---|---|---|
| Ethanol in DMSO | CH₃ 1.06 (3), CH₂ 3.44 (2), OH 4.63 (1) | CH₃–CH₂ 7, CH₂–OH 5 |
| Ethanol in chloroform | CH₃ 1.25 (3), CH₂ 3.72 (2), OH 1.32 (1) | CH₃–CH₂ 7 |
| Water | HDO 4.79 (1) | |
| Ethyl acetate in chloroform | CH₃ 1.26 (3), CH₃CO 2.05 (3), OCH₂ 4.12 (2) | CH₃–OCH₂ 7 |
| 2-Propanol in chloroform | (CH₃)₂ 1.22 (6), CH 4.04 (1) | 6 |

The shifts and couplings are Gottlieb, Kotlyar and Nudelman's (1997), from the table every
chemist keeps by the spectrometer. In dry DMSO, ethanol's OH proton stays on its molecule long
enough to couple to the CH₂ (the 5 Hz their notes mention); in chloroform it hops between
molecules, its coupling averages away and it is a singlet. 2-Propanol's OH, whose shift wanders
with concentration, is left out.

When J is small beside the shifts' spacing (high keys), the spectrum is **first order**: each
group splits into multiplets by Pascal's triangle, a CH₃ next to a CH₂ into a 1 : 2 : 1 triplet
J apart, a CH next to six methyl protons into a septet. On the low keys, weak magnets, the
spacing is only a dozen J or so and the spectrum turns **second order**: the multiplets lean
towards each other (the "roof effect") and extra lines appear. Two coupled protons give the AB
quartet,

    ν = ν̄ ± J/2 ± D/2,   D = √(Δν² + J²),   inner/outer = (1 + J/D)/(1 − J/D)

and the instrument's spectrum matches it exactly (tested).

Lines a few hertz apart are not heard apart. They beat: a triplet is a note throbbing at J, a
quartet a sharper throb. That is what the couplings sound like.

### 3. The pulse and the signal

In equilibrium the spins lean slightly along the field: in the high-temperature limit the density
matrix is ρ ∝ F_z. A key's pulse tips this by an angle θ (velocity × the pulse angle at full
velocity, 90° by default) about x. The receiver hears both quadrature channels of Tr(ρ F₊): after
the pulse that is sin θ times a sum over the single-quantum coherences between eigenstates
|a⟩ and |b⟩ (M_b = M_a + 1),

    s(t) = sin θ Σ_ab ρ_ab ⟨a|F₋|b⟩ e^{i(E_b − E_a)t}

Each distinct frequency E_b − E_a is a line, its height its share of the signal; the shares add up
to one, and each group's lines carry its share of the protons (3 : 2 : 1 in ethanol, which is how
Arnold, Dharmatti and Packard knew in 1951 that they were seeing ethanol's three groups). Quadrature
puts the real channel on the left and the imaginary one on the right: each line arrives a quarter of
its period later on the right.

### 4. Dephasing, and Hahn's echo

No magnet is perfectly even. Spins in slightly stronger field precess slightly faster, so they fan
out and their sum, the note, fades. The **shim** parameter is that spread, in parts per billion of
the field: a full width Δν = shim × f₀ in hertz, so higher keys (stronger fields) fade faster. Over
the sample the field's spread has a shape (the **profile**), and the signal is its Fourier
transform, a function of the phase S = 2πΔν t the spread has given the spins:

| profile | what is left of the signal |
|---|---|
| Lorentzian (a shimmed magnet) | e^{−\|S\|/2}, an exponential fade, T₂′ = 1/(πΔν) |
| Gaussian | e^{−(S/2.355)²/2} |
| a linear gradient along the tube | sinc(S/2): it dies, comes back weaker, dies again |

The spread is a term ΔB F_z in the Hamiltonian, which commutes with H, so it only adds a phase to
each coherence. A π pulse about y is the rotation R = ⊗ d^S(π), which takes |S, m⟩ to
(−1)^{S−m} |S, −m⟩: it maps coherence order +1 exactly onto −1 (ρ' = R ρ Rᵀ) and so negates every
phase the spread has given. After a pulse at τ the phase runs back to zero at 2τ: the spins come
back into step, and the note swells to an **echo**, then fades again. Every π pulse does this, so
the engine follows one phase S for a sample, negated at each pulse, and the coherences themselves.

The chemical shifts are refocused too, but **not the J couplings**: the pulse flips the coupled
partner as well, so a coupling's phase keeps growing. In first order, the echo at 2τ is

    Σ_g n_g Π_h cos(2πJ_gh τ)^{n_h} / N

(Hahn and Maxwell, 1952), and the instrument gives it exactly (tested). Beyond first order the pulse
also moves coherence between coupled groups, which the exact calculation keeps.

The mod wheel spoils the shim while a note sounds: the spins dephase faster, and still come back.
The pitch wheel moves the whole field (a field offset, as a spectrometer's Z0 shim): every line
moves by the same number of hertz, not the same ratio, so a bent chord changes shape. It is a ΔB F_z
term too, so a π pulse refocuses it as well.

### 5. Relaxation: T₂ and T₁

What no echo can undo is **T₂**: the spins' real loss of phase, by the fluctuating fields of
tumbling molecules. Every echo is at most e^{−t/T₂} of the note's start (the dashed line in the
Receiver view, and the ring in the Spins view). T₂ cannot exceed 2T₁.

**T₁** is how long the magnetisation takes to grow back along the field after a pulse has tipped
it. A pulse of angle θ leaves cos θ of it along the field; it then recovers as

    M_z(t) = 1 − (1 − M_z(0)) e^{−t/T₁}

and the next strike of the key sounds as sin θ × M_z. Strike again too soon at 90° and there is
little left: the note **saturates**. Softer notes tip less and leave more, the trade Ernst worked
out for repeated pulses. A π pulse turns every sounding sample's magnetisation upside down, and a
key struck then sounds inverted until it recovers.

### 6. Diffusion

Molecules wander while they precess. In a field that varies across the sample, a wandered spin
returns to a different field, and its phase no longer cancels at the echo. For a gradient G and a
diffusion coefficient D, the signal falls by

    exp(−D γ²G² ∫ k(t)² dt)

where k(t) is the phase per unit length the gradient has wound in (negated with S at each pulse).
For one echo at 2τ this is Hahn's exp(−⅔ γ²G²D τ³) (tested); a train of short echo times keeps the
integral small, which is why Carr and Purcell's train outlasts a single echo in a poor magnet. The
instrument takes the gradient as the field's spread over the probe's coil, γG = 2πΔν/L with
L = 18 mm, and D for each sample (rounded: HDO in D₂O 1.9 × 10⁻⁹ m²/s, small molecules in
chloroform 2.5 × 10⁻⁹ and in DMSO 0.8 × 10⁻⁹).

### 7. The receiver

The receiver opens 2 ms after the pulse (the probe rings down first) and, by default, listens while
the key is held, like a key on an organ; *Until the signal has gone* keeps it open after the key comes
up, so notes ring out and still answer the pedal. The probe's coil and preamplifier add thermal
noise while it listens, through a filter just above the highest line.

## What to listen for

* **The chord.** Each molecule is its own chord: ethanol, ethyl acetate (a triplet, a singlet and a
  quartet), 2-propanol (a doublet and a septet). Water is one pure line.
* **The beat.** With a perfect shim, the multiplets throb at their J: 7 Hz in ethanol's CH₃, and a
  slower, knottier rhythm in its CH₂, coupled both ways.
* **The fade, high and low.** The same shim fades the treble faster than the bass, because the field
  is stronger there.
* **The echo.** Hold a note, let it fade, press the pedal at τ: it returns at 2τ, swelling and fading
  symmetrically. In ethanol the echo's chord is coloured by the couplings, which the pulse does not
  refocus.
* **The train.** Hold the pedal with the echo train on: the notes pulse back every echo time, falling
  only by T₂.
* **Saturation.** With a long T₁, repeat a note at full velocity: it fades away; with small pulse
  angles it keeps sounding.
* **Second order.** Low keys lean: listen for extra lines and uneven multiplets around A0–A2.
* **The gradient.** Its sinc fade dies and returns; with a poor shim, diffusion takes the late echoes.

## Files

```
nmr/src/nmr-params.js                 the parameters and presets
nmr/src/nmr-instrument.js             the descriptor
nmr/src/nmr-wasm.js                   the engine and model, as WebAssembly
nmr/src/nmr-main.js                   the page's views
nmr/src/nmr-tour.js                   the guided tour
native/instruments/nmr/nmr-model.*    the spins: samples, Hamiltonian, π pulse, line shapes
native/instruments/nmr/nmr-engine.*   the real-time engine
native/instruments/nmr/nmr-web.cpp    the model's functions for the page and the tests
test/nmr-tests.mjs                    the tests
tools/render-nmr.mjs                  the demos
```

## Simplifications

* **Perfect, instantaneous pulses.** Real pulses take microseconds and are a few degrees off; a
  π pulse that is not quite π leaves some coherence where it was and makes stimulated echoes, which
  is what Meiboom and Gill's phase was for. Here every pulse is exact, so the train's phase is the
  only one that matters and no stimulated echoes form.
* **One T₂ and one T₁** for every group of a sample, set by the parameters rather than computed from
  the molecules' tumbling; a real ethanol's groups relax at slightly different rates.
* **Chemical exchange** is all or nothing: ethanol's OH is either coupled (DMSO) or a singlet
  (chloroform), with nothing in between.
* **The field's spread** has the same shape everywhere, and diffusion treats it as a gradient over
  the coil, whatever its profile.
* **Each restrike spoils** the coherence left from the key's last pulse (as a spectrometer's
  spoiler gradient would), and the pedal pulses only the samples still sounding.
* **The receiver** has no dead-time distortion, no phase errors, no digital filter beyond the noise's.
* **High-temperature equilibrium**: the polarisation is linear in the field, as it is at any
  temperature a liquid can have. Loudness does not grow with the field (each key is turned up to
  match), though a real stronger magnet gives more signal.

## Quality

* **High** plays every line the Hamiltonian gives (97 for ethanol in DMSO at A4, many a few
  millihertz apart) and up to 24 samples at once.
* **Medium** merges lines closer than 0.05 Hz (beats slower than twenty seconds) into one at their
  mean, keeps the 32 strongest, and sounds up to 12 samples.
* **Low** merges lines closer than 0.5 Hz, keeps the 16 strongest, and sounds up to 6 samples.

Pitch and loudness are kept (tested). The echoes, couplings and relaxation are the same at every level.

## Prior art and references

### The instrument

* F. Bloch, "Nuclear Induction", *Phys. Rev.* 70, 460–474 (1946),
  [doi:10.1103/PhysRev.70.460](https://doi.org/10.1103/PhysRev.70.460), and E. M. Purcell, H. C. Torrey and
  R. V. Pound, "Resonance Absorption by Nuclear Magnetic Moments in a Solid", *Phys. Rev.* 69, 37 (1946),
  [doi:10.1103/PhysRev.69.37](https://doi.org/10.1103/PhysRev.69.37): NMR in bulk matter.
* E. L. Hahn, "Spin Echoes", *Phys. Rev.* 80, 580–594 (1950),
  [doi:10.1103/PhysRev.80.580](https://doi.org/10.1103/PhysRev.80.580): free precession, the echo and its
  diffusion attenuation.
* H. Y. Carr and E. M. Purcell, "Effects of Diffusion on Free Precession in Nuclear Magnetic Resonance
  Experiments", *Phys. Rev.* 94, 630–638 (1954),
  [doi:10.1103/PhysRev.94.630](https://doi.org/10.1103/PhysRev.94.630): the π pulse and the echo train.
* S. Meiboom and D. Gill, "Modified Spin-Echo Method for Measuring Nuclear Relaxation Times",
  *Rev. Sci. Instrum.* 29, 688–691 (1958), [doi:10.1063/1.1716296](https://doi.org/10.1063/1.1716296):
  the train's phase.
* R. R. Ernst and W. A. Anderson, "Application of Fourier Transform Spectroscopy to Magnetic Resonance",
  *Rev. Sci. Instrum.* 37, 93–102 (1966), [doi:10.1063/1.1719961](https://doi.org/10.1063/1.1719961):
  pulsed NMR, and the best angle for repeated pulses.
* Bruker, "Bruker Announces First-of-a-kind 1.3 GHz High-Resolution NMR System" (April 2025,
  [press release](https://www.businesswire.com/news/home/20250407030056/en/Bruker-Announces-First-of-a-kind-1.3-GHz-High-Resolution-NMR-System)):
  30.5 T, the strongest NMR magnet.

### The physics

* J. T. Arnold, S. S. Dharmatti and M. E. Packard, "Chemical Effects on Nuclear Induction Signals from
  Organic Compounds", *J. Chem. Phys.* 19, 507 (1951),
  [doi:10.1063/1.1748264](https://doi.org/10.1063/1.1748264): ethanol's three lines, the first chemical
  shifts resolved in one molecule.
* H. S. Gutowsky, D. W. McCall and C. P. Slichter, "Nuclear Magnetic Resonance Multiplets in Liquids",
  *J. Chem. Phys.* 21, 279–292 (1953), [doi:10.1063/1.1698874](https://doi.org/10.1063/1.1698874): the
  couplings and their multiplets.
* E. L. Hahn and D. E. Maxwell, "Spin Echo Measurements of Nuclear Spin Coupling in Molecules",
  *Phys. Rev.* 88, 1070–1084 (1952), [doi:10.1103/PhysRev.88.1070](https://doi.org/10.1103/PhysRev.88.1070):
  the echo modulated by J.
* J. A. Pople, W. G. Schneider and H. J. Bernstein, *High-resolution Nuclear Magnetic Resonance*
  (McGraw-Hill, 1959): second-order spectra, the AB quartet and groups of equivalent nuclei.
* A. Abragam, *The Principles of Nuclear Magnetism* (Oxford, 1961), and M. H. Levitt, *Spin Dynamics*
  (Wiley, 2nd ed. 2008): the density matrix, rotations and relaxation.
* H. E. Gottlieb, V. Kotlyar and A. Nudelman, "NMR Chemical Shifts of Common Laboratory Solvents as
  Trace Impurities", *J. Org. Chem.* 62, 7512–7515 (1997),
  [doi:10.1021/jo971176v](https://doi.org/10.1021/jo971176v): the samples' shifts and couplings.
* E. Tiesinga, P. J. Mohr, D. B. Newell and B. N. Taylor, "CODATA recommended values of the fundamental
  physical constants: 2018", *Rev. Mod. Phys.* 93, 025010 (2021),
  [doi:10.1103/RevModPhys.93.025010](https://doi.org/10.1103/RevModPhys.93.025010): the proton's γ.

### Earlier models and syntheses

* W. Bauer, "NMR music" (University of Erlangen-Nuremberg, 1996; preserved at
  [organicchemistrydata.org](https://organicchemistrydata.org/misc/nmr-music/)): a spectrometer's free
  induction decays played straight from its receiver, with pulse programs for melodies.
* S. Cacciatore, E. Saccenti and M. Piccioli, "Hypothesis: the sound of the individual metabolic
  phenotype? Acoustic detection of NMR experiments", *OMICS* 19, 147–156 (2015),
  [doi:10.1089/omi.2014.0131](https://doi.org/10.1089/omi.2014.0131), and its R package
  [musicNMR](https://cran.r-project.org/package=musicNMR): measured FIDs as audio files.
* F. Morawitz, "Multilayered Narration in Electroacoustic Music Composition Using Nuclear Magnetic
  Resonance Data Sonification and Acousmatic Storytelling", ICAD 2019
  ([paper](https://icad2019.icad.org/wp-content/uploads/2019/06/ICAD_2019_paper_52.pdf)): NMR data in a
  composition.
* H. J. Hogben, M. Krzystyniak, G. T. P. Charnock, P. J. Hore and I. Kuprov, "Spinach – A software
  library for simulation of spin dynamics in large spin systems", *J. Magn. Reson.* 208, 179–194 (2011),
  [doi:10.1016/j.jmr.2010.11.008](https://doi.org/10.1016/j.jmr.2010.11.008), and M. Bak, J. T. Rasmussen
  and N. C. Nielsen, "SIMPSON: A General Simulation Program for Solid-State NMR Spectroscopy",
  *J. Magn. Reson.* 147, 296–330 (2000), [doi:10.1006/jmre.2000.2179](https://doi.org/10.1006/jmre.2000.2179):
  spin-dynamics simulators of the kind this engine is a small real-time cousin of.
