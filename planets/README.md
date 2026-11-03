# Ringing Planets

After a great earthquake the whole Earth rings like a struck bell, for days.
Its slowest tone, ₀S₂, squashes the planet into a rugby ball one way and then
the other, once every 54 minutes; its breathing mode, ₀S₀, swells and shrinks
the whole planet every 20.5 minutes and is still ringing a month later.
Seismometers and gravimeters first caught these **free oscillations** after the
Chilean quake of 1960, and the hundreds measured since are much of what we know
about the inside of the Earth.

Every key here is a great quake. The planet's tones are solved from a model of
its inside, the quake and the station set how loud each one is, and the whole
ringing is sped up until ₀S₂ is the key's note: about 850,000 times at middle C,
so that a day of ringing passes in a tenth of a second. You hear a crack first
(the surface waves racing round the planet, whose hours of passes are a few
milliseconds here), then the tones that ring on. Choose the Earth, Mars or the
Moon: nobody has yet recorded Mars or the Moon ringing, but InSight's
marsquakes and Apollo's moonquakes measured what is inside them, and the
modes follow. This is the solid planets' partner to the
[Star Keyboard](../stars/README.md), whose tones are the oscillations of stars.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/planets/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | a quake on every key (88 keys, A0–C8): ₀S₂ is the key's note |
| `←` `→` | octave |
| `↑` `↓` | velocity: the quake's magnitude, from the hardest key's down to one less |
| `Space` | sustain: keep listening after the keys come up |
| MIDI | notes, velocity (the magnitude), sustain pedal (CC64), pitch bend; **mod wheel = the planet's spin** |
| MPE | each note's bend retunes its own planet; slide (CC74) spins it |
| Keyboard bar | the planet (Earth, Mars, Moon) |

## The physics

### 1. A planet's standing waves

A planet is a self-gravitating elastic ball, and like any bounded elastic body
it has normal modes. On a spherical, non-rotating, elastic, isotropic planet
(SNREI, the reference case of Dahlen & Tromp 1998) every mode's motion is a
radial function times a spherical harmonic Yₗᵐ(θ, φ):

- **spheroidal** modes ₙSₗ move the ground up and down and sideways,
  s = U(r) Yₗᵐ r̂ + V(r) ∇₁Yₗᵐ / k, and change gravity (the potential P(r) Yₗᵐ);
- **toroidal** modes ₙTₗ twist it, s = W(r) r̂ × ∇₁Yₗᵐ / k, only in the solid
  shell outside the liquid core, which carries no shear.

Here k² = l(l + 1). l counts the wave's nodal lines on the surface, and n its
nodes in depth: n = 0 are the **fundamental** modes, which live near the
surface and add up to the surface waves; n > 0 are **overtones**, whose motion
reaches deep. Each degree l has 2l + 1 patterns (m = −l … l), all with one
frequency on a still sphere: a **multiplet**.

The frequency makes the Rayleigh quotient stationary,

  ω² ∫ρ(U² + V²) r² dr = ∫ { κD² + μ/3 (2U′ − F/r)² + μ(V′ − V/r + kU/r)²
  + (k² − 2) μV²/r² + 4πGρ²U² − 4ρgU²/r + 2kρgUV/r + 2ρ(UP′ + kVP/r) } r² dr
  + (4πG)⁻¹ ∫₀^∞ (P′² + k²P²/r²) r² dr

with F = 2U − kV and D = U′ + F/r (the compression), κ and μ the bulk and shear
moduli from the P and S wave speeds, g(r) gravity, and P made stationary too;
and for toroidal modes ω² ∫ρW² r² dr = ∫ μ[(W′ − W/r)² + (k² − 2)W²/r²] r² dr.
The gravity terms matter most for the gravest modes.

`tools/planets-modes.mjs` solves it by spectral elements: the radius is cut
into elements no thicker than a wavelength allows (finer near the surface and
for higher frequencies), with Lagrange polynomials of order 4 on
Gauss–Lobatto–Legendre nodes and Gauss quadrature of order 8. The potential is
eliminated exactly (its Poisson equation, with the field outside the planet,
(l + 1) R P(R)² / 4πG, in closed form), the tangential motion is free to slip at
the boundaries between liquid and solid, and the generalised eigenproblem
K x = ω² M x is solved densely. The solid's modes are kept; a liquid core's own
spurious modes of zero frequency are dropped.

