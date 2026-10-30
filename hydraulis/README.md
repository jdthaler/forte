# Hydraulis

The water organ of Ctesibius of Alexandria (3rd century BC), the first
keyboard instrument, sounding from its physics. Pumpers work two pistons
that push air into a bronze bowl, the *pnigeus*, standing upside down in a
cistern of water. The air drives the water down inside the bowl and up
around it, and the weight of that difference in height is the wind: it
holds the pressure steady while the pistons come and go, and once the water
inside falls to the bowl's rim the extra air bubbles out under it. Each key
pushes a perforated slide under its pipes, and a spring pulls it back. The
pipes are the Pipe Organ's flue pipes, jets fluttering across their mouths,
on an ancient scaling. Nothing is sampled. You hear the wind breathe with
the pump strokes; the water bounce on the air when a chord opens; the wind
sag when the pumpers fall behind and the pipes droop with it; the bowl
gurgle when they overfill it; and the slides' speed in every attack.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/hydraulis/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (25 keys, G3–G5; A0–C8 with **Full range**) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how fast the key pushes its slide |
| `Space` | hold: keys stay down while it is held (the slides stay pushed in) |
| MIDI | notes, velocity (slide speed), hold pedal (CC64); **mod wheel and key pressure = harder pumping**; MPE pitch per key |

## The physics

### 1. The instrument

Two octaves, G3–G5, in equal temperament at A = 440 Hz unless the Tuning
group says otherwise; **Full range** carries the same rules out to A0–C8.
Under each key stand four pipes, one per rank, as on the organ found at
Aquincum (Budapest), dated AD 228: four ranks of thirteen pipes, one rank
open and three stopped in Walcker-Mayer's reconstruction. Which pitches the
stopped ranks sounded is not known; here one sounds at the note, one an
octave below (breaking back to the unison under A1, so that no pipe sounds
below 27.5 Hz) and one an octave above. Each rank has a stopcock on its
channel (Vitruvius: four, six or eight ranks, each with its cock), and
**Open rank**, **Stopped rank**, **octave below** and **octave above**
turn them, over 80 ms.

### 2. The wind: a bowl in water

The pnigeus is a bowl of area A_in (Ø 60 cm, A_in = 0.283 m²) standing on
feet in a cistern whose water around it has area A_out = 0.50 m². Air that
pushes a volume ΔV of water out from under the bowl lowers the water inside
by ΔV/A_in and raises it outside by ΔV/A_out. The wind is the head between
them,

  p = ρ_w g ΔV (1/A_in + 1/A_out) = ΔV/C_h,

until the water inside reaches the rim, a depth x_rim below where it stands
with no wind; there

  p_rim = ρ_w g x_rim (1 + A_in/A_out),

and air escapes. **Water over the rim** sets p_rim (700 Pa by default, 71 mm
of water: 46 mm of fall inside and 26 mm of rise outside); **Cistern size**
scales both areas, so a wider cistern takes more air for the same rise and
each stroke and each chord moves the wind less. The test suite checks both
formulas and that a full bowl, ΔV = V_rim, holds exactly p_rim.

The water flowing under the rim has inertance M_w = ρ_w(L_in/A_in +
L_gap/A_gap + L_out/A_out), its columns inside and outside and the 3 cm gap
under the rim all round (3700 kg/m⁴). It sits between two springs: its own
head (C_h = 1.8 × 10⁻⁵ m³/Pa) and the air shut in the bowl and the chest,
150 litres (C_a = V_air/γP₀ = 1.1 × 10⁻⁶ m³/Pa, nearly twenty times
stiffer). So it bounces at

  f_b = (1/2π) √((1/C_h + 1/C_a)/M_w) ≈ 2.6 Hz,

with a damping ratio of 0.15 from the water's losses. The engine integrates
both together, per sample:

  M_w dQ_w/dt = p − ΔV/C_h − R_w Q_w,  dΔV/dt = Q_w,
  C_a dp/dt = Q_pumps − Q_pipes − Q_w − Q_escape.

