# Ion Chain

A trapped-ion quantum computer's crystal as a keyboard. In a linear Paul trap a
radio-frequency field holds a few calcium ions near its axis and two end
electrodes hold them along it; laser-cooled to a thousandth of a degree, they
stop and sit in a line a few micrometres apart, each pushed by its neighbours'
charge as hard as the trap pulls it back: a **Coulomb crystal**. Kick one ion and
the whole string rings, because no ion can move without moving the rest. It
rings in its **normal modes**: the centre of mass at the trap's axial frequency
ω_z, the breathing mode at √3 ω_z, then √(29/5) ω_z for three ions and a new mode
for every ion added, an inharmonic set like a bell's. These are the modes a
quantum computer uses as its bus between ions (Cirac and Zoller 1995). Here every
key is such a trap, its axial frequency the note, slowed down a thousand times
(A4 is a trap at 440 kHz). A laser pulse kicks the ions, the two electrodes hear
the current their motion drives, and letting go of a key turns on the cooling
laser that stops them. Nothing is sampled: the crystal's shape and its modes are
solved from the trap's pull and Coulomb's law, and the tests check them against
the published equilibria and frequencies of ion chains (James 1998) and the
closed forms for two and three ions.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/ionchain/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): a laser pulse on that key's trap |
| `←` `→` | octave |
| `↑` `↓` | the radial pull (toward the zigzag and back) |
| `Space` | keep the cooling laser off after the keys come up |
| MIDI | notes, velocity (the pulse's strength), sustain pedal (CC64: the cooling laser stays off), **mod wheel = the radial pull** (down toward the zigzag), **pitch bend = the trap's axial frequency** (±2 semitones), MPE (each note's own trap frequency, ±12 semitones) |
| Seaboard faders | the beam's place, its angle, the electrodes' distance; the XY pad: the pulse's length and the radial pull |
| Touch | as the keys |

## The crystal

In the trap the ions feel three things: the end electrodes' static field, a
harmonic pull along the axis z at ω_z; the radio-frequency field's
pseudopotential, a stronger pull toward the axis at ω_x (Paul's trap, averaged
over the RF cycle); and one another's Coulomb repulsion. Measured in the length
ℓ = (q² / 4πε₀ m ω_z²)^⅓, which is 4.45 µm for ⁴⁰Ca⁺ at ω_z = 2π × 1 MHz, the
potential energy of N ions in the plane of the axis and the weaker radial axis x
is

  U = Σⱼ ½ (α² xⱼ² + zⱼ²) + Σᵢ<ⱼ 1 / |rᵢ − rⱼ|,   α = ω_x / ω_z.

Its minimum is the crystal. While α is large the ions sit on the axis, where the
forces along it balance: zⱼ − Σᵢ≠ⱼ sign(zⱼ − zᵢ) / (zⱼ − zᵢ)² = 0. Two ions sit at
±(1/2)^⅔ = ±0.630 ℓ, three at 0 and ±(5/4)^⅓ = ±1.077 ℓ, five at 0, ±0.822 and
±1.743 ℓ (James 1998), twenty over ±4.33 ℓ, closer together in the middle where
more ions push from both sides. The engine finds them by Newton's method.

The **normal modes** are the eigenvectors of U's Hessian there: the ions all
have one mass, so the modes' shapes are orthonormal and their frequencies are
ω_z √λ. Along the axis the Hessian is Aᵢᵢ = 1 + Σ 2/|zᵢ − zₖ|³, Aᵢⱼ = −2/|zᵢ − zⱼ|³,
and its eigenvalues are

| ions | axial modes (× ω_z) |
|---|---|
| 1 | 1 |
| 2 | 1, 1.732 (√3) |
| 3 | 1, 1.732, 2.408 (√(29/5)) |
| 4 | 1, 1.732, 2.410, 3.051 |
| 5 | 1, 1.732, 2.412, 3.055, 3.671 |
| 20 | 1, 1.732, 2.421, 3.079 … 11.928 |

The first two are exact for any number of ions. The centre of mass, every ion
moving together, feels only the trap, since the ions' forces on one another
cancel in the sum: it is at ω_z exactly, so **the note is always the trap's
frequency**. The breathing mode, every ion's displacement in proportion to its
place, stretches the crystal against its own repulsion, which scales as 1/z²:
λ = 3. The rest climb more slowly, the top one at 3.67 for five ions, 6.58 for ten and 11.93 for twenty.

Across the axis the Coulomb force pulls the other way (a sideways step brings an
ion closer to the line through its neighbours, less pushed), so the radial modes
sit below ω_x: ω_x² − ω_z² (μ − 1)/2 for each axial eigenvalue μ. The centre of
mass is at ω_x, the rocking of the chain at √(ω_x² − ω_z²), and the zigzag mode,
the neighbours moving against each other, lowest of all.

### The zigzag

Weaken the radial pull and that zigzag mode softens until its frequency is zero,
at α_c² = (μ_N − 1)/2 for the line's top axial eigenvalue μ_N: α_c = 1 for two
ions, √(12/5) = 1.549 for three, 2.50 for five, 3.78 for eight, 8.41 for twenty.
Below it the line is no longer a minimum and **buckles into a zigzag** (Schiffer
1993; seen by Enzer et al. 2000), a continuous phase transition whose order
parameter is the zigzag's width. The engine then finds the planar crystal by
Newton's method (shifted to stay downhill), starting from the last zigzag so the
crystal keeps its side, and the modes of the Hessian in both directions, which
now mix: the axial modes bend and the radial ones, at frequencies near the
note's, become heard. Below α = 1 two ions stand across the axis, (2/α²)^⅓ ℓ
apart. The mod wheel takes the radial pull from its setting down to 0.6 ω_z, so
it plays the transition; sounding notes follow it (below).

The crystal is taken flat: the third direction, y, is assumed stiffer than x (as
in traps made slightly asymmetric on purpose), so the zigzag forms in the x–z
plane and the y modes, which neither the pulse nor the electrodes reach there,
are left out.

## The kick

A key strikes a short laser pulse across the chain. Its photons' momentum pushes
each ion it lights along the beam: an impulse Δvⱼ = gⱼ k̂, with gⱼ the Gaussian
beam's intensity at the ion's distance from the beam's line, e^(−2d²/w²), and k̂
its direction at the angle θ to the axis. A mode's velocity jumps by the
projection of that push on its shape, Σⱼ gⱼ k̂ · bⱼₘ. The pulse's total push is the
same however many ions it lights (its energy spread over them).

* **A push the same on every ion moves only the centre of mass**: a beam along
  the axis lights the whole line equally, and a very wide one nearly so. In a
  harmonic trap the centre of mass is a mode of its own whatever the ions do to
  one another (Kohn's theorem), so such a push rings that one mode: a pure tone.
* **A push on one ion** rings every mode in which it moves. An end ion moves in
  all of them. The centre ion of an odd number stays still in the breathing mode
  and every other even one, so those fall silent; with an even number of ions
  the centre falls between two, and a narrow beam misses.
* **The pulse's length** τ filters its push: a half-sine pulse gives a mode at f
  the push times |cos(π f τ) / (1 − (2 f τ)²)|, flat for short pulses and zero at
  f = 3/(2τ). τ is in the trap's own time, so a 0.05 µs pulse is short for every
  key and a 1 µs one leaves the top octaves' traps nearly still.

The chain is linear for small kicks: the velocity is how loud, not what you hear.

## The electrodes

An ion moving near an electrode drives a current in it: by Shockley's and Ramo's
theorem, I = q v · E_w(r), with E_w the field the electrode would make at the ion
if it were held at one volt. Each electrode here is small, a point at distance R
from the trap's centre and at an angle φ off the axis, and its field at ion j is
(r_e − rⱼ)/|r_e − rⱼ|³. The two sit opposite each other, one per channel (left
and right), and the second's amplifier is inverted so the two agree on the
centre of mass. A mode's current is its velocity times Σⱼ E_w(rⱼ) · bⱼₘ, each
electrode's weights scaled by its RMS field over the ions (so Σₘ wₘ² = N for every
placement, and moving the electrodes changes the colour more than the level).

* **Far away** an electrode's field is the same on every ion and it hears only
  the centre of mass. Real endcaps are hundreds of µm from a chain of 5 µm
  spacings, so a real trap's image current hears little else.
* **Close** (a little beyond the end ions), the field grows toward the nearer end
  and the gradient hears the breathing mode, its curvature the next, and so on:
  the bell's upper partials.
* **Beside the chain** (φ = 90°) the electrodes hear the radial motion, and of
  the axial modes only those that tilt the chain: not its centre of mass.

That current flows through the amplifier's resistor and takes energy from the
motion it is driven by (Wineland and Dehmelt 1975): resistive cooling. A mode's
amplitude decays at the resistor's rate for one ion times the mean of wₘ² over
the two electrodes, so the modes heard best die first and N ions moving together
die N times faster. Modes the electrodes cannot hear do not lose energy at all
while the key is held.

## Cooling, and holding

A key held keeps the cooling laser off and the chain rings, losing energy only
through the resistor. Let go, and the cooling beam comes on: Doppler cooling
damps every ion it lights at its own rate, so every mode at that rate when it
lights them all. With **only the end ion cooled**, as when an ion of another
species cools the rest (sympathetic cooling, Larson et al. 1986), a mode cools
by the square of the end ion's share in it: the centre of mass of eight ions 8
times more slowly, and the modes in which the end ion hardly moves ring on long
after the others. Space and the sustain pedal keep the laser off.

## Playing it while it rings

Each mode is an exact damped oscillator, kept as a phasor whose real part is the
mode's displacement. Every change keeps the ions' motion where it is: the pitch
wheel and a note's MPE bend change the trap's axial frequency (the endcap
voltage), and each mode turns at its new rate; the mod wheel's radial pull
solves the crystal again, and each sounding note's motion, as displacements and
velocities of the ions, is projected onto the new modes. In small steps this is
the crystal following the trap adiabatically, through the zigzag and back. A
pitch bend scales every mode together: the radio-frequency pull is taken to
follow the endcaps, so the crystal keeps its shape. A key struck while it still
rings adds a new pulse to what is there.

## What to listen for

* **One, two, three ions.** One is a pure tone. Two add the breathing mode at
  √3, between a major sixth and a minor seventh above it (951 cents). Three add
  √(29/5), and each ion after that one more partial above, a little higher
  each time: bells.
* **Where the beam lands.** The end ion rings every mode; the centre ion of
  seven only the odd ones (1, 2.41, 3.68 …), a hollower sound.
* **A beam along the axis**, or very wide: the centre of mass alone, a pure tone
  whatever the number of ions (Kohn).
* **The electrodes moving away**: the partials fade from the top down until
  only the note is left, as a real trap hears it.
* **The zigzag.** Pull the mod wheel down with a key held (and the pedal): at
  the transition the sound changes colour, partials slide, and new ones (the
  radial modes, now heard) come in. Twenty ions buckle first.
* **Held notes**: the partials the electrodes hear best fade first, through
  their resistor; a far electrode lets the note ring long.
* **Sympathetic cooling**: let go of a chord and some partials hang on.

## Files

```
ionchain/index.html, style.css                page
ionchain/src/ionchain-params.js               parameters and presets
ionchain/src/ionchain-instrument.js           the descriptor: everything but the page
ionchain/src/ionchain-main.js                 page wiring and views
ionchain/src/ionchain-wasm.js, ionchain/wasm/ionchain.wasm   the engine and model, built from the C++
native/instruments/ionchain/                  the physics in C++: model and engine (plugins and WebAssembly)
test/ionchain-tests.mjs                       node test/ionchain-tests.mjs
tools/render-ionchain.mjs                     node tools/render-ionchain.mjs → examples/ionchain/
```

## Simplifications

* **Small oscillations.** The modes are the crystal's linear ones; a real kick
  large enough to be heard would also couple them through the Coulomb force's
  higher terms (the modes' frequencies shift with amplitude, and energy flows
  between them), and a hard enough one melts the crystal. Not modelled.
* **The ions are classical and cold**: no thermal motion at the Doppler limit,
  no quantum zero-point motion, no heating from the electrodes' noise.
* **One species**: every ion has the mass of ⁴⁰Ca⁺ (which only sets the lengths
  the page shows; the modes in units of ω_z don't depend on it). A heavier ion in
  the chain would shift and localise the modes; only its cooling role is here.
* **A flat crystal**, as said above, and a pseudopotential: the ions'
  micromotion at the radio frequency, which is far above every mode, is left out.
* **Point electrodes** with an ideal resistor across them. Real image-current
  detection uses a resonant circuit, which hears a narrow band around its own
  frequency; here the electrodes hear every mode, and the resistor is matched to
  them. The resistor's damping is taken mode by mode (it also couples modes it
  hears together, a small effect while the damping is far slower than the
  modes' spacing), and so is the cooling laser's.
* **Slowed down a thousand times**: frequencies divided by 1000 and times
  multiplied by it, so a held note's ring of seconds is milliseconds in the trap.
* **The pulse is instantaneous for the laser's effect on the ions** (its
  spectrum filters each mode, its phase is left out).

## Quality

At Medium the engine sounds at most 16 notes at once and at Low 8 (High: 32);
past that the oldest fades out in 6 ms. Medium also leaves out the modes whose
pull on the electrodes is under 3 % of the strongest, and Low under 10 %, and any
mode above the audible range: the radial modes of a line, which the electrodes
on the axis can't hear, are the first to go, so a twelve-ion chain at the defaults
plays 5 of its 24 modes at Medium and 4 at Low. Those modes are then not rung at all, so a zigzag reached
with the mod wheel while a note rings sounds a little thinner there.

## Prior art and references

### The trap and the crystal

* Paul, W. (1990). Electromagnetic traps for charged and neutral particles.
  *Reviews of Modern Physics* 62, 531.
  <https://doi.org/10.1103/RevModPhys.62.531> (his Nobel lecture: the
  radio-frequency trap).
* Diedrich, F., Peik, E., Chen, J. M., Quint, W. and Walther, H. (1987).
  Observation of a phase transition of stored laser-cooled ions. *Physical
  Review Letters* 59, 2931. <https://doi.org/10.1103/PhysRevLett.59.2931>
* Wineland, D. J., Bergquist, J. C., Itano, W. M., Bollinger, J. J. and
  Manney, C. H. (1987). Atomic-ion Coulomb clusters in an ion trap. *Physical
  Review Letters* 59, 2935. <https://doi.org/10.1103/PhysRevLett.59.2935>
  (the first ion crystals, seen the same month in two labs).
* James, D. F. V. (1998). Quantum dynamics of cold trapped ions with application
  to quantum computation. *Applied Physics B* 66, 181–190.
  <https://doi.org/10.1007/s003400050373> (the equilibria and axial modes of
  ion chains, the tests' table).
* Cirac, J. I. and Zoller, P. (1995). Quantum computations with cold trapped
  ions. *Physical Review Letters* 74, 4091.
  <https://doi.org/10.1103/PhysRevLett.74.4091> (the centre-of-mass mode as the
  quantum computer's bus).

### The zigzag

* Schiffer, J. P. (1993). Phase transitions in anisotropically confined ionic
  crystals. *Physical Review Letters* 70, 818.
  <https://doi.org/10.1103/PhysRevLett.70.818>
* Enzer, D. G., Schauer, M. M., Gomez, J. J., Gulley, M. S., Holzscheiter,
  M. H., Kwiat, P. G., Lamoreaux, S. K., Peterson, C. G., Sandberg, V. D.,
  Tupa, D., White, A. G., Hughes, R. J. and James, D. F. V. (2000). Observation
  of power-law scaling for phase transitions in linear trapped ion crystals.
  *Physical Review Letters* 85, 2466. <https://doi.org/10.1103/PhysRevLett.85.2466>
* Fishman, S., De Chiara, G., Calarco, T. and Morigi, G. (2008). Structural
  phase transitions in low-dimensional ion crystals. *Physical Review B* 77,
  064111. <https://doi.org/10.1103/PhysRevB.77.064111>

### Kicks, currents and cooling

* Kohn, W. (1961). Cyclotron resonance and de Haas–van Alphen oscillations of
  an interacting electron gas. *Physical Review* 123, 1242.
  <https://doi.org/10.1103/PhysRev.123.1242> (a uniform field moves only the
  centre of mass of interacting particles in a harmonic potential).
