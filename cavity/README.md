# RF Cavity Bells

A particle accelerator's cavities as a keyboard. Every key is a
superconducting niobium cavity of nine coupled cells, built like the 1.3 GHz
cavities of TESLA, the European XFEL and LCLS-II, and pressing it sends a bunch
of charged particles through it. The bunch leaves the cavity ringing: in the
accelerating mode, which is the note, and also in the eight other modes of
that **passband**, spread a couple of per cent below the note by the coupling
between the cells, and in the **higher-order modes** (TM011, TM110, TM111, …)
that sit at the bell-like, inharmonic ratios of a pillbox's Bessel zeros. A
bunch in step with the accelerating mode rings it almost alone. Out of step,
or off the axis, or short, it rings the rest, and the passband's modes beat.
Held keys send a train of bunches that builds the field up (**beam loading**)
until the field squeezes the cells out of tune (**Lorentz-force detuning**),
or until the niobium goes normal and the field collapses (**a quench**).
Nothing is sampled: every mode's frequency, the kick a bunch gives it and the
rate it loses its energy come from the cavity's geometry, the couplers and
the niobium's surface resistance, and the tests check them against Bessel
tables, the coupled cells' eigenproblem solved as a matrix, integrals of the
fields, and TESLA's measured losses.

The cavities are scaled to sound. A key's accelerating mode is its note, and
every key's cavity stands for a 1.3 GHz TESLA cavity: its losses, its
couplers and the niobium's surface resistance are that cavity's, and only the
Q is scaled (by 6 × 10⁻⁷) so that a cavity rings for seconds rather than for
the 1.7 s a real one rings with no beam at an external Q of 10⁹.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/cavity/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): send a bunch through that key's cavity; held, a train follows it when Beam current is up |
| `←` `→` | octave |
| `↑` `↓` | velocity: the bunch's charge |
| `Space` | keep the input couplers' antennas back, so cavities ring on after the keys come up |
| MIDI | notes, velocity (charge), sustain pedal (CC64), **mod wheel = beam offset**, **aftertouch = beam current** (channel for every cavity, polyphonic for its own), **pitch bend = the tuner** (±2 semitones) |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch: more beam current through that cavity |

## The physics

### 1. One cell: a pillbox and its modes

A cell is a pillbox of radius R and length d. Its modes TM_mnp have an
electric field ∝ J_m(j_mn r/R) cos(mϕ) cos(pπz/d) and stand at

  f_mnp = (c/2π) √((j_mn/R)² + (pπ/d)²)

with j_mn the n-th zero of the Bessel function J_m (Abramowitz & Stegun table
9.5): j01 = 2.405, j11 = 3.832, j02 = 5.520, j12 = 7.016. TM010, the lowest,
has a field along the axis and accelerates. A cell is β_g λ/2 long, half the
distance a particle at the design speed β_g c covers in a period, so that the
field has turned round by the time the particle reaches the next cell; that
fixes πR/d = j01/(β_g √(1 − k)) and with it every mode's ratio to TM010. The
model keeps seven bands, the ones a bunch rings most:

| band | m | radial zero | p | ratio at β_g = 1 | at β_g = 0.61 |
|---|---|---|---|---|---|
| TM010 | 0 | j01 | 0 | 1 (the note) | 1 |
| TM011 | 0 | j01 | 1 | 1.42 | 1.93 |
| TM110 | 1 | j11 | 0 | 1.59 | 1.59 |
| TM111 | 1 | j11 | 1 | 1.89 | 2.30 |
| TM012 | 0 | j01 | 2 | 2.25 | 3.46 |
| TM020 | 0 | j02 | 0 | 2.30 | 2.30 |
| TM120 | 1 | j12 | 0 | 2.92 | 2.92 |

Shorter cells, for slow protons (**Cell design speed**), push the modes with
a longitudinal node up and away from the others.

### 2. N cells: passbands