The answer, for PREM: ₀S₂ 0.3093 mHz (measured: 0.3095), ₀S₀ 0.8140 (0.8142),
₁S₀ 1.6310 (1.6315), ₀T₂ 0.3786 (0.3780). `test/planets-tests.mjs` checks 16
modes against the frequencies measured from decades of records (REM1D:
Moulik & Ekström 2025) within 0.6 %, and the solver against Lamb's toroidal
modes of a uniform ball and Kelvin's of a self-gravitating fluid sphere.

### 2. The three planets

**The Earth** is PREM, the Preliminary Reference Earth Model (Dziewonski &
Anderson 1981), itself fitted largely to these modes: isotropic, its ocean
replaced by crust. It weighs 5.976 × 10²⁴ kg with I/MR² = 0.3309, as it should.

**Mars** has a liquid core of radius 1830 km (Stähler et al. 2021) with P waves
at 4.9 km/s at its top (Irving et al. 2023), a 40 km crust (Knapmeyer-Endrun et
al. 2021; Wieczorek et al. 2022), and a mantle as fast as Khan et al. (2021)
found, with its jump near 1050 km depth. The densities of the core and mantle
are fitted to the measured mass and moment of inertia, 6.417 × 10²³ kg and
0.3638 (Konopliv et al. 2020): the core comes out at 6.36 g/cm³ on average,
denser toward the centre as its own weight compresses it (Adams–Williamson).
No mode of Mars has been measured; its ₀S₂ comes out at 45 minutes.

**The Moon** has a solid inner core of radius 240 km, a liquid outer core to
330 km, a partly molten layer to 480 km whose waves run slower (Weber et al.
2011), a mantle whose P waves run at 8.5 km/s deep down and near 7.7 km/s
above (Nakamura 1983), and a 40 km crust of density 2.55 g/cm³ (GRAIL:
Wieczorek et al. 2013), fitted to its mass and moment (Williams et al. 2014).
Its ₀S₂ comes out at 16 minutes.

The page's **Inside** view draws each model, coloured by the speed of its shear
waves.

### 3. Losses

The rock turns the ringing into heat. Each layer has a quality factor for
shear, Qμ, and for compression, Qκ, and a mode's own Q is the average of their
inverses weighted by the share of its energy each stores:

  1/Q = (∫ κ D² /Qκ + shear energy / Qμ) / (all the elastic energy)

₀S₂ comes out at Q ≈ 510, so it fades over a week or two; ₀S₀, nearly all
compression, at Q ≈ 5300, so it rings for weeks; overtones that reach the lossy
asthenosphere die faster. The checks above hold these within 30 % of the
measured Q. A material with Q also stretches its speeds with frequency
(the waves are dispersive): each mode's frequency is shifted from the model's
reference period of 1 s by the factor 1 + ln(f/f₀)/(πQ) (Kanamori & Anderson
1977), which lowers ₀S₂ by about half a per cent. The Earth's mantle is lossy (Qμ 80 in the
asthenosphere, 600 above it); Mars's is guessed near Qμ 200–500, within what
InSight's quakes allow; the dry Moon's upper mantle has Qμ in the thousands
(Nakamura & Koyama 1982), which is why it rings so much longer. **Attenuation**
scales every 1/Q.

### 4. The spin

The Coriolis force of the planet's spin Ω splits each multiplet: to first order
singlet m moves to ω + m χ Ω (Backus & Gilbert 1961; Dahlen 1968), with

  χ = ∫ρ(2UV/k + V²/k²) r² dr / ∫ρ(U² + V²) r² dr   (spheroidal),
  χ = 1/k²   (toroidal).

₀S₂'s χ is 0.397, so its five singlets sit 1.5 % apart, which is just what the
gravimeters saw after Sumatra in 2004: the football mode beats. A singlet's
pattern drifts round the axis at its own rate, and the station hears the
patterns' sum: this engine keeps, for each multiplet, one complex oscillator
and the 2l + 1 singlets' amplitudes as a pattern turned by the spin, Σₘ cₘ e^{imψ},
with ψ advancing at χΩ. **Spin** scales Ω from 0 (one tone each) to ten
times the planet's own; the Moon, turning once a month, hardly splits at all.
The mod wheel and MPE slide turn it too. (Ellipticity and the planet's
three-dimensional structure split the multiplets as well; they are left out.)

