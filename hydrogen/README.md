# Hydrogen Lamp

Every key is a tube of glowing hydrogen, and its sound is the tube's
spectrum: every line the atom emits, at its exact frequency, moved down by
about 10¹² so that Hα, the red line of the Balmer series, is the key's
note. Hβ sounds 27/20 above it (a fourth and 22 cents), Hγ and Hδ higher,
and the series crowds up toward a just minor seventh (9/5), its limit. The
lines' strengths are the atom's: Einstein's coefficients from the exact
wavefunctions, every level from n = 1 to 50 and every angular momentum,
and the cascade of the atoms down through them. The atoms' time is slowed
down too, by 3 × 10⁷, so you hear the cascade happen: a key lights the low
lines first and the high ones later, as the levels above fill, and after it
the lines fade as the levels empty. Each line is as wide as its levels'
lifetimes make it (the uncertainty principle, by ear), and wider still in a
dense plasma, where the ions' fields smear the levels (the Stark effect).
The excitation chooses which levels the atoms reach: a discharge, a nebula's
recombination, or a laser into one level. A spectrometer's window chooses
which lines reach the ear: the visible Balmer series, the ultraviolet Lyman
series two octaves and a fourth up, or the infrared below.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/hydrogen/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 lamps, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how many atoms the key lights |
| `Space` | sustain: the lamps stay lit after the keys come up |
| MIDI | notes, velocity, sustain pedal (CC64); the mod wheel (CC1) is the plasma's density; pitch bend is a redshift; MPE gives each lamp its own redshift and, with CC74, its own density |

## The physics

Atomic units throughout (lengths in Bohr radii a₀, energies in hartree), with
the CODATA 2018 constants and the reduced mass μ = mₑ m_p/(mₑ + m_p) wherever
the nucleus's motion matters.

### 1. The levels and the lines

Hydrogen's levels, without the fine structure, are E_n = −μ/2n² hartree,
the same for every angular momentum l < n. A line n → m has the frequency
ν = μ R∞ c (1/m² − 1/n²) (the Rydberg formula), Hα (3 → 2) at 456.7 THz,
656.47 nm in vacuum. On a key of frequency f the line sounds at

  f_nm = f · (1/m² − 1/n²) / (5/36),

exact ratios: Lyα 27/5, Hβ 27/20, Paα 7/20. The instrument keeps the levels
n ≤ 50 and every l: 1275 states, 1225 lines and 40 425 transitions
nl → n′l′ with l′ = l ± 1, the electric dipole ones.

### 2. How fast each level decays

The Einstein coefficient of nl → n′l′ is

  A = (4/3) α³ ω³ · l_max/(2l + 1) · |⟨n′l′|r|nl⟩|² / τ₀ (s⁻¹),

with ω the line's angular frequency (in hartree, for an infinitely heavy
nucleus), l_max the larger of l and l′, and τ₀ = 2.4189 × 10⁻¹⁷ s the atomic
unit of time; the reduced mass multiplies it by μ (μ³ from ω³, 1/μ² from the
radial integral). The radial integrals are those of the
closed-form wavefunctions R_nl ∝ (2r/n)^l e^(−r/n) L^(2l+1)_(n−l−1)(2r/n):
for each pair of shells the integrand is a polynomial times e^(−r(1/n + 1/n′)),
which Gauss–Laguerre quadrature integrates exactly with enough nodes, so the
A's are exact (Gordon 1929 gave them in closed form). They match NIST's to
the digits it gives: A(2p → 1s) = 6.2649 × 10⁸ s⁻¹, A(3d → 2p) = 6.4651 × 10⁷.
A level's total decay rate Γ_nl = Σ A sets its lifetime: 1.596 ns for 2p,
5.27 ns for 3p, 158 ns for 3s; the high, round orbits (l = n − 1) live
longest, microseconds from n = 8 on. The 2s level has no dipole way down; it
decays by emitting two photons at once, at 8.229 s⁻¹ (in the model, though
its two-photon continuum is not heard).