The cells are coupled through their irises, each to its neighbours with a
coupling k (**Cell-to-cell coupling**; TESLA's is 1.87 %). In the circuit
model of Nagle, Knapp & Knapp (1967) each cell is a resonator, and cell n's
field X_n obeys

  (ω_c/ω)² X_n = X_n + (k/2)(X_{n−1} + X_{n+1})

so a single cell's mode at ω_c becomes a passband of N modes,

  ω = ω_c / √(1 + k cos φ),

with φ the phase advance from cell to cell. The accelerating mode is the π
mode, φ = π: the field flips from each cell to the next, in step with a
particle crossing one cell per half period. Its end cells are tuned (TESLA's
are) so that the π mode is flat, the same field in every cell: the cell
beyond each end mirrors as −X_end, the modes are X_n ∝ sin(φ(n − ½)),
φ = mπ/N, and the eight other modes of a nine-cell cavity lie 0.06 % to 1.8 %
below the note. The higher-order bands are not tuned: X_n ∝ sin(φn),
φ = mπ/(N + 1). The tests solve the N × N eigenproblem as a matrix and check
both. **Cells** sets N, from one pillbox to twelve.

### 3. The bunch: what each mode is given

A bunch of charge q crossing the cavity at speed βc leaves each mode with an
amplitude in proportion to the voltage the mode shows it on the way (the
fundamental theorem of beam loading; Wangler):

  V = Σ_n X_n e^{iθ(n−1)} · ∫₀¹ cos(pπu) e^{iθu} du · J_m(j_mn r)

where θ = π (f/f_π)(β_g/β) is the mode's phase turn while the bunch crosses
one cell, the integral is the **transit-time factor** of a cell with p
longitudinal half-waves, and the Bessel factor is the field where the bunch
passes, r its offset as a share of the radius (**Beam offset**, the mod
wheel). On the axis only the monopoles (m = 0) are rung; off it, the dipoles
(TM110, TM111, TM120) too, the modes that deflect a real beam
(Panofsky & Wenzel 1956) and that a linac's HOM couplers are there to damp.
The kick is V divided by the square root of the mode's stored energy per unit
field (the tests integrate it over the pillbox), times the Gaussian bunch's
form factor exp(−(2πfσ)²/2) (**Bunch length**): a short bunch rings the
higher modes, a long one only the accelerating mode. In units where a full
bunch leaves the matched π mode a field of 1 in every cell, the π mode takes
√N, and in step (**Particle speed** β = β_g) the other modes of its passband
take less than half a per cent of that. Out of step, the bunch keeps time with
another mode of the passband instead, and the cavity beats.

### 4. Losses: the couplers and the niobium

Each mode's energy decays at 2πf/Q_L, its loaded Q from three things:

* **The input coupler** (**Q_ext**, 10⁹ by default; TESLA's is adjustable from
  10⁶ to 9 × 10⁶ for the beam, Aune et al. 2000) on the first cell reaches each mode
  of the accelerating passband by its field there: 1/Q_ext,m = N X₁²/Q_ext. The
  π mode's share is 1; the passband's lowest mode, with little field in the
  end cell, rings seven times longer.
* **The HOM couplers** (**HOM couplers**) at both ends damp the higher-order
  modes by (N/2)(X₁² + X_N²)/Q_hom and are notched at the accelerating
  passband, as TESLA's are at 1.3 GHz. A mode with little field in the end
  cells is trapped and rings on.
* **The walls.** Q₀ = G/R_s with G = 270 Ω, TESLA's geometry factor, and the
  niobium's surface resistance from BCS theory (Bardeen, Cooper & Schrieffer
  1957; Mattis & Bardeen 1958) in its usual low-temperature form

    R_s = A (f/1.5 GHz)² / T · exp(−Δ/kT) + R_res

  with A and Δ/k = 18 K (Δ ≈ 1.9 kT_c) set to TESLA's 15 nΩ at 2 K and 800 nΩ
  at 4.2 K, and R_res = 10 nΩ. At 2 K, Q₀ ≈ 10¹⁰; at 4.2 K, 3 × 10⁸, and C4
  rings 1.3 s instead of 4.6. Above niobium's critical temperature of 9.25 K
  (**Helium bath**) the cavity is a normal metal, Q₀ ≈ 2 × 10⁵, and only clicks.
  Every key's walls are a 1.3 GHz cavity's.

