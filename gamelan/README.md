# Gamelan

The bronze orchestras of Java and Bali: metallophones of thick bronze bars,
some hung over bamboo tubes, and gongs with a boss at their centre, from the
small kettles of a bonang to the great hanging gong ageng. Nothing here is
sampled. Every bar is a thick free–free beam (a Timoshenko beam) that bends
and twists, cut to the length that puts its note where the gamelan's tuning
wants it; a gangsa's bar drives the air in its tube and the tube drives the
bar; a gong rings in the modes measured on real gongs, and its curved face
makes its note's own second harmonic, which beats against the gong's second
round mode: the slow throb of a gong ageng. The keys play pélog on the white
keys and sléndro on the black, and in Bali every instrument has a partner
tuned a few hertz away, so each note beats as the pair drifts in and out of
step: the shimmer called *ombak*. A player's other hand stops each bar as the
next is struck.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/gamelan/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (all 88 keys, A0–C8: pélog on the white keys, sléndro on the black) |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | sustain: lifts the damping hand |
| MIDI | notes, velocity, sustain pedal (CC64); **mod wheel = the pairs' beat** (ombak) |
| MPE | a note's own slide (CC74) is its own pair's beat; bars and gongs do not bend |

## The physics

### 1. The instruments

The **Instrument** choice picks what the keys play:

| | what it is | here |
|---|---|---|
| Gangsa | Bali's metallophones: bars hung on cords over bamboo tubes, played with hard wooden mallets | 7 mm bars, tubes, paired |
| Saron | Java's: thicker bars resting on a wooden trough, no tubes | 12 mm bars, paired only if asked |
| Bonang | a row of kettle gongs, each lying on crossed cords, struck on the boss with cord-wound sticks | the measured modes of a small gong |
| Gong ageng and kempul | the hanging gongs: the great gong that closes each cycle, and the smaller kempul | the measured modes of a gong ageng |
| The whole gamelan | each octave its own instrument, as in a Javanese gamelan: gong ageng (A0–B1), kempul (C2–B2), slenthem (bars over tubes, C3–B3), demung (C4–B4), saron (C5–B5), peking (C6 up) | each with its own player |

Every instrument plays all 88 keys: the bars are cut on down and up the
keyboard with the same bronze, and the gongs keep their shape, scaled.

### 2. The laras: pélog and sléndro

A gamelan is two sets of instruments in two scales. **Pélog** has seven
notes to the octave in small and large steps; **sléndro** has five, nearly
equal. No gamelan's tuning is quite another's (each set has its own
*embat*), so the model takes the two usual idealisations:

- pélog as a subset of nine equal steps to the octave (133.3 ¢), which
  Surjodiningrat and colleagues' measurements of Central Javanese gamelans
  lean towards (Braun): steps of 1 1 2 1 1 1 2 ninths, the large ones above
  pélog 3 and pélog 7;
- sléndro as five equal steps of 240 ¢.

The seven pélog notes are the white keys, 1 on C; the five sléndro notes are
the black keys, 2 on C♯ up to 1 on A♯. The two share a tone, sléndro 6 on G♯
and pélog 6 on A, both 800 ¢ above C, so every black key lies within 60 ¢ of
its equal-tempered pitch and the white keys within 167 ¢.

| key | C | C♯ | D | D♯ | E | F | F♯ | G | G♯ | A | A♯ | B |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| degree | pélog 1 | sléndro 2 | pélog 2 | sléndro 3 | pélog 3 | pélog 4 | sléndro 5 | pélog 5 | sléndro 6 | pélog 6 | sléndro 1 | pélog 7 |
| ¢ above C | 0 | 80 | 133 | 320 | 267 | 533 | 560 | 667 | 800 | 800 | 1040 | 933 |

**Tuning (laras)** can give the keys back their twelve notes. Either way the
keyboard's own tuning (Tuning group: the pitch standard, the temperament)
moves every key on top.

### 3. A bar: a thick beam, bending and twisting

