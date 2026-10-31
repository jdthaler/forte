# Chladni Plate

Every key is a square brass plate, screwed at its centre to a post, with a
rosined bow drawn down across its edge while the key is held. In 1787 Ernst
Chladni scattered sand on plates like these, held a finger on the plate and
bowed its edge, and the sand ran off the parts that swing and gathered on the
lines that stay still: the nodal lines of the one mode the bow had picked out.
Here the page draws the sand, and you hear the plate. The finger and the place
of the bow pick the figure; every key's plate is cut to a size at which that
figure sounds the key's note, so the whole keyboard plays one figure, drawn
in its sand on every key.

The bow does not strike the plate; it drives it through **stick and slip**.
The rosined hair grips the edge and carries it along, until the plate's own
spring tears it loose; it slides back and is caught again, once a cycle of
the mode it has locked onto. Below a threshold force the plate will not
speak at all; above it, the note swells in, and it holds as long as the bow
is drawn. Push hard, lift the finger, or slide the bow along the edge, and
another mode can take the bow: the note jumps, and the sand runs to new lines.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/chladni/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | bow a plate while the key is held (88 keys, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | bow force |
| `Space` | sustain: the hand stays off the plates, which ring on when the bow lifts |
| MIDI | notes, velocity (the bow force, 0.5–1.5×, and its first bite), sustain pedal (CC64); **mod wheel = the bow moved along the edge**; aftertouch presses the bow harder |
| MPE | each note's pressure presses its own bow; slide (CC74) moves its bow along its edge |
| Touch | lean on a held key = aftertouch |
| Plate view | tap twice to sprinkle fresh sand |

## The physics

### 1. The plate and its modes

A thin square plate of side a, thickness h, density ρ, Young's modulus E and
Poisson ratio ν bends with stiffness D = Eh³/12(1−ν²). Its free vibrations are
the stationary points of the Kirchhoff energy

  U = D/2 ∫∫ [w_xx² + w_yy² + 2ν w_xx w_yy + 2(1−ν) w_xy²] dA,
  T = ρh/2 ∫∫ ẇ² dA,

with no condition at all on the free edges: the Rayleigh–Ritz method gets
the free-edge conditions (no bending moment, no Kirchhoff shear) for nothing,
which is why Ritz could solve Chladni's square in 1909 when nobody had
before. The model does what Ritz did, in a richer basis: products
Pᵢ(x)Pⱼ(y) of normalised Legendre polynomials up to degree 23 on the square
[−1, 1]², integrated by 40-point Gauss–Legendre quadrature. The square's
symmetry splits the problem into four blocks (each mode even or odd across
each centre line), 144 functions each, and each block is a generalized
symmetric eigenproblem K c = Λ² M c (`native/instruments/chladni/chladni-model.cpp`).
Λ = ω (a/2)² √(ρh/D) is the frequency in the half side's units; Leissa's
λ = ωa²√(ρh/D) is 4Λ.

The tests check the free plate at ν = 0.3 against Leissa (1973): λ = 13.469,
19.596, 24.270, 34.801 (a pair), 61.093 (a pair), 63.687, all within 0.05 %.
The modes that are odd across one centre line and even across the other come
in equal pairs, rotated copies of each other, and the solve gives them equal
to 10⁻⁹.

### 2. The clamp

Chladni screwed his plates to a post at their centre, between pads of
leather. The clamp is a stiff elastic foundation (a Winkler foundation,
κ = 2×10⁵ in units of D/(a/2)⁴) over a disc of a tenth of the side across,
added to the stiffness: every mode that moves the centre is held there and
rises, and the modes odd across both centre lines, still at the centre
anyway, hardly change. The lowest modes of the clamped brass plate are then a
pair of rocking modes (one nodal line through the clamp, Λ = 1.881), then
2.889, 3.287 (the cross), 4.807 (the diagonals), ...

**Held by** can also free the plate, held only by the finger (in Chladni's
other grip: the plate between thumb and finger at a node). Then the modes are
the free square's, and the figure that the clamp gave is matched by its
shape (see Simplifications).

### 3. Each key's plate

The figure's mode has its own Λₜ. Every key's plate is the same plate scaled
so that mode lands on the key's note:

  a = 2 √(Λₜ c / ωₜ),  c = h √(E / 12ρ(1−ν²)).

At the defaults (brass, 1.5 mm, the diagonals) the A4 plate is 10.5 cm
across and weighs 140 g; A0's is 42 cm and 2.2 kg; C8's is 3.4 cm. A thicker
plate is cut bigger, a glass one smaller (Chladni's glass, 2.5 mm thick, is
17 cm across at A4). Because every key's plate is the same shape, its modes
stand in the same ratios on every key, and with losses that are a fixed
share of each cycle the plates behave alike in units of their own period:
the bass plays what the treble plays, slower.

### 4. Losses

A plate loses a fixed share of its energy each cycle (the metal's or glass's
internal friction, the leather of the clamp, the air): a loss factor η, so
each mode decays at σₙ = π fₙ η. **Ring time** sets η so that the figure's
note rings that long once the bow lifts, on every key, but η never exceeds
1/240 (a Q of at least 240): at the default 1.2 s the plates below A4 ring
longer than that, as real ones do. A lossier bass plate is quick to speak but
messy, the modes fighting for the bow; Q 240 keeps it clean.

### 5. The bow

The bow touches the edge at one point and pulls it along the edge's normal.
Each mode n has a modal coordinate qₙ, mass m = ρha² (the shapes are
normalised so ∫∫φₙ² = 4 over the unit square), and a shape φₙ(b) at the bow.
Every sample, each mode advances exactly as a damped oscillator (a two-pole
filter), free, and the edge's velocity at the bow is the free part plus the
response to the friction force F this sample:

  v_b = v_free + Y_b F,

where Y_b, the edge's answer at the bow to a force held for one sample, is
each mode's exact response summed over the modes, weighted by φₙ(b)².

The bow moves at speed V. The rosin's friction falls from its static value
as the hair slides, hyperbolically,

  μ(u) = μd + (μs − μd) / (1 + |u|/v₀),  μd = 0.3,  μs = 0.35 + 0.65 × rosin,  v₀ = 0.1 m/s,

and the force is at most μ N for a bow force N. The solve is implicit: the
hair **sticks** (u = 0) if the force that would hold the edge to the hair,
|V − v_free|/Y_b, is within μs N; otherwise it **slips** at the speed u that
solves u = V − v_free − Y_b μ(u) N sign(u), found by a safeguarded Newton
iteration. The same solve drives the bowed and rubbed instruments elsewhere in
Forte (the Viola Organista, the Glass Armonica, the Clavicylinder).

### 6. The fingers and the threshold

On a plate every mode is a candidate, and a bow at one spot excites all the
modes that swing there. Chladni held a finger on a nodal line of the figure
he wanted: the figure does not move there, so the finger costs it nothing,
while it damps every mode that does. Here two fingertips rest on the figure's
nodal lines, each a dashpot of 8 N·s/m on the modes that move under it.

The bow's place and the fingers' are found for each figure when the plate is
solved: along the edge, from the middle of one side to the corner and on
along the next, the bow goes where the figure swings well and its strongest
rival is weakest against its own losses (its losses plus the fingers'), and
the two fingers go on the figure's nodal lines where they damp the rivals
most. A rival near a harmonic of the figure counts four times, since the
stick and slip's harmonics drive it too.

Where the friction falls as the hair slides faster, its slope acts as
negative damping on every mode that swings at the bow. Linear stability then
gives the force at which the figure just starts to grow:

  N_th = 2 m (σₜ + σ_finger,ₜ) / (|μ′(V)| φₜ(b)²).

**Bow force** is a multiple of this threshold (the readout gives it in
newtons: 0.31 N on the diagonals from A0 up to A4 at the defaults, falling
above, where the treble plates ring longer). Velocity scales it 0.5–1.5×,
aftertouch up to 2× more, and the bow bites as it lands: at full velocity it
presses four times as hard at first, letting go over 12 cycles of the note.
The tests check that 0.7× the threshold stays silent and 1.6× grows.

The stick and slip lock the plate to one mode and make true harmonics of it
(2f and 3f within half a cent), not the plate's own inharmonic overtones.
They also pull the pitch a few cents flat of the mode, more for a heavy bow:
the edge sticks a little longer than the mode's free half-period. The tests
allow 6 ¢.

### 7. The sand

The page drops 4,000 grains on each key's plate. Where the plate's
acceleration (from the engine's modal amplitudes) is less than gravity's,
the grains stay put; where it is more, they are thrown, at a speed
2v√(1−g/a) for a plate swinging at speed v and acceleration a, and land a
random step away, of length √(2v³dt/g). Grains wander off the swinging parts
and stop where the plate is still, so the figure draws itself in a second or
two. Each key keeps its own sand; it is swept off when the figure, material,
hold or thickness changes.

The microphones are two points above the plate, which hear its velocity
under them.

## What to listen for

- **The threshold**: set Bow force to 1 and play softly: the note swells in
  slowly, or not at all. At 2.5 it speaks at once.
- **The bass speaks late**: a bass plate takes many of its own slow cycles to
  build up (about 1 s on A2, 1.7 s on A1), as a big plate does under a bow.
- **The finger**: lift it (**Finger on a node**). On the diagonals a lower
  mode takes the bow, and the sand goes to its lines.
- **The mod wheel**: move the bow along the edge. A note that has the bow
  keeps it; with the wheel up, each new note can be taken by a rival mode at
  its own pitch (the diagonals' A4 gives way to a mode 3.5 times higher with
  the wheel at 70 %), or not speak at all.
- **A heavy bow**: at 12× the threshold the attack rasps, and some figures
  jump to a rival.
- **The figures**: the Figures view shows all ten on this plate, with each
  one's pitch over the lowest. Change Figure and the keyboard is re-cut: a
  figure higher on the plate needs a bigger plate for the same note.

## Files

```
chladni/index.html, style.css             page
chladni/src/chladni-params.js             parameters, the figures and presets
chladni/src/chladni-instrument.js         the descriptor: everything but the page
chladni/src/chladni-main.js               page wiring, the sand, the views
chladni/src/chladni-wasm.js               the engine and model, the C++ as WebAssembly (chladni/wasm/chladni.wasm)
native/instruments/chladni/               the physics in C++: model, engine (plugins and WebAssembly)
test/chladni-tests.mjs                    node test/chladni-tests.mjs
tools/render-chladni.mjs                  node tools/render-chladni.mjs → examples/chladni/
```

## Simplifications

* **A point bow on the edge's normal.** Real hair is a ribbon a centimetre
  wide, and the bow also drags the edge along itself (in-plane, which hardly
  sounds) and twists it. The friction law is a curve of the sliding speed
  alone; real rosin softens with the heat of the contact (Smith & Woodhouse
  2000) and its friction lags the speed.
* **The fingers are dashpots at points**, not a pad of flesh with its own
  mass and stiffness, and they never move.
* **The clamp is a stiff spring over a disc**, with no mass and no loss of
  its own beyond the plate's shared loss factor; the post does not move.
* **Constant Q.** Every mode of a plate has the same loss factor. Real
  plates lose more in their high modes (the air's radiation above the
  coincidence frequency, the clamp's leather), and less in some.
* **Thin-plate theory.** No shear deformation or rotary inertia (Mindlin):
  fine for the modes that sound here, which are long against the thickness.
* **The free plate's figures.** The figures are named on the clamped plate
  and found on the free one by their shape: the free mode in the same
  symmetry block that overlaps the clamped figure most. Freed, some figures
  change; the line through the clamp becomes the free plate's line and two
  arcs, the same mode as "A line and two arcs".
* **The sand is a picture.** The grains are thrown by the engine's real
  amplitudes but do not load the plate, collide or roll, and the microphones
  hear the plate's velocity, not its radiation. A powder as light as
  lycopodium gathers at the antinodes instead, carried there by the air
  (Faraday 1831); the air is not modelled.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims how many
modes a plate plays and how many plates sound at once: 64 modes a plate at
High, 24 at Medium and 12 at Low (always at least five beyond the figure's),
and 88, 24 and 12 plates at once (past that, the quietest unbowed plate is
let go). A plate lifted from the bow stops once it is 90, 80 or 70 dB down.
The figure keeps its pitch within a couple of cents at every setting.

## Prior art and references

**Chladni and the figures.**
* Chladni, E. F. F. (1787). *Entdeckungen über die Theorie des Klanges*.
  Leipzig: Weidmanns Erben und Reich. The figures, drawn in sand on bowed
  plates of glass and brass, clamped or held at a node.
* Chladni, E. F. F. (1802). *Die Akustik*. Leipzig: Breitkopf & Härtel. The
  figures again, with the square plate's families.
* Waller, M. D. (1961). *Chladni Figures: A Study in Symmetry*. London:
  G. Bell & Sons. Plates of many shapes, bowed and photographed.
* Stöckmann, H.-J. (2007). "Chladni meets Napoleon." *Eur. Phys. J. Special
  Topics* 145, 15–23.
  [doi:10.1140/epjst/e2007-00144-5](https://doi.org/10.1140/epjst/e2007-00144-5).
  The prize that Napoleon put up for the theory of Chladni's figures, and
  Sophie Germain's plate equation that won it in 1816.

* Faraday, M. (1831). "On a peculiar class of acoustical figures; and on
  certain forms assumed by groups of particles upon vibrating elastic
  surfaces." *Phil. Trans. R. Soc. Lond.* 121, 299–340. Why light powders
  gather at the antinodes, not on Chladni's lines.

**The plate.**
* Kirchhoff, G. (1850). "Über das Gleichgewicht und die Bewegung einer
  elastischen Scheibe." *J. reine angew. Math.* 40, 51–88. The free edge's
  conditions, and the energy the model minimises.
* Ritz, W. (1909). "Theorie der Transversalschwingungen einer quadratischen
  Platte mit freien Rändern." *Annalen der Physik* 333, 737–786.
  [doi:10.1002/andp.19093330403](https://doi.org/10.1002/andp.19093330403).
  The first solution of Chladni's free square, and the method used here.
* Leissa, A. W. (1973). "The free vibration of rectangular plates." *J.
  Sound Vib.* 31, 257–293.
  [doi:10.1016/S0022-460X(73)80371-2](https://doi.org/10.1016/S0022-460X(73)80371-2).
  The free square's frequencies the tests check.

**The bow.**
* McIntyre, M. E., Schumacher, R. T. & Woodhouse, J. (1983). "On the
  oscillations of musical instruments." *J. Acoust. Soc. Am.* 74, 1325–1345.
  [doi:10.1121/1.390157](https://doi.org/10.1121/1.390157). The bow's
  friction against a linear resonator, solved each sample.
* Smith, J. H. & Woodhouse, J. (2000). "The tribology of rosin." *J. Mech.
  Phys. Solids* 48, 1633–1681.
  [doi:10.1016/S0022-5096(99)00067-8](https://doi.org/10.1016/S0022-5096(99)00067-8).
* Akay, A. (2002). "Acoustics of friction." *J. Acoust. Soc. Am.* 111,
  1525–1548. [doi:10.1121/1.1456514](https://doi.org/10.1121/1.1456514).

**Earlier models.**
* Essl, G. & Cook, P. R. (1999). "Banded waveguides: towards physical
  modeling of bowed bar percussion instruments." *Proc. ICMC 1999*, Beijing;
  and (2000), "Measurements and efficient simulations of bowed bars," *J.
  Acoust. Soc. Am.* 108, 379–388.
  [doi:10.1121/1.429471](https://doi.org/10.1121/1.429471). Bowed bars and
  plates as banded waveguides, one band for each mode, in the Synthesis
  ToolKit; a bowed plate's sound, without its figures.

Pictures of Chladni figures, computed or filmed, are everywhere, and bowed
cymbals and plates are a familiar sound. We know of no earlier instrument that
bows a modelled plate on every key and draws its sand as it plays.
Forte's [Gong Keyboard](../gongs/README.md) strikes plates (round, free,
nonlinear); here the bow and the figures are what is new.