### 5. The quake

A quake is a moment tensor M: the fault's area times its slip times the rock's
stiffness, in the pattern its slip makes (Aki & Richards 2002). **Fault** picks
the pattern: a megathrust (a fault dipping 10°, slip up its dip), a vertical
strike-slip fault, a normal fault dipping 45°, or an explosion or impact (no
fault: the same push all round); **Fault direction** turns it. The quake rings
singlet m of each mode in proportion to the strain that mode makes where the
fault slips, cₘ ∝ M : ε*ₗₘ(r_s, θ_s, φ_s) (Gilbert 1971), which is why a
shallow quake rings the fundamental modes and a deep one the overtones
(**Depth**).

The magnitude is set by the key's velocity: the hardest key is **Magnitude,
hardest key** (Mw 9.1 by default, near Sumatra in 2004 and Japan in 2011), and
softer ones down to one magnitude less. The moment is M₀ = 10^(1.5 Mw + 9.1) N m,
so one magnitude is a factor of 32 in amplitude. A bigger quake also breaks for
longer, the half-duration growing as M₀^⅓ (h = 1.05 × 10⁻⁸ M₀^⅓ s, M₀ in
dyne cm: Ekström et al. 2012), which takes out the modes it cannot keep up
with: the source spectrum is sinc²(ωh/2). **Rupture time** scales h.

### 6. The station

The station is **Distance** degrees from the quake round the planet, in
**Direction from the quake**; **Quake latitude** places both against the spin
axis. Each singlet's motion there is its Yₗᵐ (and gradient) at the station: a
station on a mode's nodal line hears none of it. 90° from an explosion every odd
degree is silent; at 180° the waves all come back together. **Listening to**
chooses what is heard:

- how far the ground moves up and down (the default: it brings out the low
  tones);
- how fast it moves, as a seismometer hears it (brighter: each mode × ω);
- gravity, as a gravimeter hears it: the ground's acceleration, plus gravity
  weakening as the ground rises (2g U / R) and strengthening with the mass that
  rose ((l + 1) P / R);
- the ground moving north (left) and east (right): the horizontal pair hears
  the toroidal modes too, in stereo.

### 7. Each key

The planet's ringing is a sum of damped tones, each multiplet's 2l + 1 singlets
added up through the spin's turning pattern. Each key speeds it up by
K = f(key) / f(₀S₂), so ₀S₂ lands on the key's note in the chosen tuning (and
the bend moves K), and every other mode keeps its ratio to it: ₀S₀ sounds 2.63
times higher, ₀T₂ 1.22. The table (`tools/planets-native-table.mjs`) holds
each planet's modes up to twelve times ₀S₂ and degree 40, with their strain at
16 depths; a key plays the loudest 128 multiplets below the Nyquist frequency.
Levels are scaled so a reference quake sounds as loud on each planet through
each sensor, and then by the magnitude.

## What to listen for

The demos in `examples/planets/`:

1. **The Moon rings a tune** (deep moonquakes under the pedal): the dry Moon
   rings on far longer than the Earth.
2. **The Earth rings a tune**: each key a crack and then the tones; listen for
   ₀S₂ (the note) and ₀S₀ (2.6 times higher) holding on after the rest have gone.
3. **The spin splits the tone**: one quake on a still Earth, on the Earth's
   own day, and spun up eight times: ₀S₂'s singlets beat, faster and faster.
4. **An explosion at 90°, then 45°**: at 90° every odd degree is on a node;
   at 45° those tones come back.
5. **A shallow quake, then one 640 km down**: the deep one loses the crack (the
   surface waves) and rings overtones instead.
6. **The Earth, Mars and the Moon**: Mars's lossy mantle dies fast, the Moon
   rings on.
7. **Twisting modes in stereo**: a strike-slip quake heard sideways, north on
   the left and east on the right.

## Files