A gamelan bar is short and thick (a gangsa's C4, here, 31 × 8.4 cm and
7 mm thick; a saron's 40.5 × 9.5 cm and 12 mm), so it is a **Timoshenko
beam**: as it bends, its slices also shear and turn, and that lowers its
overtones the more, the thicker and shorter it is. For a free–free beam
Huang (1961) gave the frequency equation in the dimensionless
b² = ρAω²L⁴/EI, with r² = I/AL² (rotary inertia) and s² = EI/κAGL² (shear):

  2 − 2 cosh(bα) cos(bβ) + b [b²r²(r² − s²)² + 3r² − s²] sinh(bα) sin(bβ) / √(1 − b²r²s²) = 0

with α, β = √(∓(r² + s²) + √((r² − s²)² + 4/b²)) / √2, and κ =
10(1 + ν)/(12 + 11ν) Cowper's shear coefficient for a rectangle. With r = s =
0 it is Euler–Bernoulli's cos βL cosh βL = 1, whose partials are 1 : 2.756 :
5.404 : 8.933. The bronze is a high-tin bronze, E = 105 GPa, ρ = 8600 kg/m³,
ν = 0.34. Each bar is cut so that its first root is its note, with its own
h/L (the length and the root are iterated together); its width grows with
its length as the bars of a Balinese gamelan measured by Jones, Gee and
Grimshaw (2010) (6.4 cm at 17 cm long, 9.3 cm at 40 cm).

On a gangsa the second partial sits at 2.75 × the note in the middle of the
keyboard and 2.68 at C7; a saron's thicker bars reach 2.69 by C6. At h/L =
0.1 it is 2.60, where Jones and colleagues measured 2.61 on an *ugal* bar.
**Bar thickness** moves every bar's h/L at once.

Struck to one side of its centre line, the bar also **twists**. Its
Saint-Venant torsion modes, fₙ = (n/2L) √(GK/ρIₚ), with Roark's torsion
constant K = wh³[1/3 − 0.21 (h/w)(1 − h⁴/12w⁴)] and Iₚ = wh(w² + h²)/12, have
nothing to do with the note: on a C4 gangsa bar the first lies at 2.1 × the
note, between the bending modes. They radiate poorly (the bar's two edges
move in opposite directions).

The mallet lands **along** the bar (from the centre to the end) and **across**
it: each bending mode is excited by its shape there (Euler–Bernoulli's,
±1 at the ends), each torsion mode by cos(nπu) times the offset. At the
centre the second bending mode, antisymmetric, has a node, and on the centre
line no torsion mode is touched: the note is at its purest.

### 4. The tube under a gangsa's bar

A bamboo tube, closed at the bottom, a quarter wave long at the bar's note
(× **Tube tuning**), its radius as wide as the bar allows but narrow beside a
wavelength (ka ≤ 0.3, as the high tubes are). It loses its energy through its
open end, σ = f (ka)², and to the viscous and thermal boundary layer on its
wall, ω δᵥ (1 + (γ − 1)/√Pr) / 2a with δᵥ = √(2ν/ω): a quality factor of 70
at C4.

The bar's first mode q and the tube's air X are two oscillators sharing the
air between them: forces −k Ẋ on the bar and +k q̇ on the air, which exchange
energy without making or losing any, with k = 0.003 × **Tube resonators** × ω.
A bar alone is a poor radiator at its note (the air slips round its edges:
here its note radiates half as well as its overtones), the tube's open end a
good one. So with the tube the note is louder at first, then shorter, as the
air takes the bar's energy and radiates it away. A tube cut off the note
takes less, and the two ring apart.

### 5. The gongs: their measured modes

A bossed gong is too intricate a shell (a boss, a curved face, a shoulder, a
deep rim) for a formula, so the model rings the modes measured on real ones:

- the **bonang**'s are those of the 20.7 cm gamelan gong Perrin and colleagues
  (2014) mapped by electronic speckle interferometry, as ratios to its (0,1)
  at 458 Hz, the round mode in which the boss moves, by far the most
  important: (1,1) at 1.52 and 1.60, (0,2) at 2.80, (2,1) at 4.38 and 4.57,
  up to (5,1) at 8.1–8.2, and two pairs of rim modes, (2,0) and (3,0), with
  little motion on the face. Every mode with nodal diameters comes as a split
  pair, as on any real gong;
- the **gong ageng**'s are those of the Balinese gong ageng wadon Krueger, Gee
  and Grimshaw (2010) measured by scanning laser vibrometry: its first round
  mode at 61.75 Hz, then 92.0, 101.75, 121.25 (the second round mode), 150.25,
  153.25, 160.0, 162.5 and 236.0 Hz. The kempul are the same shape, smaller.

Struck on the boss, only the round modes move much; out on the face (**Strike
point**) the modes with m nodal diameters come in as J_m(kr) ∝ r^m does near
the centre, and the gong clangs.

### 6. A curved face: the gong's own ombak

A flat plate pushes back the same whichever way it bends; a curved face does
not, so its potential has a cubic term. Between the note (u₁) and the second
round mode (u₂), with u = ω₁ y,

  V = G u₁² u₂ + Γ u₁⁴,   F₁ = −ω₁(2G u₁u₂ + Γ u₁³),   F₂ = −ω₁ G u₁²

with G = 0.07 × **Face curvature** and Γ = 0.01 + G² (enough to keep V
bounded). The note drives the second mode at twice its own frequency: its
**second harmonic**, as the square of the note's amplitude. On a bonang the
second round mode is far from 2f₁ (2.80 f₁) and the harmonic is faint. On the
gong ageng the smith left it just below: 121.25 Hz against 2 × 61.75 =
123.5 Hz. The harmonic and the mode it drives then **beat** at 2f₁ − f₂, 2.25 Hz,
the dominant ombak Krueger and colleagues found (they heard about 2.5 Hz
beats near 120 and 180 Hz, and faster ones, 3–13 Hz, between the close
asymmetric modes near 150 and 160 Hz, which the model also rings). **The
gong's own ombak** sets 2f₁ − f₂ on a 61.75 Hz gong; a gong of the same shape
an octave higher beats twice as fast. Flatten the face and the harmonic and
its beat are gone.

### 7. Paired tuning: ombak

In Balinese gamelan every metallophone and kettle-gong row has a partner: the
*pengumbang* tuned a little low and the *pengisep* a little high. Played
together, each note is two notes a few hertz apart, and the sound beats at
their difference. **Paired tuning (ombak)** is that difference, in hertz: the
low partner sounds at f − b/2 and the high at f + b/2, each with its own bar
and tube, struck together and panned a little apart (the low one left). The
beat is the same in every register (as the ensembles tune it), so the
partners are far apart in cents at the bottom and close at the top: at 6 Hz,
94 ¢ on a 110 Hz note, 6 ¢ on 1760 Hz. Each partner's overtones follow its
note, so they beat faster, 2.7 times as fast for the second.

The gongs hang alone (no pairs). Off, the keys play one instrument, as in
Java. The mod wheel moves the beat while notes ring (a single instrument
splits into two in phase), and an MPE note's slide sets its own pair's.

### 8. Mallets and damping

The mallet is a half-sine force pulse whose spectrum |cos(πfτ)/(1 − (2fτ)²)|
sets which modes it reaches, its contact τ the family's at C4 (0.3 ms for a
gangsa's and a saron's wooden or horn mallets, 1 ms for a bonang's cord-wound
sticks, 2.5 ms for a gong's padded beater) × **Mallet softness**, shorter as
v^(−1/5) on harder strokes (Hertz), ∝ f^(−1/2) on a stiffer bar or kettle,
and ∝ 1/f on the hanging gongs (each size of gong with a beater to match).

Each mode decays in its own time: the note's T60 is **Ring time at C4** (× 0.8
for a saron, 0.5 for a bonang, 1.5 for a gong) scaled as 1/√f, and the
others' σ ∝ f^**rolloff** faster. **Damping hand**: as a metallophone player
does, each stroke stops that player's last bar (struck more than 40 ms before:
a chord rings on), with a hand whose T60 is **Hand damping**; or letting go
of a key stops it; or nothing does. In the whole gamelan each octave is its
own player. Space or the pedal lifts the hand; when it comes down, it stops
every bar but each player's last.