### 3. How the atoms get up

The excitation fills the levels at a rate p_nl:

- **Discharge.** Electrons of temperature T strike atoms in the ground
  state. The collision rate into np follows van Regemorter's (1962)
  formula, C ∝ f(1s → np) (E_H/ΔE) e^(−ΔE/kT), with f the absorption
  oscillator strength (0.4162 for 1s → 2p, 0.0791 for 1s → 3p, …). The
  dipole-allowed p levels get most of it; a hotter discharge reaches higher.
- **Recombination.** In an ionised gas, as in a nebula round a hot star, a
  free electron is captured into nl at the rate α_nl(T) n_e n_p. The
  recombination coefficients come from first principles
  (`tools/hydrogen-native-table.mjs`): the photoionisation cross-section of
  each level from numerical Coulomb functions (Numerov's method, normalised
  at the origin by the Coulomb factor, so no matching far out is needed),
  turned into the capture cross-section by the Milne relation, averaged
  over a Maxwellian, and tabulated from 10³ to 10⁵ K. They reproduce Storey
  & Hummer's: α(1s) = 1.58 × 10⁻¹³ cm³ s⁻¹ at 10⁴ K, Case B 2.59 × 10⁻¹³
  (the tests check them).
- **Laser.** A laser on Lyman line n lifts every atom into np, and nothing
  else.

### 4. The cascade

An excited atom falls from level to level, l changing by one each step,
until it reaches 1s. The populations N of the levels obey

  dN_i/dt = p_i + Σ_j A_(j→i) N_j − (Γ_i + 1/τ_glow) N_i,

where τ_glow, the *Time in the glow*, is how long an excited atom stays in
the glow before it is carried out of it or quenched by a collision (60 ns by
default): every level drains at least that fast. A line's power is its
upper level's population times its A times its photon's energy. A level is
fed only from above, so the steady state solves from the top down. In a
thick gas the Lyman photons are caught by other atoms (*Case B*,
Baker & Menzel 1938): their A's are left out of the decays, and the atom
finds another way down, through the Balmer lines. Without the glow's drain
(τ_glow → ∞), Case B at 10⁴ K gives Hα : Hβ : Hγ : Hδ = 2.83 : 1 : 0.469 :
0.260, against Storey & Hummer's 2.86 : 1 : 0.468 : 0.259 (the 1 % short
on Hα is the cascade from above n = 50); with the default 60 ns, Hα/Hβ is
2.68. The discharge at 20 000 K gives 3.5.

A key switches its pump on, and its release off. The equations are linear,
so every key's lamp is the same *step response*, the lines' powers after a
switch-on, and a released lamp is that response minus the same response
started at the release. The response is solved once for each lamp setting,
by exponential Euler steps on a time grid fine where the fast levels fill
and coarse where only the slow ones change (t_k = τ_s (e^(hk) − 1), 400
rows, out to 25 times the slowest level's time constant), a few rows a
block as the sounding keys reach them, and shared by every key. Hα reaches
84 % of its steady power in 10 ns, Hβ 61 %, H10 (10 → 2) 20 %: in slow
motion, the low lines light first, the high ones over a second.

### 5. The widths of the lines

A line nl → n′l′ has a Lorentzian shape of full width (Γ_upper + Γ_lower)/2π
(both levels' decays, with the glow's drain), its natural width, which the
slow motion divides: at 3 × 10⁷, Hα's is about 1 Hz. To that the gas adds:

- **Doppler**: the atoms' thermal motion, a width
  Δν/ν = √(8 ln 2 · kT/m_H c²), 7.2 × 10⁻⁵ at 10⁴ K, proportional to the
  line's frequency (a few hundredths of a hertz on the keyboard: you hear
  it only at the top).