Letting go of a key pushes the coupler's antenna in to **Coupler on release**
(3 × 10⁷), so the cavity rings out in about 0.15 s at C4. The pedal keeps it
back.

At a constant Q a mode rings for Q/(πf) times ln 1000: low keys ring longer,
C4's π mode 4.6 s, A0's 44 s, C8's 0.3 s.

### 5. Beam loading

While a key is held and **Beam current** is up (or the key is pressed
harder), a bunch follows the first every **Bunch spacing** periods of the
accelerating mode, each with 5 % of the first's charge at full current. The
train keeps time with the accelerator's master oscillator, so it is in step
with the π mode, and each bunch adds to what the last left: the mode builds
up as a geometric series to q|K|/(1 − e^{−σT_b}), where the losses take as
much each period as the beam gives. The other modes are pulled onto the
train's harmonics. Bunches arrive between samples; each kick is placed at its
exact time.

### 6. Lorentz-force detuning and the walls

The field's radiation pressure pushes the walls in at the equator and out at
the irises, which lowers the frequency in proportion to the stored energy:
Δf = −K E². TESLA's cavities detune by about 600 Hz at 25 MV/m, more than their
bandwidth (Aune et al. 2000). Here **Lorentz-force detuning** gives the
detuning, in cents, at the field one full-velocity bunch leaves. The walls do
not follow the force at once: they are a mechanical resonator (**Mechanical
resonance**, Q = 3), so a hard strike is pulled flat within a few periods of
the walls' mode, overshooting, and rises back to pitch, wobbling, as the
field rings down. The pitch wheel is the tuner and
moves the cavity and the master oscillator together; the Lorentz detuning
moves the cavity alone, so it takes a detuned cavity out of step with the
beam, which is what limits a train's buildup on a real linac.

### 7. Quench