### 9. The engine

Each struck key is a voice: one or two instruments (the pair), each with up
to 16 modes as exact two-pole resonators, the gangsa's tube one more, and the
gongs' note and second round mode joined by the face's force each sample.
The output is each mode's velocity times how well it radiates. A voice ends
once it has rung out; past 48 the quietest goes.

## What to listen for

1. **A gangsa pair in pélog.** A melody on the white keys, every note
   shimmering at 5 Hz.
2. **One bar, then the pair.** The same A4 with paired tuning off, then at
   6 Hz: the note starts to pulse.
3. **The same beat all the way up.** A2, A4, A6 at 6 Hz: the pulse keeps its
   pace while the partners' cents shrink from 94 to 6.
4. **The damping hand.** A phrase with each bar stopped as the next is
   struck, then left to ring.
5. **A saron, struck at the centre, then near the end and off its axis.**
   The second partial and the twisting modes come in.
6. **A gong ageng throbs, then a flat one doesn't.** The curved face's
   harmonic beating with the second round mode at 2.25 Hz × the note's
   ratio.
7. **The whole gamelan.** The melody in octaves on demung and saron, kempul
   and the gong ageng below.
8. **A paired bonang.** Kettle gongs on the boss, then out on the face.

## Files

```
gamelan/index.html, style.css             page
gamelan/src/gamelan-params.js             parameters and presets
gamelan/src/gamelan-instrument.js         the descriptor: everything but the page
gamelan/src/gamelan-main.js               page wiring and views
gamelan/src/gamelan-tour.js               the guided tour of its physics
gamelan/src/gamelan-wasm.js, gamelan/wasm/gamelan.wasm   the engine and model, built from the C++
native/instruments/gamelan/               the physics in C++: model and engine (plugins and WebAssembly)
test/gamelan-tests.mjs                    node test/gamelan-tests.mjs
tools/render-gamelan.mjs                  node tools/render-gamelan.mjs → examples/gamelan/
```