- **Stark**: each atom sits in the electric field of the ions near it,
  which splits level n into components (3/2) n(n₁ − n₂) e a₀ F apart. The
  field varies from atom to atom; its typical size is Holtsmark's normal
  field F₀ = 2.603 e N^(2/3)/4πε₀. The instrument takes a line's width as
  4.25 F₀ [n(n − 1) + m(m − 1)] (in energy), which matches Hβ's measured
  width, 4.8 nm at 10¹⁷ cm⁻³ (Gigosos, González & Cardeñoso 2003), grows
  as N^(2/3), and puts the merging of the series where Inglis and Teller
  (1939) found it: log N = 23.26 − 7.5 log n_max. The tests check all
  three. Turn up the density (the mod wheel) and the high lines smear into
  a hiss first; at 10¹⁸ cm⁻³ even Hα is a band of noise.

### 6. The fine structure

Relativity splits each level by its total angular momentum j = l ± ½, by
Dirac's formula,

  E_nj = μc² [(1 + (α/(n − δ_j))²)^(−1/2) − 1], δ_j = j + ½ − √((j + ½)² − α²),

(evaluated with expm1 and log1p, since the splitting is α² of the level),
10.94 GHz between 2p½ and 2p3/2. A line's components nlj → n′l′j′ share
its strength by the 6-j symbol, (2j′ + 1)(2l + 1){l′ ½ j′; j 1 l}² of each
j's share, and with the levels' populations; Dirac's levels depend on j
alone, so Hα's seven components fall at five frequencies. They are 0.3
cm⁻¹ apart, 2 × 10⁻⁵ of the line, which on A3 is a beat every three
minutes: inaudible, and narrower than the lines' widths. The
*Fine-structure constant* knob is a what-if: α up to 40 times its value.
The splitting grows as α², and the components are played as separate
tones once they are more than 0.02 Hz apart. The Lamb shift (QED) is left
out.

### 7. The sound

