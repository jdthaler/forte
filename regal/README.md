# Regal

The small reed organ of the Renaissance, sounding from its physics. Under
each key a brass tongue lies curved over the open face of a shallot, a
little brass tube closed at the bottom. Wind from two hand-worked bellows
fills the reed's boot and pushes the tongue down onto the shallot; the
tongue springs back, the jet through the gap sucks it down again, and it
beats against the shallot hundreds of times a second, chopping the wind
into the buzz that a short resonator on top colours. Nothing is sampled.
You hear the tongue set the pitch, not the pipe, so the pitch rises when
the wind does; each kind of resonator's own formant; the brass slap or a
leathered shallot's softer close; the wind giving as a chord comes in,
rising as a bellows sinks and shaking when the other takes over; and the
tremulant pulsing every reed at once.

Monteverdi asked for one in *L'Orfeo* (1607) to accompany Charon, the
ferryman of the underworld, and Praetorius drew a whole family of them in
1619. Part of [Forte](../README.md). Play it at
<https://forte.jthaler.net/regal/> (or locally, see the
[main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (49 keys, C2–C6; A0–C8 with **Full range**) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how fast the key opens its pallet |
| `Space` | hold: keys stay down while it is held (an organ has no dampers) |
| MIDI | notes, velocity (pallet speed), hold pedal (CC64), soft pedal (CC67) = tremulant; **mod wheel = wind pressure**, key pressure leans on the bellows (up to a quarter more wind); pitch bend and MPE run each key's reeds faster or slower (±7 semitones per key) |

## The physics

### 1. The instrument

Four octaves, C2–C6, about the compass of the surviving regals, in equal
temperament at A = 440 Hz unless the Tuning group says otherwise; **Full
range** carries the same rules out to A0–C8. Three ranks of reeds can sound
under each key: **Regal 8′** at the written pitch, **Regal 4′** an octave
above (it breaks back an octave past C8, where its tongues would be under
4 mm long) and **Sordun 16′** an octave below. Each reed is simulated on
its own, in its own boot, shallot and resonator, all drawing on one wind
chest.

### 2. The tongue

The tongue is a brass cantilever (E = 100 GPa, ρ = 8500 kg/m³) of length L,
width b and thickness h, clamped at the wedge and free at the tip. It is
simulated as one mode with the tip's displacement q as its coordinate
(positive toward the shallot), in the static shape of a beam loaded at its
tip,

  ψ(u) = u²(3 − u)/2,  u = x/L,

so that its mass is m = (33/140) ρbhL + M (M a tip weight, below), its
stiffness k = 3EI/L³ with I = bh³/12, and the force the wind across it
puts on the tip coordinate is S Δp with S = 0.8 × 0.375 bL (0.375 is the
integral of ψ; the wind presses less near the tongue's edges, which
overhang the shallot's opening).
Rayleigh's quotient with this shape gives the natural frequency within
1.5 % of the exact clamped–free beam (with or without the tip weight) for
every reed on the instrument (`test/regal-tests.mjs` checks it). Its
losses, the brass's and the wedge's, are a damping c = mω/Q with
**Tongue Q** (120 by default) falling toward the treble as (f/262 Hz)^0.75,
so that the treble's small tongues are the lossier.

The voicer's scaling: the tongue is h = 0.45 mm × **Tongue thickness** ×
(f/262 Hz)^−0.45 thick and b = 7 mm × (f/262 Hz)^−0.3 wide (2.5–16 mm), and
is cut to the length that gives it its natural frequency. Below C2 a
tongue would grow too long for any regal, so its length is held to
L(C2)·(65 Hz/f)^0.3 and a weight on its tip brings it down instead, as
voicers load the bass tongues of the Sordun. Some reeds, at the default
voicing:

| Reed | Sounds | Tongue's own | L | b | h | curve h₀ | Resonator |
|---|---|---|---|---|---|---|---|
| C2, 8′ | 65.4 Hz | 51 Hz | 92 mm | 10.6 mm | 0.84 mm | 1.8 mm | 235 mm |
| C4, 8′ | 262 Hz | 217 Hz | 34 mm | 7.0 mm | 0.45 mm | 0.66 mm | 65 mm |
| C6, 8′ | 1047 Hz | 985 Hz | 12 mm | 4.6 mm | 0.24 mm | 0.23 mm | 12 mm |
| C2, 16′ | 32.7 Hz | 22 Hz | 118 mm | 13.1 mm | 1.15 mm | 2.3 mm | 220 mm, and 12 g on its tip |

### 3. The curve and the shallot

The voicer curves the tongue up off the shallot: at rest it stands
h₀u² above the shallot's face, h₀ = **Curve** (0.6 mm at C4) scaled with
the tongue's length. Pushed down by q at the tip it bends as ψ, so the gap
along it is

  g(u) = u²(h₀ − q(3 − u)/2).

The gap closes first at the root and rolls out toward the tip as q grows,
which is what a curved tongue does: the beat is a roll, not a slap, and
the curve sets how far the tongue swings and how hard it lands. Where the
tongue would pass into the shallot it is pushed back by a stiff penalty
spring over the length in contact, Ks ∫ d(u) ψ(u) du with d the overlap,
in closed form. **Shallot
facing** sets the spring and its damping, in the manner of Hunt and
Crossley: bare brass is 3000 times the tongue's own stiffness with a
damping ratio of 0.15 (a hard slap that stops the tongue and the flow
dead), leather 150 times with 0.9 (a padded close).

### 4. The jet

Air leaves the boot through the gap between the tongue and the shallot's
opening (0.9 L long and bs = 0.75 b wide): across the tip, bs(h₀ − q), and
along both sides, 2·0.9L ∫ g du where the gap is open. It contracts to a
jet (C_D = 0.61), and its flow follows Bernoulli quasi-statically,
U = C_D A √(2Δp/ρ), with the pressure across it the boot's against the
shallot's. Into the shallot's tube this is solved in closed form at each
step, U = K√(X − Z₀U), with X the boot pressure less the wave arriving
from the tube. The tongue sweeps air into the shallot as it moves too,
S·v of it, and that flow adds to the jet's. The boot is a small volume
(20 cm³ at C4, smaller in the treble) fed from the chest through its
pallet, stepped implicitly through the pallet's own Bernoulli flow; the
key opens the pallet over 3–30 ms with velocity.

### 5. The shallot and the resonator

The shallot (1.2 L long, as wide as the tongue) and the resonator above it
are a chain of short cylinders, each a pair of delay lines carrying the
pressure waves up and down, joined by Kelly–Lochbaum junctions where the
area steps. Each line is a whole number of samples long, rounded
cumulatively so that the tube keeps its length, and the last segment adds
the fraction through a first-order allpass. The walls take a loss of
3·10⁻⁵ √f / a per metre (a the radius); the open end reflects after an end
correction of 0.61 a, through a one-pole lowpass with its corner at
c/(2πa√3), as Levine and Schwinger's open pipe does. The sound radiated is
the open end's volume acceleration, dU/dt.

**Resonators** sets their shape, after Praetorius's plate of regals:

- **Short cylinders** (*Jungfernregal*): λ/24 long, 2.56 times the
  shallot's area. A nasal buzz.
- **Short funnels** (*Trichterregal*): a cone in six steps λ/16 long,
  widening from 1.3 to 4.5 shallot widths. Open and bright, loud in the
  bass.
- **Capped balls with holes** (*Apfelregal*): a short neck, a ball 4.2
  shallot widths across and a cap with a hole of 30 % of the ball's area.
  A muffled hum.
- **None**: the bare shallots, the tongues' raw rasp.

A regal's resonators are a small fraction of a pipe's length, so their
first resonance sits well above the note: the tongue sets the pitch and the
resonator only colours it, with its own formant. But a resonance close to
one of the note's harmonics pulls the tongue toward locking to it, and a
voicer cuts each resonator to avoid that: here its first impedance peak is
cut a quarter of a harmonic below one of the note's (4.55 f₀ at C2,
3.75 f₀ at C4 and C6, on the cylinders), or nearer or further where the
reed would otherwise fall between two locks, or jump to another when the
wind moves (below C2 the resonators stay C2's size, as the tongues do).
**Resonator length** scales every resonator from that cut: the formant
moves.

### 6. Tuning

A beating reed sounds above its tongue's own frequency, since the shallot
stiffens it for part of each cycle: 1.05–1.55 times, more in the bass and
with the bare shallots, less in the treble. So, as a voicer does, a tool
(`tools/regal-tuning.mjs`) blows every reed of every resonator shape alone
in its tube at the default wind, measures how far from its tongue's
frequency it sounds, and recuts the tongue until it sounds its note; the
engine reads the table it writes (`regal-tuning.h`). It also checks that
each reed keeps its beat as the wind moves from 0.8 to 1.45 times the
default; where none of the cuts that sound the note exactly does, it cuts
the tongue a little sharp or flat (a few notes, by up to 40 ¢) and the
retuning below puts it right.

| Shape | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|
| Cylinders | 1.29 | 1.29 | 1.21 | 1.15 | 1.06 |
| Funnels | 1.40 | 1.35 | 1.27 | 1.14 | 1.06 |
| Apples | 1.25 | 1.21 | 1.24 | 1.15 | 1.07 |
| None | 1.55 | 1.45 | 1.29 | 1.13 | 1.05 |

*How far above its tongue's own frequency each reed sounds.*

Since the tongue sets the pitch, the pitch moves with the wind, as a
regal's does (and why later reed stops got long resonators to hold them):
a reed cut for 600 Pa sounds C4 −61, −42, 0, +50, +98 and +172 ¢ at 450,
500, 600, 700, 800 and 1000 Pa. The voicing moves it
further: more curve or a thicker tongue flattens a reed by up to two
semitones, a leathered shallot by as much, and a longer resonator can pull
a reed onto another of its harmonics' locks.

A voicer would recut every tongue for its voicing and its wind, and here
the reeds are retuned too, in time rather than in brass: each reed (its
tongue, shallot and resonator together) is run a little faster or slower,
which moves its pitch and nothing else. How far comes from a second table
(`regal-voicing.h`, also written by `tools/regal-tuning.mjs`): for each
facing, each shape, each semitone and each knob (**Wind pressure**,
**Curve**, **Tongue thickness**, **Tongue Q**, **Resonator length**) at 7
to 13 points across its range, how many cents the reed cut for the defaults
sounds from its note. One knob moved alone, as in every preset, is then in
tune. Knobs moved together can leave a reed tens of cents off, since their
effects do not simply add; so the engine listens to each reed while its
key is held, and the next time the key is pressed with the same voicing
the reed is retuned by what it heard (the voicer's ear).

The weight on the bellows (**Wind pressure**, the mod wheel and key
pressure) is retuned as it moves, so it changes the loudness and the
brass, not the pitch. The wind's own movements are not: when a chord draws
the chest down, a bellows sinks or the tremulant shakes the wind, every
reed's pitch moves with it.

### 7. The wind

Two wedge bellows feed the chest, one sinking under its weight while the
calcant (the bellows boy) raises the other in 1.2 s. A wedge's board
presses with a force that falls as it sinks (the weight's arm shortens with
the board's angle, up to 0.25 rad): the wind rises about 3 % as a bellows
empties. The board is a mass on its 20 L of air, of mass P₀A/g for a board
of 0.15 m², with damping ratio 0.7: when a chord opens, the reeds draw more
wind, the pressure dips and the board catches it up with a small bounce.
When the active bellows is all but empty the other takes over, starting
from rest, and the wind shakes. The trunk is a resistance into a 2 L chest,
stepped implicitly; the boots feel the chest's pressure through a 20 Hz
smoothing (the chest's own acoustic ringing is left out). **Bellows: a steady blower** holds the chest at the
set pressure instead.

The **Tremulant** is a sprung flap in the trunk that opens a vent to the
air, for half of each beat with a sin² profile, **Tremulant rate** times a
second (5.5 by default): the chest's pressure pulses and every reed's
loudness and pitch with it.

### 8. Rates

Every reed steps at 48 kHz, whatever the host's rate, so that its pitch
does not depend on it; those sounding at 250 Hz and above step at 96 kHz,
since their tongues' slap carries energy to the top of the band. Each reed
is read at the host's rate between its last two steps (the same
interpolation bends it), and the fast ones are decimated by a 63-tap
half-band filter. A turbulent ±0.2 % jitter on the force on each tongue
keeps the reeds from being too clean. A reed whose pallet is shut and whose
tongue and tube have gone quiet stops being computed.

### 9. The voicer's regulation

A small reed radiates far less than a big one: unregulated, the cylinders
would fall by 27 dB from C2 to C6 and the funnels by 35 dB. A voicer opens
up the treble (a wider shallot, a bolder curve); here each reed's sound is
given a level instead, rising as a power of its pitch (0.6 to 1.06,
depending on the shape), so that the regal falls by about 2.5 dB an octave
from bass to treble and each shape sounds near the cylinders' level at C4
(the bare shallots a little quieter).

## What to listen for

`examples/regal/` (regenerate with `node tools/render-regal.mjs`):

1. **01-a-galliard-on-the-8-and-4-foot**: a dance of our own on Charon's
   registration, the 8′ and 4′: listen for the wind giving as the chords
   come in.
2. **02-cylinders-funnels-apples-and-bare-shallots**: one phrase through
   each resonator shape in turn: each its own formant.
3. **03-the-wind-rises**: a held chord while the weight on the bellows
   is raised from 450 to 950 Pa and let back: the reeds get louder and
   brassier.
4. **04-brass-then-leathered-shallots**: the same chords on bare brass,
   then on leathered shallots.
5. **05-the-tremulant**: a slow phrase with the tremulant drawn.
6. **06-the-full-regal-and-a-bellows-change**: the Sordun, 8′ and 4′ held
   long enough for the first bellows to run out and the other to take
   over.

On the page, **The tongue** replays one beat of the last key's reed
slowly: the tongue rolling onto the shallot, the pressures in the boot and
the shallot, the jet, and its tip, the pressure and the flow as traces.
**The resonator** draws the shallot and resonator to scale, and its
impedance against the note's harmonics. **The bellows** draws the two
wedges, and the last eight seconds of the chest's and the bellows'
pressure. The **Spectrum** marks the note's harmonics, weighted by the
resonator's impedance.

## Files

```
regal/index.html, style.css          page
regal/src/regal-params.js            parameters and presets
regal/src/regal-instrument.js        the descriptor: everything but the page
regal/src/regal-main.js              page wiring and views
regal/src/regal-wasm.js, regal/wasm/regal.wasm   the engine and model, built from the C++
native/instruments/regal/            the physics in C++: model, engine, measured tuning
test/regal-tests.mjs                 node test/regal-tests.mjs
tools/regal-tuning.mjs               measures every reed: regal-tuning.h, and with --voicing regal-voicing.h (--check: every key's pitch)
tools/render-regal.mjs               node tools/render-regal.mjs → examples/regal/
```

## Simplifications

- **The tongue** is one mode: its higher bending modes, and its twisting,
  are left out. It closes onto the shallot along a fixed shape, so the
  roll is right in kind, not in detail.
- **The flow** is quasi-static: Bernoulli at every instant, with a fixed
  contraction, no inertia in the jet and no vortices in the shallot.
- **The retuning.** A real voicer recuts the tongues; here each reed is run
  faster or slower in time instead, which scales its resonator with it
  (by at most a few semitones). The table is measured one knob at a time,
  and knobs moved together are put right only from the second press of
  each key (the voicer's ear), which forgets when the voicing changes.
- **The resonators** are chains of cylinders: the funnel is six steps,
  the ball a cylinder of the same volume and length, the holes one opening
  at the cap. They radiate as monopoles at their open ends, with no
  coupling between them.
- **The regulation** is a level per reed, not a change to its shallot or
  curve, so it leaves the reed's tone as it was.
- **The 4′ breaks back** an octave past C8; the shallots and resonators
  follow the same scaling rules all the way from A0 to C8, which no
  regal had.
- **The wind.** The bellows' boards are masses on springs of air with a
  linear damping; the trunk is a resistance without inertia, and the
  chest's air one volume. The calcant raises a bellows at a steady pace and
  never falls behind. The bellows', pallets' and keys' own noises are left
  out, and the room is the page's synthetic room.

## Quality

Medium and Low let fewer keys sound at once: 10 at Medium and 6 at Low
against 16 (each with up to three ranks), the quietest released key fading
first. Every reed is the same at every level, and the wind too.

## Prior art and references

**The instrument.**
- M. Praetorius (1619). *Syntagma musicum II: De organographia*.
  Wolfenbüttel. [archive.org](https://archive.org/details/SyntagmaMusicumBd.21619).
  The regals and their resonators, drawn in its *Theatrum instrumentorum*.
- C. Monteverdi (1609). *L'Orfeo, favola in musica*, SV 318. Venice.
  [IMSLP](https://imslp.org/wiki/L'Orfeo,_SV_318_(Monteverdi,_Claudio)).
  Act III: the regal for Charon.

**The physics.**
- A. Miklós, J. Angster, S. Pitsch & T. D. Rossing (2003). "Reed vibration
  in lingual organ pipes without the resonators." *J. Acoust. Soc. Am.*
  113(2), 1081–1091. [doi:10.1121/1.1534101](https://doi.org/10.1121/1.1534101).
- A. Miklós, J. Angster, S. Pitsch & T. D. Rossing (2006). "Interaction of
  reed and resonator by sound generation in a reed organ pipe." *J. Acoust.
  Soc. Am.* 119(5), 3121–3129.
  [doi:10.1121/1.2188372](https://doi.org/10.1121/1.2188372).
- G. R. Plitnik (2000). "Vibration characteristics of pipe organ reed
  tongues and the effect of the shallot, resonator, and reed curvature."
  *J. Acoust. Soc. Am.* 107(6), 3460–3473.
  [doi:10.1121/1.429416](https://doi.org/10.1121/1.429416).
- N. H. Fletcher (1993). "Autonomous vibration of simple pressure-controlled
  valves in gas flows." *J. Acoust. Soc. Am.* 93(4), 2172–2180.
  [doi:10.1121/1.406857](https://doi.org/10.1121/1.406857).
- H. Levine & J. Schwinger (1948). "On the radiation of sound from an
  unflanged circular pipe." *Phys. Rev.* 73(4), 383–406.
  [doi:10.1103/PhysRev.73.383](https://doi.org/10.1103/PhysRev.73.383).
- J. L. Kelly & C. C. Lochbaum (1962). "Speech synthesis." *Proc. 4th Int.
  Congr. Acoustics*, Copenhagen, paper G42.
- K. H. Hunt & F. R. E. Crossley (1975). "Coefficient of restitution
  interpreted as damping in vibroimpact." *J. Appl. Mech.* 42(2), 440–445.
  [doi:10.1115/1.3423596](https://doi.org/10.1115/1.3423596).

**Other synthesisers.** Modartt's [Organteq](https://www.modartt.com/organteq)
models reed and flue organ pipes physically, with its own (unpublished)
model.