A key opening (its pipes' draw rising in a few milliseconds) dips the wind
and sets the water bouncing; a stroke starting does the opposite. The test
suite displaces the bowl's air by 50 Pa and measures the bounce within 2 %
of f_b, and its damping.

### 3. The rim and the bubbles

Once ΔV reaches V_rim = A_in x_rim (12.9 litres by default) the water stops
there and the air escapes under the rim through a resistance of 8000
Pa·s/m³, so the wind cannot rise much past p_rim however hard the pumpers
work. The escaping air leaves in bubbles of radius 8–22 mm, each released
once enough air has gathered, and each rings as it breaks away at
Minnaert's frequency,

  f = (1/2πR) √(3γP/ρ_w),

150–400 Hz, with a Q of 18, mixed into the middle of the stereo by
**Gurgle**.

### 4. The pumps

Bronze cylinders Ø 12.5 cm with a 16 cm stroke: 2 litres a stroke. One
(Hero) or two worked in turn (Vitruvius), as **Pumps** says. A cycle takes
4 s at no effort and 0.4 s at full (**Pumping effort**, 0.5: 47 strokes a
minute from each pump), 45 % of it pushing down and the rest coming back up
and drawing air in. The pumpers start a stroke when their pace allows, the
pump is back at the top, and the bowl has room for half a stroke: they rest
while it is full.

A pumper leans on the lever with a push worth p_push = p_rim (1.2 + 0.6e +
0.7e²) at the piston (e the effort), and the air goes through the valve at

  Q = (p_push − p)/R_valve,  R_valve = 2 × 10⁵ Pa·s/m³,

no faster than the pumper's pace moves the piston (1.5 times the stroke
over its share of the cycle), building over 0.2 s and easing over the last
30 % of the travel. So a pump gives more as the wind sags, and while it
delivers its valve damps the water's bounce. The mod wheel and key pressure
raise the effort toward full, over 0.3 s.

One rank and a four-note chord draw about 1.1 L/s, and two pumps at the
default effort keep the wind within about 10 % of full, breathing with the
strokes. All four ranks draw four times that: the pumpers must work hard
(the **Aquincum** preset sets 0.9), and tired ones let the wind sag until
the pipes droop, thin and, starved, jump to an upper mode or stop.

### 5. The slides

Each key pushes a slide (Vitruvius's *pinna*, Hero's πῶμα) under its pipes:
a hole in it moves over the hole under each pipe's foot. Each hole is cut
eight times the area of its pipe's flue, so wide open the foot has 96 % of
the wind (the hole, with a discharge coefficient of 0.61, and the flue in
series: p_foot = p a²/(a² + a_flue²)). At rest the holes are a fifth of
their width past meeting. The opening is the overlap of two circles, a
lens,

  A(d) = 2r² arccos(d/2r) − (d/2)√(4r² − d²),

so the holes open slowly at first and fastest half way. **Slide: push
time** is how long the key takes to push it across at velocity 0.7 (10 ms),
twice as long per 0.3 less velocity: a quick push makes the jets speak at
once with a chiff, a slow one lets them swell in.

The return spring (horn in Hero, iron in Vitruvius) is preloaded by one
travel, x'' = −ω²(x + 1), so from x = 1 the slide moves as x = 2 cos ωt − 1
and reaches its stop at ωt = π/3: **Return spring** is that time (15 ms).
It bounces off the stop at 30 % of its speed, inaudibly, as the holes have
already shut.

### 6. The pipes

Each pipe is the Pipe Organ's flue pipe (`pipes/README.md` sections 2–7):
a resonator of up to ten modes driven by a jet whose deflection at the flue
by the air moving through the mouth grows on its way across and steers the
jet into or out of the pipe at the labium, with the same jet, losses,
radiation and turbulence. The hydraulis gives it its own scaling and
voicing:

- **The bore.** Ancient pipes were cut from tubing of nearly one bore (the
  Dion organ's are all about 18 mm across), where a modern organ's normal
  scale (Töpfer's) narrows as f^−0.75. Here the compass narrows slowly,
  D = 34 mm × (f/f_G3)^−0.21, by a quarter over its two octaves (**Bore
  scaling**). Below G3 open pipes widen as f^−1.5 and stopped ones as f^−1,
  until they are as wide as Töpfer's; above G5 they narrow as Töpfer's
  does, so that a treble pipe stays longer than it is wide.
- **The voicing.** Pipes this narrow keep their upper modes' Q, and at
  Dion's own width this model's pipes overblow to their fourth or fifth
  mode at any cut-up. At 34 mm and above, with half the Pipe Organ's jet
  gain and the mouths cut up so that U_j/fW = 11.5 for the open pipes and
  13 for the stopped ones at 700 Pa, every pipe from A0 to C8 speaks its
  note on a steady wind of 350 to 1500 Pa, but for the open G3, the
  narrowest for its length, which jumps to its fourth mode near 500 Pa.
  Starved further, as the wind sags, pipes jump to an upper mode or stop.
- **The tuning.** Each pipe is cut (its resonance placed) so that it
  sounds its note at the full wind: `tools/hydraulis-tuning.mjs` blows
  every pipe alone on a still wind, measures it, and writes the correction
  (within 0.5 ¢ on the compass and 2 ¢ past it). The keyboard's tuning cuts
  the pipes for its notes.

The pipes stand in a row, the longest at the left, panned from −0.6 to
0.6 across the compass.

## What to listen for

`examples/hydraulis/` (regenerate with `node tools/render-hydraulis.mjs`):

1. **01-a-tune-in-the-mixolydian-mode-over-a-drone**: a tune of our own on
   the white keys from G over a held G and D, on the open and stopped
   ranks: listen under it for the wind swelling a little with each stroke.
2. **02-open-stopped-octave-below-and-octave-above-in-turn**: one phrase on
   each rank alone. The stopped pipes are hollow (no even harmonics).
3. **03-tired-pumpers-the-wind-sags-then-they-pump-hard**: a chord on all
   four ranks while the pumpers tire: the wind sags, the pipes droop and
   thin; then they pump hard and the bowl fills.
4. **04-eager-pumpers-the-bowl-overflows-and-gurgles**: two notes held
   while the pumpers work flat out: the air bubbling out under the rim.
5. **05-quick-slides-then-slow-ones**: the slides pushed across in 3 ms (a
   chiff), then in 40 ms (the notes swell in).
6. **06-one-pump-then-two-in-turn**: a held chord on one pump worked
   slowly, each stroke a swell, then on two in turn.

On the page, **The cistern and the pumps** draws the bowl and the water as
they move (heights to their own scale), the pistons and the bubbles; **The
wind** the last eight seconds of pressure, pumping and draw; **The pipes on
their slides** the four ranks to scale, lighting as each slide opens; and
the **Spectrum** marks the last key's pipe's modes.

## Files

```
hydraulis/index.html, style.css                 page
hydraulis/src/hydraulis-params.js               parameters and presets
hydraulis/src/hydraulis-instrument.js           the descriptor: everything but the page
hydraulis/src/hydraulis-main.js                 page wiring and views
hydraulis/src/hydraulis-wasm.js, hydraulis/wasm/hydraulis.wasm   the engine and model, built from the C++
native/instruments/hydraulis/                   the physics in C++: model, engine, measured tuning
native/instruments/pipes/pipes-flue.h, .cpp     the flue pipe, shared with the Pipe Organ
test/hydraulis-tests.mjs                        node test/hydraulis-tests.mjs
tools/hydraulis-tuning.mjs                      measures every pipe and writes hydraulis-tuning.h
tools/render-hydraulis.mjs                      node tools/render-hydraulis.mjs → examples/hydraulis/
```

## Simplifications

- **The wind.** The water moves as one mass between two springs: no waves
  on the cistern's surface, and the bowl's and the chest's air are one
  volume. The losses in the water are a linear resistance set by a damping
  ratio, not computed from the flow under the rim. Bubbles break away at a
  rate set by the escaping air, with sizes drawn at random, and do not
  disturb the wind.
- **The pumps.** A pumper is a steady push and a pace; real pumpers feel
  the lever and the wind. The valves are a resistance with no inertia and
  no leak.
- **The slides** are a normalised travel: every hole, whatever its size,
  meets its pipe's at the same point. Hero's and Vitruvius's slides moved
  across rows of holes of one size.
- **The pipes.** The Pipe Organ's model (and its simplifications), with
  wider bores than the surviving pipes: at Dion's width they overblow in
  this model. Which pitches the Aquincum organ's stopped ranks sounded, and
  what the hydraulis's scale and tuning were, are not known; here they are
  modern guesses (equal temperament unless the Tuning group says
  otherwise).
- **The sound.** Each pipe radiates from its mouth as a monopole; the
  pumps' and slides' own noises are left out, and the arena is the page's
  synthetic room.

## Quality

Medium and Low give each pipe fewer modes (at most 8 up to 10 kHz at
Medium, 5 up to 7 kHz at Low, against 10 up to 15 kHz), and let fewer keys
sound at once: 12 at Medium and 8 at Low against 20, the quietest released
key fading first. Pitch and loudness stay (within a cent and 1.5 dB); the
open pipes lose a little of their edge at Low. The wind, the pumps and the
bubbles are the same at every level.

## Prior art and references

**The original instrument.**
- Hero of Alexandria (1st century AD). *Pneumatica* I.42, the water organ
  with one pump, the pnigeus and spring-returned slides. In B. Woodcroft
  (trans., 1851), *The Pneumatics of Hero of Alexandria*. Taylor Walton and
  Maberly, London. [Project Gutenberg](https://www.gutenberg.org/ebooks/77400).
- Vitruvius (1914). *The Ten Books on Architecture*, trans. M. H. Morgan.
  Harvard University Press, Cambridge, Mass.
  [Project Gutenberg](https://www.gutenberg.org/ebooks/20239). Book IX
  ch. 8 credits Ctesibius with the water organ; Book X ch. 8 describes it:
  two pumps, the bowl in its water chest, stopcocks for four, six or eight
  ranks, and slides with iron springs.
- W. Walcker-Mayer (1972). *The Roman Organ of Aquincum*, trans. J. Godwin.
  Musikwissenschaftliche Verlags-Gesellschaft, Ludwigsburg. The organ of
  AD 228 found at Aquincum (Budapest) in 1931, and its reconstruction.
- D. Pandermalis (1995). "Η Ύδραυλις του Δίου" [The hydraulis of Dion].
  *Το Αρχαιολογικό Έργο στη Μακεδονία και Θράκη* 6, 217–222. The organ of
  the 1st century BC found at Dion in 1992.
- J. Perrot (1971). *The Organ from its Invention in the Hellenistic Period
  to the End of the Thirteenth Century*, trans. N. Deane. Oxford University
  Press, London.
- P. Williams (1993). *The Organ in Western Culture, 750–1250*. Cambridge
  University Press. [archive.org](https://archive.org/details/organinwesterncu0000will).
- J. G. Töpfer (1855). *Lehrbuch der Orgelbaukunst*, vol. 1. Voigt,
  Weimar. [archive.org](https://archive.org/details/bub_gb_8FlDAAAAcAAJ).
  The normal scale.

**The physics.**
- M. Minnaert (1933). "On musical air-bubbles and the sounds of running
  water." *Phil. Mag.* 16(104), 235–248.
  [doi:10.1080/14786443309462277](https://doi.org/10.1080/14786443309462277).
- N. H. Fletcher & T. D. Rossing (1998). *The Physics of Musical
  Instruments*, 2nd edn. Springer, New York.
  [doi:10.1007/978-0-387-21603-4](https://doi.org/10.1007/978-0-387-21603-4).
  Flue pipes, ch. 16–17.
- The flue pipe's own references are in the Pipe Organ's README
  (`pipes/README.md`).