Each line is the light of a great many atoms, emitting with random phases:
a tone whose amplitude and phase wander. The instrument plays it as a
complex Gaussian process (Ornstein–Uhlenbeck: the complex amplitude relaxes
toward zero at the line's half-width and is kicked by noise), which gives
exactly the Lorentzian line, times a tone at the line's frequency. Its mean
power follows the step response. A voice plays every line of its lamp
within hearing (16 Hz to 20 kHz) and through the window, as one tone or as
its fine-structure components, the strongest 96 at High; its level is
normalised by the window's lines, so the infrared is as loud as the
visible, up to 30 dB of gain where the window lets little through. The
gains and the random walks update every 64 samples (1.3 ms) and glide
between. A key's lamp is panned by its place on the keyboard.

### 8. Playing

- **Velocity** is how many atoms the key lights: the level, not the
  spectrum.
- **Pitch bend is a redshift**: the lamp moving away from you, every line
  down by the same ratio (two semitones at full bend; MPE, ±48), and the
  window follows the shifted wavelengths, so a strong redshift slides lines
  out of the visible and others in from the ultraviolet.
- **The mod wheel** is the density.
- A change of window, α, slow motion or temperature rebuilds the sounding
  lamps' lines at once, the lines that stay keeping their phases; a change
  of the lamp (excitation, Case B, the glow, the laser's level) builds the
  new step response and lights the next keys with it, while the sounding
  ones carry on.
- Space keeps the lamps lit after their keys.
- **The shutter** is not physics: when a lamp goes out (its key comes up,
  or the pedal for a lamp it held), the spectrometer's shutter closes over
  its light, 60 dB down in the *Shutter on release* time (1 s by default,
  in real time, not the atoms'), on top of the atoms' own fade. All the
  way up it stays open, and a lamp fades only as its levels empty: about
  10 s at the default slow motion, the slowest levels as fast as the glow
  drains them.

## What to listen for

- **The cascade**: hold a key with the *Laser to 12p* preset and the lines
  light one after another, the ones from 12p at once, those lower down as
  the cascade reaches them (demo 02).
- **A discharge and a nebula**: a discharge fills the low levels (Hα loud,
  a short series), recombination the high ones too, and the series reaches
  higher (demo 03).
- **The windows**: the same chord through the visible, ultraviolet and
  infrared (demo 04). The Lyman series is far above the keys' notes; the
  infrared far below.
- **Density**: the mod wheel smears the lines from the top of the series
  down, until the chord is a band of noise (demo 05).
- **The fine structure**: with α at 12 times its value, each line splits
  into components that beat (demo 06).
- **Redshift**: pitch bend (demo 07).
- **Slow motion**: less of it and the lamp lights at once, with rough,
  wide lines; more and the lines are pure but take seconds to light
  (demo 08).

## Files

```
hydrogen/index.html, style.css            page
hydrogen/src/hydrogen-params.js           parameters and presets
hydrogen/src/hydrogen-instrument.js       the descriptor: everything but the page
hydrogen/src/hydrogen-main.js             page wiring and views
hydrogen/src/hydrogen-wasm.js             the engine and model, the C++ as WebAssembly (hydrogen/wasm/hydrogen.wasm)
native/instruments/hydrogen/              the physics in C++: model, engine, reference (plugins and WebAssembly)
native/instruments/hydrogen/hydrogen-recombination.h   the recombination coefficients, made by:
tools/hydrogen-native-table.mjs           node tools/hydrogen-native-table.mjs (about 17 minutes)
test/hydrogen-tests.mjs                   node test/hydrogen-tests.mjs (27 tests, about 20 s)
tools/render-hydrogen.mjs                 node tools/render-hydrogen.mjs → examples/hydrogen/
```

## Simplifications

* **No collisions between the levels.** In a real discharge or a dense
  nebula, collisions with electrons and protons also move atoms between
  levels (l-mixing within a shell, n-changing between them), which matters
  for the high levels above about 10⁴ cm⁻³; here the density only broadens
  the lines. The discharge excites only from the ground state, and only
  into the p levels.
* **The atom stops at n = 50.** The levels above it, and their cascade, are
  left out: about 1 % of Hα in a nebula.
* **The glow's drain** is one rate for every level, a stand-in for the
  atoms' leaving the glow and being quenched. It is what makes the light
  fade after a key with the shutter open; it also shifts the line ratios from a nebula's (Hα/Hβ
  2.68 at the default 60 ns, rather than 2.83).
* **No absorption but Case B's.** The gas is either thin to every line
  (Case A) or opaque to the Lyman lines and thin to the rest (Case B);
  the Balmer lines' own absorption, and the 2s level's two-photon
  continuum, are left out.
* **The Stark profiles are Lorentzians** of a width calibrated on Hβ, not
  the computed profiles (with their central dips for Hβ and Hδ), and they
  ignore the electrons' impact broadening and the shifts of the lines.
* **The fine structure is Dirac's**, without the Lamb shift or the
  hyperfine structure, and its components share their upper level's
  population in proportion to 2j + 1.
* **The frequencies are exact; the times are not to scale with them.** The
  frequencies come down by about 10¹², the times by the slow motion (3 × 10⁷
  by default), so the lines are relatively far wider than in the real lamp,
  where Hα is 10⁸ times narrower than its frequency.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims what plays
at once: 16 lamps at Medium and 8 at Low, against 32 at High (past them the
oldest goes out), and the lines each lamp plays, its strongest 40 at Medium
and 16 at Low against 96 at High. Through the visible window a lamp plays
about ten lines, so only the *Every line* and infrared settings lose any.

## Prior art and references

**The atom.**
* A. Kramida, Yu. Ralchenko, J. Reader and the NIST ASD Team, *NIST Atomic
  Spectra Database* (version 5.11, 2023),
  [physics.nist.gov/asd](https://physics.nist.gov/asd): the wavelengths and
  transition probabilities the tests check against.
* W. L. Wiese & J. R. Fuhr, "Accurate Atomic Transition Probabilities for
  Hydrogen, Helium, and Lithium", *J. Phys. Chem. Ref. Data* 38, 565
  (2009), [doi:10.1063/1.3077727](https://doi.org/10.1063/1.3077727).
* W. Gordon, "Zur Berechnung der Matrizen beim Wasserstoffatom", *Ann.
  Phys.* 394, 1031 (1929),
  [doi:10.1002/andp.19293940807](https://doi.org/10.1002/andp.19293940807):
  the radial integrals in closed form.
* H. A. Bethe & E. E. Salpeter, *Quantum Mechanics of One- and Two-Electron
  Atoms* (Springer, 1957): the wavefunctions, the fine structure, the
  oscillator strengths and their sum rules.
* M. Göppert-Mayer, "Über Elementarakte mit zwei Quantensprüngen", *Ann.
  Phys.* 401, 273 (1931), [doi:10.1002/andp.19314010303](https://doi.org/10.1002/andp.19314010303),
  and S. P. Goldman & G. W. F. Drake, "Relativistic two-photon decay rates of
  2s½ hydrogenic ions", *Phys. Rev. A* 24, 183 (1981),
  [doi:10.1103/PhysRevA.24.183](https://doi.org/10.1103/PhysRevA.24.183):
  the 2s level's two-photon decay.

**The glow.**
* H. van Regemorter, "Rate of Collisional Excitation in Stellar
  Atmospheres", *ApJ* 136, 906 (1962),
  [doi:10.1086/147445](https://doi.org/10.1086/147445).
* A. Burgess, "Tables of hydrogenic photoionization cross-sections and
  recombination coefficients", *Mem. R. Astron. Soc.* 69, 1 (1965): the
  method of the recombination table.
* J. G. Baker & D. H. Menzel, "Physical Processes in Gaseous Nebulae. III.
  The Balmer Decrement", *ApJ* 88, 52 (1938),
  [doi:10.1086/143959](https://doi.org/10.1086/143959): Cases A and B.
* D. G. Hummer & P. J. Storey, "Recombination-line intensities for hydrogenic
  ions. I", *MNRAS* 224, 801 (1987),
  [doi:10.1093/mnras/224.3.801](https://doi.org/10.1093/mnras/224.3.801), and P. J. Storey & D. G. Hummer,
  "Recombination line intensities for hydrogenic ions. IV", *MNRAS* 272, 41
  (1995), [doi:10.1093/mnras/272.1.41](https://doi.org/10.1093/mnras/272.1.41):
  the recombination coefficients and the Balmer decrement the tests check.
* D. E. Osterbrock & G. J. Ferland, *Astrophysics of Gaseous Nebulae and
  Active Galactic Nuclei* (University Science Books, 2nd ed., 2006),
  chapters 2 and 4.

**The widths.**
* J. Holtsmark, "Über die Verbreiterung von Spektrallinien", *Ann. Phys.*
  363, 577 (1919), [doi:10.1002/andp.19193630702](https://doi.org/10.1002/andp.19193630702).
* D. R. Inglis & E. Teller, "Ionic Depression of Series Limits in One-Electron
  Spectra", *ApJ* 90, 439 (1939),
  [doi:10.1086/144118](https://doi.org/10.1086/144118).
* M. A. Gigosos, M. Á. González & V. Cardeñoso, "Computer simulated
  Balmer-alpha, -beta and -gamma Stark line profiles for non-equilibrium
  plasmas diagnostics", *Spectrochim. Acta B* 58, 1489 (2003),
  [doi:10.1016/S0584-8547(03)00097-1](https://doi.org/10.1016/S0584-8547(03)00097-1):
  Hβ's width against density, used to set the Stark widths.

**Spectra as sound.**
* Sonifications of spectra are many: stellar and planetary spectra played as
  chords or sweeps (NASA's and ESA's data sonifications, the Chandra
  [sonification project](https://chandra.si.edu/sound/)), and "the sound of
  hydrogen" as its Balmer lines scaled into hearing. Here the lines'
  strengths, widths and timing come from the atom's own rates, and they
  play in time as the cascade happens.