```
planets/index.html, style.css           page
planets/src/planets-params.js           parameters and presets
planets/src/planets-models.js           the Earth (PREM), Mars and the Moon: density, speeds, Q
planets/src/planets-instrument.js       the descriptor: everything but the page
planets/src/planets-main.js             page wiring and views
planets/src/planets-tour.js             the guided tour
planets/src/planets-wasm.js, planets/wasm/planets.wasm   the engine and model, built from the C++
tools/planets-modes.mjs                 the normal-mode solver (node tools/planets-modes.mjs earth 2)
tools/planets-native-table.mjs          writes native/instruments/planets/planets-table.h
native/instruments/planets/             the physics in C++: excitation, station and engine
test/planets-tests.mjs                  node test/planets-tests.mjs
tools/render-planets.mjs                node tools/render-planets.mjs → examples/planets/
```

## Simplifications

- **Spherical, non-rotating reference.** The real Earth's ellipticity, its
  lateral structure and its anisotropy split the multiplets further; only the
  spin's first-order Coriolis splitting is here. The ocean is replaced by crust.
- **No coupling between multiplets.** The spin and the lateral structure
  couple neighbouring modes (spheroidal to toroidal); each multiplet rings on
  its own here.
- **A point source.** The rupture is a point with a symmetric time function;
  a real megathrust breaks over a thousand kilometres, which favours the
  direction it runs in.
- **Mars and the Moon are models.** No free oscillation of either has been
  measured, so their frequencies are only as good as the structures above,
  and their Q is a guess within what their quakes allow.
- **No noise.** A real record has the Earth's hum and the station's noise
  under the tones, which hides the gravest ones until the biggest quakes.
- **The table stops at degree 40 and twelve times ₀S₂**, so the crack (the
  surface waves) is the sum of the modes up to there, not a true click.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims how many
multiplets a key plays and how many keys ring at once: 128 multiplets at High,
80 at Medium and 40 at Low (the loudest, so the crack is a little duller), and
24, 12 and 6 keys (past that, the oldest is let go). The note, ₀S₂, keeps its
pitch within a cent at every setting.

## Prior art and references

**The original phenomenon.** The free oscillations of the Earth were predicted
by Lamb (1882) for a uniform ball and by Love (1911), who found ₀S₂'s period
near an hour, and first seen after the Chilean quake of 22 May 1960:

