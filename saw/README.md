# Musical Saw

A carpenter's handsaw without its teeth: a thin, tapered steel blade, its
handle held between the player's knees and its tip in the fingers of one
hand, bent into an **S** and bowed on its smooth back edge with a cello bow
(or struck with a soft mallet). It sings: a nearly pure tone that swells
under the bow, rings on for seconds after it, and slides from note to note
as the player bends the blade, wavering with the knee that holds it.

Why a flat strip of steel, which can vibrate in dozens of ways, gives one
tone that pure, and why only when it is bent into an S, was worked out
fully only in 2022 (Shankar, Bryde and Mahadevan; earlier, Scott and
Woodhouse in 1992). A curved sheet is stiffer than a flat one to waves that
vary across it, because bending it there stretches it. In an S the
curvature turns over along a line across the blade, its **inflection**,
where the blade is flat and so softest. A wave there, at the right
frequency, cannot run into the curved blade on either side: it is
**trapped**, away from the knees and the fingers that would soak it up, and
it rings on. Where the inflection sits sets the note, so the player slides
the S along the tapering blade to play a tune. Bend the blade into a **J**,
curved one way only, and there is nothing to trap the wave: the saw goes
dull.

Each key here is the saw bent for its note. The bow and the mallet are
physical, the trap is solved from the shell equations, and its loss to the
hands is the rate at which the wave tunnels out.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/saw/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | bow (or strike) a saw while the key is held (88 keys, A0–C8; a 26-inch saw's are C4–C♯6) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how hard the bow presses, or the mallet falls |
| `Space` | sustain: the hand stays off the blade, which rings on when the bow lifts |
| MIDI | notes, velocity (the bow's force, 0.5–1.5×, and its first bite; the mallet's speed), sustain pedal (CC64); **mod wheel = the knee's vibrato**; aftertouch presses the bow harder; pitch bend bends the blade |
| MPE | each note's bend bends its own saw (±48 semitones); slide (CC74) shakes its own vibrato; pressure presses its bow |
| Touch | lean on a held key = aftertouch |

**Playing** chooses between a saw for every key (chords play) and **One
saw**, the instrument as played: one note at a time, sliding to each key
pressed while another is held and back when it lets go, as the player
re-bends the blade.

## The physics

### 1. A curved blade is stiffer across

The blade is a shallow shell: steel (Young's modulus Y = 200 GPa, density
ρ = 7850 kg/m³, Poisson's ratio ν = 0.29), thickness h (0.75 mm here), bent
along its length with curvature b(x). Its transverse deflection f and the
Airy stress function χ of the stretching it causes obey Donnell's
shallow-shell equations, as Shankar, Bryde and Mahadevan write them:

  ρh ∂²f/∂t² = −κ ∇⁴f + b ∂²χ/∂y²,   ∇⁴χ / (Yh) = −b ∂²f/∂y²

with κ = Yh³/12(1 − ν²) the bending stiffness. For a wave across the blade
with wavenumber q (its shape φ(y)) and along it with k, on a blade of
constant curvature b,

  ω² = a² (k² + q²)² + c² b² q⁴ / (k² + q²)²,   a² = κ/ρh,   c² = Y/ρ

The first term is a flat plate's bending; the second is the stretching the
curvature adds. A wave that doesn't vary across the blade (q = 0) bends it
as it would bend a flat strip, but any shape across it lifts the floor of
the band of frequencies the curved blade can carry, by c·b. That floor, the
**band edge**, is what The trap view draws.

Across the blade the shapes are those of a free–free beam of the blade's
width W: q = βₘ/W with β = 4.730 (two nodal lines along the blade, the
note) and 7.853 (three).

### 2. The trap

Through the inflection the curvature changes sign; near it, b(x) = b′x.
Writing X = qx, L = ∂²/∂X² − 1, Ω = ω/(aq²) and

  ε = c b′ / (a q³)

the equations become one eigenproblem with one number in it:

  Ω² f = L² f + ε² X L⁻² (X f)

The second term is a well, zero at the inflection and growing on either
side: its eigenmodes are trapped there. For a gentle bend (small ε) it is
the harmonic oscillator's, Ω² ≈ 1 + (2n + 1)√2 ε, with Hermite functions of
width ℓ = √(√2/ε)/q for shapes; for tighter bends we solve it.
`tools/saw-native-table.mjs` does so by finite differences, for ε from
10⁻³ to 30, and writes the lowest three modes' Ω and widths into
`native/instruments/saw/saw-table.h`. The tests check that table against the
harmonic well, against a variational bound worked independently in Fourier
space, and against the same solve on a finer grid.

The **note** is the lowest trapped mode with two nodal lines along the
blade (n = 0); the next ones up (n = 1, which changes sign at the
inflection, and n = 2) and the lowest with three nodal lines also sound,
much fainter. At the defaults the n = 1 mode sits about 1.3 times above the
note and the three-line mode about 1.5 times.

### 3. The blade and the player

The blade is a 26-inch saw's (our numbers for a typical blade, not one
maker's): 0.66 m long, 0.17 m wide at the heel by the handle and 0.045 m at
the toe. A narrower blade is stiffer across (q larger), so the further the
inflection sits toward the toe, the higher the note: from about C4 with the
inflection a quarter of the way along to C♯6 at 85 %, two octaves, as
players get from such a saw. For each key the model finds the place
(bisection) where the trapped mode is the key's note in the keyboard's
tuning; the views show it.

The player also bends the S tighter as it moves toward the narrow tip, so
the curvature keeps pace with the blade's stiffness there: our model of the
player is b′ ∝ 1/W², with **How tight the S** the gradient at the blade's
middle (6 /m² by default). The S turns over within X_S = 10 cm of the
inflection; past that the curvature holds at b₀ = b′X_S (0.6 /m at the
middle, within the 0.4–0.8 /m Shankar and his colleagues bent their saw
to), b(x) = b₀ tanh(b′x/b₀).

Keys below C4 and above C♯6 play a bigger or smaller saw of the same shape:
every length scaled by λ, which leaves ε alone and divides every frequency
by λ (A0 is a saw 4.7 times as big, C8 one 3.7 times as small). Its bow,
mallet and bow force scale with it.

### 4. Losses: the steel, and tunnelling to the hands

The steel's internal friction and the sound the blade gives off are one
loss factor, set by **Ring time** (the T60 at A4, 2.5 s), so a mode at f
decays at π f η.

The trapped mode's tail reaches the knees (3 % of the length from the
handle end) and the fingers (at 97 %) through the curved blade, where it
cannot run but only fade, as a quantum particle tunnels through a barrier.
Along the blade the barrier is the band edge, with the curvature saturating
and the width growing toward the handle:

  ω_edge²(x) = a² q(x)⁴ + c² b(x)²,   κ(x)² = (ω_edge² − ω²) / (2a² q²)

and the hands soak up whatever reaches them. The leak is Gamow's rate: the
rate at which the wave bounces in the well (the spacing of its levels over
2π) times the WKB transmission e^(−2∫κ dx) to each hand. A well-bent saw
leaks nothing you can hear; a loose bend (2 /m²) makes the dip so shallow
that the mode spills out to the hands and dies in a fraction of a second;
notes near the handle end leak more than those in the middle.

A **J** has no inflection, so nothing is trapped: the waves of the note's
shape run the length of the blade and through the hands. We give them the
Q Shankar and his colleagues measured for a J, about 10 (against about 150
for their bowed S), spread over a band around the note.

A key let go lays a hand on the blade (a T60 of 0.3 s); the pedal keeps it
off, and the note rings on.

### 5. The bow

The bow crosses the edge of the blade, where every shape across it swings
most (φ = 2), at **Where it is played** along the blade from the
inflection; each mode moves there by its Hermite function, hₙ(x/ℓₙ). The
edge's velocity this sample is linear in the friction force F: its free
motion v_f plus Y·F, Y the modes' response there. The rosined hair moves at
the bow's speed V. If the force that would hold the edge to the hair is
within μs·N, it sticks; otherwise it slips at the speed u that solves

  u − |V − v_f| + Y N μ(u) = 0,   μ(u) = μd + (μs − μd)/(1 + u/v₀)

(μs = 0.8, μd = 0.3, v₀ = 0.1 m/s; safeguarded Newton), as McIntyre,
Schumacher and Woodhouse solve a bow against a linear resonator, and as
Forte's [Chladni Plate](../chladni/README.md) does. The friction's fall
with speed is a negative damping: the note grows once it pays for the
mode's losses, at the threshold force

  N_th = 2 M σ / (|μ′(V)| b²)

with M = ρhWℓ the mode's mass, σ its decay rate (the steel's and the leak)
and b = 2·h₀(0) its swing under the bow at the inflection. **Bow pressure**
is a multiple of it (a J's is the S's: nothing it can hold grows), so every
note speaks alike; velocity scales it 0.5 to 1.5 times and adds a bite that
lets go over a quarter second, and aftertouch presses harder.

