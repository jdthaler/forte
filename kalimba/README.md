# Kalimba

A thumb piano for every key. Each key is a spring-steel tine clamped under a
bar, resting on a bridge and free at the tip, over a small wooden box with a
sound hole. Nothing is sampled: the tine is solved as a beam, the thumb pushes
it down and lets it go, and the box is the top's first mode and the air in its
sound hole, bouncing on each other. What you can hear that a sample could not
give you: the bright, out-of-tune overtone at the start of each note moves
when you change how much of the tine lies behind the bridge, the thumb's
release chooses which modes ring, a finger over the sound hole bends the box's
resonance down for the kalimba player's wah, and bottle caps on the box buzz
only when a note is loud enough to throw them off the wood.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/kalimba/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (C4–E6; *Full range* opens A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how hard the thumb pushes |
| `Space` | keep fingers off released tines (when *Let the tines ring* is off) |
| MIDI | notes, velocity, sustain pedal (CC64), mod wheel: a finger over the sound hole |

## The physics

**The tine.** A kalimba's tine is pressed down by a bar behind the bridge,
passes over the bridge and ends in a free tip. The part behind the bridge
vibrates as well, so the tine is an Euler–Bernoulli beam that is clamped at
the bar, simply supported at the bridge and free at the tip (Chapman 2012):

  EI ∂⁴w/∂x⁴ + μ ∂²w/∂t² = 0, w = w′ = 0 at the clamp, w = 0 at the bridge, w″ = w‴ = 0 at the tip

with slope and bending moment continuous over the bridge (a support holds no
moment). Writing each segment as A cos βx + B sin βx + C e^(−βx) + D e^(−β(ℓ−x))
keeps every term bounded, and the eight boundary conditions give an 8 × 8
determinant whose roots are the modes' βL (L the front length, from the bridge
to the tip). Their ratios depend only on how long the back segment is relative
to the front, the *Back length* control:

| back / front | f₂/f₁ | f₃/f₁ | note |
|---|---|---|---|
| 0 | 6.267 | 17.55 | clamped at the bridge: the cantilever, cos βL cosh βL = −1 |
| 1 | 6.249 | 9.000 | equal lengths: βL = π/2, 3π/2, 5π/2… exactly, so mode 3 is the 9th harmonic |
| 1.12 (default) | 5.641 | 8.476 | within the 5.3–5.9 Chapman measured on a kalimba (2008) |
| 1.5 | 3.85 | 8.23 | the back segment's own mode comes down among the first |

Each key's tine is cut to the front length that puts its first mode on the
note: f₁ = β₁² √(EI/μ) / (2π L²), with spring steel (E = 200 GPa,
ρ = 7850 kg/m³), 5 mm wide and *Tine thickness* thick. At the default 1.2 mm,
C4's tine is 50 mm in front of the bridge and E6's 22 mm; with *Full range*,
A0's is 156 mm (a bass box's tongue) and C8's 13 mm. Each mode's shape is the
null vector of the determinant at its root, normalised over the whole tine,
clamp to tip.

**The pluck.** The thumb pushes the tine down at the *Pluck point* and lets
go. At velocity 1 it pushes 3 mm, or as far as 8 N takes it on a tine too
stiff for that (the treble ones); velocity scales both. The tine starts from
its static deflection under that force, which in modes is

  w(x) = Σₙ F φₙ(p) φₙ(x) / (μ L ωₙ²)  (φ mass-normalised)

so a mode is reached in proportion to its shape at the pluck point and falls
as 1/ω². A pluck on a mode's node leaves it silent: the first overtone's node
is at 71 % of the front length with the default back length (78.3 % on a
cantilever). Letting go takes time: the thumb's force falls as a raised
cosine over the *Release* time τ, and a mode is left ringing with the
spectrum of that force's derivative, a half-sine pulse,

  |cos(π f τ) / (1 − (2 f τ)²)|

flat for f ≪ 1/τ and zero at f = 1.5/τ. A thumbnail lets go in a tenth of a
millisecond and every mode rings; soft flesh takes a few and the overtones
never start.