## Simplifications

- **Two idealised scales.** Every gamelan has its own tuning, and its
  octaves are often stretched; here pélog is nine-equal and sléndro
  five-equal, the same in every octave, and the two sets always share
  pélog 6.
- **Uniform rectangular bars.** Real bars are often arched, bevelled or
  thicker in the middle, and their smiths tune them by grinding; their
  overtones vary from bar to bar (Jones and colleagues found great
  variability). The bending shapes used for the strike are Euler–Bernoulli's,
  not Timoshenko's, and the cords and the trough take nothing from the bars.
- **The tube's coupling is one constant**, the same fraction of ω for every
  bar, rather than worked out from the gap and the mouth.
- **The gongs are two measured gongs, scaled.** A bonang's kettles, a
  kenong's, a kempul's and a gong ageng's each differ; here every kettle is
  Perrin's small gong and every hanging gong Krueger's gong ageng, their
  ratios kept across the keyboard. Which mode of the gong ageng has which
  number of nodal diameters is assumed (its table gives the round ones).
- **One quadratic term.** Only the note and the second round mode are
  coupled by the face; its other cubic and quartic terms, and the pitch
  glides of thin gongs, are left out.
- **A pair is two copies of one bar**, retuned. Real partners differ in their
  overtones as well, so those beat at rates of their own.
- **The damping hand** is a uniform extra loss on every mode, with no knock of
  the hand arriving.

## Quality

The Quality setting (in the top bar, for phones and older computers) keeps
High as described here. Medium and Low ring at most 10 and 6 modes in each
partner (16 at High), dropping the highest, and past 24 voices ringing at
Medium and 12 at Low the oldest is damped. The pairs, the tubes and the
gong's curvature stay at every level.

## Prior art and references