Off the inflection the note's mode moves less under the bow, so it needs
more pressure: about 5 cm off, the A falls silent. On the high notes the
second trapped mode is close above the note and moves most off the
inflection, so the bow catches it instead and the note jumps up. Pressing
far harder than the threshold, the bow bites, the note goes flat by tens
of cents and can leap to a higher mode.

### 6. The mallet

A felt mallet (20 g) arrives at the blade at 0.05 + 0.5 × velocity m/s and
pushes only while it is pressed into the steel, as a spring whose stiffness
gives the **contact time** (K = m (π/τ)²), solved each sample with the
blade's own move under it. A long, soft contact reaches only the trapped
note; a short one knocks the higher modes too.

### 7. Bending while it sings

Each mode is a complex amplitude stepped exactly each sample,
e^((−σ + iω)/fs), with the force held over the sample. When the note moves
(the knee's **vibrato**, which starts a third of a second into the note;
the pitch wheel; One saw's slide; MPE), every mode's frequency turns with
it, and its amplitude follows the adiabatic invariant of a slowly changed
oscillator, its action E/ω: bent up, the blade's swing shrinks as √(1/Mω).
After the note has moved a fiftieth of an octave, the blade is bent afresh
(the inflection moved, the trap solved again).

### 8. What we hear

The blade's velocity under a microphone close by, past the inflection
toward the tip and off the blade's centre line, so that every mode is
heard. One saw has one place, so the sound is mono, into the room.

## What to listen for

- **The swell.** Bowed, the note doesn't start: it grows, as the stick and
  slip feed the trapped mode, faster with more velocity. Low notes take
  longest.
- **One line.** The spectrogram of a bowed note is nearly one line: the
  trapped mode alone, its neighbours far quieter.
- **A J.** Bend the blade into a J and strike it: a short, dull clunk.
  Bowed, it won't speak at all.
- **A loose bend.** Struck, a well-bent saw rings for seconds; at 2 /m² it
  dies almost at once, the trap too shallow to hold it.
- **The sweet spot.** Bow 5 cm off the inflection and A4 falls silent;
  high notes jump up to the second trapped mode instead.
- **The slide.** In One saw, hold a key and press another: the note slides
  there, the bow still on.
- **The knee.** The vibrato comes in once the note has started; the mod
  wheel shakes it harder.

## Files

```
saw/index.html, style.css            page
saw/src/saw-params.js                parameters and presets
saw/src/saw-instrument.js            the descriptor: everything but the page
saw/src/saw-main.js                  page wiring and views
saw/src/saw-tour.js                  the guided tour
saw/src/saw-wasm.js, saw/wasm/saw.wasm   the engine and model, built from the C++
native/instruments/saw/              the physics in C++: model and engine (plugins and WebAssembly)
native/instruments/saw/saw-table.h   the trapped modes, from tools/saw-native-table.mjs
test/saw-tests.mjs                   node test/saw-tests.mjs
tools/render-saw.mjs                 node tools/render-saw.mjs → examples/saw/
```

## Simplifications

- **The trap is solved on a straight line through the inflection.** The
  table assumes a uniform width and b(x) = b′x; the taper and the
  curvature's saturation enter only the leak, through the band edge. A
  mode much wider than the S's turn would be lowered a little by the
  saturation, which isn't modelled.
- **The shapes across the blade are a free beam's.** A plate's free edges
  differ slightly (Poisson's ratio), and the two directions don't
  separate exactly on a tapered, curved blade.
- **The player's bend is a rule.** How tight players bend, and how that
  changes along the blade, is our choice (b′ ∝ 1/W²), as are the blade's
  dimensions and where the hands hold it.
- **The hands are perfect absorbers** at a fixed place, and the leak is the
  WKB estimate, good when the barrier is thick; when the note is above the
  band edge the hands take it at the bounce rate.
- **One loss factor** stands for the steel and the radiation, and a J's
  waves have Shankar and his colleagues' measured Q rather than a solved
  one.
- **The microphone hears velocity**, not the blade's radiation: a thin
  plate below its coincidence frequency radiates its modes with different
  efficiencies, which this leaves out.
- **The bow never changes direction**, and its hair is a point.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims how many
of the trapped modes a saw plays, the note first (5 at High; 3 at Medium,
the note, the next one along and the lowest with three nodal lines; 2 at
Low), and how many saws sound at once (16, 10 and 6: past that, the oldest
let-go saw is damped fast, else the oldest held one). The note keeps its
pitch within a couple of cents and its level within a decibel or so.

## Prior art and references

**The instrument.**
* Musical saws have been made for playing since the early twentieth
  century; Clarence Mussehl began making them in 1919
  ([musicalsaw.com's history](https://musicalsaw.com/index.php/2013/05/21/history-of-the-musical-saw/)).
  Played on stage in vaudeville and since by folk, classical and film
  musicians.

**The physics of the saw.**
* Shankar, S., Bryde, P. & Mahadevan, L. (2022). "Geometric control of
  topological dynamics in a singing saw." *Proc. Natl. Acad. Sci. USA* 119
  (17), e2117241119.
  [doi:10.1073/pnas.2117241119](https://doi.org/10.1073/pnas.2117241119);
  [arXiv:2108.10875](https://arxiv.org/abs/2108.10875). The shallow-shell
  equations used here, the mode trapped at the inflection, a J against an S
  (Q ≈ 10 against ≈ 150), and bowing near the inflection for the clearest
  note.
* Scott, J. F. M. & Woodhouse, J. (1992). "Vibration of an elastic strip
  with varying curvature." *Phil. Trans. R. Soc. A* 339, 587–625. The
  localised mode at an inflection, found asymptotically.
* Worland, R. (2016). "The musical saw and the flexatone: An experimental
  study of confined vibrational modes in metal plates of variable
  curvature." *J. Acoust. Soc. Am.* 139, 2011 (meeting abstract); and
  (2019), "The musical saw: Musical acoustics of trapped vibrational modes
  in a curved blade," *J. Acoust. Soc. Am.* 145, 1750 (meeting abstract).
  Measured trapped modes in saws.

**The physics used.**
* Donnell, L. H. (1933). "Stability of thin-walled tubes under torsion."
  NACA Report 479. The shallow-shell equations.
* Gamow, G. (1928). "Zur Quantentheorie des Atomkernes." *Z. Physik* 51,
  204–212. [doi:10.1007/BF01343196](https://doi.org/10.1007/BF01343196). The
  escape rate from a well as the bounce rate times the transmission.
* McIntyre, M. E., Schumacher, R. T. & Woodhouse, J. (1983). "On the
  oscillations of musical instruments." *J. Acoust. Soc. Am.* 74, 1325–1345.
  [doi:10.1121/1.390157](https://doi.org/10.1121/1.390157). The bow's
  friction against a linear resonator, solved each sample.
* Smith, J. H. & Woodhouse, J. (2000). "The tribology of rosin." *J. Mech.
  Phys. Solids* 48, 1633–1681.
  [doi:10.1016/S0022-5096(99)00067-8](https://doi.org/10.1016/S0022-5096(99)00067-8).
  Rosin's friction falling with sliding speed.

**Earlier models.** Saws are often sampled, and bowed bars and plates have
been modelled (Essl and Cook's banded waveguides, credited on the
[Chladni Plate](../chladni/README.md)), but we know of no earlier
synthesis that plays the saw from its trapped mode, with the bend as the
note.