- Benioff, H., Press, F. & Smith, S. (1961). "Excitation of the free
  oscillations of the Earth by earthquakes." *J. Geophys. Res.* 66, 605–619.
  [doi:10.1029/JZ066i002p00605](https://doi.org/10.1029/JZ066i002p00605)
- Ness, N. F., Harrison, J. C. & Slichter, L. B. (1961). "Observations of the
  free oscillations of the Earth." *J. Geophys. Res.* 66, 621–629.
  [doi:10.1029/JZ066i002p00621](https://doi.org/10.1029/JZ066i002p00621)
- Park, J. et al. (2005). "Earth's free oscillations excited by the 26 December
  2004 Sumatra-Andaman earthquake." *Science* 308, 1139–1144.
  [doi:10.1126/science.1112305](https://doi.org/10.1126/science.1112305)

**The physics.**

- Dahlen, F. A. & Tromp, J. (1998). *Theoretical Global Seismology.* Princeton
  University Press. (The Rayleigh quotient, Q, splitting and excitation used
  here.)
- Gilbert, F. (1971). "Excitation of the normal modes of the Earth by
  earthquake sources." *Geophys. J. R. Astr. Soc.* 22, 223–226.
  [doi:10.1111/j.1365-246X.1971.tb03593.x](https://doi.org/10.1111/j.1365-246X.1971.tb03593.x)
- Backus, G. & Gilbert, F. (1961). "The rotational splitting of the free
  oscillations of the Earth." *PNAS* 47, 362–371.
  [doi:10.1073/pnas.47.3.362](https://doi.org/10.1073/pnas.47.3.362)
- Dahlen, F. A. (1968). "The normal modes of a rotating, elliptical Earth."
  *Geophys. J. R. Astr. Soc.* 16, 329–367.
  [doi:10.1111/j.1365-246X.1968.tb00229.x](https://doi.org/10.1111/j.1365-246X.1968.tb00229.x)
- Kanamori, H. & Anderson, D. L. (1977). "Importance of physical dispersion in
  surface wave and free oscillation problems: review." *Rev. Geophys.* 15,
  105–112. [doi:10.1029/RG015i001p00105](https://doi.org/10.1029/RG015i001p00105)
- Aki, K. & Richards, P. G. (2002). *Quantitative Seismology*, 2nd ed.
  University Science Books. (The moment tensor of a fault.)
- Ekström, G., Nettles, M. & Dziewoński, A. M. (2012). "The global CMT
  project 2004–2010: centroid-moment tensors for 13,017 earthquakes." *Phys.
  Earth Planet. Inter.* 200–201, 1–9.
  [doi:10.1016/j.pepi.2012.04.002](https://doi.org/10.1016/j.pepi.2012.04.002)
- Masters, G. & Widmer, R. (1995). "Free oscillations: frequencies and
  attenuations." In *Global Earth Physics: A Handbook of Physical Constants*,
  AGU, 104–125.

**The planets.**

- Dziewonski, A. M. & Anderson, D. L. (1981). "Preliminary reference Earth
  model." *Phys. Earth Planet. Inter.* 25, 297–356.
  [doi:10.1016/0031-9201(81)90046-7](https://doi.org/10.1016/0031-9201(81)90046-7)
- Moulik, P. & Ekström, G. (2025). REM1D, a reference Earth model with its
  measured mode frequencies and Q (the values the tests check against).
- Stähler, S. C. et al. (2021). "Seismic detection of the martian core."
  *Science* 373, 443–448.
  [doi:10.1126/science.abi7730](https://doi.org/10.1126/science.abi7730)
- Khan, A. et al. (2021). "Upper mantle structure of Mars from InSight
  seismic data." *Science* 373, 434–438.
  [doi:10.1126/science.abf2966](https://doi.org/10.1126/science.abf2966)
- Knapmeyer-Endrun, B. et al. (2021). "Thickness and structure of the martian
  crust from InSight seismic data." *Science* 373, 438–443.
  [doi:10.1126/science.abf8966](https://doi.org/10.1126/science.abf8966)
- Irving, J. C. E. et al. (2023). "First observations of core-transiting
  seismic phases on Mars." *PNAS* 120, e2217090120.
  [doi:10.1073/pnas.2217090120](https://doi.org/10.1073/pnas.2217090120)
- Wieczorek, M. A. et al. (2022). "InSight constraints on the global character
  of the martian crust." *J. Geophys. Res. Planets* 127, e2022JE007298.
  [doi:10.1029/2022JE007298](https://doi.org/10.1029/2022JE007298)
- Konopliv, A. S. et al. (2020). "Detection of the Chandler wobble of Mars from
  orbiting spacecraft." *Geophys. Res. Lett.* 47, e2020GL090568.
  [doi:10.1029/2020GL090568](https://doi.org/10.1029/2020GL090568)
- Weber, R. C. et al. (2011). "Seismic detection of the lunar core." *Science*
  331, 309–312. [doi:10.1126/science.1199375](https://doi.org/10.1126/science.1199375)
- Nakamura, Y. (1983). "Seismic velocity structure of the lunar mantle." *J.
  Geophys. Res.* 88, 677–686.
  [doi:10.1029/JB088iB01p00677](https://doi.org/10.1029/JB088iB01p00677)
- Nakamura, Y. & Koyama, J. (1982). "Seismic Q of the lunar upper mantle."
  *J. Geophys. Res.* 87, 4855–4861.
  [doi:10.1029/JB087iB06p04855](https://doi.org/10.1029/JB087iB06p04855)
- Wieczorek, M. A. et al. (2013). "The crust of the Moon as seen by GRAIL."
  *Science* 339, 671–675.
  [doi:10.1126/science.1231530](https://doi.org/10.1126/science.1231530)
- Williams, J. G. et al. (2014). "Lunar interior properties from the GRAIL
  mission." *J. Geophys. Res. Planets* 119, 1546–1578.
  [doi:10.1002/2013JE004559](https://doi.org/10.1002/2013JE004559)

**Earlier models and syntheses.** Normal-mode codes:
[MINEOS](https://geodynamics.org/resources/mineos) (Masters, Woodhouse and
Gilbert; CIG), the standard radial-integration code for SNREI modes. Seismic
records have long been sped up into sound, as here:
[SeismoDome](https://lamont.columbia.edu/news/listening-earthquakes-inside-earth)
(Holtzman and others, Lamont-Doherty, 2014 on) plays real records of great
quakes in a planetarium, and NASA has done the same with InSight's marsquakes.
We found none that plays the modes from a solved model on a keyboard.