* Shockley, W. (1938). Currents to conductors induced by a moving point charge.
  *Journal of Applied Physics* 9, 635. <https://doi.org/10.1063/1.1710367>
* Ramo, S. (1939). Currents induced by electron motion. *Proceedings of the
  IRE* 27, 584. <https://doi.org/10.1109/JRPROC.1939.228757>
* Wineland, D. J. and Dehmelt, H. G. (1975). Principles of the stored ion
  calorimeter. *Journal of Applied Physics* 46, 919.
  <https://doi.org/10.1063/1.321602> (image-current detection and resistive
  cooling).
* Hänsch, T. W. and Schawlow, A. L. (1975). Cooling of gases by laser
  radiation. *Optics Communications* 13, 68.
  <https://doi.org/10.1016/0030-4018(75)90159-5>
* Wineland, D. J. and Itano, W. M. (1979). Laser cooling of atoms. *Physical
  Review A* 20, 1521. <https://doi.org/10.1103/PhysRevA.20.1521>
* Larson, D. J., Bergquist, J. C., Bollinger, J. J., Itano, W. M. and
  Wineland, D. J. (1986). Sympathetic cooling of trapped ions: a laser-cooled
  two-species nonneutral ion plasma. *Physical Review Letters* 57, 70.
  <https://doi.org/10.1103/PhysRevLett.57.70>

### Earlier models and syntheses

We found no earlier instrument or synthesizer that plays a trapped-ion
crystal's modes. The modes themselves are computed this way throughout the
field, from James (1998) on.