**What reaches the box** is the net force the tine puts on its supports, the
reaction to its own acceleration, Fₙ = ωₙ² qₙ ∫μφₙ dx. At release these add
up to the thumb's force (the modes are complete), so the box is pushed down
by the thumb until the instant it lets go. A mode's share is its effective
mass (61 %, 19 % and 6.5 % of a cantilever's mass for the first three); the
back segment's mode and the higher ones hardly move the supports. Each mode
decays at σ ∝ f^d (*Ring time* for C4's fundamental, *Damping vs frequency*
for d), from C4's 6 s at the default: the overtones die within a fraction of
a second, the fundamental sings on. A kalimba has no dampers, so the tines
ring until they fade; with *Let the tines ring* off, releasing a key lays a
fingertip on its tine (T₆₀ 0.3 s) unless Space or the pedal is down. Plucking
a tine that is still ringing first stops it under the thumb.

**The box** (0.88 L at the default: a 17 × 13 cm top over a 4 cm deep cavity,
scaled with *Box size*). Its top is a 4 mm plywood plate simply supported on
the walls, with modes

  f_mn = (π/2) √(D/ρh) ((m/a)² + (n/b)²), D = E h³ / 12(1 − ν²)

of which only those with m and n both odd change the cavity's volume
(S = ab · 4/(mnπ²)) and so radiate as a monopole. The (1,1) mode (664 Hz)
and the air in the sound hole are coupled through the air in the box, as
in Christensen and Vistisen's model of a guitar's low end:

  M q̈ + R q̇ + K q = φ F + p S, I Ü + R_h U̇ = p, p = −(ρc²/V)(S q + U)

with the hole's inertance I = ρ L_eff / A (L_eff the top's thickness plus
1.7 × its radius). Alone, the hole would ring at the Helmholtz frequency
f_H = (c/2π) √(A / V L_eff) (257 Hz) and the top at 664 Hz; coupled, they
push apart to 249 and 684 Hz, with f₋ f₊ = f_top f_H. The low resonance
boosts the lowest tines; below it the air pushed out through the hole cancels
the top's push and little sound comes out. The radiated pressure is the box's
volume acceleration, ρ Q̈ / 4πr. The higher odd–odd modes (2.6 kHz and up)
are driven where each tine crosses the bridge: C4 in the middle, the others
alternating outward, as on a kalimba. The top is damped hard (Q 3): wood,
glued edges and the hands holding the box. Its resonance still favours
E5–F5 by about 12 dB over E4–F♯4.

**The sound hole and the wah.** A finger over part of the hole leaves an
opening of the same area: the inertance rises, f_H falls and the low
resonance slides down; shut, the air's resonance is gone and the top sits on
the sealed cavity alone (681 Hz). The mod wheel moves the finger, and the
engine follows it within 20 ms. In time, the top, the hole and the higher
modes are integrated by the trapezoidal rule, which stays stable while they
change and is retuned per mode so each rings at its own frequency.

**The buzzers.** *Buzzers* puts up to eight bottle caps on the lower part of
the top, as on an mbira. Each is a bouncing ball (Holmes 1982): it rides the
top until the top under it accelerates downward faster than gravity, then
flies, falls back, lands with a coefficient of restitution of 0.5 and rings
(two modes between 3.2 and 11 kHz, T₆₀ 20 ms), kicked by how fast it landed.
Soft notes never throw the caps; at the default, C4 starts them near velocity
0.1, they are clearly heard from about 0.2, and harder notes rattle them more.

## What to listen for

The demos are in `examples/kalimba/`.

1. **Two thumbs** (`01`): a pattern over a moving bass, the tines left to
   ring into each other.
2. **Nail, then flesh** (`02`): the same four notes plucked with a thumbnail
   (every mode), then with soft flesh (only the fundamental).
3. **The overtone set by the back length** (`03`): C4, G4, C5 clamped at the
   bridge (6.27), at the default (5.6), with equal lengths (the 9th
   harmonic, which blends).
4. **Wah over the sound hole** (`04`): a finger slides over the hole and off
   again while low notes ring.
5. **Bottle caps, soft then loud** (`05`): an mbira's phrase played softly
   (the caps lie still) and loudly (they rattle).
6. **Marimbula** (`06`): a bass box, long thick tongues and a 25-litre box.

On the page, the tine view shows the tine in slow motion and the box view its
response; drag *Back length* and watch the overtone move in the spectrum.

## Files

```
kalimba/index.html, style.css            page
kalimba/src/kalimba-params.js             parameters and presets
kalimba/src/kalimba-instrument.js         the descriptor: everything but the page
kalimba/src/kalimba-main.js               page wiring and views
kalimba/src/kalimba-wasm.js, kalimba/wasm/kalimba.wasm   the engine and model, built from the C++
native/instruments/kalimba/              the physics in C++: model and engine (plugins and WebAssembly)
test/kalimba-tests.mjs                   node test/kalimba-tests.mjs
tools/render-kalimba.mjs                 node tools/render-kalimba.mjs → examples/kalimba/
```

## Simplifications