If the field in any cell passes the **Quench field** (in units of a
full-velocity bunch's), the niobium goes normal: the whole cavity's walls
take the normal-conducting Q₀ and the field collapses in milliseconds. After
**Recovery after a quench** the helium has it superconducting again, and a
train still running builds the field up again: a held note that pulses.

### 8. What you hear

Two field probes, one in each end cell, on the two channels (**Probes**):
the π mode is in phase at both ends of an odd cavity and opposite in an even
one, and the passband's other modes sit apart in the stereo. **Far end**
puts the transmitted-power probe alone on both channels.

## What to listen for

The demos in `examples/cavity/`:

* **Bells at two kelvin** (default): a struck, glassy tone with quiet
  partials at 1.42, 1.59 and 1.89 times the note from the higher-order modes.
* **In step, then out of step**: the same notes at β = 1, then at β = 0.8,
  where the bunch rings the whole passband and the nine modes beat slowly.
* **Long bunch, then short and off the axis**: a long bunch on the axis
  rings the accelerating mode alone; a short one off the axis with the HOM
  couplers gone rings every band, a bright bell.
* **Beam loading**: held notes with a bunch train swell to a steady level.
* **Quench and recover**: a held note's train builds the field past the
  quench field, it collapses, recovers and builds again.
* **Warming the helium**: 2 K, 4.2 K, 6 K, then 10 K, above T_c, a click.
* **Lorentz detuning**: hard strikes start flat and wobble up to pitch.
* **One cell, then nine**: a pillbox's single modes, then passbands that beat.
* **Pressure is beam current**: a held note that swells as the key is pressed.

On the page, **The cavity** shows the cells in section with the field in
each (slowed down), the bunch crossing, the walls squeezed by the Lorentz
force and a quench in red; **The passband** shows the dispersion curve with
each mode's level and the beam's line, and the higher bands' levels.

## Files

```
cavity/index.html, style.css          page
cavity/src/cavity-params.js           parameters and presets
cavity/src/cavity-instrument.js       the descriptor: everything but the page
cavity/src/cavity-main.js             page wiring and views
cavity/src/cavity-wasm.js             the engine and model, the C++ as WebAssembly (cavity/wasm/cavity.wasm)
native/instruments/cavity/            the physics in C++: model, engine, generated tables, reference (plugins and WebAssembly)
test/cavity-tests.mjs                 node test/cavity-tests.mjs (24 tests, about 4 s)
tools/render-cavity.mjs               node tools/render-cavity.mjs → examples/cavity/
```

## Simplifications

* **Pillbox cells, not elliptical ones.** Real cells are rounded to keep
  multipacting and field emission down, which moves the higher-order modes:
  TESLA's TM011-like band is at 1.89 times the note, the pillbox's at 1.42.
  The pillbox keeps the modes' ratios to Bessel zeros the tests can check.
* One coupling k for every band; in a real cavity each band has its own, and
  some higher bands' are stronger than the accelerating band's.
* The Lorentz detuning moves every mode by the same share, set by the
  accelerating passband's energy; the mechanical response is one mode.
* A quench turns the whole cavity normal at once, rather than a spot that
  spreads.
* Pushed in on release, the input coupler damps every mode at least as hard
  as the π mode; a real antenna would reach each by its end-cell field and the
  trapped modes would ring on.
* The probes hear each mode's amplitude times its end-cell field; a real
  probe's coupling to each band differs.
* The Q is audio-scaled (6 × 10⁻⁷) and every key's cavity has a 1.3 GHz
  cavity's losses, so the bath temperature does the same to every key.
* The bunch's own field and its wakefield in the beam pipe are left out, and
  the bunches are not themselves accelerated or deflected.

## Prior art and references

**The physics**

* B. Aune et al., "Superconducting TESLA cavities", *Phys. Rev. ST Accel.
  Beams* 3, 092001 (2000),
  [doi:10.1103/PhysRevSTAB.3.092001](https://doi.org/10.1103/PhysRevSTAB.3.092001),
  [arXiv:physics/0003011](https://arxiv.org/abs/physics/0003011): the nine-cell
  cavity, its 1.87 % cell coupling, G = 270 Ω, the input and HOM couplers,
  the surface resistance at 2 K and 4.2 K, and the Lorentz-force detuning.
* D. E. Nagle, E. A. Knapp and B. C. Knapp, "Coupled resonator model for
  standing wave accelerator tanks", *Rev. Sci. Instrum.* 38, 1583–1587 (1967),
  [doi:10.1063/1.1720608](https://doi.org/10.1063/1.1720608): the circuit
  model of coupled cells and their passband.
* W. K. H. Panofsky and W. A. Wenzel, "Some considerations concerning the
  transverse deflection of charged particles in radio-frequency fields",
  *Rev. Sci. Instrum.* 27, 967 (1956),
  [doi:10.1063/1.1715427](https://doi.org/10.1063/1.1715427): how the dipole
  modes deflect a beam.
* J. Bardeen, L. N. Cooper and J. R. Schrieffer, "Theory of
  superconductivity", *Phys. Rev.* 108, 1175–1204 (1957),
  [doi:10.1103/PhysRev.108.1175](https://doi.org/10.1103/PhysRev.108.1175),
  and D. C. Mattis and J. Bardeen, "Theory of the anomalous skin effect in
  normal and superconducting metals", *Phys. Rev.* 111, 412–417 (1958),
  [doi:10.1103/PhysRev.111.412](https://doi.org/10.1103/PhysRev.111.412): the
  surface resistance's exp(−Δ/kT).
* H. Padamsee, J. Knobloch and T. Hays, *RF Superconductivity for
  Accelerators* (Wiley, 1998; 2nd ed. Wiley-VCH, 2008): pillbox modes,
  geometry factor, BCS losses, multi-cell passbands, Lorentz detuning and
  quench.
* T. P. Wangler, *RF Linear Accelerators* (Wiley, 1998; 2nd ed. Wiley-VCH,
  2008): transit-time factors, coupled-cavity structures and beam loading.
* M. Abramowitz and I. A. Stegun (eds.), *Handbook of Mathematical
  Functions* (NBS, 1964), table 9.5: the Bessel zeros the tests check.

**Sonification of accelerators**

* The Storage Ring ([ring/README.md](../ring/README.md)) plays the same
  accelerators' beam rather than their cavities. No earlier instrument that
  plays an RF cavity's modes is known to us; see the particle-physics
  sonification in [docs/PRIOR_ART.md](../docs/PRIOR_ART.md#5-sonification-and-science-outreach-precedents).