**The original instruments.**
- W. Surjodiningrat, P. J. Sudarjana & A. Susanto (1993). *Tone Measurements
  of Outstanding Javanese Gamelans in Yogyakarta and Surakarta*, 2nd edn.
  Gadjah Mada University Press, Yogyakarta (first published 1972). The
  central-octave sarons of the gamelans of Central Java, measured.
- M. Hood (1966). "Slendro and pelog redefined." *Selected Reports in
  Ethnomusicology* 1(1), 28–48.
- M. Tenzer (2000). *Gamelan Gong Kebyar: The Art of Twentieth-Century
  Balinese Music.* University of Chicago Press.
- M. Braun (2002). "The gamelan pelog scale of Central Java as an example of
  a non-harmonic musical scale." NeuroScience of Music (website). Pélog as a
  subset of nine-tone equal temperament.
- W. A. Sethares & M. Vitale (2022). "Ombak and octave stretching in
  Balinese gamelan." *J. Mathematics and Music* 16(1), 1–17.
  [doi:10.1080/17459737.2020.1812128](https://doi.org/10.1080/17459737.2020.1812128).

**The physics.**
- R. Perrin, D. P. Elford, L. Chalmers, G. M. Swallowe, T. R. Moore,
  S. Hamdan & B. J. Halkon (2014). "Normal modes of a small gamelan gong."
  *J. Acoust. Soc. Am.* 136(4), 1942–1950.
  [doi:10.1121/1.4895683](https://doi.org/10.1121/1.4895683).
- B. Krueger, K. L. Gee & D. Grimshaw (2010). "Acoustical and vibrometry
  analysis of a large Balinese gamelan gong." *J. Acoust. Soc. Am.* 128(1),
  EL8–EL13. [doi:10.1121/1.3425742](https://doi.org/10.1121/1.3425742).
- M. Jones, K. L. Gee & D. Grimshaw (2010). "Vibrational characteristics of
  Balinese gamelan metallophones." *J. Acoust. Soc. Am.* 127(5), EL197–EL202.
  [doi:10.1121/1.3397234](https://doi.org/10.1121/1.3397234).
- T. C. Huang (1961). "The effect of rotatory inertia and of shear
  deformation on the frequency and normal mode equations of uniform beams
  with simple end conditions." *J. Appl. Mech.* 28(4), 579–584.
  [doi:10.1115/1.3641787](https://doi.org/10.1115/1.3641787). The free–free
  frequency equation used here.
- S. P. Timoshenko (1921). "On the correction for shear of the differential
  equation for transverse vibrations of prismatic bars." *Phil. Mag.*
  41(245), 744–746.
  [doi:10.1080/14786442108636264](https://doi.org/10.1080/14786442108636264).
- G. R. Cowper (1966). "The shear coefficient in Timoshenko's beam theory."
  *J. Appl. Mech.* 33(2), 335–340.
  [doi:10.1115/1.3625046](https://doi.org/10.1115/1.3625046).
- W. C. Young & R. G. Budynas (2002). *Roark's Formulas for Stress and
  Strain*, 7th edn. McGraw-Hill. The torsion constant of a rectangle.
- N. H. Fletcher & T. D. Rossing (1998). *The Physics of Musical
  Instruments*, 2nd edn. Springer, New York. Mallet percussion and gongs.
- T. D. Rossing (2000). *Science of Percussion Instruments*. World
  Scientific, Singapore. [doi:10.1142/4294](https://doi.org/10.1142/4294).

**Earlier models and syntheses.**
- "Modeling the Woodstock Gamelan for Synthesis" (1999). *J. Audio Eng. Soc.*
  47(10), 813–823. [AES E-Library](https://www.aes.org/e-lib/browse.cfm?elib=12088).
  Additive synthesis, in Csound, of the Woodstock "gamelan", a three-octave set of tubular chimes in just
  intonation, from their three to five partials.
- M. Jammer (2007). "Klangmodellierung von Gamelaninstrumenten basierend auf
  exponentiell ausschwingenden Sinuskomponenten." Project report, University
  of Music and Performing Arts Graz.
  [Phaidra](https://phaidra.kug.ac.at/o:11179). Gamelan instruments as sums of
  decaying sinusoids.