- **One way from tine to box.** The tines drive the box but do not feel it:
  no energy leaves a tine through the bridge, so a note on the box's
  resonance rings as long as its neighbours, and no tine rings in sympathy
  with another. A tine is light against the top (a few grams against 14 g of
  modal mass), but not negligible; coupling them is the next step.
- **The top's higher modes are uncoupled from the cavity**, and its modes
  with an even index (which push as much air one way as the other) are left
  out. The bottom and the sides do not move. Real boxes have many more
  modes.
- **Bending only.** A tine plucked off its centre line twists too; its
  torsional modes and the tine's own (weak) radiation are left out, as is
  the tine's slight nonlinearity at large amplitude.
- **The caps** feel gravity and the top but do not push back on it, and they
  are loose on a level box (a real mbira's are wired on and held upright).
- **The thumb** is a force released along a raised cosine, the same for every
  tine, and it always plucks from rest.

## Quality

The kalimba costs little at any setting, so the Quality setting (in the
controls, for phones and older computers) changes little. High plays as
described here; Medium and Low let a tine go once it has faded 80 and 60 dB
(100 dB at High), and past 32 and 16 tines ringing at once the oldest is
stilled, as a thumb would. Every tine and the box are played in full.

## Prior art and references

**The original instrument.** Lamellophones (the mbira of the Shona of
Zimbabwe, the likembe, the sansa and many more) have been played across
Africa for centuries, with metal tongues for at least the last few hundred
years. The ethnomusicologist Hugh Tracey adapted them into the *kalimba*, a
Western-tuned box instrument made by his African Musical Instruments in
Krugersdorp, South Africa, from the 1950s
([Wikipedia: Hugh Tracey](https://en.wikipedia.org/wiki/Hugh_Tracey)).
The marimbula, a large bass lamellophone box, is played in the Caribbean.

**The physics.**
- D. M. F. Chapman (2012). "The tones of the kalimba (African thumb piano)."
  *J. Acoust. Soc. Am.* 131(1), 945–950.
  [doi:10.1121/1.3651090](https://doi.org/10.1121/1.3651090). The tine as a
  clamped–supported–free beam; its overtone ratios set by where the bridge
  divides it, and the analytic case of equal segments.
- D. M. F. Chapman (2008). "Characterizing the sound of an African thumb piano
  (kalimba)." *J. Acoust. Soc. Am.* 123(5), 3806 (abstract).
  [doi:10.1121/1.2935513](https://doi.org/10.1121/1.2935513). First
  overtones at 5.3–5.9 times the fundamental.
- D. M. F. Chapman (2006). "Investigating the sound of an African thumb piano
  (kalimba)." *Canadian Acoustics* 34(3), 26–27.
  [jcaa.caa-aca.ca](https://jcaa.caa-aca.ca/index.php/jcaa/article/view/1805).
- D. O. Ludwigsen (2004, 2008, 2011). "Measurements of the acoustics of the
  kalimba," "Modes of the kalimba resonator box," "Video analysis and
  modeling of the kalimba tine." *J. Acoust. Soc. Am.* (abstracts).
  [doi:10.1121/1.4785344](https://doi.org/10.1121/1.4785344),
  [doi:10.1121/1.4782900](https://doi.org/10.1121/1.4782900),
  [doi:10.1121/1.3654995](https://doi.org/10.1121/1.3654995).
- O. Christensen and B. B. Vistisen (1980). "Simple model for low-frequency
  guitar function." *J. Acoust. Soc. Am.* 68(3), 758–766.
  [doi:10.1121/1.384814](https://doi.org/10.1121/1.384814). The top and the
  sound hole's air as two oscillators coupled by the cavity.
- P. J. Holmes (1982). "The dynamics of repeated impacts with a sinusoidally
  vibrating table." *J. Sound Vib.* 84(2), 173–189.
  [doi:10.1016/S0022-460X(82)80002-3](https://doi.org/10.1016/S0022-460X(82)80002-3).
  The bouncing ball behind the buzzers.

**Earlier models and syntheses.**
- R. C. de Souza (2011). "Um modelo de kalimba em Csound usado em *O Livro
  dos Sons*." *Música Hodie* 11(1).
  [doi:10.5216/mh.v11i1.21668](https://doi.org/10.5216/mh.v11i1.21668).
  Additive synthesis of a kalimba's inharmonic partials and noise, fitted to
  a recording.
- Chapman's papers above end with a synthetic tone of two exponentially
  damped sinusoids, fitted by ear.
- Bastl Instruments' *Kalimba* (2026), a hardware synthesizer whose tines are
  picked up by microphones and drive physical-modelling and FM engines
  ([Sonicstate](https://www.sonicstate.com/news/2026/05/09/kalimba-bastl-instruments-superbooth-2026/)).
